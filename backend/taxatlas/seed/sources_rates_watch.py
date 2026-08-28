"""Reference-rate watchers (category "rates", adapter "rates_table").

These sources watch *published rate tables* and compare them with the TaxRate reference data. The crawler never
rewrites a rate: when an observed value differs from every live DB row for (jurisdiction, tax_type, rate_kind) by more
than 0.01, it records a ChangeEvent(entity_type="rate") whose ``new_value._meta.proposal`` is true. Admins review the
proposal in the change feed and apply it by hand (audit trail: the event carries source URL, observed value, time).

Third-party tables (PwC Worldwide Tax Summaries, Tax Foundation, Avalara) are used as *signals*: only the rate number
and the page URL are stored — never page text. Official pages (CRA, HMRC, Revenue Ireland, IRAS, payrolltax.gov.au)
are preferred where a parseable table exists. All watchers run weekly (Monday 06:xx UTC), minutes staggered.

Every URL and table shape below was verified on 2026-08-25 against a scratch database (see docs/sources.md,
"Rate watchers").
"""

from __future__ import annotations

from taxatlas.models.enums import TaxType as T

_PWC = "https://taxsummaries.pwc.com/quick-charts/"
_PWC_NOTE = (
    "Third-party signal (PwC Worldwide Tax Summaries quick chart). Territory names resolve through the ISO name map; "
    "only the rate number and the chart URL are stored."
)
_TF_NOTE = "Third-party signal (Tax Foundation). State names resolve to US-XX; only the rate number and URL are stored."
# PwC lists GST jurisdictions inside the VAT chart; our reference data keys them as tax_type=gst.
_GST_CODES = {c: "gst" for c in ("AU", "NZ", "SG", "IN", "CA", "JE", "BT", "MV", "PG", "WS", "PW", "SL", "LR", "BZ")}

SOURCES: list[dict] = [
    # ------------------------------------------------------------------------------------
    # PwC Worldwide Tax Summaries — global quick charts
    # ------------------------------------------------------------------------------------
    {
        "slug": "rates-pwc-vat-standard",
        "name": "PwC quick chart — standard VAT/GST rates",
        "url": _PWC + "value-added-tax-vat-rates",
        "jurisdiction_code": None,
        "tax_types": [T.VAT, T.GST],
        "category": "rates",
        "adapter": "rates_table",
        "config": {
            "key_column": "Territory",
            "columns": {"Standard VAT rate": {"tax_type": "vat", "rate_kind": "standard", "parse": "number"}},
            "tax_type_overrides": _GST_CODES,
            "note": _PWC_NOTE + " Cells with several rates or prose ('13, 9, or 6 depending…') are skipped.",
        },
        "schedule_cron": "5 6 * * 1",
        "enabled": True,
        "authority": "PwC Worldwide Tax Summaries",
    },
    {
        "slug": "rates-pwc-cit-headline",
        "name": "PwC quick chart — headline corporate income tax rates",
        "url": _PWC + "corporate-income-tax-cit-rates",
        "jurisdiction_code": None,
        "tax_types": [T.CORPORATE_INCOME],
        "category": "rates",
        "adapter": "rates_table",
        "config": {
            "key_column": "Territory",
            "columns": {
                "Headline CIT rate": {"tax_type": "corporate_income", "rate_kind": "headline", "parse": "number"}
            },
            "note": _PWC_NOTE,
        },
        "schedule_cron": "15 6 * * 1",
        "enabled": True,
        "authority": "PwC Worldwide Tax Summaries",
    },
    {
        "slug": "rates-pwc-pit-top",
        "name": "PwC quick chart — headline personal income tax rates",
        "url": _PWC + "personal-income-tax-pit-rates",
        "jurisdiction_code": None,
        "tax_types": [T.PERSONAL_INCOME],
        "category": "rates",
        "adapter": "rates_table",
        "config": {
            "key_column": "Territory",
            "columns": {
                "Headline PIT rate": {"tax_type": "personal_income", "rate_kind": "top_marginal", "parse": "number"}
            },
            "note": _PWC_NOTE,
        },
        "schedule_cron": "25 6 * * 1",
        "enabled": True,
        "authority": "PwC Worldwide Tax Summaries",
    },
    {
        "slug": "rates-pwc-wht",
        "name": "PwC quick chart — withholding tax rates (dividends / interest / royalties)",
        "url": _PWC + "withholding-tax-wht-rates",
        "jurisdiction_code": None,
        "tax_types": [T.WITHHOLDING],
        "category": "rates",
        "adapter": "rates_table",
        "config": {
            "key_column": "Territory",
            "columns": {
                "WHT rates": {
                    "tax_type": "withholding",
                    "rate_kinds": ["dividends", "interest", "royalties"],
                    "parse": "wht",
                }
            },
            "note": _PWC_NOTE
            + " The non-resident segment is read; when a slot lists alternatives ('0 or 27.5') the statutory maximum "
            "is taken. Prose cells are skipped.",
        },
        "schedule_cron": "35 6 * * 1",
        "enabled": True,
        "authority": "PwC Worldwide Tax Summaries",
    },
    # ------------------------------------------------------------------------------------
    # United States — state tables
    # ------------------------------------------------------------------------------------
    {
        "slug": "rates-taxfoundation-state-sales",
        "name": "Tax Foundation — 2026 state sales tax rates (mid-year)",
        "url": "https://taxfoundation.org/data/all/state/2026-sales-tax-rates-midyear/",
        "jurisdiction_code": "US",
        "tax_types": [T.SALES_USE],
        "category": "rates",
        "adapter": "rates_table",
        "config": {
            "key_column": "State",
            "key_scope": "US",
            "name_map": {"D.C.": "US-DC", "Washington, D.C.": "US-DC"},
            "columns": {"State Tax Rate": {"tax_type": "sales_use", "rate_kind": "standard", "parse": "number"}},
            "note": _TF_NOTE + " URL slug changes each edition (…-midyear / …-2027); re-point in January and July.",
        },
        "schedule_cron": "45 6 * * 1",
        "enabled": True,
        "authority": "Tax Foundation",
    },
    {
        "slug": "rates-taxfoundation-state-cit",
        "name": "Tax Foundation — state corporate income tax rates and brackets",
        "url": "https://taxfoundation.org/data/all/state/state-corporate-income-tax-rates-brackets/",
        "jurisdiction_code": "US",
        "tax_types": [T.CORPORATE_INCOME],
        "category": "rates",
        "adapter": "rates_table",
        "config": {
            "key_column": "State",
            "key_scope": "US",
            "name_map": {"D.C.": "US-DC"},
            "columns": {
                "Rates": {
                    "tax_type": "corporate_income",
                    "rate_kind": "headline",
                    "parse": "number",
                    "aggregate": "max",
                }
            },
            "note": _TF_NOTE + " One row per bracket; the top bracket (max) is the headline rate.",
        },
        "schedule_cron": "55 6 * * 1",
        "enabled": True,
        "authority": "Tax Foundation",
    },
    {
        "slug": "rates-taxfoundation-state-pit",
        "name": "Tax Foundation — 2026 state individual income tax rates and brackets",
        "url": "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/",
        "jurisdiction_code": "US",
        "tax_types": [T.PERSONAL_INCOME],
        "category": "rates",
        "adapter": "rates_table",
        "config": {
            "table_index": 1,
            "key_column": "State",
            "key_scope": "US",
            "name_map": {"D.C.": "US-DC"},
            "skip_rows": ["^-? ?Washington(?! DC)"],
            "columns": {
                "Single Filer (Rates)": {
                    "tax_type": "personal_income",
                    "rate_kind": "top_marginal",
                    "parse": "number",
                    "aggregate": "max",
                }
            },
            "note": _TF_NOTE
            + " Table 2 of the page; '- State' continuation rows carry the upper brackets, so max = top marginal. "
            "'none' (no income tax) is skipped; Washington is skipped (its 7%/9% rows are the capital-gains excise, not an income tax). Re-point the URL each January.",
        },
        "schedule_cron": "5 7 * * 1",
        "enabled": True,
        "authority": "Tax Foundation",
    },
    {
        "slug": "rates-avalara-state-sales",
        "name": "Avalara — state sales tax base rates (second opinion)",
        "url": "https://www.avalara.com/us/en/taxrates/state-rates.html",
        "jurisdiction_code": "US",
        "tax_types": [T.SALES_USE],
        "category": "rates",
        "adapter": "rates_table",
        "config": {
            "table_selector": "table.cmp-table__table",
            "key_column": "State guides",
            "key_scope": "US",
            "columns": {"State base rate": {"tax_type": "sales_use", "rate_kind": "standard", "parse": "number"}},
            "note": "Third-party second opinion on state base rates. Cells published as ranges ('0%–7%') are skipped.",
        },
        "schedule_cron": "15 7 * * 1",
        "enabled": True,
        "authority": "Avalara",
    },
    # ------------------------------------------------------------------------------------
    # Official national / sub-national tables
    # ------------------------------------------------------------------------------------
    {
        "slug": "rates-cra-gst-hst",
        "name": "Canada Revenue Agency — GST/HST rate by province",
        "url": (
            "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/"
            "charge-collect-which-rate/calculator.html"
        ),
        "jurisdiction_code": "CA",
        "tax_types": [T.VAT],
        "category": "rates",
        "adapter": "rates_table",
        "config": {
            "table_index": 0,
            "key_column": "Province",
            "key_scope": "CA",
            "skip_rows": ["^British Columbia", "^Manitoba", "^Quebec", "^Qu\u00e9bec", "^Saskatchewan"],
            "columns": {"GST and HST": {"tax_type": "vat", "rate_kind": "standard", "parse": "number"}},
            "note": "Official. Table 1 (current GST/HST by province). PST provinces (BC, MB, QC, SK) are skipped: the "
            "reference data stores their combined GST+PST/QST rate while this column is the 5% federal GST only.",
        },
        "schedule_cron": "25 7 * * 1",
        "enabled": True,
        "authority": "Canada Revenue Agency",
    },
    {
        "slug": "rates-au-payroll-tax",
        "name": "Australia — payroll tax rates and thresholds (harmonised table)",
        "url": "https://www.payrolltax.gov.au/harmonisation/payroll-tax-rates-and-thresholds",
        "jurisdiction_code": "AU",
        "tax_types": [T.PAYROLL_SOCIAL],
        "category": "rates",
        "adapter": "rates_table",
        "config": {
            "table_index": 0,
            "key_column": "State/Territory",
            "key_scope": "AU",
            "columns": {
                "Rates": {"tax_type": "payroll_social", "rate_kind": "standard", "parse": "number"},
                "Thresholds": {
                    "tax_type": "payroll_social",
                    "rate_kind": "registration_threshold",
                    "parse": "amount",
                    "value_field": "threshold_amount",
                },
            },
            "note": "Official (state revenue offices' joint site). Tiered-rate cells (ACT, QLD prose) are skipped; the "
            "first amount in the threshold cell is the annual threshold.",
        },
        "schedule_cron": "35 7 * * 1",
        "enabled": True,
        "authority": "Australian state and territory revenue offices (payrolltax.gov.au)",
    },
    {
        "slug": "rates-gb-hmrc-vat",
        "name": "HMRC — VAT rates (standard / reduced / zero)",
        "url": "https://www.gov.uk/vat-rates",
        "jurisdiction_code": "GB",
        "tax_types": [T.VAT],
        "category": "rates",
        "adapter": "rates_table",
        "config": {
            "fixed_code": "GB",
            "key_kind": "label",
            "key_column": 0,
            "value_column": 1,
            "tax_type": "vat",
            "row_map": {"^standard": "standard", "^reduced": "reduced", "^zero": "zero"},
            "note": "Official. Rows are rate labels, values in column 2.",
        },
        "schedule_cron": "45 7 * * 1",
        "enabled": True,
        "authority": "HM Revenue & Customs",
    },
    {
        "slug": "rates-ie-revenue-vat",
        "name": "Revenue Ireland — current VAT rates",
        "url": "https://www.revenue.ie/en/vat/vat-rates/search-vat-rates/current-vat-rates.aspx",
        "jurisdiction_code": "IE",
        "tax_types": [T.VAT],
        "category": "rates",
        "adapter": "rates_table",
        "config": {
            "fixed_code": "IE",
            "row_select": "first",
            "columns": {
                "Standard rate": {"tax_type": "vat", "rate_kind": "standard", "parse": "number"},
                "Reduced rate": {"tax_type": "vat", "rate_kind": "reduced", "parse": "number"},
                "Second reduced rate": {"tax_type": "vat", "rate_kind": "reduced", "parse": "number"},
                "Livestock rate": {"tax_type": "vat", "rate_kind": "super_reduced", "parse": "number"},
            },
            "note": "Official. Rate-history table; the first row is the rate set currently in force.",
        },
        "schedule_cron": "55 7 * * 1",
        "enabled": True,
        "authority": "Office of the Revenue Commissioners",
    },
    {
        "slug": "rates-sg-iras-gst",
        "name": "IRAS — current GST rate",
        "url": "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/basics-of-gst/current-gst-rates",
        "jurisdiction_code": "SG",
        "tax_types": [T.GST],
        "category": "rates",
        "adapter": "rates_table",
        "config": {
            "fixed_code": "SG",
            "tax_type": "gst",
            "rate_kind": "standard",
            "text_regex": r"current GST rate in Singapore is\s*(\d+(?:\.\d+)?)\s*%",
            "note": "Official. The page table is the rate history (ends at the 2023 8% row); the current rate is stated in "
            "prose, read with text_regex.",
        },
        "schedule_cron": "5 8 * * 1",
        "enabled": True,
        "authority": "Inland Revenue Authority of Singapore",
    },
    {
        "slug": "rates-eu-vat-tedb",
        "name": "European Commission — VAT rates (TEDB)",
        "url": "https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en",
        "jurisdiction_code": "EU",
        "tax_types": [T.VAT],
        "category": "rates",
        "adapter": "rates_table",
        "config": {
            "key_column": 0,
            "columns": {"Standard": {"tax_type": "vat", "rate_kind": "standard"}},
            "note": "The VAT-rates page no longer embeds the member-state table and links no XLSX/PDF; the per-country "
            "rates live in TEDB (ec.europa.eu/taxation_customs/tedb), a client-rendered app with no stable export URL. "
            "Disabled; rates-pwc-vat-standard covers the EU-27 meanwhile. Needs browser adapter.",
        },
        "schedule_cron": "15 8 * * 1",
        "enabled": False,
        "authority": "European Commission (DG TAXUD)",
    },
]

__all__ = ["SOURCES"]
