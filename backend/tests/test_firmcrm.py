"""Integrated CRM regressions: tenant security, walls, lifecycle and shared clients."""
import os
import sys
import uuid
from pathlib import Path

os.environ.setdefault('DATABASE_URL','sqlite://')
os.environ.setdefault('ENVIRONMENT','test')
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, event, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from models.db_models import Base, Firm, User as PlatformUser, Client
from firmcrm import models as m
from firmcrm.core.db import CrmSession, get_db, refresh_visibility
from firmcrm.provisioning import provision
from firmcrm.router import router
from firmcrm.services.shared_clients import require_client_unlinked
from firmcrm.lifecycle import export_firm_crm, purge_firm_crm


@pytest.fixture
def crm():
    url = os.getenv('FIRMCRM_TEST_DATABASE_URL')
    schema = 'crm_test_' + uuid.uuid4().hex
    engine = create_engine(url, connect_args={'options':f'-csearch_path={schema}'}) if url else create_engine('sqlite://',poolclass=StaticPool,connect_args={'check_same_thread':False})
    if url:
        with engine.begin() as connection: connection.execute(text(f'CREATE SCHEMA {schema}'))
    @event.listens_for(engine,'connect')
    def foreign_keys(connection, _):
        if not url:
            connection.isolation_level = None
            connection.execute('PRAGMA foreign_keys=ON')
    @event.listens_for(engine,'begin')
    def begin(connection):
        if not url: connection.exec_driver_sql('BEGIN')
    Base.metadata.create_all(engine,tables=[Firm.__table__,PlatformUser.__table__,Client.__table__]+[model.__table__ for model in m.CRM_MODELS])
    firms=[uuid.uuid4(),uuid.uuid4()]
    with Session(engine) as db:
        db.add_all([Firm(id=firms[0],name='Alpha'),Firm(id=firms[1],name='Beta')]);db.flush()
        for uid,firm,role in [('admin',firms[0],'admin'),('staff',firms[0],'analyst'),('manager',firms[0],'manager'),('partner',firms[0],'analyst'),('other',firms[1],'admin')]:
            db.add(PlatformUser(id=uid,firm_id=firm,role=role,email=f'{uid}@example.com'))
        db.commit()
    def database(request: Request):
        uid=request.headers.get('X-Test-User','admin')
        with Session(engine) as base:
            platform=base.get(PlatformUser,uid)
            fid=platform.firm_id
        with CrmSession(engine,expire_on_commit=False,info={'firm_id':fid}) as db:
            db.scalar(select(Firm).where(Firm.id==fid).with_for_update())
            actor,settings=provision(db,uid)
            if request.method=='GET': db.commit()
            db.info.update(actor=actor,settings=settings);actor._settings=settings
            refresh_visibility(db)
            yield db
    app=FastAPI();app.include_router(router);app.dependency_overrides[get_db]=database
    with TestClient(app) as client:
        for uid in ['admin','other']: assert client.get('/api/firmcrm/context',headers={'X-Test-User':uid}).status_code==200
        for uid in ['manager','partner']:
            assert client.patch(f'/api/firmcrm/users/{uid}',json={'role':uid}).status_code==200
        yield client,engine,firms
    if url:
        with engine.begin() as connection: connection.execute(text(f'DROP SCHEMA {schema} CASCADE'))
    engine.dispose()


def call(crm,method,path,user='admin',expected=200,**kwargs):
    response=getattr(crm[0],method)('/api/firmcrm'+path,headers={'X-Test-User':user},**kwargs)
    assert response.status_code==expected,response.text
    return response.json() if response.content else None


def account(crm,name='Acme',user='admin'):
    return call(crm,'post','/accounts',user,201,json={'name':name})

def opportunity(crm,a,**overrides):
    return call(crm,'post','/opportunities',expected=201,json={'name':'Annual engagement','account_id':a['id'],'amount':1200,**overrides})

def wall(crm,a,kind='account'):
    return call(crm,'post','/walls',expected=201,json={'entity_type':kind,'entity_id':a['id'],'reason':'Confidential engagement','member_ids':['partner']})


def test_initialization_and_tenant_scope(crm):
    revision = call(crm, 'get', '/context')['access_revision']
    assert call(crm, 'get', '/context')['access_revision'] == revision
    first=call(crm,'get','/pipelines');second=call(crm,'get','/pipelines',user='other')
    assert len(first)==len(second)==1 and first[0]['id']!=second[0]['id']
    a=account(crm);account(crm,user='other')
    assert call(crm,'get','/accounts')['total']==1
    call(crm,'get',f'/accounts/{a["id"]}',user='other',expected=404)
    call(crm,'patch',f'/accounts/{a["id"]}',user='other',expected=404,json={'name':'Forged'})
    call(crm,'post','/contacts',user='other',expected=404,json={'first_name':'X','last_name':'Y','account_id':a['id']})
    call(crm,'post','/accounts',expected=404,json={'name':'Bad owner','owner_id':'other'})
    call(crm,'post','/opportunities',expected=404,json={'name':'Wrong pipeline','account_id':a['id'],'pipeline_id':second[0]['id']})


def test_restricted_referral_and_historical_import_payloads(crm):
    hidden = account(crm, 'Secret referral')
    contact = call(crm, 'post', '/contacts', expected=201, json={'first_name': 'Restricted', 'last_name': 'Referral', 'account_id': hidden['id']})
    visible = account(crm, 'Visible account')
    opportunity(crm, visible, referral_contact_id=contact['id'])
    upload = crm[0].post('/api/firmcrm/import/accounts', headers={'X-Test-User': 'manager'}, files={'file': ('Secret referral.csv', b'name,owner_email\nSecret referral,missing@example.com\n', 'text/csv')}, data={'dry_run': 'true'})
    assert upload.status_code == 200
    job = upload.json()
    wall(crm, hidden)
    assert call(crm, 'get', '/reports/referral-sources', user='manager') == []
    assert call(crm, 'get', '/import/jobs', user='manager')['total'] == 0
    call(crm, 'get', f'/import/jobs/{job["id"]}/exceptions.csv', user='manager', expected=404)


def test_terminal_stage_invariants_and_member_deletion(crm):
    pipeline = call(crm, 'get', '/pipelines')[0]
    won = next(stage for stage in pipeline['stages'] if stage['is_won'])
    call(crm, 'delete', f'/stages/{won["id"]}', expected=400)
    call(crm, 'post', f'/pipelines/{pipeline["id"]}/stages', expected=400, json={'name': 'Another won', 'position': 9, 'is_won': True})
    a = account(crm, 'Retained relationship', user='staff')
    with Session(crm[1]) as db:
        db.execute(PlatformUser.__table__.delete().where(PlatformUser.id == "staff"))
        db.commit()
    assert call(crm, 'get', f'/accounts/{a["id"]}')['owner_id'] is None


def test_account_wall_covers_related_rows_reports_search_and_exports(crm):
    a=account(crm,'Secret account');o=opportunity(crm,a)
    contact=call(crm,'post','/contacts',expected=201,json={'first_name':'Secret','last_name':'Person','account_id':a['id']})
    call(crm,'post','/activities',expected=201,json={'kind':'note','subject':'Secret note','contact_id':contact['id']})
    wall(crm,a)
    for path in [f'/accounts/{a["id"]}',f'/opportunities/{o["id"]}',f'/contacts/{contact["id"]}']:
        call(crm,'get',path,user='manager',expected=404)
    for path in ['/accounts','/contacts','/activities','/opportunities']:
        assert call(crm,'get',path,user='manager')['total']==0
    assert call(crm,'get','/reports/dashboard',user='manager')['kpis']['open_pipeline']==0
    assert call(crm,'get','/reports/pipeline',user='manager')['total_count']==0
    assert call(crm,'get','/accounts/duplicates?name=Secret',user='manager')==[]
    matches=call(crm,'post','/conflict-checks/search',user='manager',json={'parties':['Secret account']})
    assert matches and all(m['restricted'] and m['entity_id'] is None and m['matched_name']=='Restricted matter' for m in matches)
    exported=crm[0].get('/api/firmcrm/export/accounts.csv',headers={'X-Test-User':'manager'})
    assert exported.status_code==200 and 'Secret account' not in exported.text
    assert 'Secret account' not in str(call(crm,'get','/admin/audit',user='manager'))
    assert call(crm,'get','/accounts',user='partner')['total']==1


def test_opportunity_wall_and_stored_match_redaction(crm):
    a=account(crm);o=opportunity(crm,a,adverse_parties=['Hidden adversary'])
    wall(crm,o,'opportunity')
    visible=account(crm,'Visible')
    check=call(crm,'post','/conflict-checks',user='manager',expected=201,json={'account_id':visible['id'],'parties':['Hidden adversary']})
    assert check['matches'][0]['restricted'] is True
    assert check['matches'][0]['matched_name']=='Restricted matter'
    assert call(crm,'get','/accounts',user='manager')['total']==2
    assert call(crm,'get','/opportunities',user='manager')['total']==0
    assert call(crm,'get',f'/opportunities/{o["id"]}/history',user='manager',expected=404)['code']=='not_found'


def test_role_and_membership_revocation(crm):
    a=account(crm);wall(crm,a)
    call(crm,'patch','/settings',json={'admin_bypasses_walls':False})
    # Creator remains a member, but staff cannot grant themselves CRM roles.
    call(crm,'patch','/users/staff',user='staff',expected=403,json={'role':'admin'})
    call(crm,'get','/admin/audit',user='staff',expected=403)
    call(crm,'delete','/walls/1/members/partner')
    call(crm,'get',f'/accounts/{a["id"]}',user='partner',expected=404)
    with Session(crm[1]) as db:
        db.get(PlatformUser,'partner').firm_id=crm[2][1];db.commit()
    assert call(crm,'get','/context',user='partner')['user']['role']=='staff'
    call(crm,'get',f'/accounts/{a["id"]}',user='partner',expected=404)


def test_lead_conversion_and_won_reopen_idempotency(crm):
    lead=call(crm,'post','/leads',expected=201,json={'first_name':'New','last_name':'Client','company':'Prospect'})
    converted=call(crm,'post',f'/leads/{lead["id"]}/convert',json={'create_opportunity':True})
    call(crm,'post',f'/leads/{lead["id"]}/convert',expected=400,json={'create_opportunity':True})
    oid=converted['opportunity_id']; stages=call(crm,'get','/pipelines')[0]['stages']
    won=next(s for s in stages if s['is_won']);opened=next(s for s in stages if not s['is_won'] and not s['is_lost'])
    call(crm,'post',f'/opportunities/{oid}/stage',expected=400,json={'stage_id':won['id']})
    call(crm,'patch',f'/opportunities/{oid}',json={'engagement_letter_status':'signed'})
    call(crm,'post',f'/opportunities/{oid}/stage',json={'stage_id':won['id']})
    first=call(crm,'get','/engagements')['items'][0]['id']
    call(crm,'post',f'/opportunities/{oid}/reopen',json={'stage_id':opened['id']})
    call(crm,'post',f'/opportunities/{oid}/stage',json={'stage_id':won['id']})
    engagements=call(crm,'get','/engagements')
    assert engagements['total']==1 and engagements['items'][0]['id']==first
    with Session(crm[1]) as db: assert db.scalar(select(Client.id)) is None


def test_clearance_and_waiver_gate(crm):
    a=account(crm);areas=call(crm,'get','/practice-areas');area=next(p for p in areas if p['clearance_type']=='independence')
    o=opportunity(crm,a,practice_area_id=area['id'],engagement_letter_status='signed')
    won=next(s for s in call(crm,'get','/pipelines')[0]['stages'] if s['is_won'])
    call(crm,'post',f'/opportunities/{o["id"]}/stage',expected=400,json={'stage_id':won['id']})
    check=call(crm,'post','/conflict-checks',expected=201,json={'check_type':'independence','opportunity_id':o['id'],'parties':['Acme'],'independence_attestation':{'financial_interest':True}})
    call(crm,'post',f'/conflict-checks/{check["id"]}/resolve',user='manager',expected=403,json={'status':'waived','resolution_note':'Partner consent'})
    call(crm,'post',f'/conflict-checks/{check["id"]}/resolve',user='partner',json={'status':'waived','resolution_note':'Partner documented review'})
    call(crm,'post',f'/opportunities/{o["id"]}/stage',json={'stage_id':won['id']})


def test_explicit_client_sharing_and_permanent_link(crm):
    a=account(crm)
    published=call(crm,'post',f'/accounts/{a["id"]}/shared-client',json={})
    again=call(crm,'post',f'/accounts/{a["id"]}/shared-client',json={})
    assert published['shared_client_id']==again['shared_client_id']
    call(crm,'post','/walls',expected=409,json={'entity_type':'account','entity_id':a['id'],'reason':'Restricted client'})
    call(crm,'patch',f'/accounts/{a["id"]}',json={'name':'Canonical name','industry':'Accounting'})
    cid=uuid.UUID(published['shared_client_id'])
    with Session(crm[1]) as db:
        assert db.get(Client,cid).name=='Canonical name'
        with pytest.raises(Exception) as exc: require_client_unlinked(db,cid)
        assert exc.value.status_code==409
        db.get(Client,cid).name='Renamed elsewhere';db.commit()
    assert call(crm,'get',f'/accounts/{a["id"]}')['name']=='Renamed elsewhere'
    assert 'shared_client_id' in call(crm,'get',f'/accounts/{a["id"]}')
    secret=account(crm,'Secret');wall(crm,secret)
    call(crm,'post',f'/accounts/{secret["id"]}/shared-client',expected=409,json={})
    call(crm,'post',f'/accounts/{a["id"]}/archive')
    with Session(crm[1]) as db: assert db.get(Client,cid) is not None


def test_shared_client_requires_both_permissions(crm):
    a=account(crm)
    call(crm,'post',f'/accounts/{a["id"]}/shared-client',user='staff',expected=403,json={})
    with Session(crm[1]) as db:
        db.get(PlatformUser,'manager').role='viewer';db.commit()
    call(crm,'post',f'/accounts/{a["id"]}/shared-client',user='manager',expected=403,json={})


def test_csv_dry_run_archive_and_campaign(crm):
    raw=b'name,industry\nCSV account,Tax\n'
    result=crm[0].post('/api/firmcrm/import/accounts',files={'file':('accounts.csv',raw,'text/csv')},data={'dry_run':'true'})
    assert result.status_code==200,result.text
    assert call(crm,'get','/accounts')['total']==0
    result=crm[0].post('/api/firmcrm/import/accounts',files={'file':('accounts.csv',raw,'text/csv')},data={'dry_run':'false'})
    assert result.status_code==200,result.text
    assert call(crm,'get','/accounts')['total']==1
    a=call(crm,'get','/accounts')['items'][0]
    contact=call(crm,'post','/contacts',expected=201,json={'first_name':'A','last_name':'B','account_id':a['id']})
    campaign=call(crm,'post','/campaigns',expected=201,json={'name':'Webinar'})
    call(crm,'post',f'/campaigns/{campaign["id"]}/members',expected=201,json={'contact_id':contact['id'],'status':'attended'})
    assert call(crm,'get',f'/campaigns/{campaign["id"]}')['attended_count']==1
    call(crm,'post',f'/accounts/{a["id"]}/archive')
    assert call(crm,'get','/accounts')['total']==0
    call(crm,'post',f'/accounts/{a["id"]}/restore')
    assert call(crm,'get','/accounts')['total']==1


def test_firm_export_and_purge_preserve_other_firms(crm):
    a=account(crm,'First');account(crm,'Second',user='other');wall(crm,a)
    call(crm,'patch','/settings',json={'admin_bypasses_walls':False})
    call(crm,'delete','/walls/1/members/admin')
    with Session(crm[1]) as db:
        snapshot=export_firm_crm(db,crm[2][0],'admin')
        assert snapshot['accounts']==[]
        purge_firm_crm(db,crm[2][0]);db.commit()
        assert db.scalars(select(m.Account.name)).all()==['Second']


@pytest.mark.skipif(not os.getenv('FIRMCRM_TEST_DATABASE_URL'), reason='PostgreSQL concurrency gate')
def test_concurrent_conversion_and_publication(crm):
    from concurrent.futures import ThreadPoolExecutor
    a=account(crm)
    lead=call(crm,'post','/leads',expected=201,json={'first_name':'Concurrent','last_name':'Lead','company':'Unique prospect'})
    def publish(_):
        return crm[0].post(f'/api/firmcrm/accounts/{a["id"]}/shared-client',json={})
    def convert(_):
        return crm[0].post(f'/api/firmcrm/leads/{lead["id"]}/convert',json={'create_opportunity':True})
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses=list(pool.map(publish,range(2)))
        assert [r.status_code for r in responses]==[200,200]
        assert responses[0].json()['shared_client_id']==responses[1].json()['shared_client_id']
        responses=list(pool.map(convert,range(2)))
        assert sorted(r.status_code for r in responses)==[200,400]
    assert call(crm,'get','/engagements')['total']==0


def test_lead_funnel_only_counts_opportunities_from_the_lead_cohort(crm):
    a = account(crm)
    direct = opportunity(crm, a, engagement_letter_status='signed')
    stages = call(crm, 'get', '/pipelines')[0]['stages']
    won = next(stage['id'] for stage in stages if stage['is_won'])
    call(crm, 'post', f"/opportunities/{direct['id']}/stage", json={'stage_id': won})
    lead = call(crm, 'post', '/leads', expected=201, json={'first_name': 'QA', 'last_name': 'Funnel', 'source': 'web'})
    converted = call(crm, 'post', f"/leads/{lead['id']}/convert", json={'existing_account_id': a['id'], 'create_opportunity': True})
    report = call(crm, 'get', '/reports/funnel')
    assert (report['leads'], report['converted'], report['opportunities'], report['won']) == (1, 1, 1, 0)
    opp_id = converted['opportunity_id']
    call(crm, 'patch', f'/opportunities/{opp_id}', json={'engagement_letter_status': 'signed'})
    call(crm, 'post', f'/opportunities/{opp_id}/stage', json={'stage_id': won})
    report = call(crm, 'get', '/reports/funnel')
    assert report['won'] == 1
    assert sum(row['won'] for row in report['by_source']) == report['won']


def test_import_history_timestamps_include_utc_offset(crm):
    from datetime import datetime, timedelta

    job = call(crm, 'post', '/import/contacts', files={'file': ('qa.csv', b'first_name,last_name,email\nQA,Import,qa@example.com\n', 'text/csv')}, data={'dry_run': 'true'})
    history = call(crm, 'get', '/import/jobs')['items']
    for value in [job['created_at'], history[0]['created_at']]:
        assert datetime.fromisoformat(value).utcoffset() == timedelta(0)


def test_dashboard_task_dates_match_activity_dates(crm):
    a = account(crm)
    task = call(crm, 'post', '/activities', expected=201, json={'kind': 'task', 'subject': 'QA due date', 'account_id': a['id'], 'due_at': '2026-09-10T00:00:00Z'})
    dashboard = call(crm, 'get', '/reports/dashboard')
    shown = next(row for row in dashboard['my_tasks'] if row['id'] == task['id'])
    assert shown['due_at'] == task['due_at']
    assert shown['due_at'].endswith('+00:00')
