"""PDF form targets in the original, rotation-aware display coordinate system.

Detection is independent of model output. A label is evidence, never the field
rectangle. All public boxes are normalized against the displayed page.
"""
from __future__ import annotations

import hashlib
import math
import re
from dataclasses import asdict, dataclass
from typing import Any

import fitz


@dataclass(frozen=True)
class PlacementTarget:
    id: str
    document_id: str
    page_number: int
    label: str
    section: str
    kind: str
    box: list[float]
    source: str
    section_box: list[float] | None = None
    choice_key: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def normalized_box(page: fitz.Page, rect: fitz.Rect) -> list[float]:
    r = rect * page.rotation_matrix
    r.normalize()
    return [round(r.x0 / page.rect.width, 8), round(r.y0 / page.rect.height, 8),
            round(r.x1 / page.rect.width, 8), round(r.y1 / page.rect.height, 8)]


def valid_box(box: Any) -> bool:
    return (isinstance(box, list) and len(box) == 4
            and all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in box)
            and 0 <= box[0] < box[2] <= 1 and 0 <= box[1] < box[3] <= 1)


def intersection_fraction(a: list[float], b: list[float]) -> float:
    area = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    smaller = min((a[2]-a[0])*(a[3]-a[1]), (b[2]-b[0])*(b[3]-b[1]))
    return area / smaller if smaller > 0 else 0


def field_box(field: dict[str, Any]) -> list[float]:
    x, y, w, h = (float(field[k]) for k in ('pos_x', 'pos_y', 'width', 'height'))
    return [x, y, x+w, y+h]


def target_id(document_hash: str, page_number: int, kind: str, box: list[float]) -> str:
    key = f'{document_hash}:{page_number}:{kind}:' + ','.join(f'{v:.5f}' for v in box)
    return 'target-' + hashlib.sha256(key.encode()).hexdigest()[:24]


def page_lines(page: fitz.Page) -> list[dict[str, Any]]:
    lines = []
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines', []):
            spans = [s for s in line['spans'] if s['text'].strip()]
            if spans:
                lines.append({'text': ''.join(s['text'] for s in spans).strip(),
                              'rect': fitz.Rect(line['bbox']), 'spans': spans})
    return sorted(lines, key=lambda l: (round(l['rect'].y0 / 3), l['rect'].x0))


def _painted_square(page: fitz.Page, rect: fitz.Rect, label_rect: fitz.Rect) -> fitz.Rect | None:
    """Find the square's painted outline, not the font's oversized glyph box."""
    # Render unrotated so the raster and text share one coordinate system.
    rotation = page.rotation
    try:
        page.set_rotation(0)
        pix = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=rect, colorspace=fitz.csGRAY, alpha=False)
    finally:
        page.set_rotation(rotation)
    pixels = pix.samples
    dark = {(x, y) for y in range(pix.height) for x in range(pix.width)
            if pixels[y * pix.stride + x] < 150}
    squares = []
    while dark:
        start = dark.pop(); stack = [start]; component = [start]
        while stack:
            x, y = stack.pop()
            for point in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
                if point in dark:
                    dark.remove(point); stack.append(point); component.append(point)
        xs, ys = zip(*component)
        r = fitz.Rect((min(xs)+pix.x)/3, (min(ys)+pix.y)/3,
                      (max(xs)+1+pix.x)/3, (max(ys)+1+pix.y)/3)
        if 4 <= r.width <= 24 and 4 <= r.height <= 24 and .75 <= r.width/r.height <= 1.33:
            squares.append(r)
    return min(squares, key=lambda r: abs((r.y0+r.y1)-(label_rect.y0+label_rect.y1))) if squares else None


def detect_targets(page: fitz.Page, document_id: str, document_hash: str, page_number: int) -> list[PlacementTarget]:
    lines = page_lines(page)
    bounds = page.rect * page.derotation_matrix
    bounds.normalize()
    drawings = page.get_drawings()
    horizontal: list[fitz.Rect] = []
    vertical: list[fitz.Rect] = []
    squares: list[fitz.Rect] = []
    for drawing in drawings:
        for item in drawing['items']:
            if item[0] == 're':
                r = fitz.Rect(item[1])
                if 5 <= r.width <= 24 and 5 <= r.height <= 24 and .75 <= r.width/r.height <= 1.33:
                    squares.append(r)
                if r.width > 30 and r.height <= 2: horizontal.append(r)
                if r.height > 25 and r.width <= 2: vertical.append(r)
                if r.width > 80 and r.height > 25:
                    horizontal.extend([fitz.Rect(r.x0, r.y0, r.x1, r.y0), fitz.Rect(r.x0, r.y1, r.x1, r.y1)])
                    vertical.extend([fitz.Rect(r.x0, r.y0, r.x0, r.y1), fitz.Rect(r.x1, r.y0, r.x1, r.y1)])
            elif item[0] == 'l':
                a, b = item[1:3]
                r = fitz.Rect(min(a.x,b.x), min(a.y,b.y), max(a.x,b.x), max(a.y,b.y))
                if r.width > 30 and r.height <= 2: horizontal.append(r)
                if r.height > 25 and r.width <= 2: vertical.append(r)
    targets: list[PlacementTarget] = []

    def add(rect: fitz.Rect, label: str, section: str, kind: str, source: str, section_rect: fitz.Rect | None = None) -> None:
        box = normalized_box(page, rect)
        if not valid_box(box) or rect.width < 4 or rect.height < 4: return
        if any(intersection_fraction(box, t.box) > .7 for t in targets): return
        targets.append(PlacementTarget(target_id(f"{document_id}:{document_hash}", page_number, kind, box), document_id,
            page_number, label[:255], section[:500], kind, box, source,
            normalized_box(page, section_rect) if section_rect else None))

    for widget in page.widgets() or []:
        kind = 'checkbox' if widget.field_type == fitz.PDF_WIDGET_TYPE_CHECKBOX else 'signature' if widget.field_type == fitz.PDF_WIDGET_TYPE_SIGNATURE else 'text'
        add(widget.rect, widget.field_label or widget.field_name or 'Form field', '', kind, 'widget')

    section = ''
    heading = re.compile(r'\b(name|person obtaining|participant|witness|client|partner|buyer|seller|employee|employer|signer|vendor)\b', re.I)
    headings = [l for l in lines if len(l['text']) < 75 and heading.search(l['text'])
                and not re.search(r'\b(signature|date)\b', l['text'], re.I)]
    for index, line in enumerate(lines):
        label = line['text']; r = line['rect']
        previous = lines[index-1]['text'] if index else ''
        if len(label) < 100 and heading.search(label) and not re.search(r'\b(signature|date)\b', label, re.I):
            section = label
        # Glyph squares and vector squares are associated with a nearby option,
        # never with the first global text search hit for "No".
        glyphs = [s for s in line['spans'] if any(c in s['text'] for c in ('□', '☐'))]
        option = re.sub(r'[□☐]', '', label).strip()
        if glyphs:
            label_spans = [s for s in line['spans'] if s not in glyphs]
            lr = fitz.Rect(label_spans[0]['bbox']) if label_spans else r
            for glyph in glyphs:
                square = _painted_square(page, fitz.Rect(glyph['bbox']), lr)
                if square: add(square, option, previous or section, 'checkbox', 'glyph')
            continue
        near_squares = [s for s in squares if abs((s.y0+s.y1)-(r.y0+r.y1)) < 20 and 0 <= r.x0-s.x1 < 25]
        for square in near_squares:
            add(square, label, section or previous, 'checkbox', 'vector')
        if near_squares: continue

        # Find a writing line starting just after the label, on its baseline.
        blank_lines = [h for h in horizontal if -4 <= h.x0-r.x1 <= 18 and r.y0 < h.y0 <= r.y1+4]
        signature = bool(re.search(r'\b(signature|signed by|sign here|initials)\s*:?$', label, re.I))
        date = bool(re.fullmatch(r'(date|dated|date signed)\s*:', label, re.I))
        if not blank_lines and not signature and not date: continue
        preceding = [l for l in headings if l['rect'].y0 <= r.y0+2 and l['rect'].x0 <= r.x0+3]
        if preceding:
            nearest = min(preceding, key=lambda l: (abs(r.y0-l['rect'].y0)*bounds.width + abs(r.x0-l['rect'].x0)))
            section = nearest['text']
        bottom_candidates = [h.y0 for h in horizontal if h.x0 <= r.x0+2 and h.x1 >= r.x1 and h.y0 > r.y0+5]
        bottom = min(bottom_candidates, default=bounds.y1-12)
        top_candidates = [h.y1 for h in horizontal if h.x0 <= r.x0+2 and h.x1 >= r.x1 and h.y1 < r.y0]
        top = max(top_candidates, default=0)
        right_candidates = [v.x0 for v in vertical if v.x0 > r.x1 and v.y0 <= r.y0 and v.y1 >= r.y1-2]
        right = min(right_candidates, default=bounds.x1-24)
        section_right = right
        left_candidates = [v.x1 for v in vertical if v.x1 < r.x0 and v.y0 <= r.y0 and v.y1 >= r.y1-2]
        section_left = max(left_candidates, default=bounds.x0)
        next_labels = [l['rect'].x0 for l in lines if l['rect'].x0 > r.x1+2 and abs(l['rect'].y0-r.y0) < 5]
        right = min([right]+next_labels)-3
        if blank_lines:
            writing = min(blank_lines, key=lambda h: abs(h.x0-r.x1))
            box = fitz.Rect(max(r.x1+2, writing.x0+1), max(top+2, writing.y0-17), min(right,writing.x1), writing.y0)
        else:
            box = fitz.Rect(r.x1+3, max(top+2,r.y0-2), right, min(bottom-1,r.y1-1))
        kind = 'signature' if signature else 'date_signed' if date else 'full_name' if re.search(r'\bname\b', label, re.I) else 'text'
        add(box, label, section, kind, 'line' if blank_lines else 'label', fitz.Rect(section_left,top,section_right,bottom))

    return pair_choice_targets(targets)


def pair_choice_targets(targets: list[PlacementTarget]) -> list[PlacementTarget]:
    targets = list(targets)
    # Pair adjacent Yes/No targets within the same question. The backend owns
    # the group identity and cardinality, even if the model omits grouping.
    for i, target in enumerate(targets):
        if target.kind != 'checkbox' or target.label.lower() != 'yes': continue
        nearby = [(j,t) for j,t in enumerate(targets) if t.kind == 'checkbox' and t.label.lower() == 'no'
                  and abs(t.box[0]-target.box[0]) < .15 and abs(t.box[1]-target.box[1]) < .08]
        if len(nearby) == 1:
            j, no = nearby[0]
            key = 'choice-' + hashlib.sha256((target.id+no.id).encode()).hexdigest()[:20]
            question = target.section
            targets[i] = PlacementTarget(**{**target.to_dict(), 'choice_key': key})
            targets[j] = PlacementTarget(**{**no.to_dict(), 'section': question, 'choice_key': key})
    return sorted(targets, key=lambda t: (t.page_number,t.box[1],t.box[0]))


def text_collisions(page: fitz.Page, target: PlacementTarget) -> bool:
    """Ignore intended checkbox glyph ink; reject overlays on printed words."""
    for word in page.get_text('words'):
        if str(word[4]).strip() in {'□', '☐', '_'} or set(str(word[4])) == {'_'}: continue
        box = normalized_box(page, fitz.Rect(word[:4]))
        if intersection_fraction(target.box, box) > .2: return True
    return False
