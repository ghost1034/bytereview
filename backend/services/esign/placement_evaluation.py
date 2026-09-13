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
