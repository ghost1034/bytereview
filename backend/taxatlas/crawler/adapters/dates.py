"""Tolerant date parsing shared by adapters.

Handles ISO, US/EU numeric, English prose, common European month names and abbreviations
(DE/FR/NL/ES/PT/IT), Japanese Reiwa-era dates, CJK Y年M月D日, and dates embedded in URLs.

Deliberately conservative: a date is only returned when the text contains an unambiguous,
year-bearing date fragment. Free text such as "Revenue Procedure 12 2026" or "Updated 3 forms 2026"
yields None rather than a guessed month — adapters routinely pass whole listing rows (``date_selector:
"self"``) through here, so fuzzy parsing would invent publication dates from document numbers.

Numeric convention: '.' and '-' separated dates (20.08.2026, 20-08-2026) are day-first everywhere they
are used; '/' separated dates follow the caller's ``dayfirst`` flag (US default month-first).
"""

from __future__ import annotations

import re
from datetime import date, datetime
from time import struct_time

# ISO / year-first numeric: 2026-08-21, 2026/08/21, 2026.08.21 (also the date part of ISO timestamps)
_YMD_NUM = re.compile(r"(?<!\d)(20\d{2})([-/.])(\d{1,2})\2(\d{1,2})(?!\d)")
# Day/month numeric with a 4- or 2-digit year: 20.08.2026, 19/08/2026, 6/30/26, 20-08-2026
_NUM_DATE = re.compile(r"(?<!\d)(\d{1,2})([./-])(\d{1,2})\2(20\d{2}|\d{2})(?!\d)")
_URL_DATE = re.compile(r"/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})(?:/|$|[^\d])")
_REIWA = re.compile(r"令和\s*(\d{1,2}|元)\s*年\s*(?:(\d{1,2})\s*月)?\s*(?:(\d{1,2})\s*日)?")
_YMD_CJK = re.compile(r"(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(?:(\d{1,2})\s*日)?")

# English month names/abbreviations (after translation). "sept" is accepted as well as "sep".
_MONTH_NAME = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?"
_ORDINAL = r"(?:º|°|st|nd|rd|th)?"
_DMY_TEXT = re.compile(
    rf"(?<![\d\w])(\d{{1,2}})\.?{_ORDINAL}(?:\s+|-)(?:de\s+|of\s+)?({_MONTH_NAME}),?(?:\s+|-)(?:de\s+)?(20\d{{2}})\b",
    re.I,
)
_MDY_TEXT = re.compile(rf"\b({_MONTH_NAME})\s+(\d{{1,2}}){_ORDINAL},?\s+(20\d{{2}})\b", re.I)
_MY_TEXT = re.compile(rf"\b({_MONTH_NAME})\s+(20\d{{2}})\b", re.I)
_MONTH_INDEX = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}

# Non-English month names and abbreviations -> English (lowercase)
_MONTHS: dict[str, str] = {
    # German  (abbreviations are included only where they are not also common English words)
    "januar": "january",
    "februar": "february",
    "märz": "march",
    "maerz": "march",
    "mär": "march",
    "mrz": "march",
    "mai": "may",
    "juni": "june",
    "juli": "july",
    "oktober": "october",
    "okt": "october",
    "dezember": "december",
    "dez": "december",
    # French
    "janvier": "january",
    "janv": "january",
    "février": "february",
    "fevrier": "february",
    "févr": "february",
    "fév": "february",
    "mars": "march",
    "avril": "april",
    "avr": "april",
    "juin": "june",
    "juillet": "july",
    "juil": "july",
    "août": "august",
    "aout": "august",
    "septembre": "september",
    "sept": "september",
    "octobre": "october",
    "novembre": "november",
    "décembre": "december",
    "decembre": "december",
    "déc": "december",
    # Russian (genitive, as used in dates: 21 августа 2026)
    "января": "january",
    "февраля": "february",
    "марта": "march",
    "апреля": "april",
    "мая": "may",
    "июня": "june",
    "июля": "july",
    "августа": "august",
    "сентября": "september",
    "октября": "october",
    "ноября": "november",
    "декабря": "december",
    # Dutch
    "januari": "january",
    "februari": "february",
    "maart": "march",
    "mrt": "march",
    "mei": "may",
    "augustus": "august",
    # Spanish / Portuguese / Italian
    "enero": "january",
    "ene": "january",
    "febrero": "february",
    "marzo": "march",
    "abril": "april",
    "abr": "april",
    "mayo": "may",
    "junio": "june",
    "julio": "july",
    "agosto": "august",
    "septiembre": "september",
    "setiembre": "september",
    "octubre": "october",
    "noviembre": "november",
    "diciembre": "december",
    "dic": "december",
    "janeiro": "january",
    "fevereiro": "february",
    "fev": "february",
    "março": "march",
    "marco": "march",
    "maio": "may",
    "junho": "june",
    "julho": "july",
    "setembro": "september",
    "outubro": "october",
    "novembro": "november",
    "dezembro": "december",
    "gennaio": "january",
    "febbraio": "february",
    "aprile": "april",
    "maggio": "may",
    "giugno": "june",
    "giu": "june",
    "luglio": "july",
    "lug": "july",
    "settembre": "september",
    "ottobre": "october",
    "ott": "october",
    "dicembre": "december",
}
_MONTH_RX = re.compile(r"\b(" + "|".join(sorted(map(re.escape, _MONTHS), key=len, reverse=True)) + r")\b", re.I)


def _translate_months(text: str) -> str:
    return _MONTH_RX.sub(lambda m: _MONTHS[m.group(1).lower()], text)


def _safe_date(y: int, m: int, d: int) -> date | None:
    if y < 1990 or y > 2100:
        return None
    try:
        return date(y, m, d)
    except ValueError:
        return None


def _month_number(name: str) -> int | None:
    return _MONTH_INDEX.get(name.lower()[:3])


def _cjk(text: str) -> date | None:
    m = _REIWA.search(text)
    if m:
        n = 1 if m.group(1) == "元" else int(m.group(1))
        return _safe_date(2018 + n, int(m.group(2) or 1), int(m.group(3) or 1))
    m = _YMD_CJK.search(text)
    if m:
        return _safe_date(int(m.group(1)), int(m.group(2)), int(m.group(3) or 1))
    return None


def _numeric(text: str, dayfirst: bool) -> date | None:
    m = _YMD_NUM.search(text)
    if m:
        return _safe_date(int(m.group(1)), int(m.group(3)), int(m.group(4)))
    m = _NUM_DATE.search(text)
    if not m:
        return None
    a, sep, b, year = int(m.group(1)), m.group(2), int(m.group(3)), int(m.group(4))
    if year < 100:
        year += 2000
    day_first = True if sep in ".-" else dayfirst
    if a > 12 and b <= 12:
        day, month = a, b
    elif b > 12 and a <= 12:
        day, month = b, a
    elif day_first:
        day, month = a, b
    else:
        day, month = b, a
    return _safe_date(year, month, day)


def _prose(text: str) -> date | None:
    m = _DMY_TEXT.search(text)
    if m:
        mon = _month_number(m.group(2))
        return _safe_date(int(m.group(3)), mon, int(m.group(1))) if mon else None
    m = _MDY_TEXT.search(text)
    if m:
        mon = _month_number(m.group(1))
        return _safe_date(int(m.group(3)), mon, int(m.group(2))) if mon else None
    m = _MY_TEXT.search(text)
    if m:
        mon = _month_number(m.group(1))
        return _safe_date(int(m.group(2)), mon, 1) if mon else None
    return None


def parse_date(value: object, fmt: str | None = "auto", dayfirst: bool = False) -> date | None:
    """Parse many date shapes into a date. Returns None instead of raising (and instead of guessing)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, struct_time):
        return _safe_date(value.tm_year, value.tm_mon, value.tm_mday)
    text = " ".join(str(value).split())
    # Nested markup yields "August 20 , 2026" / "20 . August 2026" once the tags are flattened with spaces.
    text = re.sub(r"\s+([,.])", r"\1", text)
    if not text:
        return None
    if fmt and fmt != "auto":
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            pass  # fall through to auto
    cjk = _cjk(text)
    if cjk:
        return cjk
    # ISO first so "2026-08-21T23:30:00-05:00" keeps the publisher's local date rather than shifting to UTC.
    m = _YMD_NUM.search(text)
    if m:
        return _safe_date(int(m.group(1)), int(m.group(3)), int(m.group(4)))
    text = _translate_months(text)
    return _prose(text) or _numeric(text, dayfirst)


def date_from_url(url: str) -> date | None:
    """Some listings encode dates only in the URL (/2026/03/12/slug)."""
    m = _URL_DATE.search(url)
    if m:
        return _safe_date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None
