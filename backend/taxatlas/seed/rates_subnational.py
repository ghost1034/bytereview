"""Canadian provinces/territories (sales tax structure, combined CIT, combined top PIT) and Australian states (payroll tax).

Audit 2026-08-22: canada.ca pages are unreachable from automated clients (connection refused / 403), so Canadian
figures were confirmed against PwC Worldwide Tax Summaries (Canada, rev. Jun 2026) and TaxTips; they stay
'reported'. Australian payroll tax was confirmed on the harmonised payrolltax.gov.au table and state revenue
office pages ('verified' where the state page loaded).
"""

from __future__ import annotations

from taxatlas.seed._helpers import d, rate

AUDIT_DATE = "2026-08-22"
CRA_RATES = "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html"
CRA_CIT = (
    "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/corporations/corporation-tax-rates.html"
)
CRA_PIT = "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html"
CRA = "Canada Revenue Agency"

# code: (combined sales rate, structure description, combined general CIT, provincial CIT, combined top PIT, provincial top PIT, history)
CA_PROV: dict[str, tuple] = {
    "ON": (13.0, "HST 13% (5% federal + 8% provincial component), administered by CRA.", 26.5, 11.5, 53.53, 20.53, []),
    "QC": (
        14.975,
        "Federal GST 5% + Quebec Sales Tax (QST) 9.975% administered by Revenu Québec; QST is not an HST.",
        26.5,
        11.5,
        53.31,
        25.75,
        [],
    ),
    "BC": (
        12.0,
        "Federal GST 5% + BC Provincial Sales Tax (PST) 7%, a separate retail sales tax (registration for remote sellers above CAD 10,000).",
        27.0,
        12.0,
        53.5,
        20.5,
        [],
    ),
    "AB": (5.0, "Federal GST 5% only; Alberta levies no provincial sales tax.", 23.0, 8.0, 48.0, 15.0, []),
    "MB": (12.0, "Federal GST 5% + Manitoba Retail Sales Tax (RST) 7%.", 27.0, 12.0, 50.4, 17.4, []),
    "SK": (11.0, "Federal GST 5% + Saskatchewan PST 6%.", 27.0, 12.0, 47.5, 14.5, []),
    "NS": (
        14.0,
        "HST 14% (5% federal + 9% provincial) from 1 Apr 2025; was 15% (10% provincial) before.",
        29.0,
        14.0,
        54.0,
        21.0,
        [
            (
                "vat",
                "standard",
                15.0,
                "2010-07-01",
                "2025-03-31",
                "2025-04-01",
                "2025-04-01",
                "Provincial component reduced from 10% to 9% (2024 Nova Scotia budget commitment)",
            )
        ],
    ),
    "NB": (15.0, "HST 15% (5% federal + 10% provincial).", 29.0, 14.0, 52.5, 19.5, []),
    "NL": (15.0, "HST 15% (5% federal + 10% provincial).", 30.0, 15.0, 54.8, 21.8, []),
    "PE": (
        15.0,
        "HST 15% (5% federal + 10% provincial).",
        30.0,
        15.0,
        53.0,
        20.0,
        [
            (
                "personal_income",
                "top_marginal",
                51.75,
                "2024-01-01",
                "2024-12-31",
                "2025-01-01",
                "2025-01-01",
                "Provincial top rate 18.75% (2024)",
            ),
            (
                "personal_income",
                "top_marginal",
                52.0,
                "2025-01-01",
                "2025-12-31",
                "2026-01-01",
                AUDIT_DATE,
                "Provincial top rate 19% above CAD 140,000 (2025); PEI Budget 2026 added a 20% bracket above CAD 200,000",
            ),
            (
                "corporate_income",
                "headline",
                31.0,
                "2020-01-01",
                "2025-06-30",
                "2025-07-01",
                AUDIT_DATE,
                "Provincial general rate cut from 16% to 15% (PEI Budget 2025-26; effective date reported, not confirmed on a PEI primary page)",
            ),
        ],
    ),
    "NT": (5.0, "Federal GST 5% only; no territorial sales tax.", 26.5, 11.5, 47.05, 14.05, []),
    "NU": (5.0, "Federal GST 5% only; no territorial sales tax.", 27.0, 12.0, 44.5, 11.5, []),
    "YT": (5.0, "Federal GST 5% only; no territorial sales tax.", 27.0, 12.0, 48.0, 15.0, []),
}

R: list[dict] = []
_CA_URL = {"vat": CRA_RATES, "corporate_income": CRA_CIT, "personal_income": CRA_PIT}
for p, (sales, struct, cit_c, cit_p, pit_c, pit_p, history) in CA_PROV.items():
    jur = f"CA-{p}"
    hist = {(h[0], h[1]): h for h in history}  # last entry per kind wins
    h = hist.get(("vat", "standard"))
    R.append(
        rate(
            jur,
            "vat",
            "standard",
            sales,
            frm=h[5] if h else None,
            as_of=AUDIT_DATE,
            src=CRA,
            url=CRA_RATES,
            desc="Combined federal + provincial sales tax rate (GST/HST/PST/QST)",
            notes=struct,
        )
    )
    h = hist.get(("corporate_income", "headline"))
    R.append(
        rate(
            jur,
            "corporate_income",
            "headline",
            cit_c,
            frm=h[5] if h else None,
            as_of=AUDIT_DATE,
            src=CRA,
            url=CRA_CIT,
            desc="Combined federal (15%) + provincial general corporate income tax rate",
            notes=f"Provincial general rate {cit_p}%; lower small-business rates apply."
            + (" Nova Scotia small-business rate 1.5% from 1 Apr 2025." if p == "NS" else ""),
        )
    )
    h = hist.get(("personal_income", "top_marginal"))
    R.append(
        rate(
            jur,
            "personal_income",
            "top_marginal",
            pit_c,
            frm=h[5] if h else None,
            as_of=AUDIT_DATE,
            src=CRA,
            url=CRA_PIT,
            desc="Combined federal (33%) + provincial top marginal personal income tax rate",
            notes=f"Provincial top rate {pit_p}%."
            + (" Alberta's new 8% bottom bracket (2025) does not change the top combined rate." if p == "AB" else ""),
        )
    )
    for tt, rk, old, old_from, old_to, _nf, _na, note in history:
        R.append(
            rate(
                jur,
                tt,
                rk,
                old,
                frm=old_from,
                to=old_to,
                as_of=old_to,
                src=CRA,
                url=_CA_URL[tt],
                desc={
                    "vat": "Prior combined sales tax rate",
                    "corporate_income": "Prior combined general corporate rate",
                    "personal_income": "Prior combined top marginal personal rate",
                }[tt],
                notes=note,
            )
        )

# Australian states: payroll tax (GST and income tax are federal).
# (rate, threshold AUD, url, note, frm, conf, history) — history: (kind, old_value, old_from, old_to, note)
PAYROLL_HARMONISED = "https://www.payrolltax.gov.au/harmonisation/payroll-tax-rates-and-thresholds"
AU_PAYROLL: dict[str, tuple] = {
    "NSW": (
        5.45,
        1200000,
        "https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/payroll-tax/rates-and-thresholds",
        None,
        None,
        "verified",
        [],
    ),
    "VIC": (
        4.85,
        1000000,
        "https://www.sro.vic.gov.au/rates-taxes-duties-and-levies/payroll-tax-current-rates",
        "1.2125% for regional employers; mental health and wellbeing surcharge (0.5%/1%) and COVID debt levy apply above AUD 10m/100m national payroll. Threshold 700,000 → 900,000 (1 Jul 2024) → 1,000,000 (1 Jul 2025); deduction phases out between AUD 3m and 5m.",
        "2025-07-01",
        "verified",
        [("registration_threshold", 900000, "2024-07-01", "2025-06-30", "Threshold FY2024-25")],
    ),
    "QLD": (
        4.75,
        1300000,
        "https://qro.qld.gov.au/payroll-tax/calculate/rates-thresholds/",
        "4.95% where Australian taxable wages exceed AUD 6.5m; regional discount 1% (to 30 Jun 2030); mental health levy 0.25% above AUD 10m plus 0.5% above AUD 100m.",
        None,
        "verified",
        [],
    ),
    "WA": (
        5.5,
        1000000,
        "https://www.wa.gov.au/organisation/department-of-treasury-and-finance/about-payroll-tax",
        "Diminishing threshold between AUD 1m and 7.5m; 6%/6.5% tiers above AUD 100m/1.5bn.",
        None,
        "reported",
        [],
    ),
    "SA": (
        4.95,
        1500000,
        "https://www.revenuesa.sa.gov.au/payrolltax/rates-and-thresholds",
        "Variable rate 0%–4.95% for wages between AUD 1.5m and 1.7m. RevenueSA page blocks automated clients; confirmed on the harmonised table.",
        None,
        "reported",
        [],
    ),
    "TAS": (
        4.0,
        1250000,
        "https://www.sro.tas.gov.au/payroll-tax/rates-thresholds",
        "6.1% for wages above AUD 2m.",
        None,
        "verified",
        [],
    ),
    "ACT": (
        6.75,
        1750000,
        PAYROLL_HARMONISED,
        "Progressive scale from 1 Jul 2026: 6.75% (AUD 1.75m–20m), 6.85% (20m–50m), 7.35% (50m–100m), 7.85% (100m–150m), 8.75% above 150m; universities capped at 6.85%. Previously flat 6.85% with a AUD 2m threshold (plus 0.25%/0.5% large-employer surcharge from 1 Jul 2025). ACT Revenue Office pages block automated clients; harmonised table used.",
        "2026-07-01",
        "reported",
        [
            ("standard", 6.85, "2016-07-01", "2026-06-30", "Flat rate before the FY2026-27 progressive scale"),
            ("registration_threshold", 2000000, "2016-07-01", "2026-06-30", "Threshold before 1 Jul 2026"),
        ],
    ),
    "NT": (
        5.5,
        2500000,
        "https://nt.gov.au/employ/money-and-taxes/payroll-tax",
        "Threshold increased from AUD 1.5m to 2.5m on 1 Jul 2025. nt.gov.au blocks automated clients; confirmed on the harmonised table.",
        "2025-07-01",
        "reported",
        [("registration_threshold", 1500000, "2016-07-01", "2025-06-30", "Threshold before 1 Jul 2025")],
    ),
}
for s, (pr, thr, url, note, frm, conf, history) in AU_PAYROLL.items():
    jur = f"AU-{s}"
    auth = f"{s} state revenue office"
    hist_kinds = {h[0] for h in history}
    R.append(
        rate(
            jur,
            "payroll_social",
            "standard",
            pr,
            frm=frm if "standard" in hist_kinds else None,
            src=auth,
            url=url,
            as_of=AUDIT_DATE,
            conf=conf,
            desc="State payroll tax rate on employer Australian taxable wages above the threshold",
            notes=note,
        )
    )
    R.append(
        rate(
            jur,
            "payroll_social",
            "registration_threshold",
            None,
            thr=thr,
            cur="AUD",
            frm=frm if "registration_threshold" in hist_kinds else None,
            src=auth,
            url=url,
            as_of=AUDIT_DATE,
            conf=conf,
            desc="Annual Australian taxable wages threshold (FY2025-26; ACT FY2026-27)",
            notes=note,
        )
    )
    for kind, old, old_from, old_to, hnote in history:
        R.append(
            rate(
                jur,
                "payroll_social",
                kind,
                old if kind == "standard" else None,
                thr=None if kind == "standard" else old,
                cur=None if kind == "standard" else "AUD",
                frm=old_from,
                to=old_to,
                as_of=old_to,
                src=auth,
                url=url,
                desc="Prior payroll tax rate" if kind == "standard" else "Prior annual taxable wages threshold",
                notes=hnote,
            )
        )

_ = d  # kept for parity with the other rate modules

RATES_SUBNATIONAL: list[dict] = R
