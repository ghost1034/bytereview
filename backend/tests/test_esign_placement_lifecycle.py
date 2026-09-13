"""Real PostgreSQL persistence and transaction checks for advisory placement.

Opt in with ESIGN_TEST_DATABASE_URL pointing to a disposable local database.
Only an isolated schema is created; no production connection is accepted.
"""
from __future__ import annotations

import asyncio
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace
import uuid

import pytest
from sqlalchemy import Enum, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from models.db_models import Base, EsignAiFieldPlacementRun, EsignDocument, EsignEnvelope, EsignField, EsignRecipient, User
from models.esign import EsignAiFieldPlacementApplyRequest, EsignAiFieldPlacementCreateRequest
from services.esign.ai_field_placement_service import EsignAiFieldPlacementService
from services.esign import ai_field_placement_service as module
from services.esign.envelope_service import EsignConflict, EsignError
from services.esign.placement_evaluation import CONSENT_SHA256

PDF=Path(__file__).resolve().parents[2]/'examples/e-signature/Informed_Consent.pdf'
DSN=os.getenv('ESIGN_TEST_DATABASE_URL')
pytestmark=pytest.mark.skipif(not DSN,reason='Set ESIGN_TEST_DATABASE_URL to a disposable local PostgreSQL database')


@pytest.fixture(scope='module')
def database():
    assert DSN and make_url(DSN).host in {'127.0.0.1','localhost'}, 'Only local test databases are allowed'
    schema='esign_placement_'+uuid.uuid4().hex
    admin=create_engine(DSN)
    with admin.begin() as conn: conn.execute(text(f'CREATE SCHEMA {schema}'))
    engine=create_engine(DSN,connect_args={'options':f'-csearch_path={schema}'})
    # Install only E-Signature and its FK dependencies. Unrelated Inkwise vector
    # extensions are not necessary to test this module's transactions.
    tables={t for name,t in Base.metadata.tables.items() if name.startswith('esign_')}
    tables.add(Base.metadata.tables['users'])
    while True:
        expanded=tables | {fk.column.table for t in tables for fk in t.foreign_keys}
        if expanded==tables: break
        tables=expanded
    with engine.begin() as conn:
        enums={c.type.name:c.type for t in tables for c in t.columns if isinstance(c.type,Enum)}
        for enum in enums.values(): enum.create(conn,checkfirst=True)
        Base.metadata.create_all(conn,tables=list(tables))
    try: yield engine
    finally:
        engine.dispose()
        with admin.begin() as conn: conn.execute(text(f'DROP SCHEMA {schema} CASCADE'))
        admin.dispose()


@pytest.fixture
def setup(database,monkeypatch):
    sessions=sessionmaker(bind=database)
    monkeypatch.setattr(module.db_config,'get_session',sessions)
    monkeypatch.setenv('ESIGN_AI_TARGET_PIPELINE','true')
    monkeypatch.setenv('ESIGN_AI_TARGET_PIPELINE_USERS','')
    charges=[];queued=[]
    class Billing:
        def __init__(self,db): self.db=db
        def require_limit(self,*args): pass
        def record_usage(self,**kwargs): charges.append(kwargs)
    monkeypatch.setattr(module,'BillingService',Billing)
    async def enqueue(run_id): queued.append(run_id)
    monkeypatch.setattr(module.cloud_run_task_service,'enqueue_esign_ai_field_placement_task',enqueue)
    service=EsignAiFieldPlacementService()
    async def download(name,path): Path(path).write_bytes(PDF.read_bytes())
    service.storage=SimpleNamespace(download_file=download)
    user_id='placement-'+uuid.uuid4().hex
    with sessions() as db:
        db.add(User(id=user_id,email=f'{user_id}@example.com'))
        envelope=EsignEnvelope(user_id=user_id,title='Placement regression',consent_disclosure_text='Test')
        db.add(envelope);db.flush()
        document=EsignDocument(envelope_id=envelope.id,original_filename=PDF.name,gcs_object_name=str(uuid.uuid4()),
            original_sha256=CONSENT_SHA256,page_count=3,file_size_bytes=PDF.stat().st_size)
        recipient=EsignRecipient(envelope_id=envelope.id,email='signer@example.com',name='Example Signer',role='signer')
        db.add_all([document,recipient]);db.commit()
        envelope_id=str(envelope.id)
    calls=[]
    def generate(phase,prompt,schema,image,settings):
        calls.append(phase)
        if phase=='discover': return {'targets':[]},{}
        if phase in {'select','repair'}:
            participants=json.loads(prompt.split('Participants: ')[1].split('\nTargets: ')[0])
            targets=json.loads(prompt.split('Targets: ')[1].split('\nExisting fields: ')[0])
            rows=[]
            for t in targets:
                eligible='Witness' not in t['section'] and 'Obtaining' not in t['section']
                rows.append({'target_id':t['id'],'participant_id':participants[0]['id'] if eligible else None,
                    'field_type':t['kind'],'required':True,'disposition':'proposed' if eligible else 'unassigned','reason':'Missing role' if not eligible else ''})
            return {'assignments':rows},{}
        ids=schema['properties']['checks']['items']['properties']['target_id']['enum']
        return {'checks':[{'target_id':t,'accepted':True,'reason':'','corrected_box':None} for t in ids]},{}
    service._generate_target_payload=generate
    def create(): return asyncio.run(service.create_run(user_id,'envelope',envelope_id,EsignAiFieldPlacementCreateRequest(expected_revision=1)))
    return SimpleNamespace(service=service,sessions=sessions,uid=user_id,envelope_id=envelope_id,create=create,calls=calls,charges=charges,queued=queued)


def test_run_completion_replay_evidence_application_and_idempotence(setup):
    s=setup;created=s.create()
    assert s.queued==[created.id]
    result=asyncio.run(s.service.process_run(created.id))
    assert result=={'status':'completed','proposals':5}
    run=s.service.get_run(s.uid,created.id)
    assert len(run.issues)==6
    assert 'analysis_diagnostics' not in run.model_dump()
    with s.sessions() as db:
        stored=db.get(EsignAiFieldPlacementRun,uuid.UUID(created.id))
        assert stored.analysis_diagnostics['calls']
        assert stored.target_snapshot['existing_fields']==[]
    call_count=len(s.calls)
    assert asyncio.run(s.service.process_run(created.id))=={'status':'completed'}
    assert len(s.calls)==call_count and len(s.charges)==1
    checkbox=next(p for p in run.proposals if p.field_type=='checkbox')
    with pytest.raises(EsignError,match='choice group'):
        s.service.apply_run(s.uid,run.id,EsignAiFieldPlacementApplyRequest(accepted_proposal_ids=[checkbox.id],current_revision=1))
    applied=s.service.apply_run(s.uid,run.id,EsignAiFieldPlacementApplyRequest(accepted_proposal_ids=[p.id for p in run.proposals],current_revision=1))
    assert applied.fields_added==5 and applied.draft_revision==2
    repeated=s.service.apply_run(s.uid,run.id,EsignAiFieldPlacementApplyRequest(accepted_proposal_ids=[p.id for p in run.proposals],current_revision=1))
    assert repeated.fields_added==0 and repeated.draft_revision==2
    with s.sessions() as db:
        assert db.query(EsignField).filter_by(envelope_id=uuid.UUID(s.envelope_id)).count()==5


def test_retry_queues_then_completes_and_discard_does_not_charge(setup):
    s=setup;created=s.create();original=s.service._generate_target_payload
    def failure(*args): raise RuntimeError('Simulated model failure')
    s.service._generate_target_payload=failure
    with pytest.raises(RuntimeError,match='Simulated'):
        asyncio.run(s.service.process_run(created.id,task_retry_count=0))
    assert s.service.get_run(s.uid,created.id).status=='queued'
    assert s.charges==[]
    s.service._generate_target_payload=original
    assert asyncio.run(s.service.process_run(created.id,task_retry_count=1))['status']=='completed'
    assert len(s.charges)==1
    s.service.discard_run(s.uid,created.id)
    assert asyncio.run(s.service.process_run(created.id))=={'status':'discarded'}
    assert len(s.charges)==1


def test_stale_revision_and_changed_roles_prevent_application(setup):
    s=setup;created=s.create();asyncio.run(s.service.process_run(created.id))
    run=s.service.get_run(s.uid,created.id)
    with pytest.raises(EsignConflict):
        s.service.apply_run(s.uid,run.id,EsignAiFieldPlacementApplyRequest(accepted_proposal_ids=[p.id for p in run.proposals],current_revision=99))
    with s.sessions() as db:
        recipient=db.query(EsignRecipient).filter_by(envelope_id=uuid.UUID(s.envelope_id)).one()
        recipient.role_label='Changed role';db.commit()
    with pytest.raises(EsignConflict,match='signing roles changed'):
        s.service.apply_run(s.uid,run.id,EsignAiFieldPlacementApplyRequest(accepted_proposal_ids=[p.id for p in run.proposals],current_revision=1))


def test_rollout_flag_is_snapshotted_and_legacy_runs_default_to_anchors(setup,monkeypatch):
    monkeypatch.setenv('ESIGN_AI_TARGET_PIPELINE','false')
    s=setup;created=s.create()
    with s.sessions() as db:
        assert db.get(EsignAiFieldPlacementRun,uuid.UUID(created.id)).target_snapshot['pipeline_version']=='anchors-v1'


def test_field_added_after_analysis_cannot_be_overwritten_by_a_different_type(setup):
    s=setup;created=s.create();asyncio.run(s.service.process_run(created.id))
    run=s.service.get_run(s.uid,created.id)
    proposal=next(p for p in run.proposals if p.field_type=='full_name')
    with s.sessions() as db:
        db.add(EsignField(envelope_id=uuid.UUID(s.envelope_id),document_id=uuid.UUID(proposal.document_id),
            recipient_id=uuid.UUID(proposal.participant_id),field_type='text',page_number=proposal.page_number,
            pos_x=proposal.pos_x,pos_y=proposal.pos_y,width=proposal.width,height=proposal.height,properties={'schema_version':2}))
        db.commit()
    with pytest.raises(EsignConflict,match='over a suggested target'):
        s.service.apply_run(s.uid,run.id,EsignAiFieldPlacementApplyRequest(accepted_proposal_ids=[proposal.id],current_revision=1))
    with s.sessions() as db:
        assert db.query(EsignField).filter_by(envelope_id=uuid.UUID(s.envelope_id)).one().field_type.value=='text'


def test_queued_run_uses_captured_fields_after_draft_changes(setup):
    s=setup;created=s.create()
    with s.sessions() as db:
        envelope=db.get(EsignEnvelope,uuid.UUID(s.envelope_id))
        db.add(EsignField(envelope_id=envelope.id,document_id=envelope.documents[0].id,
            recipient_id=envelope.recipients[0].id,field_type='text',page_number=0,
            pos_x=.1,pos_y=.1,width=.1,height=.03,properties={'schema_version':2}))
        db.commit()
    asyncio.run(s.service.process_run(created.id))
    with s.sessions() as db:
        stored=db.get(EsignAiFieldPlacementRun,uuid.UUID(created.id))
        assert stored.analysis_diagnostics['snapshot']['existing_fields']==[]


def test_additive_migration_preserves_old_runs_and_round_trips(database):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path=Path(__file__).resolve().parents[1]/'alembic/versions/081_esign_placement_diagnostics.py'
    spec=importlib.util.spec_from_file_location('placement_migration',path)
    migration=importlib.util.module_from_spec(spec);spec.loader.exec_module(migration)
    with database.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            migration.downgrade()
            before=conn.execute(text('select count(*) from esign_ai_field_placement_runs')).scalar()
            migration.upgrade()
        assert conn.execute(text('select count(*) from esign_ai_field_placement_runs')).scalar()==before
        assert conn.execute(text("select count(*) from esign_ai_field_placement_runs where issues is null or analysis_diagnostics is null")).scalar()==0
