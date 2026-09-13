"""Vertex adapter shared by the worker and the opt-in evaluation command."""
from __future__ import annotations

import json
from typing import Any

from google import genai
from google.genai import types


def generate_placement_response(
    client: genai.Client, settings: dict[str, Any], phase: str, prompt: str,
    schema: dict[str, Any], image: bytes | list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    parts = []
    if isinstance(image, bytes):  # Historical evaluation only.
        parts.append(types.Part.from_bytes(data=image, mime_type='image/png'))
    else:
        for page in image:
            parts.append(types.Part.from_text(text=f"Document {page['document_id']}, zero-based page {page['page_number']}"))
            parts.append(types.Part.from_bytes(data=page['data'], mime_type='image/png'))
    response = client.models.generate_content(
        model=settings['model'], contents=parts + [prompt],
        config=types.GenerateContentConfig(
            response_mime_type='application/json', response_schema=schema,
            temperature=settings.get('temperature', .1), max_output_tokens=65536 if phase == 'analyze' else 16384,
            http_options=types.HttpOptions(timeout=600_000, retry_options=types.HttpRetryOptions(attempts=1)),
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        ),
    )
    if not response.candidates or str(response.candidates[0].finish_reason.value) != 'STOP':
        raise RuntimeError(f'Incomplete field placement {phase} response')
    return json.loads(response.text or '{}'), {
        'model_version': response.model_version,
        'usage': response.usage_metadata.model_dump(mode='json') if response.usage_metadata else {},
    }
