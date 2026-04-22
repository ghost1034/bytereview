from __future__ import annotations

import os
import tempfile
import unittest

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


if __name__ == "__main__":
    unittest.main()
