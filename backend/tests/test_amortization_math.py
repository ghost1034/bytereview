"""Unit tests for MACRS / ADS tax schedule generation."""

from __future__ import annotations

import pytest

from services import amortization_math


def _first_year_total(schedule: list[dict]) -> float:
    return schedule[0]["totalDep"]


def test_gds_half_year_with_section179_and_bonus():
    schedule = amortization_math.calculate_macrs(
        cost_basis=10_000,
        property_class="5-year",
        bonus_percent=20,
        section_179=1_000,
        start_year=2026,
        start_date="2026-02-01",
        macrs_system="GDS",
        convention="Half-Year",
        section179_election=True,
        bonus_election=True,
    )
    assert schedule[0]["sec179"] == 1_000
    assert schedule[0]["bonus"] == 1_800  # 20% of (10000 - 1000)
    assert schedule[0]["macrsDep"] == 1_440  # 20% of remaining 7200
    assert schedule[0]["totalDep"] == 4_240


def test_ads_produces_longer_straight_line_schedule():
    gds = amortization_math.calculate_macrs(
        cost_basis=10_000,
        property_class="5-year",
        bonus_percent=0,
        section_179=0,
        start_year=2026,
        start_date="2026-02-01",
        macrs_system="GDS",
        convention="Half-Year",
    )
    ads = amortization_math.calculate_macrs(
        cost_basis=10_000,
        property_class="5-year",
        bonus_percent=0,
        section_179=0,
        start_year=2026,
        start_date="2026-02-01",
        macrs_system="ADS",
        convention="Half-Year",
    )
    assert len(gds) == 6
    assert len(ads) == 6  # ADS 6-year recovery for 5-year class
    assert ads[0]["macrsSystem"] == "ADS"
    assert ads[0]["macrsDep"] < gds[0]["macrsDep"]


def test_mid_quarter_differs_from_half_year():
    hy = amortization_math.calculate_macrs(
        cost_basis=10_000,
        property_class="5-year",
        bonus_percent=0,
        section_179=0,
        start_year=2026,
        start_date="2026-02-01",  # Q1
        macrs_system="GDS",
        convention="Half-Year",
    )
    mq = amortization_math.calculate_macrs(
        cost_basis=10_000,
        property_class="5-year",
        bonus_percent=0,
        section_179=0,
        start_year=2026,
        start_date="2026-02-01",  # Q1
        macrs_system="GDS",
        convention="Mid-Quarter",
    )
    assert hy[0]["macrsDep"] != mq[0]["macrsDep"]
    assert mq[0]["macrsRate"] == pytest.approx(35.0, rel=0, abs=0.01)


def test_listed_property_over_50_percent_limits_basis():
    full = amortization_math.calculate_macrs(
        cost_basis=10_000,
        property_class="5-year",
        bonus_percent=0,
        section_179=0,
        start_year=2026,
        start_date="2026-02-01",
        macrs_system="GDS",
        convention="Half-Year",
        listed_property=True,
        business_use_percentage=95,
    )
    assert full[0]["businessUsePct"] == 95
    assert full[0]["macrsDep"] == pytest.approx(1_900, rel=0, abs=0.01)  # 20% of 9500


def test_listed_property_50_or_less_forces_ads_and_disallows_179_bonus():
    schedule = amortization_math.calculate_macrs(
        cost_basis=10_000,
        property_class="5-year",
        bonus_percent=20,
        section_179=1_000,
        start_year=2026,
        start_date="2026-02-01",
        macrs_system="GDS",
        convention="Half-Year",
        section179_election=True,
        bonus_election=True,
        listed_property=True,
        business_use_percentage=45,
    )
    assert schedule[0]["macrsSystem"] == "ADS"
    assert schedule[0]["sec179"] == 0
    assert schedule[0]["bonus"] == 0


def test_election_toggles_disable_179_and_bonus():
    schedule = amortization_math.calculate_macrs(
        cost_basis=10_000,
        property_class="5-year",
        bonus_percent=20,
        section_179=1_000,
        start_year=2026,
        start_date="2026-02-01",
        macrs_system="GDS",
        convention="Half-Year",
        section179_election=False,
        bonus_election=False,
    )
    assert schedule[0]["sec179"] == 0
    assert schedule[0]["bonus"] == 0
    assert schedule[0]["macrsDep"] == 2_000


def test_generate_schedule_dispatcher_passes_macrs_options():
    schedule = amortization_math.generate_schedule(
        "macrs",
        cost_basis=5_000,
        property_class="5-year",
        start_year=2026,
        start_date="2026-08-15",
        macrs_system="GDS",
        convention="Mid-Quarter",
        section179_election=True,
        section_179=500,
        bonus_election=True,
        bonus_percent=10,
        listed_property=True,
        business_use_percentage=80,
    )
    assert len(schedule) >= 1
    assert schedule[0]["convention"] == "mid-quarter"
