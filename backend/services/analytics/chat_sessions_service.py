"""CRUD service for chat_sessions (IRS / GAAP research + AI assistant)."""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from models.db_models import ChatSession

# Cap stored document text to keep chat_sessions rows reasonable. Mirrors the
# ~800 KB-per-document truncation the original CPAAnalytics ResearchBot applied
# before persisting to Firestore.
_MAX_DOC_TEXT_CHARS = 800_000
_TRUNCATION_NOTE = "\n\n[TEXT TRUNCATED DUE TO SIZE LIMIT]"


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


def _serialize_docs(docs) -> List[Dict[str, Any]]:
    """Normalize uploaded documents to plain dicts, truncating oversized text."""
    if not docs:
        return []
    out: List[Dict[str, Any]] = []
    for d in docs:
        if isinstance(d, dict):
            get = d.get
        else:
            get = lambda k, default=None, _d=d: getattr(_d, k, default)
        text = get("text") or ""
        if len(text) > _MAX_DOC_TEXT_CHARS:
            text = text[:_MAX_DOC_TEXT_CHARS] + _TRUNCATION_NOTE
        out.append(
            {
                "id": get("id"),
                "name": get("name"),
                "text": text,
                "summary": get("summary"),
                "extracted_data": get("extracted_data") if get("extracted_data") is not None else get("extractedData"),
            }
        )
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
    uploaded_docs: Optional[List[Any]] = None,
) -> ChatSession:
    row = ChatSession(
        id=uuid.uuid4(),
        firm_id=firm_id,
        user_id=user_id,
        client_id=client_id,
        bot_type=bot_type,
        title=title,
        messages=_serialize_messages(messages or []),
        uploaded_docs=_serialize_docs(uploaded_docs or []),
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
    uploaded_docs: Optional[List[Any]] = None,
) -> ChatSession:
    row = get_session(db, firm_id, user_id, session_id)
    if title is not None:
        row.title = title
    if client_id is not None:
        row.client_id = client_id
    if messages is not None:
        row.messages = _serialize_messages(messages)
        flag_modified(row, "messages")
    if uploaded_docs is not None:
        row.uploaded_docs = _serialize_docs(uploaded_docs)
        flag_modified(row, "uploaded_docs")
    db.commit()
    db.refresh(row)
    return row


def append_messages(
    db: Session,
    firm_id,
    user_id: str,
    session_id: str,
    new_messages: List[Dict[str, Any]],
    uploaded_docs: Optional[List[Any]] = None,
) -> ChatSession:
    row = get_session(db, firm_id, user_id, session_id)
    current = list(row.messages or [])
    current.extend(_serialize_messages(new_messages))
    row.messages = current
    flag_modified(row, "messages")
    if uploaded_docs is not None:
        row.uploaded_docs = _serialize_docs(uploaded_docs)
        flag_modified(row, "uploaded_docs")
    db.commit()
    db.refresh(row)
    return row


def delete_session(db: Session, firm_id, user_id: str, session_id: str) -> None:
    row = get_session(db, firm_id, user_id, session_id)
    db.delete(row)
    db.commit()
