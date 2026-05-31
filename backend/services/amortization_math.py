"""Pure-function amortization math ported from CPAAnalytics/src/lib/amortization.ts.

Covers:
- Straight-line depreciation/amortization
- Declining-balance (DDB or arbitrary multiplier) with straight-line cross-over
- Loan amortization
- ASC 842 operating lease (ROU + lease liability rollforward)
- ASC 842 finance lease (ROU + lease liability rollforward)
- MACRS / ADS with conventions, Section 179, bonus, and listed-property limits
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Union


def _parse_start_date(start: Union[str, date, datetime, None]) -> datetime:
    if isinstance(start, datetime):
        return start
    if isinstance(start, date):
        return datetime(start.year, start.month, start.day)
    if isinstance(start, str) and start:
        try:
            return datetime.fromisoformat(start.replace("Z", "+00:00"))
        except ValueError:
            return datetime.strptime(start[:10], "%Y-%m-%d")
    return datetime.utcnow()


def _add_months(base: datetime, months: int) -> datetime:
    """Add `months` to `base` using UTC-style arithmetic (clamps to end-of-month)."""
    total_month = base.month - 1 + months
    year = base.year + total_month // 12
    month = total_month % 12 + 1
    day = base.day
    if month == 12:
        next_month_first = datetime(year + 1, 1, 1)
    else:
        next_month_first = datetime(year, month + 1, 1)
    last_day = (next_month_first - timedelta(days=1)).day
    day = min(day, last_day)
    return datetime(year, month, day)


def _iso_date(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# Straight-line
# ---------------------------------------------------------------------------


def calculate_straight_line(
    cost_basis: float,
    salvage_value: float,
    periods: int,
    start_date: Union[str, date, datetime, None],
) -> List[Dict[str, Any]]:
    start = _parse_start_date(start_date)
    schedule: List[Dict[str, Any]] = []
    current_balance = cost_basis
    monthly_expense = (cost_basis - salvage_value) / periods if periods else 0.0

    for i in range(1, periods + 1):
        current_date = _add_months(start, i - 1)
        expense = monthly_expense
        if current_balance - expense < salvage_value:
            expense = current_balance - salvage_value

        closing_balance = current_balance - expense
        schedule.append(
            {
                "period": i,
                "date": _iso_date(current_date),
                "openingBalance": current_balance,
                "expense": expense,
                "closingBalance": max(0.0, closing_balance),
            }
        )
        current_balance = closing_balance
        if current_balance <= salvage_value + 0.01:
            break

    return schedule


# ---------------------------------------------------------------------------
# Declining-balance with straight-line cross-over
# ---------------------------------------------------------------------------


def calculate_declining_balance(
    cost_basis: float,
    salvage_value: float,
    periods: int,
    start_date: Union[str, date, datetime, None],
    multiplier: float = 2.0,
) -> List[Dict[str, Any]]:
    start = _parse_start_date(start_date)
    schedule: List[Dict[str, Any]] = []
    current_balance = cost_basis

    for i in range(1, periods + 1):
        current_date = _add_months(start, i - 1)
        rate = multiplier / (periods / 12.0) if periods else 0.0
        annual_expense = current_balance * rate
        expense = annual_expense / 12.0

        sl_remaining = (
            (current_balance - salvage_value) / (periods - i + 1)
            if (periods - i + 1) > 0
            else 0.0
        )
        if sl_remaining > expense:
            expense = sl_remaining

        if current_balance - expense < salvage_value:
            expense = current_balance - salvage_value

        closing_balance = current_balance - expense
        schedule.append(
            {
                "period": i,
                "date": _iso_date(current_date),
                "openingBalance": current_balance,
                "expense": expense,
                "closingBalance": max(0.0, closing_balance),
            }
        )
        current_balance = closing_balance
        if current_balance <= salvage_value + 0.01:
            break

    return schedule


# ---------------------------------------------------------------------------
# Loan amortization
# ---------------------------------------------------------------------------


def calculate_loan_amortization(
    principal: float,
    annual_rate: float,
    periods: int,
    start_date: Union[str, date, datetime, None],
) -> List[Dict[str, Any]]:
    start = _parse_start_date(start_date)
    schedule: List[Dict[str, Any]] = []
    current_balance = principal
    monthly_rate = (annual_rate / 100.0) / 12.0
    if monthly_rate == 0 or periods == 0:
        payment = principal / periods if periods else 0.0
    else:
        payment = (principal * monthly_rate) / (1 - (1 + monthly_rate) ** (-periods))

    for i in range(1, periods + 1):
        current_date = _add_months(start, i - 1)
        interest = current_balance * monthly_rate
        principal_payment = payment - interest
        if current_balance - principal_payment < 0:
            principal_payment = current_balance

        closing_balance = current_balance - principal_payment

        schedule.append(
            {
                "period": i,
                "date": _iso_date(current_date),
                "payment": payment,
                "interest": interest,
                "principal": principal_payment,
                "balance": max(0.0, closing_balance),
            }
        )
        current_balance = closing_balance
        if current_balance <= 0.01:
            break

    return schedule


# ---------------------------------------------------------------------------
# ASC 842 operating lease
# ---------------------------------------------------------------------------


def calculate_operating_lease(
    payments: float,
    periods: int,
    ibr: float,
    direct_costs: float,
    prepaid: float,
    incentives: float,
    start_date: Union[str, date, datetime, None],
) -> List[Dict[str, Any]]:
    start = _parse_start_date(start_date)
    schedule: List[Dict[str, Any]] = []
    monthly_rate = (ibr / 100.0) / 12.0

    pv = 0.0
    for i in range(1, periods + 1):
        pv += payments / ((1 + monthly_rate) ** i)

    rou_asset_initial = pv + direct_costs + prepaid - incentives
    total_lease_cost = (payments * periods) + direct_costs + prepaid - incentives
    sl_expense = total_lease_cost / periods if periods else 0.0

    liab_balance = pv
    rou_balance = rou_asset_initial

    for i in range(1, periods + 1):
        current_date = _add_months(start, i - 1)
        interest = liab_balance * monthly_rate
        principal = payments - interest
        new_liab_balance = max(0.0, liab_balance - principal)

        rou_amortization = sl_expense - interest
        new_rou_balance = max(0.0, rou_balance - rou_amortization)

        schedule.append(
            {
                "period": i,
                "date": _iso_date(current_date),
                "payment": payments,
                "slExpense": sl_expense,
                "interest": interest,
                "principal": principal,
                "liabBalance": new_liab_balance,
                "rouBalance": new_rou_balance,
            }
        )
        liab_balance = new_liab_balance
        rou_balance = new_rou_balance

    return schedule


# ---------------------------------------------------------------------------
# ASC 842 finance lease
# ---------------------------------------------------------------------------


def calculate_finance_lease(
    payments: float,
    periods: int,
    ibr: float,
    direct_costs: float,
    prepaid: float,
    incentives: float,
    start_date: Union[str, date, datetime, None],
) -> List[Dict[str, Any]]:
    start = _parse_start_date(start_date)
    schedule: List[Dict[str, Any]] = []
    monthly_rate = (ibr / 100.0) / 12.0

    pv = 0.0
    for i in range(1, periods + 1):
        pv += payments / ((1 + monthly_rate) ** i)

    rou_asset_initial = pv + direct_costs + prepaid - incentives
    rou_amortization = rou_asset_initial / periods if periods else 0.0

    liab_balance = pv
    rou_balance = rou_asset_initial

    for i in range(1, periods + 1):
        current_date = _add_months(start, i - 1)
        interest = liab_balance * monthly_rate
        principal = payments - interest
        new_liab_balance = max(0.0, liab_balance - principal)

        new_rou_balance = max(0.0, rou_balance - rou_amortization)

        schedule.append(
            {
                "period": i,
                "date": _iso_date(current_date),
                "payment": payments,
                "interest": interest,
                "rouAmortization": rou_amortization,
                "totalExpense": interest + rou_amortization,
                "principal": principal,
                "liabBalance": new_liab_balance,
                "rouBalance": new_rou_balance,
            }
        )
        liab_balance = new_liab_balance
        rou_balance = new_rou_balance

    return schedule


# ---------------------------------------------------------------------------
# MACRS / ADS
# ---------------------------------------------------------------------------

# GDS half-year convention (IRS Pub. 946 Table A-1 style)
_GDS_HALF_YEAR_RATES: Dict[str, List[float]] = {
    "3-year": [33.33, 44.45, 14.81, 7.41],
    "5-year": [20.00, 32.00, 19.20, 11.52, 11.52, 5.76],
    "7-year": [14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46],
    "10-year": [10.00, 18.00, 14.40, 11.52, 9.22, 7.37, 6.55, 6.55, 6.56, 6.55, 3.28],
    "15-year": [
        5.00, 9.50, 8.55, 7.70, 6.93, 6.23, 5.90, 5.90, 5.91, 5.90,
        5.91, 5.90, 5.91, 5.90, 5.91, 2.95,
    ],
    "20-year": [
        3.75, 7.219, 6.677, 6.177, 5.713, 5.285, 4.888, 4.522, 4.462, 4.461,
        4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 2.231,
    ],
}

# GDS mid-quarter convention (IRS Pub. 946 Tables A-2 through A-5)
_GDS_MID_QUARTER_RATES: Dict[str, Dict[int, List[float]]] = {
    "3-year": {
        1: [58.33, 27.78, 12.35, 1.54],
        2: [41.67, 33.33, 22.22, 2.78],
        3: [25.00, 39.58, 33.33, 2.09],
        4: [8.33, 44.44, 33.33, 13.90],
    },
    "5-year": {
        1: [35.00, 26.00, 15.60, 11.01, 11.01, 1.38],
        2: [25.00, 30.00, 18.00, 11.37, 11.37, 4.26],
        3: [15.00, 34.00, 20.40, 12.49, 12.49, 5.62],
        4: [5.00, 38.00, 22.80, 13.57, 13.57, 7.06],
    },
    "7-year": {
        1: [25.00, 21.43, 15.31, 10.93, 8.75, 8.74, 8.75, 1.09],
        2: [17.85, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 1.40],
        3: [10.71, 27.55, 19.68, 14.06, 10.04, 10.04, 10.06, 1.26],
        4: [3.57, 29.61, 21.15, 15.11, 10.79, 10.78, 10.79, 1.40],
    },
    "10-year": {
        1: [21.00, 18.00, 14.40, 11.52, 9.22, 7.37, 6.55, 6.55, 6.56, 6.55, 1.64],
        2: [15.00, 20.00, 16.00, 12.80, 10.24, 8.19, 6.55, 6.55, 6.56, 6.55, 2.36],
        3: [9.00, 22.00, 17.60, 14.08, 11.26, 9.01, 6.55, 6.55, 6.56, 6.55, 2.84],
        4: [3.00, 24.00, 19.20, 15.36, 12.29, 9.83, 6.55, 6.55, 6.56, 6.55, 3.31],
    },
    "15-year": {
        1: [10.75, 9.78, 8.80, 7.83, 7.06, 6.29, 5.90, 5.90, 5.91, 5.90, 5.91, 5.90, 5.91, 5.90, 5.91, 1.48],
        2: [7.75, 10.84, 9.76, 8.78, 7.90, 7.11, 6.40, 5.90, 5.91, 5.90, 5.91, 5.90, 5.91, 5.90, 5.91, 2.38],
        3: [4.75, 11.90, 10.71, 9.64, 8.68, 7.81, 7.03, 5.90, 5.91, 5.90, 5.91, 5.90, 5.91, 5.90, 5.91, 3.28],
        4: [1.75, 12.96, 11.66, 10.50, 9.45, 8.50, 7.65, 5.90, 5.91, 5.90, 5.91, 5.90, 5.91, 5.90, 5.91, 4.18],
    },
    "20-year": {
        1: [8.125, 7.719, 7.177, 6.677, 6.213, 5.785, 4.888, 4.522, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 1.115],
        2: [5.875, 8.125, 7.719, 7.177, 6.677, 6.213, 5.785, 4.888, 4.522, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 1.794],
        3: [3.625, 8.531, 7.719, 7.177, 6.677, 6.213, 5.785, 4.888, 4.522, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 2.473],
        4: [1.375, 8.938, 7.719, 7.177, 6.677, 6.213, 5.785, 4.888, 4.522, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 3.152],
    },
}

# GDS class life -> ADS recovery period (years)
_ADS_RECOVERY_YEARS: Dict[str, int] = {
    "3-year": 5,
    "5-year": 6,
    "7-year": 10,
    "10-year": 10,
    "15-year": 15,
    "20-year": 20,
}


def _normalize_property_class(property_class: str) -> str:
    key = (property_class or "5-year").strip().lower()
    if key in _GDS_HALF_YEAR_RATES:
        return key
    for candidate in _GDS_HALF_YEAR_RATES:
        if candidate in key:
            return candidate
    return "5-year"


def _normalize_convention(convention: Optional[str]) -> str:
    value = (convention or "Half-Year").strip().lower().replace("_", "-")
    if value in ("half-year", "half year", "hy"):
        return "half-year"
    if value in ("mid-quarter", "mid quarter", "mq"):
        return "mid-quarter"
    if value in ("mid-month", "mid month", "mm"):
        return "mid-month"
    return "half-year"


def _normalize_system(macrs_system: Optional[str]) -> str:
    value = (macrs_system or "GDS").strip().upper()
    return "ADS" if value == "ADS" else "GDS"


def _placement_quarter(start_date: Union[str, date, datetime, None]) -> int:
    month = _parse_start_date(start_date).month
    return (month - 1) // 3 + 1


def _placement_month(start_date: Union[str, date, datetime, None]) -> int:
    return _parse_start_date(start_date).month


def _round2(value: float) -> float:
    return round(value + 1e-9, 2)


def _normalize_rates(rates: List[float]) -> List[float]:
    total = sum(rates)
    if total <= 0:
        return rates
    if abs(total - 100.0) <= 0.05:
        return [_round2(r) for r in rates]
    factor = 100.0 / total
    normalized = [_round2(r * factor) for r in rates]
    drift = _round2(100.0 - sum(normalized))
    if normalized:
        normalized[-1] = _round2(normalized[-1] + drift)
    return normalized


def _gds_half_year_rates(property_class: str) -> List[float]:
    return list(_GDS_HALF_YEAR_RATES.get(property_class, _GDS_HALF_YEAR_RATES["5-year"]))


def _gds_mid_quarter_rates(property_class: str, quarter: int) -> List[float]:
    by_class = _GDS_MID_QUARTER_RATES.get(property_class)
    if by_class and quarter in by_class:
        return list(by_class[quarter])
    # Fallback: scale half-year first-year rate by standard MQ factors for 5-year.
    hy = _gds_half_year_rates(property_class)
    mq_factor = {1: 1.75, 2: 1.25, 3: 0.75, 4: 0.25}.get(quarter, 1.0)
    first = hy[0] * mq_factor
    remainder = 100.0 - first
    tail_total = sum(hy[1:])
    tail = [r * remainder / tail_total for r in hy[1:]] if tail_total else []
    return _normalize_rates([first, *tail])


def _gds_mid_month_rates(property_class: str, month: int) -> List[float]:
    hy = _gds_half_year_rates(property_class)
    if not hy:
        return hy
    months_in_first = 12 - month + 0.5
    months_in_last = month - 0.5
    rates = list(hy)
    rates[0] = hy[0] * (months_in_first / 6.0)
    rates[-1] = hy[-1] * (months_in_last / 6.0)
    return _normalize_rates(rates)


def _ads_recovery_years(property_class: str) -> int:
    return _ADS_RECOVERY_YEARS.get(property_class, 6)


def _ads_half_year_rates(recovery_years: int) -> List[float]:
    annual = 100.0 / recovery_years
    if recovery_years <= 1:
        return [100.0]
    rates = [annual * 0.5] + [annual] * (recovery_years - 2) + [annual * 0.5]
    return _normalize_rates(rates)


def _ads_mid_quarter_rates(recovery_years: int, quarter: int) -> List[float]:
    annual = 100.0 / recovery_years
    mq_first = {1: 10.5, 2: 7.5, 3: 4.5, 4: 1.5}.get(quarter, 6.0)
    first = annual * (mq_first / 12.0)
    remainder = 100.0 - first
    if recovery_years <= 1:
        return [100.0]
    middle_years = max(recovery_years - 2, 0)
    middle_each = remainder / (middle_years + 1) if (middle_years + 1) else remainder
    rates = [first] + [middle_each] * middle_years + [middle_each]
    return _normalize_rates(rates)


def _ads_mid_month_rates(recovery_years: int, month: int) -> List[float]:
    annual = 100.0 / recovery_years
    months_in_first = 12 - month + 0.5
    months_in_last = month - 0.5
    if recovery_years <= 1:
        return [annual * (months_in_first / 12.0)]
    rates = [annual * (months_in_first / 12.0)]
    rates.extend([annual] * (recovery_years - 2))
    rates.append(annual * (months_in_last / 12.0))
    return _normalize_rates(rates)


def _annual_depreciation_rates(
    property_class: str,
    macrs_system: str,
    convention: str,
    start_date: Union[str, date, datetime, None],
) -> List[float]:
    if macrs_system == "ADS":
        recovery = _ads_recovery_years(property_class)
        if convention == "mid-quarter":
            return _ads_mid_quarter_rates(recovery, _placement_quarter(start_date))
        if convention == "mid-month":
            return _ads_mid_month_rates(recovery, _placement_month(start_date))
        return _ads_half_year_rates(recovery)

    if convention == "mid-quarter":
        return _gds_mid_quarter_rates(property_class, _placement_quarter(start_date))
    if convention == "mid-month":
        return _gds_mid_month_rates(property_class, _placement_month(start_date))
    return _gds_half_year_rates(property_class)


def _resolve_listed_property_rules(
    *,
    listed_property: bool,
    business_use_percentage: Optional[float],
    macrs_system: str,
    section179_election: bool,
    bonus_election: bool,
    section_179: float,
    bonus_percent: float,
) -> Dict[str, Any]:
    """Apply listed-property limits (IRC §280F).

    Business use <= 50% forces ADS straight-line and disallows §179 / bonus.
    Business use > 50% limits deductible basis to the business-use percentage.
    """
    if not listed_property:
        return {
            "macrs_system": macrs_system,
            "section179_election": section179_election,
            "bonus_election": bonus_election,
            "section_179": section_179,
            "bonus_percent": bonus_percent,
            "business_use_factor": 1.0,
            "listed_property_limited": False,
        }

    use_pct = min(100.0, max(0.0, business_use_percentage or 0.0))
    if use_pct <= 50.0:
        return {
            "macrs_system": "ADS",
            "section179_election": False,
            "bonus_election": False,
            "section_179": 0.0,
            "bonus_percent": 0.0,
            "business_use_factor": use_pct / 100.0,
            "listed_property_limited": True,
        }

    return {
        "macrs_system": macrs_system,
        "section179_election": section179_election,
        "bonus_election": bonus_election,
        "section_179": section_179,
        "bonus_percent": bonus_percent,
        "business_use_factor": use_pct / 100.0,
        "listed_property_limited": True,
    }


def calculate_macrs(
    cost_basis: float,
    property_class: str,
    bonus_percent: float,
    section_179: float,
    start_year: int,
    *,
    start_date: Union[str, date, datetime, None] = None,
    macrs_system: Optional[str] = "GDS",
    convention: Optional[str] = "Half-Year",
    section179_election: bool = False,
    bonus_election: bool = False,
    listed_property: bool = False,
    business_use_percentage: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Build an annual tax depreciation schedule.

    Order of operations:
    1. Listed-property rules (may force ADS and disallow §179 / bonus)
    2. Business-use limitation on depreciable basis
    3. §179 (year 1)
    4. Bonus depreciation on remaining basis (year 1)
    5. MACRS / ADS on remaining basis using the selected convention
    """
    schedule: List[Dict[str, Any]] = []
    prop_class = _normalize_property_class(property_class)
    rules = _resolve_listed_property_rules(
        listed_property=listed_property,
        business_use_percentage=business_use_percentage,
        macrs_system=_normalize_system(macrs_system),
        section179_election=section179_election,
        bonus_election=bonus_election,
        section_179=max(0.0, section_179 or 0.0),
        bonus_percent=max(0.0, bonus_percent or 0.0),
    )

    system = rules["macrs_system"]
    convention_key = _normalize_convention(convention)
    business_factor = rules["business_use_factor"]

    depreciable_basis = max(0.0, cost_basis * business_factor)
    sec179 = min(rules["section_179"], depreciable_basis) if rules["section179_election"] else 0.0
    remaining_after_179 = max(0.0, depreciable_basis - sec179)
    bonus_pct = rules["bonus_percent"] if rules["bonus_election"] else 0.0
    bonus = remaining_after_179 * (bonus_pct / 100.0)
    macrs_basis = max(0.0, remaining_after_179 - bonus)

    class_rates = _annual_depreciation_rates(prop_class, system, convention_key, start_date)
    accum_dep = 0.0

    for i, pct in enumerate(class_rates):
        year = start_year + i
        rate = pct / 100.0
        macrs_dep = macrs_basis * rate

        total_dep = macrs_dep
        year_bonus = 0.0
        year_sec179 = 0.0
        if i == 0:
            year_bonus = bonus
            year_sec179 = sec179
            total_dep += year_bonus + year_sec179

        total_dep = _round2(total_dep)
        accum_dep = _round2(accum_dep + total_dep)
        tax_basis = _round2(max(0.0, cost_basis - accum_dep))

        schedule.append(
            {
                "year": year,
                "macrsSystem": system,
                "convention": convention_key,
                "businessUsePct": _round2(business_factor * 100.0) if listed_property else None,
                "bonus": _round2(year_bonus),
                "sec179": _round2(year_sec179),
                "macrsRate": pct,
                "macrsDep": _round2(macrs_dep),
                "totalDep": total_dep,
                "taxBasis": tax_basis,
            }
        )

    return schedule


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------


def generate_schedule(
    method: str,
    *,
    asset_type: Optional[str] = None,
    cost_basis: float = 0.0,
    salvage_value: float = 0.0,
    useful_life_months: int = 0,
    start_date: Union[str, date, datetime, None] = None,
    declining_multiplier: Optional[float] = None,
    annual_rate: Optional[float] = None,
    payment_amount: Optional[float] = None,
    ibr: Optional[float] = None,
    direct_costs: Optional[float] = None,
    prepaid: Optional[float] = None,
    incentives: Optional[float] = None,
    property_class: Optional[str] = None,
    bonus_percent: Optional[float] = None,
    section_179: Optional[float] = None,
    start_year: Optional[int] = None,
    macrs_system: Optional[str] = None,
    convention: Optional[str] = None,
    section179_election: bool = False,
    bonus_election: bool = False,
    listed_property: bool = False,
    business_use_percentage: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Pick the right schedule generator based on `method`.

    `method` values follow CPAAnalytics conventions:
    - 'straight_line' / 'SL'
    - 'declining_balance' / 'DDB'
    - 'loan'
    - 'operating_lease'
    - 'finance_lease'
    - 'macrs'
    """
    m = (method or "").lower()

    if m in ("straight_line", "sl", "straight-line"):
        return calculate_straight_line(cost_basis, salvage_value, useful_life_months, start_date)

    if m in ("declining_balance", "ddb", "double_declining_balance"):
        return calculate_declining_balance(
            cost_basis,
            salvage_value,
            useful_life_months,
            start_date,
            multiplier=declining_multiplier or 2.0,
        )

    if m == "loan":
        if annual_rate is None:
            raise ValueError("annual_rate required for loan amortization")
        return calculate_loan_amortization(
            cost_basis, annual_rate, useful_life_months, start_date
        )

    if m == "operating_lease":
        return calculate_operating_lease(
            payment_amount or 0.0,
            useful_life_months,
            ibr or 0.0,
            direct_costs or 0.0,
            prepaid or 0.0,
            incentives or 0.0,
            start_date,
        )

    if m == "finance_lease":
        return calculate_finance_lease(
            payment_amount or 0.0,
            useful_life_months,
            ibr or 0.0,
            direct_costs or 0.0,
            prepaid or 0.0,
            incentives or 0.0,
            start_date,
        )

    if m == "macrs":
        if not property_class or start_year is None:
            raise ValueError("property_class and start_year required for MACRS")
        return calculate_macrs(
            cost_basis,
            property_class,
            bonus_percent or 0.0,
            section_179 or 0.0,
            start_year,
            start_date=start_date,
            macrs_system=macrs_system,
            convention=convention,
            section179_election=section179_election,
            bonus_election=bonus_election,
            listed_property=listed_property,
            business_use_percentage=business_use_percentage,
        )

    raise ValueError(f"Unknown amortization method: {method}")
