# Form Fill demo — voiceover script

One section per demo run, in the same order as the "Suggested demo runs" list
in `README.md`. Cue lines in *[brackets]* describe what should be on screen;
everything else is meant to be read aloud.

---

## Intro

*[Opening shot: CPAAutomation home, Form Fill module visible]*

This is the Form Fill module in CPAAutomation. Form Fill takes the documents
you already have — spreadsheets, client profiles, tax detail sheets — and uses
them to fill out forms, letters, and workpapers automatically. No copying and
pasting, no retyping.

In this demo we'll walk through seven scenarios that cover the four kinds of
targets Form Fill understands — fillable PDFs, flat PDFs, Word documents with
placeholders, and Word documents without any placeholders at all — and the
three ways it can run: once per row, once per file, or once across all your
source files combined.

---

## 1. Fillable PDF, once per row

*[Select `contractors.csv` as the source and the blank W-9 as the target; choose "fill once per row"]*

Let's start with the classic case: you need a W-9 for every contractor on a
list. Our source is a simple spreadsheet with five contractors, and our target
is the standard IRS W-9 — a fillable PDF. Form Fill detects the form fields
automatically and fills them directly.

Because the source is a spreadsheet, Form Fill offers to fill the form once
per row — five rows, five W-9s.

*[Run completes; open one or two results from the ZIP]*

And here are the results, delivered as a ZIP. Notice it isn't just mapping
columns to boxes. Alice Monroe operates under a business name, so her personal
name goes on line one and "Monroe Design Studio" goes on line two — exactly how
the IRS wants it. And the right tax classification checkbox is ticked for each
contractor, including the S-corporation election for Okafor Drafting.

---

## 2. Fillable PDF, once for all files

*[Select both files in `willow-creek/` as sources; same W-9 target; choose "fill once for all files"]*

Real client data is rarely in one tidy file. For Willow Creek, the information
we need is split across two documents: a company profile in Word with the legal
name and entity type, and a tax details PDF with the address and EIN.

This time we choose "fill once for all files." Form Fill reads both documents,
combines what it finds, and produces a single completed W-9.

*[Show the filled W-9]*

One form, assembled from two different sources — no manual cross-referencing.

---

## 3. Fillable PDF, once per file

*[Select all three `clients/` profiles; same W-9 target; choose "fill once per file"]*

Third variation: three separate client information sheets — Nova Consulting,
Cedar Bookkeeping, and BrightPath — where each file describes a different
entity. Choosing "fill once per file" tells Form Fill to treat every source
document as its own job.

*[Show the three filled W-9s]*

Three profiles in, three completed W-9s out.

---

## 4. Word workpaper with table expansion

*[Select `expenses-2025.csv` as the source and the expense schedule DOCX as the target; enable "Fill entries in chronological order" and "Allow AI to add new rows or columns"]*

Now something trickier: a Word workpaper. This schedule of business expenses
has no placeholders — just a table with three blank rows and a total. Our
source spreadsheet has eight expenses, and to make it realistic, they're in
random order.

We enable two options: fill entries in chronological order, and allow the AI
to add new rows.

*[Show the filled schedule, scrolling the table]*

In the result, the table has grown from three rows to eight, the expenses are
sorted oldest to newest, and the total is filled in — all while keeping the
document's original formatting intact.

---

## 5. From receipts to workpaper

*[Open Universal Document Analysis; select the eight receipt PDFs; extract date, payee, category, and amount]*

But what if you don't even have a spreadsheet — just a folder of receipts?
Here are eight receipt PDFs. We run them through Universal Document Analysis
and extract the date, payee, category, and amount from each one.

*[Extraction results table appears; click "Use in Form Fill"]*

From the results, one click — "Use in Form Fill" — sends the extracted data
straight into the same expense schedule we just used.

*[Show the filled schedule]*

The output matches the spreadsheet version exactly. Whether your data lives in
a CSV or in a stack of scanned receipts, you end up in the same place.

---

## 6. Word letter with placeholders

*[Select `contractors.csv` again; target is the W-9 request letter DOCX; choose "fill once per row"]*

Form Fill also handles templated documents. This W-9 request letter uses
placeholder tokens — names in double curly braces that match the spreadsheet
columns — so each one resolves directly from the contractor's row.

Same five-contractor spreadsheet, once per row.

*[Show a couple of the letters]*

Five personalized letters, each addressed to the right contractor at the right
address, ready to send.

---

## 7. Flat PDF overlay

*[Select one client profile as the source; target is the vendor setup sheet PDF; choose "fill once for all files"]*

Last scenario: the hardest kind of target. This vendor setup sheet is a flat
PDF — no form fields at all, just labels with blank lines. Form Fill reads the
layout and overlays the text right onto the blanks next to each label.

*[Show the filled setup sheet]*

The result looks like it was typed onto the original form. And of course this
works in batch too — run it once per file with all three client profiles and
you get three completed setup sheets.

---

## Closing

*[Return to results overview or module home]*

That's the Form Fill module: four target formats, three fill modes, and
sources ranging from spreadsheets to scanned receipts — turning hours of data
entry into a couple of clicks. Thanks for watching.
