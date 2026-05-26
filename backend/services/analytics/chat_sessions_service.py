"""CRUD service for chat_sessions (IRS / GAAP research + AI assistant)."""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from models.db_models import ChatSession


def list_sessions(
    db: Session,
    firm_id,
    user_id: str,
    bot_type: Optional[str] = None,
) -> List[ChatSession]:
    q = db.query(ChatSession).filter(
        ChatSession.firm_id == firm_id,
        ChatSession.user_id == user_id,
    )
    if bot_type:
        q = q.filter(ChatSession.bot_type == bot_type)
    return q.order_by(ChatSession.updated_at.desc()).all()


def get_session(db: Session, firm_id, user_id: str, session_id: str) -> ChatSession:
    row = (
        db.query(ChatSession)
        .filter(
            ChatSession.id == session_id,
            ChatSession.firm_id == firm_id,
            ChatSession.user_id == user_id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return row


def _serialize_messages(messages) -> List[Dict[str, Any]]:
    if messages is None:
        return []
    out: List[Dict[str, Any]] = []
    for m in messages:
        if isinstance(m, dict):
            out.append({"role": m.get("role"), "content": m.get("content")})
        else:
            out.append({"role": getattr(m, "role", None), "content": getattr(m, "content", None)})
    return out


def create_session(
    db: Session,
    firm_id,
    user_id: str,
    *,
    bot_type: str,
    title: Optional[str] = None,
    client_id: Optional[str] = None,
    messages: Optional[List[Any]] = None,
) -> ChatSession:
    row = ChatSession(
        id=uuid.uuid4(),
        firm_id=firm_id,
        user_id=user_id,
        client_id=client_id,
        bot_type=bot_type,
        title=title,
        messages=_serialize_messages(messages or []),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_session(
    db: Session,
    firm_id,
    user_id: str,
    session_id: str,
    *,
    title: Optional[str] = None,
    client_id: Optional[str] = None,
    messages: Optional[List[Any]] = None,
) -> ChatSession:
    row = get_session(db, firm_id, user_id, session_id)
    if title is not None:
        row.title = title
    if client_id is not None:
        row.client_id = client_id
    if messages is not None:
        row.messages = _serialize_messages(messages)
        flag_modified(row, "messages")
    db.commit()
    db.refresh(row)
    return row


def append_messages(
    db: Session,
    firm_id,
    user_id: str,
    session_id: str,
    new_messages: List[Dict[str, Any]],
) -> ChatSession:
    row = get_session(db, firm_id, user_id, session_id)
    current = list(row.messages or [])
    current.extend(_serialize_messages(new_messages))
    row.messages = current
    flag_modified(row, "messages")
    db.commit()
    db.refresh(row)
    return row


def delete_session(db: Session, firm_id, user_id: str, session_id: str) -> None:
    row = get_session(db, firm_id, user_id, session_id)
    db.delete(row)
    db.commit()
