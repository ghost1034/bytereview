"""Run retained source business rules through the integrated router and membership policy."""
import uuid
import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import Session
from models.db_models import Base, Firm, User as PlatformUser, Client
from firmcrm import models as m
from firmcrm.core.db import CrmSession, get_db, refresh_visibility
from firmcrm.provisioning import provision
from firmcrm.router import router
from .seed import seed_demo


def login(client, email='admin@demo.firm'):
    return {'X-Test-User': email}


@pytest.fixture(scope='module')
def client():
    engine = create_engine('sqlite://', poolclass=StaticPool, connect_args={'check_same_thread': False})
    @event.listens_for(engine, 'connect')
    def configure(connection, _):
        connection.isolation_level = None
        connection.execute('PRAGMA foreign_keys=ON')
    @event.listens_for(engine, 'begin')
    def begin(connection):
        connection.exec_driver_sql('BEGIN')
    Base.metadata.create_all(engine, tables=[Firm.__table__, PlatformUser.__table__, Client.__table__] + [model.__table__ for model in m.CRM_MODELS])
    firm = uuid.uuid4()
    with Session(engine) as db:
        db.add(Firm(id=firm, name='Source fixture firm'))
        db.commit()
    with CrmSession(engine, info={'firm_id': firm}) as db:
        seed_demo(db)
    def database(request: Request):
        with CrmSession(engine, expire_on_commit=False, info={'firm_id': firm}) as db:
            actor, settings = provision(db, request.headers.get('X-Test-User', 'admin@demo.firm'))
            if request.method == 'GET':
                db.commit()
            actor._settings = settings
            db.info.update(actor=actor, settings=settings)
            refresh_visibility(db)
            yield db
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = database
    with TestClient(app) as client:
        yield client
    engine.dispose()


@pytest.fixture(scope='module')
def admin(client):
    return login(client)
