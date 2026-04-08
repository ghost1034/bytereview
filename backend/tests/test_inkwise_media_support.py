from __future__ import annotations

import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from inkwise.services.media_chunker import InkwiseMediaChunker, MediaChunk
from inkwise.services.multimodal_evidence import build_multimodal_contents
from inkwise.services.retrieval_types import EvidenceItem, build_evidence_pack, evidence_excerpt, evidence_preview_mime_type
from inkwise.services.segmentation_service import InkwiseSegmentationService
from inkwise.services.source_normalizer import InkwiseSourceNormalizer
from inkwise.services.source_service import InkwiseSourceService


class InkwiseMediaUploadKindTests(unittest.TestCase):
    def test_detect_upload_kind_accepts_media_files(self) -> None:
        service = InkwiseSourceService()

        self.assertEqual(service._detect_upload_kind(filename="diagram.jpg", content_type="image/jpeg"), "image_jpeg")
        self.assertEqual(service._detect_upload_kind(filename="call.mp3", content_type="audio/mpeg"), "audio_mp3")
        self.assertEqual(service._detect_upload_kind(filename="meeting.wav", content_type="audio/x-wav"), "audio_wav")
        self.assertEqual(service._detect_upload_kind(filename="walkthrough.mp4", content_type="video/mp4"), "video_mp4")
        self.assertEqual(service._detect_upload_kind(filename="archive.mpg", content_type="video/mpg"), "video_mpeg")


class InkwiseMediaNormalizationTests(unittest.TestCase):
    def test_normalize_image_passthrough(self) -> None:
        normalizer = InkwiseSourceNormalizer()
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "diagram.png"
            image_path.write_bytes(b"png-bytes")

            normalized = normalizer.normalize_local_source(
                local_path=str(image_path),
                filename="diagram.png",
                content_type="image/png",
                title="Architecture Diagram",
            )

        self.assertEqual(normalized.source_kind, "image")
        self.assertEqual(normalized.canonical_mime_type, "image/png")
        self.assertEqual(normalized.page_count, 1)
        self.assertEqual(normalized.text_blocks, [])
        self.assertEqual(normalized.assets[0].kind, "image_asset")


class InkwiseMediaSegmentationTests(unittest.TestCase):
    def test_build_audio_segment(self) -> None:
        normalizer = InkwiseSourceNormalizer()
        segmentation = InkwiseSegmentationService()
        with tempfile.TemporaryDirectory() as temp_dir:
            audio_path = Path(temp_dir) / "recording.wav"
            audio_path.write_bytes(b"wav-bytes")
            normalized = normalizer.normalize_local_source(
                local_path=str(audio_path),
                filename="recording.wav",
                content_type="audio/wav",
                title="Client Interview",
            )

        result = segmentation.build_segments(normalized)

        self.assertEqual(result.stats["segment_count"], 1)
        self.assertEqual(result.segments[0].segment_type, "audio_clip")
        self.assertEqual(result.segments[0].modality, "audio")
        self.assertEqual(result.segments[0].locator_json, {"kind": "audio_asset"})

    def test_build_audio_segments_from_chunked_media(self) -> None:
        normalizer = InkwiseSourceNormalizer()
        segmentation = InkwiseSegmentationService()
        with tempfile.TemporaryDirectory() as temp_dir:
            audio_path = Path(temp_dir) / "recording.wav"
            audio_path.write_bytes(b"wav-bytes")
            normalized = normalizer.normalize_local_source(
                local_path=str(audio_path),
                filename="recording.wav",
                content_type="audio/wav",
                title="Client Interview",
            )

        result = segmentation.build_segments(
            normalized,
            media_chunks=[
                MediaChunk(order_index=0, time_start_ms=0, time_end_ms=60000, local_path="/tmp/chunk0.wav", mime_type="audio/wav"),
                MediaChunk(order_index=1, time_start_ms=58000, time_end_ms=120000, local_path="/tmp/chunk1.wav", mime_type="audio/wav"),
            ],
        )

        self.assertEqual(result.stats["segment_count"], 2)
        self.assertEqual(result.stats["media_chunk_count"], 2)
        self.assertEqual(result.segments[0].locator_json["kind"], "time_range")
        self.assertEqual(result.segments[0].time_start_ms, 0)
        self.assertEqual(result.segments[0].time_end_ms, 60000)
        self.assertIn("00:00-01:00", str(result.segments[0].title))


class InkwiseMediaChunkerTests(unittest.TestCase):
    def test_build_chunk_windows_respects_overlap(self) -> None:
        chunker = InkwiseMediaChunker()
        with patch.dict(
            os.environ,
            {
                "INKWISE_AUDIO_CHUNK_SECONDS": "60",
                "INKWISE_VIDEO_CHUNK_SECONDS": "45",
                "INKWISE_MEDIA_CHUNK_OVERLAP_SECONDS": "2",
                "INKWISE_MEDIA_MAX_CLIPS_PER_SOURCE": "10",
            },
            clear=False,
        ):
            windows = chunker.build_chunk_windows(duration_ms=130000, source_kind="audio")

        self.assertEqual([(item.time_start_ms, item.time_end_ms) for item in windows], [(0, 60000), (58000, 118000), (116000, 130000)])

    def test_create_chunks_keeps_original_asset_when_single_window(self) -> None:
        chunker = InkwiseMediaChunker()
        with tempfile.TemporaryDirectory() as temp_dir:
            audio_path = Path(temp_dir) / "short.wav"
            audio_path.write_bytes(b"wav-bytes")
            with (
                patch.object(chunker.probe_service, "probe", return_value=type("Probe", (), {"duration_ms": 45000})()),
                patch.object(chunker, "_extract_chunk") as extract_chunk,
                patch.dict(os.environ, {"INKWISE_AUDIO_CHUNK_SECONDS": "60", "INKWISE_MEDIA_CHUNK_OVERLAP_SECONDS": "2"}, clear=False),
            ):
                _probe, chunks = chunker.create_chunks(
                    local_path=str(audio_path),
                    source_kind="audio",
                    mime_type="audio/wav",
                    output_dir=str(Path(temp_dir) / "clips"),
                )

        self.assertEqual(len(chunks), 1)
        self.assertTrue(chunks[0].uses_original_asset)
        self.assertEqual(chunks[0].local_path, str(audio_path))
        extract_chunk.assert_not_called()


class InkwiseMultimodalEvidenceTests(unittest.TestCase):
    def test_build_multimodal_contents_attaches_supported_media(self) -> None:
        evidence = [
            EvidenceItem(
                evidence_id="E01",
                source_id=uuid.uuid4(),
                source_title="Storefront",
                page_number=0,
                excerpt="",
                score=0.9,
                locator_json={"kind": "image_asset"},
                preview_bucket="bucket",
                preview_object="refs/storefront.jpg",
            ),
            EvidenceItem(
                evidence_id="E02",
                source_id=uuid.uuid4(),
                source_title="Call Recording",
                page_number=0,
                excerpt="",
                score=0.8,
                locator_json={"kind": "audio_asset"},
                preview_bucket="bucket",
                preview_object="refs/call.mp3",
            ),
            EvidenceItem(
                evidence_id="E03",
                source_id=uuid.uuid4(),
                source_title="Site Walkthrough",
                page_number=0,
                excerpt="",
                score=0.7,
                locator_json={"kind": "video_asset"},
                preview_bucket="bucket",
                preview_object="refs/tour.mp4",
            ),
        ]

        bundle = build_multimodal_contents(prompt="Summarize the evidence.", evidence=evidence, max_files=10)

        self.assertEqual(bundle.attached_evidence_ids, ["E01", "E02", "E03"])
        file_mime_types = [part["fileData"]["mimeType"] for part in bundle.contents[:-1]]
        self.assertEqual(file_mime_types, ["image/jpeg", "audio/mp3", "video/mp4"])
        self.assertIn("Attached evidence IDs: E01, E02, E03", bundle.contents[-1]["text"])

    def test_media_evidence_helpers_use_locator_and_extension(self) -> None:
        item = EvidenceItem(
            evidence_id="E01",
            source_id=uuid.uuid4(),
            source_title="Call Recording",
            page_number=0,
            excerpt="",
            score=0.8,
            locator_json={"kind": "audio_asset"},
            preview_bucket="bucket",
            preview_object="refs/call.wav",
        )

        self.assertEqual(evidence_preview_mime_type(item), "audio/wav")
        self.assertIn("attached audio file", evidence_excerpt(item))

    def test_time_range_evidence_helpers_include_clip_locator(self) -> None:
        item = EvidenceItem(
            evidence_id="E02",
            source_id=uuid.uuid4(),
            source_title="Site Walkthrough",
            page_number=0,
            excerpt="",
            score=0.7,
            locator_json={"kind": "time_range", "source_kind": "video", "time_start_ms": 45000, "time_end_ms": 75000},
            preview_bucket="bucket",
            preview_object="refs/tour_0045_0075.mp4",
            segment_title="Site Walkthrough video 00:45-01:15",
        )

        self.assertEqual(evidence_preview_mime_type(item), "video/mp4")
        self.assertIn("attached video clip 00:45-01:15", evidence_excerpt(item))
        self.assertIn('locator="00:45-01:15"', build_evidence_pack([item]))


if __name__ == "__main__":
    unittest.main()
