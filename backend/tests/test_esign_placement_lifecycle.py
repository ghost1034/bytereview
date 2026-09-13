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
    from esign_placement_helpers import consent_model
    def generate(phase,prompt,schema,image,settings):
        calls.append(phase)
        return consent_model(phase,prompt,schema,image,settings)
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


def test_provider_failure_is_terminal_and_never_retries(setup):
    s=setup;created=s.create()
    attempts=[]
    def failure(*args):
        attempts.append(1)
        raise RuntimeError('Simulated model failure')
    s.service._generate_target_payload=failure
    assert asyncio.run(s.service.process_run(created.id,task_retry_count=0)) == {'status':'failed'}
    assert s.service.get_run(s.uid,created.id).status=='failed'
    assert s.charges==[]
    assert asyncio.run(s.service.process_run(created.id,task_retry_count=1)) == {'status':'failed'}
    assert len(attempts)==1
    with s.sessions() as db:
        run=db.get(EsignAiFieldPlacementRun,uuid.UUID(created.id))
        assert run.inference_attempted_at is not None
        assert run.analysis_diagnostics['attempted_calls']==1


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


def test_saved_response_resumes_local_processing_without_inference(setup, monkeypatch):
    from services.esign import placement_single_call
    s = setup
    created = s.create()
    original = placement_single_call.materialize
    def failure(*args, **kwargs):
        raise RuntimeError('Local processing interrupted')
    monkeypatch.setattr(placement_single_call, 'materialize', failure)
    with pytest.raises(RuntimeError, match='Local processing'):
        asyncio.run(s.service.process_run(created.id, task_retry_count=0))
    with s.sessions() as db:
        run = db.get(EsignAiFieldPlacementRun, uuid.UUID(created.id))
        assert run.status == 'queued'
        assert run.model_response is not None and run.inference_attempted_at is not None
    monkeypatch.setattr(placement_single_call, 'materialize', original)
    assert asyncio.run(s.service.process_run(created.id, task_retry_count=1))['status'] == 'completed'
    assert s.calls == ['analyze']
    assert len(s.charges) == 1


def test_concurrent_delivery_and_late_response_cannot_reenter_or_complete(setup):
    from concurrent.futures import ThreadPoolExecutor
    from datetime import datetime, timedelta, timezone
    import threading
    s = setup
    created = s.create()
    entered, release = threading.Event(), threading.Event()
    original = s.service._generate_target_payload
    def held(*args):
        entered.set()
        assert release.wait(20)
        return original(*args)
    s.service._generate_target_payload = held
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(lambda: asyncio.run(s.service.process_run(created.id)))
        try:
            assert entered.wait(10)
            assert asyncio.run(s.service.process_run(created.id)) == {'status': 'processing'}
            with s.sessions() as db:
                run = db.get(EsignAiFieldPlacementRun, uuid.UUID(created.id))
                assert run.inference_attempted_at is not None
                run.processing_deadline = datetime.now(timezone.utc)-timedelta(seconds=1)
                db.commit()
            assert s.service.recover_expired_runs() == []
        finally:
            release.set()
        assert future.result()['status'] == 'failed'
    with s.sessions() as db:
        run = db.get(EsignAiFieldPlacementRun, uuid.UUID(created.id))
        assert run.model_response is None and run.proposals == []
    assert s.charges == []
    assert asyncio.run(s.service.process_run(created.id)) == {'status': 'failed'}
    assert s.calls == ['analyze']


def test_crash_after_reservation_cannot_request_again(setup):
    from datetime import datetime, timedelta, timezone
    s = setup
    created = s.create()
    def crash(*args):
        raise SystemExit('simulated process death')
    s.service._generate_target_payload = crash
    with pytest.raises(SystemExit):
        asyncio.run(s.service.process_run(created.id))
    with s.sessions() as db:
        run = db.get(EsignAiFieldPlacementRun, uuid.UUID(created.id))
        assert run.inference_attempted_at is not None
        run.processing_deadline = datetime.now(timezone.utc)-timedelta(seconds=1)
        db.commit()
    s.service.recover_expired_runs()
    assert asyncio.run(s.service.process_run(created.id)) == {'status': 'failed'}
    assert s.charges == []


def test_invalid_response_is_terminal_after_persistence(setup):
    s = setup
    created = s.create()
    s.service._generate_target_payload = lambda *args: ({'fields': None}, {})
    assert asyncio.run(s.service.process_run(created.id)) == {'status': 'failed'}
    with s.sessions() as db:
        run = db.get(EsignAiFieldPlacementRun, uuid.UUID(created.id))
        assert run.model_response is not None
    assert asyncio.run(s.service.process_run(created.id)) == {'status': 'failed'}
    assert s.charges == []


def test_apply_remaps_formula_and_conditional_ids(setup):
    s = setup
    created = s.create()
    asyncio.run(s.service.process_run(created.id))
    with s.sessions() as db:
        run = db.get(EsignAiFieldPlacementRun, uuid.UUID(created.id))
        example = run.proposals[0]
        base = {**example, 'field_type': 'number', 'page_number': 0, 'pos_y': .1, 'width': .1, 'height': .03, 'properties': {'schema_version': 2}}
        a = {**base, 'id': 'source-proposal', 'pos_x': .1, 'target_id': 'source'}
        b = {**base, 'id': 'formula-proposal', 'pos_x': .3, 'target_id': 'formula', 'field_type': 'formula',
             'dependency_ids': ['source-proposal'], 'properties': {'schema_version': 2, 'formula': {'expression': '[source-proposal] * 2'}}}
        c = {**base, 'id': 'conditional-proposal', 'pos_x': .5, 'target_id': 'conditional', 'field_type': 'text',
             'dependency_ids': ['source-proposal'], 'properties': {'schema_version': 2,
             'conditional': {'parent_field_id': 'source-proposal', 'operator': 'not_empty', 'action': 'show', 'values': []}}}
        run.proposals = [a, b, c]
        db.commit()
    s.service.apply_run(s.uid, created.id, EsignAiFieldPlacementApplyRequest(
        accepted_proposal_ids=['source-proposal', 'formula-proposal', 'conditional-proposal'], current_revision=1))
    with s.sessions() as db:
        fields = db.query(EsignField).filter_by(envelope_id=uuid.UUID(s.envelope_id)).all()
        number = next(f for f in fields if f.field_type.value == 'number')
        formula = next(f for f in fields if f.field_type.value == 'formula')
        conditional = next(f for f in fields if f.field_type.value == 'text')
        assert formula.properties['formula']['expression'] == f'[{number.id}] * 2'
        assert conditional.properties['conditional']['parent_field_id'] == str(number.id)
        assert formula.required is False


def test_single_request_migration_round_trip(database):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path = Path(__file__).resolve().parents[1]/'alembic/versions/082_esign_single_request.py'
    spec = importlib.util.spec_from_file_location('single_request_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with database.begin() as conn:
        before = conn.execute(text('select count(*) from esign_ai_field_placement_runs')).scalar()
        with Operations.context(MigrationContext.configure(conn)):
            migration.downgrade()
            migration.upgrade()
        assert conn.execute(text('select count(*) from esign_ai_field_placement_runs')).scalar() == before
        assert conn.execute(text('select count(*) from esign_ai_field_placement_runs where inference_attempted_at is not null')).scalar() == 0
