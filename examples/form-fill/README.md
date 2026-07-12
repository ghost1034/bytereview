# Form Fill example files

Example source and target documents for demonstrating the Form Fill module.
All data is fictional; TINs use invalid ranges (900-xx SSNs, 98-xxxxxxx EINs).

## Targets

| File | Strategy demonstrated |
| --- | --- |
| `fw9.pdf` | **Fillable PDF** — an AcroForm W-9; Form Fill detects the form fields and fills them directly. |
| `targets/schedule-of-business-expenses.docx` | **DOCX edit in place** — a blank expense workpaper with no placeholder tokens. Its table has only 3 blank entry rows plus a Total row, so it needs table expansion for realistic data sets. |

## Sources

| File(s) | Feature demonstrated |
| --- | --- |
| `sources/contractors.csv` | **Fill once per row** — 5 contractor records → 5 filled W-9s (ZIP). Per-row mode is only offered for a single CSV/XLSX source. |
| `sources/willow-creek/` (`company-profile.docx` + `tax-details.pdf`) | **Fill once for all files** — each file holds part of one entity's info (profile: legal name/entity type; tax sheet: address/EIN). Together they fill a single W-9. |
| `sources/clients/` (3 DOCX profiles) | **Fill once per file** — each client information sheet fills its own W-9 → 3 documents. |
| `sources/expenses-2025.csv` | **Table expansion + chronological order** — 8 dated rows, deliberately shuffled. Fill into the expense schedule (fill once for all files) with "Allow AI to add new rows" enabled; output should be sorted oldest-first with rows added beyond the original 3. |
| `sources/receipts/` (`receipt-01.pdf` … `receipt-08.pdf`) | **Extraction results as source** — run a Universal Document Analysis extraction over the receipts (date, payee, category, amount), click **Use in Form Fill**, and fill the expense schedule from the extracted rows. |

The receipts contain the same 8 records as `expenses-2025.csv`, so the CSV path
and the extraction path produce the same filled schedule — useful for showing
both routes side by side.

## Suggested demo runs

1. **Fillable PDF, per row** — Source: `contractors.csv` · Target: `fw9.pdf` · Mode: fill once per row.
2. **Fillable PDF, all files** — Source: both `willow-creek/` files · Target: `fw9.pdf` · Mode: fill once for all files.
3. **Fillable PDF, per file** — Source: all three `clients/` profiles · Target: `fw9.pdf` · Mode: fill once per file.
4. **DOCX edit in place** — Source: `expenses-2025.csv` · Target: `schedule-of-business-expenses.docx` · Mode: fill once for all files · Options: "Fill entries in chronological order" and "Allow AI to add new rows or columns" enabled.
5. **Extraction → Form Fill** — Extract from `receipts/`, then repeat run 4 using the extraction results as the source.
