"""Pure-function amortization math ported from CPAAnalytics/src/lib/amortization.ts.

Covers:
- Straight-line depreciation/amortization
- Declining-balance (DDB or arbitrary multiplier) with straight-line cross-over
- Loan amortization
- ASC 842 operating lease (ROU + lease liability rollforward)
- ASC 842 finance lease (ROU + lease liability rollforward)
- MACRS (half-year convention) with bonus + Section 179
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
    # Clamp the day so e.g. Jan 31 + 1mo -> Feb 28/29
    day = base.day
    # Find last day of target month
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
# MACRS (Half-Year Convention)
# ---------------------------------------------------------------------------


_MACRS_RATES: Dict[str, List[float]] = {
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


def calculate_macrs(
    cost_basis: float,
    property_class: str,
    bonus_percent: float,
    section_179: float,
    start_year: int,
) -> List[Dict[str, Any]]:
    schedule: List[Dict[str, Any]] = []

    bonus = cost_basis * (bonus_percent / 100.0)
    remaining_basis = max(0.0, cost_basis - bonus - section_179)

    class_rates = _MACRS_RATES.get(property_class) or _MACRS_RATES["5-year"]
    accum_dep = 0.0

    for i, pct in enumerate(class_rates):
        year = start_year + i
        rate = pct / 100.0
        macrs_dep = remaining_basis * rate

        total_dep = macrs_dep
        if i == 0:
            total_dep += bonus + section_179

        accum_dep += total_dep
        tax_basis = max(0.0, cost_basis - accum_dep)

        schedule.append(
            {
                "year": year,
                "bonus": bonus if i == 0 else 0.0,
                "sec179": section_179 if i == 0 else 0.0,
                "macrsRate": pct,
                "macrsDep": macrs_dep,
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
        )

    raise ValueError(f"Unknown amortization method: {method}")
