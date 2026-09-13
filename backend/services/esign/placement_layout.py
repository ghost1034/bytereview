"""Local layout evidence in the original PDF's displayed coordinate system."""
from __future__ import annotations

import csv
import hashlib
import io
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import fitz
from PIL import Image

from services.esign.placement_targets import detect_targets, intersection_fraction, normalized_box, page_lines, target_id, valid_box

MAX_TARGETS = 500
MAX_PAGES = 500


@dataclass
class LayoutPage:
    document_id: str
    page_number: int
    width: float
    height: float
    image: bytes
    words: list[dict[str, Any]]
    targets: list[dict[str, Any]]
    ocr_used: bool = False

    @property
    def key(self) -> str:
        return f'{self.document_id}:{self.page_number}'

    def manifest(self) -> dict[str, Any]:
        return {'document_id': self.document_id, 'page_number': self.page_number,
                'width': self.width, 'height': self.height,
                'image_sha256': hashlib.sha256(self.image).hexdigest(), 'ocr_used': self.ocr_used}


def unrotated_rect(page: fitz.Page, box: list[float]) -> fitz.Rect:
    return fitz.Rect(box[0]*page.rect.width, box[1]*page.rect.height,
                     box[2]*page.rect.width, box[3]*page.rect.height)*page.derotation_matrix


def same_writing_row(page: fitz.Page, left: list[float], right: list[float]) -> bool:
    a, b = unrotated_rect(page, left), unrotated_rect(page, right)
    return abs(a.y0-b.y0) < 30 and a.x0 < b.x1 and b.x0 < a.x1


def _ocr_words(image: bytes, rotation: int = 0) -> list[dict[str, Any]]:
    """OCR the exact displayed raster; no deskew/re-pagination transforms."""
    with tempfile.TemporaryDirectory(prefix='esign-layout-') as directory:
        path = Path(directory) / 'page.png'
        with Image.open(io.BytesIO(image)) as display:
            upright = display.rotate(rotation, expand=True)
            upright.save(path)
            width, height = upright.size
        result = subprocess.run(['tesseract', str(path), 'stdout', 'tsv'],
                                capture_output=True, timeout=120, check=True)
    words = []
    for row in csv.DictReader(io.StringIO(result.stdout.decode()), delimiter='\t'):
        if not row.get('text', '').strip() or float(row.get('conf', '-1')) < 0:
            continue
        x, y, w, h = (int(row[k]) for k in ('left', 'top', 'width', 'height'))
        box = [x/width, y/height, (x+w)/width, (y+h)/height]
        a,b,c,d = box
        if rotation == 90: box = [1-d,a,1-b,c]
        elif rotation == 180: box = [1-c,1-d,1-a,1-b]
        elif rotation == 270: box = [b,1-c,d,1-a]
        words.append({'text': row['text'], 'box': box})
    return words


def _raster_controls(image: bytes, page_width: float, page_height: float) -> list[tuple[list[float], str]]:
    """Find connected hollow outlines, including square and circular controls.

    This intentionally over-detects: the model must classify decorative shapes
    as ignored. Text-like solid components are not treated as blank controls.
    """
    with Image.open(io.BytesIO(image)) as source:
        raster = source.convert('L')
        raster.thumbnail((1500, 1500))
        width, height = raster.size
        pixels = raster.tobytes()
    dark = bytearray(1 if p < 150 else 0 for p in pixels)
    boxes = []
    for start in range(len(dark)):
        if not dark[start]:
            continue
        dark[start] = 0
        stack = [start]
        x0 = x1 = start % width
        y0 = y1 = start // width
        count = 0
        while stack:
            index = stack.pop()
            x, y = index % width, index // width
            x0, x1 = min(x0, x), max(x1, x)
            y0, y1 = min(y0, y), max(y1, y)
            count += 1
            for neighbor in (index-1 if x else -1, index+1 if x+1 < width else -1,
                             index-width if y else -1, index+width if y+1 < height else -1):
                if neighbor >= 0 and dark[neighbor]:
                    dark[neighbor] = 0
                    stack.append(neighbor)
        w, h = x1-x0+1, y1-y0+1
        pw, ph = w*page_width/width, h*page_height/height
        small = 4 <= pw <= 30 and 4 <= ph <= 30 and .65 <= pw/ph <= 1.55
        writing = min(pw, ph) >= 10 and max(pw, ph) >= 30 and pw < page_width*.9 and ph < page_height*.9
        if not (small or writing):
            continue
        center = [pixels[y*width+x] for y in range(y0+h//3, y0+2*h//3)
                  for x in range(x0+w//3, x0+2*w//3)]
        if count >= (w+h) and center and sum(p < 150 for p in center)/len(center) < .12:
            corner = [pixels[y*width+x] for y in range(y0, y0+max(1,h//5)) for x in range(x0,x0+max(1,w//5))]
            shape = ('checkbox' if sum(p < 150 for p in corner)/len(corner) > .25 else 'radio') if small else 'writing_area'
            boxes.append(([x0/width, y0/height, (x1+1)/width, (y1+1)/height], shape))
    return boxes


def prepare_layout(pdfs: dict[str, bytes], snapshot: dict[str, Any]) -> list[LayoutPage]:
    selected = set(snapshot.get('selected_document_ids', [str(d['id']) for d in snapshot['documents']]))
    if set(pdfs) != selected or not selected:
        raise ValueError('Analysis requires exactly the selected document bytes')
    deadline = time.monotonic() + 1200
    pages = []
    raster_bytes = 0
    for document in snapshot['documents']:
        doc_id = str(document['id'])
        if doc_id not in selected:
            continue
        data = pdfs[doc_id]
        if hashlib.sha256(data).hexdigest() != document['sha256']:
            raise ValueError('Document content changed since the analysis snapshot')
        with fitz.open(stream=data, filetype='pdf') as pdf:
            if len(pdf) != int(document['page_count']):
                raise ValueError('Document page count changed')
            if len(pages) + len(pdf) > MAX_PAGES:
                raise ValueError('Select fewer documents: single-request analysis supports at most 500 pages.')
            for page_number, page in enumerate(pdf):
                if time.monotonic() > deadline:
                    raise ValueError('Local document preparation timed out. Select fewer documents.')
                if page.rect.width*page.rect.height*4 > 16_000_000:
                    raise ValueError('A page exceeds the local rendering budget. Use smaller page dimensions.')
                image = page.get_pixmap(dpi=144, alpha=False).tobytes('png')
                raster_bytes += len(image)*4//3
                if len(image) > 7_000_000 or raster_bytes > 19_000_000:
                    raise ValueError('Documents exceed the single-request image budget. Select fewer documents.')
                words = [{'text': str(w[4]), 'box': normalized_box(page, fitz.Rect(w[:4]))}
                         for w in page.get_text('words')]
                large_image = any(fitz.Rect(info['bbox']).get_area() > page.rect.get_area()*.25 for info in page.get_image_info())
                ocr_used = sum(len(w['text']) for w in words) < 25 or large_image
                if ocr_used:
                    words = _ocr_words(image, page.rotation)
                raster_controls = _raster_controls(image, page.rect.width, page.rect.height) if ocr_used else []
                # OCR often transcribes an empty outline as a standalone O/0.
                # Remove that token only when a hollow physical control agrees.
                words = [w for w in words if not (w['text'] in {'O', 'o', '0', '()'} and any(
                    shape in {'radio', 'checkbox'} and intersection_fraction(box, w['box']) > .7
                    for box, shape in raster_controls))]
                lines = page_lines(page)
                if ocr_used:
                    # Reconstruct text lines in unrotated coordinates for local
                    # label association, then retain display-space word evidence.
                    grouped: dict[int, list[tuple[str, fitz.Rect]]] = {}
                    for word in words:
                        b = word['box']
                        r = fitz.Rect(b[0]*page.rect.width,b[1]*page.rect.height,b[2]*page.rect.width,b[3]*page.rect.height)*page.derotation_matrix
                        grouped.setdefault(round(r.y0/5), []).append((word['text'], r))
                    lines = []
                    for group in grouped.values():
                        group.sort(key=lambda pair: pair[1].x0)
                        segments: list[list[tuple[str, fitz.Rect]]] = [[]]
                        for word in group:
                            if segments[-1] and word[1].x0-segments[-1][-1][1].x1 > 35:
                                segments.append([])
                            segments[-1].append(word)
                        for segment in segments:
                            rect = fitz.Rect(segment[0][1])
                            for _, r in segment[1:]: rect |= r
                            lines.append({'text': ' '.join(t for t, _ in segment), 'rect': rect})
                targets: list[dict[str, Any]] = []

                def add(box: list[float], shape: str, source: str, label: str = '',
                        section: str = '', region: list[float] | None = None,
                        metadata: dict[str, Any] | None = None) -> None:
                    if not valid_box(box):
                        return
                    overlaps = [t for t in targets if intersection_fraction(box, t['box']) > .7]
                    if overlaps:
                        if label:
                            overlaps[0].update(label=label, section=section, region=region)
                        return
                    if source in {'raster', 'outline', 'line'} and any(intersection_fraction(box, w['box']) > .2 for w in words if set(w['text']) - set('_□☐○◯◻')):
                        return
                    if not label:
                        r = fitz.Rect(box[0]*page.rect.width,box[1]*page.rect.height,box[2]*page.rect.width,box[3]*page.rect.height)*page.derotation_matrix
                        if shape in {'checkbox', 'radio'}:
                            candidates = [l for l in lines if abs((l['rect'].y0+l['rect'].y1)/2-(r.y0+r.y1)/2) < 12 and 0 <= l['rect'].x0-r.x1 < 30]
                        else:
                            candidates = [l for l in lines if -6 <= r.y0-l['rect'].y1 <= 25 and l['rect'].x0 <= r.x0+2]
                            candidates += [l for l in lines if abs(l['rect'].y0-r.y0) < 10 and 0 <= r.x0-l['rect'].x1 < 25]
                        if candidates:
                            label = min(candidates, key=lambda l: abs(r.y0-l['rect'].y1)+abs(r.x0-l['rect'].x1)*.02)['text'][:255]
                    nearby = sorted(words, key=lambda w: abs(w['box'][1]-box[1])*3 + abs(w['box'][2]-box[0]))[:8]
                    targets.append({'id': target_id(f"{doc_id}:{document['sha256']}", page_number, shape, box),
                                    'document_id': doc_id, 'page_number': page_number,
                                    'box': box, 'shape': shape, 'source': source, 'label': label,
                                    'section': section, 'region': region, 'nearby': nearby,
                                    'widget': metadata})

                for widget in page.widgets() or []:
                    kind = widget.field_type
                    shape = ('checkbox' if kind == fitz.PDF_WIDGET_TYPE_CHECKBOX else
                             'radio' if kind == fitz.PDF_WIDGET_TYPE_RADIOBUTTON else
                             'signature' if kind == fitz.PDF_WIDGET_TYPE_SIGNATURE else
                             'dropdown' if kind in {fitz.PDF_WIDGET_TYPE_COMBOBOX, fitz.PDF_WIDGET_TYPE_LISTBOX} else 'writing_area')
                    add(normalized_box(page, widget.rect), shape, 'widget', widget.field_label or widget.field_name or '',
                        metadata={'type': widget.field_type_string, 'options': widget.choice_values,
                                  'value': widget.field_value, 'name': widget.field_name,
                                  'flags': widget.field_flags})
                for drawing in page.get_drawings():
                    rect = drawing['rect']
                    if rect.width >= 25 and rect.height <= 2:
                        # Writing baseline: blank area immediately above it.
                        rect = fitz.Rect(rect.x0+1, max(0, rect.y0-17), rect.x1-1, rect.y0)
                        add(normalized_box(page, rect), 'writing_area', 'line')
                    elif rect.width >= 5 and rect.height >= 5:
                        box = normalized_box(page, rect)
                        small = rect.width <= 30 and rect.height <= 30
                        shape = ('radio' if any(item[0] == 'c' for item in drawing['items']) else 'checkbox') if small else 'writing_area'
                        add(box, shape, 'outline')
                if ocr_used:
                    for box, shape in raster_controls:
                        add(box, shape, 'raster')
                # Reuse proven writing-area geometry, but discard semantic types
                # and the old Yes/No-specific choice/ownership heuristics.
                for target in detect_targets(page, doc_id, document['sha256'], page_number):
                    if target.source == 'widget':
                        continue
                    if target.source == 'label' and any(intersection_fraction(target.box, t['box']) > .1 or (t['source'] == 'outline' and target.label == t['label'] and same_writing_row(page, target.box, t['box'])) for t in targets):
                        continue
                    add(target.box, 'checkbox' if target.kind == 'checkbox' else 'writing_area', target.source,
                        target.label, target.section, target.section_box)
                pages.append(LayoutPage(doc_id, page_number, page.rect.width, page.rect.height,
                                        image, words, sorted(targets, key=lambda t: (t['box'][1], t['box'][0])), ocr_used))
    if sum(len(p.targets) for p in pages) > MAX_TARGETS:
        raise ValueError('Select fewer documents: the layout contains more than 500 candidate inputs.')
    return pages
