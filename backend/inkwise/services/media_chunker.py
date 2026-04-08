"""Chunk audio/video sources into Gemini-compatible clip assets."""

from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass

from inkwise.services.media_probe import InkwiseMediaProbeService, MediaProbeResult
from inkwise.settings import get_inkwise_settings


class MediaChunkError(RuntimeError):
    pass


@dataclass(frozen=True)
class MediaChunk:
    order_index: int
    time_start_ms: int
    time_end_ms: int
    local_path: str
    mime_type: str
    uses_original_asset: bool = False


@dataclass(frozen=True)
class MediaChunkWindow:
    order_index: int
    time_start_ms: int
    time_end_ms: int


class InkwiseMediaChunker:
    def __init__(self) -> None:
        self.probe_service = InkwiseMediaProbeService()

    def create_chunks(
        self,
        *,
        local_path: str,
        source_kind: str,
        mime_type: str,
        output_dir: str,
    ) -> tuple[MediaProbeResult, list[MediaChunk]]:
        probe = self.probe_service.probe(local_path=local_path)
        windows = self.build_chunk_windows(duration_ms=probe.duration_ms, source_kind=source_kind)
        if len(windows) == 1:
            return probe, [
                MediaChunk(
                    order_index=windows[0].order_index,
                    time_start_ms=windows[0].time_start_ms,
                    time_end_ms=windows[0].time_end_ms,
                    local_path=local_path,
                    mime_type=mime_type,
                    uses_original_asset=True,
                )
            ]

        os.makedirs(output_dir, exist_ok=True)
        ext = _extension_for_mime_type(mime_type)
        chunks: list[MediaChunk] = []
        for window in windows:
            filename = f"{source_kind}_{window.order_index:04d}_{window.time_start_ms:010d}_{window.time_end_ms:010d}{ext}"
            chunk_path = os.path.join(output_dir, filename)
            self._extract_chunk(
                input_path=local_path,
                output_path=chunk_path,
                time_start_ms=window.time_start_ms,
                time_end_ms=window.time_end_ms,
            )
            chunks.append(
                MediaChunk(
                    order_index=window.order_index,
                    time_start_ms=window.time_start_ms,
                    time_end_ms=window.time_end_ms,
                    local_path=chunk_path,
                    mime_type=mime_type,
                )
            )
        return probe, chunks

    def build_chunk_windows(self, *, duration_ms: int, source_kind: str) -> list[MediaChunkWindow]:
        settings = get_inkwise_settings()
        chunk_seconds = settings.audio_chunk_seconds if source_kind == "audio" else settings.video_chunk_seconds
        chunk_ms = max(1000, int(chunk_seconds) * 1000)
        overlap_ms = max(0, int(settings.media_chunk_overlap_seconds) * 1000)
        overlap_ms = min(overlap_ms, max(0, chunk_ms - 1000))
        step_ms = max(1000, chunk_ms - overlap_ms)
        max_clips = max(1, int(settings.media_max_clips_per_source))
        if duration_ms <= 0:
            raise MediaChunkError("Media duration must be greater than zero")

        windows: list[MediaChunkWindow] = []
        start_ms = 0
        while start_ms < duration_ms:
            order_index = len(windows)
            if order_index >= max_clips:
                raise MediaChunkError(f"Media source exceeds the maximum of {max_clips} clips")
            end_ms = min(duration_ms, start_ms + chunk_ms)
            windows.append(MediaChunkWindow(order_index=order_index, time_start_ms=start_ms, time_end_ms=end_ms))
            if end_ms >= duration_ms:
                break
            start_ms += step_ms
        return windows

    def _extract_chunk(
        self,
        *,
        input_path: str,
        output_path: str,
        time_start_ms: int,
        time_end_ms: int,
    ) -> None:
        ffmpeg_binary = shutil.which("ffmpeg")
        if not ffmpeg_binary:
            raise MediaChunkError("ffmpeg is required for audio/video ingestion")
        duration_ms = max(1, time_end_ms - time_start_ms)
        completed = subprocess.run(
            [
                ffmpeg_binary,
                "-y",
                "-i",
                input_path,
                "-ss",
                _format_ffmpeg_seconds(time_start_ms),
                "-t",
                _format_ffmpeg_seconds(duration_ms),
                "-map",
                "0",
                "-c",
                "copy",
                "-avoid_negative_ts",
                "make_zero",
                "-reset_timestamps",
                "1",
                output_path,
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0 or not os.path.exists(output_path):
            stderr = (completed.stderr or completed.stdout or "").strip()
            raise MediaChunkError(f"ffmpeg chunk extraction failed: {stderr[:500] or 'unknown error'}")


def _extension_for_mime_type(mime_type: str) -> str:
    normalized = (mime_type or "").strip().lower()
    if normalized == "audio/mp3":
        return ".mp3"
    if normalized == "audio/wav":
        return ".wav"
    if normalized == "video/mp4":
        return ".mp4"
    if normalized == "video/mpeg":
        return ".mpeg"
    raise MediaChunkError(f"Unsupported media MIME type for chunking: {mime_type}")


def _format_ffmpeg_seconds(value_ms: int) -> str:
    return f"{max(0, int(value_ms)) / 1000:.3f}"
