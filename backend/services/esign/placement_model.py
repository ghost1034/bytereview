"""Vertex adapter shared by the worker and the opt-in evaluation command."""
from __future__ import annotations

import json
from typing import Any

from google import genai
from google.genai import types


def generate_placement_response(
    client: genai.Client, settings: dict[str, Any], phase: str, prompt: str,
    schema: dict[str, Any], image: bytes,
) -> tuple[dict[str, Any], dict[str, Any]]:
    response = client.models.generate_content(
        model=settings['model'], contents=[types.Part.from_bytes(data=image, mime_type='image/png'), prompt],
        config=types.GenerateContentConfig(
            response_mime_type='application/json', response_schema=schema,
            temperature=settings.get('temperature', .1), max_output_tokens=16384,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        ),
    )
    if not response.candidates or str(response.candidates[0].finish_reason.value) != 'STOP':
        raise RuntimeError(f'Incomplete field placement {phase} response')
    return json.loads(response.text or '{}'), {
        'model_version': response.model_version,
        'usage': response.usage_metadata.model_dump(mode='json') if response.usage_metadata else {},
    }
