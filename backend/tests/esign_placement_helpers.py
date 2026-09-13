"""Scripted provider responses for independently specified fixture regions."""
import json

from services.esign.placement_targets import intersection_fraction


def consent_model(phase, prompt, schema, images, settings=None):
    context = json.loads(prompt.split('\nContext: ')[1])
    targets = context['catalog']
    participant = context['participants'][0]['id']
    rows = []
    choices = []
    for target in targets:
        label = target['label']
        eligible = bool(label) and 'Witness' not in target['section'] and 'Obtaining' not in target['section']
        kind = 'checkbox' if label in {'Yes', 'No'} else 'signature' if label == 'Signature:' else 'date_signed' if label == 'Date:' else 'full_name'
        if label in {'Yes', 'No'}:
            choices.append(target['id'])
        rows.append({'id': target['id'], 'document_id': target['document_id'], 'page_number': target['page_number'],
                     'field_type': kind, 'participant_id': participant if eligible else None, 'label': label,
                     'required': True, 'box': None, 'properties_json': '{}', 'evidence': label,
                     'disposition': 'proposed' if eligible else 'unassigned' if label else 'ignored',
                     'reason': '' if eligible else 'Missing role' if label else 'Decorative line'})
    return {'fields': rows, 'pages': [{**{k: p[k] for k in ('document_id', 'page_number')}, 'complete': True} for p in context['pages']],
            'groups': [{'id': 'consent', 'members': choices, 'kind': 'checkbox', 'label': 'Consent', 'minimum': 1, 'maximum': 1, 'evidence': 'Yes'}]}, {}


def authored_model(expected):
    def generate(phase, prompt, schema, images):
        context = json.loads(prompt.split('\nContext: ')[1])
        targets = context['catalog']
        mapping = {}
        assigned = set()
        for i, e in enumerate(expected):
            matches = [t for t in targets if t['id'] not in assigned and t['document_id'] == e['document_id'] and t['page_number'] == e['page_number'] and intersection_fraction(t['box'], e['box']) > .8]
            matches.sort(key=lambda t: sum(abs(a-b) for a,b in zip(t['box'], e['box'])))
            key = matches[0]['id'] if matches else f'visual-{i}'
            mapping[i] = key
            assigned.add(key)
        rows = [{'id': t['id'], 'document_id': t['document_id'], 'page_number': t['page_number'], 'field_type': 'text',
                 'participant_id': None, 'label': t['label'], 'required': False, 'box': None,
                 'properties_json': '{}', 'evidence': '', 'disposition': 'ignored', 'reason': 'Decorative line'}
                for t in targets if t['id'] not in assigned]
        groups = {}
        for i, e in enumerate(expected):
            props = {}
            kind = e['field_type']
            if kind == 'radio': props['option_value'] = e['label']
            if kind == 'dropdown': props['options'] = [{'label': v, 'value': v} for v in ('Sales', 'Operations')]
            if kind == 'auto_fill': props['auto_source'] = 'date_sent'
            if kind == 'text': props['multiline'] = True
            if kind == 'formula':
                refs = [mapping[j] for j, source in enumerate(expected) if source['document_id'] == e['document_id'] and source['label'] in {'Quantity', 'Unit price'}]
                props['formula'] = {'expression': f'[{refs[0]}] * [{refs[1]}]'}
            rows.append({'id': mapping[i], 'document_id': e['document_id'], 'page_number': e['page_number'],
                         'field_type': kind, 'participant_id': e['participant_id'], 'label': e['label'],
                         'required': kind not in {'checkbox'}, 'box': e['box'] if mapping[i].startswith('visual-') else None,
                         'properties_json': json.dumps(props), 'evidence': e['label'], 'disposition': 'proposed', 'reason': ''})
            if e.get('group'):
                name = e['group']
                groups.setdefault(name, {'id': name, 'kind': kind, 'members': [], 'label': name,
                                         'minimum': 1 if kind == 'radio' else 0, 'maximum': 1 if kind == 'radio' else None,
                                         'evidence': 'Preferred contact (choose exactly one):' if kind == 'radio' else 'Services (select any; optional):'})['members'].append(mapping[i])
        return {'fields': rows, 'groups': list(groups.values()),
                'pages': [{'document_id': p['document_id'], 'page_number': p['page_number'], 'complete': True} for p in context['pages']]}, {}
    return generate
