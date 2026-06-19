from __future__ import annotations

import os
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from inkwise.settings import get_inkwise_settings


class InkwiseSettingsTests(TestCase):
    def test_reference_metadata_autofill_defaults_on(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = get_inkwise_settings()

        self.assertTrue(settings.reference_metadata_autofill_enabled)
        self.assertEqual(settings.reference_metadata_max_text_chars, 12000)

    def test_reference_metadata_autofill_respects_env(self) -> None:
        with patch.dict(
            os.environ,
            {
                "INKWISE_REFERENCE_METADATA_AUTOFILL_ENABLED": "false",
                "INKWISE_REFERENCE_METADATA_MAX_TEXT_CHARS": "4000",
            },
            clear=True,
        ):
            settings = get_inkwise_settings()

        self.assertFalse(settings.reference_metadata_autofill_enabled)
        self.assertEqual(settings.reference_metadata_max_text_chars, 4000)

    def test_lexical_fusion_defaults_off(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = get_inkwise_settings()

        self.assertFalse(settings.use_lexical_fusion)

    def test_lexical_fusion_respects_false_env(self) -> None:
        with patch.dict(os.environ, {"INKWISE_USE_LEXICAL_FUSION": "false"}, clear=True):
            settings = get_inkwise_settings()

        self.assertFalse(settings.use_lexical_fusion)

    def test_vector_rerank_defaults_off(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = get_inkwise_settings()

        self.assertFalse(settings.use_vector_rerank)

    def test_vector_rerank_respects_false_env(self) -> None:
        with patch.dict(os.environ, {"INKWISE_USE_VECTOR_RERANK": "false"}, clear=True):
            settings = get_inkwise_settings()

        self.assertFalse(settings.use_vector_rerank)

    def test_video_upload_limit_defaults_to_1000mb(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = get_inkwise_settings()

        self.assertEqual(settings.max_upload_mb, 100)
        self.assertEqual(settings.video_max_upload_mb, 1000)

    def test_video_upload_limit_respects_env(self) -> None:
        with patch.dict(
            os.environ,
            {
                "INKWISE_MAX_UPLOAD_MB": "125",
                "INKWISE_MAX_VIDEO_UPLOAD_MB": "1500",
            },
            clear=True,
        ):
            settings = get_inkwise_settings()

        self.assertEqual(settings.max_upload_mb, 125)
        self.assertEqual(settings.video_max_upload_mb, 1500)

    def test_deploy_script_defaults_match_backend_setting(self) -> None:
        script_path = Path(__file__).resolve().parents[2] / "scripts" / "deploy-services.sh"
        script = script_path.read_text(encoding="utf-8")

        self.assertIn('INKWISE_MAX_UPLOAD_MB="${INKWISE_MAX_UPLOAD_MB:-100}"', script)
        self.assertIn('INKWISE_MAX_VIDEO_UPLOAD_MB="${INKWISE_MAX_VIDEO_UPLOAD_MB:-1000}"', script)
        self.assertIn('INKWISE_USE_LEXICAL_FUSION="${INKWISE_USE_LEXICAL_FUSION:-false}"', script)
        self.assertIn('INKWISE_USE_VECTOR_RERANK="${INKWISE_USE_VECTOR_RERANK:-false}"', script)
