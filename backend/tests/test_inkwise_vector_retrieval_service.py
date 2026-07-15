from __future__ import annotations

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

from inkwise.services.query_rewrite import QueryRewriteResult
from inkwise.services.retrieval_types import EvidenceItem, build_evidence_pack
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
        diversity_per_source_top_k=2,
        max_balanced_evidence_per_source=3,
        diversity_vector_score_margin=0.05,
        use_vector_rerank=False,
    )


def _settings_without_lexical_fusion() -> SimpleNamespace:
    settings = _settings()
    settings.use_lexical_fusion = False
    return settings


def _candidate(
    *,
    source_id: uuid.UUID | None = None,
    source_title: str = "Source",
    vector_score: float = 0.9,
    fused_score: float = 1.0,
) -> RetrievalCandidate:
    return RetrievalCandidate(
        segment_id=uuid.uuid4(),
        source_id=source_id or uuid.uuid4(),
        source_title=source_title,
        modality="text",
        segment_type="paragraph",
        segment_title="Section 1",
        text_content="Evidence excerpt",
        page_start=1,
        page_end=1,
        locator_json={},
        preview_bucket=None,
        preview_object=None,
        vector_score=vector_score,
        fused_score=fused_score,
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
        self.assertEqual(calls, [("What does section 179 cover?", "What does section 179 cover?")])
        self.assertEqual(meta["query_rewrite"]["skipped"], "no_chat_history")
        self.assertFalse(meta["query_rewrite"]["triggered"])
        self.assertFalse(meta["query_rewrite"]["has_chat_history"])
        self.assertEqual(meta["query_plan"]["vector_query_source"], "original")
        self.assertEqual(meta["query_plan"]["lexical_query_source"], "selected_vector_query")
        self.assertEqual(meta["search_passes"], [{"pass": 1, "reason": "primary", "vector_query_source": "original", "lexical_query_source": "selected_vector_query"}])

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
        self.assertTrue(meta["query_rewrite"]["applied"])
        self.assertTrue(meta["query_rewrite"]["has_chat_history"])
        self.assertNotIn("skipped", meta["query_rewrite"])
        self.assertEqual(meta["query_plan"]["vector_query_source"], "history_rewrite")
        self.assertEqual(meta["query_plan"]["lexical_query_source"], "rewrite_fts")

    def test_does_not_fallback_to_original_query_when_rewrite_path_returns_no_candidates(self) -> None:
        service = InkwiseVectorRetrievalService()
        calls: list[tuple[str, str | None]] = []

        def fake_search_attempt(*args, **kwargs):
            calls.append((kwargs["query"], kwargs.get("lexical_query")))
            return [], {"vector_count": 0, "lexical_count": 0, "merged_count": 0}

        rewrite_result = QueryRewriteResult(
            standalone_question="What does section 179 of the lease cover?",
            fts_query="section 179 lease cover",
            meta={"triggered": True},
        )

        with patch("inkwise.services.vector_retrieval_service.get_inkwise_settings", return_value=_settings()):
            with patch(
                "inkwise.services.vector_retrieval_service.rewrite_retrieval_query",
                return_value=rewrite_result,
            ):
                with patch.object(service, "_search_attempt", side_effect=fake_search_attempt):
                    with patch.object(service, "_candidates_to_evidence", return_value=[]):
                        _evidence, meta, _strategy = service.retrieve_evidence(
                            db=SimpleNamespace(),
                            query="What does it cover?",
                            bound_sources=[(uuid.uuid4(), "Lease")],
                            history_messages=[{"role": "user", "content": "Tell me about section 179."}],
                        )

        self.assertEqual(calls, [("What does section 179 of the lease cover?", "section 179 lease cover")])
        self.assertEqual(len(meta["search_attempts"]), 1)
        self.assertEqual(len(meta["search_passes"]), 1)
        self.assertEqual(meta["search_passes"][0]["reason"], "primary")

    def test_lexical_fusion_disabled_skips_lexical_query_path(self) -> None:
        service = InkwiseVectorRetrievalService()
        calls: list[tuple[str, str | None, bool]] = []

        def fake_search_attempt(*args, **kwargs):
            calls.append((kwargs["query"], kwargs.get("lexical_query"), kwargs["use_lexical_fusion"]))
            return [_candidate()], {"vector_count": 1, "lexical_count": 0, "merged_count": 1, "lexical_query": None}

        with patch("inkwise.services.vector_retrieval_service.get_inkwise_settings", return_value=_settings_without_lexical_fusion()):
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
        self.assertEqual(calls, [("What does section 179 cover?", None, False)])
        self.assertFalse(meta["lexical_fusion"]["enabled"])
        self.assertFalse(meta["lexical_fusion"]["executed"])
        self.assertIsNone(meta["lexical_fusion"]["query"])
        self.assertIsNone(meta["query_plan"]["lexical_query"])
        self.assertIsNone(meta["query_plan"]["lexical_query_source"])


class VectorRetrievalServiceDiversityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = InkwiseVectorRetrievalService()

    def test_promotes_competitive_candidates_from_a_missing_source(self) -> None:
        dominant_source = uuid.uuid4()
        missing_source = uuid.uuid4()
        candidates = [
            _candidate(source_id=dominant_source, vector_score=score, fused_score=score)
            for score in (0.90, 0.89, 0.88, 0.87, 0.86, 0.85, 0.84, 0.83)
        ]
        candidates.extend(
            _candidate(source_id=missing_source, vector_score=score, fused_score=score)
            for score in (0.82, 0.81)
        )

        selected, meta = self.service._select_diverse_candidates(
            candidates,
            max_evidence=6,
            max_per_source=3,
            vector_score_margin=0.05,
        )

        self.assertEqual(len(selected), 6)
        self.assertEqual(sum(item.source_id == missing_source for item in selected), 2)
        self.assertEqual(meta["promoted_candidate_count"], 2)
        self.assertEqual(meta["baseline_source_counts"], {str(dominant_source): 6})

    def test_does_not_promote_a_weak_missing_source(self) -> None:
        dominant_source = uuid.uuid4()
        weak_source = uuid.uuid4()
        candidates = [
            _candidate(source_id=dominant_source, vector_score=score, fused_score=score)
            for score in (0.90, 0.89, 0.88, 0.87, 0.86, 0.85)
        ]
        candidates.append(_candidate(source_id=weak_source, vector_score=0.60, fused_score=0.60))

        selected, meta = self.service._select_diverse_candidates(
            candidates,
            max_evidence=6,
            max_per_source=3,
            vector_score_margin=0.05,
        )

        self.assertTrue(all(item.source_id == dominant_source for item in selected))
        self.assertEqual(meta["promoted_candidate_count"], 0)

    def test_backfills_all_slots_for_a_single_source(self) -> None:
        source_id = uuid.uuid4()
        candidates = [
            _candidate(source_id=source_id, vector_score=0.90 - index / 100, fused_score=1.0 - index / 100)
            for index in range(8)
        ]

        selected, meta = self.service._select_diverse_candidates(
            candidates,
            max_evidence=6,
            max_per_source=3,
            vector_score_margin=0.05,
        )

        self.assertEqual(len(selected), 6)
        self.assertEqual(meta["selected_source_counts"], {str(source_id): 6})

    def test_uses_source_id_instead_of_title_for_balancing(self) -> None:
        first_source = uuid.uuid4()
        second_source = uuid.uuid4()
        candidates = [
            _candidate(source_id=first_source, source_title="Duplicate", vector_score=0.90 - index / 100)
            for index in range(5)
        ]
        candidates.append(
            _candidate(source_id=second_source, source_title="Duplicate", vector_score=0.86)
        )

        selected, _meta = self.service._select_diverse_candidates(
            candidates,
            max_evidence=4,
            max_per_source=3,
            vector_score_margin=0.05,
        )

        self.assertIn(second_source, {item.source_id for item in selected})

    def test_combines_vector_pools_and_recomputes_global_ranks(self) -> None:
        source_id = uuid.uuid4()
        low = _candidate(source_id=source_id, vector_score=0.70)
        high = _candidate(vector_score=0.95)

        combined = self.service._combine_vector_candidate_pools([low], [high, low])

        self.assertEqual(combined, [high, low])
        self.assertEqual([item.vector_rank for item in combined], [1, 2])

    def test_search_supplements_only_sources_missing_from_global_results(self) -> None:
        represented_source = uuid.uuid4()
        missing_source = uuid.uuid4()
        db = SimpleNamespace()
        global_candidate = _candidate(source_id=represented_source, vector_score=0.90)
        supplemental_candidate = _candidate(source_id=missing_source, vector_score=0.86)
        self.service.embedding_service = SimpleNamespace(
            embed_query_text_sync=lambda _query: SimpleNamespace(
                values=[0.1, 0.2],
                usage=SimpleNamespace(prompt_token_count=2, truncated=False),
            )
        )

        with patch.object(self.service, "_vector_candidates", return_value=[global_candidate]):
            with patch.object(
                self.service,
                "_supplemental_vector_candidates",
                return_value=[supplemental_candidate],
            ) as supplemental_mock:
                candidates, meta = self.service._search_attempt(
                    db=db,
                    query="lease termination",
                    bound_sources=[
                        (represented_source, "Represented"),
                        (missing_source, "Missing"),
                    ],
                    vector_top_k=24,
                    lexical_top_k=16,
                    diversity_per_source_top_k=2,
                    use_lexical_fusion=False,
                )

        self.assertEqual({candidate.source_id for candidate in candidates}, {represented_source, missing_source})
        self.assertEqual(meta["global_vector_count"], 1)
        self.assertEqual(meta["supplemental_vector_count"], 1)
        supplemental_mock.assert_called_once_with(
            db,
            embedding=[0.1, 0.2],
            source_ids=[missing_source],
            per_source_limit=2,
        )


class EvidencePackSourceGroupingTests(unittest.TestCase):
    def test_assigns_stable_short_keys_by_source_id(self) -> None:
        first_source = uuid.uuid4()
        second_source = uuid.uuid4()
        evidence = [
            EvidenceItem("E01", first_source, "Duplicate", 1, "First", 0.9),
            EvidenceItem("E02", first_source, "Duplicate", 2, "Second", 0.8),
            EvidenceItem("E03", second_source, "Duplicate", 3, "Third", 0.7),
        ]

        evidence_pack = build_evidence_pack(evidence)

        self.assertIn('[E01] source_key="S01" source="Duplicate" page=1', evidence_pack)
        self.assertIn('[E02] source_key="S01" source="Duplicate" page=2', evidence_pack)
        self.assertIn('[E03] source_key="S02" source="Duplicate" page=3', evidence_pack)


if __name__ == "__main__":
    unittest.main()
