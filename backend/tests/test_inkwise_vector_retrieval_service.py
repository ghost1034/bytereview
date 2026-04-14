from __future__ import annotations

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

from inkwise.services.query_rewrite import QueryRewriteResult
from inkwise.services.vector_retrieval_service import InkwiseVectorRetrievalService, RetrievalCandidate


def _settings() -> SimpleNamespace:
    return SimpleNamespace(
        query_rewrite_enabled=True,
        vertex_enabled=True,
        query_rewrite_model="gemini-test",
        query_rewrite_max_history_messages=12,
        query_rewrite_max_query_chars=180,
        query_rewrite_timeout_seconds=15.0,
        use_lexical_fusion=True,
        vector_search_top_k=24,
        lexical_search_top_k=16,
        use_vector_rerank=False,
    )


def _candidate() -> RetrievalCandidate:
    return RetrievalCandidate(
        segment_id=uuid.uuid4(),
        source_id=uuid.uuid4(),
        source_title="Source",
        modality="text",
        segment_type="paragraph",
        segment_title="Section 1",
        text_content="Evidence excerpt",
        page_start=1,
        page_end=1,
        locator_json={},
        preview_bucket=None,
        preview_object=None,
        fused_score=1.0,
    )


class VectorRetrievalServiceQueryRewriteTests(unittest.TestCase):
    def test_skips_query_rewrite_without_chat_history(self) -> None:
        service = InkwiseVectorRetrievalService()
        calls: list[tuple[str, str | None]] = []

        def fake_search_attempt(*args, **kwargs):
            calls.append((kwargs["query"], kwargs.get("lexical_query")))
            return [_candidate()], {"vector_count": 1, "lexical_count": 0, "merged_count": 1}

        with patch("inkwise.services.vector_retrieval_service.get_inkwise_settings", return_value=_settings()):
            with patch("inkwise.services.vector_retrieval_service.rewrite_retrieval_query") as rewrite_mock:
                with patch.object(service, "_search_attempt", side_effect=fake_search_attempt):
                    with patch.object(service, "_candidates_to_evidence", return_value=[]):
                        _evidence, meta, _strategy = service.retrieve_evidence(
                            db=SimpleNamespace(),
                            query="What does section 179 cover?",
                            bound_sources=[(uuid.uuid4(), "Tax Memo")],
                            history_messages=None,
                        )

        rewrite_mock.assert_not_called()
        self.assertEqual(calls, [("What does section 179 cover?", None)])
        self.assertEqual(meta["query_rewrite"]["skipped"], "no_chat_history")
        self.assertFalse(meta["query_rewrite"]["triggered"])
        self.assertFalse(meta["query_rewrite"]["has_chat_history"])

    def test_uses_query_rewrite_with_chat_history(self) -> None:
        service = InkwiseVectorRetrievalService()
        calls: list[tuple[str, str | None]] = []

        def fake_search_attempt(*args, **kwargs):
            calls.append((kwargs["query"], kwargs.get("lexical_query")))
            return [_candidate()], {"vector_count": 1, "lexical_count": 1, "merged_count": 1}

        rewrite_result = QueryRewriteResult(
            standalone_question="What does section 179 of the lease cover?",
            fts_query='section 179 lease cover',
            meta={"triggered": True},
        )

        with patch("inkwise.services.vector_retrieval_service.get_inkwise_settings", return_value=_settings()):
            with patch(
                "inkwise.services.vector_retrieval_service.rewrite_retrieval_query",
                return_value=rewrite_result,
            ) as rewrite_mock:
                with patch.object(service, "_search_attempt", side_effect=fake_search_attempt):
                    with patch.object(service, "_candidates_to_evidence", return_value=[]):
                        _evidence, meta, _strategy = service.retrieve_evidence(
                            db=SimpleNamespace(),
                            query="What does it cover?",
                            bound_sources=[(uuid.uuid4(), "Lease")],
                            history_messages=[{"role": "user", "content": "Tell me about section 179."}],
                        )

        rewrite_mock.assert_called_once()
        self.assertEqual(calls, [("What does section 179 of the lease cover?", "section 179 lease cover")])
        self.assertTrue(meta["query_rewrite"]["triggered"])
        self.assertTrue(meta["query_rewrite"]["has_chat_history"])
        self.assertNotIn("skipped", meta["query_rewrite"])


if __name__ == "__main__":
    unittest.main()
