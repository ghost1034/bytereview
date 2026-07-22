from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite://")

from fastapi import HTTPException

from routes.connector import (
    MCP_TOOLS,
    UDA_MCP_INSTRUCTIONS,
    UDA_MCP_TOOLS,
    _available_mcp_tools,
    _handle_mcp_message,
)
from services.uda_mcp_service import (
    MAX_RESULT_ROWS,
    UdaMcpError,
    UdaMcpService,
    _decode_cursor,
    _encode_cursor,
    _map_service_error,
)
from models.db_models import DataType, ExtractionResult, ExtractionTask, SourceFile, SourceFileToTask


class UdaToolContractTests(unittest.TestCase):
    def test_all_planned_tools_have_object_schemas(self) -> None:
        expected = {
            "get_document_analysis_options",
            "list_document_analysis_templates",
            "list_document_analyses",
            "create_document_analysis",
            "prepare_document_uploads",
            "complete_document_uploads",
            "configure_document_analysis",
            "start_document_analysis",
            "get_document_analysis_status",
            "get_document_analysis_results",
        }
        self.assertEqual({tool["name"] for tool in UDA_MCP_TOOLS}, expected)
        for tool in UDA_MCP_TOOLS:
            self.assertEqual(tool["inputSchema"]["type"], "object")
            self.assertIn("additionalProperties", tool["inputSchema"])

    def test_one_prompt_authorization_is_part_of_the_mcp_contract(self) -> None:
        start_tool = next(tool for tool in UDA_MCP_TOOLS if tool["name"] == "start_document_analysis")
        self.assertIn("initial request", start_tool["description"])
        self.assertIn("do not require a redundant confirmation", start_tool["description"])
        self.assertIn("one-prompt", UDA_MCP_INSTRUCTIONS)
        self.assertIn("do not ask for a second confirmation", UDA_MCP_INSTRUCTIONS)

    def test_feature_flag_defaults_on_and_preserves_integration_tools_when_disabled(self) -> None:
        env = {key: value for key, value in os.environ.items() if key != "CLAW_UDA_MCP_ENABLED"}
        with patch.dict(os.environ, env, clear=True):
            names = {tool["name"] for tool in _available_mcp_tools()}
        self.assertTrue({tool["name"] for tool in MCP_TOOLS}.issubset(names))
        self.assertIn("start_document_analysis", names)
        with patch.dict(os.environ, {"CLAW_UDA_MCP_ENABLED": "false"}):
            self.assertEqual(_available_mcp_tools(), MCP_TOOLS)

    def test_result_cursor_round_trip_and_invalid_cursor(self) -> None:
        self.assertEqual(_decode_cursor(_encode_cursor(MAX_RESULT_ROWS)), MAX_RESULT_ROWS)
        with self.assertRaises(UdaMcpError) as exc:
            _decode_cursor("not-a-cursor")
        self.assertEqual(exc.exception.code, "invalid_input")

    def test_stable_service_error_mapping(self) -> None:
        cases = [
            (HTTPException(status_code=409, detail="Upload not found for file a.pdf"), "upload_expired"),
            (ValueError("Processing would exceed your Free plan limit"), "plan_limit_exceeded"),
            (ValueError("Job not found or access denied"), "not_found"),
            (ValueError("Files are still being finalized"), "files_not_ready"),
        ]
        for error, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(_map_service_error(error).code, expected)


class UdaValidationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.service = UdaMcpService(job_service=MagicMock(), template_service=MagicMock())

    def test_supported_file_metadata_is_normalized(self) -> None:
        files = self.service._validate_file_metadata([
            {
                "filename": "report.DOCX",
                "path": "client/report.DOCX",
                "size_bytes": 100,
                "content_type": "application/octet-stream",
            }
        ])
        self.assertEqual(files[0].path, "client/report.DOCX")
        self.assertEqual(
            files[0].type,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

    def test_unsupported_and_oversized_files_are_rejected_before_upload(self) -> None:
        for item in [
            {"filename": "a.exe", "path": "a.exe", "size_bytes": 1, "content_type": "application/octet-stream"},
            {"filename": "a.pdf", "path": "a.pdf", "size_bytes": 50 * 1024 * 1024 + 1, "content_type": "application/pdf"},
        ]:
            with self.subTest(filename=item["filename"]):
                with self.assertRaises(UdaMcpError) as exc:
                    self.service._validate_file_metadata([item])
                self.assertEqual(exc.exception.code, "invalid_input")

    async def test_start_requires_literal_true_approval(self) -> None:
        for value in [None, False, 1, "true"]:
            with self.subTest(value=value):
                with self.assertRaises(UdaMcpError) as exc:
                    await self.service.start_analysis(MagicMock(), "user-a", {
                        "job_id": "job-a",
                        "confirmed_by_user": value,
                    })
                self.assertEqual(exc.exception.code, "approval_required")

    async def test_cross_user_or_missing_run_is_hidden_as_not_found(self) -> None:
        db = MagicMock()
        owned_query = db.query.return_value.join.return_value.filter.return_value
        owned_query.order_by.return_value.first.return_value = None
        with self.assertRaises(UdaMcpError) as exc:
            await self.service.get_status(db, "user-a", {"job_id": "someone-elses-job"})
        self.assertEqual(exc.exception.code, "not_found")

    async def test_submitted_start_is_idempotent(self) -> None:
        run = SimpleNamespace(id="run-a", config_step="submitted", status="in_progress")
        with patch.object(self.service, "_owned_run", return_value=run):
            result = await self.service.start_analysis(MagicMock(), "user-a", {
                "job_id": "job-a",
                "confirmed_by_user": True,
            })
        self.assertTrue(result["idempotent_replay"])
        self.service.job_service.submit_manual_job.assert_not_called()

    async def test_private_template_from_another_user_is_not_selectable(self) -> None:
        self.service.template_service.get_template = AsyncMock(return_value=None)
        with self.assertRaises(UdaMcpError) as exc:
            await self.service._validated_fields(MagicMock(), "user-a", {"template_id": "private-b"})
        self.assertEqual(exc.exception.code, "not_found")
        self.service.template_service.get_template.assert_awaited_once_with("private-b", "user-a")

    async def test_public_template_fields_are_selectable(self) -> None:
        template = SimpleNamespace(
            template_type="extraction",
            fields=[SimpleNamespace(name="Invoice", data_type="text", prompt="Invoice number")],
        )
        self.service.template_service.get_template = AsyncMock(return_value=template)
        fields, template_id = await self.service._validated_fields(
            MagicMock(), "user-a", {"template_id": "public-a"}
        )
        self.assertEqual(template_id, "public-a")
        self.assertEqual(fields[0]["field_name"], "Invoice")

    async def test_ad_hoc_fields_reject_case_insensitive_duplicates_and_unknown_types(self) -> None:
        db = MagicMock()
        db.query.return_value.all.return_value = [("text",)]
        with self.assertRaises(UdaMcpError) as duplicate:
            await self.service._validated_fields(db, "user-a", {"fields": [
                {"name": "Amount", "data_type": "text", "prompt": ""},
                {"name": "amount", "data_type": "text", "prompt": ""},
            ]})
        self.assertEqual(duplicate.exception.code, "invalid_input")
        with self.assertRaises(UdaMcpError) as unknown:
            await self.service._validated_fields(db, "user-a", {"fields": [
                {"name": "Amount", "data_type": "bogus", "prompt": ""},
            ]})
        self.assertEqual(unknown.exception.code, "invalid_input")

    async def test_results_are_flattened_and_capped_at_200_rows(self) -> None:
        run = SimpleNamespace(id="run-a", status="completed")
        task = SimpleNamespace(
            id="task-a",
            processing_mode="combined",
            result_set_index=0,
            created_at=None,
            status="completed",
        )
        result = SimpleNamespace(
            task_id="task-a",
            extracted_data={
                "columns": ["amount"],
                "results": [[index] for index in range(205)],
            },
        )
        source = SimpleNamespace(id="file-a", original_path="client/a.pdf")
        db = MagicMock()

        def query(*entities):
            mocked = MagicMock()
            if len(entities) == 1 and entities[0] is ExtractionTask:
                mocked.filter.return_value.order_by.return_value.all.return_value = [task]
            elif len(entities) == 1 and entities[0] is ExtractionResult:
                mocked.filter.return_value.all.return_value = [result]
            elif len(entities) == 2 and entities[0] is SourceFileToTask.task_id and entities[1] is SourceFile:
                mocked.join.return_value.filter.return_value.all.return_value = [("task-a", source)]
            else:
                raise AssertionError(f"Unexpected query: {entities}")
            return mocked

        db.query.side_effect = query
        with patch.object(self.service, "_owned_run", return_value=run):
            first = await self.service.get_results(db, "user-a", {"job_id": "job-a"})
            second = await self.service.get_results(db, "user-a", {
                "job_id": "job-a",
                "cursor": first["next_cursor"],
            })
        self.assertEqual(len(first["rows"]), 200)
        self.assertEqual(first["rows"][0]["data"], {"amount": 0})
        self.assertTrue(first["has_more"])
        self.assertEqual(len(second["rows"]), 5)
        self.assertFalse(second["has_more"])

    async def test_zip_still_unpacking_blocks_configuration(self) -> None:
        run = SimpleNamespace(id="run-a")
        archive = SimpleNamespace(
            id="zip-a",
            file_type="application/zip",
            original_filename="batch.zip",
            original_path="batch.zip",
            status="unpacking",
            page_count=None,
        )
        extracted = SimpleNamespace(
            id="file-a",
            file_type="application/pdf",
            original_filename="a.pdf",
            original_path="batch/a.pdf",
            status="uploaded",
            page_count=1,
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [archive, extracted]
        fields = [{"field_name": "A", "data_type_id": "text", "ai_prompt": "", "display_order": 0}]
        with patch.object(self.service, "_owned_run", return_value=run):
            with patch.object(self.service, "_validated_fields", new=AsyncMock(return_value=(fields, None))):
                with self.assertRaises(UdaMcpError) as exc:
                    await self.service.configure_analysis(db, "user-a", {"job_id": "job-a", "fields": [{}]})
        self.assertEqual(exc.exception.code, "files_not_ready")
        self.service.job_service.update_job_fields.assert_not_called()


class UdaDispatcherTests(unittest.IsolatedAsyncioTestCase):
    async def test_non_object_arguments_are_invalid_input(self) -> None:
        message = {
            "jsonrpc": "2.0",
            "id": 0,
            "method": "tools/call",
            "params": {"name": "get_document_analysis_options", "arguments": ["bad"]},
        }
        response = await _handle_mcp_message(MagicMock(), "user-a", message)
        payload = response["result"]["structuredContent"]
        self.assertEqual(payload["error"]["code"], "invalid_input")

    async def test_disabled_tool_is_not_callable(self) -> None:
        message = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": "get_document_analysis_options", "arguments": {}},
        }
        with patch.dict(os.environ, {"CLAW_UDA_MCP_ENABLED": "false"}):
            with patch("routes.connector.rate_limiter.check", return_value=True):
                response = await _handle_mcp_message(MagicMock(), "user-a", message)
        self.assertEqual(response["error"]["code"], -32602)

    async def test_enabled_dispatch_uses_success_envelope(self) -> None:
        message = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": "get_document_analysis_options", "arguments": {}},
        }
        with patch.dict(os.environ, {"CLAW_UDA_MCP_ENABLED": "true"}):
            with patch("routes.connector.rate_limiter.check", return_value=True):
                with patch("routes.connector.uda_mcp_service.get_options", new=AsyncMock(return_value={"processing_modes": ["individual"]})):
                    response = await _handle_mcp_message(MagicMock(), "user-a", message)
        payload = response["result"]["structuredContent"]
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["data"]["processing_modes"], ["individual"])

    async def test_expected_error_uses_machine_readable_error_envelope(self) -> None:
        message = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "start_document_analysis", "arguments": {"job_id": "a"}},
        }
        with patch.dict(os.environ, {"CLAW_UDA_MCP_ENABLED": "true"}):
            with patch("routes.connector.rate_limiter.check", return_value=True):
                with patch("routes.connector.audit_uda_mcp_call"):
                    response = await _handle_mcp_message(MagicMock(), "user-a", message)
        payload = response["result"]["structuredContent"]
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], "approval_required")

    async def test_state_change_audit_receives_metadata_not_tool_payload(self) -> None:
        message = {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "prepare_document_uploads",
                "arguments": {"job_id": "job-a", "files": [{"document_contents": "secret"}]},
            },
        }
        service_result = {"uploads": [{"upload_url": "https://signed.example/secret"}]}
        with patch.dict(os.environ, {"CLAW_UDA_MCP_ENABLED": "true"}):
            with patch("routes.connector.rate_limiter.check", return_value=True):
                with patch("routes.connector.uda_mcp_service.prepare_uploads", new=AsyncMock(return_value=service_result)):
                    with patch("routes.connector.audit_uda_mcp_call") as audit:
                        response = await _handle_mcp_message(MagicMock(), "user-a", message)
        self.assertTrue(response["result"]["structuredContent"]["ok"])
        audit.assert_called_once()
        audited = repr(audit.call_args)
        self.assertNotIn("document_contents", audited)
        self.assertNotIn("signed.example", audited)


if __name__ == "__main__":
    unittest.main()
