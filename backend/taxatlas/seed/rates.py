"""Aggregated tax-rate seed rows."""

from __future__ import annotations

from taxatlas.seed.rates_countries import RATES_COUNTRIES
from taxatlas.seed.rates_countries_2 import RATES_COUNTRIES_2
from taxatlas.seed.rates_subnational import RATES_SUBNATIONAL
from taxatlas.seed.rates_subnational_global import RATES_SUBNATIONAL_GLOBAL
from taxatlas.seed.rates_us_states import RATES_US_STATES

RATES: list[dict] = [
    *RATES_COUNTRIES,
    *RATES_COUNTRIES_2,
    *RATES_US_STATES,
    *RATES_SUBNATIONAL,
    *RATES_SUBNATIONAL_GLOBAL,
]
