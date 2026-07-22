from __future__ import annotations

import os
import uuid

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "sqlite://")

from models.db_models import ConnectorConnection
from routes.connector import _find_existing_connection


def _connection(user_id: str, service: str, connection_name: str) -> ConnectorConnection:
    return ConnectorConnection(
        id=uuid.uuid4(),
        user_id=user_id,
        service=service,
        connection_name=connection_name,
        label=None,
        auth_type="api_key",
        status="active",
    )


def test_default_alias_can_be_reused_across_services() -> None:
    engine = create_engine("sqlite://")
    ConnectorConnection.__table__.create(engine)

    user_id = "firebase-user"
    alias = f"u_{user_id}"
    with Session(engine) as db:
        db.add(_connection(user_id, "linear", alias))
        db.commit()

        assert _find_existing_connection(db, user_id, "aws-s3", None) is None

        db.add(_connection(user_id, "aws-s3", alias))
        db.commit()

        services = {
            row.service
            for row in db.query(ConnectorConnection)
            .filter(ConnectorConnection.user_id == user_id)
            .all()
        }
        assert services == {"linear", "aws-s3"}


def test_existing_connection_is_scoped_by_service() -> None:
    engine = create_engine("sqlite://")
    ConnectorConnection.__table__.create(engine)

    user_id = "firebase-user"
    with Session(engine) as db:
        linear = _connection(user_id, "linear", f"u_{user_id}")
        db.add(linear)
        db.commit()

        assert _find_existing_connection(db, user_id, "linear", None).id == linear.id
        assert _find_existing_connection(db, user_id, "aws-s3", None) is None
