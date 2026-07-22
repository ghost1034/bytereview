#!/usr/bin/env python3
"""Generate the AccountingClaw Universal Document Analysis demo documents."""

from __future__ import annotations

import argparse
import zipfile
from pathlib import Path
from typing import Iterable, Sequence

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


PAGE_W, PAGE_H = letter
MARGIN = 44
CUSTOMER = [
    "Northstar Outdoor Supply, Inc.",
    "1847 Meridian Park Drive",
    "Sacramento, CA 95814",
]


def money(value: float) -> str:
    sign = "-" if value < 0 else ""
    return f"{sign}${abs(value):,.2f}"


def setup_pdf(path: Path, title: str, author: str) -> canvas.Canvas:
    pdf = canvas.Canvas(str(path), pagesize=letter, pageCompression=1)
    pdf.setTitle(title)
    pdf.setAuthor(author)
    pdf.setSubject("Accounts payable document")
    pdf.setCreator("Vendor billing system")
    return pdf


def draw_text(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    text: str,
    *,
    font: str = "Helvetica",
    size: float = 9,
    color: colors.Color = colors.black,
    align: str = "left",
) -> None:
    pdf.setFont(font, size)
    pdf.setFillColor(color)
    if align == "right":
        pdf.drawRightString(x, y, text)
    elif align == "center":
        pdf.drawCentredString(x, y, text)
    else:
        pdf.drawString(x, y, text)


def wrap_text(text: str, font: str, size: float, width: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if not current or stringWidth(candidate, font, size) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_wrapped(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    text: str,
    width: float,
    *,
    font: str = "Helvetica",
    size: float = 9,
    color: colors.Color = colors.black,
    leading: float | None = None,
) -> float:
    leading = leading or size * 1.35
    for line in wrap_text(text, font, size, width):
        draw_text(pdf, x, y, line, font=font, size=size, color=color)
        y -= leading
    return y


def draw_label_value(
    pdf: canvas.Canvas,
    label: str,
    value: str,
    x: float,
    y: float,
    *,
    label_color: colors.Color,
    width: float = 150,
) -> None:
    draw_text(pdf, x, y, label.upper(), font="Helvetica-Bold", size=6.8, color=label_color)
    draw_text(pdf, x + width, y, value, font="Helvetica-Bold", size=9.2, color=HexColor("#182230"), align="right")


def draw_customer_block(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    *,
    accent: colors.Color,
    title: str = "BILL TO",
    ship_to: bool = False,
) -> None:
    draw_text(pdf, x, y, title, font="Helvetica-Bold", size=7, color=accent)
    y -= 17
    for index, line in enumerate(CUSTOMER):
        draw_text(
            pdf,
            x,
            y,
            line,
            font="Helvetica-Bold" if index == 0 else "Helvetica",
            size=10 if index == 0 else 8.5,
            color=HexColor("#182230"),
        )
        y -= 13
    if ship_to:
        draw_text(pdf, x, y - 2, "Receiving - Dock 2", font="Helvetica", size=8.5, color=HexColor("#52606D"))


def draw_table(
    pdf: canvas.Canvas,
    x: float,
    y_top: float,
    widths: Sequence[float],
    headers: Sequence[str],
    rows: Sequence[Sequence[str]],
    *,
    accent: colors.Color,
    header_color: colors.Color | None = None,
    row_height: float = 28,
    aligns: Sequence[str] | None = None,
    font_size: float = 8.2,
) -> float:
    header_color = header_color or accent
    total_width = sum(widths)
    header_height = 24
    pdf.setFillColor(header_color)
    pdf.roundRect(x, y_top - header_height, total_width, header_height, 4, fill=1, stroke=0)
    cursor = x
    for index, (header, width) in enumerate(zip(headers, widths)):
        align = (aligns or ["left"] * len(widths))[index]
        header_x = cursor + 8 if align == "left" else cursor + width - 8
        draw_text(
            pdf,
            header_x,
            y_top - 16,
            header.upper(),
            font="Helvetica-Bold",
            size=6.8,
            color=colors.white,
            align="left" if align == "left" else "right",
        )
        cursor += width

    y = y_top - header_height
    for row_index, row in enumerate(rows):
        y -= row_height
        if row_index % 2 == 0:
            pdf.setFillColor(HexColor("#F6F8FA"))
            pdf.rect(x, y, total_width, row_height, fill=1, stroke=0)
        pdf.setStrokeColor(HexColor("#E4E8ED"))
        pdf.setLineWidth(0.5)
        pdf.line(x, y, x + total_width, y)
        cursor = x
        for index, (value, width) in enumerate(zip(row, widths)):
            align = (aligns or ["left"] * len(widths))[index]
            tx = cursor + 8 if align == "left" else cursor + width - 8
            draw_text(
                pdf,
                tx,
                y + row_height / 2 - 3,
                str(value),
                font="Helvetica",
                size=font_size,
                color=HexColor("#263442"),
                align="left" if align == "left" else "right",
            )
            cursor += width
    return y


def draw_totals(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    rows: Sequence[tuple[str, str]],
    *,
    accent: colors.Color,
    width: float = 216,
    total_label: str = "TOTAL DUE",
) -> float:
    for label, value in rows:
        is_total = label == total_label
        if is_total:
            pdf.setFillColor(accent)
            pdf.roundRect(x, y - 12, width, 25, 5, fill=1, stroke=0)
            draw_text(pdf, x + 12, y - 2, label, font="Helvetica-Bold", size=9, color=colors.white)
            draw_text(pdf, x + width - 12, y - 3, value, font="Helvetica-Bold", size=13, color=colors.white, align="right")
            y -= 35
        else:
            draw_text(pdf, x + 8, y, label, font="Helvetica", size=8.5, color=HexColor("#66727F"))
            draw_text(pdf, x + width - 8, y, value, font="Helvetica-Bold", size=9, color=HexColor("#182230"), align="right")
            y -= 20
    return y


def draw_footer(
    pdf: canvas.Canvas,
    *,
    left: str,
    center: str,
    right: str,
    accent: colors.Color,
    page_number: str | None = None,
) -> None:
    pdf.setStrokeColor(HexColor("#D8DEE5"))
    pdf.setLineWidth(0.7)
    pdf.line(MARGIN, 42, PAGE_W - MARGIN, 42)
    draw_text(pdf, MARGIN, 27, left, size=7, color=HexColor("#6B7785"))
    draw_text(pdf, PAGE_W / 2, 27, center, size=7, color=HexColor("#6B7785"), align="center")
    draw_text(pdf, PAGE_W - MARGIN, 27, right, size=7, color=accent, align="right")
    if page_number:
        draw_text(pdf, PAGE_W - MARGIN, 52, page_number, font="Helvetica-Bold", size=7, color=HexColor("#7A8794"), align="right")


def summit_freight(path: Path) -> None:
    navy = HexColor("#173B57")
    red = HexColor("#E05252")
    pdf = setup_pdf(path, "Invoice INV-20614", "Summit Freight Partners")

    pdf.setFillColor(navy)
    pdf.rect(0, PAGE_H - 112, PAGE_W, 112, fill=1, stroke=0)
    pdf.setFillColor(red)
    pdf.circle(74, PAGE_H - 56, 27, fill=1, stroke=0)
    draw_text(pdf, 74, PAGE_H - 64, "SFP", font="Helvetica-Bold", size=16, color=colors.white, align="center")
    draw_text(pdf, 113, PAGE_H - 47, "SUMMIT FREIGHT", font="Helvetica-Bold", size=18, color=colors.white)
    draw_text(pdf, 113, PAGE_H - 67, "PARTNERS", font="Helvetica-Bold", size=12, color=HexColor("#BFD5E5"))
    draw_text(pdf, 113, PAGE_H - 87, "Regional freight and logistics", size=7.8, color=HexColor("#D7E6F0"))
    draw_text(pdf, PAGE_W - MARGIN, PAGE_H - 51, "INVOICE", font="Helvetica-Bold", size=25, color=colors.white, align="right")
    draw_text(pdf, PAGE_W - MARGIN, PAGE_H - 76, "INV-20614", font="Helvetica-Bold", size=11, color=HexColor("#FFCDD0"), align="right")

    draw_customer_block(pdf, MARGIN, 646, accent=red)
    card_x, card_y, card_w, card_h = 348, 594, 220, 74
    pdf.setFillColor(HexColor("#F3F7FA"))
    pdf.roundRect(card_x, card_y, card_w, card_h, 7, fill=1, stroke=0)
    draw_label_value(pdf, "Invoice date", "06/05/2026", card_x + 14, card_y + 53, label_color=navy, width=188)
    draw_label_value(pdf, "Due date", "07/05/2026", card_x + 14, card_y + 33, label_color=navy, width=188)
    draw_label_value(pdf, "Purchase order", "NSO-4812", card_x + 14, card_y + 13, label_color=navy, width=188)

    draw_text(pdf, MARGIN, 555, "FREIGHT CHARGES", font="Helvetica-Bold", size=9, color=navy)
    rows = [
        ["Linehaul service - Reno to Sacramento", "1", "$1,450.00"],
        ["Fuel surcharge", "1", "$320.00"],
        ["Liftgate and delivery appointment", "1", "$80.00"],
    ]
    y = draw_table(pdf, MARGIN, 540, [340, 62, 122], ["Description", "Qty", "Amount"], rows, accent=navy, aligns=["left", "right", "right"], row_height=34)

    draw_text(pdf, MARGIN, y - 31, "SHIPMENT DETAILS", font="Helvetica-Bold", size=7, color=red)
    draw_text(pdf, MARGIN, y - 48, "PRO 7719482  |  Delivered 06/04/2026  |  8 pallets  |  4,260 lb", size=8.5, color=HexColor("#3D4A57"))

    draw_totals(
        pdf,
        352,
        y - 28,
        [("Subtotal", "$1,850.00"), ("Shipping", "$0.00"), ("Tax", "$0.00"), ("TOTAL DUE", "$1,850.00")],
        accent=red,
    )

    info_y = 270
    pdf.setFillColor(HexColor("#F7F9FB"))
    pdf.roundRect(MARGIN, info_y - 75, 524, 91, 6, fill=1, stroke=0)
    draw_text(pdf, MARGIN + 14, info_y, "PAYMENT TERMS", font="Helvetica-Bold", size=7, color=navy)
    draw_text(pdf, MARGIN + 14, info_y - 18, "Net 30. Payment is due by July 5, 2026.", size=9, color=HexColor("#263442"))
    draw_text(pdf, 310, info_y, "REMIT TO", font="Helvetica-Bold", size=7, color=navy)
    draw_text(pdf, 310, info_y - 18, "Summit Freight Partners", font="Helvetica-Bold", size=9, color=HexColor("#263442"))
    draw_text(pdf, 310, info_y - 32, "PO Box 4187, Reno, NV 89505", size=8.5, color=HexColor("#52606D"))
    draw_text(pdf, MARGIN + 14, info_y - 53, "Reference invoice INV-20614 with payment.", size=8, color=HexColor("#52606D"))

    draw_text(pdf, MARGIN, 151, "Thank you for choosing Summit Freight Partners.", font="Helvetica-Bold", size=10, color=navy)
    draw_text(pdf, MARGIN, 134, "Questions? Contact ar@summitfreight.example or (775) 555-0148.", size=8.5, color=HexColor("#52606D"))
    draw_footer(pdf, left="8800 Silver Peak Way, Reno, NV 89506", center="USD", right="summitfreight.example", accent=red)
    pdf.save()


def bluepeak_interiors(path: Path) -> None:
    teal = HexColor("#087E8B")
    blue = HexColor("#1F4E78")
    aqua = HexColor("#DDF3F5")
    pdf = setup_pdf(path, "Invoice BPO-8841", "BluePeak Office Interiors")

    # Page 1
    pdf.setFillColor(HexColor("#F3FAFB"))
    pdf.rect(0, PAGE_H - 152, PAGE_W, 152, fill=1, stroke=0)
    pdf.setFillColor(teal)
    pdf.roundRect(MARGIN, PAGE_H - 97, 47, 47, 8, fill=1, stroke=0)
    pdf.setStrokeColor(colors.white)
    pdf.setLineWidth(3)
    pdf.line(MARGIN + 12, PAGE_H - 84, MARGIN + 23, PAGE_H - 61)
    pdf.line(MARGIN + 23, PAGE_H - 61, MARGIN + 35, PAGE_H - 84)
    draw_text(pdf, 104, PAGE_H - 67, "BLUEPEAK", font="Helvetica-Bold", size=19, color=blue)
    draw_text(pdf, 104, PAGE_H - 86, "OFFICE INTERIORS", font="Helvetica-Bold", size=8, color=teal)
    draw_text(pdf, PAGE_W - MARGIN, PAGE_H - 67, "INVOICE", font="Helvetica-Bold", size=26, color=blue, align="right")
    draw_text(pdf, PAGE_W - MARGIN, PAGE_H - 91, "BPO-8841", font="Helvetica-Bold", size=11, color=teal, align="right")

    draw_customer_block(pdf, MARGIN, 604, accent=teal)
    draw_text(pdf, 350, 604, "PROJECT", font="Helvetica-Bold", size=7, color=teal)
    draw_text(pdf, 350, 587, "Workspace Refresh - Phase 2", font="Helvetica-Bold", size=10, color=HexColor("#182230"))
    draw_label_value(pdf, "Invoice date", "06/08/2026", 350, 560, label_color=teal, width=174)
    draw_label_value(pdf, "Due date", "07/08/2026", 350, 540, label_color=teal, width=174)
    draw_label_value(pdf, "Purchase order", "NSO-4799", 350, 520, label_color=teal, width=174)

    draw_text(pdf, MARGIN, 478, "PROJECT DETAIL", font="Helvetica-Bold", size=9, color=blue)
    rows = [
        ["BP-CHAIR-18", "Ergonomic task chair, charcoal", "12", "$180.00", "$2,160.00"],
        ["BP-DESK-60", "Sit-stand desk, 60 inch", "4", "$420.00", "$1,680.00"],
        ["BP-PANEL-42", "Acoustic privacy panel", "4", "$160.00", "$640.00"],
        ["INSTALL", "Delivery and installation", "1", "$200.00", "$200.00"],
    ]
    y = draw_table(pdf, MARGIN, 462, [82, 235, 40, 84, 83], ["Item", "Description", "Qty", "Unit", "Amount"], rows, accent=teal, header_color=blue, aligns=["left", "left", "right", "right", "right"], row_height=39, font_size=7.7)

    pdf.setFillColor(aqua)
    pdf.roundRect(MARGIN, y - 68, 524, 48, 6, fill=1, stroke=0)
    draw_text(pdf, MARGIN + 14, y - 40, "PROJECT SUBTOTAL CARRIED TO PAGE 2", font="Helvetica-Bold", size=8, color=blue)
    draw_text(pdf, PAGE_W - MARGIN - 14, y - 42, "$4,680.00", font="Helvetica-Bold", size=12, color=teal, align="right")

    draw_text(pdf, MARGIN, 151, "Installation completed June 7, 2026. Signed delivery record BPI-0617 is on file.", size=8.7, color=HexColor("#52606D"))
    draw_footer(pdf, left="2600 Harbor Point Blvd, Oakland, CA 94607", center="Invoice BPO-8841", right="bluepeakinteriors.example", accent=teal, page_number="Page 1 of 2")
    pdf.showPage()

    # Page 2
    pdf.setFillColor(blue)
    pdf.rect(0, PAGE_H - 104, PAGE_W, 104, fill=1, stroke=0)
    draw_text(pdf, MARGIN, PAGE_H - 49, "BLUEPEAK OFFICE INTERIORS", font="Helvetica-Bold", size=15, color=colors.white)
    draw_text(pdf, MARGIN, PAGE_H - 72, "Invoice BPO-8841 - Summary and remittance", size=8.5, color=HexColor("#CFE7ED"))
    draw_text(pdf, PAGE_W - MARGIN, PAGE_H - 58, "PAGE 2", font="Helvetica-Bold", size=10, color=colors.white, align="right")

    summary_y = 626
    pdf.setFillColor(HexColor("#F5F9FB"))
    pdf.roundRect(MARGIN, summary_y - 82, 524, 100, 8, fill=1, stroke=0)
    draw_text(pdf, MARGIN + 18, summary_y, "INVOICE SUMMARY", font="Helvetica-Bold", size=8, color=teal)
    draw_text(pdf, MARGIN + 18, summary_y - 24, "Bill to", font="Helvetica-Bold", size=7, color=HexColor("#71808E"))
    draw_text(pdf, MARGIN + 18, summary_y - 42, CUSTOMER[0], font="Helvetica-Bold", size=10, color=HexColor("#182230"))
    draw_text(pdf, MARGIN + 18, summary_y - 58, "PO NSO-4799", size=8.5, color=HexColor("#52606D"))
    draw_label_value(pdf, "Invoice date", "06/08/2026", 350, summary_y - 22, label_color=teal, width=174)
    draw_label_value(pdf, "Due date", "07/08/2026", 350, summary_y - 44, label_color=teal, width=174)
    draw_label_value(pdf, "Currency", "USD", 350, summary_y - 66, label_color=teal, width=174)

    draw_text(pdf, MARGIN, 506, "AMOUNT DUE", font="Helvetica-Bold", size=9, color=blue)
    draw_totals(
        pdf,
        332,
        491,
        [("Subtotal", "$4,680.00"), ("Shipping", "$0.00"), ("Sales tax", "$409.50"), ("TOTAL DUE", "$5,089.50")],
        accent=teal,
        width=236,
    )
    draw_text(pdf, MARGIN, 474, "Payment terms", font="Helvetica-Bold", size=7, color=teal)
    draw_text(pdf, MARGIN, 455, "Net 30", font="Helvetica-Bold", size=13, color=blue)
    draw_text(pdf, MARGIN, 434, "Payment is due July 8, 2026.", size=8.7, color=HexColor("#52606D"))

    pdf.setFillColor(aqua)
    pdf.roundRect(MARGIN, 260, 524, 120, 8, fill=1, stroke=0)
    draw_text(pdf, MARGIN + 18, 354, "REMITTANCE INSTRUCTIONS", font="Helvetica-Bold", size=8, color=blue)
    draw_text(pdf, MARGIN + 18, 329, "ACH", font="Helvetica-Bold", size=8, color=teal)
    draw_text(pdf, MARGIN + 18, 311, "BluePeak Office Interiors", font="Helvetica-Bold", size=9, color=HexColor("#263442"))
    draw_text(pdf, MARGIN + 18, 295, "Remittance advice: payments@bluepeakinteriors.example", size=8.2, color=HexColor("#52606D"))
    draw_text(pdf, 340, 329, "CHECK", font="Helvetica-Bold", size=8, color=teal)
    draw_text(pdf, 340, 311, "PO Box 9084", font="Helvetica-Bold", size=9, color=HexColor("#263442"))
    draw_text(pdf, 340, 295, "Oakland, CA 94613", size=8.2, color=HexColor("#52606D"))
    draw_text(pdf, MARGIN + 18, 275, "Include invoice BPO-8841 and customer Northstar Outdoor Supply with all remittances.", size=8, color=HexColor("#52606D"))

    draw_text(pdf, MARGIN, 201, "Thank you for partnering with BluePeak.", font="Helvetica-Bold", size=11, color=blue)
    draw_text(pdf, MARGIN, 182, "Billing questions: (510) 555-0182", size=8.5, color=HexColor("#52606D"))
    draw_footer(pdf, left="2600 Harbor Point Blvd, Oakland, CA 94607", center="USD", right="bluepeakinteriors.example", accent=teal, page_number="Page 2 of 2")
    pdf.save()


def alder_it(path: Path) -> None:
    indigo = HexColor("#5146A3")
    lavender = HexColor("#EFEDFA")
    ink = HexColor("#20243A")
    pdf = setup_pdf(path, "Invoice AIS-2026-0617", "Alder IT Services")

    pdf.setFillColor(ink)
    pdf.rect(0, 0, 14, PAGE_H, fill=1, stroke=0)
    pdf.setFillColor(indigo)
    pdf.roundRect(MARGIN, PAGE_H - 96, 42, 42, 21, fill=1, stroke=0)
    draw_text(pdf, MARGIN + 21, PAGE_H - 82, "A", font="Helvetica-Bold", size=21, color=colors.white, align="center")
    draw_text(pdf, 102, PAGE_H - 69, "ALDER", font="Helvetica-Bold", size=20, color=ink)
    draw_text(pdf, 102, PAGE_H - 87, "IT SERVICES", font="Helvetica-Bold", size=7.5, color=indigo)
    draw_text(pdf, PAGE_W - MARGIN, PAGE_H - 68, "INVOICE", font="Helvetica-Bold", size=27, color=indigo, align="right")
    draw_text(pdf, PAGE_W - MARGIN, PAGE_H - 91, "AIS-2026-0617", font="Helvetica-Bold", size=10, color=ink, align="right")

    pdf.setFillColor(lavender)
    pdf.roundRect(MARGIN, 591, 524, 88, 8, fill=1, stroke=0)
    draw_customer_block(pdf, MARGIN + 16, 655, accent=indigo)
    draw_label_value(pdf, "Invoice date", "06/17/2026", 350, 650, label_color=indigo, width=198)
    draw_label_value(pdf, "Due date", "07/17/2026", 350, 626, label_color=indigo, width=198)
    draw_label_value(pdf, "Terms", "Net 30", 350, 602, label_color=indigo, width=198)

    draw_text(pdf, MARGIN, 552, "JUNE MANAGED SERVICES", font="Helvetica-Bold", size=9, color=indigo)
    rows = [
        ["Managed IT support", "June 1-30, 2026", "$1,800.00"],
        ["Endpoint security monitoring", "25 managed endpoints", "$600.00"],
    ]
    y = draw_table(pdf, MARGIN, 536, [288, 126, 110], ["Service", "Period / Qty", "Amount"], rows, accent=indigo, aligns=["left", "left", "right"], row_height=43)

    pdf.setStrokeColor(HexColor("#D8D6ED"))
    pdf.setDash(3, 3)
    pdf.line(MARGIN, y - 26, PAGE_W - MARGIN, y - 26)
    pdf.setDash()
    draw_text(pdf, MARGIN, y - 51, "Service note", font="Helvetica-Bold", size=7, color=indigo)
    draw_wrapped(pdf, MARGIN, y - 69, "Monthly managed support includes help desk coverage, patch review, endpoint health monitoring, and the June security posture summary.", 300, size=8.5, color=HexColor("#52606D"))

    draw_totals(
        pdf,
        352,
        y - 49,
        [("Subtotal", "$2,400.00"), ("Shipping", "$0.00"), ("Tax", "$0.00"), ("TOTAL DUE", "$2,400.00")],
        accent=indigo,
    )

    pdf.setFillColor(HexColor("#F7F7FB"))
    pdf.roundRect(MARGIN, 190, 524, 103, 8, fill=1, stroke=0)
    draw_text(pdf, MARGIN + 16, 267, "PAYMENT", font="Helvetica-Bold", size=7, color=indigo)
    draw_text(pdf, MARGIN + 16, 247, "Due July 17, 2026", font="Helvetica-Bold", size=10, color=ink)
    draw_text(pdf, MARGIN + 16, 229, "Remit by ACH or check using invoice AIS-2026-0617 as the reference.", size=8.5, color=HexColor("#52606D"))
    draw_text(pdf, 350, 267, "ACCOUNT SUPPORT", font="Helvetica-Bold", size=7, color=indigo)
    draw_text(pdf, 350, 247, "Alder IT Services", font="Helvetica-Bold", size=9, color=ink)
    draw_text(pdf, 350, 229, "billing@alderit.example", size=8.5, color=HexColor("#52606D"))
    draw_text(pdf, 350, 211, "(916) 555-0127", size=8.5, color=HexColor("#52606D"))
    draw_text(pdf, MARGIN + 16, 205, "Currency: USD", size=8, color=HexColor("#52606D"))

    draw_text(pdf, MARGIN, 139, "Thank you for trusting Alder with your technology operations.", font="Helvetica-Bold", size=9.5, color=ink)
    draw_footer(pdf, left="410 Alder Commons, Sacramento, CA 95811", center="USD", right="alderit.example", accent=indigo)
    pdf.save()


def mesa_packaging(path: Path) -> None:
    orange = HexColor("#D97724")
    brown = HexColor("#5A3926")
    sand = HexColor("#FBF1E7")
    pdf = setup_pdf(path, "Invoice MP-77504", "Mesa Packaging Co.")

    pdf.setFillColor(sand)
    pdf.rect(0, PAGE_H - 126, PAGE_W, 126, fill=1, stroke=0)
    pdf.setFillColor(orange)
    pdf.roundRect(MARGIN, PAGE_H - 91, 56, 43, 5, fill=1, stroke=0)
    draw_text(pdf, MARGIN + 28, PAGE_H - 77, "M", font="Helvetica-Bold", size=23, color=colors.white, align="center")
    draw_text(pdf, 114, PAGE_H - 64, "MESA PACKAGING CO.", font="Helvetica-Bold", size=17, color=brown)
    draw_text(pdf, 114, PAGE_H - 84, "PACKAGING THAT MOVES WITH YOU", font="Helvetica-Bold", size=7, color=orange)
    draw_text(pdf, PAGE_W - MARGIN, PAGE_H - 60, "INVOICE", font="Helvetica-Bold", size=24, color=brown, align="right")
    draw_text(pdf, PAGE_W - MARGIN, PAGE_H - 84, "MP-77504", font="Helvetica-Bold", size=10, color=orange, align="right")

    draw_customer_block(pdf, MARGIN, 627, accent=orange, ship_to=True)
    meta_x = 350
    draw_label_value(pdf, "Invoice date", "06/23/2026", meta_x, 633, label_color=orange, width=174)
    draw_label_value(pdf, "Due date", "07/23/2026", meta_x, 611, label_color=orange, width=174)
    draw_label_value(pdf, "Purchase order", "NSO-4870", meta_x, 589, label_color=orange, width=174)
    draw_label_value(pdf, "Ship via", "Mesa Ground", meta_x, 545, label_color=orange, width=174)

    draw_text(pdf, MARGIN, 518, "ITEMS SHIPPED", font="Helvetica-Bold", size=9, color=brown)
    rows = [
        ["BX-1812-K", "Kraft shipping carton 18x12x10", "200", "$6.00", "$1,200.00"],
        ["BX-1210-W", "White mailer 12x10x4", "200", "$4.20", "$840.00"],
        ["PL-48-R", "Recycled void fill, 48 inch roll", "15", "$27.00", "$405.00"],
        ["TP-3-CLR", "Clear carton tape, 3 inch", "24", "$15.00", "$360.00"],
        ["LB-4X6", "Thermal shipping label, 4x6", "10", "$20.00", "$200.00"],
        ["HC-500", "Handle-with-care labels", "4", "$30.00", "$120.00"],
    ]
    y = draw_table(pdf, MARGIN, 503, [78, 214, 48, 82, 102], ["SKU", "Description", "Qty", "Unit price", "Amount"], rows, accent=orange, header_color=brown, aligns=["left", "left", "right", "right", "right"], row_height=31, font_size=7.4)

    draw_text(pdf, MARGIN, y - 31, "Shipment 1ZMP775040  |  14 cartons  |  Shipped 06/22/2026", size=8, color=HexColor("#66727F"))
    draw_totals(
        pdf,
        332,
        y - 29,
        [("Subtotal", "$3,125.00"), ("Shipping", "$180.00"), ("Sales tax", "$273.44"), ("TOTAL DUE", "$3,578.44")],
        accent=orange,
        width=236,
    )

    pdf.setFillColor(sand)
    pdf.roundRect(MARGIN, 119, 524, 73, 7, fill=1, stroke=0)
    draw_text(pdf, MARGIN + 14, 168, "TERMS AND REMITTANCE", font="Helvetica-Bold", size=7, color=brown)
    draw_text(pdf, MARGIN + 14, 148, "Net 30 - due July 23, 2026. Currency: USD.", font="Helvetica-Bold", size=8.7, color=HexColor("#263442"))
    draw_text(pdf, MARGIN + 14, 132, "Send remittance advice to ar@mesapackaging.example and reference MP-77504.", size=8, color=HexColor("#52606D"))
    draw_footer(pdf, left="7220 Commerce Mesa Drive, Stockton, CA 95206", center="USD", right="mesapackaging.example", accent=orange)
    pdf.save()


def redwood_credit(path: Path) -> None:
    red = HexColor("#A52A2A")
    dark = HexColor("#30343B")
    blush = HexColor("#F9EAEA")
    pdf = setup_pdf(path, "Credit Memo CM-1048", "Redwood Safety Supply")

    pdf.setFillColor(dark)
    pdf.rect(0, PAGE_H - 116, PAGE_W, 116, fill=1, stroke=0)
    pdf.setFillColor(red)
    pdf.rect(0, PAGE_H - 124, PAGE_W, 8, fill=1, stroke=0)
    pdf.setStrokeColor(colors.white)
    pdf.setLineWidth(2.2)
    pdf.circle(70, PAGE_H - 59, 24, fill=0, stroke=1)
    pdf.line(58, PAGE_H - 59, 82, PAGE_H - 59)
    pdf.line(70, PAGE_H - 47, 70, PAGE_H - 71)
    draw_text(pdf, 107, PAGE_H - 53, "REDWOOD", font="Helvetica-Bold", size=18, color=colors.white)
    draw_text(pdf, 107, PAGE_H - 74, "SAFETY SUPPLY", font="Helvetica-Bold", size=8, color=HexColor("#E7B5B5"))
    draw_text(pdf, PAGE_W - MARGIN, PAGE_H - 53, "CREDIT MEMO", font="Helvetica-Bold", size=24, color=colors.white, align="right")
    draw_text(pdf, PAGE_W - MARGIN, PAGE_H - 78, "CM-1048", font="Helvetica-Bold", size=11, color=HexColor("#F0B7B7"), align="right")

    pdf.setFillColor(blush)
    pdf.roundRect(MARGIN, 579, 524, 90, 8, fill=1, stroke=0)
    draw_customer_block(pdf, MARGIN + 16, 646, accent=red, title="CREDIT TO")
    draw_label_value(pdf, "Credit date", "06/27/2026", 350, 642, label_color=red, width=198)
    draw_label_value(pdf, "Original invoice", "RSS-41002", 350, 618, label_color=red, width=198)
    draw_label_value(pdf, "Purchase order", "NSO-4755", 350, 594, label_color=red, width=198)

    draw_text(pdf, MARGIN, 536, "RETURN CREDIT", font="Helvetica-Bold", size=9, color=dark)
    rows = [["RS-HARNESS-4", "Returned safety harnesses - unopened", "10", "$65.00", "-$650.00"]]
    y = draw_table(pdf, MARGIN, 520, [91, 231, 45, 72, 85], ["Item", "Description", "Qty", "Unit", "Credit"], rows, accent=red, header_color=dark, aligns=["left", "left", "right", "right", "right"], row_height=46)

    draw_text(pdf, MARGIN, y - 30, "RETURN AUTHORIZATION", font="Helvetica-Bold", size=7, color=red)
    draw_text(pdf, MARGIN, y - 48, "RMA-22061 - received and inspected 06/26/2026", size=8.5, color=HexColor("#52606D"))

    draw_totals(
        pdf,
        332,
        y - 26,
        [("Subtotal credit", "-$650.00"), ("Shipping", "$0.00"), ("Tax credit", "-$56.88"), ("TOTAL CREDIT", "-$706.88")],
        accent=red,
        width=236,
        total_label="TOTAL CREDIT",
    )

    pdf.setFillColor(HexColor("#F6F7F8"))
    pdf.roundRect(MARGIN, 213, 524, 103, 8, fill=1, stroke=0)
    draw_text(pdf, MARGIN + 16, 289, "CREDIT TREATMENT", font="Helvetica-Bold", size=7, color=red)
    draw_text(pdf, MARGIN + 16, 269, "Credit to account", font="Helvetica-Bold", size=11, color=dark)
    draw_wrapped(pdf, MARGIN + 16, 248, "This credit from Redwood Safety Supply will be applied to the Northstar Outdoor Supply account and may be used against the next open invoice. No payment is due on this credit memo.", 480, size=8.5, color=HexColor("#52606D"), leading=13)

    pdf.setStrokeColor(HexColor("#E0E3E7"))
    pdf.line(MARGIN, 174, PAGE_W - MARGIN, 174)
    draw_text(pdf, MARGIN, 151, "Questions about this credit?", font="Helvetica-Bold", size=8.5, color=dark)
    draw_text(pdf, MARGIN, 134, "Contact credits@redwoodsafety.example or (707) 555-0166.", size=8.2, color=HexColor("#52606D"))
    draw_footer(pdf, left="315 Redwood Industrial Way, Santa Rosa, CA 95403", center="USD", right="redwoodsafety.example", accent=red)
    pdf.save()


DOCUMENTS = [
    ("01_summit_freight_INV-20614.pdf", summit_freight),
    ("02_bluepeak_interiors_BPO-8841.pdf", bluepeak_interiors),
    ("03_alder_it_AIS-2026-0617.pdf", alder_it),
    ("04_mesa_packaging_MP-77504.pdf", mesa_packaging),
    ("05_redwood_safety_CM-1048.pdf", redwood_credit),
]


def package_documents(paths: Iterable[Path], archive_path: Path) -> None:
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in paths:
            archive.write(path, arcname=path.name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("output/pdf/accountingclaw-demo"),
        help="Directory for the generated PDFs and ZIP archive.",
    )
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    generated: list[Path] = []
    for filename, generator in DOCUMENTS:
        path = args.output_dir / filename
        generator(path)
        generated.append(path)
        print(f"generated {path}")

    archive_path = args.output_dir / "northstar_ap_2026-06.zip"
    package_documents(generated, archive_path)
    print(f"generated {archive_path}")


if __name__ == "__main__":
    main()
