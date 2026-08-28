"""Country-level tax rates (EU-27 + ~35 other economies). See README.md for provenance and the as_of convention.

Block helpers (vat/cit/pit/wht/p2) emit several TaxRate row dicts each. Historical rows carry `to` and the current
row carries `frm` so the loader can emit rate_changed events for each historical->current pair.

Audit 2026-08-22 (docs/data-audit.md): headline VAT/GST, CIT and PIT rows for the jurisdictions in AUDITED were
checked against a primary source or PwC WWTS; rows confirmed on a primary authority page carry confidence='verified'
with as_of=AUDIT_DATE (see `_apply_audit` at the bottom of this module).
"""

from __future__ import annotations

from taxatlas.seed._helpers import d, rate

AUDIT_DATE = "2026-08-22"

# The EU Commission "VAT rates" landing page no longer carries a rate table (the PDF was discontinued after the
# 1 Jan 2021 edition; rates live in the JS-only TEDB). It is kept as the EU-level landing page; per-country
# verification used national authority pages and the EC SME-scheme national pages (thresholds).
EU_VAT_URL = "https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en"
EU_VAT_SRC = "European Commission – VAT rates"
EC_SME = "https://sme-vat-rules.ec.europa.eu/national-vat-rules/{slug}-sme-rules_en"
OECD_URL = "https://www.oecd.org/en/data/datasets/tax-database.html"
OECD_SRC = "OECD Tax Database"
PWC = "PwC Worldwide Tax Summaries"


def pwc(slug: str, page: str) -> str:
    return f"https://taxsummaries.pwc.com/{slug}/{page}"


def vat(
    jur,
    std,
    reduced=(),
    *,
    super_reduced=None,
    zero=False,
    thr=None,
    cur=None,
    frm=None,
    url=None,
    src=None,
    as_of="2025-01-01",
    desc=None,
    applies=None,
    notes=None,
    tax_type="vat",
    conf="reported",
):
    url = url or EU_VAT_URL
    src = src or EU_VAT_SRC
    rows = [
        rate(
            jur,
            tax_type,
            "standard",
            std,
            frm=frm,
            url=url,
            src=src,
            as_of=as_of,
            conf=conf,
            desc=desc or f"Standard {tax_type.upper()} rate",
            notes=notes,
        )
    ]
    for r_ in reduced:
        rows.append(
            rate(jur, tax_type, "reduced", r_, url=url, src=src, as_of=as_of, desc="Reduced rate", applies=applies)
        )
    if super_reduced is not None:
        rows.append(
            rate(
                jur, tax_type, "super_reduced", super_reduced, url=url, src=src, as_of=as_of, desc="Super-reduced rate"
            )
        )
    if zero:
        rows.append(
            rate(
                jur,
                tax_type,
                "zero",
                0.0,
                url=url,
                src=src,
                as_of=as_of,
                desc="Zero rate (taxable at 0% with input recovery)",
            )
        )
    if thr is not None:
        rows.append(
            rate(
                jur,
                tax_type,
                "registration_threshold",
                None,
                thr=thr,
                cur=cur,
                url=url,
                src=src,
                as_of=as_of,
                desc="Domestic registration threshold (annual taxable turnover)",
            )
        )
    return rows


def cit(
    jur,
    headline,
    *,
    slug,
    frm=None,
    as_of="2025-01-01",
    desc="Headline corporate income tax rate",
    notes=None,
    conf="reported",
    url=None,
    src=None,
):
    return [
        rate(
            jur,
            "corporate_income",
            "headline",
            headline,
            frm=frm,
            as_of=as_of,
            conf=conf,
            src=src or PWC,
            url=url or pwc(slug, "corporate/taxes-on-corporate-income"),
            desc=desc,
            notes=notes,
        )
    ]


def pit(
    jur,
    top,
    *,
    slug,
    frm=None,
    as_of="2025-01-01",
    desc="Top marginal personal income tax rate",
    notes=None,
    conf="reported",
    url=None,
    src=None,
):
    return [
        rate(
            jur,
            "personal_income",
            "top_marginal",
            top,
            frm=frm,
            as_of=as_of,
            conf=conf,
            src=src or PWC,
            url=url or pwc(slug, "individual/taxes-on-personal-income"),
            desc=desc,
            notes=notes,
        )
    ]


def wht(
    jur,
    div,
    int_,
    roy,
    *,
    slug,
    as_of="2025-01-01",
    notes=None,
    div_notes=None,
    int_notes=None,
    roy_notes=None,
    url=None,
):
    url = url or pwc(slug, "corporate/withholding-taxes")
    base = "Domestic statutory withholding rate on payments to non-residents (before treaty relief)"
    return [
        rate(
            jur,
            "withholding",
            "dividends",
            div,
            as_of=as_of,
            src=PWC,
            url=url,
            desc=f"{base}: dividends",
            notes=div_notes or notes,
        ),
        rate(
            jur,
            "withholding",
            "interest",
            int_,
            as_of=as_of,
            src=PWC,
            url=url,
            desc=f"{base}: interest",
            notes=int_notes or notes,
        ),
        rate(
            jur,
            "withholding",
            "royalties",
            roy,
            as_of=as_of,
            src=PWC,
            url=url,
            desc=f"{base}: royalties",
            notes=roy_notes or notes,
        ),
    ]


P2_URL = "https://www.oecd.org/en/topics/sub-issues/global-minimum-tax.html"


def p2(
    jur, desc, *, frm=None, adopted=True, as_of="2025-01-01", url=P2_URL, src="OECD – Global minimum tax (Pillar Two)"
):
    return [
        rate(jur, "pillar_two", "minimum", 15.0 if adopted else None, frm=frm, as_of=as_of, src=src, url=url, desc=desc)
    ]


def dst(jur, value, desc, *, frm, to=None, url, src, as_of="2025-01-01", notes=None):
    return [
        rate(
            jur,
            "digital_services",
            "standard",
            value,
            frm=frm,
            to=to,
            as_of=as_of,
            url=url,
            src=src,
            desc=desc,
            notes=notes,
        )
    ]


R: list[dict] = []

# ----------------------------------------------------------------------------------------------------------------
# EU-27
# ----------------------------------------------------------------------------------------------------------------
RIS_USTG = "https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10004873&Paragraf=10"
R += vat(
    "AT",
    20,
    [10, 13],
    thr=55000,
    cur="EUR",
    url=RIS_USTG,
    src="RIS – UStG 1994 §10",
    notes="Threshold raised from EUR 35,000 to EUR 55,000 from 1 Jan 2025 (EC SME national page).",
)
R += [
    rate(
        "AT",
        "vat",
        "super_reduced",
        4.9,
        frm="2026-07-01",
        as_of=AUDIT_DATE,
        conf="verified",
        url="https://www.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2026_I_37/BGBLA_2026_I_37.html",
        src="RIS – BGBl. I Nr. 37/2026",
        desc="Super-reduced rate on staple foods listed in Anlage 3 UStG (§10 Abs 1a) from 1 Jul 2026",
    ),
    rate(
        "AT",
        "vat",
        "zero",
        0.0,
        frm="2026-01-01",
        as_of=AUDIT_DATE,
        url="https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10004873",
        src="RIS – UStG 1994 §6 Abs 1 Z 5b",
        desc="Zero rate (exempt with input recovery) for contraceptives and feminine hygiene products",
        notes="Provision in force per RIS; 1 Jan 2026 start date taken from secondary sources.",
    ),
]
R += cit(
    "AT",
    23,
    slug="austria",
    frm="2024-01-01",
    notes="Reduced from 25% (2022) to 24% (2023) and 23% (2024). BGBl. I Nr. 62/2026 enacts a 24% tier on profit above EUR 1m for fiscal years beginning after 31 Dec 2027 (reported; verify before reliance).",
)
R += [
    rate(
        "AT",
        "corporate_income",
        "headline",
        24,
        frm="2023-01-01",
        to="2023-12-31",
        src=PWC,
        url=pwc("austria", "corporate/taxes-on-corporate-income"),
        desc="Headline corporate income tax rate (2023)",
    )
]
R += pit(
    "AT",
    55,
    slug="austria",
    url="https://www.bmf.gv.at/themen/steuern/arbeitnehmerveranlagung/steuertarif-steuerabsetzbetraege/steuertarif-steuerabsetzbetraege.html",
    src="BMF – Steuertarif",
    notes="55% bracket applies above EUR 1m; Budgetbegleitgesetz 2025 extended it until 2029 (then 50%).",
)
R += wht(
    "AT",
    27.5,
    0,
    20,
    slug="austria",
    div_notes="27.5% for individuals; 25% corporate recipients.",
    int_notes="Generally no WHT on interest paid to non-residents.",
)
R += dst(
    "AT",
    5,
    "Digital Advertising Tax (Digitalsteuer) on online advertising revenue; groups with EUR 750m global / EUR 25m Austrian digital ad revenue.",
    frm="2020-01-01",
    url="https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=20010780",
    src="RIS – Digitalsteuergesetz 2020",
    as_of=AUDIT_DATE,
    notes="BMF Digitalsteuer landing page returns 404 (Aug 2026); statute text on RIS used instead.",
)
R += p2(
    "AT",
    "Mindestbesteuerungsgesetz (MinBestG): IIR and QDMTT from fiscal years starting 31 Dec 2023; UTPR from 2025.",
    frm="2024-01-01",
)

R += vat("BE", 21, [6, 12], zero=True, thr=25000, cur="EUR")
R += cit("BE", 25, slug="belgium", notes="20% SME rate on first EUR 100,000 of taxable income.")
R += pit("BE", 50, slug="belgium", notes="Plus municipal surcharge (average ~7% of the tax).")
R += wht("BE", 30, 30, 30, slug="belgium")
R += p2(
    "BE",
    "Law of 19 December 2023 transposing Directive 2022/2523: IIR and QDMTT from 2024, UTPR from 2025.",
    frm="2024-01-01",
)

R += vat(
    "BG",
    20,
    [9],
    thr=51130,
    cur="EUR",
    as_of=AUDIT_DATE,
    notes="Threshold BGN 100,000 redenominated as EUR 51,130 on euro adoption (1 Jan 2026). The BGN 166,000 threshold legislated for 2025 applied only 1 Jan – 31 Mar 2025 before reverting to BGN 100,000.",
)
R[-1]["effective_from"] = d("2026-01-01")
R += [
    rate(
        "BG",
        "vat",
        "registration_threshold",
        None,
        thr=100000,
        cur="BGN",
        frm="2025-04-01",
        to="2025-12-31",
        as_of=AUDIT_DATE,
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Domestic registration threshold (Apr–Dec 2025)",
    ),
    rate(
        "BG",
        "vat",
        "registration_threshold",
        None,
        thr=166000,
        cur="BGN",
        frm="2025-01-01",
        to="2025-03-31",
        as_of=AUDIT_DATE,
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Domestic registration threshold (Jan–Mar 2025)",
    ),
]
R += cit("BG", 10, slug="bulgaria")
R += pit("BG", 10, slug="bulgaria", desc="Flat personal income tax rate")
R += wht("BG", 5, 10, 10, slug="bulgaria")
R += p2("BG", "Corporate Income Tax Act amendments (Dec 2023): IIR and QDMTT from 2024.", frm="2024-01-01")

R += vat(
    "HR", 25, [5, 13], thr=60000, cur="EUR", notes="Threshold raised from EUR 40,000 to EUR 60,000 from 1 Jan 2025."
)
R += cit("HR", 18, slug="croatia", notes="10% for taxpayers with revenue below EUR 1m.")
R += pit(
    "HR",
    36,
    slug="croatia",
    notes="Municipalities set the higher rate within a statutory band (top of band shown); Zagreb applies 33%.",
)
R += wht("HR", 10, 15, 15, slug="croatia")
R += p2("HR", "Minimum Global Corporate Income Tax Act: IIR and QDMTT from 2024.", frm="2024-01-01")

R += vat("CY", 19, [5, 9], super_reduced=3, thr=15600, cur="EUR", as_of=AUDIT_DATE)
R += cit(
    "CY",
    15,
    slug="cyprus",
    frm="2026-01-01",
    as_of=AUDIT_DATE,
    notes="Raised from 12.5% to 15% from 1 Jan 2026 (2025 tax reform; law passed 22 Dec 2025, gazetted 31 Dec 2025).",
)
R += [
    rate(
        "CY",
        "corporate_income",
        "headline",
        12.5,
        frm="2013-01-01",
        to="2025-12-31",
        as_of=AUDIT_DATE,
        src=PWC,
        url=pwc("cyprus", "corporate/taxes-on-corporate-income"),
        desc="Headline corporate income tax rate (2013–2025)",
    )
]
R += pit("CY", 35, slug="cyprus")
R += wht(
    "CY",
    0,
    0,
    0,
    slug="cyprus",
    roy_notes="10% applies only to royalties for rights used within Cyprus; 17%/30% defensive WHT to EU-blacklisted jurisdictions.",
)
R += p2(
    "CY",
    "Law transposing Directive 2022/2523 adopted December 2024 with retroactive effect from 2024 (IIR, QDMTT).",
    frm="2024-01-01",
)

R += vat(
    "CZ",
    21,
    [12],
    thr=2000000,
    cur="CZK",
    notes="Two reduced rates (15%, 10%) consolidated into a single 12% rate from 1 Jan 2024.",
)
R += [
    rate(
        "CZ",
        "vat",
        "reduced",
        15,
        frm="2015-01-01",
        to="2023-12-31",
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="First reduced rate (pre-2024)",
    ),
    rate(
        "CZ",
        "vat",
        "reduced",
        10,
        frm="2015-01-01",
        to="2023-12-31",
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Second reduced rate (pre-2024)",
    ),
]
R[-4]["effective_from"] = d("2024-01-01")  # the 12% consolidated reduced rate row
R += cit(
    "CZ", 21, slug="czech-republic", frm="2024-01-01", notes="Raised from 19% to 21% from 2024 (consolidation package)."
)
R += [
    rate(
        "CZ",
        "corporate_income",
        "headline",
        19,
        frm="2010-01-01",
        to="2023-12-31",
        src=PWC,
        url=pwc("czech-republic", "corporate/taxes-on-corporate-income"),
        desc="Headline corporate income tax rate (2010–2023)",
    )
]
R += pit("CZ", 23, slug="czech-republic", notes="15% base rate; 23% above 36x average wage.")
R += wht("CZ", 15, 15, 15, slug="czech-republic", notes="35% to non-treaty / non-information-exchange jurisdictions.")
R += p2("CZ", "Act No. 416/2023 on top-up taxes: IIR and QDMTT from 2024, UTPR from 2025.", frm="2024-01-01")

R += vat("DK", 25, thr=50000, cur="DKK", notes="Single standard rate; no reduced rates (zero-rating for newspapers).")
R += cit("DK", 22, slug="denmark")
R += pit(
    "DK",
    55.9,
    slug="denmark",
    desc="Top combined marginal rate including municipal tax (tax ceiling 52.07% excl. labour market contribution)",
)
R += wht(
    "DK",
    27,
    22,
    22,
    slug="denmark",
    div_notes="27% statutory; 22% for corporate recipients / reduced via treaty or EU directive.",
    int_notes="Interest WHT applies only to controlled debt to low-tax jurisdictions.",
)
R += p2("DK", "Minimum Taxation Act (Minimumsbeskatningsloven) Dec 2023: IIR and QDMTT from 2024.", frm="2024-01-01")

R += vat(
    "EE",
    24,
    [13, 9],
    thr=40000,
    cur="EUR",
    frm="2025-07-01",
    as_of="2025-07-01",
    notes="Standard rate 20% to 2023, 22% from 1 Jan 2024, 24% from 1 Jul 2025 (security tax package). Reduced 9% → 13% from 1 Jul 2025 for accommodation; 9% retained for press.",
)
R += [
    rate(
        "EE",
        "vat",
        "standard",
        22,
        frm="2024-01-01",
        to="2025-06-30",
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Standard VAT rate (2024 – Jun 2025)",
    ),
    rate(
        "EE",
        "vat",
        "standard",
        20,
        frm="2009-07-01",
        to="2023-12-31",
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Standard VAT rate (2009–2023)",
    ),
]
R += cit(
    "EE",
    22,
    slug="estonia",
    frm="2025-01-01",
    desc="Tax on distributed profits (22/78 of net distribution); undistributed profits untaxed",
    notes="Was 20/80 through 2024. Reduced 14% rate on regular distributions abolished from 2025.",
)
R += [
    rate(
        "EE",
        "corporate_income",
        "headline",
        20,
        frm="2015-01-01",
        to="2024-12-31",
        src=PWC,
        url=pwc("estonia", "corporate/taxes-on-corporate-income"),
        desc="Tax on distributed profits 20/80 (through 2024)",
    )
]
R += pit(
    "EE",
    22,
    slug="estonia",
    frm="2025-01-01",
    as_of=AUDIT_DATE,
    conf="verified",
    url="https://www.emta.ee/en/private-client/taxes-and-payment/declaration-income/tax-rates",
    src="Estonian Tax and Customs Board",
    desc="Flat personal income tax rate",
    notes="Raised from 20% to 22% in 2025. The 24% rate legislated for 2026 under the security tax package was repealed in Dec 2025; 22% applies in 2026.",
)
R += wht("EE", 0, 0, 10, slug="estonia")
R += p2(
    "EE",
    "Estonia elected the Article 50 deferral: no IIR/UTPR until 2030; only notification/filing obligations for in-scope groups.",
    adopted=False,
)

R += vat(
    "FI",
    25.5,
    [13.5, 10],
    thr=20000,
    cur="EUR",
    frm="2024-09-01",
    as_of=AUDIT_DATE,
    notes="Standard rate raised from 24% to 25.5% on 1 Sep 2024; many 10% items moved to 14% from 1 Jan 2025; the 14% reduced rate was cut to 13.5% from 1 Jan 2026. Threshold raised from EUR 15,000 to 20,000 in 2025.",
)
R[-3]["effective_from"] = d("2026-01-01")  # the 13.5% reduced-rate row
R[-3]["source_url"] = (
    "https://www.vero.fi/en/About-us/newsroom/changes-in-taxation/plans-to-lower-the-14-percent-vat-rate-to-13.5-in-2026/"
)
R[-3]["source_name"] = "Verohallinto"
R[-3]["confidence"] = "verified"
R += [
    rate(
        "FI",
        "vat",
        "reduced",
        14,
        frm="2013-01-01",
        to="2025-12-31",
        as_of=AUDIT_DATE,
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Reduced rate (2013–2025; cut to 13.5% from 2026)",
    ),
    rate(
        "FI",
        "vat",
        "standard",
        24,
        frm="2013-01-01",
        to="2024-08-31",
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Standard VAT rate (2013 – Aug 2024)",
    ),
]
R += cit("FI", 20, slug="finland")
R += pit(
    "FI",
    57.7,
    slug="finland",
    desc="Approximate top combined marginal rate (national 44% bracket above EUR 150k plus municipal and church tax)",
)
R += wht("FI", 20, 0, 20, slug="finland", div_notes="20% corporate / 30% individual recipients.")
R += p2("FI", "Act on Minimum Tax for Large Groups (1308/2023): IIR and QDMTT from 2024.", frm="2024-01-01")

R += vat(
    "FR",
    20,
    [5.5, 10],
    super_reduced=2.1,
    thr=85000,
    cur="EUR",
    as_of=AUDIT_DATE,
    notes="Threshold shown for goods (EUR 85,000); services EUR 37,500 (2026 table on service-public.gouv.fr). The single EUR 25,000 threshold enacted in the 2025 Finance Act was suspended and then abrogated by Loi n° 2025-1044 (3 Nov 2025); the PLF 2026 proposal for a single EUR 37,500 threshold was deleted by Parliament.",
)
R += cit(
    "FR",
    25,
    slug="france",
    as_of=AUDIT_DATE,
    notes="Plus 3.3% social contribution on CIT above EUR 763k. Exceptional contribution (20.6%/41.2% of CIT) applied to groups with revenue over EUR 1bn/3bn in FY2025 and was extended to FY2026 by the 2026 Finance Act (Loi n° 2026-103, 19 Feb 2026) with the lower threshold raised to EUR 1.5bn.",
)
R += pit(
    "FR",
    45,
    slug="france",
    as_of=AUDIT_DATE,
    notes="Plus 3%/4% exceptional contribution on high incomes (CEHR); 20% minimum effective tax on very high incomes (CDHR) introduced for 2025 and renewed for 2026 income.",
)
R += wht(
    "FR", 25, 0, 25, slug="france", div_notes="Aligned to the standard CIT rate (25%); 75% to non-cooperative states."
)
R += dst(
    "FR",
    3,
    "Taxe sur les services numériques: 3% of French digital interface and targeted-advertising revenue for groups above EUR 750m global / EUR 25m French digital revenue.",
    frm="2019-01-01",
    url="https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000038811588",
    src="Légifrance – Loi n° 2019-759",
    as_of=AUDIT_DATE,
    notes="Rate confirmed at 3% for 2026 (the Oct 2025 National Assembly amendment to 6% did not survive the final 2026 Finance Act). Former BOFiP deep link returns 404; Légifrance blocks automated fetches but resolves in a browser.",
)
R += p2(
    "FR",
    "Finance Act for 2024 (art. 33) transposes Directive 2022/2523: IIR and QDMTT from 2024, UTPR from 2025.",
    frm="2024-01-01",
)

R += vat(
    "DE",
    19,
    [7],
    thr=25000,
    cur="EUR",
    url="https://www.gesetze-im-internet.de/ustg_1980/__12.html",
    src="UStG §12 (gesetze-im-internet.de)",
    as_of=AUDIT_DATE,
    conf="verified",
    notes="Small-business threshold (§19 UStG) EUR 25,000 prior-year turnover plus EUR 100,000 current-year ceiling from 2025 (was EUR 22,000/50,000). Restaurant food permanently at 7% from 1 Jan 2026.",
)
R += [
    rate(
        "DE",
        "corporate_income",
        "federal",
        15.825,
        src=PWC,
        url=pwc("germany", "corporate/taxes-on-corporate-income"),
        desc="Federal corporate income tax 15% plus 5.5% solidarity surcharge",
        notes="Investment Booster law (July 2025) cuts the 15% rate by one point per year from 2028 to 10% in 2032.",
    ),
    rate(
        "DE",
        "corporate_income",
        "headline",
        29.9,
        src=PWC,
        url=pwc("germany", "corporate/taxes-on-corporate-income"),
        desc="Approximate combined rate incl. municipal trade tax (Gewerbesteuer) at ~14% average multiplier (400%)",
        notes="Trade tax ranges ~7%–17.15% by municipality.",
    ),
]
R += pit(
    "DE",
    45,
    slug="germany",
    as_of=AUDIT_DATE,
    notes="45% 'Reichensteuer' above EUR 277,826; 42% from EUR 68,430 (2025). Plus 5.5% solidarity surcharge (47.475% effective).",
)
R += wht(
    "DE",
    25,
    0,
    15,
    slug="germany",
    div_notes="25% plus 5.5% solidarity surcharge = 26.375%.",
    roy_notes="15% plus solidarity surcharge = 15.825%.",
)
R += p2("DE", "Mindeststeuergesetz (MinStG, 27 Dec 2023): IIR and QDMTT from 2024, UTPR from 2025.", frm="2024-01-01")

R += vat(
    "GR",
    24,
    [6, 13],
    super_reduced=4,
    thr=10000,
    cur="EUR",
    as_of=AUDIT_DATE,
    notes="Rates 30% lower on certain Aegean islands. 4% super-reduced rate applies to goods for persons with disabilities.",
)
R += cit("GR", 22, slug="greece")
R += pit("GR", 44, slug="greece")
R += wht("GR", 5, 15, 20, slug="greece")
R += p2("GR", "Law 5100/2024: IIR and QDMTT from 2024, UTPR from 2025.", frm="2024-01-01")

R += vat(
    "HU",
    27,
    [5, 18],
    thr=20000000,
    cur="HUF",
    as_of=AUDIT_DATE,
    notes="Highest standard rate in the EU. Threshold raised from HUF 12m to 18m (2025) and to HUF 20m from 1 Jan 2026 (22m in 2027, 24m in 2028).",
)
R[-1]["effective_from"] = d("2026-01-01")
R[-1]["source_url"] = EC_SME.format(slug="hungary")
R[-1]["source_name"] = "European Commission – SME scheme national rules (Hungary)"
R[-1]["confidence"] = "verified"
R += [
    rate(
        "HU",
        "vat",
        "registration_threshold",
        None,
        thr=18000000,
        cur="HUF",
        frm="2025-01-01",
        to="2025-12-31",
        as_of=AUDIT_DATE,
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Domestic registration threshold (2025)",
    )
]
R += cit(
    "HU",
    9,
    slug="hungary",
    notes="Lowest statutory CIT in the EU; local business tax (up to 2% of adjusted turnover) applies separately.",
)
R += pit("HU", 15, slug="hungary", desc="Flat personal income tax rate")
R += wht(
    "HU",
    0,
    0,
    0,
    slug="hungary",
    notes="No WHT on payments to foreign companies; 15% on dividends/interest to individuals.",
)
R += p2(
    "HU",
    "Act LXXXIV of 2023: IIR and QDMTT from 2024; QDMTT designed to let the 9% CIT + local taxes count toward the minimum.",
    frm="2024-01-01",
)

R += vat(
    "IE",
    23,
    [9, 13.5],
    super_reduced=4.8,
    zero=True,
    thr=85000,
    cur="EUR",
    url="https://www.revenue.ie/en/vat/vat-rates/search-vat-rates/current-vat-rates.aspx",
    src="Revenue Commissioners",
    as_of=AUDIT_DATE,
    conf="verified",
    notes="Goods threshold EUR 85,000; services EUR 42,500 (raised from 80,000/40,000 in 2025). Finance Act 2025: food/catering and hairdressing move from 13.5% to 9% from 1 Jul 2026; 9% on new apartments (Oct 2025–2030).",
)
R += cit(
    "IE",
    12.5,
    slug="ireland",
    as_of=AUDIT_DATE,
    notes="12.5% trading income; 25% passive/non-trading income; 15% Pillar Two top-up for groups above EUR 750m.",
)
R += pit(
    "IE",
    40,
    slug="ireland",
    as_of=AUDIT_DATE,
    url="https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/tax-relief-charts/index.aspx",
    src="Revenue Commissioners",
    conf="verified",
    notes="Plus USC (up to 8%) and PRSI (4.2% from 1 Oct 2025, 4.35% from 1 Oct 2026) – effective top marginal ~52%.",
)
R += wht("IE", 25, 20, 20, slug="ireland")
R += p2("IE", "Finance (No. 2) Act 2023 Part 4A: IIR and QDMTT from 2024, UTPR from 2025.", frm="2024-01-01")

R += vat("IT", 22, [5, 10], super_reduced=4, thr=85000, cur="EUR", as_of=AUDIT_DATE)
R += cit(
    "IT",
    27.9,
    slug="italy",
    as_of=AUDIT_DATE,
    desc="IRES 24% plus IRAP regional production tax 3.9% (standard)",
    notes="IRAP varies by region and sector. Budget Law 2026 (L. 199/2025) raises IRAP for banks/financial intermediaries to 6.65% and insurers to 7.90% for 2026–2028 and adds a 3.5-point IRES surcharge for banks and insurers.",
)
R += pit(
    "IT",
    43,
    slug="italy",
    as_of=AUDIT_DATE,
    notes="Plus regional (1.23%–3.33%) and municipal (up to 0.9%) surtaxes. Second bracket cut from 35% to 33% from 2026.",
)
R += wht("IT", 26, 26, 30, slug="italy", roy_notes="30% applied to 75% of gross royalty (22.5% effective).")
R += dst(
    "IT",
    3,
    "Imposta sui servizi digitali: 3% of Italian digital-service revenue for groups with EUR 750m global revenue; domestic EUR 5.5m threshold removed from 2025.",
    frm="2020-01-01",
    url="https://www.gazzettaufficiale.it/eli/id/2024/12/31/24G00229/sg",
    src="Gazzetta Ufficiale – Legge 207/2024 (Bilancio 2025)",
    as_of=AUDIT_DATE,
    notes="Agenzia delle Entrate topic page returned 404 in Aug 2026; Budget Law 2025 text used as source.",
)
R += p2("IT", "Legislative Decree 209/2023: IIR and QDMTT from 2024, UTPR from 2025.", frm="2024-01-01")

R += vat("LV", 21, [5, 12], thr=50000, cur="EUR")
R += cit("LV", 20, slug="latvia", desc="Tax on distributed profits (20/80 of net distribution; 25% effective on gross)")
R += pit(
    "LV",
    36,
    slug="latvia",
    frm="2025-01-01",
    notes="2025 reform: 25.5% to EUR 105,300, 33% above, plus 3% on income over EUR 200,000.",
)
R += wht("LV", 0, 0, 0, slug="latvia", notes="20% on payments to low-tax/blacklisted jurisdictions.")
R += p2("LV", "Latvia elected the Article 50 deferral (IIR/UTPR from 2030); filing obligations only.", adopted=False)

R += vat(
    "LT",
    21,
    [5, 12],
    thr=45000,
    cur="EUR",
    as_of=AUDIT_DATE,
    notes="From 1 Jan 2026 the 9% reduced rate was replaced by 12% (heating moved to 21%, books to 5%).",
)
R[-2]["effective_from"] = d("2026-01-01")  # the 12% reduced-rate row
R += [
    rate(
        "LT",
        "vat",
        "reduced",
        9,
        frm="2009-09-01",
        to="2025-12-31",
        as_of=AUDIT_DATE,
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Reduced rate (through 2025; replaced by 12% from 2026)",
    )
]
R += cit(
    "LT",
    17,
    slug="lithuania",
    frm="2026-01-01",
    as_of=AUDIT_DATE,
    notes="15% to 2024, 16% in 2025, 17% from 1 Jan 2026; small-company rate 6% → 7% from 2026.",
)
R += [
    rate(
        "LT",
        "corporate_income",
        "headline",
        16,
        frm="2025-01-01",
        to="2025-12-31",
        as_of=AUDIT_DATE,
        src=PWC,
        url=pwc("lithuania", "corporate/taxes-on-corporate-income"),
        desc="Headline corporate income tax rate (2025)",
    ),
    rate(
        "LT",
        "corporate_income",
        "headline",
        15,
        frm="2010-01-01",
        to="2024-12-31",
        src=PWC,
        url=pwc("lithuania", "corporate/taxes-on-corporate-income"),
        desc="Headline corporate income tax rate (2010–2024)",
    ),
]
R += pit(
    "LT",
    32,
    slug="lithuania",
    as_of=AUDIT_DATE,
    notes="Three brackets from 2026: 20% to 36 average monthly wages (~EUR 83k), 25% to 60 AMW (~EUR 138k), 32% above.",
)
R += wht("LT", 16, 10, 10, slug="lithuania", div_notes="Raised from 15% to 16% in 2025.")
R += p2(
    "LT",
    "Initially deferred under Article 50 for IIR/UTPR; law adopted Dec 2024 applies IIR/UTPR from 2025.",
    frm="2025-01-01",
)

R += vat(
    "LU",
    17,
    [8, 14],
    super_reduced=3,
    thr=50000,
    cur="EUR",
    frm="2024-01-01",
    notes="Temporary 1-point cut (16/13/7) applied only in calendar 2023.",
)
R += [
    rate(
        "LU",
        "vat",
        "standard",
        16,
        frm="2023-01-01",
        to="2023-12-31",
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Temporary standard VAT rate (2023)",
    )
]
R += cit(
    "LU",
    23.87,
    slug="luxembourg",
    frm="2025-01-01",
    desc="Combined Luxembourg City rate: CIT 16% + 7% solidarity surcharge + 6.75% municipal business tax",
    notes="CIT cut from 17% to 16% in 2025 (combined 24.94% → 23.87%).",
)
R += [
    rate(
        "LU",
        "corporate_income",
        "headline",
        24.94,
        frm="2019-01-01",
        to="2024-12-31",
        src=PWC,
        url=pwc("luxembourg", "corporate/taxes-on-corporate-income"),
        desc="Combined Luxembourg City rate (2019–2024)",
    )
]
R += pit("LU", 45.78, slug="luxembourg", desc="Top marginal rate 42% plus 9% solidarity surcharge")
R += wht("LU", 15, 0, 0, slug="luxembourg")
R += p2("LU", "Law of 22 December 2023: IIR and QDMTT from 2024, UTPR from 2025.", frm="2024-01-01")

R += vat(
    "MT",
    18,
    [5, 7, 12],
    zero=True,
    thr=35000,
    cur="EUR",
    as_of=AUDIT_DATE,
    notes="12% reduced rate (since 1 Jan 2024) applies to securities custody, credit guarantees, pleasure-boat hire and certain healthcare.",
)
R += cit(
    "MT",
    35,
    slug="malta",
    notes="Full imputation with shareholder refunds of 5/7 or 6/7 reduces effective rates to ~5%; optional 15% regime proposed.",
)
R += pit("MT", 35, slug="malta")
R += wht("MT", 0, 0, 0, slug="malta")
R += p2(
    "MT",
    "Malta elected the Article 50 deferral; only QDMTT-related reporting. Considering a domestic 15% top-up.",
    adopted=False,
)

R += vat(
    "NL",
    21,
    [9],
    thr=20000,
    cur="EUR",
    url="https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/tarieven_en_vrijstellingen/",
    src="Belastingdienst",
    as_of=AUDIT_DATE,
    conf="verified",
    notes="Planned 2026 increase of the 9% rate on culture/media/sport was reversed (Wet behoud verlaagd btw-tarief, Stb. 2025/339); the increase on lodging from 9% to 21% did take effect on 1 Jan 2026.",
)
R += cit(
    "NL",
    25.8,
    slug="netherlands",
    as_of=AUDIT_DATE,
    conf="verified",
    url="https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/vennootschapsbelasting/tarieven_vennootschapsbelasting",
    src="Belastingdienst",
    notes="19% on the first EUR 200,000 (unchanged for 2026).",
)
R += pit(
    "NL",
    49.5,
    slug="netherlands",
    as_of=AUDIT_DATE,
    conf="verified",
    url="https://www.belastingdienst.nl/wps/wcm/connect/nl/voorlopige-aanslag/content/voorlopige-aanslag-tarieven-en-heffingskortingen",
    src="Belastingdienst",
    notes="2026 box 1 brackets 35.75% / 37.56% / 49.50%.",
)
R += wht(
    "NL",
    15,
    0,
    0,
    slug="netherlands",
    int_notes="Conditional WHT of 25.8% on interest/royalties (and dividends from 2024) to low-tax/blacklisted jurisdictions and abusive structures.",
)
R += p2("NL", "Wet minimumbelasting 2024: IIR and QDMTT from 2024, UTPR from 2025.", frm="2024-01-01")

R += vat(
    "PL",
    23,
    [5, 8],
    thr=240000,
    cur="PLN",
    url="https://www.biznes.gov.pl/pl/portal/00246",
    src="biznes.gov.pl (Ministry of Finance)",
    as_of=AUDIT_DATE,
    conf="verified",
    notes="Registration (subjective exemption) threshold raised from PLN 200,000 to PLN 240,000 from 1 Jan 2026.",
)
R[-1]["effective_from"] = d("2026-01-01")
R[-1]["source_url"] = (
    "https://www.podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/zwolnienie-podmiotowe-od-podatku-vat"
)
R += [
    rate(
        "PL",
        "vat",
        "registration_threshold",
        None,
        thr=200000,
        cur="PLN",
        frm="2017-01-01",
        to="2025-12-31",
        as_of=AUDIT_DATE,
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Domestic registration threshold (2017–2025)",
    )
]
R += cit(
    "PL",
    19,
    slug="poland",
    notes="9% for small taxpayers; 10% minimum income tax for loss-making/low-margin companies from 2024.",
)
R += pit("PL", 32, slug="poland", notes="Plus 4% solidarity levy on income over PLN 1m (36% effective).")
R += wht("PL", 19, 20, 20, slug="poland")
R += p2(
    "PL",
    "Act of 6 November 2024 on top-up taxation: IIR, QDMTT and UTPR from 1 Jan 2025 (optional retroactive application to 2024).",
    frm="2025-01-01",
)

R += vat("PT", 23, [6, 13], thr=15000, cur="EUR", notes="Mainland rates; Madeira 22/12/5 and Azores 16/9/4.")
R += cit(
    "PT",
    20,
    slug="portugal",
    frm="2025-01-01",
    notes="Cut from 21% to 20% in 2025; plus municipal surtax up to 1.5% and state surtax up to 9% (profits over EUR 35m).",
)
R += [
    rate(
        "PT",
        "corporate_income",
        "headline",
        21,
        frm="2015-01-01",
        to="2024-12-31",
        src=PWC,
        url=pwc("portugal", "corporate/taxes-on-corporate-income"),
        desc="Headline corporate income tax rate (2015–2024)",
    )
]
R += pit("PT", 48, slug="portugal", notes="Plus solidarity surtax of 2.5%/5% above EUR 80k/250k.")
R += wht("PT", 25, 25, 25, slug="portugal", notes="35% to blacklisted jurisdictions.")
R += p2(
    "PT",
    "Law 41/2024 (Nov 2024) transposes Directive 2022/2523 with effect from 2024 (IIR, QDMTT); UTPR from 2025.",
    frm="2024-01-01",
)

R += vat(
    "RO",
    21,
    [11],
    thr=395000,
    cur="RON",
    frm="2025-08-01",
    as_of=AUDIT_DATE,
    notes="Fiscal package (Law 141/2025): standard 19% → 21% and reduced 5%/9% consolidated into 11% from 1 Aug 2025. Registration threshold raised from RON 300,000 to RON 395,000 from 1 Sep 2025 (GEO 22/2025).",
)
R[-1]["effective_from"] = d("2025-09-01")
R += [
    rate(
        "RO",
        "vat",
        "registration_threshold",
        None,
        thr=300000,
        cur="RON",
        frm="2018-01-01",
        to="2025-08-31",
        as_of=AUDIT_DATE,
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Domestic registration threshold (2018 – Aug 2025)",
    ),
    rate(
        "RO",
        "vat",
        "standard",
        19,
        frm="2017-01-01",
        to="2025-07-31",
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Standard VAT rate (2017 – Jul 2025)",
    ),
    rate(
        "RO",
        "vat",
        "reduced",
        9,
        frm="2017-01-01",
        to="2025-07-31",
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Reduced rate (pre-Aug 2025)",
    ),
    rate(
        "RO",
        "vat",
        "reduced",
        5,
        frm="2017-01-01",
        to="2025-07-31",
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Second reduced rate (pre-Aug 2025)",
    ),
]
R += cit(
    "RO",
    16,
    slug="romania",
    notes="1%/3% turnover tax for micro-companies; minimum turnover tax for large companies 2024–2025.",
)
R += pit("RO", 10, slug="romania", desc="Flat personal income tax rate")
R += wht(
    "RO",
    16,
    16,
    16,
    slug="romania",
    as_of=AUDIT_DATE,
    div_notes="Dividend tax 8% → 10% for distributions from 1 Jan 2025 (GEO 156/2024) and 10% → 16% from 1 Jan 2026 (Law 141/2025).",
)
R[-3]["effective_from"] = d("2026-01-01")  # dividends row
R += [
    rate(
        "RO",
        "withholding",
        "dividends",
        10,
        frm="2025-01-01",
        to="2025-12-31",
        as_of=AUDIT_DATE,
        src=PWC,
        url=pwc("romania", "corporate/withholding-taxes"),
        desc="Dividend withholding (2025)",
    ),
    rate(
        "RO",
        "withholding",
        "dividends",
        8,
        frm="2023-01-01",
        to="2024-12-31",
        src=PWC,
        url=pwc("romania", "corporate/withholding-taxes"),
        desc="Dividend withholding (2023–2024)",
    ),
]
R += p2("RO", "Law 431/2023: IIR and QDMTT from 2024, UTPR from 2025.", frm="2024-01-01")

R += vat(
    "SK",
    23,
    [19, 5],
    thr=50000,
    cur="EUR",
    frm="2025-01-01",
    notes="Consolidation package: standard 20% → 23%; former 10% reduced rate replaced by 19% and a new 5% rate (basic foods, medicines, books, accommodation) from 1 Jan 2025.",
)
R += [
    rate(
        "SK",
        "vat",
        "standard",
        20,
        frm="2011-01-01",
        to="2024-12-31",
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Standard VAT rate (2011–2024)",
    ),
    rate(
        "SK",
        "vat",
        "reduced",
        10,
        frm="2011-01-01",
        to="2024-12-31",
        url=EU_VAT_URL,
        src=EU_VAT_SRC,
        desc="Reduced rate (through 2024)",
    ),
]
R += cit(
    "SK", 21, slug="slovak-republic", notes="From 2025: 10% for taxable income up to EUR 100,000; 24% above EUR 5m."
)
R += pit(
    "SK",
    35,
    slug="slovak-republic",
    frm="2026-01-01",
    as_of=AUDIT_DATE,
    notes="Consolidation package II added 30% and 35% brackets from 1 Jan 2026 (previously 19%/25%).",
)
R += [
    rate(
        "SK",
        "personal_income",
        "top_marginal",
        25,
        frm="2013-01-01",
        to="2025-12-31",
        as_of=AUDIT_DATE,
        src=PWC,
        url=pwc("slovak-republic", "individual/taxes-on-personal-income"),
        desc="Top marginal personal income tax rate (2013–2025)",
    )
]
R += wht(
    "SK",
    7,
    19,
    19,
    slug="slovak-republic",
    div_notes="7% to individuals in treaty countries; 35% to non-treaty jurisdictions; no WHT on dividends to companies.",
)
R += p2("SK", "Act 507/2023 on top-up tax: QDMTT from 2024; IIR/UTPR deferred under Article 50.", frm="2024-01-01")

R += vat("SI", 22, [5, 9.5], thr=60000, cur="EUR", notes="Threshold raised from EUR 50,000 to 60,000 from 2025.")
R += cit(
    "SI",
    22,
    slug="slovenia",
    frm="2024-01-01",
    notes="Temporarily raised from 19% to 22% for 2024–2028 to fund flood reconstruction.",
)
R += [
    rate(
        "SI",
        "corporate_income",
        "headline",
        19,
        frm="2017-01-01",
        to="2023-12-31",
        src=PWC,
        url=pwc("slovenia", "corporate/taxes-on-corporate-income"),
        desc="Headline corporate income tax rate (2017–2023)",
    )
]
R += pit("SI", 50, slug="slovenia")
R += wht("SI", 15, 15, 15, slug="slovenia")
R += p2("SI", "Minimum Tax Act (ZMD) Dec 2023: IIR and QDMTT from 2024, UTPR from 2025.", frm="2024-01-01")

R += vat(
    "ES",
    21,
    [10],
    super_reduced=4,
    notes="No domestic registration threshold (all businesses register). Canary Islands apply IGIC (7%) instead of VAT.",
)
R += cit(
    "ES",
    25,
    slug="spain",
    as_of=AUDIT_DATE,
    notes="Reduced rates phase down from 2025: SMEs (turnover < EUR 10m) 24% (2025) → 23% (2026) → 20% (2027+); micro-enterprises (< EUR 1m) 21%/22% (2025) → 19%/21% (2026) → 17%/20% (2027+). Banks and energy companies face temporary levies.",
)
R += pit(
    "ES", 47, slug="spain", desc="Top combined state + regional marginal rate (varies 45%–54% by autonomous community)"
)
R += wht("ES", 19, 19, 24, slug="spain", roy_notes="19% to EU/EEA residents.")
R += dst(
    "ES",
    3,
    "Impuesto sobre Determinados Servicios Digitales: 3% on online advertising, intermediation and data transmission for groups above EUR 750m global / EUR 3m Spanish revenue.",
    frm="2021-01-16",
    url="https://sede.agenciatributaria.gob.es/Sede/impuestos-tasas/impuesto-sobre-determinados-servicios-digitales.html",
    src="Agencia Tributaria",
)
R += p2(
    "ES",
    "Law 7/2024 (20 Dec 2024) transposes Directive 2022/2523 with effect for fiscal years from 31 Dec 2023 (IIR, QDMTT); UTPR from 2025.",
    frm="2024-01-01",
)

R += vat(
    "SE",
    25,
    [6, 12],
    thr=120000,
    cur="SEK",
    url="https://www.skatteverket.se/foretag/moms/saljavarorochtjanster/momssatspavarorochtjanster.4.58d555751259e4d66168000409.html",
    src="Skatteverket",
    as_of=AUDIT_DATE,
    conf="verified",
    notes="Threshold raised from SEK 80,000 to 120,000 from 2025. Food moves temporarily from 12% to 6% for 1 Apr 2026 – 31 Dec 2027 (restaurant meals stay at 12%).",
)
R += cit(
    "SE",
    20.6,
    slug="sweden",
    as_of=AUDIT_DATE,
    conf="verified",
    url="https://www.skatteverket.se/privat/skatter/beloppochprocent/2026.html",
    src="Skatteverket",
)
R += pit(
    "SE",
    52,
    slug="sweden",
    desc="Approximate top combined marginal rate: 20% state tax plus ~32% average municipal tax",
)
R += wht(
    "SE",
    30,
    0,
    0,
    slug="sweden",
    roy_notes="Royalties taxed as business income (20.6%) via assessment rather than WHT.",
)
R += p2("SE", "Lag (2023:875) om tilläggsskatt: IIR and QDMTT from 2024, UTPR from 2025.", frm="2024-01-01")

# ----------------------------------------------------------------------------------------------------------------
# Other Europe
# ----------------------------------------------------------------------------------------------------------------
HMRC_VAT = "https://www.gov.uk/guidance/rates-of-vat-on-different-goods-and-services"
R += vat(
    "GB",
    20,
    [5],
    zero=True,
    thr=90000,
    cur="GBP",
    url="https://www.gov.uk/vat-rates",
    src="HMRC",
    as_of=AUDIT_DATE,
    conf="verified",
    notes="Threshold raised from GBP 85,000 to 90,000 on 1 Apr 2024 (unchanged at Autumn Budget 2025). Detailed rate list: "
    + HMRC_VAT,
)
R += cit(
    "GB",
    25,
    slug="united-kingdom",
    frm="2023-04-01",
    as_of=AUDIT_DATE,
    conf="verified",
    url="https://www.gov.uk/government/publications/rates-and-allowances-corporation-tax/rates-and-allowances-corporation-tax",
    src="HMRC",
    notes="Small profits rate 19% below GBP 50k with marginal relief to GBP 250k; 25% confirmed for FY2026 at Autumn Budget 2025.",
)
R += [
    rate(
        "GB",
        "corporate_income",
        "headline",
        19,
        frm="2017-04-01",
        to="2023-03-31",
        src=PWC,
        url=pwc("united-kingdom", "corporate/taxes-on-corporate-income"),
        desc="Main corporation tax rate (Apr 2017 – Mar 2023)",
    )
]
R += pit(
    "GB",
    45,
    slug="united-kingdom",
    as_of=AUDIT_DATE,
    conf="verified",
    url="https://www.gov.uk/income-tax-rates",
    src="HMRC",
    notes="Additional rate above GBP 125,140 (England/Wales/NI); Scotland top rate 48%. Autumn Budget 2025 froze thresholds to April 2031 and raised dividend ordinary/upper rates by 2 points from 6 Apr 2026 (10.75%/35.75%); savings and property income rates rise 2 points from April 2027.",
)
R += wht("GB", 0, 20, 20, slug="united-kingdom")
R += [
    rate(
        "GB",
        "capital_gains",
        "top_marginal",
        24,
        frm="2024-10-30",
        as_of=AUDIT_DATE,
        conf="verified",
        src="HMRC",
        url="https://www.gov.uk/capital-gains-tax/rates",
        desc="Higher rate of CGT on most assets (aligned with residential property rate at Autumn Budget 2024)",
        notes="Unchanged for 2026/27; BADR rate 18% and carried interest moved into income tax from 6 Apr 2026.",
    ),
    rate(
        "GB",
        "capital_gains",
        "top_marginal",
        20,
        frm="2016-04-06",
        to="2024-10-29",
        src="HMRC",
        url="https://www.gov.uk/capital-gains-tax/rates",
        desc="Higher rate of CGT on non-residential assets (2016 – Oct 2024)",
    ),
]
R += dst(
    "GB",
    2,
    "Digital Services Tax: 2% of UK revenues from search engines, social media and online marketplaces for groups above GBP 500m global / GBP 25m UK revenue.",
    frm="2020-04-01",
    url="https://www.gov.uk/government/publications/introduction-of-the-digital-services-tax",
    src="HMRC",
    as_of=AUDIT_DATE,
    notes="Retained after the 2025 US–UK Economic Prosperity Deal; HM Treasury's DST review (Nov 2025) kept it as an interim measure pending Pillar One.",
)
R += p2(
    "GB",
    "Finance (No. 2) Act 2023: Multinational Top-up Tax (IIR) and Domestic Top-up Tax for periods from 31 Dec 2023; UTPR from 31 Dec 2024 (Finance Act 2025).",
    frm="2024-01-01",
    url="https://www.gov.uk/government/collections/domestic-top-up-tax-and-multinational-top-up-tax-detailed-information",
    src="HMRC",
    as_of=AUDIT_DATE,
)

ESTV = "https://www.estv.admin.ch/estv/en/home/value-added-tax/vat-rates-switzerland.html"
R += vat(
    "CH",
    8.1,
    [2.6],
    thr=100000,
    cur="CHF",
    frm="2024-01-01",
    url=ESTV,
    src="Swiss Federal Tax Administration",
    as_of=AUDIT_DATE,
    conf="verified",
    notes="Raised from 7.7%/2.5%/3.7% to 8.1%/2.6%/3.8% on 1 Jan 2024 to fund AHV pensions. Special 3.8% rate for accommodation. A further rise to 8.5% from 2028 passed the National Council in Jun 2026 but requires a referendum (not enacted).",
)
R += [
    rate(
        "CH",
        "vat",
        "standard",
        7.7,
        frm="2018-01-01",
        to="2023-12-31",
        url=ESTV,
        src="Swiss Federal Tax Administration",
        desc="Standard VAT rate (2018–2023)",
    ),
    rate(
        "CH",
        "vat",
        "other",
        3.8,
        frm="2024-01-01",
        url=ESTV,
        src="Swiss Federal Tax Administration",
        desc="Special rate for accommodation services",
    ),
]
R += [
    rate(
        "CH",
        "corporate_income",
        "federal",
        8.5,
        src=PWC,
        url=pwc("switzerland", "corporate/taxes-on-corporate-income"),
        desc="Federal direct tax on profit (7.83% effective because tax is deductible)",
    ),
    rate(
        "CH",
        "corporate_income",
        "headline",
        14.4,
        as_of=AUDIT_DATE,
        conf="estimated",
        src="KPMG Clarity on Swiss Taxes 2026",
        url="https://kpmg.com/ch/en/media/press-releases/2026/05/clarity-swiss-taxes.html",
        desc="Approximate average combined federal/cantonal/communal effective rate (2026: 14.43%)",
        notes="Range ~11.7% (Lucerne) to ~20.5% (Bern) depending on canton. No authority publishes a national average; KPMG survey used.",
    ),
]
R += pit(
    "CH",
    11.5,
    slug="switzerland",
    desc="Top federal marginal rate; combined with cantonal/communal tax the top rate ranges ~22% to ~45% (Geneva)",
)
R += wht(
    "CH",
    35,
    35,
    0,
    slug="switzerland",
    int_notes="35% applies to bank interest and bonds only, not ordinary intercompany loans.",
)
R += p2(
    "CH", "Minimum Tax Ordinance: QDMTT from 1 Jan 2024; IIR from 1 Jan 2025; UTPR not yet applied.", frm="2024-01-01"
)

R += vat(
    "NO",
    25,
    [12, 15],
    thr=50000,
    cur="NOK",
    url="https://www.skatteetaten.no/en/rates/value-added-tax/",
    src="Skatteetaten",
    as_of=AUDIT_DATE,
    conf="verified",
)
R += cit(
    "NO",
    22,
    slug="norway",
    as_of=AUDIT_DATE,
    conf="verified",
    url="https://www.skatteetaten.no/satser/alminnelig-inntekt/",
    src="Skatteetaten",
    notes="25% financial sector; 78% marginal for petroleum; 22% + resource rent tax for hydropower/aquaculture.",
)
R += pit(
    "NO",
    47.4,
    slug="norway",
    as_of=AUDIT_DATE,
    conf="verified",
    url="https://www.skatteetaten.no/satser/trinnskatt/?year=2026",
    src="Skatteetaten",
    desc="Top combined marginal rate on wages: 22% general income tax + top bracket tax (17.8% in 2026; 17.7% in 2025) + 7.6% social security contribution (7.7% in 2025)",
    notes="Excluding the social security contribution the top marginal rate is 39.8% (2026).",
)
R += wht(
    "NO",
    25,
    15,
    15,
    slug="norway",
    int_notes="15% WHT on interest/royalties applies only to related-party payments to low-tax jurisdictions (since 2021).",
)
R += p2(
    "NO", "Supplementary Tax Act (suppleringsskatteloven): IIR and QDMTT from 2024; UTPR from 2025.", frm="2024-01-01"
)

R += vat(
    "IS",
    24,
    [11],
    thr=2000000,
    cur="ISK",
    url="https://www.skatturinn.is/english/companies/value-added-tax/",
    src="Skatturinn",
)
R += cit("IS", 20, slug="iceland", notes="Temporarily 21% for income year 2024 only.")
R += pit(
    "IS",
    46.29,
    slug="iceland",
    frm="2026-01-01",
    as_of=AUDIT_DATE,
    desc="Top combined national (31.35%) + maximum municipal (14.94%) rate (2026)",
    notes="Applies above ISK 16,781,400 per year; municipal rates range 12.44%–14.94%.",
)
R += [
    rate(
        "IS",
        "personal_income",
        "top_marginal",
        46.28,
        frm="2025-01-01",
        to="2025-12-31",
        as_of=AUDIT_DATE,
        src=PWC,
        url=pwc("iceland", "individual/taxes-on-personal-income"),
        desc="Top combined national + municipal rate (2025)",
    )
]
R += wht("IS", 22, 12, 22, slug="iceland", div_notes="22% individuals / 20% companies.")

# ----------------------------------------------------------------------------------------------------------------
# Americas
# ----------------------------------------------------------------------------------------------------------------
IRS = "https://www.irs.gov/"
R += [
    rate(
        "US",
        "sales_use",
        "standard",
        None,
        src="TaxAtlas editorial",
        url="https://www.taxadmin.org/",
        desc="No federal sales tax; see states",
        notes="Sales and use taxes are levied by 45 states, DC and local governments.",
    ),
    rate(
        "US",
        "corporate_income",
        "federal",
        21,
        frm="2018-01-01",
        as_of=AUDIT_DATE,
        src="IRS",
        url="https://www.irs.gov/pub/irs-pdf/p542.pdf",
        desc="Federal corporate income tax (flat, TCJA; unchanged by P.L. 119-21)",
        conf="verified",
    ),
    rate(
        "US",
        "corporate_income",
        "headline",
        25.6,
        as_of=AUDIT_DATE,
        conf="estimated",
        src=OECD_SRC,
        url=OECD_URL,
        desc="Combined federal + average state statutory corporate rate (OECD; 25.57%)",
        notes="OECD Tax Database pages block automated fetches; figure cross-checked against Tax Foundation's OECD-derived 2025 table.",
    ),
    rate(
        "US",
        "corporate_income",
        "headline",
        35,
        frm="1993-01-01",
        to="2017-12-31",
        src="IRS",
        url="https://www.irs.gov/pub/irs-pdf/p542.pdf",
        desc="Federal corporate income tax top rate (pre-TCJA)",
    ),
    rate(
        "US",
        "personal_income",
        "top_marginal",
        37,
        frm="2018-01-01",
        as_of=AUDIT_DATE,
        src="IRS",
        url="https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill",
        desc="Top federal marginal rate (made permanent by P.L. 119-21)",
        notes="TY2026 threshold: taxable income above USD 640,600 (single) / 768,700 (MFJ).",
        conf="verified",
    ),
    rate(
        "US",
        "capital_gains",
        "top_marginal",
        20,
        src="IRS",
        url="https://www.irs.gov/taxtopics/tc409",
        desc="Top long-term capital gains rate (plus 3.8% net investment income tax)",
    ),
    rate(
        "US",
        "withholding",
        "dividends",
        30,
        src="IRS",
        url="https://www.irs.gov/individuals/international-taxpayers/nra-withholding",
        desc="Statutory FDAP withholding on US-source dividends to non-residents",
    ),
    rate(
        "US",
        "withholding",
        "interest",
        30,
        src="IRS",
        url="https://www.irs.gov/individuals/international-taxpayers/nra-withholding",
        desc="Statutory FDAP withholding on interest",
        notes="Portfolio interest exemption eliminates WHT on most registered-form debt.",
    ),
    rate(
        "US",
        "withholding",
        "royalties",
        30,
        src="IRS",
        url="https://www.irs.gov/individuals/international-taxpayers/nra-withholding",
        desc="Statutory FDAP withholding on royalties",
    ),
    rate(
        "US",
        "pillar_two",
        "minimum",
        None,
        src=OECD_SRC,
        url="https://www.oecd.org/content/dam/oecd/en/topics/policy-sub-issues/global-minimum-tax/side-by-side-package.pdf",
        desc="Not adopted. US applies GILTI/NCTI (12.6–14% effective from 2026) and 15% CAMT. The G7 'side-by-side' understanding (June 2025) was implemented by the OECD Inclusive Framework's Side-by-Side Package (approved 5 Jan 2026): IIR/UTPR set to zero for US-parented groups for fiscal years beginning on or after 1 Jan 2026.",
        as_of=AUDIT_DATE,
    ),
]

CRA = "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html"
R += vat(
    "CA",
    5,
    thr=30000,
    cur="CAD",
    tax_type="gst",
    url=CRA,
    src="Canada Revenue Agency",
    desc="Federal GST rate (provinces add HST/PST/QST; see provinces)",
)
R += [
    rate(
        "CA",
        "corporate_income",
        "federal",
        15,
        src=PWC,
        url=pwc("canada", "corporate/taxes-on-corporate-income"),
        desc="Federal general corporate rate after abatement and general rate reduction",
    ),
    rate(
        "CA",
        "corporate_income",
        "headline",
        26.5,
        as_of=AUDIT_DATE,
        src=PWC,
        url=pwc("canada", "corporate/taxes-on-corporate-income"),
        desc="Combined federal + provincial general rate (Ontario; range 23%–30% by province)",
    ),
]
R += pit(
    "CA",
    33,
    slug="canada",
    as_of=AUDIT_DATE,
    desc="Top federal marginal rate (combined with provincial tax 44.5%–54.8%)",
    notes="Lowest federal rate cut from 15% to 14% effective 1 Jul 2025 (14.5% blended for 2025); top rate unchanged, threshold CAD 258,482 for 2026.",
)
R += wht("CA", 25, 25, 25, slug="canada", int_notes="Exempt for arm's-length interest (non-participating).")
R += dst(
    "CA",
    3,
    "Digital Services Tax Act: 3% on Canadian digital services revenue over CAD 20m, retroactive to 2022; rescinded by the government on 29 June 2025 ahead of trade talks with the US.",
    frm="2024-06-28",
    to="2025-06-29",
    as_of=AUDIT_DATE,
    url="https://laws-lois.justice.gc.ca/eng/acts/D-1.65/index.html",
    src="Justice Laws Canada – Digital Services Tax Act (repealed)",
    notes="Collection halted 30 Jun 2025. The Act was formally repealed by the Budget 2025 Implementation Act, No. 1 (Bill C-15, S.C. 2026 c. 3, Royal Assent 26 Mar 2026) with the repeal deemed in force 20 Jun 2024, so the tax never legally applied; amounts paid are refunded with interest.",
)
R += p2(
    "CA",
    "Global Minimum Tax Act (Bill C-69, June 2024): IIR and QDMTT for fiscal years from 31 Dec 2023; UTPR from 31 Dec 2024.",
    frm="2024-01-01",
)

SAT = "https://www.sat.gob.mx/"
R += vat(
    "MX",
    16,
    [8],
    zero=True,
    url=SAT,
    src="SAT",
    as_of=AUDIT_DATE,
    notes="8% rate applies in the northern and southern border regions under a stimulus decree (50% credit), extended by DOF decree of 31 Dec 2025 through 31 Dec 2026. 2026 economic package (DOF 7 Nov 2025) made no IVA/ISR rate change.",
    desc="IVA standard rate",
)
R[-2]["notes"] = "Border-region stimulus (effective 8% via 50% credit) currently extended through 31 Dec 2026."
R += cit("MX", 30, slug="mexico", as_of=AUDIT_DATE)
R += pit("MX", 35, slug="mexico", as_of=AUDIT_DATE, notes="Applies above MXN 5,107,703.93 (2026).")
R += wht(
    "MX",
    10,
    35,
    25,
    slug="mexico",
    int_notes="4.9% for registered foreign banks; 35% top statutory; 40% to preferential regimes.",
    roy_notes="25% general; 35% for patents/trademarks; 40% to tax havens.",
)
R += p2("MX", "Not adopted; no domestic Pillar Two legislation as of 2025.", adopted=False)

RFB = "https://www.gov.br/receitafederal/"
R += [
    rate(
        "BR",
        "vat",
        "standard",
        18,
        src="TaxAtlas editorial (state ICMS statutes)",
        url=RFB,
        desc="Typical state ICMS internal rate (17%–20% by state); plus federal PIS 1.65% / COFINS 7.6% non-cumulative and IPI",
        notes="Replaced by dual VAT (federal CBS + subnational IBS) phased in 2026–2033 under EC 132/2023 and LC 214/2025; reference combined rate estimated ~26.5%–28%.",
    ),
    rate(
        "BR",
        "vat",
        "other",
        0.9,
        frm="2026-01-01",
        as_of=AUDIT_DATE,
        src="Receita Federal – Reforma do consumo",
        url="https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-consumo",
        desc="2026 test year: CBS 0.9% + IBS 0.1% (LC 214/2025 art. 348), creditable against PIS/COFINS",
        notes="Test year confirmed live from 1 Jan 2026 (invoice highlighting required); payment is waived for taxpayers that comply with the ancillary obligations. Rate figures rest on LC 214/2025 text (Planalto unreachable from the audit environment).",
    ),
]
R += cit(
    "BR",
    34,
    slug="brazil",
    as_of=AUDIT_DATE,
    desc="IRPJ 15% + 10% surtax above BRL 240k/yr + CSLL 9% (CSLL 15%–20% for financial institutions)",
)
R += pit(
    "BR",
    27.5,
    slug="brazil",
    as_of=AUDIT_DATE,
    notes="Law 15.270/2025 (from 2026): monthly income up to BRL 5,000 exempt (phase-out to 7,350) and a minimum tax (IRPFM) of up to 10% on annual income above BRL 600k; top bracket rate unchanged.",
)
R += wht(
    "BR",
    10,
    15,
    15,
    slug="brazil",
    as_of=AUDIT_DATE,
    div_notes="10% IRRF on dividends remitted abroad (any amount) and on domestic dividends above BRL 50,000/month from 1 Jan 2026 (Law 15.270/2025, 26 Nov 2025); dividends were exempt 1996–2025.",
    int_notes="25% to tax havens.",
    roy_notes="Plus 10% CIDE on royalties/technical services.",
    url="https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2025/dezembro/receita-federal-orienta-sobre-os-procedimentos-para-o-recolhimento-do-imposto-de-renda-retido-na-fonte-sobre-lucros-e-dividendos",
)
R[-3]["effective_from"] = d("2026-01-01")  # dividends row
R[-3]["source_name"] = "Receita Federal"
R[-3]["confidence"] = "verified"
R += [
    rate(
        "BR",
        "withholding",
        "dividends",
        0,
        frm="1996-01-01",
        to="2025-12-31",
        as_of=AUDIT_DATE,
        src=PWC,
        url=pwc("brazil", "corporate/withholding-taxes"),
        desc="Dividends exempt from withholding (Law 9.249/1995; 1996–2025)",
    )
]
R += p2(
    "BR",
    "Law 15.079/2024 (Provisional Measure 1262/2024): QDMTT via an additional CSLL from 1 Jan 2025; no IIR/UTPR.",
    frm="2025-01-01",
)

R += vat(
    "AR",
    21,
    [10.5],
    url="https://www.afip.gob.ar/iva/",
    src="ARCA/AFIP",
    desc="IVA standard rate",
    notes="27% higher rate for utilities supplied to registered taxpayers.",
)
R += cit("AR", 35, slug="argentina", desc="Top rate of progressive scale (25%/30%/35%)")
R += pit("AR", 35, slug="argentina")
R += wht(
    "AR",
    7,
    35,
    31.5,
    slug="argentina",
    int_notes="15.05% for loans from banks in cooperative jurisdictions.",
    roy_notes="Effective rate on presumed 90% net income; 21%/28% for registered technology transfer.",
)

R += vat("CL", 19, url="https://www.sii.cl/", src="SII", desc="IVA standard rate")
R += cit(
    "CL",
    27,
    slug="chile",
    as_of=AUDIT_DATE,
    desc="First Category Tax (general regime)",
    notes="Law 21,755 (Jul 2025) cuts the Pro-PYME First Category rate to 12.5% for 2025–2027 and 15% in 2028.",
)
R += pit(
    "CL",
    40,
    slug="chile",
    as_of=AUDIT_DATE,
    conf="verified",
    url="https://www.sii.cl/valores_y_fechas/impuesto_2da_categoria/impuesto2026.htm",
    src="SII – Impuesto Único de Segunda Categoría",
    notes="Factor 0.40 above 310 UTM/month (monthly table, Aug 2026).",
)
R += wht(
    "CL",
    35,
    35,
    30,
    slug="chile",
    div_notes="Additional Tax with full or 65% credit for First Category Tax.",
    int_notes="4% for loans from foreign banks/financial institutions.",
    roy_notes="15% for software, patents and industrial models.",
)

R += vat("CO", 19, [5], url="https://www.dian.gov.co/", src="DIAN", desc="IVA standard rate")
R += cit(
    "CO",
    35,
    slug="colombia",
    notes="Plus 5-point surtax for financial institutions (40%); 15% domestic minimum tax rate (TTD) since 2023.",
)
R += pit("CO", 39, slug="colombia")
R += wht("CO", 20, 20, 20, slug="colombia", int_notes="15% for loans over one year.")
R += dst(
    "CO",
    3,
    "Significant Economic Presence (PES) regime for non-resident digital suppliers: registered taxpayers pay 3% income tax on gross Colombian revenue; otherwise a 10% withholding applies on gross payments (Law 2277/2022).",
    frm="2024-01-01",
    url="https://normograma.dian.gov.co/dian/compilacion/docs/ley_2277_2022.htm",
    src="DIAN – Normograma (Ley 2277 de 2022)",
    as_of=AUDIT_DATE,
    notes="DIAN PES topic page returned 404 in Aug 2026; statute text used. A Jul 2026 reform bill (hybrid vehicles, oil/coal levy) was not enacted before the change of administration.",
)
R += p2(
    "CO",
    "Not a Pillar Two implementation; Law 2277/2022 imposes a domestic 15% minimum tax (TTD) on financial-statement profits.",
    adopted=False,
)

R += vat("PE", 18, url="https://www.sunat.gob.pe/", src="SUNAT", desc="IGV 16% + 2% municipal promotion tax (IPM)")
R += cit("PE", 29.5, slug="peru")
R += pit("PE", 30, slug="peru")
R += wht("PE", 5, 30, 30, slug="peru", int_notes="4.99% for qualifying foreign loans.")

# ----------------------------------------------------------------------------------------------------------------
# Asia-Pacific
# ----------------------------------------------------------------------------------------------------------------
STA = "https://www.chinatax.gov.cn/"
R += vat(
    "CN",
    13,
    [9, 6],
    url=STA,
    src="State Taxation Administration",
    as_of=AUDIT_DATE,
    notes="13% goods; 9% agriculture/utilities/transport/construction/real estate; 6% services. The VAT Law (passed 25 Dec 2024) and its Implementing Regulations (State Council Decree No. 826) took effect 1 Jan 2026 with the same rates. Small-scale taxpayers: 3% levy rate (1% through 31 Dec 2027).",
)
R += [
    rate(
        "CN",
        "vat",
        "registration_threshold",
        None,
        thr=5000000,
        cur="CNY",
        url=STA,
        src="State Taxation Administration",
        desc="General VAT taxpayer threshold (annual taxable sales); below this, small-scale taxpayer status",
        notes="Small-scale taxpayers exempt if monthly sales ≤ CNY 100,000 (through 2027).",
    )
]
R += cit(
    "CN",
    25,
    slug="peoples-republic-of-china",
    as_of=AUDIT_DATE,
    notes="15% for High and New Technology Enterprises; small low-profit enterprises pay an effective 5% on taxable income up to CNY 3m through 31 Dec 2027.",
)
R += pit("CN", 45, slug="peoples-republic-of-china", as_of=AUDIT_DATE)
R += wht(
    "CN",
    10,
    10,
    10,
    slug="peoples-republic-of-china",
    roy_notes="Plus 6% VAT (and surcharges) on royalties and service fees.",
)
R += p2("CN", "Not adopted; no domestic Pillar Two legislation announced as of 2025.", adopted=False)

NTA = "https://www.nta.go.jp/english/taxes/consumption_tax/01.htm"
R += vat(
    "JP",
    10,
    [8],
    thr=10000000,
    cur="JPY",
    url=NTA,
    src="National Tax Agency",
    as_of=AUDIT_DATE,
    conf="verified",
    desc="Consumption tax standard rate (7.8% national + 2.2% local)",
    notes="8% reduced rate (6.24% national + 1.76% local) for food and newspaper subscriptions. Qualified Invoice System from 1 Oct 2023.",
)
R += [
    rate(
        "JP",
        "corporate_income",
        "federal",
        23.2,
        as_of=AUDIT_DATE,
        src=PWC,
        url=pwc("japan", "corporate/taxes-on-corporate-income"),
        desc="National corporation tax rate",
        notes="Defense Special Corporation Tax of 4% of corporation tax liability (after a JPY 5m deduction) applies to fiscal years beginning on or after 1 Apr 2026.",
    ),
    rate(
        "JP",
        "corporate_income",
        "headline",
        31.52,
        frm="2026-04-01",
        as_of=AUDIT_DATE,
        src=PWC,
        url=pwc("japan", "corporate/taxes-on-corporate-income"),
        desc="Effective combined rate for large companies in Tokyo incl. defence surtax, local corporate, enterprise and inhabitant taxes (fiscal years from 1 Apr 2026)",
        notes="Was 30.62% before the defence surtax; ~29.74% → higher for companies with capital ≤ JPY 100m (verify).",
    ),
    rate(
        "JP",
        "corporate_income",
        "headline",
        30.62,
        frm="2018-04-01",
        to="2026-03-31",
        as_of=AUDIT_DATE,
        src=PWC,
        url=pwc("japan", "corporate/taxes-on-corporate-income"),
        desc="Effective combined rate for large companies in Tokyo (FY2018 – Mar 2026)",
    ),
]
R += pit(
    "JP",
    45,
    slug="japan",
    as_of=AUDIT_DATE,
    notes="Plus 10% local inhabitant tax and 2.1% reconstruction surtax (55.945% combined).",
)
R += wht(
    "JP",
    20.42,
    20.42,
    20.42,
    slug="japan",
    div_notes="15.315% for listed shares.",
    int_notes="15.315% on bonds/deposits; 20.42% on loans.",
    notes="Rates include the 2.1% reconstruction surtax.",
)
R += p2(
    "JP",
    "2023 tax reform: IIR for fiscal years from 1 Apr 2024; QDMTT and UTPR (2025 reform) in force for fiscal years from 1 Apr 2026.",
    frm="2024-04-01",
    as_of=AUDIT_DATE,
)

NTS = "https://www.nts.go.kr/english/main.do"
R += vat(
    "KR",
    10,
    url=NTS,
    src="National Tax Service",
    as_of=AUDIT_DATE,
    desc="VAT standard rate (single rate with zero-rating for exports)",
)
R += cit(
    "KR",
    25,
    slug="republic-of-korea",
    frm="2026-01-01",
    as_of=AUDIT_DATE,
    desc="Top national rate (brackets 10/20/22/25% from 2026); 27.5% including 10% local income surtax",
    notes="Each bracket raised by one point for fiscal years beginning on or after 1 Jan 2026 (National Assembly, 2 Dec 2025), reversing the 2023 cut.",
)
R += [
    rate(
        "KR",
        "corporate_income",
        "headline",
        24,
        frm="2023-01-01",
        to="2025-12-31",
        as_of=AUDIT_DATE,
        src=PWC,
        url=pwc("republic-of-korea", "corporate/taxes-on-corporate-income"),
        desc="Top national rate (brackets 9/19/21/24%; 2023–2025); 26.4% incl. local surtax",
    )
]
R += pit("KR", 45, slug="republic-of-korea", as_of=AUDIT_DATE, notes="49.5% including 10% local income tax.")
R += wht(
    "KR",
    20,
    20,
    20,
    slug="republic-of-korea",
    int_notes="14% on bonds issued by the state/domestic companies.",
    notes="Plus 10% local surtax (22% combined).",
)
R += p2(
    "KR",
    "Law for the Coordination of International Tax Affairs amended Dec 2022: IIR from 2024; UTPR deferred to 2025.",
    frm="2024-01-01",
)

CBIC = "https://cbic-gst.gov.in/gst-goods-services-rates.html"
R += vat(
    "IN",
    18,
    [5],
    thr=4000000,
    cur="INR",
    tax_type="gst",
    frm="2017-07-01",
    as_of=AUDIT_DATE,
    conf="verified",
    url="https://www.pib.gov.in/PressReleasePage.aspx?PRID=2163560",
    src="PIB – 56th GST Council decisions (3 Sep 2025)",
    desc="GST standard rate (CGST 9% + SGST 9%)",
    notes="From 22 Sep 2025 (56th GST Council; Notifications 09/2025–17/2025-Central Tax (Rate), 17 Sep 2025) the 12% and 28% slabs were withdrawn for almost all supplies, leaving 5%/18% plus a 40% demerit rate; tobacco products stayed at 28% + cess pending loan repayment. Threshold INR 4m goods / INR 2m services (lower in special-category states). CBIC rate-schedule page ("
    + CBIC
    + ") redirects to a 2023 snapshot.",
)
R += [
    rate(
        "IN",
        "gst",
        "reduced",
        12,
        frm="2017-07-01",
        to="2025-09-21",
        url=CBIC,
        src="CBIC GST rate schedule",
        desc="12% slab (abolished 22 Sep 2025)",
    ),
    rate(
        "IN",
        "gst",
        "other",
        28,
        frm="2017-07-01",
        to="2025-09-21",
        url=CBIC,
        src="CBIC GST rate schedule",
        desc="28% slab for luxury/sin goods (abolished 22 Sep 2025)",
    ),
    rate(
        "IN",
        "gst",
        "other",
        40,
        frm="2025-09-22",
        as_of="2025-09-22",
        url=CBIC,
        src="CBIC GST rate schedule",
        desc="40% demerit rate on sin and luxury goods (tobacco, pan masala, aerated drinks, large cars) replacing 28% + compensation cess",
    ),
]
R += cit(
    "IN",
    25.17,
    slug="india",
    as_of=AUDIT_DATE,
    desc="Effective rate for domestic companies opting for the 22% concessional regime (s.115BAA) incl. 10% surcharge and 4% cess",
    notes="Standard regime 30% (34.94% effective); new manufacturing companies 15% (17.16%); foreign companies 35% from FY2024-25 (reduced from 40%). Income-tax Act 2025 in force from 1 Apr 2026 without rate changes; Budget 2026 cut MAT from 15% to 14% (final tax).",
)
R += pit(
    "IN",
    30,
    slug="india",
    as_of=AUDIT_DATE,
    notes="Top slab 30%; with 25% surcharge and 4% cess the new-regime top effective rate is 39% (old regime 42.744%). Unchanged by Budget 2026-27.",
)
R += wht(
    "IN",
    20,
    20,
    20,
    slug="india",
    int_notes="5% on certain foreign-currency borrowings/infrastructure bonds.",
    roy_notes="Raised from 10% to 20% for royalties/FTS from 1 Apr 2023.",
    notes="Plus applicable surcharge and 4% health and education cess.",
)
R += dst(
    "IN",
    6,
    "Equalisation Levy (2016) on online advertising payments to non-residents; abolished with effect from 1 Apr 2025 (Finance Act 2025).",
    frm="2016-06-01",
    to="2025-03-31",
    as_of="2025-04-01",
    url="https://www.incometaxindia.gov.in/pages/acts/finance-act.aspx",
    src="Income Tax Department",
)
R += [
    rate(
        "IN",
        "digital_services",
        "other",
        2,
        frm="2020-04-01",
        to="2024-07-31",
        as_of="2024-08-01",
        url="https://www.incometaxindia.gov.in/pages/acts/finance-act.aspx",
        src="Income Tax Department",
        desc="2% Equalisation Levy on e-commerce supply/services by non-residents; abolished from 1 Aug 2024 (Finance (No. 2) Act 2024)",
    )
]
R += p2("IN", "Not adopted; India has not announced Pillar Two legislation as of 2025.", adopted=False)

DJP = "https://www.pajak.go.id/"
R += vat(
    "ID",
    12,
    thr=4800000000,
    cur="IDR",
    frm="2025-01-01",
    url=DJP,
    src="Directorate General of Taxes",
    desc="Statutory VAT (PPN) rate",
    notes="Legal rate 12% from 1 Jan 2025 (HPP Law) but PMK 131/2024 sets the tax base at 11/12 of price for non-luxury goods, so the effective burden stays 11% except for luxury goods.",
)
R += [
    rate(
        "ID",
        "vat",
        "standard",
        11,
        frm="2022-04-01",
        to="2024-12-31",
        url=DJP,
        src="Directorate General of Taxes",
        desc="VAT standard rate (Apr 2022 – 2024)",
    ),
    rate(
        "ID",
        "vat",
        "standard",
        10,
        frm="2000-01-01",
        to="2022-03-31",
        url=DJP,
        src="Directorate General of Taxes",
        desc="VAT standard rate (through Mar 2022)",
    ),
]
R += cit("ID", 22, slug="indonesia", notes="19% for listed companies with ≥40% public float meeting conditions.")
R += pit("ID", 35, slug="indonesia")
R += wht("ID", 20, 20, 20, slug="indonesia")
R += p2(
    "ID",
    "PMK 136/2024 (Dec 2024): IIR and QDMTT from fiscal year 2025; UTPR in force from fiscal year 2026 (filing procedures PER-6/PJ/2026).",
    frm="2025-01-01",
    as_of=AUDIT_DATE,
)

RD = "https://www.rd.go.th/english/6043.html"
R += vat(
    "TH",
    7,
    thr=1800000,
    cur="THB",
    url=RD,
    src="Thai Revenue Department",
    as_of=AUDIT_DATE,
    conf="verified",
    notes="Statutory rate 10%, reduced to 7% by royal decree (Royal Decree No. 799 covers 1 Oct 2025 – 30 Sep 2026). Cabinet approved a further one-year extension to 30 Sep 2027 on 27 Jul 2026; Royal Gazette publication not yet confirmed.",
)
R += cit("TH", 20, slug="thailand")
R += pit("TH", 35, slug="thailand")
R += wht("TH", 10, 15, 15, slug="thailand")
R += p2("TH", "Emergency Decree on Top-up Tax B.E. 2567: IIR, QDMTT and UTPR from 1 Jan 2025.", frm="2025-01-01")

GDT = "https://www.gdt.gov.vn/"
R += vat(
    "VN",
    10,
    [5],
    url=GDT,
    src="General Department of Taxation",
    notes="Temporary 2-point cut to 8% on most goods/services (excl. telecoms, finance, real estate) in force since 2022 and extended through 31 Dec 2026 (National Assembly Resolution June 2025). New VAT Law effective 1 Jul 2025.",
)
R += [
    rate(
        "VN",
        "vat",
        "other",
        8,
        frm="2022-02-01",
        to="2026-12-31",
        as_of=AUDIT_DATE,
        url=GDT,
        src="General Department of Taxation",
        desc="Temporarily reduced standard rate (stimulus) on most goods and services",
        notes="Current legal basis Resolution 204/2025/QH15 and Decree 174/2025/ND-CP (1 Jul 2025 – 31 Dec 2026), continuing the chain of decrees since Feb 2022; excludes telecoms, finance, real estate and certain excise goods.",
    )
]
R += cit(
    "VN", 20, slug="vietnam", notes="32%–50% for oil and gas; 15%/17% SME rates from Oct 2025 under the new CIT Law."
)
R += pit("VN", 35, slug="vietnam")
R += wht(
    "VN",
    0,
    5,
    10,
    slug="vietnam",
    notes="Foreign Contractor Tax: CIT component shown; VAT component applies additionally to services.",
)
R += p2("VN", "National Assembly Resolution 107/2023/QH15: QDMTT and IIR from 1 Jan 2024.", frm="2024-01-01")

RMCD = "https://mysst.customs.gov.my/"
R += [
    rate(
        "MY",
        "sales_use",
        "standard",
        10,
        url=RMCD,
        src="Royal Malaysian Customs Department",
        desc="Sales tax standard rate on manufactured/imported goods (5% reduced rate on certain goods)",
    ),
    rate(
        "MY",
        "sales_use",
        "services",
        8,
        frm="2024-03-01",
        url=RMCD,
        src="Royal Malaysian Customs Department",
        as_of=AUDIT_DATE,
        desc="Service tax rate (6% retained for F&B, telecoms, parking, logistics, construction, private healthcare and education); scope expanded 1 Jul 2025",
        notes="Raised from 6% to 8% on 1 Mar 2024. Scope expanded 1 Jul 2025 to rental/leasing, construction, financial services, private healthcare and education.",
    ),
    rate(
        "MY",
        "sales_use",
        "services",
        6,
        frm="2018-09-01",
        to="2024-02-29",
        url=RMCD,
        src="Royal Malaysian Customs Department",
        desc="Service tax rate (Sep 2018 – Feb 2024)",
    ),
    rate(
        "MY",
        "sales_use",
        "registration_threshold",
        None,
        thr=500000,
        cur="MYR",
        url=RMCD,
        src="Royal Malaysian Customs Department",
        desc="Sales tax / service tax registration threshold (annual taxable turnover)",
    ),
]
R += cit("MY", 24, slug="malaysia", notes="15%/17% tiered rates for resident SMEs on first MYR 600k.")
R += pit("MY", 30, slug="malaysia")
R += wht("MY", 0, 15, 10, slug="malaysia")
R += p2("MY", "Finance (No. 2) Act 2023: IIR and QDMTT for financial years from 1 Jan 2025.", frm="2025-01-01")

IRAS = "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/basics-of-gst/current-gst-rates"
R += vat(
    "SG",
    9,
    thr=1000000,
    cur="SGD",
    tax_type="gst",
    frm="2024-01-01",
    url=IRAS,
    src="IRAS",
    desc="GST standard rate",
    notes="7% to 2022; 8% in 2023; 9% from 1 Jan 2024.",
)
R += [
    rate(
        "SG",
        "gst",
        "standard",
        8,
        frm="2023-01-01",
        to="2023-12-31",
        url=IRAS,
        src="IRAS",
        desc="GST standard rate (2023)",
    ),
    rate(
        "SG",
        "gst",
        "standard",
        7,
        frm="2007-07-01",
        to="2022-12-31",
        url=IRAS,
        src="IRAS",
        desc="GST standard rate (Jul 2007 – 2022)",
    ),
]
R += cit(
    "SG",
    17,
    slug="singapore",
    as_of=AUDIT_DATE,
    notes="Partial tax exemption on first SGD 200k. CIT rebate 50% for YA2025 (capped SGD 40k); YA2026 rebate 50% plus SGD 2,000 cash grant, capped at SGD 40,000 (Budget 2026 as enhanced Apr 2026).",
)
R += pit(
    "SG", 24, slug="singapore", frm="2024-01-01", notes="Raised from 22% to 24% from YA2024 (income above SGD 1m)."
)
R += wht("SG", 0, 15, 10, slug="singapore")
R += p2(
    "SG",
    "Multinational Enterprise (Minimum Tax) Act 2024: Multinational Top-up Tax (IIR) and Domestic Top-up Tax from financial years starting 1 Jan 2025.",
    frm="2025-01-01",
)

BIR = "https://www.bir.gov.ph/"
R += vat(
    "PH",
    12,
    thr=3000000,
    cur="PHP",
    url=BIR,
    src="Bureau of Internal Revenue",
    notes="From 1 Jun 2025 (RA 12023) 12% VAT applies to digital services supplied by non-resident providers.",
)
R += cit(
    "PH",
    25,
    slug="philippines",
    notes="20% for domestic corporations with net taxable income ≤ PHP 5m and assets ≤ PHP 100m, and for registered business enterprises under CREATE MORE (2024).",
)
R += pit("PH", 35, slug="philippines")
R += wht(
    "PH", 25, 20, 25, slug="philippines", div_notes="15% where the recipient's country allows a tax-sparing credit."
)

ATO = "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst"
R += vat(
    "AU",
    10,
    thr=75000,
    cur="AUD",
    tax_type="gst",
    url=ATO,
    src="Australian Taxation Office",
    desc="GST standard rate (with GST-free and input-taxed categories)",
)
R += cit(
    "AU", 30, slug="australia", as_of=AUDIT_DATE, notes="25% for base rate entities (aggregated turnover < AUD 50m)."
)
R += pit(
    "AU",
    45,
    slug="australia",
    as_of=AUDIT_DATE,
    notes="Above AUD 190,000; plus 2% Medicare levy (47%). Lowest bracket falls from 16% to 15% on 1 Jul 2026 and 14% on 1 Jul 2027 (top rate unchanged).",
)
R += wht("AU", 30, 10, 30, slug="australia", div_notes="Unfranked dividends only; franked dividends exempt.")
R += p2(
    "AU",
    "Taxation (Multinational—Global and Domestic Minimum Tax) Act 2024: IIR and Domestic Minimum Tax from 1 Jan 2024; UTPR from 1 Jan 2025.",
    frm="2024-01-01",
)

IRD_NZ = "https://www.ird.govt.nz/gst"
R += vat(
    "NZ",
    15,
    thr=60000,
    cur="NZD",
    tax_type="gst",
    url=IRD_NZ,
    src="Inland Revenue NZ",
    desc="GST standard rate (broad base, minimal exemptions)",
)
R += cit("NZ", 28, slug="new-zealand")
R += pit("NZ", 39, slug="new-zealand", notes="39% above NZD 180,000 (from 1 Apr 2021).")
R += wht(
    "NZ",
    30,
    15,
    15,
    slug="new-zealand",
    div_notes="0% fully imputed dividends to ≥10% shareholders; 15% imputed otherwise.",
    int_notes="0% where the 2% Approved Issuer Levy is paid.",
)
R += p2(
    "NZ",
    "Taxation (Annual Rates for 2023–24, Multinational Tax, and Remedial Matters) Act 2024: IIR and UTPR from 1 Jan 2025; DIIR from 1 Jan 2026.",
    frm="2025-01-01",
)

IRD_HK = "https://www.ird.gov.hk/eng/tax/bus_pft.htm"
R += [
    rate(
        "HK",
        "vat",
        "standard",
        None,
        url=IRD_HK,
        src="Inland Revenue Department HK",
        desc="No VAT, GST or sales tax in Hong Kong",
    ),
    rate(
        "HK",
        "corporate_income",
        "headline",
        16.5,
        url=IRD_HK,
        src="Inland Revenue Department HK",
        desc="Profits tax (corporations); two-tiered: 8.25% on first HKD 2m",
    ),
    rate(
        "HK",
        "personal_income",
        "top_marginal",
        17,
        url="https://www.ird.gov.hk/eng/tax/ind_sal.htm",
        src="Inland Revenue Department HK",
        desc="Top progressive salaries tax rate; capped by the standard rate (15%, 16% on net income over HKD 5m from 2024/25)",
    ),
]
R += wht(
    "HK",
    0,
    0,
    4.95,
    slug="hong-kong-sar",
    roy_notes="16.5% on 30% of gross royalties (4.95% effective); 16.5% if paid to an associate for IP previously owned in HK.",
)
R += p2(
    "HK",
    "Inland Revenue (Amendment) (Minimum Tax for Multinational Enterprise Groups) Ordinance 2025: IIR and Hong Kong minimum top-up tax (HKMTT) from 1 Jan 2025.",
    frm="2025-01-01",
)

MOF_TW = "https://www.dot.gov.tw/"
R += vat(
    "TW",
    5,
    url="https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=G0340080",
    src="Value-added and Non-value-added Business Tax Act (MOJ Laws & Regulations Database)",
    as_of=AUDIT_DATE,
    desc="Business tax (VAT) standard rate (statutory band 5%–10%; 5% applied)",
    notes="Non-resident e-service suppliers must register above TWD 600,000 annual sales (PwC; previously reported as TWD 480,000). MOF landing page: "
    + MOF_TW,
)
R += cit(
    "TW",
    20,
    slug="taiwan",
    notes="5% surtax on undistributed earnings; AMT raised to 15% for large MNE groups from 2025.",
)
R += pit("TW", 40, slug="taiwan")
R += wht("TW", 21, 20, 20, slug="taiwan", int_notes="15% on short-term bills and securitised instruments.")

# ----------------------------------------------------------------------------------------------------------------
# Middle East & Africa
# ----------------------------------------------------------------------------------------------------------------
FTA = "https://tax.gov.ae/en/taxes/Vat/vat.topics/registration.for.vat.aspx"
R += vat(
    "AE",
    5,
    zero=True,
    thr=375000,
    cur="AED",
    url=FTA,
    src="UAE Federal Tax Authority",
    as_of=AUDIT_DATE,
    conf="verified",
    notes="Introduced 1 Jan 2018; voluntary registration from AED 187,500.",
)
R += cit(
    "AE",
    9,
    slug="united-arab-emirates",
    frm="2023-06-01",
    as_of=AUDIT_DATE,
    conf="verified",
    url="https://mof.gov.ae/corporate-tax/",
    src="UAE Ministry of Finance",
    desc="Federal corporate tax (0% on taxable income up to AED 375,000; 0% for qualifying free zone persons)",
    notes="Applies to financial years starting on/after 1 June 2023.",
)
R += [
    rate(
        "AE",
        "corporate_income",
        "headline",
        0,
        frm="1971-12-02",
        to="2023-05-31",
        src=PWC,
        url=pwc("united-arab-emirates", "corporate/taxes-on-corporate-income"),
        desc="No federal corporate tax before June 2023 (emirate-level taxes on oil companies and foreign banks only)",
    )
]
R += pit("AE", 0, slug="united-arab-emirates", desc="No personal income tax")
R += wht("AE", 0, 0, 0, slug="united-arab-emirates")
R += p2(
    "AE",
    "Cabinet Decision No. 142 of 2024: 15% Domestic Minimum Top-up Tax (DMTT) for financial years from 1 Jan 2025; no IIR/UTPR.",
    frm="2025-01-01",
)

ZATCA = "https://zatca.gov.sa/en/RulesRegulations/Taxes/Pages/default.aspx"
R += vat(
    "SA",
    15,
    zero=True,
    thr=375000,
    cur="SAR",
    frm="2020-07-01",
    url=ZATCA,
    src="ZATCA",
    notes="Introduced at 5% on 1 Jan 2018; tripled to 15% on 1 Jul 2020.",
)
R += [
    rate(
        "SA",
        "vat",
        "standard",
        5,
        frm="2018-01-01",
        to="2020-06-30",
        url=ZATCA,
        src="ZATCA",
        desc="VAT standard rate (2018 – Jun 2020)",
    )
]
R += cit(
    "SA",
    20,
    slug="saudi-arabia",
    desc="Corporate income tax on the share of profits attributable to non-Saudi/non-GCC shareholders (Zakat at 2.5% on the Saudi/GCC share)",
)
R += pit("SA", 0, slug="saudi-arabia", desc="No personal income tax")
R += wht("SA", 5, 5, 15, slug="saudi-arabia")
R += [
    rate(
        "SA",
        "property",
        "standard",
        5,
        frm="2020-10-04",
        as_of=AUDIT_DATE,
        url="https://zatca.gov.sa/en/RulesRegulations/Taxes/Pages/RETT.aspx",
        src="ZATCA",
        desc="Real Estate Transaction Tax (RETT) on disposals of real estate",
        notes="Introduced by Royal Order A/84 (4 Oct 2020) when real estate was exempted from VAT; codified by the RETT Law (Royal Decree M/84, Oct 2024) with implementing regulations effective Apr 2025.",
    )
]
R += p2("SA", "Not adopted as of 2025; ZATCA has indicated Pillar Two is under study.", adopted=False)

ITA = "https://www.gov.il/en/departments/israel_tax_authority"
R += vat(
    "IL",
    18,
    frm="2025-01-01",
    zero=True,
    thr=120000,
    cur="ILS",
    url=ITA,
    src="Israel Tax Authority",
    notes="Raised from 17% to 18% on 1 Jan 2025 (2025 budget).",
)
R += [
    rate(
        "IL",
        "vat",
        "standard",
        17,
        frm="2015-10-01",
        to="2024-12-31",
        url=ITA,
        src="Israel Tax Authority",
        desc="VAT standard rate (Oct 2015 – 2024)",
    )
]
R += cit("IL", 23, slug="israel")
R += pit(
    "IL",
    47,
    slug="israel",
    notes="Plus 3% surtax above ~ILS 721k (50%); additional 2% surtax on passive income from 2025.",
)
R += wht(
    "IL",
    25,
    25,
    25,
    slug="israel",
    div_notes="30% for substantial (≥10%) shareholders.",
    int_notes="23% for corporate recipients.",
    roy_notes="23% for corporate recipients.",
)
R += p2(
    "IL",
    "Qualified Domestic Minimum Top-up Tax enacted by the Knesset on 29 Dec 2025 for tax years beginning after 31 Dec 2025 (groups with revenue ≥ EUR 750m); no IIR or UTPR.",
    frm="2026-01-01",
    as_of=AUDIT_DATE,
    url="https://taxsummaries.pwc.com/israel/corporate/taxes-on-corporate-income",
    src=PWC,
)

GIB_TR = "https://www.gib.gov.tr/"
R += vat(
    "TR",
    20,
    [1, 10],
    frm="2023-07-10",
    url=GIB_TR,
    src="Revenue Administration (GİB)",
    desc="KDV standard rate",
    notes="Raised from 18% to 20% (and 8% to 10%) by Presidential Decree 7346 on 10 Jul 2023.",
)
R += [
    rate(
        "TR",
        "vat",
        "standard",
        18,
        frm="2001-05-15",
        to="2023-07-09",
        url=GIB_TR,
        src="Revenue Administration (GİB)",
        desc="KDV standard rate (2001 – Jul 2023)",
    )
]
R += cit("TR", 25, slug="turkey", notes="30% for banks and financial institutions; 10% domestic minimum CIT from 2025.")
R += pit(
    "TR",
    40,
    slug="turkey",
    as_of=AUDIT_DATE,
    conf="verified",
    url="https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources?objectKey=arsiv%2Fyardim-kaynaklar%2Fyararli-bilgiler%2Fgelir-vergisi-tarifeleri%2Fgelir-vergisi-tarifesi-2026.pdf",
    src="Revenue Administration (GİB) – 2026 tariff",
    notes="Applies above TRY 5,300,000 in 2026.",
)
R += wht(
    "TR",
    15,
    10,
    20,
    slug="turkey",
    div_notes="Raised from 10% to 15% by Presidential Decree 9286 (22 Dec 2024).",
    int_notes="0% for loans from foreign banks; 10% from other foreign lenders.",
)
R += [
    rate(
        "TR",
        "withholding",
        "dividends",
        10,
        frm="2021-12-22",
        to="2024-12-21",
        src=PWC,
        url=pwc("turkey", "corporate/withholding-taxes"),
        desc="Dividend withholding (Dec 2021 – Dec 2024)",
    )
]
R += dst(
    "TR",
    7.5,
    "Dijital Hizmet Vergisi: 7.5% of Turkish digital-service revenue for groups above EUR 750m global / TRY 20m Turkish revenue.",
    frm="2020-03-01",
    url="https://www.gib.gov.tr/dijital-hizmet-vergisi",
    src="Revenue Administration (GİB)",
)
R += p2("TR", "Law 7524 (Aug 2024): IIR and QDMTT from 1 Jan 2024; UTPR from 2025.", frm="2024-01-01")

SARS = "https://www.sars.gov.za/types-of-tax/value-added-tax/"
R += vat(
    "ZA",
    15,
    zero=True,
    thr=1000000,
    cur="ZAR",
    url=SARS,
    src="SARS",
    as_of=AUDIT_DATE,
    conf="verified",
    notes="Proposed increase to 15.5% (1 May 2025) and 16% (2026) was withdrawn on 24 Apr 2025; Budget 2026 left the rate at 15% but raised the compulsory registration threshold from ZAR 1m to ZAR 2.3m from 1 Apr 2026.",
)
R[-1]["threshold_amount"] = 2300000
R[-1]["effective_from"] = d("2026-04-01")
R[-1]["confidence"] = "verified"
R += [
    rate(
        "ZA",
        "vat",
        "registration_threshold",
        None,
        thr=1000000,
        cur="ZAR",
        frm="2009-03-01",
        to="2026-03-31",
        as_of=AUDIT_DATE,
        url=SARS,
        src="SARS",
        desc="Compulsory registration threshold (Mar 2009 – Mar 2026)",
    )
]
R += cit(
    "ZA",
    27,
    slug="south-africa",
    frm="2023-03-31",
    notes="Reduced from 28% for years of assessment ending on/after 31 Mar 2023.",
)
R += [
    rate(
        "ZA",
        "corporate_income",
        "headline",
        28,
        frm="2013-04-01",
        to="2023-03-30",
        src=PWC,
        url=pwc("south-africa", "corporate/taxes-on-corporate-income"),
        desc="Corporate income tax rate (2013 – Mar 2023)",
    )
]
R += pit("ZA", 45, slug="south-africa")
R += wht("ZA", 20, 15, 15, slug="south-africa")
R += p2(
    "ZA",
    "Global Minimum Tax Act 2024 and Administration Act: IIR and QDMTT for fiscal years from 1 Jan 2024.",
    frm="2024-01-01",
)

FIRS = "https://www.firs.gov.ng/"
R += vat(
    "NG",
    7.5,
    zero=True,
    thr=25000000,
    cur="NGN",
    frm="2020-02-01",
    url=FIRS,
    src="FIRS",
    notes="Raised from 5% to 7.5% by Finance Act 2019. Nigeria Tax Act 2025 (effective 1 Jan 2026) retains 7.5% with expanded zero-rating and input credit on services.",
)
R += [
    rate(
        "NG",
        "vat",
        "standard",
        5,
        frm="1994-01-01",
        to="2020-01-31",
        url=FIRS,
        src="FIRS",
        desc="VAT standard rate (1994 – Jan 2020)",
    )
]
R += cit(
    "NG",
    30,
    slug="nigeria",
    as_of=AUDIT_DATE,
    notes="0% for small companies from 1 Jan 2026 (Nigeria Tax Act 2025: turnover ≤ NGN 100m and fixed assets ≤ NGN 250m per PwC/Baker Tilly; EY's signing alert cited NGN 50m — confirm against the Act text); plus 4% development levy from 2026 replacing TET/NITDA/NASENI levies.",
)
R += pit(
    "NG",
    25,
    slug="nigeria",
    frm="2026-01-01",
    as_of=AUDIT_DATE,
    notes="Nigeria Tax Act 2025 (effective 1 Jan 2026): 0% on the first NGN 800k, then 15%/18%/21%/23% bands and 25% above NGN 50m.",
)
R += [
    rate(
        "NG",
        "personal_income",
        "top_marginal",
        24,
        frm="2011-01-01",
        to="2025-12-31",
        as_of=AUDIT_DATE,
        src=PWC,
        url=pwc("nigeria", "individual/taxes-on-personal-income"),
        desc="Top marginal personal income tax rate (PITA 2011; through 2025)",
    )
]
R += wht("NG", 10, 10, 10, slug="nigeria", notes="7.5% for treaty countries.")
R += p2(
    "NG",
    "Nigeria Tax Act 2025 introduces a 15% minimum effective tax rate from 1 Jan 2026 for MNE groups with turnover ≥ EUR 750m and for Nigerian companies above a domestic turnover threshold (reported as NGN 50bn by PwC, NGN 20bn by EY); a domestic top-up, not a peer-reviewed QDMTT.",
    frm="2026-01-01",
    as_of=AUDIT_DATE,
)

ETA = "https://www.eta.gov.eg/"
R += vat("EG", 14, thr=500000, cur="EGP", url=ETA, src="Egyptian Tax Authority")
R += cit("EG", 22.5, slug="egypt", notes="40.55% for oil exploration; Suez Canal Authority/CBE at 40%.")
R += pit("EG", 27.5, slug="egypt")
R += wht("EG", 10, 20, 20, slug="egypt", div_notes="5% for listed shares.")

KRA = "https://www.kra.go.ke/"
R += vat(
    "KE",
    16,
    zero=True,
    thr=5000000,
    cur="KES",
    url=KRA,
    src="Kenya Revenue Authority",
    notes="8% rate on petroleum products removed in 2023 (now 16%).",
)
R += cit("KE", 30, slug="kenya", notes="Branches 30% plus 15% repatriation tax (from 2024); previously 37.5%.")
R += pit("KE", 35, slug="kenya", frm="2023-07-01", notes="32.5% and 35% bands added by Finance Act 2023.")
R += wht("KE", 15, 15, 20, slug="kenya")
R += dst(
    "KE",
    1.5,
    "Digital Service Tax on gross transaction value of digital marketplace services by non-residents; repealed and replaced by the Significant Economic Presence Tax on 27 Dec 2024.",
    frm="2021-01-01",
    to="2024-12-26",
    as_of=AUDIT_DATE,
    url="https://new.kenyalaw.org/akn/ke/act/2024/12/eng@2024-12-13",
    src="Kenya Law – Tax Laws (Amendment) Act 2024",
    notes="KRA DST topic page returned 404 in Aug 2026; repealing Act used as source.",
)
R += [
    rate(
        "KE",
        "digital_services",
        "standard",
        3,
        frm="2024-12-27",
        as_of=AUDIT_DATE,
        url="https://www.kra.go.ke/",
        src="Kenya Revenue Authority",
        desc="Significant Economic Presence Tax: 30% on deemed 10% profit margin = 3% of gross turnover from digital marketplace (Tax Laws (Amendment) Act 2024)",
        notes="Finance Act 2025 (1 Jul 2025) removed the KES 5m exemption and extended SEPT to all internet/electronic services by non-residents.",
    )
]
R += p2(
    "KE",
    "Tax Laws (Amendment) Act 2024: 15% minimum top-up tax (QDMTT-style) for in-scope MNEs from 1 Jan 2025.",
    frm="2025-01-01",
)

FNS = "https://www.nalog.gov.ru/"
FNS_NDS = "https://www.nalog.gov.ru/rn77/taxation/taxes/nds/"
FNS_PROFIT = "https://www.nalog.gov.ru/rn77/taxation/taxes/profitul/"
FNS_NDFL = "https://www.nalog.gov.ru/rn77/taxation/taxes/ndfl/"
# PwC Worldwide Tax Summaries no longer publishes Russia (all /russian-federation/ pages 404); FNS topic pages are
# used as the landing source and the figures rest on secondary sources (Orbitax, VATupdate, Konsu, Sovos).
R += vat(
    "RU",
    22,
    [10],
    thr=20000000,
    cur="RUB",
    frm="2026-01-01",
    url=FNS_NDS,
    src="Federal Tax Service",
    as_of=AUDIT_DATE,
    notes="Standard rate raised from 20% to 22% on 1 Jan 2026 (Federal Law No. 425-FZ of 28 Nov 2025); 10% reduced rate retained. Simplified-regime taxpayers become VAT payers above RUB 60m revenue (2025), RUB 20m (2026), RUB 15m (2027), RUB 10m (2028).",
)
R[-1]["effective_from"] = d("2026-01-01")  # threshold row
R += [
    rate(
        "RU",
        "vat",
        "standard",
        20,
        frm="2019-01-01",
        to="2025-12-31",
        as_of=AUDIT_DATE,
        url=FNS_NDS,
        src="Federal Tax Service",
        desc="VAT standard rate (2019–2025)",
    ),
    rate(
        "RU",
        "vat",
        "registration_threshold",
        None,
        thr=60000000,
        cur="RUB",
        frm="2025-01-01",
        to="2025-12-31",
        as_of=AUDIT_DATE,
        url=FNS_NDS,
        src="Federal Tax Service",
        desc="Simplified-regime VAT liability threshold (2025)",
    ),
]
R += cit(
    "RU",
    25,
    slug="russian-federation",
    frm="2025-01-01",
    as_of=AUDIT_DATE,
    url=FNS_PROFIT,
    src="Federal Tax Service",
    notes="Raised from 20% to 25% from 2025; 5% for accredited IT companies (2025–2030). Unchanged for 2026.",
)
R += [
    rate(
        "RU",
        "corporate_income",
        "headline",
        20,
        frm="2009-01-01",
        to="2024-12-31",
        src="Federal Tax Service",
        url=FNS_PROFIT,
        desc="Corporate profits tax (2009–2024)",
    )
]
R += pit(
    "RU",
    22,
    slug="russian-federation",
    frm="2025-01-01",
    as_of=AUDIT_DATE,
    url=FNS_NDFL,
    src="Federal Tax Service",
    notes="Five-bracket scale 13%–22% from 2025 (previously 13%/15%). Unchanged for 2026.",
)
R += [
    rate(
        "RU",
        "personal_income",
        "top_marginal",
        15,
        frm="2021-01-01",
        to="2024-12-31",
        src="Federal Tax Service",
        url=FNS_NDFL,
        desc="Top personal rate 15% above RUB 5m (2021–2024)",
    )
]
R += wht(
    "RU",
    15,
    20,
    20,
    slug="russian-federation",
    url=FNS_PROFIT,
    notes="Treaty benefits suspended with 'unfriendly' states by Decree 585 (Aug 2023).",
)

STS_UA = "https://tax.gov.ua/"
R += vat(
    "UA",
    20,
    [7, 14],
    thr=1000000,
    cur="UAH",
    url=STS_UA,
    src="State Tax Service of Ukraine",
    notes="7% medicines/culture/hotels; 14% certain agricultural products.",
)
R += cit(
    "UA",
    18,
    slug="ukraine",
    as_of=AUDIT_DATE,
    notes="25% for non-bank financial institutions (excl. insurers) from 2025; banks pay a temporary 50% rate for tax years 2023, 2024 and 2026 (25% in 2025).",
)
R += pit("UA", 18, slug="ukraine", notes="Plus military levy raised from 1.5% to 5% from 1 Dec 2024 (23% combined).")
R += wht("UA", 15, 15, 15, slug="ukraine")


# ----------------------------------------------------------------------------------------------------------------
# Audit pass 2026-08-22 — see docs/data-audit.md
# ----------------------------------------------------------------------------------------------------------------
# Jurisdictions whose headline VAT/GST, CIT and PIT rows were checked during the audit. Current rows of those kinds
# get as_of=AUDIT_DATE; rows listed in VERIFIED (confirmed on a primary authority page) are upgraded to 'verified'.
AUDITED = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
    "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "CH", "NO", "IS", "US", "CA", "MX", "BR", "AR", "CL", "CO",
    "PE", "CN", "JP", "KR", "IN", "ID", "TH", "VN", "MY", "SG", "PH", "AU", "NZ", "HK", "TW", "AE", "SA", "IL", "TR",
    "ZA", "NG", "EG", "KE", "RU", "UA",
}  # fmt: skip
HEADLINE_KINDS = {
    ("vat", "standard"),
    ("vat", "reduced"),
    ("vat", "super_reduced"),
    ("vat", "registration_threshold"),
    ("gst", "standard"),
    ("gst", "registration_threshold"),
    ("sales_use", "standard"),
    ("corporate_income", "headline"),
    ("corporate_income", "federal"),
    ("personal_income", "top_marginal"),
}
# (jurisdiction, tax_type, rate_kind) confirmed on a primary authority page on AUDIT_DATE (URL in the row or below).
VERIFIED: dict[tuple[str, str, str], str | None] = {
    ("AT", "vat", "standard"): None,
    ("AT", "vat", "reduced"): None,
    ("AT", "personal_income", "top_marginal"): None,
    ("BE", "vat", "standard"): "https://finances.belgium.be/fr/entreprises/tva/assujettissement-tva/taux-et-calcul/taux-tva",
    ("BE", "vat", "reduced"): "https://finances.belgium.be/fr/entreprises/tva/assujettissement-tva/taux-et-calcul/taux-tva",
    ("CH", "vat", "standard"): None,
    ("CH", "vat", "reduced"): None,
    ("CL", "personal_income", "top_marginal"): None,
    ("DE", "vat", "standard"): None,
    ("DE", "vat", "reduced"): None,
    ("DK", "vat", "standard"): "https://skat.dk/en-us/businesses/vat/get-started-on-vat",
    ("EE", "personal_income", "top_marginal"): None,
    ("GB", "vat", "standard"): None,
    ("GB", "vat", "registration_threshold"): "https://www.gov.uk/vat-registration-thresholds",
    ("GB", "corporate_income", "headline"): None,
    ("GB", "personal_income", "top_marginal"): None,
    ("HK", "corporate_income", "headline"): None,
    ("IE", "vat", "standard"): None,
    ("IE", "vat", "reduced"): None,
    ("IE", "vat", "registration_threshold"): "https://www.revenue.ie/en/vat/vat-registration/who-should-register-for-vat/vat-thresholds.aspx",
    ("IE", "personal_income", "top_marginal"): None,
    ("IN", "gst", "standard"): None,
    ("JP", "vat", "standard"): None,
    ("JP", "vat", "reduced"): None,
    ("NL", "vat", "standard"): None,
    ("NL", "vat", "reduced"): None,
    ("NL", "corporate_income", "headline"): None,
    ("NL", "personal_income", "top_marginal"): None,
    ("NO", "vat", "standard"): None,
    ("NO", "vat", "reduced"): None,
    ("NO", "corporate_income", "headline"): None,
    ("NO", "personal_income", "top_marginal"): None,
    ("NZ", "gst", "standard"): None,
    ("NZ", "gst", "registration_threshold"): "https://www.ird.govt.nz/gst/registering-for-gst",
    ("NZ", "personal_income", "top_marginal"): "https://www.ird.govt.nz/income-tax/income-tax-for-individuals/tax-codes-and-tax-rates-for-individuals/tax-rates-for-individuals",
    ("PL", "vat", "standard"): None,
    ("PL", "vat", "reduced"): None,
    ("PL", "personal_income", "top_marginal"): "https://www.podatki.gov.pl/pit/stawki-podatkowe",
    ("SE", "vat", "standard"): None,
    ("SE", "vat", "reduced"): None,
    ("SE", "corporate_income", "headline"): None,
    ("SE", "personal_income", "top_marginal"): "https://www.skatteverket.se/privat/skatter/beloppochprocent/2026.html",
    ("TH", "vat", "standard"): None,
    ("TH", "vat", "registration_threshold"): None,
    ("TR", "personal_income", "top_marginal"): None,
    ("TW", "corporate_income", "headline"): "https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=G0340003",
    ("TW", "personal_income", "top_marginal"): "https://law.moj.gov.tw/ENG/LawClass/LawAll.aspx?pcode=G0340003",
    ("US", "corporate_income", "federal"): None,
    ("US", "personal_income", "top_marginal"): None,
    ("AE", "vat", "standard"): None,
    ("AE", "vat", "registration_threshold"): None,
    ("AE", "corporate_income", "headline"): None,
    ("ZA", "vat", "standard"): None,
    ("ZA", "corporate_income", "headline"): "https://www.sars.gov.za/tax-rates/income-tax/companies-trusts-and-small-business-corporations-sbc/",
    ("ZA", "personal_income", "top_marginal"): "https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/",
}  # fmt: skip


def _apply_audit(rows: list[dict]) -> None:
    audit_date = d(AUDIT_DATE)
    for r in rows:
        if r["effective_to"] is not None or r["jurisdiction_code"] not in AUDITED:
            continue
        key = (r["jurisdiction_code"], r["tax_type"], r["rate_kind"])
        if (r["tax_type"], r["rate_kind"]) in HEADLINE_KINDS:
            r["as_of"] = audit_date
        if key in VERIFIED:
            r["confidence"] = "verified"
            r["as_of"] = audit_date
            if VERIFIED[key]:
                r["source_url"] = VERIFIED[key]


_apply_audit(R)

RATES_COUNTRIES: list[dict] = R
