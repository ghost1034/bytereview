from __future__ import annotations

import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from google.genai import types

from inkwise.services.vertex_ai import VertexAIError, generate_content_stream, generate_text_stream


class _FakeAsyncClient:
    def __init__(self, responses: list[object]):
        self._responses = responses
        self.models = self
        self.calls: list[dict[str, object]] = []

    async def generate_content_stream(self, **kwargs):
        self.calls.append(kwargs)

        async def _iterator():
            for response in self._responses:
                if isinstance(response, Exception):
                    raise response
                if isinstance(response, tuple) and response and response[0] == "sleep":
                    await asyncio.sleep(float(response[1]))
                    continue
                yield response

        return _iterator()


class VertexAIStreamingTests(unittest.IsolatedAsyncioTestCase):
    async def test_generate_content_stream_yields_text_chunks(self) -> None:
        fake_client = _FakeAsyncClient(
            responses=[
                SimpleNamespace(text="Hello", candidates=[]),
                SimpleNamespace(text=" world", candidates=[SimpleNamespace(finish_reason="STOP")]),
            ]
        )

        with patch("inkwise.services.vertex_ai.get_inkwise_settings", return_value=SimpleNamespace(project_id="test-project", location="us-central1")):
            with patch("inkwise.services.vertex_ai._get_async_client", return_value=fake_client):
                chunks = [
                    chunk
                    async for chunk in generate_content_stream(
                        model="gemini-test",
                        contents=[{"role": "user", "parts": [{"text": "Say hello"}]}],
                        generation_config={"temperature": 0.3, "max_output_tokens": 32},
                        timeout_seconds=1,
                    )
                ]

        self.assertEqual([chunk.text for chunk in chunks], ["Hello", " world"])
        self.assertEqual(chunks[-1].finish_reason, "STOP")
        self.assertEqual(len(fake_client.calls), 1)
        self.assertEqual(fake_client.calls[0]["model"], "gemini-test")
        self.assertIsInstance(fake_client.calls[0]["config"], types.GenerateContentConfig)
        self.assertEqual(fake_client.calls[0]["config"].temperature, 0.3)
        self.assertEqual(fake_client.calls[0]["config"].max_output_tokens, 32)

    async def test_generate_text_stream_builds_prompt_contents(self) -> None:
        fake_client = _FakeAsyncClient(responses=[SimpleNamespace(text="Next clause", candidates=[])])

        with patch("inkwise.services.vertex_ai.get_inkwise_settings", return_value=SimpleNamespace(project_id="test-project", location="us-central1")):
            with patch("inkwise.services.vertex_ai._get_async_client", return_value=fake_client):
                chunks = [
                    chunk
                    async for chunk in generate_text_stream(
                        model="gemini-test",
                        prompt="Continue this sentence",
                        temperature=0.1,
                        max_output_tokens=12,
                        timeout_seconds=1,
                    )
                ]

        self.assertEqual([chunk.text for chunk in chunks], ["Next clause"])
        self.assertEqual(len(fake_client.calls), 1)
        contents = fake_client.calls[0]["contents"]
        self.assertEqual(len(contents), 1)
        self.assertEqual(contents[0].parts[0].text, "Continue this sentence")
        self.assertEqual(fake_client.calls[0]["config"].temperature, 0.1)
        self.assertEqual(fake_client.calls[0]["config"].max_output_tokens, 12)

    async def test_generate_content_stream_times_out(self) -> None:
        fake_client = _FakeAsyncClient(responses=[("sleep", 0.05), SimpleNamespace(text="Late", candidates=[])])

        with patch("inkwise.services.vertex_ai.get_inkwise_settings", return_value=SimpleNamespace(project_id="test-project", location="us-central1")):
            with patch("inkwise.services.vertex_ai._get_async_client", return_value=fake_client):
                with self.assertRaises(VertexAIError) as ctx:
                    async for _chunk in generate_content_stream(
                        model="gemini-test",
                        contents=[{"role": "user", "parts": [{"text": "Slow request"}]}],
                        timeout_seconds=0.01,
                    ):
                        pass

        self.assertIn("timed out", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
