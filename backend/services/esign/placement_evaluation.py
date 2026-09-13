"""Reviewed acceptance regions for the public consent example, in PDF points.

These are independent of detector output. They intentionally exclude labels,
adjacent signing rows, and the right table border.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

CONSENT_SHA256 = '98401950ec4f480e09561e9eb466dfa743dc5c1b3fa66a990b886c4bff12e96f'
CONSENT_REGIONS = {
    'Yes': [72, 397, 85, 410],
    'No': [72, 420, 85, 433],
    'Name of Participant (print):': [222, 456, 455, 477],
    'Signature:': [225, 482, 463, 503],
    'Date:': [490, 482, 539, 503],
}


def consent_inputs(path: Path, *, existing: bool = False) -> tuple[dict[str, bytes], dict[str, Any]]:
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != CONSENT_SHA256:
        raise ValueError('This acceptance fixture requires the reviewed consent PDF')
    fields = []
    if existing:
        for i, (label, kind) in enumerate([('Name of Participant (print):','full_name'),('Signature:','signature'),('Date:','date_signed')]):
            x0,y0,x1,y1=CONSENT_REGIONS[label]
            fields.append({'id':f'existing-{i}','document_id':'consent','participant_id':'signer',
                'field_type':kind,'page_number':2,'pos_x':x0/612,'pos_y':y0/792,
                'width':(x1-x0)/612,'height':(y1-y0)/792,'properties':{'schema_version':2}})
    return {'consent':data}, {'documents':[{'id':'consent','name':path.name,'sha256':CONSENT_SHA256,'page_count':3}],
        'participants':[{'id':'signer','label':'Example Signer','role':'signer'}], 'existing_fields':fields}


def check_consent_result(proposals: list[dict[str, Any]], *, existing: bool = False) -> list[str]:
    expected={'Yes','No'} if existing else set(CONSENT_REGIONS)
    errors=[]
    if len(proposals)!=len(expected) or {p['label'] for p in proposals}!=expected:
        errors.append(f'Expected {sorted(expected)}; got {[p["label"] for p in proposals]}')
    for p in proposals:
        if p['document_id']!='consent' or p['page_number']!=2 or p['participant_id']!='signer':
            errors.append('Wrong document, page, or participant')
        if p['label'] not in CONSENT_REGIONS: continue
        box=CONSENT_REGIONS[p['label']]
        actual=[p['pos_x']*612,p['pos_y']*792,(p['pos_x']+p['width'])*612,(p['pos_y']+p['height'])*792]
        if not (box[0] <= actual[0] <= actual[2] <= box[2] and box[1] <= actual[1] <= actual[3] <= box[3]):
            errors.append(f'{p["label"]} outside reviewed target: {actual}')
    choices=[p for p in proposals if p['field_type']=='checkbox']
    groups=[p['properties'].get('selection_group') for p in choices]
    if len(groups)!=2 or any(not g or g.get('minimum_selected')!=1 or g.get('maximum_selected')!=1 for g in groups) or (groups and groups[0]!=groups[-1]):
        errors.append('Yes/No must form one exactly-one selection group')
    return errors


def general_inputs(*, scanned: bool = False, rotation: int = 0) -> tuple[dict[str, bytes], dict[str, Any], list[dict[str, Any]]]:
    """Authored form with independent expected regions, not detector output.

    The labels deliberately specify advanced configuration; ordinary types
    still have to be inferred from the form. No values are filled in.
    """
    import io
    import fitz
    from reportlab.pdfgen import canvas
    rows = [
        ('signature', 'Signature'), ('initials', 'Initials'), ('date_signed', 'Date signed'),
        ('full_name', 'Full name'), ('first_name', 'First name'), ('last_name', 'Last name'),
        ('email', 'Email address'), ('company', 'Company'), ('title', 'Job title'),
        ('text', 'Comments (multiple lines)'), ('number', 'Quantity'), ('number', 'Unit price'),
        ('date', 'Date of birth'), ('stamp', 'Signer stamp'), ('attachment', 'Attachment (PDF or image)'),
        ('auto_fill', 'Auto-fill: date sent'), ('dropdown', 'Department (dropdown): Sales / Operations'),
        ('formula', 'Calculated amount: Quantity * Unit price'), ('note', 'Blank note area'),
    ]
    out = io.BytesIO()
    pdf = canvas.Canvas(out, pagesize=(612, 792), invariant=1)
    expected = []
    for index, (kind, label) in enumerate(rows):
        page, row = divmod(index, 5)
        if row == 0:
            if index:
                pdf.showPage()
            pdf.setFont('Helvetica', 12)
            pdf.drawString(40, 750, 'Client details - completed by Client')
        top = 110+row*115
        # Deliberate multiline writing areas test actual bounds, not defaults.
        height = 48 if kind in {'text', 'note', 'attachment', 'stamp'} else 24
        pdf.setFont('Helvetica', 10)
        pdf.drawString(40, 792-top+4, label)
        pdf.rect(300, 792-top-height, 250, height)
        expected.append({'document_id': 'general', 'page_number': page, 'field_type': kind,
                         'participant_id': 'client', 'label': label, 'box': [300/612, top/792, 550/612, (top+height)/792]})
    pdf.showPage()
    pdf.setFont('Helvetica', 12)
    pdf.drawString(40, 750, 'Client choices - completed by Client')
    pdf.setFont('Helvetica', 10)
    pdf.drawString(40, 702, 'Preferred contact (choose exactly one):')
    for label, x in [('Email', 70), ('Phone', 260), ('Post', 440)]:
        pdf.circle(x+6, 662, 6)
        pdf.drawString(x+18, 658, label)
        expected.append({'document_id': 'general', 'page_number': 4, 'field_type': 'radio', 'participant_id': 'client',
                         'label': label, 'group': 'contact', 'box': [x/612, 124/792, (x+12)/612, 136/792]})
    pdf.drawString(40, 552, 'Services (select any; optional):')
    for label, x in [('Payroll', 70), ('Bookkeeping', 260), ('Tax', 440)]:
        pdf.rect(x, 506, 12, 12)
        pdf.drawString(x+18, 507, label)
        expected.append({'document_id': 'general', 'page_number': 4, 'field_type': 'checkbox', 'participant_id': 'client',
                         'label': label, 'group': 'services', 'box': [x/612, 274/792, (x+12)/612, 286/792]})
    pdf.rect(70, 376, 12, 12)
    pdf.drawString(90, 378, 'Send a copy to me (independent; optional)')
    expected.append({'document_id': 'general', 'page_number': 4, 'field_type': 'checkbox', 'participant_id': 'client',
                     'label': 'Send a copy to me', 'box': [70/612, 404/792, 82/612, 416/792]})
    pdf.save()
    data = out.getvalue()
    if scanned or rotation:
        with fitz.open(stream=data, filetype='pdf') as source, fitz.open() as output:
            for page in source:
                if scanned:
                    p = output.new_page(width=612, height=792)
                    p.insert_image(p.rect, stream=page.get_pixmap(dpi=144).tobytes('png'))
                else:
                    output.insert_pdf(source, from_page=page.number, to_page=page.number)
                    p = output[-1]
                p.set_rotation(rotation)
            data = output.tobytes(no_new_id=True)
            for region in expected:
                page = output[region['page_number']]
                b = region['box']
                r = fitz.Rect(b[0]*612, b[1]*792, b[2]*612, b[3]*792)*page.rotation_matrix
                region['box'] = [r.x0/page.rect.width, r.y0/page.rect.height, r.x1/page.rect.width, r.y1/page.rect.height]
    snapshot = {'documents': [{'id': 'general', 'name': 'General form', 'sha256': hashlib.sha256(data).hexdigest(), 'page_count': 5}],
                'participants': [{'id': 'client', 'label': 'Client', 'role': 'signer'}], 'existing_fields': []}
    return {'general': data}, snapshot, expected


def check_general_result(proposals: list[dict[str, Any]], expected: list[dict[str, Any]]) -> dict[str, Any]:
    from services.esign.placement_targets import field_box, intersection_fraction
    matches = []
    errors = []
    for target in expected:
        candidates = [p for p in proposals if p['document_id'] == target['document_id'] and p['page_number'] == target['page_number']
                      and intersection_fraction(target['box'], field_box(p)) > .8]
        if len(candidates) != 1:
            errors.append(f"{target['label']}: expected one placement; got {len(candidates)}")
            continue
        p = candidates[0]
        b, actual = target['box'], field_box(p)
        # Two-point tolerance for raster outline pixels; minimum dimensions
        # ensure a tiny box cannot satisfy region containment accidentally.
        tolerance = .003
        if not (b[0]-tolerance <= actual[0] < actual[2] <= b[2]+tolerance and b[1]-tolerance <= actual[1] < actual[3] <= b[3]+tolerance):
            errors.append(f"{target['label']}: outside independently authored region")
        if p['field_type'] != target['field_type'] or p['participant_id'] != target['participant_id']:
            errors.append(f"{target['label']}: wrong type or participant ({p['field_type']})")
        matches.append((target, p))
    if len(proposals) != len(expected):
        errors.append(f'Expected {len(expected)} fields, got {len(proposals)}')
    expected_groups = {e.get('group') for e in expected if e.get('group')}
    for name in sorted(expected_groups):
        minimum, maximum = (1, 1) if name.startswith('contact') else (0, None)
        members = [p for t, p in matches if t.get('group') == name]
        groups = [(p['properties'].get('group') if name.startswith('contact') else p['properties'].get('selection_group')) for p in members]
        if len(groups) != 3 or any(not g for g in groups) or len({g['id'] for g in groups if g}) != 1:
            errors.append(f'{name}: invalid group membership')
        elif groups:
            actual_group_id = groups[0]['id']
            total_members = [p for p in proposals if ((p['properties'].get('group') or p['properties'].get('selection_group') or {}).get('id') == actual_group_id)]
            if len(total_members) != len(members):
                errors.append(f'{name}: group includes options from a different question/document')
        if name.startswith('services') and any(g and (g.get('minimum_selected') != minimum or g.get('maximum_selected') != maximum) for g in groups):
            errors.append('Services group has incorrect cardinality')
        if name.startswith('contact') and any(not p['required'] for p in members):
            errors.append('Contact choice must be required')
    for target, p in matches:
        props = p['properties']
        if target['label'] == 'Send a copy to me' and (props.get('selection_group') or p['required']):
            errors.append('Independent checkbox was grouped or required')
        if target['field_type'] == 'dropdown' and {o['label'] for o in props.get('options') or []} != {'Sales', 'Operations'}:
            errors.append('Dropdown options are incorrect')
        if target['field_type'] == 'formula':
            from services.esign.field_logic import evaluate_formula
            numeric = [source for region, source in matches if region['document_id'] == target['document_id'] and region['label'] in {'Quantity', 'Unit price'}]
            values = {source['id']: value for source, value in zip(numeric, (2, 3))}
            values.update({source['properties']['data_label']: values[source['id']] for source in numeric if source['properties'].get('data_label')})
            try:
                if evaluate_formula(props['formula']['expression'], values) != '6.00':
                    errors.append('Formula calculates the wrong amount')
            except ValueError:
                errors.append('Formula references are incorrect')
        if target['field_type'] == 'auto_fill' and props.get('auto_source') != 'date_sent':
            errors.append('Wrong auto-fill source')
        if target['field_type'] == 'text' and not props.get('multiline'):
            errors.append('Comments must be multiline')
    return {'errors': errors, 'recall': len(matches)/len(expected),
            'false_placements': len(proposals)-len({p['id'] for _, p in matches})}


def party_inputs():
    """Two independent signing columns plus an explicitly requested unlabeled input."""
    import io
    from reportlab.pdfgen import canvas
    out = io.BytesIO()
    pdf = canvas.Canvas(out, pagesize=(612, 792), invariant=1)
    expected = []
    for x, owner in [(40, 'Client'), (330, 'Advisor')]:
        pdf.setFont('Helvetica-Bold', 12)
        pdf.drawString(x, 740, owner)
        for top, label, kind in [(100, 'Name', 'full_name'), (200, 'Signature', 'signature'), (300, 'Date signed', 'date_signed')]:
            pdf.setFont('Helvetica', 10)
            pdf.drawString(x, 792-top+8, label)
            pdf.rect(x, 792-top-25, 240, 25)
            expected.append({'document_id': 'parties', 'page_number': 0, 'participant_id': owner.lower(),
                             'field_type': kind, 'label': owner+' '+label,
                             'box': [x/612, top/792, (x+240)/612, (top+25)/792]})
    pdf.rect(40, 250, 530, 60)
    expected.append({'document_id': 'parties', 'page_number': 0, 'participant_id': 'client', 'field_type': 'text',
                     'label': 'Unlabeled comments', 'box': [40/612, 482/792, 570/612, 542/792]})
    pdf.save()
    data = out.getvalue()
    return {'parties': data}, {'documents': [{'id': 'parties', 'name': 'Two parties', 'sha256': hashlib.sha256(data).hexdigest(), 'page_count': 1}],
        'participants': [{'id': name.lower(), 'label': name, 'role': 'signer'} for name in ('Client', 'Advisor')], 'existing_fields': []}, expected
