"""Vendored PageIndex OSS tree generation patched to use Vertex AI."""

from __future__ import annotations

import asyncio
import importlib
import os
import sys
import threading
from pathlib import Path
from typing import Any

from inkwise.settings import get_inkwise_settings
from inkwise.services.vertex_ai import VertexAIError, generate_text, generate_text_sync


class PageIndexOssTreeGenError(RuntimeError):
    pass


_PATCHED_MODEL: str | None = None


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        direct = parent / "vendor" / "pageindex" / "pageindex"
        if direct.is_dir():
            return parent
    raise PageIndexOssTreeGenError(
        "could not locate vendored PageIndex; ensure vendor/pageindex is present or set INKWISE_PAGEINDEX_VENDOR_ROOT"
    )


def _vendor_root() -> Path:
    raw_override = (os.getenv("INKWISE_PAGEINDEX_VENDOR_ROOT") or "").strip()
    override = Path(raw_override).expanduser().resolve() if raw_override else None
    if override is not None:
        if (override / "pageindex").is_dir():
            return override
        raise PageIndexOssTreeGenError(
            "INKWISE_PAGEINDEX_VENDOR_ROOT is set but invalid; expected a directory containing pageindex/"
        )
    return _repo_root() / "vendor" / "pageindex"


def _ensure_vendor_on_syspath() -> None:
    vendor_root = _vendor_root()
    if str(vendor_root) not in sys.path:
        sys.path.insert(0, str(vendor_root))


def _patch_vendor_for_vertex(*, model: str) -> None:
    global _PATCHED_MODEL
    if _PATCHED_MODEL == model:
        return

    _ensure_vendor_on_syspath()

    pi_utils = importlib.import_module("pageindex.utils")  # type: ignore
    pi_page_index_mod = importlib.import_module("pageindex.page_index")  # type: ignore

    def _messages_to_prompt(chat_history: list[dict[str, str]] | None, prompt: str) -> str:
        if not chat_history:
            return prompt
        parts: list[str] = []
        for message in chat_history:
            role = (message.get("role") or "user").strip().lower()
            content = message.get("content") or ""
            label = "Assistant" if role == "assistant" else "User"
            parts.append(f"{label}:\n{content}")
        parts.append(f"User:\n{prompt}")
        return "\n\n".join(parts)

    def count_tokens(text: str, model_name: str | None = None, **kwargs: Any) -> int:
        if not text:
            return 0
        return max(1, (len(text) + 3) // 4)

    async def ChatGPT_API_async(
        model_name: str | None = None,
        prompt: str | None = None,
        api_key: str | None = None,
        **kwargs: Any,
    ):
        resolved_prompt = prompt if prompt is not None else kwargs.get("prompt")
        if not isinstance(resolved_prompt, str):
            raise PageIndexOssTreeGenError("PageIndex ChatGPT_API_async missing prompt")
        try:
            res = await generate_text(
                model=model,
                prompt=resolved_prompt,
                temperature=0.0,
                timeout_seconds=120,
            )
            return res.text
        except VertexAIError as exc:
            raise PageIndexOssTreeGenError(str(exc)) from exc

    def ChatGPT_API(
        model_name: str | None = None,
        prompt: str | None = None,
        api_key: str | None = None,
        chat_history=None,
        **kwargs: Any,
    ):
        resolved_prompt = prompt if prompt is not None else kwargs.get("prompt")
        resolved_history = chat_history if chat_history is not None else kwargs.get("chat_history")
        if not isinstance(resolved_prompt, str):
            raise PageIndexOssTreeGenError("PageIndex ChatGPT_API missing prompt")
        merged = _messages_to_prompt(resolved_history, resolved_prompt)
        try:
            res = generate_text_sync(
                model=model,
                prompt=merged,
                temperature=0.0,
                max_output_tokens=65536,
            )
        except VertexAIError as exc:
            raise PageIndexOssTreeGenError(str(exc)) from exc
        return res.text

    def ChatGPT_API_with_finish_reason(
        model_name: str | None = None,
        prompt: str | None = None,
        api_key: str | None = None,
        chat_history=None,
        **kwargs: Any,
    ):
        resolved_prompt = prompt if prompt is not None else kwargs.get("prompt")
        resolved_history = chat_history if chat_history is not None else kwargs.get("chat_history")
        if not isinstance(resolved_prompt, str):
            raise PageIndexOssTreeGenError("PageIndex ChatGPT_API_with_finish_reason missing prompt")
        merged = _messages_to_prompt(resolved_history, resolved_prompt)
        try:
            res = generate_text_sync(
                model=model,
                prompt=merged,
                temperature=0.0,
                max_output_tokens=65536,
            )
        except VertexAIError as exc:
            raise PageIndexOssTreeGenError(str(exc)) from exc
        if (res.finish_reason or "").upper() == "MAX_TOKENS":
            return res.text, "max_output_reached"
        return res.text, "finished"

    for mod in (pi_utils, pi_page_index_mod):
        mod.count_tokens = count_tokens  # type: ignore[attr-defined]
        mod.ChatGPT_API_async = ChatGPT_API_async  # type: ignore[attr-defined]
        mod.ChatGPT_API = ChatGPT_API  # type: ignore[attr-defined]
        mod.ChatGPT_API_with_finish_reason = ChatGPT_API_with_finish_reason  # type: ignore[attr-defined]

    try:
        pi_md_mod = importlib.import_module("pageindex.page_index_md")  # type: ignore
        for name, fn in {
            "count_tokens": count_tokens,
            "ChatGPT_API_async": ChatGPT_API_async,
            "ChatGPT_API": ChatGPT_API,
            "ChatGPT_API_with_finish_reason": ChatGPT_API_with_finish_reason,
        }.items():
            setattr(pi_md_mod, name, fn)
    except Exception:
        pass

    if getattr(pi_page_index_mod, "ChatGPT_API", None) is not ChatGPT_API:
        raise PageIndexOssTreeGenError(
            "failed to patch PageIndex OSS ChatGPT_API hooks; refusing to call provider fallback"
        )

    _PATCHED_MODEL = model


def _run_page_index(
    *,
    pdf_path: str,
    toc_check_pages: int,
    max_pages_per_node: int,
    max_tokens_per_node: int,
    add_node_summary: bool,
) -> dict[str, Any]:
    from pageindex.page_index import page_index as page_index_fn  # type: ignore

    out = page_index_fn(
        pdf_path,
        model="gpt-4o",
        toc_check_page_num=toc_check_pages,
        max_page_num_each_node=max_pages_per_node,
        max_token_num_each_node=max_tokens_per_node,
        if_add_node_id="yes",
        if_add_node_summary="yes" if add_node_summary else "no",
        if_add_doc_description="no",
        if_add_node_text="no",
    )
    if not isinstance(out, dict):
        raise PageIndexOssTreeGenError("vendor treegen returned unexpected type")
    if "structure" not in out:
        raise PageIndexOssTreeGenError("vendor treegen missing structure")
    return out


def _run_page_index_in_fresh_thread(**kwargs: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    error: dict[str, BaseException] = {}

    def _target() -> None:
        try:
            result["value"] = _run_page_index(**kwargs)
        except BaseException as exc:  # pragma: no cover - passes through vendor/runtime errors
            error["value"] = exc

    thread = threading.Thread(target=_target, daemon=True)
    thread.start()
    thread.join()

    if "value" in error:
        raise error["value"]
    return result["value"]


async def generate_tree(
    *,
    pdf_path: str,
    model: str | None = None,
    toc_check_pages: int = 20,
    max_pages_per_node: int = 10,
    max_tokens_per_node: int = 20000,
    add_node_summary: bool = True,
) -> dict[str, Any]:
    settings = get_inkwise_settings()
    resolved_model = model or settings.treegen_model

    if not settings.vertex_enabled:
        raise PageIndexOssTreeGenError("Vertex AI is not configured for Inkwise tree generation")

    _patch_vendor_for_vertex(model=resolved_model)
    _ensure_vendor_on_syspath()

    return await asyncio.to_thread(
        _run_page_index,
        pdf_path=pdf_path,
        toc_check_pages=toc_check_pages,
        max_pages_per_node=max_pages_per_node,
        max_tokens_per_node=max_tokens_per_node,
        add_node_summary=add_node_summary,
    )


def generate_tree_sync(
    *,
    pdf_path: str,
    model: str | None = None,
    toc_check_pages: int = 20,
    max_pages_per_node: int = 10,
    max_tokens_per_node: int = 20000,
    add_node_summary: bool = True,
) -> dict[str, Any]:
    settings = get_inkwise_settings()
    resolved_model = model or settings.treegen_model

    if not settings.vertex_enabled:
        raise PageIndexOssTreeGenError("Vertex AI is not configured for Inkwise tree generation")

    _patch_vendor_for_vertex(model=resolved_model)
    _ensure_vendor_on_syspath()

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return _run_page_index(
            pdf_path=pdf_path,
            toc_check_pages=toc_check_pages,
            max_pages_per_node=max_pages_per_node,
            max_tokens_per_node=max_tokens_per_node,
            add_node_summary=add_node_summary,
        )

    return _run_page_index_in_fresh_thread(
        pdf_path=pdf_path,
        toc_check_pages=toc_check_pages,
        max_pages_per_node=max_pages_per_node,
        max_tokens_per_node=max_tokens_per_node,
        add_node_summary=add_node_summary,
    )
