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


if __name__ == "__main__":
    unittest.main()
