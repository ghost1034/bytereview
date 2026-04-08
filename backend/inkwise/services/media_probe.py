"""Media metadata helpers for chunked Inkwise ingestion."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass


class MediaProbeError(RuntimeError):
    pass


@dataclass(frozen=True)
class MediaProbeResult:
    duration_ms: int
    has_audio_stream: bool
    has_video_stream: bool
    container_format: str | None = None


class InkwiseMediaProbeService:
    def probe(self, *, local_path: str) -> MediaProbeResult:
        path = os.path.abspath(local_path)
        if not os.path.exists(path):
            raise MediaProbeError(f"Media file does not exist: {path}")

        ffprobe_binary = shutil.which("ffprobe")
        if not ffprobe_binary:
            raise MediaProbeError("ffprobe is required for audio/video ingestion")

        completed = subprocess.run(
            [
                ffprobe_binary,
                "-v",
                "error",
                "-show_format",
                "-show_streams",
                "-of",
                "json",
                path,
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            stderr = (completed.stderr or completed.stdout or "").strip()
            raise MediaProbeError(f"ffprobe failed: {stderr[:500] or 'unknown error'}")

        try:
            payload = json.loads(completed.stdout or "{}")
        except json.JSONDecodeError as exc:
            raise MediaProbeError("ffprobe returned invalid JSON") from exc

        duration_ms = self._extract_duration_ms(payload)
        streams = payload.get("streams") if isinstance(payload, dict) else None
        has_audio_stream = False
        has_video_stream = False
        if isinstance(streams, list):
            for stream in streams:
                codec_type = str((stream or {}).get("codec_type") or "").strip().lower()
                if codec_type == "audio":
                    has_audio_stream = True
                elif codec_type == "video":
                    has_video_stream = True

        format_info = payload.get("format") if isinstance(payload, dict) else None
        container_format = str((format_info or {}).get("format_name") or "").strip() or None
        return MediaProbeResult(
            duration_ms=duration_ms,
            has_audio_stream=has_audio_stream,
            has_video_stream=has_video_stream,
            container_format=container_format,
        )

    def _extract_duration_ms(self, payload: dict[str, object]) -> int:
        format_info = payload.get("format")
        if isinstance(format_info, dict):
            duration_ms = _parse_duration_ms(format_info.get("duration"))
            if duration_ms is not None:
                return duration_ms

        streams = payload.get("streams")
        if isinstance(streams, list):
            stream_durations = [_parse_duration_ms((stream or {}).get("duration")) for stream in streams if isinstance(stream, dict)]
            stream_durations = [value for value in stream_durations if value is not None]
            if stream_durations:
                return max(stream_durations)

        raise MediaProbeError("Could not determine media duration")


def _parse_duration_ms(raw: object) -> int | None:
    if raw in (None, ""):
        return None
    try:
        duration_seconds = float(raw)
    except Exception:
        return None
    if duration_seconds <= 0:
        return None
    return max(1, int(round(duration_seconds * 1000)))
