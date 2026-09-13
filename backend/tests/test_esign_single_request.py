from __future__ import annotations

import copy
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from esign_placement_helpers import authored_model, consent_model
from services.esign.placement_evaluation import general_inputs, check_general_result, consent_inputs, check_consent_result
from services.esign.placement_single_call import analyze_documents, replay_analysis, validate_group_acceptance, FIELD_TYPES
from services.esign.placement_model import generate_placement_response

PDF = Path(__file__).resolve().parents[2]/'examples/e-signature/Informed_Consent.pdf'


@pytest.mark.parametrize('existing', [False, True])
def test_consent_single_request_and_replay(existing):
    pdfs, snapshot = consent_inputs(PDF, existing=existing)
    result = analyze_documents(pdfs, snapshot, None, consent_model)
    assert len(result.diagnostics['calls']) == 1
    assert check_consent_result(result.proposals, existing=existing) == []
    assert len(result.issues) == 6
    assert replay_analysis(pdfs, result.diagnostics).proposals == result.proposals


@pytest.mark.parametrize('rotation', [0, 90, 180, 270])
def test_all_editor_types_and_general_groups(rotation):
    pdfs, snapshot, expected = general_inputs(rotation=rotation)
    result = analyze_documents(pdfs, snapshot, None, authored_model(expected))
    assert set(p['field_type'] for p in result.proposals) == set(FIELD_TYPES)
    assert check_general_result(result.proposals, expected)['errors'] == []
    assert len(result.diagnostics['calls']) == 1
    formula = next(p for p in result.proposals if p['field_type'] == 'formula')
    assert len(formula['dependency_ids']) == 2
    assert not formula['required']
    with pytest.raises(ValueError, match='source suggestions'):
        validate_group_acceptance(result.proposals, {formula['id']})


def test_scanned_inputs_use_original_display_coordinates():
    pdfs, snapshot, expected = general_inputs(scanned=True, rotation=90)
    result = analyze_documents(pdfs, snapshot, None, authored_model(expected))
    assert all(p['ocr_used'] for p in result.diagnostics['pages'])
    assert check_general_result(result.proposals, expected)['errors'] == []


def test_missing_target_is_issue_without_repair_and_group_is_not_partial():
    pdfs, snapshot = consent_inputs(PDF)
    calls = []
    def missing(*args):
        calls.append(1)
        raw, meta = consent_model(*args)
        raw['fields'] = [r for r in raw['fields'] if r['label'] != 'No']
        return raw, meta
    result = analyze_documents(pdfs, snapshot, None, missing)
    assert len(calls) == 1
    assert not any(p['field_type'] == 'checkbox' for p in result.proposals)
    assert any(i['code'] == 'unresolved' for i in result.issues)


@pytest.mark.parametrize('damage', ['page', 'malformed', 'too_many', 'unknown_id'])
def test_incomplete_or_malformed_response_never_repairs(damage):
    pdfs, snapshot = consent_inputs(PDF)
    calls = []
    def damaged(*args):
        calls.append(1)
        raw, metadata = consent_model(*args)
        if damage == 'page': raw['pages'].pop()
        elif damage == 'malformed': raw['fields'] = None
        elif damage == 'too_many': raw['fields'] *= 100
        elif damage == 'unknown_id': raw['fields'][0]['id'] = 'unknown'
        return raw, metadata
    with pytest.raises(ValueError): analyze_documents(pdfs, snapshot, None, damaged)
    assert len(calls) == 1


def test_conflicting_existing_field_is_issue():
    pdfs, snapshot = consent_inputs(PDF)
    initial = analyze_documents(pdfs, snapshot, None, consent_model)
    name = next(p for p in initial.proposals if p['field_type'] == 'full_name')
    snapshot['existing_fields'] = [{**name, 'field_type': 'text'}]
    result = analyze_documents(pdfs, snapshot, None, consent_model)
    assert any('incompatible' in i['reason'] for i in result.issues)
    assert not any(p['field_type'] == 'full_name' for p in result.proposals)


def test_missing_configuration_does_not_discard_unrelated_fields():
    pdfs, snapshot, expected = general_inputs()
    def missing(*args):
        raw, metadata = authored_model(expected)(*args)
        next(r for r in raw['fields'] if r['field_type'] == 'dropdown')['properties_json'] = '{}'
        return raw, metadata
    result = analyze_documents(pdfs, snapshot, None, missing)
    assert len(result.proposals) == len(expected)-1
    assert any('configuration' in i['reason'] for i in result.issues)


def test_adapter_disables_retries_and_rejects_truncation():
    seen = []
    def generate(**kwargs):
        seen.append(kwargs)
        return SimpleNamespace(candidates=[SimpleNamespace(finish_reason=SimpleNamespace(value='MAX_TOKENS'))])
    with pytest.raises(RuntimeError, match='Incomplete'):
        generate_placement_response(SimpleNamespace(models=SimpleNamespace(generate_content=generate)), {'model': 'test'}, 'analyze', 'prompt', {}, [
            {'document_id': 'one', 'page_number': 0, 'data': b'png'}, {'document_id': 'two', 'page_number': 0, 'data': b'png'},
        ])
    assert len(seen) == 1
    assert seen[0]['config'].http_options.retry_options.attempts == 1
    assert seen[0]['config'].automatic_function_calling.disable
    assert len(seen[0]['contents']) == 5


def test_multiple_roles_and_unlabeled_region():
    from services.esign.placement_evaluation import party_inputs
    pdfs, snapshot, expected = party_inputs()
    result = analyze_documents(pdfs, snapshot, 'Add one optional multiline text field for Client in the unlabeled rectangle at the bottom.', authored_model(expected))
    assert check_general_result(result.proposals, expected)['errors'] == []
    assert {p['participant_id'] for p in result.proposals} == {'client', 'advisor'}


def test_visual_only_discovery_does_not_require_searchable_anchor():
    import hashlib
    import fitz
    with fitz.open() as pdf:
        page = pdf.new_page(width=612, height=792)
        page.insert_text((40, 60), 'Client: Please enter your comments in the empty area below.')
        data = pdf.tobytes()
    expected = [{'document_id': 'visual', 'page_number': 0, 'participant_id': 'client', 'field_type': 'text',
                 'label': 'Comments', 'box': [.1, .2, .8, .3]}]
    snapshot = {'documents': [{'id': 'visual', 'sha256': hashlib.sha256(data).hexdigest(), 'page_count': 1}],
                'participants': [{'id': 'client', 'label': 'Client', 'role': 'signer'}], 'existing_fields': []}
    result = analyze_documents({'visual': data}, snapshot, None, authored_model(expected))
    assert len(result.proposals) == 1
    assert result.proposals[0]['target_source'] == 'vision'
    assert check_general_result(result.proposals, expected)['errors'] == []


def test_cropbox_changes_are_mapped_to_displayed_page():
    import hashlib
    import fitz
    pdfs, snapshot, expected = general_inputs()
    with fitz.open(stream=pdfs['general'], filetype='pdf') as pdf:
        for page in pdf:
            page.set_cropbox(fitz.Rect(20, 20, 592, 772))
        pdfs['general'] = pdf.tobytes()
    snapshot['documents'][0]['sha256'] = hashlib.sha256(pdfs['general']).hexdigest()
    for e in expected:
        a, b, c, d = e['box']
        e['box'] = [(a*612-20)/572, (b*792-20)/752, (c*612-20)/572, (d*792-20)/752]
    result = analyze_documents(pdfs, snapshot, None, authored_model(expected))
    assert check_general_result(result.proposals, expected)['errors'] == []


def test_preflight_limits_do_not_dispatch():
    from services.esign.placement_layout import LayoutPage
    from services.esign.placement_single_call import request_inputs
    page = LayoutPage('d', 0, 100, 100, b'a'*7_000_001, [], [])
    with pytest.raises(ValueError, match='budget'):
        request_inputs([page], {'participants': []}, None)


def test_native_widgets_keep_options_and_populated_values():
    import hashlib
    import fitz
    from services.esign.placement_layout import prepare_layout
    with fitz.open() as pdf:
        page = pdf.new_page()
        page.insert_text((30, 35), 'Client native fields and selection controls')
        for i, (name, kind, value) in enumerate([
            ('Department', fitz.PDF_WIDGET_TYPE_COMBOBOX, ''),
            ('Reference', fitz.PDF_WIDGET_TYPE_TEXT, 'Already completed'),
        ]):
            widget = fitz.Widget()
            widget.field_name = name
            widget.field_type = kind
            widget.field_value = value
            widget.rect = fitz.Rect(50, 80+i*100, 250, 110+i*100)
            if kind == fitz.PDF_WIDGET_TYPE_COMBOBOX:
                widget.choice_values = ['Sales', 'Operations']
            page.add_widget(widget)
        data = pdf.tobytes()
    snapshot = {'documents': [{'id': 'widgets', 'sha256': hashlib.sha256(data).hexdigest(), 'page_count': 1}],
                'participants': [{'id': 'client', 'label': 'Client', 'role': 'signer'}], 'existing_fields': []}
    targets = prepare_layout({'widgets': data}, snapshot)[0].targets
    department = next(t for t in targets if t['label'] == 'Department')
    assert department['shape'] == 'dropdown'
    assert department['widget']['options'] == ['Sales', 'Operations']
    assert next(t for t in targets if t['label'] == 'Reference')['widget']['value'] == 'Already completed'


def test_visual_match_uses_unique_native_geometry_and_remaps_dependencies():
    pdfs, snapshot, expected = general_inputs()
    def renamed(*args):
        raw, metadata = authored_model(expected)(*args)
        quantity = next(f for f in raw['fields'] if f['label'] == 'Quantity')
        old_id = quantity['id']
        quantity['id'] = 'visual-quantity'
        quantity['box'] = next(e['box'] for e in expected if e['label'] == 'Quantity')
        for field in raw['fields']:
            field['properties_json'] = field['properties_json'].replace(old_id, 'visual-quantity')
        return raw, metadata
    result = analyze_documents(pdfs, snapshot, None, renamed)
    assert check_general_result(result.proposals, expected)['errors'] == []
    assert any('matched_catalog_id' in a for a in result.diagnostics['geometry_adjustments'])


@pytest.mark.parametrize('rotation', [0, 90, 180, 270])
def test_exact_outlines_suppress_competing_label_only_writing_areas(rotation):
    from services.esign.placement_layout import prepare_layout
    pdfs, snapshot, _ = general_inputs(rotation=rotation)
    targets = prepare_layout(pdfs, snapshot)[0].targets
    for label in ('Signature', 'Initials'):
        matches = [t for t in targets if t['label'] == label]
        assert len(matches) == 1
        assert matches[0]['source'] == 'outline'


def test_real_sdk_transport_makes_one_attempt_on_429():
    import httpx
    from google import genai
    from google.genai import types, errors
    requests = []
    def exhausted(request):
        requests.append(request)
        return httpx.Response(429, json={'error': {'code': 429, 'message': 'Busy', 'status': 'RESOURCE_EXHAUSTED'}})
    with genai.Client(api_key='test-only', http_options=types.HttpOptions(
        client_args={'transport': httpx.MockTransport(exhausted)},
        retry_options=types.HttpRetryOptions(attempts=3),
    )) as client:
        with pytest.raises(errors.ClientError):
            generate_placement_response(client, {'model': 'gemini-test'}, 'analyze', 'prompt', {}, [])
    assert len(requests) == 1


def test_formula_normalization_only_brackets_exact_known_references():
    from services.esign.placement_single_call import normalize_formula_references
    assert normalize_formula_references('target-a * [target-b]', {'target-a', 'target-b'}) == '[target-a] * [target-b]'
    assert normalize_formula_references('target-abc * invented', {'target-a'}) == 'target-abc * invented'
    pdfs, snapshot, expected = general_inputs()
    def unbracketed(*args):
        raw, meta = authored_model(expected)(*args)
        formula = next(f for f in raw['fields'] if f['field_type'] == 'formula')
        props = json.loads(formula['properties_json'])
        props['formula']['expression'] = props['formula']['expression'].replace('[', '').replace(']', '')
        formula['properties_json'] = json.dumps(props)
        return raw, meta
    result = analyze_documents(pdfs, snapshot, None, unbracketed)
    assert check_general_result(result.proposals, expected)['errors'] == []


def test_mixed_native_header_and_scanned_body_has_ocr_collision_evidence():
    import hashlib
    import fitz
    from services.esign.placement_layout import prepare_layout
    with fitz.open() as body:
        p = body.new_page(width=500, height=500)
        p.insert_text((30, 40), 'Printed words inside the scanned body')
        image = p.get_pixmap().tobytes('png')
    with fitz.open() as pdf:
        p = pdf.new_page(width=612, height=792)
        p.insert_text((30, 40), 'A native text header with more than twenty-five characters')
        p.insert_image(fitz.Rect(30, 100, 530, 600), stream=image)
        data = pdf.tobytes()
    snapshot = {'documents': [{'id': 'mixed', 'page_count': 1, 'sha256': hashlib.sha256(data).hexdigest()}]}
    page = prepare_layout({'mixed': data}, snapshot)[0]
    assert page.ocr_used
    assert 'scanned' in ' '.join(w['text'] for w in page.words)


def test_scanned_fixture_bytes_are_reproducible_for_offline_replay():
    first, snapshot, expected = general_inputs(scanned=True, rotation=90)
    second, _, _ = general_inputs(scanned=True, rotation=90)
    assert first == second
    result = analyze_documents(first, snapshot, None, authored_model(expected))
    assert replay_analysis(second, result.diagnostics).proposals == result.proposals
