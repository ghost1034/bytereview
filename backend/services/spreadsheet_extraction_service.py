from __future__ import annotations

import os
from typing import Any

from openpyxl import load_workbook


class SpreadsheetExtractionService:
    """Render XLSX workbooks into deterministic text for Gemini extraction."""

    def __init__(self) -> None:
        self.max_rows_per_sheet = int(os.getenv("EXTRACTION_XLSX_MAX_ROWS_PER_SHEET", "1000"))
        self.max_cols_per_sheet = int(os.getenv("EXTRACTION_XLSX_MAX_COLS_PER_SHEET", "100"))
        self.max_chars = int(os.getenv("EXTRACTION_XLSX_MAX_CHARS", "200000"))

    def _format_value(self, value: Any) -> str:
        if value is None:
            return ""
        return str(value).replace("\n", " ").replace("\r", " ").strip()

    def render_xlsx_local_to_text(self, local_path: str, filename: str | None = None) -> str:
        values_wb = load_workbook(local_path, read_only=True, data_only=True)
        formulas_wb = load_workbook(local_path, read_only=True, data_only=False)
        parts: list[str] = []
        try:
            title = filename or os.path.basename(local_path)
            parts.append(f"Workbook: {title}")

            for sheet_index, values_ws in enumerate(values_wb.worksheets, start=1):
                formulas_ws = formulas_wb[values_ws.title]
                max_row = min(values_ws.max_row or 0, self.max_rows_per_sheet)
                max_col = min(values_ws.max_column or 0, self.max_cols_per_sheet)
                parts.append(
                    f"\nSheet {sheet_index}: {values_ws.title} "
                    f"(rows={values_ws.max_row}, columns={values_ws.max_column})"
                )

                if max_row <= 0 or max_col <= 0:
                    parts.append("(empty sheet)")
                    continue

                rows_added = 0
                for row_number in range(1, max_row + 1):
                    cells: list[str] = []
                    row_has_value = False
                    for col_number in range(1, max_col + 1):
                        value_cell = values_ws.cell(row=row_number, column=col_number)
                        formula_cell = formulas_ws.cell(row=row_number, column=col_number)
                        display = self._format_value(value_cell.value)
                        formula = self._format_value(formula_cell.value)
                        if formula.startswith("=") and formula != display:
                            display = f"{display} [formula: {formula}]" if display else f"[formula: {formula}]"
                        if display:
                            row_has_value = True
                        cells.append(display)

                    if row_has_value:
                        rows_added += 1
                        parts.append(f"R{row_number}: " + " | ".join(cells).rstrip(" |"))

                    current = "\n".join(parts)
                    if len(current) >= self.max_chars:
                        return current[: self.max_chars] + "\n[TRUNCATED]"

                if (values_ws.max_row or 0) > self.max_rows_per_sheet:
                    parts.append(f"[TRUNCATED rows after {self.max_rows_per_sheet}]")
                if (values_ws.max_column or 0) > self.max_cols_per_sheet:
                    parts.append(f"[TRUNCATED columns after {self.max_cols_per_sheet}]")
                if rows_added == 0:
                    parts.append("(no non-empty rows found in inspected range)")

            return "\n".join(parts)[: self.max_chars]
        finally:
            values_wb.close()
            formulas_wb.close()


spreadsheet_extraction_service = SpreadsheetExtractionService()
