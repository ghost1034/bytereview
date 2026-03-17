"""Chat helpers for the Inkwise module."""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from models.inkwise_models import InkwiseChatMessage, InkwiseChatThread, InkwiseDocument


_EVIDENCE_ID_RE = re.compile(r"\[(E\d{2})\]")
_WHITESPACE_RE = re.compile(r"[ \t]+")
_BLANK_LINES_RE = re.compile(r"\n{3,}")
_SPACE_BEFORE_PUNCT_RE = re.compile(r"\s+([,.;:!?])")
_HISTORY_ROLE_LABELS = {
    "assistant": "Assistant",
    "system": "System",
    "user": "User",
}


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
        citations: list[dict],
        retrieval_run_id: uuid.UUID | None,
        provider: str,
        provider_meta: dict,
    ) -> InkwiseChatMessage:
        message = InkwiseChatMessage(
            thread_id=thread_id,
            role="assistant",
            content=content.strip(),
            content_with_citations=content.strip(),
            citations_json={
                "retrieval_run_id": str(retrieval_run_id) if retrieval_run_id is not None else None,
                "citations": citations,
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
    evidence_by_id = {item.evidence_id: item for item in evidence}
    cited_ids: list[str] = []
    for match in _EVIDENCE_ID_RE.finditer(assistant_text or ""):
        evidence_id = match.group(1)
        if evidence_id in evidence_by_id and evidence_id not in cited_ids:
            cited_ids.append(evidence_id)

    citations: list[dict] = []
    for evidence_id in cited_ids:
        item = evidence_by_id[evidence_id]
        citations.append(
            {
                "evidence_id": evidence_id,
                "source_id": str(item.source_id),
                "source_title": item.source_title,
                "page_number": item.page_number,
                "segment_id": str(item.segment_id) if item.segment_id is not None else None,
                "segment_title": item.segment_title,
                "node_id": item.node_id,
                "node_title": item.node_title,
                "locator_json": item.locator_json,
                "preview_bucket": item.preview_bucket,
                "preview_object": item.preview_object,
                "excerpt": item.excerpt,
            }
        )
    return citations
