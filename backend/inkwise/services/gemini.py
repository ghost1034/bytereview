"""Compatibility layer for Inkwise Gemini helpers, now backed by Vertex AI."""

from __future__ import annotations

import logging
from typing import Any

from inkwise.services.vertex_ai import (
    VertexAITextChunk,
    VertexAIError,
    VertexAITextResult,
    generate_content as vertex_generate_content,
    generate_content_stream as vertex_generate_content_stream,
    generate_text as vertex_generate_text,
    generate_text_stream as vertex_generate_text_stream,
)

logger = logging.getLogger(__name__)

GeminiError = VertexAIError
GeminiResult = VertexAITextResult
GeminiChunk = VertexAITextChunk


async def generate_content(
    *,
    api_key: str | None = None,
    model: str,
    contents: list[Any],
    generation_config: dict[str, Any] | None = None,
    timeout_seconds: float = 120,
) -> GeminiResult:
    if api_key:
        logger.debug("Ignoring deprecated Inkwise api_key parameter; Vertex AI credentials are used instead")
    return await vertex_generate_content(
        model=model,
        contents=contents,
        generation_config=generation_config,
        timeout_seconds=timeout_seconds,
    )


async def generate_text(
    *,
    api_key: str | None = None,
    model: str,
    prompt: str,
    temperature: float = 0.2,
    max_output_tokens: int | None = None,
    timeout_seconds: float = 120,
) -> GeminiResult:
    if api_key:
        logger.debug("Ignoring deprecated Inkwise api_key parameter; Vertex AI credentials are used instead")
    return await vertex_generate_text(
        model=model,
        prompt=prompt,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        timeout_seconds=timeout_seconds,
    )


async def generate_content_stream(
    *,
    api_key: str | None = None,
    model: str,
    contents: list[Any],
    generation_config: dict[str, Any] | None = None,
    timeout_seconds: float = 120,
):
    if api_key:
        logger.debug("Ignoring deprecated Inkwise api_key parameter; Vertex AI credentials are used instead")
    async for chunk in vertex_generate_content_stream(
        model=model,
        contents=contents,
        generation_config=generation_config,
        timeout_seconds=timeout_seconds,
    ):
        yield chunk


async def generate_text_stream(
    *,
    api_key: str | None = None,
    model: str,
    prompt: str,
    temperature: float = 0.2,
    max_output_tokens: int | None = None,
    timeout_seconds: float = 120,
):
    if api_key:
        logger.debug("Ignoring deprecated Inkwise api_key parameter; Vertex AI credentials are used instead")
    async for chunk in vertex_generate_text_stream(
        model=model,
        prompt=prompt,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        timeout_seconds=timeout_seconds,
    ):
        yield chunk
