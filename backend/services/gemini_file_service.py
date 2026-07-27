"""Build Gemini file parts from the configured object storage backend."""

from __future__ import annotations

from typing import Any

from google.genai import types


def part_from_storage_object(
    storage_service: Any,
    object_name: str,
    mime_type: str,
) -> types.Part:
    """Return a Vertex-compatible part for either GCS or filesystem storage."""
    uri = storage_service.construct_gcs_uri_for_object(object_name)
    if uri.startswith("gs://"):
        return types.Part.from_uri(file_uri=uri, mime_type=mime_type)
    if uri.startswith("local://"):
        content = storage_service.bucket.blob(object_name).download_as_bytes()
        return types.Part.from_bytes(data=content, mime_type=mime_type)
    raise ValueError(f"Unsupported Gemini file URI: {uri}")
