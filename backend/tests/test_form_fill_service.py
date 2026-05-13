from __future__ import annotations

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from docx import Document
from openpyxl import Workbook
from PyPDF2 import PdfWriter

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.form_fill_service import FormFillService


class FormFillServiceDocxEditPlanTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = FormFillService()

    def _create_table_docx(self) -> str:
        document = Document()
        table = document.add_table(rows=2, cols=2)
        table.cell(0, 0).text = "Header A"
        table.cell(0, 1).text = "Header B"
        table.cell(1, 0).text = "Value A1"
        table.cell(1, 1).text = "Value B1"

        handle = tempfile.NamedTemporaryFile(suffix=".docx", delete=False)
        handle.close()
        document.save(handle.name)
        self.addCleanup(lambda: os.path.exists(handle.name) and os.unlink(handle.name))
        return handle.name

    def _create_merged_table_docx(self) -> str:
        document = Document()
        table = document.add_table(rows=5, cols=3)

        title_cell = table.cell(0, 0).merge(table.cell(0, 2))
        title_cell.text = "Inventory"

        header_label = table.cell(1, 0).merge(table.cell(1, 1))
        header_label.text = "DESCRIPTION"
        table.cell(1, 2).text = "AMOUNT/VALUE"

        item_label = table.cell(2, 0).merge(table.cell(2, 1))
        item_label.text = "Oak dining table"
        table.cell(2, 2).text = "850.00"

        item_label = table.cell(3, 0).merge(table.cell(3, 1))
        item_label.text = "2018 Toyota Camry"
        table.cell(3, 2).text = "14250.00"

        total_cell = table.cell(4, 0).merge(table.cell(4, 2))
        total_cell.text = "TOTAL INVENTORY: $ 15100.00"

        handle = tempfile.NamedTemporaryFile(suffix=".docx", delete=False)
        handle.close()
        document.save(handle.name)
        self.addCleanup(lambda: os.path.exists(handle.name) and os.unlink(handle.name))
        return handle.name

    def _temp_output_path(self) -> str:
        handle = tempfile.NamedTemporaryFile(suffix=".docx", delete=False)
        handle.close()
        self.addCleanup(lambda: os.path.exists(handle.name) and os.unlink(handle.name))
        return handle.name

    def test_apply_docx_edit_plan_inserts_row_after_selected_row(self) -> None:
        source_path = self._create_table_docx()
        output_path = self._temp_output_path()

        warnings = self.service._apply_docx_edit_plan(
            source_path,
            [
                {
                    "action": "insert_table_row_after",
                    "table_id": "table.0",
                    "row_index": 0,
                    "cells": ["Header C", "Header D"],
                }
            ],
            output_path,
            allow_table_expansion=True,
        )

        self.assertEqual(warnings, [])
        document = Document(output_path)
        table = document.tables[0]
        self.assertEqual(len(table.rows), 3)
        self.assertEqual([cell.text for cell in table.rows[1].cells], ["Header C", "Header D"])
        self.assertEqual([cell.text for cell in table.rows[2].cells], ["Value A1", "Value B1"])

    def test_apply_docx_edit_plan_inserts_column_after_selected_column(self) -> None:
        source_path = self._create_table_docx()
        output_path = self._temp_output_path()

        warnings = self.service._apply_docx_edit_plan(
            source_path,
            [
                {
                    "action": "insert_table_column_after",
                    "table_id": "table.0",
                    "column_index": 0,
                    "cells": ["Header Inserted", "Value Inserted"],
                }
            ],
            output_path,
            allow_table_expansion=True,
        )

        self.assertEqual(warnings, [])
        document = Document(output_path)
        table = document.tables[0]
        self.assertEqual(len(table.rows[0].cells), 3)
        self.assertEqual([cell.text for cell in table.rows[0].cells], ["Header A", "Header Inserted", "Header B"])
        self.assertEqual([cell.text for cell in table.rows[1].cells], ["Value A1", "Value Inserted", "Value B1"])

    def test_apply_docx_edit_plan_blocks_table_growth_when_not_allowed(self) -> None:
        source_path = self._create_table_docx()
        output_path = self._temp_output_path()

        warnings = self.service._apply_docx_edit_plan(
            source_path,
            [
                {
                    "action": "insert_table_row_after",
                    "table_id": "table.0",
                    "row_index": 0,
                    "cells": ["Blocked A", "Blocked B"],
                }
            ],
            output_path,
            allow_table_expansion=False,
        )

        self.assertEqual(len(warnings), 1)
        self.assertIn("not permitted", warnings[0])
        document = Document(output_path)
        table = document.tables[0]
        self.assertEqual(len(table.rows), 2)
        self.assertEqual([cell.text for cell in table.rows[1].cells], ["Value A1", "Value B1"])

    def test_collect_docx_tables_uses_logical_cells_for_merged_rows(self) -> None:
        source_path = self._create_merged_table_docx()

        document = Document(source_path)
        tables, _table_map = self.service._collect_docx_tables(document)

        self.assertEqual(len(tables), 1)
        self.assertEqual(tables[0]["columns"], 2)
        self.assertEqual(
            tables[0]["preview_rows"],
            [
                "row 0: Inventory",
                "row 1: DESCRIPTION | AMOUNT/VALUE",
                "row 2: Oak dining table | 850.00",
                "row 3: 2018 Toyota Camry | 14250.00",
                "row 4: TOTAL INVENTORY: $ 15100.00",
            ],
        )

    def test_extract_docx_text_does_not_repeat_merged_cell_text(self) -> None:
        source_path = self._create_merged_table_docx()

        text = self.service._extract_docx_text(source_path)

        self.assertEqual(text.count("TOTAL INVENTORY: $ 15100.00"), 1)
        self.assertIn("DESCRIPTION | AMOUNT/VALUE", text)

    def test_apply_docx_edit_plan_inserts_row_into_merged_table_using_logical_cells(self) -> None:
        source_path = self._create_merged_table_docx()
        output_path = self._temp_output_path()

        warnings = self.service._apply_docx_edit_plan(
            source_path,
            [
                {
                    "action": "insert_table_row_after",
                    "table_id": "table.0",
                    "row_index": 2,
                    "cells": ["Savings account ending 4421", "6325.47"],
                }
            ],
            output_path,
            allow_table_expansion=True,
        )

        self.assertEqual(warnings, [])
        document = Document(output_path)
        table = document.tables[0]
        inserted_cells = self.service._docx_row_cells(table.rows[3])
        self.assertEqual([cell.text for cell in inserted_cells], ["Savings account ending 4421", "6325.47"])

    def test_apply_docx_edit_plan_blocks_column_insertion_for_merged_table(self) -> None:
        source_path = self._create_merged_table_docx()
        output_path = self._temp_output_path()

        warnings = self.service._apply_docx_edit_plan(
            source_path,
            [
                {
                    "action": "insert_table_column_after",
                    "table_id": "table.0",
                    "column_index": 0,
                    "cells": ["Inserted"] * 5,
                }
            ],
            output_path,
            allow_table_expansion=True,
        )

        self.assertEqual(warnings, ["Could not insert a table column because the table contains merged cells."])
        document = Document(output_path)
        table = document.tables[0]
        self.assertEqual(len(self.service._docx_row_cells(table.rows[1])), 2)


class FormFillServiceSourceContextTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.service = FormFillService()

    def test_combine_extraction_payloads_aligns_all_rows_to_unified_columns(self) -> None:
        payload = self.service._combine_extraction_payloads(
            [
                {
                    "columns": ["Name", "Amount"],
                    "rows": [["Acme", 100], ["Beta", 250]],
                    "source_files": ["first.pdf"],
                },
                {
                    "columns": ["Tax ID", "Name"],
                    "rows": [["12-3456789", "Gamma"]],
                    "source_files": ["second.pdf", "first.pdf"],
                },
            ],
            job_id="job-id",
            run_id="run-id",
        )

        self.assertEqual(payload["scope"], "all")
        self.assertIsNone(payload["task_id"])
        self.assertEqual(payload["columns"], ["Name", "Amount", "Tax ID"])
        self.assertEqual(
            payload["rows"],
            [
                ["Acme", 100, None],
                ["Beta", 250, None],
                ["Gamma", None, "12-3456789"],
            ],
        )
        self.assertEqual(payload["source_files"], ["first.pdf", "second.pdf"])

    def _create_csv(self, content: str) -> str:
        handle = tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w", encoding="utf-8")
        try:
            handle.write(content)
        finally:
            handle.close()
        self.addCleanup(lambda: os.path.exists(handle.name) and os.unlink(handle.name))
        return handle.name

    def _create_xlsx(self, rows: list[list[object]]) -> str:
        workbook = Workbook()
        worksheet = workbook.active
        for row in rows:
            worksheet.append(row)

        handle = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
        handle.close()
        workbook.save(handle.name)
        workbook.close()
        self.addCleanup(lambda: os.path.exists(handle.name) and os.unlink(handle.name))
        return handle.name

    async def test_build_source_context_labels_multiple_uploaded_csv_sources(self) -> None:
        first_path = self._create_csv("Name,Amount\nChecking,100\n")
        second_path = self._create_csv("Name,Amount\nSavings,250\n")

        async def fake_download(object_name: str, local_path: str) -> None:
            shutil.copyfile({"first": first_path, "second": second_path}[object_name], local_path)

        self.service._download_to_local = fake_download
        run = SimpleNamespace(
            id="run-id",
            user_id="user-id",
            source_payload=None,
            source_files=[
                SimpleNamespace(
                    id="source-1",
                    original_filename="first.csv",
                    file_type="text/csv",
                    gcs_object_name="first",
                    display_order=0,
                ),
                SimpleNamespace(
                    id="source-2",
                    original_filename="second.csv",
                    file_type="text/csv",
                    gcs_object_name="second",
                    display_order=1,
                ),
            ],
            source_gcs_object_name=None,
            source_file_type=None,
        )

        source_parts, source_text = await self.service._build_source_context(
            run=run,
            source_parts=[],
            source_text_sections=[],
        )

        self.assertEqual(source_parts, [])
        self.assertIn("Source file 1: first.csv", source_text)
        self.assertIn("| Checking | 100 |", source_text)
        self.assertIn("Source file 2: second.csv", source_text)
        self.assertIn("| Savings | 250 |", source_text)

    async def test_build_source_context_supports_legacy_single_source_upload(self) -> None:
        csv_path = self._create_csv("Field,Value\nOwner,Jane\n")

        async def fake_download(object_name: str, local_path: str) -> None:
            self.assertEqual(object_name, "legacy-object")
            shutil.copyfile(csv_path, local_path)

        self.service._download_to_local = fake_download
        run = SimpleNamespace(
            id="run-id",
            user_id="user-id",
            source_payload=None,
            source_files=[],
            source_gcs_object_name="legacy-object",
            source_file_type="text/csv",
            source_filename="legacy.csv",
        )

        _source_parts, source_text = await self.service._build_source_context(
            run=run,
            source_parts=[],
            source_text_sections=[],
        )

        self.assertIn("Source file 1: legacy.csv", source_text)
        self.assertIn("| Owner | Jane |", source_text)

    async def test_build_source_context_does_not_cap_extraction_result_rows(self) -> None:
        self.service.max_spreadsheet_rows = 1
        run = SimpleNamespace(
            id="run-id",
            user_id="user-id",
            source_payload={
                "kind": "extraction_result",
                "columns": ["Name"],
                "rows": [["first"], ["second"], ["third"]],
                "source_files": ["source.pdf"],
            },
            source_files=[],
            source_gcs_object_name=None,
            source_file_type=None,
        )

        _source_parts, source_text = await self.service._build_source_context(
            run=run,
            source_parts=[],
            source_text_sections=[],
        )

        self.assertIn("| first |", source_text)
        self.assertIn("| second |", source_text)
        self.assertIn("| third |", source_text)

    async def test_extract_repeat_records_does_not_cap_extraction_result_rows(self) -> None:
        self.service.max_repeat_records = 1
        run = SimpleNamespace(
            source_payload={
                "kind": "extraction_result",
                "columns": ["Name"],
                "rows": [["first"], ["second"], ["third"]],
            },
            source_files=[],
        )

        records = await self.service._extract_repeat_records(run)

        self.assertEqual([record["record_label"] for record in records], ["first", "second", "third"])

    def test_load_csv_text_does_not_cap_input_rows_or_characters(self) -> None:
        self.service.max_spreadsheet_rows = 1
        self.service.max_sheet_chars = 20
        csv_path = self._create_csv("Name,Amount\nfirst,1\nsecond,2\nthird,3\n")

        source_text = self.service._load_csv_text(csv_path)

        self.assertIn("| first | 1 |", source_text)
        self.assertIn("| second | 2 |", source_text)
        self.assertIn("| third | 3 |", source_text)

    def test_load_xlsx_text_does_not_cap_input_rows_or_characters(self) -> None:
        self.service.max_spreadsheet_rows = 1
        self.service.max_sheet_chars = 20
        xlsx_path = self._create_xlsx([
            ["Name", "Amount"],
            ["first", 1],
            ["second", 2],
            ["third", 3],
        ])

        source_text = self.service._load_xlsx_text(xlsx_path)

        self.assertIn("| first | 1 |", source_text)
        self.assertIn("| second | 2 |", source_text)
        self.assertIn("| third | 3 |", source_text)

    def test_load_csv_records_does_not_cap_output_rows(self) -> None:
        self.service.max_repeat_records = 1
        csv_path = self._create_csv("Name,Amount\nfirst,1\nsecond,2\nthird,3\n")

        records = self.service._load_csv_records(csv_path)

        self.assertEqual([record["record_label"] for record in records], ["first", "second", "third"])

    def test_load_xlsx_records_does_not_cap_output_rows(self) -> None:
        self.service.max_repeat_records = 1
        xlsx_path = self._create_xlsx([
            ["Name", "Amount"],
            ["first", 1],
            ["second", 2],
            ["third", 3],
        ])

        records = self.service._load_xlsx_records(xlsx_path)

        self.assertEqual([record["record_label"] for record in records], ["first", "second", "third"])

    def test_load_csv_records_uses_header_row_and_name_label(self) -> None:
        csv_path = self._create_csv("Participant Name,Email\nJane Doe,jane@example.com\nJohn Smith,john@example.com\n")

        records = self.service._load_csv_records(csv_path)

        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["record_index"], 0)
        self.assertEqual(records[0]["record_label"], "Jane Doe")
        self.assertEqual(records[0]["record_payload"]["Email"], "jane@example.com")
        self.assertEqual(records[1]["record_label"], "John Smith")

    def test_record_source_text_scopes_prompt_to_one_record(self) -> None:
        source_text = self.service._record_source_text(
            {
                "record_payload": {
                    "Participant Name": "Jane Doe",
                    "Email": "jane@example.com",
                }
            }
        )

        self.assertIn("single source record only", source_text)
        self.assertIn("Participant Name: Jane Doe", source_text)
        self.assertIn("Email: jane@example.com", source_text)


class FormFillServiceContinuationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = FormFillService()

    def _response(
        self,
        *,
        text: str | None = None,
        parsed: dict[str, object] | None = None,
        finish_reason: str = "STOP",
        output_tokens: int = 10,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            text=text,
            parsed=parsed,
            candidates=[SimpleNamespace(finish_reason=finish_reason)],
            usage_metadata=SimpleNamespace(candidates_token_count=output_tokens),
        )

    def test_salvages_complete_operations_from_truncated_json(self) -> None:
        text = '{"operations":[{"action":"replace_block_text","block_id":"a"},{"action":"insert_after_block","block_id":"b"},'

        operations = self.service._salvage_collection_from_text(text, "operations")

        self.assertEqual(
            operations,
            [
                {"action": "replace_block_text", "block_id": "a"},
                {"action": "insert_after_block", "block_id": "b"},
            ],
        )

    def test_collection_continuation_merges_overlap_without_duplication(self) -> None:
        self.service.client = SimpleNamespace(
            models=SimpleNamespace(
                generate_content=MagicMock(
                    side_effect=[
                        self._response(
                            text='{"operations":[{"action":"replace_block_text","block_id":"a"},{"action":"insert_after_block","block_id":"b"},',
                            finish_reason="MAX_TOKENS",
                        ),
                        self._response(
                            text=(
                                '{"operations":['
                                '{"action":"insert_after_block","block_id":"b"},'
                                '{"action":"append_to_block","block_id":"c"}'
                                '],"warnings":["continued"]}'
                            )
                        ),
                    ]
                )
            )
        )

        payload = self.service._generate_collection_json_response(
            [],
            prompt="Edit the DOCX.",
            schema=self.service._docx_edit_schema(),
            collection_key="operations",
            label="test",
        )

        self.assertEqual(
            payload["operations"],
            [
                {"action": "replace_block_text", "block_id": "a"},
                {"action": "insert_after_block", "block_id": "b"},
                {"action": "append_to_block", "block_id": "c"},
            ],
        )
        self.assertEqual(payload["warnings"], ["continued"])
        self.assertEqual(self.service.client.models.generate_content.call_count, 2)
        continuation_contents = self.service.client.models.generate_content.call_args_list[1].kwargs["contents"]
        self.assertIn(
            'prior_tail_entries already returned, in order: [{"action":"replace_block_text","block_id":"a"},{"action":"insert_after_block","block_id":"b"}]',
            continuation_contents[-1],
        )
        self.assertIn("Do not summarize, collapse, or replace remaining entries", continuation_contents[-1])
        self.assertIn("Do not write 'see attached'", continuation_contents[-1])

    def test_collection_continuation_continues_on_full_batch_without_truncation(self) -> None:
        self.service.batch_items_per_call = 2
        self.service.client = SimpleNamespace(
            models=SimpleNamespace(
                generate_content=MagicMock(
                    side_effect=[
                        self._response(
                            parsed={
                                "operations": [
                                    {"action": "replace_block_text", "block_id": "a"},
                                    {"action": "insert_after_block", "block_id": "b"},
                                ],
                                "warnings": [],
                            },
                            finish_reason="STOP",
                            output_tokens=10,
                        ),
                        self._response(
                            parsed={
                                "operations": [
                                    {"action": "append_to_block", "block_id": "c"},
                                ],
                                "warnings": [],
                            },
                            finish_reason="STOP",
                            output_tokens=10,
                        ),
                        self._response(
                            parsed={
                                "operations": [],
                                "warnings": [],
                            },
                            finish_reason="STOP",
                            output_tokens=10,
                        ),
                    ]
                )
            )
        )

        payload = self.service._generate_collection_json_response(
            [],
            prompt="Edit the DOCX.",
            schema=self.service._docx_edit_schema(),
            collection_key="operations",
            label="test",
            continue_on_full_batch=True,
        )

        self.assertEqual(
            payload["operations"],
            [
                {"action": "replace_block_text", "block_id": "a"},
                {"action": "insert_after_block", "block_id": "b"},
                {"action": "append_to_block", "block_id": "c"},
            ],
        )
        self.assertEqual(self.service.client.models.generate_content.call_count, 3)

    def test_collection_batching_continues_on_clean_non_full_batch(self) -> None:
        self.service.batch_items_per_call = 5
        self.service.client = SimpleNamespace(
            models=SimpleNamespace(
                generate_content=MagicMock(
                    side_effect=[
                        self._response(
                            parsed={
                                "operations": [{"action": "replace_block_text", "block_id": "a"}],
                                "warnings": [],
                            },
                            finish_reason="STOP",
                            output_tokens=10,
                        ),
                        self._response(
                            parsed={
                                "operations": [{"action": "append_to_block", "block_id": "b"}],
                                "warnings": [],
                            },
                            finish_reason="STOP",
                            output_tokens=10,
                        ),
                        self._response(
                            parsed={
                                "operations": [],
                                "warnings": [],
                            },
                            finish_reason="STOP",
                            output_tokens=10,
                        ),
                    ]
                )
            )
        )

        payload = self.service._generate_collection_json_response(
            [],
            prompt="Edit the DOCX.",
            schema=self.service._docx_edit_schema(),
            collection_key="operations",
            label="test",
            continue_on_full_batch=True,
        )

        self.assertEqual(
            payload["operations"],
            [
                {"action": "replace_block_text", "block_id": "a"},
                {"action": "append_to_block", "block_id": "b"},
            ],
        )
        self.assertEqual(self.service.client.models.generate_content.call_count, 3)

    def test_collection_filters_output_limit_warnings_for_continuable_outputs(self) -> None:
        self.service.client = SimpleNamespace(
            models=SimpleNamespace(
                generate_content=MagicMock(
                    side_effect=[
                        self._response(
                            parsed={
                                "operations": [{"action": "append_to_block", "block_id": "a"}],
                                "warnings": [
                                    "The source material contains over 500 transactions and would exceed output limits.",
                                    "Unable to calculate exact totals due to the large volume of transactions.",
                                    "Due to the large number of transactions, only the first 100 chronological transactions have been inserted. Please request continuation to insert the remaining rows.",
                                    "Missing date for one transaction.",
                                ],
                            }
                        ),
                        self._response(parsed={"operations": [], "warnings": []}),
                    ]
                )
            )
        )

        payload = self.service._generate_collection_json_response(
            [],
            prompt="Edit the DOCX.",
            schema=self.service._docx_edit_schema(),
            collection_key="operations",
            label="test",
            continue_on_full_batch=True,
        )

        self.assertEqual(payload["warnings"], ["Missing date for one transaction."])

    def test_collection_continuation_does_not_continue_full_batch_when_disabled(self) -> None:
        self.service.batch_items_per_call = 2
        self.service.client = SimpleNamespace(
            models=SimpleNamespace(
                generate_content=MagicMock(
                    return_value=self._response(
                        parsed={
                            "items": [
                                {"name": "A", "value": "1"},
                                {"name": "B", "value": "2"},
                            ],
                            "warnings": [],
                        },
                        finish_reason="STOP",
                        output_tokens=10,
                    )
                )
            )
        )

        payload = self.service._generate_collection_json_response(
            [],
            prompt="Map known fields.",
            schema=self.service._field_mapping_schema(),
            collection_key="items",
            label="test",
        )

        self.assertEqual(payload["items"], [{"name": "A", "value": "1"}, {"name": "B", "value": "2"}])
        self.assertEqual(self.service.client.models.generate_content.call_count, 1)

    def test_mapping_payload_chunks_known_names(self) -> None:
        self.service.mapping_chunk_size = 2
        self.service.client = SimpleNamespace(
            models=SimpleNamespace(
                generate_content=MagicMock(
                    side_effect=[
                        self._response(parsed={"items": [{"name": "A", "value": "1"}, {"name": "B", "value": "2"}], "warnings": []}),
                        self._response(parsed={"items": [{"name": "C", "value": "3"}], "warnings": ["check C"]}),
                    ]
                )
            )
        )

        payload = self.service._generate_mapping_payload(
            [],
            source_text="Source",
            mapping_items=["A", "B", "C"],
            mapping_label="Names",
            target_hint="target",
            label="mapping",
        )

        self.assertEqual(payload["items"], [{"name": "A", "value": "1"}, {"name": "B", "value": "2"}, {"name": "C", "value": "3"}])
        self.assertEqual(payload["warnings"], ["check C"])
        self.assertEqual(self.service.client.models.generate_content.call_count, 2)
        first_prompt = self.service.client.models.generate_content.call_args_list[0].kwargs["contents"][-1]
        second_prompt = self.service.client.models.generate_content.call_args_list[1].kwargs["contents"][-1]
        self.assertIn("- A", first_prompt)
        self.assertIn("- B", first_prompt)
        self.assertNotIn("- C", first_prompt)
        self.assertIn("- C", second_prompt)

    def test_form_fill_prompts_forbid_output_limit_workarounds(self) -> None:
        pdf_prompt = self.service._build_pdf_overlay_prompt(source_text="Rows", target_preview_text="Target")
        docx_prompt = self.service._build_docx_edit_prompt(
            source_text="Rows",
            block_summary="Blocks",
            table_summary="Tables",
            target_preview_text="Target",
            allow_table_expansion=True,
        )

        self.assertIn("Do not summarize, collapse, or omit entries", pdf_prompt)
        self.assertIn("Do not write \"see attached\"", pdf_prompt)
        self.assertIn("Do not ask the user to request continuation", pdf_prompt)
        self.assertIn("emit one insert_table_row_after operation per source row", docx_prompt)
        self.assertIn("Calculate totals", docx_prompt)
        self.assertIn("Do not insert only the first N rows", docx_prompt)
        self.assertIn("Do not claim totals cannot be calculated", docx_prompt)

    def test_compact_fill_plan_stores_counts_and_samples(self) -> None:
        compact = self.service._compact_fill_plan(
            {
                "strategy": "docx_edit_in_place",
                "operations": [{"action": str(index)} for index in range(25)],
                "field_values": {str(index): index for index in range(60)},
            }
        )

        self.assertEqual(compact["strategy"], "docx_edit_in_place")
        self.assertEqual(compact["operations_count"], 25)
        self.assertEqual(len(compact["operations_sample"]), 20)
        self.assertEqual(compact["field_values_count"], 60)
        self.assertEqual(len(compact["field_values_sample"]), 50)


class FormFillServiceUsageTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.service = FormFillService()

    def _pdf_bytes(self, pages: int) -> bytes:
        handle = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        handle.close()
        self.addCleanup(lambda: os.path.exists(handle.name) and os.unlink(handle.name))
        writer = PdfWriter()
        for _ in range(pages):
            writer.add_blank_page(width=72, height=72)
        with open(handle.name, "wb") as output:
            writer.write(output)
        with open(handle.name, "rb") as source:
            return source.read()

    async def test_count_target_pages_from_pdf_bytes(self) -> None:
        page_count = await self.service._count_target_pages_from_bytes(
            content=self._pdf_bytes(3),
            filename="target.pdf",
            mime_type="application/pdf",
        )

        self.assertEqual(page_count, 3)

    def test_check_usage_limit_raises_with_clear_message(self) -> None:
        billing_service = MagicMock()
        billing_service.check_page_limit.return_value = False
        billing_service.get_billing_info.return_value = {
            "plan_display_name": "Free",
            "pages_used": 8,
            "pages_included": 10,
        }

        with patch("services.billing_service.get_billing_service", return_value=billing_service):
            with self.assertRaisesRegex(ValueError, "processing 3 target pages"):
                self.service._check_usage_limit_or_raise(MagicMock(), user_id="user-id", page_count=3)

    def test_record_usage_for_run_uses_form_fill_run_source(self) -> None:
        billing_service = MagicMock()
        billing_service.record_usage.return_value = "event-id"
        run = SimpleNamespace(
            id="11111111-1111-1111-1111-111111111111",
            user_id="user-id",
            usage_pages=4,
            target_filename="target.pdf",
        )

        with patch("services.billing_service.get_billing_service", return_value=billing_service):
            self.service._record_usage_for_run(MagicMock(), run)

        billing_service.record_usage.assert_called_once_with(
            user_id="user-id",
            pages=4,
            source="form_fill_run",
            form_fill_run_id="11111111-1111-1111-1111-111111111111",
            notes="Form Fill run for target target.pdf",
        )


if __name__ == "__main__":
    unittest.main()
