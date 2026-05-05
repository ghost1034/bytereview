from __future__ import annotations

import os
import shutil
import tempfile
import unittest
from types import SimpleNamespace

from docx import Document

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

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

    def _create_csv(self, content: str) -> str:
        handle = tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w", encoding="utf-8")
        try:
            handle.write(content)
        finally:
            handle.close()
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


if __name__ == "__main__":
    unittest.main()
