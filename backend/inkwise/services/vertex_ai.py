"""Shared Vertex AI helpers for the Inkwise module."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from google import genai
from google.genai import types

from inkwise.settings import get_inkwise_settings

logger = logging.getLogger(__name__)


class VertexAIError(RuntimeError):
    pass


class VertexAIConfigError(VertexAIError):
    pass


@dataclass(frozen=True)
class VertexAITextResult:
    text: str
    finish_reason: str | None
    raw: Any


def _require_project_id(project_id: str | None) -> str:
    if project_id:
        return project_id
    settings = get_inkwise_settings()
    if settings.project_id:
        return settings.project_id
    raise VertexAIConfigError("GOOGLE_CLOUD_PROJECT_ID is required for Inkwise Vertex AI")


@lru_cache(maxsize=8)
def _get_client(project_id: str, location: str) -> genai.Client:
    return genai.Client(vertexai=True, project=project_id, location=location)


def _extract_finish_reason(response: Any) -> str | None:
    try:
        candidates = getattr(response, "candidates", None)
        if isinstance(candidates, list) and candidates:
            finish_reason = getattr(candidates[0], "finish_reason", None)
            if finish_reason is not None:
                return str(finish_reason)
    except Exception:
        return None
    return None


def _extract_text(response: Any) -> str:
    text = getattr(response, "text", None)
    if isinstance(text, str) and text.strip():
        return text

    try:
        candidates = getattr(response, "candidates", None)
        if isinstance(candidates, list) and candidates:
            content = getattr(candidates[0], "content", None)
            parts = getattr(content, "parts", None)
            if isinstance(parts, list):
                joined = "".join(
                    part_text
                    for part in parts
                    for part_text in [getattr(part, "text", None)]
                    if isinstance(part_text, str)
                )
                if joined.strip():
                    return joined
    except Exception:
        pass

    raise VertexAIError("Vertex AI returned empty or unparseable text")


def _coerce_raw_response(response: Any) -> Any:
    for attr in ("model_dump", "to_json_dict"):
        fn = getattr(response, attr, None)
        if callable(fn):
            try:
                return fn()
            except Exception:
                pass
    return response


def _build_config(generation_config: dict[str, Any] | None) -> types.GenerateContentConfig | None:
    if not generation_config:
        return None

    cfg = dict(generation_config)
    kwargs: dict[str, Any] = {}

    if "temperature" in cfg:
        kwargs["temperature"] = float(cfg["temperature"])

    if "max_output_tokens" in cfg:
        kwargs["max_output_tokens"] = int(cfg["max_output_tokens"])
    elif "maxOutputTokens" in cfg:
        kwargs["max_output_tokens"] = int(cfg["maxOutputTokens"])

    if "response_mime_type" in cfg:
        kwargs["response_mime_type"] = cfg["response_mime_type"]
    elif "responseMimeType" in cfg:
        kwargs["response_mime_type"] = cfg["responseMimeType"]

    return types.GenerateContentConfig(**kwargs) if kwargs else None


def _content_part_to_text(part: Any) -> str:
    if isinstance(part, str):
        return part
    if isinstance(part, dict):
        text = part.get("text")
        if isinstance(text, str):
            return text
    raise VertexAIError("Inkwise Vertex helper only supports text parts")


def _normalize_contents(contents: list[Any]) -> list[Any] | str:
    if not contents:
        raise VertexAIError("contents must not be empty")

    if len(contents) == 1 and isinstance(contents[0], str):
        return contents[0]

    messages: list[str] = []
    for item in contents:
        if isinstance(item, str):
            messages.append(item)
            continue

        if not isinstance(item, dict):
            raise VertexAIError("Unsupported content type for Inkwise Vertex helper")

        role = str(item.get("role") or "user").strip().lower()
        parts = item.get("parts") or []
        if not isinstance(parts, list) or not parts:
            raise VertexAIError("Each content item must include text parts")

        text = "\n".join(_content_part_to_text(part) for part in parts)
        if role == "model":
            role = "assistant"
        messages.append(f"{role.title()}:\n{text}")

    if len(messages) == 1:
        return messages[0]
    return "\n\n".join(messages)


def generate_content_sync(
    *,
    model: str,
    contents: list[Any],
    generation_config: dict[str, Any] | None = None,
    project_id: str | None = None,
    location: str | None = None,
) -> VertexAITextResult:
    settings = get_inkwise_settings()
    resolved_project = _require_project_id(project_id)
    resolved_location = location or settings.location
    client = _get_client(resolved_project, resolved_location)
    normalized_contents = _normalize_contents(contents)
    config = _build_config(generation_config)

    try:
        response = client.models.generate_content(
            model=model,
            contents=normalized_contents,
            config=config,
        )
    except Exception as exc:
        raise VertexAIError(f"Vertex AI request failed: {exc}") from exc

    return VertexAITextResult(
        text=_extract_text(response),
        finish_reason=_extract_finish_reason(response),
        raw=_coerce_raw_response(response),
    )


async def generate_content(
    *,
    model: str,
    contents: list[Any],
    generation_config: dict[str, Any] | None = None,
    timeout_seconds: float = 120,
    project_id: str | None = None,
    location: str | None = None,
) -> VertexAITextResult:
    task = asyncio.to_thread(
        generate_content_sync,
        model=model,
        contents=contents,
        generation_config=generation_config,
        project_id=project_id,
        location=location,
    )
    return await asyncio.wait_for(task, timeout=timeout_seconds)


def generate_text_sync(
    *,
    model: str,
    prompt: str,
    temperature: float = 0.2,
    max_output_tokens: int | None = None,
    project_id: str | None = None,
    location: str | None = None,
) -> VertexAITextResult:
    generation_config: dict[str, Any] = {"temperature": float(temperature)}
    if max_output_tokens is not None:
        generation_config["max_output_tokens"] = int(max_output_tokens)
    return generate_content_sync(
        model=model,
        contents=[{"role": "user", "parts": [{"text": prompt}]}],
        generation_config=generation_config,
        project_id=project_id,
        location=location,
    )


async def generate_text(
    *,
    model: str,
    prompt: str,
    temperature: float = 0.2,
    max_output_tokens: int | None = None,
    timeout_seconds: float = 120,
    project_id: str | None = None,
    location: str | None = None,
) -> VertexAITextResult:
    return await generate_content(
        model=model,
        contents=[{"role": "user", "parts": [{"text": prompt}]}],
        generation_config={
            "temperature": float(temperature),
            **({"max_output_tokens": int(max_output_tokens)} if max_output_tokens is not None else {}),
        },
        timeout_seconds=timeout_seconds,
        project_id=project_id,
        location=location,
    )
