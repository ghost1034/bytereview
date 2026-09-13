"""Placement accuracy assertions against reviewed regions, not page bounds."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

import fitz
import pytest

from services.esign.placement_analysis import (
    analyze_documents, geometry_error, owner_allowed, replay_analysis, validate_group_acceptance,
)
from services.esign.placement_evaluation import CONSENT_REGIONS, check_consent_result, consent_inputs
from services.esign.placement_targets import PlacementTarget, detect_targets, field_box, valid_box

PDF = Path(__file__).resolve().parents[2] / 'examples/e-signature/Informed_Consent.pdf'


def scripted_model(*, omit_no=False, reject_no=False, wrong_role=False, duplicate=False, discovery=None):
    def generate(phase, prompt, schema, image):
        if phase=='discover': return {'targets':discovery or []},{}
        if phase in {'select','repair'}:
            targets=json.loads(prompt.split('Targets: ')[1].split('\nExisting fields: ')[0])
            assignments=[]
            for target in targets:
                if omit_no and target['label']=='No': continue
                eligible='Witness' not in target['section'] and 'Obtaining' not in target['section']
                assignments.append({'target_id':target['id'],'participant_id':'signer' if eligible or wrong_role else None,
                    'field_type':target['kind'],'required':True,'disposition':'proposed' if eligible or wrong_role else 'unassigned',
                    'reason':'' if eligible else 'The document role is not configured.'})
            if duplicate: assignments.append(assignments[0])
            return {'assignments':assignments},{}
        proposals=json.loads(prompt.split('Numbered overlays: ')[1].split('\nCatalog: ')[0])
        return {'checks':[{'target_id':p['target_id'],'accepted':not (reject_no and p['label']=='No'),
                           'reason':'Checkbox needs review' if reject_no and p['label']=='No' else '',
                           'corrected_box':None} for p in proposals]},{}
    return generate


@pytest.mark.parametrize('existing',[False,True])
def test_consent_targets_match_reviewed_regions_and_exactly_one_choice(existing):
    pdfs,snapshot=consent_inputs(PDF,existing=existing)
    result=analyze_documents(pdfs,snapshot,'Place checkboxes in both Yes and No' if existing else None,scripted_model())
    assert check_consent_result(result.proposals,existing=existing)==[]
    assert len(result.issues)==6
    assert {i['code'] for i in result.issues}=={'unassigned'}
    assert sum(c['status']=='already_covered' for c in result.diagnostics['coverage'])==(3 if existing else 0)
    assert all(not p['required'] for p in result.proposals if p['field_type']=='checkbox')


def test_exact_replay_and_input_drift_detection():
    pdfs,snapshot=consent_inputs(PDF)
    result=analyze_documents(pdfs,snapshot,None,scripted_model())
    replayed=replay_analysis(pdfs,result.diagnostics)
    assert replayed.proposals==result.proposals
    assert replayed.issues==result.issues
    damaged=copy.deepcopy(result.diagnostics)
    damaged['calls'][0]['image_sha256']='incorrect'
    with pytest.raises(ValueError,match='Replay inputs'): replay_analysis(pdfs,damaged)
    with pytest.raises(ValueError,match='content changed'): replay_analysis({'consent':b'changed'},result.diagnostics)
    with pytest.raises(ValueError,match='exactly the selected'): replay_analysis({},result.diagnostics)


@pytest.mark.parametrize('options',[{'omit_no':True},{'reject_no':True},{'duplicate':True}])
def test_one_repair_only_and_incomplete_choice_group_is_not_staged(options):
    pdfs,snapshot=consent_inputs(PDF)
    result=analyze_documents(pdfs,snapshot,None,scripted_model(**options))
    assert not any(p['field_type']=='checkbox' for p in result.proposals)
    assert sum(c['phase']=='repair' for c in result.diagnostics['calls'])==1
    assert any(i['code']=='unresolved' for i in result.issues)


def test_primary_signer_cannot_inherit_witness_or_obtainer_fields():
    pdfs,snapshot=consent_inputs(PDF)
    result=analyze_documents(pdfs,snapshot,None,scripted_model(wrong_role=True))
    assert check_consent_result(result.proposals)==[]
    assert len(result.issues)==6
    assert {i['code'] for i in result.issues}=={'unassigned'}


def test_partial_group_application_rejected_but_legacy_independent_fields_work():
    pdfs,snapshot=consent_inputs(PDF)
    proposals=analyze_documents(pdfs,snapshot,None,scripted_model()).proposals
    choices=[p for p in proposals if p['field_type']=='checkbox']
    with pytest.raises(ValueError,match='choice group'): validate_group_acceptance(proposals,{choices[0]['id']})
    validate_group_acceptance(proposals,{p['id'] for p in choices})
    validate_group_acceptance(proposals,set())
    validate_group_acceptance([{'id':'legacy','properties':{}}],{'legacy'})


@pytest.mark.parametrize('rotation',[0,90,180,270])
def test_native_targets_follow_original_display_rotation(rotation):
    with fitz.open(PDF) as pdf:
        page=pdf[2]; page.set_rotation(rotation)
        targets=detect_targets(page,'doc','hash',2)
        assert len(targets)==11
        assert page.rotation==rotation
        for target in targets:
            assert valid_box(target.box)
            assert geometry_error(page,target) is None
        name=next(t for t in targets if t.label=='Name of Participant (print):')
        rect=fitz.Rect(name.box[0]*page.rect.width,name.box[1]*page.rect.height,name.box[2]*page.rect.width,name.box[3]*page.rect.height)*page.derotation_matrix
        assert 222<=rect.x0<rect.x1<=455
        assert 456<=rect.y0<rect.y1<=477


def test_same_pdf_in_two_documents_has_distinct_target_ids():
    with fitz.open(PDF) as pdf:
        first=detect_targets(pdf[2],'a','same-hash',2)
        second=detect_targets(pdf[2],'b','same-hash',2)
    assert not {t.id for t in first} & {t.id for t in second}


def test_duplicate_existing_target_is_suppressed_even_if_model_repeats_it():
    pdfs,snapshot=consent_inputs(PDF,existing=True)
    result=analyze_documents(pdfs,snapshot,None,scripted_model())
    assert len(result.proposals)==2
    assert all(p['field_type']=='checkbox' for p in result.proposals)


def test_existing_independent_choice_is_preserved_and_blocks_partial_group():
    pdfs,snapshot=consent_inputs(PDF)
    initial=analyze_documents(pdfs,snapshot,None,scripted_model())
    yes=next(p for p in initial.proposals if p['label']=='Yes')
    snapshot['existing_fields']=[{**yes,'properties':{'schema_version':2}}]
    result=analyze_documents(pdfs,snapshot,None,scripted_model())
    assert not any(p['field_type']=='checkbox' for p in result.proposals)
    assert snapshot['existing_fields'][0]['properties']=={'schema_version':2}


def test_wrong_section_geometry_and_printed_text_are_rejected():
    with fitz.open(PDF) as pdf:
        page=pdf[2]
        target=next(t for t in detect_targets(page,'doc','hash',2) if t.kind=='signature')
        wrong=PlacementTarget(**{**target.to_dict(),'box':[.37,.68,.74,.70]})
        assert 'section' in geometry_error(page,wrong)
        label=PlacementTarget(**{**target.to_dict(),'box':[.29,.616,.36,.632]})
        assert 'printed text' in geometry_error(page,label)


def test_scanned_visual_targets_use_original_rotation_without_ocr_changes():
    with fitz.open() as source:
        p=source.new_page(width=400,height=500)
        p.insert_text((40,100),'Signature:')
        image=p.get_pixmap().tobytes('png')
        with fitz.open() as scanned:
            p=scanned.new_page(width=400,height=500);p.insert_image(p.rect,stream=image);p.set_rotation(90)
            data=scanned.tobytes()
    snapshot={'documents':[{'id':'doc','sha256':hashlib.sha256(data).hexdigest(),'page_count':1}],
              'participants':[{'id':'signer','label':'Participant','role':'signer'}],'existing_fields':[]}
    # Display-space box from the visual detector on a page with no text layer.
    discovery=[{'label':'Signature:','section':'Participant','kind':'signature','box':[.78,.25,.84,.75]}]
    result=analyze_documents({'doc':data},snapshot,None,scripted_model(discovery=discovery))
    assert len(result.proposals)==1
    assert field_box(result.proposals[0])==pytest.approx(discovery[0]['box'])


def test_unknown_and_malformed_visual_geometry_is_visible_as_issue():
    pdfs,snapshot=consent_inputs(PDF)
    result=analyze_documents(pdfs,snapshot,None,scripted_model(discovery=[{'box':[0,0,2,1],'kind':'signature'}]))
    assert any('invalid target' in i['reason'] for i in result.issues)


def test_multiple_role_labels_are_bound_to_matching_sections():
    target=PlacementTarget('t','d',0,'Signature','Buyer','signature',[.1,.1,.3,.2],'label')
    buyer={'id':'b','label':'Buyer','role':'signer'};seller={'id':'s','label':'Seller','role':'signer'}
    assert owner_allowed(target,buyer,[buyer,seller])
    assert not owner_allowed(target,seller,[buyer,seller])


def test_cropbox_is_respected_by_native_targets():
    with fitz.open(PDF) as pdf:
        page=pdf[2];page.set_cropbox(fitz.Rect(50,40,560,750))
        targets=detect_targets(page,'doc','hash',2)
        assert len(targets)==11
        assert all(valid_box(t.box) and geometry_error(page,t) is None for t in targets)
