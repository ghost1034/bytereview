#!/usr/bin/env python3
"""Build the synthetic source PDFs used by the one-platform accounting demo."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Iterable, Sequence
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import LETTER, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output" / "pdf"
FOOTER_TEXT = "Synthetic demo document - not a real bank or company record."

NAVY = colors.HexColor("#17324D")
INK = colors.HexColor("#203445")
TEAL = colors.HexColor("#2C7A7B")
PALE_TEAL = colors.HexColor("#E8F4F3")
PALE_BLUE = colors.HexColor("#EDF3F8")
SLATE = colors.HexColor("#5C6B78")
LINE = colors.HexColor("#CED9E2")
LIGHT = colors.HexColor("#F7F9FB")
GOLD = colors.HexColor("#C18D2B")
GREEN = colors.HexColor("#2E7D5B")
RED = colors.HexColor("#B24949")
WHITE = colors.white


@dataclass(frozen=True)
class Transaction:
    reference: str
    date: str
    description: str
    amount: Decimal


BANK_TRANSACTIONS = [
    Transaction("BS-0702", "2026-07-02", "ACH CUSTOMER RECEIPT INV-1042", Decimal("52000.00")),
    Transaction("BS-0703", "2026-07-03", "PAYROLL ACH", Decimal("-28400.00")),
    Transaction("BS-0707", "2026-07-07", "VENDOR PAYMENT STEELWORKS", Decimal("-12750.00")),
    Transaction("BS-0710", "2026-07-10", "ACH CUSTOMER RECEIPT INV-1046", Decimal("18500.00")),
    Transaction("BS-0715", "2026-07-15", "SOFTWARE SUBSCRIPTION ERP CLOUD", Decimal("-3600.00")),
    Transaction("BS-0718", "2026-07-18", "BATCH CUSTOMER DEPOSIT", Decimal("41250.00")),
    Transaction("BS-0725", "2026-07-25", "FACILITY RENT", Decimal("-8000.00")),
    Transaction("BS-0728", "2026-07-28", "BANK SERVICE CHARGE", Decimal("-125.00")),
    Transaction("BS-0731", "2026-07-31", "INTEREST CREDIT", Decimal("35.00")),
]

GL_TRANSACTIONS = [
    Transaction("GL-0702", "2026-07-02", "Customer receipt INV-1042", Decimal("52000.00")),
    Transaction("GL-0703", "2026-07-03", "Payroll ACH", Decimal("-28400.00")),
    Transaction("GL-0707", "2026-07-07", "Steelworks vendor payment", Decimal("-12750.00")),
    Transaction("GL-0710", "2026-07-10", "Customer receipt INV-1046", Decimal("18500.00")),
    Transaction("GL-0715", "2026-07-15", "ERP Cloud subscription", Decimal("-3600.00")),
    Transaction("GL-0718A", "2026-07-18", "Customer receipt INV-1048", Decimal("25000.00")),
    Transaction("GL-0718B", "2026-07-18", "Customer receipt INV-1051", Decimal("16250.00")),
    Transaction("GL-0725", "2026-07-25", "Facility rent", Decimal("-8000.00")),
    Transaction("GL-0731", "2026-07-31", "Outstanding check 8824", Decimal("-4250.00")),
]

OPEX_ROWS = [
    ("2026-06-30", "6000 Salaries", "Operations", "Normal staffing; July includes scheduled merit increases", Decimal("42000.00")),
    ("2026-07-31", "6000 Salaries", "Operations", "Normal staffing; July includes scheduled merit increases", Decimal("43500.00")),
    ("2026-06-30", "6100 Marketing", "Sales & Marketing", "July summer product launch campaign", Decimal("12000.00")),
    ("2026-07-31", "6100 Marketing", "Sales & Marketing", "July summer product launch campaign", Decimal("29500.00")),
    ("2026-06-30", "6200 Freight", "Operations", "July expedited inbound materials for customer backlog", Decimal("18500.00")),
    ("2026-07-31", "6200 Freight", "Operations", "July expedited inbound materials for customer backlog", Decimal("27800.00")),
    ("2026-06-30", "6300 Software", "G&A", "July annual ERP support renewal", Decimal("6200.00")),
    ("2026-07-31", "6300 Software", "G&A", "July annual ERP support renewal", Decimal("9800.00")),
    ("2026-06-30", "6400 Professional Fees", "G&A", "July ERP implementation consulting milestone", Decimal("4500.00")),
    ("2026-07-31", "6400 Professional Fees", "G&A", "July ERP implementation consulting milestone", Decimal("16500.00")),
    ("2026-06-30", "6500 Rent", "Operations", "Fixed monthly facility rent", Decimal("8000.00")),
    ("2026-07-31", "6500 Rent", "Operations", "Fixed monthly facility rent", Decimal("8000.00")),
    ("2026-06-30", "6600 Utilities", "Operations", "Normal seasonal usage", Decimal("2200.00")),
    ("2026-07-31", "6600 Utilities", "Operations", "Normal seasonal usage", Decimal("2450.00")),
    ("2026-06-30", "6700 Travel", "Operations", "July supplier qualification site visit", Decimal("1200.00")),
    ("2026-07-31", "6700 Travel", "Operations", "July supplier qualification site visit", Decimal("5900.00")),
]


def money(value: Decimal, signed: bool = False) -> str:
    if signed:
        return f"{value:+,.2f}"
    if value < 0:
        return f"({abs(value):,.2f})"
    return f"{value:,.2f}"


def paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(text), style)


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "DemoTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=21,
            leading=24,
            textColor=NAVY,
            alignment=TA_LEFT,
            spaceAfter=4,
        ),
        "subtitle": ParagraphStyle(
            "DemoSubtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=SLATE,
            spaceAfter=12,
        ),
        "kicker": ParagraphStyle(
            "DemoKicker",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=10,
            textColor=TEAL,
            spaceAfter=3,
            uppercase=True,
        ),
        "section": ParagraphStyle(
            "DemoSection",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=11.5,
            leading=14,
            textColor=NAVY,
            spaceBefore=8,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "DemoBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            textColor=INK,
            spaceAfter=6,
        ),
        "small": ParagraphStyle(
            "DemoSmall",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.7,
            leading=10,
            textColor=SLATE,
        ),
        "table": ParagraphStyle(
            "DemoTable",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.1,
            leading=10.2,
            textColor=INK,
        ),
        "table_compact": ParagraphStyle(
            "DemoTableCompact",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.4,
            leading=9.0,
            textColor=INK,
        ),
        "table_header": ParagraphStyle(
            "DemoTableHeader",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.6,
            leading=9,
            textColor=WHITE,
            alignment=TA_LEFT,
        ),
        "table_header_right": ParagraphStyle(
            "DemoTableHeaderRight",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.6,
            leading=9,
            textColor=WHITE,
            alignment=TA_RIGHT,
        ),
        "amount": ParagraphStyle(
            "DemoAmount",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.1,
            leading=10.2,
            textColor=INK,
            alignment=TA_RIGHT,
        ),
        "amount_compact": ParagraphStyle(
            "DemoAmountCompact",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.4,
            leading=9.0,
            textColor=INK,
            alignment=TA_RIGHT,
        ),
        "card_label": ParagraphStyle(
            "DemoCardLabel",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.2,
            leading=9,
            textColor=SLATE,
            alignment=TA_LEFT,
        ),
        "card_value": ParagraphStyle(
            "DemoCardValue",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=15,
            textColor=NAVY,
            alignment=TA_LEFT,
        ),
    }


def page_decorator(left_label: str, right_label: str, total_pages: int):
    def draw(canvas, doc):
        width, height = doc.pagesize
        canvas.saveState()
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.7)
        canvas.line(doc.leftMargin, height - 0.56 * inch, width - doc.rightMargin, height - 0.56 * inch)
        canvas.setFont("Helvetica-Bold", 7.5)
        canvas.setFillColor(NAVY)
        canvas.drawString(doc.leftMargin, height - 0.43 * inch, left_label)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(SLATE)
        canvas.drawRightString(width - doc.rightMargin, height - 0.43 * inch, right_label)

        canvas.setStrokeColor(LINE)
        canvas.line(doc.leftMargin, 0.60 * inch, width - doc.rightMargin, 0.60 * inch)
        canvas.setFont("Helvetica", 7.2)
        canvas.setFillColor(SLATE)
        canvas.drawCentredString(width / 2, 0.40 * inch, FOOTER_TEXT)
        canvas.drawRightString(width - doc.rightMargin, 0.40 * inch, f"Page {doc.page} of {total_pages}")
        canvas.restoreState()

    return draw


def add_title(story: list, s: dict[str, ParagraphStyle], kicker: str, title: str, subtitle: str) -> None:
    story.extend([
        Spacer(1, 0.12 * inch),
        paragraph(kicker.upper(), s["kicker"]),
        paragraph(title, s["title"]),
        paragraph(subtitle, s["subtitle"]),
    ])


def card_row(items: Sequence[tuple[str, str]], s: dict[str, ParagraphStyle], width: float) -> Table:
    cells = []
    for label, value in items:
        cells.append([paragraph(label.upper(), s["card_label"]), paragraph(value, s["card_value"])])
    table = Table([cells], colWidths=[width / len(cells)] * len(cells), rowHeights=[0.74 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE_BLUE),
        ("BOX", (0, 0), (-1, -1), 0.8, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def metadata_table(rows: Sequence[tuple[str, str]], s: dict[str, ParagraphStyle], width: float) -> Table:
    data = [[paragraph(label, s["small"]), paragraph(value, s["body"])] for label, value in rows]
    table = Table(data, colWidths=[1.34 * inch, width - 1.34 * inch])
    style = [
        ("BACKGROUND", (0, 0), (0, -1), LIGHT),
        ("TEXTCOLOR", (0, 0), (0, -1), SLATE),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    table.setStyle(TableStyle(style))
    return table


def transaction_table(rows: Sequence[Transaction], s: dict[str, ParagraphStyle], width: float) -> Table:
    data = [[
        paragraph("Reference ID", s["table_header"]),
        paragraph("Date", s["table_header"]),
        paragraph("Description", s["table_header"]),
        paragraph("Amount ($)", s["table_header_right"]),
    ]]
    for row in rows:
        data.append([
            paragraph(row.reference, s["table"]),
            paragraph(row.date, s["table"]),
            paragraph(row.description, s["table"]),
            paragraph(money(row.amount), s["amount"]),
        ])
    table = Table(
        data,
        colWidths=[1.02 * inch, 1.03 * inch, width - 3.38 * inch, 1.33 * inch],
        repeatRows=1,
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, 0), 7),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
        ("TOPPADDING", (0, 1), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 8),
        ("ALIGN", (-1, 1), (-1, -1), "RIGHT"),
    ]))
    return table


def two_column_callouts(items: Sequence[tuple[str, str]], s: dict[str, ParagraphStyle], width: float) -> Table:
    cells = []
    for title, body in items:
        cells.append([
            paragraph(title.upper(), s["card_label"]),
            paragraph(body, s["body"]),
        ])
    table = Table([cells], colWidths=[width / len(cells)] * len(cells))
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE_TEAL),
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#B7D7D4")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#B7D7D4")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return table


def build_bank_statement(path: Path) -> None:
    s = styles()
    doc = SimpleDocTemplate(
        str(path), pagesize=LETTER, leftMargin=0.72 * inch, rightMargin=0.72 * inch,
        topMargin=0.70 * inch, bottomMargin=0.78 * inch,
        title="Riverstone Bank Statement - July 2026",
        author="CPAAutomation Demo",
        subject="Synthetic commercial bank statement",
    )
    width = LETTER[0] - doc.leftMargin - doc.rightMargin
    credits = sum((t.amount for t in BANK_TRANSACTIONS if t.amount > 0), Decimal("0"))
    debits = -sum((t.amount for t in BANK_TRANSACTIONS if t.amount < 0), Decimal("0"))
    ending = Decimal("120000.00") + sum((t.amount for t in BANK_TRANSACTIONS), Decimal("0"))
    story: list = []
    add_title(
        story, s, "Northline Commercial Bank | Business Banking",
        "Commercial Account Statement",
        "Statement period: July 1-31, 2026",
    )
    story.append(metadata_table([
        ("Customer", "Riverstone Manufacturing"),
        ("Account", "Operating Checking · ending 4821"),
        ("Statement cycle", "July 1-31, 2026"),
        ("Document status", "Monthly statement | Synthetic demo record"),
    ], s, width))
    story.extend([
        Spacer(1, 0.16 * inch),
        card_row([
            ("Beginning balance", "$120,000.00"),
            ("Total credits", f"${money(credits)}"),
            ("Total debits", f"${money(debits)}"),
            ("Ending balance", f"${money(ending)}"),
        ], s, width),
        paragraph("Account activity", s["section"]),
        transaction_table(BANK_TRANSACTIONS[:5], s, width),
        Spacer(1, 0.14 * inch),
        paragraph(
            "Activity is listed in posting-date order. Credits increase the account balance; amounts in parentheses are withdrawals or charges.",
            s["small"],
        ),
        PageBreak(),
    ])
    add_title(
        story, s, "Northline Commercial Bank | Continued",
        "Account Activity - Continued",
        "Riverstone Manufacturing | Operating Checking · ending 4821",
    )
    story.extend([
        transaction_table(BANK_TRANSACTIONS[5:], s, width),
        Spacer(1, 0.17 * inch),
        paragraph("Statement totals", s["section"]),
        card_row([
            ("Transactions", "9"),
            ("Net activity", f"${money(credits - debits, signed=True)}"),
            ("Ending balance", f"${money(ending)}"),
        ], s, width),
        Spacer(1, 0.15 * inch),
        two_column_callouts([
            ("Statement notes", "This generic statement is supplied only for a fictional accounting workflow demonstration. No routing number or full account number is shown."),
            ("Review cue", "Verify the ending balance and transaction activity against the company's cash general ledger for the same period."),
        ], s, width),
        Spacer(1, 0.18 * inch),
        paragraph("Balance proof", s["section"]),
        metadata_table([
            ("Beginning balance", "$120,000.00"),
            ("Plus credits", f"${money(credits)}"),
            ("Less debits", f"${money(debits)}"),
            ("Ending balance", f"${money(ending)}"),
        ], s, width),
    ])
    decorator = page_decorator("NORTHLINE COMMERCIAL BANK", "COMMERCIAL ACCOUNT STATEMENT", 2)
    doc.build(story, onFirstPage=decorator, onLaterPages=decorator)


def build_gl_detail(path: Path) -> None:
    s = styles()
    doc = SimpleDocTemplate(
        str(path), pagesize=LETTER, leftMargin=0.72 * inch, rightMargin=0.72 * inch,
        topMargin=0.70 * inch, bottomMargin=0.78 * inch,
        title="Riverstone Cash GL Detail - July 2026",
        author="CPAAutomation Demo",
        subject="Synthetic accounting-system cash detail",
    )
    width = LETTER[0] - doc.leftMargin - doc.rightMargin
    inflows = sum((t.amount for t in GL_TRANSACTIONS if t.amount > 0), Decimal("0"))
    outflows = -sum((t.amount for t in GL_TRANSACTIONS if t.amount < 0), Decimal("0"))
    ending = Decimal("120000.00") + sum((t.amount for t in GL_TRANSACTIONS), Decimal("0"))
    story: list = []
    add_title(
        story, s, "Riverstone Manufacturing | Finance",
        "Cash GL Detail",
        "Account 1010 · July 1-31, 2026",
    )
    story.append(metadata_table([
        ("Legal entity", "Riverstone Manufacturing"),
        ("Account", "1010 - Operating Cash"),
        ("Report period", "July 1-31, 2026"),
        ("Basis", "Posted accounting-system detail | Unadjusted"),
    ], s, width))
    story.extend([
        Spacer(1, 0.16 * inch),
        card_row([
            ("Opening balance", "$120,000.00"),
            ("Cash inflows", f"${money(inflows)}"),
            ("Cash outflows", f"${money(outflows)}"),
            ("Unadjusted ending", f"${money(ending)}"),
        ], s, width),
        paragraph("Posted transaction detail", s["section"]),
        transaction_table(GL_TRANSACTIONS[:5], s, width),
        Spacer(1, 0.14 * inch),
        paragraph(
            "Amounts are presented from the cash-account perspective. Credits to cash are positive; reductions to cash appear in parentheses.",
            s["small"],
        ),
        PageBreak(),
    ])
    add_title(
        story, s, "Riverstone Manufacturing | Finance | Continued",
        "Posted Transaction Detail - Continued",
        "Cash GL Detail · Account 1010",
    )
    story.extend([
        transaction_table(GL_TRANSACTIONS[5:], s, width),
        Spacer(1, 0.17 * inch),
        paragraph("Ledger control", s["section"]),
        card_row([
            ("Posted rows", "9"),
            ("Net posted activity", f"${money(inflows - outflows, signed=True)}"),
            ("Unadjusted ending", f"${money(ending)}"),
        ], s, width),
        Spacer(1, 0.15 * inch),
        two_column_callouts([
            ("Batch deposit detail", "The July 18 receipts for $25,000.00 and $16,250.00 are separate customer postings that together total $41,250.00."),
            ("Period-end item", "Check 8824 for $4,250.00 is recorded in the GL at July 31 and remains outstanding at period end."),
        ], s, width),
        Spacer(1, 0.18 * inch),
        paragraph("Balance proof", s["section"]),
        metadata_table([
            ("Opening balance", "$120,000.00"),
            ("Plus cash inflows", f"${money(inflows)}"),
            ("Less cash outflows", f"${money(outflows)}"),
            ("Unadjusted ending", f"${money(ending)}"),
        ], s, width),
    ])
    decorator = page_decorator("RIVERSTONE MANUFACTURING", "CASH GL DETAIL | ACCOUNT 1010", 2)
    doc.build(story, onFirstPage=decorator, onLaterPages=decorator)


def opex_table(rows: Sequence[tuple[str, str, str, str, Decimal]], s: dict[str, ParagraphStyle], width: float) -> Table:
    headers = ["Period / Date", "Account Name / Number", "Class / Department", "Description / Memo", "Amount ($)"]
    data = [[
        paragraph(headers[0], s["table_header"]),
        paragraph(headers[1], s["table_header"]),
        paragraph(headers[2], s["table_header"]),
        paragraph(headers[3], s["table_header"]),
        paragraph(headers[4], s["table_header_right"]),
    ]]
    for period, account, department, memo, amount in rows:
        data.append([
            paragraph(period, s["table_compact"]),
            paragraph(account, s["table_compact"]),
            paragraph(department, s["table_compact"]),
            paragraph(memo, s["table_compact"]),
            paragraph(money(amount), s["amount_compact"]),
        ])
    col_widths = [1.03 * inch, 1.62 * inch, 1.42 * inch, width - 5.30 * inch, 1.23 * inch]
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 7),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
        ("TOPPADDING", (0, 1), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 7),
    ]))
    return table


def build_opex_detail(path: Path) -> None:
    s = styles()
    pagesize = landscape(LETTER)
    doc = SimpleDocTemplate(
        str(path), pagesize=pagesize, leftMargin=0.55 * inch, rightMargin=0.55 * inch,
        topMargin=0.68 * inch, bottomMargin=0.74 * inch,
        title="Riverstone Comparative Operating Expense Detail - June and July 2026",
        author="CPAAutomation Demo",
        subject="Synthetic comparative operating expense management report",
    )
    width = pagesize[0] - doc.leftMargin - doc.rightMargin
    june_rows = [row for row in OPEX_ROWS if row[0] == "2026-06-30"]
    july_rows = [row for row in OPEX_ROWS if row[0] == "2026-07-31"]
    june_total = sum((row[4] for row in june_rows), Decimal("0"))
    july_total = sum((row[4] for row in july_rows), Decimal("0"))
    increase = july_total - june_total

    story: list = []
    add_title(
        story, s, "Riverstone Manufacturing | Management Reporting",
        "Comparative Operating Expense Detail",
        "June and July 2026 | Page 1: June source rows",
    )
    story.extend([
        card_row([
            ("June total", f"${money(june_total)}"),
            ("July total", f"${money(july_total)}"),
            ("Increase", f"${money(increase)}"),
            ("Materiality", "$5,000 or 20%"),
        ], s, width),
        Spacer(1, 0.14 * inch),
        paragraph("June 2026 operating expense rows", s["section"]),
        opex_table(june_rows, s, width),
        Spacer(1, 0.13 * inch),
        two_column_callouts([
            ("Source structure", "Each account carries the same management note in both periods so the explanation remains attached after aggregation."),
            ("Control", f"8 June rows | June total ${money(june_total)}"),
        ], s, width),
        PageBreak(),
    ])
    add_title(
        story, s, "Riverstone Manufacturing | Management Reporting | Continued",
        "Comparative Operating Expense Detail",
        "June and July 2026 | Page 2: July source rows",
    )
    story.extend([
        card_row([
            ("June total", f"${money(june_total)}"),
            ("July total", f"${money(july_total)}"),
            ("Increase", f"${money(increase)}"),
            ("Expected flags", "5 accounts"),
        ], s, width),
        Spacer(1, 0.14 * inch),
        paragraph("July 2026 operating expense rows", s["section"]),
        opex_table(july_rows, s, width),
        Spacer(1, 0.13 * inch),
        two_column_callouts([
            ("Expected material accounts", "Marketing, Freight, Software, Professional Fees, and Travel exceed the $5,000 or 20% threshold."),
            ("Control", f"8 July rows | July total ${money(july_total)} | Increase ${money(increase)}"),
        ], s, width),
    ])
    decorator = page_decorator("RIVERSTONE MANUFACTURING", "COMPARATIVE OPERATING EXPENSE DETAIL", 2)
    doc.build(story, onFirstPage=decorator, onLaterPages=decorator)


def validate_source_data() -> None:
    bank_ending = Decimal("120000.00") + sum((t.amount for t in BANK_TRANSACTIONS), Decimal("0"))
    gl_ending = Decimal("120000.00") + sum((t.amount for t in GL_TRANSACTIONS), Decimal("0"))
    june_total = sum((row[4] for row in OPEX_ROWS if row[0] == "2026-06-30"), Decimal("0"))
    july_total = sum((row[4] for row in OPEX_ROWS if row[0] == "2026-07-31"), Decimal("0"))
    assert bank_ending == Decimal("178910.00")
    assert gl_ending == Decimal("174750.00")
    assert bank_ending - gl_ending == Decimal("4160.00")
    assert gl_ending - Decimal("125.00") + Decimal("35.00") == bank_ending - Decimal("4250.00")
    assert june_total == Decimal("94600.00")
    assert july_total == Decimal("143450.00")
    assert july_total - june_total == Decimal("48850.00")


def main() -> None:
    validate_source_data()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    build_bank_statement(OUTPUT_DIR / "Riverstone_Bank_Statement_2026-07.pdf")
    build_gl_detail(OUTPUT_DIR / "Riverstone_GL_Cash_Detail_2026-07.pdf")
    build_opex_detail(OUTPUT_DIR / "Riverstone_Comparative_Operating_Expense_Detail_Jun-Jul_2026.pdf")
    for output in sorted(OUTPUT_DIR.glob("Riverstone_*.pdf")):
        print(output)


if __name__ == "__main__":
    main()
