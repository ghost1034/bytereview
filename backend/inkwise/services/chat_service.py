"""Chat helpers for the Inkwise module."""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from inkwise.services.citation_text import parse_citation_text
from models.inkwise_models import InkwiseChatMessage, InkwiseChatThread, InkwiseDocument


_EVIDENCE_ID_RE = re.compile(r"\[(E\d{2})\]")
_WHITESPACE_RE = re.compile(r"[ \t]+")
_BLANK_LINES_RE = re.compile(r"\n{3,}")
_SPACE_BEFORE_PUNCT_RE = re.compile(r"\s+([,.;:!?])")
_THREAD_TITLE_EDGE_RE = re.compile(r"^[\s\-:;,.!?\'\"`]+|[\s\-:;,.!?\'\"`]+$")
_HISTORY_ROLE_LABELS = {
    "assistant": "Assistant",
    "system": "System",
    "user": "User",
}


def normalize_thread_title_candidate(value: str | None) -> str | None:
    raw = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    if not raw:
        return None
    raw = _THREAD_TITLE_EDGE_RE.sub("", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    if not raw:
        return None
    if len(raw) > 80:
        raw = raw[:80].rsplit(" ", 1)[0].strip() or raw[:80].strip()
    return raw[:200] or None


def build_thread_title_prompt(*, document: InkwiseDocument, user_message: str) -> str:
    parts = [
        "You name Inkwise chat threads.",
        "Return only the title text.",
        "Write a short, specific title that captures the main topic of the user's request.",
        "Prefer 2 to 6 words when possible.",
        "Do not use quotes, markdown, trailing punctuation, or generic labels like Chat or Thread.",
    ]
    if getattr(document, "title", None):
        parts.append(f"Document title: {document.title}")
    if getattr(document, "init_prompt", None):
        parts.append(f"Document guidance: {document.init_prompt}")
    parts.append("User message:")
    parts.append(user_message.strip()[:2000])
    return "\n".join(parts).strip() + "\n"


class InkwiseChatService:
    def get_document_or_404(self, db: Session, *, user_id: str, document_id: uuid.UUID) -> InkwiseDocument:
        document = (
            db.query(InkwiseDocument)
            .filter(InkwiseDocument.id == document_id, InkwiseDocument.user_id == user_id)
            .first()
        )
        if document is None:
            raise FileNotFoundError("Document not found")
        return document

    def get_thread_or_404(self, db: Session, *, user_id: str, thread_id: uuid.UUID) -> InkwiseChatThread:
        thread = (
            db.query(InkwiseChatThread)
            .filter(InkwiseChatThread.id == thread_id, InkwiseChatThread.user_id == user_id)
            .first()
        )
        if thread is None:
            raise FileNotFoundError("Thread not found")
        return thread

    def list_threads(
        self,
        db: Session,
        *,
        user_id: str,
        document_id: uuid.UUID | None = None,
        limit: int = 100,
    ) -> list[InkwiseChatThread]:
        query = db.query(InkwiseChatThread).filter(InkwiseChatThread.user_id == user_id)
        if document_id is not None:
            query = query.filter(InkwiseChatThread.document_id == document_id)
        return query.order_by(InkwiseChatThread.created_at.desc()).limit(limit).all()

    def create_thread(
        self,
        db: Session,
        *,
        user_id: str,
        document_id: uuid.UUID,
        title: str | None,
    ) -> InkwiseChatThread:
        self.get_document_or_404(db, user_id=user_id, document_id=document_id)
        thread = InkwiseChatThread(
            user_id=user_id,
            document_id=document_id,
            title=(title or "").strip()[:200] or None,
            mode="grounded",
            created_at=datetime.utcnow(),
        )
        db.add(thread)
        db.commit()
        db.refresh(thread)
        return thread

    def update_thread_title(
        self,
        db: Session,
        *,
        thread: InkwiseChatThread,
        title: str,
    ) -> InkwiseChatThread:
        normalized = normalize_thread_title_candidate(title)
        if not normalized:
            return thread
        thread.title = normalized
        db.add(thread)
        db.commit()
        db.refresh(thread)
        return thread

    def delete_thread(self, db: Session, *, user_id: str, thread_id: uuid.UUID) -> None:
        thread = self.get_thread_or_404(db, user_id=user_id, thread_id=thread_id)
        db.delete(thread)
        db.commit()

    def list_messages(
        self,
        db: Session,
        *,
        user_id: str,
        thread_id: uuid.UUID,
        page: int,
        limit: int,
    ) -> tuple[list[InkwiseChatMessage], int]:
        if page < 1 or limit < 1 or limit > 100:
            raise ValueError("Invalid pagination")
        self.get_thread_or_404(db, user_id=user_id, thread_id=thread_id)
        query = db.query(InkwiseChatMessage).filter(InkwiseChatMessage.thread_id == thread_id)
        total = query.count()
        items = (
            query.order_by(InkwiseChatMessage.created_at.asc())
            .offset((page - 1) * limit)
            .limit(limit)
            .all()
        )
        return items, total

    def get_message_or_404(
        self,
        db: Session,
        *,
        user_id: str,
        thread_id: uuid.UUID,
        message_id: uuid.UUID,
    ) -> InkwiseChatMessage:
        self.get_thread_or_404(db, user_id=user_id, thread_id=thread_id)
        message = (
            db.query(InkwiseChatMessage)
            .filter(
                InkwiseChatMessage.id == message_id,
                InkwiseChatMessage.thread_id == thread_id,
            )
            .first()
        )
        if message is None:
            raise FileNotFoundError("Message not found")
        return message

    def list_recent_history(
        self,
        db: Session,
        *,
        thread_id: uuid.UUID,
        exclude_message_id: uuid.UUID | None = None,
        limit: int = 12,
    ) -> list[dict[str, str]]:
        query = db.query(InkwiseChatMessage.role, InkwiseChatMessage.content).filter(InkwiseChatMessage.thread_id == thread_id)
        if exclude_message_id is not None:
            query = query.filter(InkwiseChatMessage.id != exclude_message_id)
        rows = query.order_by(InkwiseChatMessage.created_at.desc()).limit(limit).all()
        rows.reverse()
        return [
            {"role": str(role), "content": str(content)}
            for role, content in rows
            if str(role).strip() and str(content).strip()
        ]

    def list_recent_history_before_message(
        self,
        db: Session,
        *,
        thread_id: uuid.UUID,
        before_message_id: uuid.UUID,
        exclude_message_id: uuid.UUID | None = None,
        limit: int = 12,
    ) -> list[dict[str, str]]:
        before_message = db.query(InkwiseChatMessage).filter(InkwiseChatMessage.id == before_message_id).first()
        if before_message is None:
            return []
        query = db.query(InkwiseChatMessage.role, InkwiseChatMessage.content).filter(
            InkwiseChatMessage.thread_id == thread_id,
            InkwiseChatMessage.created_at < before_message.created_at,
        )
        if exclude_message_id is not None:
            query = query.filter(InkwiseChatMessage.id != exclude_message_id)
        rows = query.order_by(InkwiseChatMessage.created_at.desc()).limit(limit).all()
        rows.reverse()
        return [
            {"role": str(role), "content": str(content)}
            for role, content in rows
            if str(role).strip() and str(content).strip()
        ]

    def find_reply_source_message(
        self,
        db: Session,
        *,
        thread_id: uuid.UUID,
        assistant_message_id: uuid.UUID,
    ) -> InkwiseChatMessage | None:
        assistant_message = db.query(InkwiseChatMessage).filter(InkwiseChatMessage.id == assistant_message_id).first()
        if assistant_message is None:
            return None
        provider_meta = assistant_message.provider_meta or {}
        reply_to_message_id = provider_meta.get("reply_to_message_id") if isinstance(provider_meta, dict) else None
        if reply_to_message_id:
            linked = db.query(InkwiseChatMessage).filter(InkwiseChatMessage.id == reply_to_message_id).first()
            if linked is not None:
                return linked
        return (
            db.query(InkwiseChatMessage)
            .filter(
                InkwiseChatMessage.thread_id == thread_id,
                InkwiseChatMessage.role == "user",
                InkwiseChatMessage.created_at < assistant_message.created_at,
            )
            .order_by(InkwiseChatMessage.created_at.desc())
            .first()
        )

    def create_user_message(
        self,
        db: Session,
        *,
        thread_id: uuid.UUID,
        content: str,
        scoped_source_ids: list[uuid.UUID],
        draft_selection_label: str | None,
        draft_selection_text: str | None,
        draft_selection_truncated: bool,
    ) -> InkwiseChatMessage:
        message = InkwiseChatMessage(
            thread_id=thread_id,
            role="user",
            content=content,
            provider="inkwise",
            provider_meta={
                "scoped_source_ids": [str(source_id) for source_id in scoped_source_ids],
                "draft_selection_label": draft_selection_label,
                "draft_selection_text": draft_selection_text,
                "draft_selection_truncated": bool(draft_selection_truncated),
                "draft_selection_chars": len(draft_selection_text) if draft_selection_text else 0,
            },
            created_at=datetime.utcnow(),
        )
        db.add(message)
        db.commit()
        db.refresh(message)
        return message

    def create_assistant_message(
        self,
        db: Session,
        *,
        thread_id: uuid.UUID,
        content: str,
        content_with_citations: str | None,
        citations: list[dict],
        segments: list[dict] | None,
        retrieval_run_id: uuid.UUID | None,
        provider: str,
        provider_meta: dict,
    ) -> InkwiseChatMessage:
        provider_meta = dict(provider_meta or {})
        message = InkwiseChatMessage(
            thread_id=thread_id,
            role="assistant",
            content=content.strip(),
            content_with_citations=(content_with_citations or content).strip(),
            citations_json={
                "retrieval_run_id": str(retrieval_run_id) if retrieval_run_id is not None else None,
                "citations": citations,
                "segments": list(segments or []),
            },
            provider=provider,
            provider_meta=provider_meta,
            created_at=datetime.utcnow(),
        )
        db.add(message)
        db.commit()
        db.refresh(message)
        return message


def wants_verbatim_quotes(user_text: str) -> bool:
    text_value = (user_text or "").lower()
    return any(
        marker in text_value
        for marker in (
            "exact text",
            "verbatim",
            "quote",
            "quoted",
            "word-for-word",
            "word for word",
        )
    )


def truncate_text(value: str, max_chars: int) -> tuple[str, bool]:
    if max_chars <= 0:
        return "", True
    if len(value) <= max_chars:
        return value, False
    return value[:max_chars], True


def prepare_grounded_chat_history(
    *,
    history_messages: list[dict[str, str]] | None,
    max_messages: int,
    max_chars: int,
) -> tuple[list[dict[str, str]], dict[str, int | bool]]:
    if not history_messages or max_messages <= 0 or max_chars <= 0:
        return [], {"message_count": 0, "char_count": 0, "truncated": False}

    sanitized: list[dict[str, str]] = []
    for message in history_messages:
        role = str(message.get("role") or "").strip().lower()
        if role not in _HISTORY_ROLE_LABELS:
            continue
        content = str(message.get("content") or "").replace("\r\n", "\n").strip()
        if not content:
            continue
        if role == "assistant":
            content = _EVIDENCE_ID_RE.sub("", content)
        content = _WHITESPACE_RE.sub(" ", content)
        content = _SPACE_BEFORE_PUNCT_RE.sub(r"\1", content)
        content = _BLANK_LINES_RE.sub("\n\n", content).strip()
        if not content:
            continue
        sanitized.append({"role": role, "content": content})

    if not sanitized:
        return [], {"message_count": 0, "char_count": 0, "truncated": False}

    window = sanitized[-int(max_messages) :]
    selected_reversed: list[dict[str, str]] = []
    used_chars = 0
    truncated = len(window) < len(sanitized)

    for message in reversed(window):
        content = message["content"]
        message_chars = len(content)
        if selected_reversed and used_chars + message_chars > max_chars:
            truncated = True
            break
        if not selected_reversed and message_chars > max_chars:
            truncated_content, was_truncated = truncate_text(content, max_chars)
            if not truncated_content:
                truncated = True
                break
            selected_reversed.append({"role": message["role"], "content": truncated_content.rstrip()})
            used_chars += len(truncated_content)
            truncated = truncated or was_truncated
            break

        selected_reversed.append(message)
        used_chars += message_chars

    selected = list(reversed(selected_reversed))
    return selected, {
        "message_count": len(selected),
        "char_count": used_chars,
        "truncated": truncated,
    }


def format_grounded_chat_history(history_messages: list[dict[str, str]] | None) -> str:
    if not history_messages:
        return ""

    rendered: list[str] = []
    for message in history_messages:
        role = _HISTORY_ROLE_LABELS.get(str(message.get("role") or "").strip().lower())
        content = str(message.get("content") or "").strip()
        if not role or not content:
            continue
        rendered.append(f"{role}:\n{content}")

    if not rendered:
        return ""
    return "Recent thread history (context only; not evidence):\n" + "\n\n".join(rendered)


def build_grounded_chat_prompt(
    *,
    question: str,
    document: InkwiseDocument,
    evidence_pack: str,
    allowed_ids: list[str],
    draft_selection_text: str | None,
    history_messages: list[dict[str, str]] | None = None,
) -> str:
    history_block = format_grounded_chat_history(history_messages)
    document_language = getattr(document, "language", None)
    document_purpose = getattr(document, "init_prompt", None)
    parts = [
        "You are Inkwise, a writing assistant.",
        f"Document language: {document_language}" if document_language else "",
        f"Document purpose: {document_purpose}" if document_purpose else "",
        (
            "Draft excerpt (context only; do not cite this):\n```\n"
            + draft_selection_text
            + "\n```"
            if draft_selection_text
            else ""
        ),
        history_block,
        (
            "Use the recent thread history only to maintain continuity and resolve references. "
            "If it conflicts with the evidence below, follow the evidence."
            if history_block
            else ""
        ),
        "Answer the user using ONLY the evidence blocks provided.",
        "If the evidence is insufficient, say what is missing and ask a clarifying question.",
        "Each evidence block includes modality and segment_type metadata.",
        "If multiple evidence blocks overlap or say the same thing, cite the single most specific block.",
        "Avoid citing duplicate support from different modalities unless both are necessary.",
        (
            "If the user requests exact text or verbatim quotes, quote the exact wording visible in the evidence excerpts."
            if wants_verbatim_quotes(question)
            else ""
        ),
        "Citation rules:",
        "- Cite evidence IDs in square brackets like [E01].",
        f"- Only cite from: {', '.join(allowed_ids)}",
        "- Never cite an ID not in the evidence.",
        "- Do not cite the draft excerpt.",
        "- Do not cite the recent thread history or reuse citation markers that appeared there.",
        f"User question: {question}",
        "Evidence:",
        evidence_pack,
    ]
    return "\n".join([part for part in parts if part]).strip() + "\n"


def extract_citations(*, assistant_text: str, evidence: list) -> list[dict]:
    return parse_citation_text(text=assistant_text, evidence=evidence).citations
