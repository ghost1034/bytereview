"""Shared Vertex AI helpers for the Inkwise module."""

from __future__ import annotations

import asyncio
import base64
import logging
from dataclasses import dataclass
from functools import lru_cache
from collections.abc import AsyncGenerator
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


@dataclass(frozen=True)
class VertexAITextChunk:
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


@lru_cache(maxsize=8)
def _get_async_client(project_id: str, location: str) -> Any:
    return genai.Client(vertexai=True, project=project_id, location=location).aio


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


def _extract_text_or_empty(response: Any) -> str:
    text = getattr(response, "text", None)
    if isinstance(text, str):
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
                return joined
    except Exception:
        pass

    return ""


def _extract_text(response: Any) -> str:
    text = _extract_text_or_empty(response)
    if text.strip():
        return text

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


def _normalize_part(part: Any) -> types.Part:
    if isinstance(part, types.Part):
        return part
    if isinstance(part, str):
        return types.Part.from_text(text=part)
    if not isinstance(part, dict):
        raise VertexAIError("Unsupported content part for Inkwise Vertex helper")

    text_value = part.get("text")
    if isinstance(text_value, str):
        return types.Part.from_text(text=text_value)

    file_data = part.get("fileData")
    if isinstance(file_data, dict):
        file_uri = str(file_data.get("fileUri") or "").strip()
        mime_type = str(file_data.get("mimeType") or "").strip()
        if not file_uri or not mime_type:
            raise VertexAIError("fileData parts require fileUri and mimeType")
        return types.Part.from_uri(file_uri=file_uri, mime_type=mime_type)

    inline_data = part.get("inlineData")
    if isinstance(inline_data, dict):
        mime_type = str(inline_data.get("mimeType") or "").strip()
        data = inline_data.get("data") or inline_data.get("bytesBase64Encoded")
        if not mime_type or not isinstance(data, str) or not data.strip():
            raise VertexAIError("inlineData parts require mimeType and base64 data")
        try:
            raw = base64.b64decode(data)
        except Exception as exc:
            raise VertexAIError("inlineData base64 payload could not be decoded") from exc
        return types.Part.from_bytes(data=raw, mime_type=mime_type)

    raise VertexAIError("Unsupported content part for Inkwise Vertex helper")


def _is_part_like(item: Any) -> bool:
    if isinstance(item, (str, types.Part)):
        return True
    return isinstance(item, dict) and "role" not in item


def _normalize_role(role: str | None) -> str:
    clean = str(role or "user").strip().lower()
    if clean in {"assistant", "model"}:
        return "model"
    return "user"


def _normalize_contents(contents: list[Any]) -> list[Any]:
    if not contents:
        raise VertexAIError("contents must not be empty")

    if all(_is_part_like(item) for item in contents):
        return [types.Content(role="user", parts=[_normalize_part(item) for item in contents])]

    messages: list[types.Content] = []
    for item in contents:
        if isinstance(item, str):
            messages.append(types.Content(role="user", parts=[types.Part.from_text(text=item)]))
            continue

        if not isinstance(item, dict):
            raise VertexAIError("Unsupported content type for Inkwise Vertex helper")

        role = _normalize_role(item.get("role"))
        parts = item.get("parts") or []
        if not isinstance(parts, list) or not parts:
            raise VertexAIError("Each content item must include parts")
        messages.append(types.Content(role=role, parts=[_normalize_part(part) for part in parts]))

    return messages


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
    try:
        return await asyncio.wait_for(task, timeout=timeout_seconds)
    except TimeoutError as exc:
        raise VertexAIError("Vertex AI request timed out") from exc
    except asyncio.CancelledError:
        raise


async def generate_content_stream(
    *,
    model: str,
    contents: list[Any],
    generation_config: dict[str, Any] | None = None,
    timeout_seconds: float = 120,
    project_id: str | None = None,
    location: str | None = None,
) -> AsyncGenerator[VertexAITextChunk, None]:
    settings = get_inkwise_settings()
    resolved_project = _require_project_id(project_id)
    resolved_location = location or settings.location
    client = _get_async_client(resolved_project, resolved_location)
    normalized_contents = _normalize_contents(contents)
    config = _build_config(generation_config)

    try:
        async with asyncio.timeout(timeout_seconds):
            stream = await client.models.generate_content_stream(
                model=model,
                contents=normalized_contents,
                config=config,
            )
            saw_text = False
            async for response in stream:
                chunk_text = _extract_text_or_empty(response)
                if chunk_text.strip():
                    saw_text = True
                yield VertexAITextChunk(
                    text=chunk_text,
                    finish_reason=_extract_finish_reason(response),
                    raw=_coerce_raw_response(response),
                )
            if not saw_text:
                raise VertexAIError("Vertex AI returned empty or unparseable text")
    except TimeoutError as exc:
        raise VertexAIError("Vertex AI request timed out") from exc
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        raise VertexAIError(f"Vertex AI request failed: {exc}") from exc


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


async def generate_text_stream(
    *,
    model: str,
    prompt: str,
    temperature: float = 0.2,
    max_output_tokens: int | None = None,
    timeout_seconds: float = 120,
    project_id: str | None = None,
    location: str | None = None,
) -> AsyncGenerator[VertexAITextChunk, None]:
    async for chunk in generate_content_stream(
        model=model,
        contents=[{"role": "user", "parts": [{"text": prompt}]}],
        generation_config={
            "temperature": float(temperature),
            **({"max_output_tokens": int(max_output_tokens)} if max_output_tokens is not None else {}),
        },
        timeout_seconds=timeout_seconds,
        project_id=project_id,
        location=location,
    ):
        yield chunk
