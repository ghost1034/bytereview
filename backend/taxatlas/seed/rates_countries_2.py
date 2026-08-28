"""Country-level tax rates — coverage expansion (August 2026): ~150 further economies.

Companion to `rates_countries.py` (EU-27 + ~35 major economies). This module covers the remaining jurisdictions with
a functioning tax system: the rest of Europe, the Middle East, Africa, Asia, Oceania and the Americas, including the
offshore centres (no CIT + economic-substance regime) and the Gulf states (VAT since 2018–2021, DMTTs since 2025).

Sources and confidence (see docs/data-audit.md, "Country coverage expansion (2026-08)"):

* `Pwc(...)` blocks: values read from the PwC Worldwide Tax Summaries territory pages on CHECK_DATE (quick charts for
  the headline rates; per-territory `other-taxes`, `taxes-on-corporate-income`, `withholding-taxes` and
  `taxes-on-personal-income` pages for reduced rates, thresholds, Pillar Two status and notes) -> `reported`.
* Explicit `V/C/P/W` blocks: jurisdictions PwC does not cover. The cited page is the national tax authority / statute
  where one could be fetched, otherwise a Deloitte/EY/KPMG guide or another secondary source named in `source_name`.
* Rows whose value was confirmed on a live primary authority page on CHECK_DATE are listed in VERIFIED (bottom of the
  module) and upgraded to `verified`; everything else stays `reported`.
* Jurisdictions with no reliable public source (SY, ER, KM, CF) get a single `other` row with rate None.

Rates are percentages; thresholds are annual taxable turnover in local currency. WHT rows are domestic statutory rates
on payments to non-residents before treaty relief; a WHT kind is omitted (not zeroed) where the source gave no rate.
"""

from __future__ import annotations

from taxatlas.seed._helpers import d, rate
from taxatlas.seed.rates_countries import P2_URL, PWC, pwc

CHECK_DATE = "2026-08-25"
P2_SRC = "OECD – Global minimum tax (Pillar Two)"
IF_URL = (
    "https://www.oecd.org/content/dam/oecd/en/topics/policy-issues/beps/inclusive-framework-on-beps-composition.pdf"
)
WHT_BASE = "Domestic statutory withholding rate on payments to non-residents (before treaty relief)"


def _row(jur, tax_type, kind, value=None, **kw):
    kw.setdefault("as_of", CHECK_DATE)
    return rate(jur, tax_type, kind, value, **kw)


def V(
    jur,
    std,
    reduced=(),
    *,
    url,
    src,
    tax_type="vat",
    label=None,
    zero=False,
    thr=None,
    cur=None,
    frm=None,
    conf="reported",
    desc=None,
    applies=None,
    notes=None,
    higher=(),
    thr_notes=None,
):
    """VAT/GST/sales-tax block: standard (+ reduced, higher, zero, registration threshold)."""
    label = label or tax_type.upper()
    rows = [
        _row(
            jur,
            tax_type,
            "standard",
            std,
            frm=frm,
            url=url,
            src=src,
            conf=conf,
            desc=desc or f"Standard {label} rate",
            notes=notes,
        )
    ]
    for r_ in reduced:
        rows.append(_row(jur, tax_type, "reduced", r_, url=url, src=src, desc="Reduced rate", applies=applies))
    for r_ in higher:
        rows.append(
            _row(jur, tax_type, "other", r_, url=url, src=src, desc="Higher rate on specified goods or services")
        )
    if zero:
        rows.append(
            _row(jur, tax_type, "zero", 0.0, url=url, src=src, desc="Zero rate (taxable at 0% with input recovery)")
        )
    if thr is not None:
        rows.append(
            _row(
                jur,
                tax_type,
                "registration_threshold",
                None,
                thr=thr,
                cur=cur,
                url=url,
                src=src,
                desc="Domestic registration threshold (annual taxable turnover)",
                notes=thr_notes,
            )
        )
    return rows


def NOVAT(jur, desc, *, url, src, conf="reported", notes=None):
    """Jurisdiction without a VAT/GST: a 0% standard row whose description names the indirect tax that applies."""
    return [_row(jur, "vat", "standard", 0.0, url=url, src=src, conf=conf, desc=desc, notes=notes)]


def C(jur, headline, *, url, src, frm=None, conf="reported", desc="Headline corporate income tax rate", notes=None):
    return [
        _row(
            jur, "corporate_income", "headline", headline, frm=frm, url=url, src=src, conf=conf, desc=desc, notes=notes
        )
    ]


def P(
    jur, top, *, url, src, frm=None, to=None, conf="reported", desc="Top marginal personal income tax rate", notes=None
):
    return [
        _row(
            jur,
            "personal_income",
            "top_marginal",
            top,
            frm=frm,
            to=to,
            url=url,
            src=src,
            conf=conf,
            desc=desc,
            notes=notes,
        )
    ]


def W(
    jur,
    div,
    int_,
    roy,
    *,
    url,
    src,
    frm=None,
    conf="reported",
    notes=None,
    div_notes=None,
    int_notes=None,
    roy_notes=None,
):
    """WHT block; a kind whose rate is None is omitted (source gave no rate) rather than recorded as 0."""
    rows = []
    for kind, value, n in (
        ("dividends", div, div_notes),
        ("interest", int_, int_notes),
        ("royalties", roy, roy_notes),
    ):
        if value is None:
            continue
        rows.append(
            _row(
                jur,
                "withholding",
                kind,
                value,
                frm=frm,
                url=url,
                src=src,
                conf=conf,
                desc=f"{WHT_BASE}: {kind}",
                notes=n or notes,
            )
        )
    return rows


def P2(jur, desc, *, frm=None, adopted=True, url=P2_URL, src=P2_SRC, conf="reported", notes=None):
    return [
        _row(
            jur,
            "pillar_two",
            "minimum",
            15.0 if adopted else None,
            frm=frm,
            url=url,
            src=src,
            conf=conf,
            desc=desc,
            notes=notes,
        )
    ]


def HIST(jur, tax_type, kind, value, frm, to, *, url, src, desc, conf="reported", notes=None):
    """Historical row (effective_to set). as_of = effective_to per the README convention."""
    return [
        rate(jur, tax_type, kind, value, frm=frm, to=to, as_of=to, url=url, src=src, conf=conf, desc=desc, notes=notes)
    ]


def NOSRC(jur, *, url, src, notes):
    """Placeholder for a jurisdiction whose rates could not be sourced reliably (listed in docs/data-audit.md)."""
    return [_row(jur, "other", "other", None, url=url, src=src, desc="no reliable public source located", notes=notes)]


class Pwc:
    """Per-territory shortcut for rows sourced from PwC Worldwide Tax Summaries."""

    def __init__(self, jur: str, slug: str):
        self.jur, self.slug = jur, slug

    def _u(self, page: str) -> str:
        return pwc(self.slug, page)

    def vat(self, std, reduced=(), **kw):
        return V(self.jur, std, reduced, url=self._u("corporate/other-taxes"), src=PWC, **kw)

    def novat(self, desc, **kw):
        return NOVAT(self.jur, desc, url=self._u("corporate/other-taxes"), src=PWC, **kw)

    def cit(self, headline, **kw):
        return C(self.jur, headline, url=self._u("corporate/taxes-on-corporate-income"), src=PWC, **kw)

    def pit(self, top, **kw):
        return P(self.jur, top, url=self._u("individual/taxes-on-personal-income"), src=PWC, **kw)

    def wht(self, div, int_, roy, **kw):
        return W(self.jur, div, int_, roy, url=self._u("corporate/withholding-taxes"), src=PWC, **kw)

    def p2(self, desc, **kw):
        return P2(self.jur, desc, url=self._u("corporate/taxes-on-corporate-income"), src=PWC, **kw)

    def hist(self, tax_type, kind, value, frm, to, desc, *, page="corporate/other-taxes", notes=None):
        return HIST(self.jur, tax_type, kind, value, frm, to, url=self._u(page), src=PWC, desc=desc, notes=notes)


R: list[dict] = []

# ----------------------------------------------------------------------------------------------------------------
# Europe (non-EU/EEA) and the Caucasus
# ----------------------------------------------------------------------------------------------------------------
t = Pwc("AL", "albania")
R += t.vat(
    20,
    [6, 10],
    zero=True,
    thr=10_000_000,
    cur="ALL",
    applies="Accommodation, agritourism, books, advertising, agricultural inputs",
)
R += t.cit(
    15,
    notes="5% for software producers registered by 31 Dec 2023 (to 2025) and agricultural cooperatives/agrotourism (to 2029).",
)
R += t.pit(
    23,
    frm="2025-01-01",
    notes="Employment income 13% up to ALL 2,040,000 and 23% above (from 1 Jan 2025); dividends 8%.",
)
R += t.wht(8, 15, 15, notes="15% also on technical, management and board fees.")

t = Pwc("BA", "bosnia-and-herzegovina")
R += t.vat(
    17,
    zero=True,
    thr=100_000,
    cur="BAM",
    notes="Single-rate VAT (no reduced rate); state-level tax administered by the ITA.",
)
R += t.cit(10, desc="Corporate income tax rate in all three jurisdictions (FBiH, Republika Srpska, Brčko District)")
R += t.pit(10, desc="Flat personal income tax rate in FBiH and Brčko District (Republika Srpska 8%)")
R += t.wht(
    5,
    10,
    10,
    div_notes="FBiH 5%; Republika Srpska 10%; Brčko District 0%.",
    notes="Entity-level rates; 10% on interest and royalties in all three jurisdictions.",
)

t = Pwc("MK", "north-macedonia")
R += t.vat(
    18,
    [5, 10],
    thr=2_000_000,
    cur="MKD",
    applies="5%: food, pharmaceuticals, books, software, accommodation; 10%: restaurant and catering",
)
R += t.cit(10, notes="Simplified 1% turnover regime for income MKD 3m–6m; exempt below MKD 3m.")
R += t.pit(10, frm="2023-01-01", desc="Flat personal income tax rate (progressive rates suspended from 1 Jan 2023)")
R += t.wht(10, 10, 10)

t = Pwc("ME", "montenegro")
R += t.vat(
    21,
    [15, 7],
    zero=True,
    thr=30_000,
    cur="EUR",
    applies="15%: books, accommodation, culture/sport; 7%: bread, milk, medicines, schoolbooks, public transport",
)
R += t.cit(15, desc="Top rate of progressive CIT (9% to EUR 100,000; 12% to EUR 1.5m; 15% above)")
R += t.pit(
    15,
    notes="Salaries 9% (EUR 700–1,000) and 15% above EUR 1,000 gross per month, plus local surtax of 13–15% of the tax.",
)
R += t.wht(15, 15, 15, notes="30% for payments to entities in tax-haven jurisdictions.")

t = Pwc("RS", "serbia")
R += t.vat(20, [10], zero=True, applies="Basic food, daily newspapers, medicines, public transport, utilities")
R += t.cit(15)
R += t.pit(
    20,
    desc="Highest flat rate by income type (10–20%); annual supplementary PIT of 10%/15% above 3x/6x the average salary",
)
R += t.wht(20, 20, 20, notes="25% on royalties, interest, lease and service fees paid to tax-haven entities.")

t = Pwc("MD", "moldova")
R += t.vat(
    20,
    [8],
    thr=1_700_000,
    cur="MDL",
    applies="Bread, dairy, HoReCa, natural gas",
    thr_notes="Threshold applies from March 2026 (previously MDL 1.2m).",
)
R += t.cit(12, notes="7% for farming enterprises; 4% optional regime for non-VAT-registered SMEs.")
R += t.pit(12, desc="Flat personal income tax rate")
R += t.wht(6, 12, 12, div_notes="15% on dividends from 2008–2011 profits.")

PRAVO_BY = "https://pravo.by/document/?guid=3871&p0=hk0900071"
R += V(
    "BY",
    20,
    [10],
    zero=True,
    url=PRAVO_BY,
    src="Tax Code of the Republic of Belarus (Special Part), art. 122 – pravo.by",
    applies="Agricultural/food products, children's goods, medicines",
    notes="25% increased rate on telecommunication services (secondary source).",
)
R += C(
    "BY",
    20,
    url=PRAVO_BY,
    src="Tax Code of the Republic of Belarus, art. 184 – pravo.by",
    notes="25% where the cumulative tax base exceeds BYN 25m (from 2024); banks and insurers 25%; microfinance 30%.",
)
R += P(
    "BY",
    30,
    url="https://nalog.gov.by/news/34207/",
    src="Ministry of Taxes and Duties (nalog.gov.by) – income tax rates 2026",
    notes="2026: 13% up to BYN 350,000; 25% to BYN 600,000; 30% above.",
)
R += W("BY", 25, 10, 15, url=PRAVO_BY, src="Tax Code of the Republic of Belarus, arts. 189 and 192 – pravo.by")

t = Pwc("GE", "georgia")
R += t.vat(18, thr=100_000, cur="GEL", notes="Non-resident digital-service suppliers register from 1 Oct 2021.")
R += t.cit(
    15,
    desc="Flat CIT on distributed profits (Estonian model since 2017); 20% for banks, credit unions, microfinance and loan providers",
)
R += t.pit(20, desc="Flat personal income tax rate")
R += t.wht(5, 5, 5, notes="10% on services rendered in Georgia; 15% to black-listed jurisdictions.")

t = Pwc("AM", "armenia")
R += t.vat(
    20,
    zero=True,
    notes="No reduced rate. SMEs with turnover up to AMD 115m may pay turnover tax instead of VAT (not a formal registration threshold).",
)
R += t.cit(18, notes="Micro-entrepreneurs (≤ AMD 24m) exempt; turnover tax replaces CIT for SMEs.")
R += t.pit(20, desc="Flat personal income tax rate")
R += t.wht(5, 10, 10, notes="20% on other services; 5% on insurance, reinsurance and transport.")

t = Pwc("AZ", "azerbaijan")
R += t.vat(18, zero=True, thr=200_000, cur="AZN", thr_notes="Cumulative taxable turnover in any 12 consecutive months.")
R += t.cit(
    20, notes="Simplified tax of 2% of gross revenue for turnover ≤ AZN 200,000; PSA/HGA regimes for oil and gas."
)
R += t.pit(
    25,
    notes="Oil/gas and public sector: 14% to AZN 2,500/month, 25% above. Non-oil private sector: 0% to AZN 8,000/month and 14% above under a grace regime from 2019.",
)
R += t.wht(5, 10, 14, roy_notes="14% on royalties and rent; 10% on other income.")

t = Pwc("LI", "liechtenstein")
R += t.vat(
    8.1,
    [2.6, 3.8],
    frm="2024-01-01",
    thr=100_000,
    cur="CHF",
    notes="Follows the Swiss VAT Act under the customs union; 3.8% applies to accommodation.",
)
R += t.hist("vat", "standard", 7.7, None, "2023-12-31", "Standard VAT rate to 31 Dec 2023")
R += t.cit(12.5, notes="Minimum corporate tax CHF 1,800 (creditable).")
R += t.pit(22.4, desc="Maximum combined national (8%) and communal (150–180% surcharge) personal income tax rate")
R += t.wht(0, 0, 0, notes="Liechtenstein levies no withholding taxes.")
R += t.p2(
    "FL GloBE Act: 15% QDMTT and IIR for groups ≥ EUR 750m (in force 1 Jan 2024; effective date not restated on the PwC page).",
    frm="2024-01-01",
)

MC_SRC = "MonEntreprise.gouv.mc (Gouvernement Princier)"
R += V(
    "MC",
    20,
    [10, 5.5],
    url="https://monentreprise.gouv.mc/thematiques/obligations-legales-et-fiscalite/fiscalite/la-taxe-sur-la-valeur-ajoutee-tva/tva",
    src=MC_SRC,
    notes="French VAT applied under the 1963 Franco-Monegasque customs convention (same base and rates as France).",
)
R += C(
    "MC",
    25,
    frm="2022-01-01",
    url="https://monentreprise.gouv.mc/Fiscalite/Autres-impots-et-taxes/Impots-sur-le-benefice/Impot-sur-les-benefices",
    src=MC_SRC,
    desc="Impôt sur les bénéfices (ISB) — applies only to enterprises realising more than 25% of turnover outside Monaco",
    notes="33.33% to 2018; 31% (2019), 28% (2020), 26.5% (2021), 25% from fiscal years opened 1 Jan 2022.",
)
R += P(
    "MC",
    0,
    url="https://monentreprise.gouv.mc/thematiques/obligations-legales-et-fiscalite/fiscalite/introduction-a-la-fiscalite-monegasque/la-fiscalite-monegasque",
    src=MC_SRC,
    desc="No personal income tax for Monegasque residents (French nationals remain taxable in France under the 1963 convention)",
)
R += P2(
    "MC",
    "Not adopted: draft law no. 1129 (28 Jul 2026) to introduce a QDMTT is before the Conseil National; no GloBE rules in force.",
    adopted=False,
    url="https://oecdpillars.com/pillar-two-developments-tracker-2026/",
    src="OECD Pillars tracker (oecdpillars.com)",
)

AD_PORTAL = "Portal Jurídic d'Andorra"
R += V(
    "AD",
    4.5,
    [1, 2.5],
    higher=[9.5],
    zero=True,
    thr=40_000,
    cur="EUR",
    frm="2013-01-01",
    url="https://www.portaljuridicandorra.ad/L2012011_3",
    src=f"Llei 11/2012 de l'impost general indirecte – {AD_PORTAL}",
    label="IGI",
    desc="Impost General Indirecte (VAT-type) general rate",
    applies="1%: necessities; 2.5%: transport, culture, ski; 9.5%: banking and financial services",
)
R += C(
    "AD",
    10,
    url="https://www.portaljuridicandorra.ad/L2010095",
    src=f"Llei 95/2010 de l'impost sobre societats, art. 41 – {AD_PORTAL}",
    notes="New businesses: 5% on the first EUR 50,000 for three years.",
)
R += P(
    "AD",
    10,
    url="https://www.portaljuridicandorra.ad/L2014005",
    src=f"Llei 5/2014 de l'IRPF, art. 43 – {AD_PORTAL}",
    notes="Effective progression via reductions: 0% to EUR 24,000; 5% to EUR 40,000; 10% above.",
)
R += W(
    "AD",
    0,
    0,
    5,
    url="https://www.govern.ad/ca/tematiques/impostos-taxes-i-duana/impostos-en-andorra/impost-sobre-la-renda-dels-no-residents-fiscals-a-andorra",
    src="Govern d'Andorra – Impost sobre la renda dels no-residents (IRNR)",
    notes="Dividends and interest to non-residents are not taxed; royalties 5%; general IRNR 10% on other income.",
)

HLB_SM = "https://www.hlbsanmarino.com/legge-12-novembre-2025-nr-141-modifiche-alla-legge-16-dicembre-2013-n-166-imposta-generale-sui-redditi-e-successive-modifiche/"
R += NOVAT(
    "SM",
    "No VAT; single-stage import tax (imposta monofase) at 17% ordinary rate on goods entering the local economy",
    url="https://www.studioallievi.com/imposte-a-san-marino/",
    src="Studio Allievi – Imposte a San Marino (secondary)",
)
R += V(
    "SM",
    17,
    tax_type="sales_use",
    url="https://www.studioallievi.com/imposte-a-san-marino/",
    src="Studio Allievi – Imposte a San Marino (secondary)",
    desc="Imposta monofase (single-stage import tax) ordinary rate",
    notes="Non-deductible; refundable on re-export. finanze.sm blocks automated clients.",
)
R += C(
    "SM",
    18,
    frm="2026-01-01",
    url=HLB_SM,
    src="HLB San Marino – Legge 141/2025 (IGR amendments) (secondary)",
    desc="IGR for legal persons — 18% for tax periods 2026–2030 (ordinary rate 17%)",
)
R += HIST(
    "SM",
    "corporate_income",
    "headline",
    17,
    None,
    "2025-12-31",
    url=HLB_SM,
    src="HLB San Marino – Legge 141/2025 (secondary)",
    desc="IGR ordinary rate for legal persons to 2025",
)
R += P(
    "SM",
    35,
    url=HLB_SM,
    src="HLB San Marino – Legge 141/2025 art. 51 (secondary)",
    notes="Brackets 9%–35% (35% above EUR 80,000) per Law 141/2025.",
)
R += W(
    "SM",
    5,
    13,
    20,
    url="https://www.camcom.sm/wp-content/uploads/2024/12/RSM-Cam-Com-Webinar-28-novembre-2024.pdf",
    src="Camera di Commercio di San Marino – fiscalità internazionale (Nov 2024) (secondary)",
    div_notes="5% final WHT on dividends to non-resident individuals; corporate recipients exempt on declaration.",
)
R += P2(
    "SM",
    "No GloBE rules; San Marino ratified the Pillar Two Subject-to-Tax-Rule multilateral convention (instrument deposited 11 Dec 2025).",
    adopted=False,
    url="https://oecdpillars.com/pillar-two-developments-tracker-2026/",
    src="OECD Pillars tracker (oecdpillars.com)",
)

TAKS = "TAKS (Faroese Tax Authority)"
R += V(
    "FO",
    25,
    thr=50_000,
    cur="DKK",
    url="https://www.taks.fo/en/business/vat/general-about-vat",
    src=TAKS,
    label="VAT (MVG)",
    notes="Single-rate VAT; exemptions for culture, sport, passenger transport and financial services.",
)
R += C(
    "FO",
    18,
    url="https://en.wikipedia.org/wiki/Taxation_in_the_Faroe_Islands",
    src="Taxation in the Faroe Islands (Wikipedia; corroborated by fas.fo) (secondary)",
    notes="No TAKS English page states the company tax rate; verify before reliance.",
)
R += P(
    "FO",
    51.5,
    url="https://www.taks.fo/fo/borgari/gjold-og-agodar/landsskattatalva/",
    src=TAKS,
    desc="Top combined national (30% above DKK 600,000) and highest municipal (21.5%) rate, 2026",
)
R += W(
    "FO",
    35,
    0,
    25,
    url="https://www.taks.fo/en/business/tax/dividend-tax-refunds",
    src=TAKS,
    div_notes="TAKS: 'usually 35%', refundable down to treaty rates; fas.fo states 18% — conflict flagged.",
    int_notes="No WHT on interest.",
)

GI_URL = "https://www.gibraltar.gov.gi/income-tax-office"
t = Pwc("GI", "gibraltar")
R += t.novat(
    "No VAT; a Transaction Tax on imported/manufactured goods is being introduced under the UK–EU Agreement (17% floor aligned to the lowest EU standard rate; 15%/16% transitional; 5% reduced; 0% super-reduced)"
)
R += t.cit(
    15,
    frm="2024-07-01",
    notes="20% for utility/energy providers and companies abusing a dominant position. Territorial basis.",
)
R += t.hist(
    "corporate_income",
    "headline",
    12.5,
    None,
    "2024-06-30",
    "Standard corporation tax rate to 30 Jun 2024",
    page="corporate/taxes-on-corporate-income",
)
R += t.pit(
    39,
    desc="Top rate under the Allowances Based System (Gross Income Based System top bracket 28%; maximum effective rate 25%)",
)
R += t.wht(0, 0, 0, notes="No WHT other than 25% on construction subcontractors without an exemption certificate.")
R += t.p2(
    "Global Minimum Tax Act 2024 (enacted 18 Dec 2024): 15% QDMTT for fiscal years beginning on/after 31 Dec 2023 and IIR for fiscal years beginning on/after 31 Dec 2024; no UTPR.",
    frm="2023-12-31",
)

t = Pwc("IM", "isle-of-man")
R += t.vat(
    20,
    [5],
    zero=True,
    notes="Single VAT area with the UK; 0% on food, books, public transport; 5% on domestic property repairs.",
)
R += t.cit(
    0,
    desc="Standard corporate income tax rate 0%; 10% on banking business and large Manx retailers; 20% on Manx land/property income and petroleum extraction",
)
R += t.pit(21, notes="10% standard rate band, 21% higher rate; tax cap IMP 220,000 (2026/27).")
R += t.wht(0, 0, 0, notes="WHT generally not required; 20% on rent from Manx property.")
R += t.p2(
    "No QDMTT/IIR recorded on the PwC page (Feb 2026); a 15% rate applied for 2024/25 to in-scope banks and large retailers otherwise exposed to a top-up tax elsewhere — verify current status.",
    adopted=False,
)

JE_CO = "https://www.gov.je/TaxesMoney/IncomeTax/Companies/Pages/default.aspx"
t = Pwc("JE", "jersey")
R += t.vat(
    5,
    tax_type="gst",
    zero=True,
    thr=300_000,
    cur="GBP",
    notes="Offshore retailers selling more than GBP 300,000 to Jersey consumers must register (from 1 Jul 2023).",
)
R += t.cit(
    0,
    desc="Zero/ten regime: 0% standard; 10% financial services companies; 20% utilities, Jersey property income, large corporate retailers and cannabis businesses",
)
R += t.pit(
    20,
    notes="Standard 20%; alternative marginal calculation at 26% above exemption thresholds (lower liability applies).",
)
R += t.wht(0, 0, 0, notes="No WHT on dividends, interest or royalties paid to non-residents.")
R += t.p2(
    "Multinational Corporate Income Tax (MCIT) at 15% plus an IIR for in-scope groups ≥ EUR 750m, fiscal years starting on/after 1 Jan 2025; no UTPR.",
    frm="2025-01-01",
)

GG_CO = "https://www.gov.gg/companytax"
t = Pwc("GG", "guernsey")
R += t.novat("No VAT or GST; a GST from 2027 was proposed in the 2025 Budget")
R += t.cit(
    0,
    desc="Standard company tax rate 0%; 10% banking, insurance, fund administration, fiduciary and investment management; 20% Guernsey property income, utilities, large retail, hydrocarbons and cannabis",
)
R += t.pit(20, notes="Caps: GBP 160,000 (non-Guernsey income) / GBP 320,000 (worldwide).")
R += t.wht(0, 0, 0, notes="Guernsey levies no withholding taxes on payments to non-residents.")
R += t.p2(
    "Qualified Domestic Top-up Tax and Multinational Top-up Tax (IIR) at 15% for groups ≥ EUR 750m, effective 1 Jan 2025.",
    frm="2025-01-01",
)

t = Pwc("GL", "greenland")
R += t.novat("No VAT in Greenland (import duties and excise only)")
R += t.cit(
    25,
    frm="2020-01-01",
    notes="Effective 26.5% including the 6% surcharge where tax is not prepaid; licence holders exempt from the surcharge.",
)
R += t.pit(44, desc="Top combined municipal, national and joint tax rate (36–44% depending on municipality)")
R += t.wht(
    36,
    25,
    30,
    div_notes="36–44% depending on municipality (24% if chapter 3b elected).",
    int_notes="25% from 1 Jan 2023 where the recipient is not subject to at least 15% tax.",
)

# ----------------------------------------------------------------------------------------------------------------
# Middle East
# ----------------------------------------------------------------------------------------------------------------
t = Pwc("QA", "qatar")
R += t.novat(
    "No VAT or sales tax; VAT under the GCC framework (expected at 5%) has not been introduced. Excise tax since 1 Jan 2019."
)
R += t.cit(
    10,
    notes="Not less than 35% for petroleum operations; entities wholly owned by Qatari/GCC nationals are outside CIT.",
)
R += t.pit(
    0, desc="No personal income tax on employment income (self-employed may be taxed on Qatar-source business income)"
)
R += t.wht(0, 5, 5, notes="Unified 5% WHT on services used or benefited in Qatar; dividends not subject to WHT.")

t = Pwc("KW", "kuwait")
R += t.novat(
    "No VAT; the GCC VAT framework agreement remains under parliamentary discussion. GCC unified customs tariff 5%."
)
R += t.cit(
    15,
    desc="Flat 15% CIT on foreign corporate bodies (Kuwaiti/GCC-owned companies are outside scope; Zakat 1% and KFAS 1% apply to Kuwaiti shareholding companies)",
)
R += t.pit(0, desc="No personal income tax")
R += t.wht(
    0,
    0,
    0,
    notes="Kuwaiti tax law imposes no WHT; 5% retention from contract payments until a tax clearance certificate is obtained.",
)
R += t.p2(
    "Decree-Law No. 157 of 2024 (30 Dec 2024): 15% Domestic Minimum Top-up Tax for MNE groups ≥ EUR 750m for financial years from 1 Jan 2025; Executive Regulations (Ministerial Resolution 55/2025, 30 Jun 2025). In-scope MNEs are removed from CIT, Zakat and NLST.",
    frm="2025-01-01",
)

t = Pwc("BH", "bahrain")
R += t.vat(
    10,
    frm="2022-01-01",
    thr=37_500,
    cur="BHD",
    notes="GCC-framework VAT introduced 1 Jan 2019 at 5% and doubled to 10% on 1 Jan 2022; voluntary registration from BHD 18,750.",
)
R += t.hist("vat", "standard", 5, "2019-01-01", "2021-12-31", "VAT standard rate 2019–2021")
R += t.cit(0, desc="No general corporate income tax (46% on oil and gas extraction/refining profits)")
R += t.pit(0, desc="No personal income tax (social insurance contributions only)")
R += t.wht(0, 0, 0, notes="No WHT on dividends, interest or royalties.")
R += t.p2(
    "Decree-Law No. 11 of 2024: 15% Domestic Minimum Top-up Tax for MNE groups ≥ EUR 750m, financial years starting on/after 1 Jan 2025; no IIR/UTPR. Safe harbours and de-minimis exclusions available.",
    frm="2025-01-01",
)

t = Pwc("OM", "oman")
R += t.vat(
    5,
    frm="2021-04-16",
    zero=True,
    thr=38_500,
    cur="OMR",
    notes="Royal Decree 121/2020; zero-rating for exports, international transport and basic food; voluntary registration from OMR 19,250.",
)
R += t.cit(
    15,
    notes="3% for Omani SMEs (capital ≤ OMR 60,000, income ≤ OMR 150,000, ≤ 25 employees); petroleum income tax 55%.",
)
R += t.pit(0, to="2027-12-31", desc="No personal income tax until 31 Dec 2027")
R += t.pit(
    5,
    frm="2028-01-01",
    desc="Personal income tax at 5% on annual income above OMR 42,000 — Royal Decree 56/2025, effective 1 Jan 2028 (executive regulations pending)",
)
R += t.wht(
    0,
    0,
    10,
    div_notes="WHT on dividends and interest suspended by Royal Directive since 2023.",
    roy_notes="10% on royalties, R&D, software licences, management fees and services to foreign companies without a PE.",
)
R += t.p2(
    "Royal Decree 70/2024 (31 Dec 2024): Income Inclusion Rule (top-up tax) for MNE groups ≥ EUR 750m from 1 Jan 2025; no domestic minimum top-up tax; executive regulations pending.",
    frm="2025-01-01",
)

t = Pwc("JO", "jordan")
R += t.vat(
    16,
    zero=True,
    desc="General sales tax (VAT-type) standard rate",
    notes="Zero rate on exports, free zones and development areas; special excise-type rates on certain items.",
)
R += t.cit(
    20,
    desc="CIT for general activities (24% telecoms, insurance, financial intermediation, electricity and mining; 35% banks); national contribution tax of 1–7% by sector on top",
)
R += t.pit(30, notes="5–25% brackets; 30% above JOD 1m; plus 1% national contribution tax above JOD 200,000.")
R += t.wht(
    0,
    7,
    None,
    div_notes="Dividends paid to resident and non-resident companies are exempt from WHT.",
    int_notes="7% on bank interest to legal entities (5% individuals), final for non-residents.",
    notes="10% WHT plus national contribution tax on imported services; no separate royalty rate stated.",
)

t = Pwc("LB", "lebanon")
R += t.vat(
    11, zero=True, thr=5_000_000_000, cur="LBP", thr_notes="Raised from LBP 100m to LBP 5bn by the 2024 Budget Law."
)
R += t.cit(17, notes="Deemed-profit taxpayers moved to the lump-sum method from 1 Jan 2026.")
R += t.pit(25, desc="Top payroll tax / business income tax rate for individuals")
R += t.wht(
    10,
    10,
    8.5,
    roy_notes="Non-resident WHT 8.5% on services (3.4% on goods) from 1 Apr 2024.",
    int_notes="7% on Lebanese bank deposits and treasury bonds.",
)

t = Pwc("IQ", "iraq")
R += t.novat(
    "No VAT; selective sales taxes apply (300% alcohol and tobacco, 20% mobile recharge cards and internet, 15% travel tickets and cars, 10% luxury hotels and restaurants)"
)
R += t.cit(15, notes="35% for oil and gas sector contracts; Kurdistan Region administers its own regime.")
R += t.pit(15, notes="3%/5%/10%/15% brackets; 15% above IQD 1,000,000.")
R += t.wht(
    0,
    15,
    None,
    div_notes="Dividends are not subject to WHT.",
    notes="Royalties have no specific statutory WHT rate (Kurdistan: 15% on a deemed 75% profit).",
)

HKTDC_IR = "https://beltandroad.hktdc.com/field_collection_item/10569"
R += V(
    "IR",
    10,
    zero=True,
    url="https://www.vatupdate.com/2026/01/06/iranian-lawmakers-reject-vat-hike-keep-rate-at-10-for-2026-budget/",
    src="VATupdate – Iran keeps VAT at 10% for the 1405 budget (Jan 2026) (secondary)",
    notes="VAT Act 2021; Parliament rejected a proposed increase to 12% in Jan 2026. Government pages unreachable from this network.",
)
R += C(
    "IR",
    25,
    url=HKTDC_IR,
    src="HKTDC Belt and Road Portal – Iran tax (citing INTA; reviewed 2020) (secondary)",
    notes="22.5% for listed companies. Dated source; verify against the Direct Taxes Act.",
)
R += W(
    "IR",
    0,
    5,
    7.5,
    url=HKTDC_IR,
    src="HKTDC Belt and Road Portal – Iran tax (citing INTA; reviewed 2020) (secondary)",
    roy_notes="Deemed-profit basis; 5% where the payer is a manufacturer, mining company or government body.",
)
R += P2(
    "IR",
    "Not adopted; Iran is not a member of the OECD/G20 Inclusive Framework.",
    adopted=False,
    url=IF_URL,
    src="OECD – Inclusive Framework on BEPS composition",
)

R += NOSRC(
    "SY",
    url="https://english.noonpost.com/p/syrias-new-tax-system-a-new-era-of",
    src="No reliable public source (Noon Post article on the 2025–26 reform, secondary)",
    notes="Tax system in transition: 2025 draft income-tax and sales-tax laws (CIT 10%/15%, PIT top 8%, sales tax 5% general) were slated for 1 Jan 2026 but no enactment evidence was found by Aug 2026; pre-reform rates (Law 24/2003, CIT 10–28%) rest on consultancy blogs only.",
)

MOORE_YE = "https://www.moore-global.com/services/tax/international-corporate-tax/yemen/"
R += V(
    "YE",
    5,
    higher=[10],
    zero=True,
    thr=50_000_000,
    cur="YER",
    url="https://www.grantthornton.global/en/insights/indirect-tax-guide/indirect-tax---Yemen/",
    src="Grant Thornton – Indirect tax guide, Yemen (2022) (secondary)",
    desc="General Sales Tax (Law 19/2001) standard rate",
    notes="10% on telecommunications/mobile services. De facto split administration (Sana'a/Aden) not reflected in sources.",
)
R += C(
    "YE",
    20,
    url=MOORE_YE,
    src="Moore Global – Yemen tax guide (Apr 2024) (secondary)",
    notes="Income Tax Law 17/2010: 50% mobile operators; 35% telecoms, oil/gas/minerals and cigarette manufacturers; 15% investment-law projects.",
)
R += P(
    "YE",
    15,
    url=MOORE_YE,
    src="Moore Global – Yemen tax guide (Apr 2024) (secondary)",
    notes="Residents: 10% to YER 240,000, 15% above; non-residents flat 20%.",
)
R += W(
    "YE",
    0,
    10,
    10,
    url=MOORE_YE,
    src="Moore Global – Yemen tax guide (Apr 2024) (secondary)",
    int_notes="0% to central-bank-approved foreign banks.",
)

t = Pwc("PS", "palestinian-territories")
R += t.vat(16, notes="Input VAT on purchases for local sales or exports is refundable; imports 16%.")
R += t.cit(
    15, notes="20% for telecommunication companies and franchise/monopoly operators (Income Tax Law No. 8 of 2011)."
)
R += t.pit(15, notes="5% to ILS 75,000; 10% to ILS 150,000; 15% above.")
R += t.wht(
    0,
    10,
    10,
    div_notes="Dividends currently exempt.",
    notes="10% final withholding on payments to non-residents subject to tax.",
)

# ----------------------------------------------------------------------------------------------------------------
# Asia
# ----------------------------------------------------------------------------------------------------------------
t = Pwc("PK", "pakistan")
R += t.vat(
    18,
    desc="Federal sales tax on goods (VAT-type) standard rate",
    notes="Provincial/ICT sales tax on services 15–16% with reduced rates for specified services; additional tax on commercial imports.",
)
R += t.cit(
    29,
    notes="Banking companies 39%; small companies 20%; super tax of up to 10% on high incomes (upheld by the Federal Constitutional Court); minimum turnover tax 1.25%; alternate corporate tax 17%.",
)
R += t.pit(
    35, desc="Top rate for salaried individuals (non-salaried individuals/AOPs 45% plus 10% surcharge above PKR 10m)"
)
R += t.wht(15, 10, 15, notes="Rates doubled for persons not on the Active Taxpayer List.")

t = Pwc("BD", "bangladesh")
R += t.vat(
    15,
    [1.5, 2, 2.4, 4.5, 5, 7.5, 10],
    zero=True,
    thr=5_000_000,
    cur="BDT",
    notes="Turnover tax of 4% for BDT 3m–5m; supplementary duty of 10–500% on specified goods.",
)
R += t.cit(
    27.5,
    desc="Headline rate for non-publicly-traded companies, AY 2026/27–2030/31 (25% where all transactions are banked; listed companies 20–25%; banks 37.5–40%; tobacco and mobile operators 45%)",
)
R += t.pit(30, to="2027-06-30", desc="Top marginal PIT rate for FY 2025/26 and 2026/27")
R += t.pit(35, frm="2027-07-01", desc="Top marginal PIT rate from FY 2027/28 (new 35% bracket)")
R += t.wht(
    20,
    20,
    20,
    div_notes="20% to companies, funds and trusts; 25% to other persons.",
    int_notes="Non-treaty summary shows 20%; the detail table shows 10% — inconsistency flagged.",
)

IRD_LK = "Inland Revenue Department, Sri Lanka"
IRD_LK_PN = "https://www.ird.gov.lk/en/Lists/Latest%20News%20%20Notices/Attachments/666/PN_IT_2025-01_26032025_E.pdf"
R += V(
    "LK",
    18,
    frm="2024-01-01",
    zero=True,
    thr=60_000_000,
    cur="LKR",
    url="https://www.ird.gov.lk/en/Type%20of%20Taxes/SitePages/Value%20Added%20Tax%20(VAT).aspx",
    src=IRD_LK,
    thr_notes="LKR 15m per quarter or LKR 60m per 12 months.",
)
R += HIST(
    "LK",
    "vat",
    "standard",
    15,
    "2022-09-01",
    "2023-12-31",
    url="https://www.ird.gov.lk/en/Type%20of%20Taxes/SitePages/Value%20Added%20Tax%20(VAT).aspx",
    src=IRD_LK,
    desc="VAT standard rate Sep 2022 – Dec 2023",
)
R += C(
    "LK",
    30,
    url=IRD_LK_PN,
    src=f"{IRD_LK} – Notice PN/IT/2025-01 (Inland Revenue (Amendment) Act No. 2 of 2025)",
    notes="From 1 Apr 2025: 15% on service exports; 45% on betting/gaming, liquor and tobacco.",
)
R += P(
    "LK",
    36,
    frm="2025-04-01",
    url=IRD_LK_PN,
    src=f"{IRD_LK} – Notice PN/IT/2025-01",
    notes="Bands 6/18/24/30/36%; personal relief LKR 1.8m from Y/A 2025/26.",
)
R += W(
    "LK",
    15,
    10,
    14,
    url="https://www.ey.com/content/dam/ey-unified-site/ey-com/en-gl/technical/tax-guides/documents/ey-worldwide-corporate-tax-guide-10-2025.pdf",
    src="EY Worldwide Corporate Tax Guide 2025 – Sri Lanka (secondary)",
    int_notes="10% confirmed by IRD notice PN/IT/2025-01 (from 1 Apr 2025).",
)

IRD_NP = "Inland Revenue Department, Nepal"
R += V(
    "NP",
    13,
    zero=True,
    thr=5_000_000,
    cur="NPR",
    url="https://www.ey.com/content/dam/ey-unified-site/ey-com/en-gl/technical/tax-guides/documents/en-gl-vat-guide-2025.pdf",
    src="EY Worldwide VAT, GST and Sales Tax Guide 2025 – Nepal (secondary)",
    thr_notes="NPR 5m for goods; NPR 3m for services or mixed supplies.",
)
R += C(
    "NP",
    25,
    url="https://ird.gov.np/content/13608/income-tax-rate-for-the-entity-for/",
    src=f"{IRD_NP} – entity tax rates FY 2083/84",
    notes="30% for banks, financial institutions, insurers, telecoms/ISPs, tobacco, liquor and petroleum.",
)
R += P(
    "NP",
    29,
    url="https://ird.gov.np/content/13609/tax-rate-for-natural-persons-for-the/",
    src=f"{IRD_NP} – natural person tax rates FY 2083/84",
    notes="FY 2083/84 (from 17 Jul 2026): 1% social security tax to NPR 1m, then 10/20/27/29%.",
)
R += W(
    "NP",
    5,
    15,
    15,
    url="https://ird.gov.np/content/13607/s-o-2083-084-tax-cut-rate-for-payment/",
    src=f"{IRD_NP} – withholding (TDS) rates FY 2083/84",
    notes="General TDS rates (Income Tax Act 2058 ss. 87–89); contract payments to non-residents 5%.",
)

DRC_BT = "Department of Revenue and Customs, Bhutan"
BT_ITA = "https://www.drc.gov.bt/wp-content/uploads/2025/09/Income-Tax-Act-of-Bhutan-2025.pdf"
R += V(
    "BT",
    5,
    tax_type="gst",
    frm="2026-01-01",
    zero=True,
    thr=5_000_000,
    cur="BTN",
    url="https://www.drc.gov.bt/wp-content/uploads/2025/12/Consolidated-GST-Act-of-Bhutan-2020-and-amendment-thereof.pdf",
    src=f"{DRC_BT} – GST Act 2020 as amended 2025",
    notes="GST came into force 1 Jan 2026, replacing sales tax (Schedule X).",
)
R += C(
    "BT",
    22,
    frm="2026-01-01",
    url=BT_ITA,
    src=f"{DRC_BT} – Income Tax Act of Bhutan 2025, Schedule 1",
    notes="Income Tax Act 2025 in force 1 Jan 2026, repealing the Income Tax Act 2001 (30% CIT); trusts 30%.",
)
R += P(
    "BT",
    30,
    url=BT_ITA,
    src=f"{DRC_BT} – Income Tax Act of Bhutan 2025, Schedule 1",
    notes="Nil to Nu 300,000 rising to 30% above Nu 3.5m.",
)
R += W(
    "BT",
    5,
    5,
    5,
    url=BT_ITA,
    src=f"{DRC_BT} – Income Tax Act of Bhutan 2025, Schedule 1 para 7",
    notes="5% on investment income with source in Bhutan (10% on interest/dividends paid to individuals).",
)

MIRA = "Maldives Inland Revenue Authority (MIRA)"
R += V(
    "MV",
    8,
    tax_type="gst",
    frm="2023-01-01",
    zero=True,
    thr=1_000_000,
    cur="MVR",
    url="https://www.mira.gov.mv/Pages/View/gst",
    src=MIRA,
    desc="General sector GST (GGST) standard rate",
    notes="MIRA pages block automated clients (Cloudflare).",
)
R += [
    _row(
        "MV",
        "gst",
        "other",
        17,
        frm="2025-07-01",
        url="https://www.mira.gov.mv/Pages/View/gst",
        src=MIRA,
        desc="Tourism sector GST (TGST) rate",
    )
]
R += HIST(
    "MV",
    "gst",
    "other",
    16,
    "2023-01-01",
    "2025-06-30",
    url="https://www.mira.gov.mv/Pages/View/gst",
    src=MIRA,
    desc="Tourism sector GST (TGST) rate Jan 2023 – Jun 2025",
)
R += C(
    "MV",
    15,
    frm="2020-01-01",
    url="https://www.mira.gov.mv/Pages/View/ictcompanies",
    src=MIRA,
    notes="Income Tax Act (Law 25/2019): 0% on the first MVR 500,000; banks 25%.",
)
R += P(
    "MV",
    15,
    url="https://www.mira.gov.mv/Pages/View/ictindividuals",
    src=MIRA,
    notes="0% to MVR 720,000; 5.5/8/12%; 15% above MVR 2.4m.",
)
R += W(
    "MV",
    10,
    10,
    10,
    url="https://www.mira.gov.mv/Pages/View/nwtoverview",
    src=MIRA,
    notes="Non-resident withholding tax (s.55 Income Tax Act), final; 5% for non-resident contractors.",
)

t = Pwc("MM", "myanmar")
R += t.novat("No VAT; commercial tax applies (general rate 5%, range 0–15%)")
R += t.vat(
    5,
    [3, 1],
    higher=[15],
    tax_type="sales_use",
    zero=True,
    thr=50_000_000,
    cur="MMK",
    desc="Commercial tax general rate",
    applies="3%: construction, long-term leases, hotels and tourism; 1%: gold and jewellery; 15%: internet services",
)
R += t.cit(22, frm="2021-10-01", notes="Oil and gas E&P 25%; YSX-listed companies 17%.")
R += t.pit(25, notes="Progressive 1–25% for residents and non-resident foreigners; capital gains 10%.")
R += t.wht(0, 15, 15, notes="2.5% WHT on payments to non-residents for goods and services under contracts.")

t = Pwc("KH", "cambodia")
R += t.vat(
    10,
    zero=True,
    notes="Self-declaration regime applies from annual turnover of KHR 250m (small taxpayer); exports and supporting industries zero-rated.",
)
R += t.cit(20, notes="Oil, gas and minerals 30%; insurance 5% of gross premiums; minimum tax 1% of turnover.")
R += t.pit(20, desc="Top salary tax rate (monthly progressive 0–20%; non-residents flat 20%)")
R += t.wht(
    14,
    14,
    14,
    notes="14% on Cambodian-source income paid to non-residents (interest, dividends, royalties, services, rent).",
)

t = Pwc("LA", "lao-pdr")
R += t.vat(
    10,
    zero=True,
    notes="Registration is automatic on obtaining a TIN (except micro enterprises); exports of unprocessed natural resources remain taxable at 10%.",
)
R += t.cit(
    20,
    desc="Standard profit tax rate under Income Tax Law No. 88/NA (published 19 Jun 2026; previously 24%)",
    notes="LSX-listed 10%; tobacco/alcohol 22%; minerals 35%; casinos 30%; MNE-group members 15% minimum.",
)
R += t.pit(25, notes="Monthly progressive 0–25%; 25% above LAK 65m per month.")
R += t.wht(
    10,
    10,
    5,
    notes="Separate deemed-profit withholding (1.4–6% of turnover plus VAT) applies to unregistered foreign suppliers.",
)
R += t.p2(
    "Income Tax Law No. 88/NA: members of multinational groups meeting the OECD revenue criteria pay an additional domestic minimum profit tax so that the Lao rate is at least 15%; effective date not stated on the source."
)

t = Pwc("BN", "brunei-darussalam")
R += t.novat("No VAT or sales tax in Brunei Darussalam")
R += t.cit(
    18.5,
    notes="Only 25% of the first BND 100,000 and 50% of the next BND 150,000 are chargeable; MSMEs with turnover ≤ BND 1m exempt; petroleum 55%.",
)
R += t.pit(0, desc="No personal income tax")
R += t.wht(
    0,
    2.5,
    10,
    div_notes="No WHT on dividends.",
    roy_notes="10% on royalties, technical know-how, management fees and rent of movable property.",
)

t = Pwc("MN", "mongolia")
R += t.vat(
    10,
    thr=50_000_000,
    cur="MNT",
    thr_notes="Mandatory at MNT 50m in 12 months; voluntary from MNT 10m.",
    notes="Reverse-charge VAT on services from non-residents.",
)
R += t.cit(25, desc="Top rate of progressive CIT (10% on the first MNT 6bn; 25% above; 1% for revenue ≤ MNT 300m)")
R += t.pit(20, notes="10% to MNT 120m; 15% to MNT 180m; 20% above; non-residents flat 20%.")
R += t.wht(20, 20, 20, notes="5% on commercial bank bond interest and listed-security income.")

t = Pwc("KZ", "kazakhstan")
R += t.vat(
    16,
    [5, 10],
    frm="2026-01-01",
    zero=True,
    thr=43_250_000,
    cur="KZT",
    applies="5%: medicines and medical services (10% from 2027); 10%: domestic periodicals",
    thr_notes="10,000 MCI; 1 MCI = KZT 4,325 in 2026.",
    notes="New Tax Code raised the standard rate from 12% to 16% on 1 Jan 2026.",
)
R += t.hist("vat", "standard", 12, None, "2025-12-31", "VAT standard rate to 31 Dec 2025")
R += t.cit(
    20, notes="25% banks and gambling; 3% agricultural producers; social-sphere entities 5% (2026) / 10% (2027+)."
)
R += t.pit(15, notes="2026: 10% up to 8,500 MCI; 15% above.")
R += t.wht(
    15,
    15,
    15,
    int_notes="10% on interest on loans and debt securities.",
    notes="20% on services performed in Kazakhstan and on payments to black-listed jurisdictions.",
)

t = Pwc("UZ", "republic-of-uzbekistan")
R += t.vat(
    12, zero=True, thr=1_000_000_000, cur="UZS", notes="0% on domestically grown agricultural products from 1 Jan 2026."
)
R += t.cit(
    15,
    notes="20% for commercial banks, cement/polyethylene producers, mobile operators and shopping malls; 0% export rate abolished 1 Jan 2025.",
)
R += t.pit(12, desc="Flat personal income tax rate (non-residents 12% from 2025, previously 20%)")
R += t.wht(10, 10, 20, div_notes="5% for dividends on shares of joint-stock companies (to 31 Dec 2028).")

WB_KG = "https://openknowledge.worldbank.org/server/api/core/bitstreams/3fcb0a01-69c8-4bad-a03c-818df808d8e5/content"
R += V(
    "KG",
    12,
    zero=True,
    thr=30_000_000,
    cur="KGS",
    frm="2022-01-01",
    url=WB_KG,
    src="World Bank – Review of the Tax System in the Kyrgyz Republic (2024) (secondary)",
    thr_notes="Raised from KGS 8m under the 2022 Tax Code.",
)
R += C(
    "KG",
    10,
    url=WB_KG,
    src="World Bank – Review of the Tax System in the Kyrgyz Republic (2024) (secondary)",
    notes="Preferential 0–2% regimes for the High Technology Park, free economic zones and priority sectors.",
)
R += P(
    "KG",
    10,
    url=WB_KG,
    src="World Bank – Review of the Tax System in the Kyrgyz Republic (2024) (secondary)",
    desc="Flat personal income tax rate",
)
R += W("KG", 10, 10, 10, url="https://gsl.org/en/taxes/kyrgyzstan/", src="GSL – Kyrgyzstan tax summary (secondary)")
R += P2(
    "KG",
    "Not adopted; not a member of the OECD/G20 Inclusive Framework.",
    adopted=False,
    url=IF_URL,
    src="OECD – Inclusive Framework on BEPS composition",
)

TJ_CODE = "https://andoz.tj/docs/kodex/Kodex_14_05_2025_Nav_ENG_en.pdf"
TJ_SRC = "Tax Code of the Republic of Tajikistan (English edition 14 May 2025) – Tax Committee (andoz.tj)"
R += V(
    "TJ",
    14,
    [7, 5],
    zero=True,
    thr=1_000_000,
    cur="TJS",
    frm="2024-01-01",
    url=TJ_CODE,
    src=TJ_SRC,
    desc="Effective standard VAT rate 2024–2026 (nominal 15%, art. 264; 13% from 2027 under transitional art. 397)",
    applies="7%: construction, hotels, catering; 5%: domestic agricultural products, training, sanatorium services (no input credit)",
)
R += C(
    "TJ",
    18,
    frm="2026-01-01",
    url=TJ_CODE,
    src=TJ_SRC,
    notes="Art. 183(4): 18% general; 20% financial/credit organisations and mobile operators; production of goods 13% to 2025 and 18% from 2026.",
)
R += P(
    "TJ",
    12,
    url=TJ_CODE,
    src=TJ_SRC,
    desc="Flat rate on resident employment income (15% on other income; 20% for non-resident individuals)",
)
R += W("TJ", 12, 12, 15, url=TJ_CODE, src=TJ_SRC, div_notes="12% per Law No. 2159 of 15 Apr 2025.")

DTT_TM = "https://web.archive.org/web/20220628135700id_/https://www2.deloitte.com/content/dam/Deloitte/global/Documents/Tax/dttl-tax-turkmenistanhighlights-2021.pdf"
TM_SRC = "Deloitte International Tax – Turkmenistan Highlights 2021 (archived; corroborated by GSL 2025) (secondary)"
R += V(
    "TM",
    15,
    zero=True,
    url=DTT_TM,
    src=TM_SRC,
    notes="Zero rate for exports (except oil and gas), international transport and petroleum operations. No current primary source reachable.",
)
R += C(
    "TM",
    8,
    url=DTT_TM,
    src=TM_SRC,
    desc="CIT for resident non-state entities (20% for state-controlled entities, branches/PEs and Petroleum Law entities; 2% for sole proprietors/SMEs)",
)
R += P("TM", 10, url=DTT_TM, src=TM_SRC, desc="Flat personal income tax rate")
R += W("TM", 15, 15, 15, url=DTT_TM, src=TM_SRC, notes="10% to non-resident individuals; 6% on sea/air freight.")
R += P2(
    "TM",
    "Not adopted; not a member of the OECD/G20 Inclusive Framework.",
    adopted=False,
    url=IF_URL,
    src="OECD – Inclusive Framework on BEPS composition",
)

BRIT_AF = "https://www.britacom.org/zt/BRPolicies/Afghanistan/Excel/ExcelFile/202508/P020250827480741911328.pdf"
R += V(
    "AF",
    10,
    zero=True,
    thr=150_000_000,
    cur="AFN",
    url=BRIT_AF,
    src="BRITACOM – Current Tax System, Afghanistan (2025) (secondary)",
    notes="VAT Law at 10%; commencement disputed — sources conflict and the ARD has published no commencement notice; Business Receipts Tax (2%/4%/5%) reported as applied in practice.",
)
R += C(
    "AF",
    20,
    url=BRIT_AF,
    src="BRITACOM – Current Tax System, Afghanistan (2025) (secondary)",
    notes="Uniform 20% under the Income Tax Law 2009.",
)
R += P(
    "AF",
    20,
    url=BRIT_AF,
    src="BRITACOM – Current Tax System, Afghanistan (2025) (secondary)",
    notes="Monthly brackets 0%/10%/20%; 20% above AFN 100,000 per month.",
)
R += W(
    "AF",
    20,
    20,
    20,
    url="https://www.lloydsbanktrade.com/en/market-potential/afghanistan/taxes",
    src="Lloyds Bank International Trade Portal – Afghanistan taxes (citing ARD) (secondary)",
)
R += P2(
    "AF",
    "Not adopted; not a member of the OECD/G20 Inclusive Framework.",
    adopted=False,
    url=IF_URL,
    src="OECD – Inclusive Framework on BEPS composition",
)

t = Pwc("MO", "macau-sar")
R += t.novat("No VAT regime in Macau SAR; consumption (excise) tax on tobacco and spirits only")
R += t.cit(
    12,
    desc="Complementary tax top rate (3–9% up to MOP 300,000; 12% above)",
    notes="Territorial system from 1 Jan 2026 except for MNE-group constituent entities; tax-free threshold MOP 600,000 for 2025 income (2026 Budget).",
)
R += t.pit(12, desc="Professional tax top rate (12% above MOP 424,000; first MOP 144,000 exempt)")
R += t.wht(0, 0, 0, notes="The Complementary Tax Law contains no withholding on payments to overseas companies.")

ATTL = "Autoridade Tributária Timor-Leste"
R += NOVAT(
    "TL",
    "No VAT (introduction targeted for 2027); sales tax of 2.5% on imported goods (0% on domestic sales) and services tax of 5% apply",
    url="https://attl.gov.tl/services-tax/",
    src=ATTL,
)
R += V(
    "TL",
    2.5,
    higher=[5],
    tax_type="sales_use",
    frm="2008-07-01",
    url="https://attl.gov.tl/services-tax/",
    src=ATTL,
    desc="Sales tax on imported goods (Taxes and Duties Act 2008, Schedule III; 0% on domestic sales)",
    notes="The 5% row is the services tax on hotel, restaurant and telecommunication services.",
)
R += C(
    "TL",
    10,
    frm="2008-01-01",
    url="https://attl.gov.tl/annual-income-tax-return-guidelines/",
    src=ATTL,
    notes="Petroleum contractors taxed under a separate regime.",
)
R += P(
    "TL",
    10,
    url="https://attl.gov.tl/annual-income-tax-return-guidelines/",
    src=ATTL,
    notes="0% on the first USD 6,000; 10% above (wage income tax 0% on the first USD 500/month).",
)
R += W(
    "TL",
    10,
    10,
    10,
    url="https://attl.gov.tl/withholding-tax/",
    src=ATTL,
    notes="Single flat 10% on income paid to non-residents without a PE.",
)

# ----------------------------------------------------------------------------------------------------------------
# Oceania
# ----------------------------------------------------------------------------------------------------------------
t = Pwc("PG", "papua-new-guinea")
R += t.vat(10, tax_type="gst", zero=True, thr=250_000, cur="PGK")
R += t.cit(
    30,
    notes="Non-resident PEs also pay a 15% remittance tax; commercial banks 35% (43% above PGK 300m, reducing to 35% by 2034). Income Tax Act 2025 applies from 1 Jan 2026.",
)
R += t.pit(42, notes="30% from PGK 20,000; 35% from 33,000; 40% from 70,000; 42% above PGK 250,000.")
R += t.wht(
    15,
    15,
    10,
    frm="2026-01-01",
    roy_notes="10% to non-associates; 30% to associates.",
    notes="Non-resident tax regime under s.14 Income Tax Act 2025, effective 1 Jan 2026.",
)

FRCS = "Fiji Revenue and Customs Service (FRCS)"
FJ_BUDGET = "https://finance.gov.fj/wp-content/uploads/2023/09/2023-2024_Budget_Supplement_B5.pdf"
R += V(
    "FJ",
    12.5,
    frm="2025-08-01",
    zero=True,
    thr=100_000,
    cur="FJD",
    url="https://frcs.org.fj/our-services/taxation-section/non-individuals/reporting-and-paying-taxes/vat-guide/",
    src=f"{FRCS} – VAT guide",
    notes="Cut from 15% on 1 Aug 2025 (2025–26 Budget).",
)
R += HIST(
    "FJ",
    "vat",
    "standard",
    15,
    "2023-08-01",
    "2025-07-31",
    url="https://frcs.org.fj/our-services/taxation-section/non-individuals/reporting-and-paying-taxes/vat-guide/",
    src=f"{FRCS} – VAT guide",
    desc="VAT standard rate Aug 2023 – Jul 2025",
)
R += C(
    "FJ",
    25,
    frm="2023-08-01",
    url=FJ_BUDGET,
    src="Fiji Ministry of Finance – 2023-2024 Budget Supplement (tax policy measures)",
    notes="Raised from 20% on 1 Aug 2023; SPX-listed companies 15%.",
)
R += HIST(
    "FJ",
    "corporate_income",
    "headline",
    20,
    None,
    "2023-07-31",
    url=FJ_BUDGET,
    src="Fiji Ministry of Finance – 2023-2024 Budget Supplement",
    desc="Corporate tax rate to 31 Jul 2023",
)
R += P(
    "FJ",
    39,
    url=FJ_BUDGET,
    src="Fiji Ministry of Finance – 2023-2024 Budget Supplement (PAYE table)",
    notes="Social Responsibility Tax merged into PAYE bands from 1 Jan 2024; 39% top band.",
)
R += W(
    "FJ",
    0,
    10,
    15,
    url="https://www.frcs.org.fj/wp-content/uploads/2022/05/Income-Tax-Act-2015-Revised-1st-April-2022-updated-with-Legislative-H....pdf",
    src=f"{FRCS} – Income Tax Act 2015 (consolidated)",
    div_notes="Dividends are exempt income (no non-resident WHT).",
)

WS_REV = "Samoa Ministry of Revenue"
R += V(
    "WS",
    15,
    tax_type="gst",
    thr=130_000,
    cur="WST",
    url="https://revenue.gov.ws/inland-revenue-services/",
    src=WS_REV,
    desc="Value Added Goods and Services Tax (VAGST) standard rate",
)
R += C(
    "WS",
    27,
    frm="2007-01-01",
    url="https://revenue.gov.ws/rates/",
    src=f"{WS_REV} – rates",
    notes="Resident and non-resident companies 27% (reduced from 29% in 2007).",
)
R += P(
    "WS",
    27,
    url="https://revenue.gov.ws/rates/",
    src=f"{WS_REV} – rates",
    notes="Nil to WST 15,000; 20% to 25,000; 27% above (top rate cut from 29% in 2018).",
)
R += W(
    "WS",
    0,
    15,
    15,
    url="https://revenue.gov.ws/wp-content/uploads/2022/08/Income-Tax-Act-2012.pdf",
    src=f"{WS_REV} – Income Tax Act 2012, Schedules 1–2",
    div_notes="Dividends are outside the non-resident withholding tax.",
)

TO_REV = "Tonga Ministry of Revenue & Customs"
R += V(
    "TO",
    15,
    frm="2005-04-01",
    thr=100_000,
    cur="TOP",
    url="https://www.revenue.gov.to/consumption-tax-overview",
    src=TO_REV,
    desc="Consumption Tax (VAT-type) standard rate",
)
R += C(
    "TO",
    25,
    url="https://www.revenue.gov.to/company-partnership-corporative-society-trust",
    src=TO_REV,
    notes="Resident and non-resident companies 25%.",
)
R += P(
    "TO",
    25,
    url="https://www.revenue.gov.to/individual-employee",
    src=TO_REV,
    notes="From Jul 2021: nil to TOP 12,000; 10/15/20%; 25% above TOP 70,000.",
)
R += W(
    "TO",
    15,
    15,
    15,
    url="https://www.revenue.gov.to/non-residents-and-visitors",
    src=TO_REV,
    notes="Final withholding; rent 7.5%.",
)

VU_CIR = "Vanuatu Department of Customs & Inland Revenue"
VU_INV = "https://investvanuatu.vu/untapped-potential/low-tax-jurisdiction/"
R += V(
    "VU",
    15,
    frm="2018-01-01",
    zero=True,
    thr=4_000_000,
    cur="VUV",
    url="https://vanuatucustoms.gov.vu/taxes-and-licensing/taxes/value-added-tax-vat/introduction.html",
    src=VU_CIR,
    notes="Introduced 1998 at 12.5%; 15% from 2018.",
)
R += C(
    "VU",
    0,
    url=VU_INV,
    src="Vanuatu Foreign Investment Promotion Agency",
    desc="No corporate income tax; VAT, import duties, rent tax and business licence fees only",
)
R += P(
    "VU",
    0,
    url=VU_INV,
    src="Vanuatu Foreign Investment Promotion Agency",
    desc="No personal income tax (rent tax 15% on rental income above VUV 200,000 per half-year)",
)
R += W(
    "VU",
    0,
    0,
    0,
    url=VU_INV,
    src="Vanuatu Foreign Investment Promotion Agency",
    notes="No income tax regime and no withholding taxes.",
)

SB_IRD = "Solomon Islands Inland Revenue Division"
SB_GUIDE = "https://solomons.gov.sb/wp-content/uploads/2020/01/A-Guide-to-Income-Tax.pdf"
R += NOVAT(
    "SB",
    "No VAT in force (VAT Bill 2025 not commenced); goods tax of 15% on imports / 10% on local manufacture and sales tax of 10% on specified services apply",
    url="https://www.ird.gov.sb/goods-tax/",
    src=SB_IRD,
)
R += V(
    "SB",
    10,
    higher=[15],
    tax_type="sales_use",
    url="https://www.ird.gov.sb/goods-tax/",
    src=SB_IRD,
    desc="Sales tax on specified services (telecoms, restaurants, professional services, vehicle hire)",
    notes="The 15% row is the goods tax on imported goods (10% on locally manufactured goods).",
)
R += C(
    "SB",
    30,
    url=SB_GUIDE,
    src="Solomon Islands Government / IRD – A Guide to Income Tax (2020)",
    notes="Non-resident companies 35%.",
)
R += P(
    "SB",
    40,
    url=SB_GUIDE,
    src="Solomon Islands Government / IRD – A Guide to Income Tax (2020)",
    notes="11% to SBD 15,000; 23% to 30,000; 35% to 60,000; 40% above.",
)
R += W(
    "SB",
    30,
    15,
    15,
    url="https://www.ird.gov.sb/withholding-tax/",
    src=SB_IRD,
    notes="Professional services 20%; management services 35%.",
)

KI_TAX = "Kiribati Tax Division (MFED)"
R += V(
    "KI",
    12.5,
    zero=True,
    thr=100_000,
    cur="AUD",
    url="https://tax.gov.ki/wp-content/uploads/2025/05/Guidelines-Obligations-for-VAT-Registered-Businesses.pdf",
    src=f"{KI_TAX} – VAT guidelines",
    notes="Kiribati uses the Australian dollar.",
)
R += C(
    "KI",
    35,
    url="https://tax.gov.ki/wp-content/uploads/2025/05/Company-Tax-Return-and-Instructions-2023.pdf",
    src=f"{KI_TAX} – company tax return instructions",
    desc="Top tier of progressive company tax (20% to AUD 25,000; 30% to 50,000; 35% above)",
)
R += P(
    "KI",
    30,
    url="https://tax.gov.ki/wp-content/uploads/2025/05/Individual-income-tax-return-and-instructions-2023.pdf",
    src=f"{KI_TAX} – individual return instructions",
    notes="0% to AUD 5,000; 20/25%; 30% above AUD 30,000; non-residents flat 30%.",
)
R += W(
    "KI",
    30,
    30,
    30,
    url="https://mfed.gov.ki/sites/default/files/2025-06/International%20withholding%20tax%20on%2030_%20fact%20sheet.%20%281%29.pdf",
    src="Kiribati MFED – international payments withholding fact sheet",
    notes="Standard 30% on dividends, interest, royalties, natural resource payments and management charges.",
)

FSM_CODE = "http://www.fsmlaw.org/fsm/code/title54/T54_Ch01.htm"
R += NOVAT(
    "FM",
    "No VAT or GST; gross revenue tax (USD 80 on the first USD 10,000, 3% above) applies to businesses",
    url=FSM_CODE,
    src="FSM Code Title 54, Chapter 1 (Taxation) – fsmlaw.org",
)
R += V(
    "FM",
    3,
    tax_type="sales_use",
    url=FSM_CODE,
    src="FSM Code Title 54 §141 – fsmlaw.org",
    desc="Gross revenue tax (3% on gross revenues above USD 10,000)",
)
R += C(
    "FM",
    0,
    url=FSM_CODE,
    src="FSM Code Title 54 §141 – fsmlaw.org",
    desc="No corporate income tax; businesses pay the 3% gross revenue tax",
)
R += P(
    "FM",
    10,
    url=FSM_CODE,
    src="FSM Code Title 54 §121 – fsmlaw.org",
    desc="Wages and salaries tax top rate (6% on the first USD 11,000; 10% above)",
)

MH_ACT = "https://rmiparliament.org/cms/images/LEGISLATION/PRINCIPAL/1989/1989-0050/1989-0050_2.pdf"
R += NOVAT(
    "MH",
    "No VAT or GST; gross revenue tax (USD 80 on the first USD 10,000, 3% above) applies",
    url=MH_ACT,
    src="Income Tax Act 1989 (48 MIRC Ch. 1) – Nitijela",
)
R += V(
    "MH",
    3,
    tax_type="sales_use",
    url=MH_ACT,
    src="Income Tax Act 1989 §109 – Nitijela",
    desc="Gross revenue tax (3% on gross revenues above USD 10,000)",
)
R += C(
    "MH",
    0,
    url=MH_ACT,
    src="Income Tax Act 1989 §109 – Nitijela",
    desc="No corporate income tax; businesses pay the 3% gross revenue tax",
    notes="A 10% consumption tax and 20% business profits tax were proposed in the 2024 tax-reform papers.",
)
R += P(
    "MH",
    12,
    url=MH_ACT,
    src="Income Tax Act 1989 §103 – Nitijela",
    desc="Wages and salaries tax top rate (8% on the first USD 10,400; 12% above)",
    notes="Rates reaffirmed by P.L. 2026-68.",
)

PW_BRT = "Palau Bureau of Revenue & Taxation"
R += V(
    "PW",
    10,
    tax_type="gst",
    frm="2023-01-01",
    zero=True,
    thr=300_000,
    cur="USD",
    url="https://www.palaugov.pw/taxreform/pgst/",
    src=PW_BRT,
    desc="Palau Goods and Services Tax (PGST) standard rate",
    thr_notes="Voluntary registration from USD 50,000.",
)
R += C(
    "PW",
    12,
    frm="2023-01-01",
    url="https://www.palaugov.pw/taxreform/bpt/",
    src=PW_BRT,
    desc="Business Profits Tax (replaced gross revenue tax for PGST-registered persons from 1 Jan 2023)",
)
R += P(
    "PW",
    12,
    url="https://www.palaugov.pw/wp-content/uploads/2022/04/RPPL-11-11.pdf",
    src="RPPL No. 11-11 (Palau tax reform act), 40 PNC §1101",
    desc="Wages and salary tax top rate (6% to USD 8,000; 10% to 40,000; 12% above)",
)
R += W(
    "PW",
    0,
    10,
    10,
    url="https://www.palaugov.pw/wp-content/uploads/2022/04/RPPL-11-11.pdf",
    src="RPPL No. 11-11, 40 PNC §1422",
    div_notes="Distributions by resident entities are exempt income.",
)

NRO_RATES = "https://naurufinance.info/wp-content/uploads/2023/08/Nauru-tax-rates-2022-2023.pdf"
NRO_GAZ = "https://naurufinance.info/wp-content/uploads/2026/03/Nauru-Government-Gazette-No.-304-28-June-2024.pdf"
R += NOVAT(
    "NR",
    "No VAT or GST; telecommunications service tax (15%) and business profits tax apply",
    url=NRO_RATES,
    src="Nauru Revenue Office – tax rates 2022-23",
)
R += C(
    "NR",
    25,
    frm="2024-07-01",
    url=NRO_GAZ,
    src="Nauru Revenue Office – Business Tax (Amendment of Schedule 1) Regulations 2024 (Gazette No. 304)",
    desc="Business profits tax — 25% (20% for resident companies with gross revenue ≤ AUD 15m; 30% for Regional Processing Centre entities)",
)
R += P(
    "NR",
    20,
    url=NRO_RATES,
    src="Nauru Revenue Office – tax rates 2022-23",
    desc="Employment and services tax (flat 20% above AUD 9,240 per month; 30% for RPC employees)",
)
R += W(
    "NR",
    None,
    20,
    20,
    url=NRO_GAZ,
    src="Nauru Revenue Office – Gazette No. 304 (2024), non-resident tax",
    notes="20% on interest, royalties and insurance premiums (30% where connected with the RPC); dividends not listed.",
)

TV_ITA = "https://tuvalu-legislation.tv/cms/images/LEGISLATION/PRINCIPAL/1992/1992-0005/1992-0005_2.pdf"
R += V(
    "TV",
    4,
    zero=True,
    thr=100_000,
    cur="AUD",
    url="https://tuvalu-legislation.tv/cms/images/LEGISLATION/SUBORDINATE/2009/2009-0007/2009-0007_2.pdf",
    src="Consumption Tax Regulations (CAP 26.02.1, 2022 Revised Edition) – tuvalu-legislation.tv",
    desc="Consumption Tax standard rate",
    notes="Act permits 3–10%; Tuvalu uses the Australian dollar.",
)
R += C(
    "TV",
    30,
    url=TV_ITA,
    src="Income Tax Act (CAP 26.16, 2022 Revised Edition), Schedule 6 – tuvalu-legislation.tv",
    notes="Approved funds 15%.",
)
R += P(
    "TV",
    30,
    url=TV_ITA,
    src="Income Tax Act (CAP 26.16, 2022 Revised Edition), Schedule 6 – tuvalu-legislation.tv",
    notes="0% to AUD 10,000; 15% to 14,000; 30% above.",
)
R += W(
    "TV",
    15,
    15,
    15,
    url=TV_ITA,
    src="Income Tax Act (CAP 26.16, 2022 Revised Edition), Schedule 5 – tuvalu-legislation.tv",
)

t = Pwc("NC", "new-caledonia")
R += t.vat(
    11,
    [3, 6],
    higher=[22],
    frm="2018-10-01",
    desc="Taxe générale sur la consommation (TGC) normal rate",
    notes="Exports and certain services to foreign clients exempt (no explicit zero rate).",
)
R += t.cit(
    30,
    notes="35% for metallurgical and mining activities; additional social contribution 5–15% where taxable income ≥ XPF 200m.",
)
R += t.pit(40, notes="0% to XPF 1m; 4/12/25%; 40% above XPF 4.5m (family quotient); non-residents flat 25%.")
R += t.wht(
    21,
    0,
    0,
    div_notes="IRVM plus CCS and additional centimes on distributions to non-resident companies.",
    notes="Interest and royalties paid to non-resident companies are not subject to WHT (individuals 25%).",
)

# ----------------------------------------------------------------------------------------------------------------
# Africa
# ----------------------------------------------------------------------------------------------------------------
t = Pwc("MA", "morocco")
R += t.vat(
    20,
    [10],
    zero=True,
    applies="Transport, insurance brokerage, water, economy cars (2024–2026 convergence to 0/10/20%)",
)
R += t.cit(
    20,
    desc="CIT on taxable income below MAD 100m — FY2026 target rate of the 2023–2026 reform (35% at or above MAD 100m; 40% credit institutions and insurers)",
    notes="Minimum contribution 0.25% of turnover.",
)
R += t.pit(37, notes="Exempt to MAD 40,000; 10/20/30/34%; 37% above MAD 180,000.")
R += t.wht(
    11.25,
    10,
    10,
    div_notes="11.25% for FY2026, stepping down to 10% by 2027.",
    int_notes="Exempt for foreign-currency loans of more than 10 years.",
)

DGI_DZ = "Direction Générale des Impôts, Algeria (mfdgi.gov.dz)"
R += V(
    "DZ",
    19,
    [9],
    url="https://www.mfdgi.gov.dz/fr/professionnels/services-pro/regime-reel/la-taxe-sur-la-valeur-ajoutee",
    src=DGI_DZ,
    notes="Exports exempt (not zero-rated).",
)
R += C(
    "DZ",
    26,
    url="https://www.mfdgi.gov.dz/fr/professionnels/services-pro/regime-reel/ibs",
    src=DGI_DZ,
    desc="IBS rate for commerce and services (19% production of goods; 23% construction, public works and tourism)",
)
R += P(
    "DZ",
    35,
    url="https://www.mfdgi.gov.dz/fr/particuliers/irg-traitements-et-salaires",
    src=DGI_DZ,
    notes="IRG schedule 0% (≤ DZD 240,000) to 35% (> DZD 3,840,000).",
)
R += W(
    "DZ",
    15,
    10,
    30,
    url="https://www.mfdgi.gov.dz/fr/professionnels/services-pro/regime-reel/ibs",
    src=DGI_DZ,
    roy_notes="30% on sums paid to foreign enterprises without a permanent establishment (art. 150 CIDTA).",
)

t = Pwc("TN", "tunisia")
R += t.vat(19, [13, 7], frm="2018-01-01")
R += t.cit(
    20,
    frm="2025-01-01",
    notes="Finance Law 2025 raised the general rate from 15%; 10% reduced rate for certain activities; 35% payment institutions, automotive, telecoms; 40% banks, financial institutions and insurers.",
)
R += t.hist(
    "corporate_income",
    "headline",
    15,
    None,
    "2024-12-31",
    "General CIT rate to 31 Dec 2024",
    page="corporate/taxes-on-corporate-income",
)
R += t.pit(
    40, frm="2025-01-01", notes="Finance Law 2025 scale: 0% to TND 5,000 … 40% above TND 70,000 (previously 35%)."
)
R += t.hist(
    "personal_income",
    "top_marginal",
    35,
    None,
    "2024-12-31",
    "Top PIT rate to 31 Dec 2024",
    page="individual/taxes-on-personal-income",
)
R += t.wht(
    10, 20, 15, int_notes="10% on loans from non-resident banks.", roy_notes="25% to entities in low-tax jurisdictions."
)

t = Pwc("LY", "libya")
R += t.novat("No VAT in Libya")
R += t.cit(20, notes="Jihad tax (4% of CIT) abolished.")
R += t.pit(10, notes="5% up to LYD 12,000 per year; 10% above.")
R += t.wht(
    0,
    0,
    0,
    notes="Libyan law has no withholding taxes; unregistered foreign entities are assessed on a deemed-profit basis.",
)

SD_ITA = "https://tax.gov.sd/wp-content/uploads/2025/02/Income-tax.pdf"
BRIT_SD = "https://www.britacom.org/zt/BRPolicies/Sudan/"
R += V(
    "SD",
    17,
    zero=True,
    url=BRIT_SD,
    src="BRITACOM – Sudan tax laws and policies (secondary)",
    notes="40% on telecommunications and 30% on cigarettes; the official VAT page confirms the VAT Act 2001 but does not state the rate.",
)
R += C(
    "SD",
    15,
    url=SD_ITA,
    src="Sudan Taxation Chamber – Income Tax Act 1986 (consolidated), schedule of rates",
    desc="Business profits tax — companies (10% industrial companies; 35% petroleum; 30% banks and tobacco)",
)
R += P(
    "SD",
    15,
    url=SD_ITA,
    src="Sudan Taxation Chamber – Income Tax Act 1986 (consolidated), schedule of rates",
    notes="Progressive 0/5/10/15%.",
)
R += W(
    "SD",
    0,
    7,
    15,
    url=BRIT_SD,
    src="BRITACOM – Sudan tax laws and policies (secondary)",
    notes="Not verified against the Act (rates set by regulation).",
)

DTT_SS = (
    "https://www.deloitte.com/content/dam/assets-shared/docs/services/tax/2026/dttl-tax-southsudanhighlights-2026.pdf"
)
SS_SRC = "Deloitte International Tax – South Sudan Highlights 2026 (secondary)"
R += NOVAT(
    "SS",
    "No VAT; sales tax on manufacturers, importers and specified services (standard 18%; 20% on imported goods and hotel/restaurant/bar services)",
    url=DTT_SS,
    src=SS_SRC,
)
R += V(
    "SS",
    18,
    higher=[20],
    tax_type="sales_use",
    frm="2025-07-01",
    url=DTT_SS,
    src=SS_SRC,
    desc="Sales tax standard rate (FY 2025/26)",
    notes="No registration threshold.",
)
R += C(
    "SS", 30, frm="2025-07-01", url=DTT_SS, src=SS_SRC, desc="Business profit tax (flat 30%; 4% advance tax on imports)"
)
R += P("SS", 20, url=DTT_SS, src=SS_SRC, notes="Bands 0/5/10/15/20%; 20% above SSP 90,000.")
R += W(
    "SS",
    10,
    10,
    10,
    url=DTT_SS,
    src=SS_SRC,
    notes="20% on technical/consultancy fees, rent and government contract payments to non-residents.",
)
R += P2(
    "SS",
    "Not adopted: South Sudan has not committed to implementing rules in line with the GloBE Model Rules (Deloitte 2026).",
    adopted=False,
    url=DTT_SS,
    src=SS_SRC,
)

t = Pwc("ET", "ethiopia")
R += t.vat(
    15, zero=True, thr=2_000_000, cur="ETB", notes="15% VAT on digital services including non-resident providers."
)
R += t.cit(30, notes="3% advance CIT on the CIF value of commercial imports.")
R += t.pit(35, notes="Monthly employment income: exempt to ETB 2,000; 35% above ETB 14,000.")
R += t.wht(15, 10, 10, notes="Management/technical fees and PE profit repatriation 15%.")

R += NOSRC(
    "ER",
    url="https://www.lawgratis.com/blog-detail/tax-laws-eritrea",
    src="No reliable public source (aggregator pages only)",
    notes="No tax authority website, Big-4 guide or IMF rate table located. Aggregators cite CIT 30%, PIT top 30% and a sales tax (2% vs 4%/10% — conflicting); treat as unverified.",
)

R += NOVAT(
    "SO",
    "No VAT; federal sales tax (5%) applies; Somaliland and Puntland administer separate regimes",
    url="https://www.britacom.org/zt/BRPolicies/Somalia/",
    src="BRITACOM – Somalia tax laws and policies (secondary)",
)
R += V(
    "SO",
    5,
    tax_type="sales_use",
    url="https://www.britacom.org/zt/BRPolicies/Somalia/",
    src="BRITACOM – Somalia tax laws and policies (secondary)",
    desc="Federal sales tax standard rate",
)
R += C(
    "SO",
    30,
    url="https://sominvest.gov.so/procedures/tax-regime/",
    src="Somalia Investment Promotion Office – tax regime (Law No. 5 of 1966)",
    desc="Top rate of progressive corporate income tax (0% to USD 2,399 … 30% above USD 30,000)",
)
R += P(
    "SO",
    18,
    url="https://sominvest.gov.so/procedures/tax-regime/",
    src="Somalia Investment Promotion Office – tax regime",
    notes="Monthly bands 0/6/12/18%; 18% above USD 1,500.",
)

DJ_CGI = "https://guichet-unique-djib.com/wp-content/uploads/2026/01/CGI2017-cgi.pdf"
DJ_SRC = "Code général des impôts de Djibouti (2017 consolidated text) – Guichet Unique"
R += V(
    "DJ",
    10,
    zero=True,
    thr=50_000_000,
    cur="DJF",
    url=DJ_CGI,
    src=DJ_SRC,
    notes="2017 consolidation; a later code exists in print only.",
)
R += C("DJ", 25, url=DJ_CGI, src=DJ_SRC, desc="Impôt sur les bénéfices professionnels (minimum tax 1% of turnover)")
R += P("DJ", 30, url=DJ_CGI, src=DJ_SRC, notes="Monthly ITS 2/15/18/20%; 30% above DJF 600,000.")
R += W(
    "DJ",
    0,
    None,
    15,
    url=DJ_CGI,
    src=DJ_SRC,
    div_notes="Dividends paid by Djibouti-domiciled companies exempt (art. 73).",
    roy_notes="15% on service fees and intellectual-property income paid to persons not domiciled in Djibouti (arts. 72–75).",
)

R += NOSRC(
    "KM",
    url="https://eregulations.investcomoros.net/objective/48?l=fr",
    src="No reliable public source (eRegulations Comores portal, no rates)",
    notes="The government portal confirms a consumption tax (taxe sur la consommation), IS and IRPP exist but states no rates; no code text or rate table located.",
)

ST_SRC = "immigrantinvest.com – São Tomé and Príncipe taxes (cites Lei 9-10/2009, 11/2009, 13/2019) (secondary)"
ST_URL = "https://immigrantinvest.com/blog/sao-tome-and-principe-taxes/"
R += V(
    "ST",
    15,
    [7.5],
    frm="2023-06-01",
    thr=1_000_000,
    cur="STN",
    url="https://www.stp-press.st/2023/04/07/iva-vai-ser-realidade-em-sao-tome-e-principe-a-partir-de-01-de-junho-a-taxa-de-15-e-os-produtos-da-cesta-basica-terao-reducao-de-50/",
    src="STP-Press (state news agency) – IVA from 1 June 2023 (secondary)",
    applies="Basic-basket goods (50% reduction)",
    notes="Simplified regimes: 7% turnover tax (STN 100,000–1m) and 2% fixed below STN 100,000. financas.gov.st blocks automated clients.",
)
R += C("ST", 25, url=ST_URL, src=ST_SRC, notes="10% for approved new investments ≥ EUR 50,000.")
R += P("ST", 25, url=ST_URL, src=ST_SRC, notes="IRS brackets 0/10/13/15/20/25%.")
R += W(
    "ST",
    15,
    15,
    None,
    url=ST_URL,
    src=ST_SRC,
    notes="Flat 15% final withholding on capital income; royalties not separately rated.",
)

GH_VAT = "https://gra.gov.gh/domestic-tax/tax-types/vat/"
GH_CIT = "https://gra.gov.gh/domestic-tax/tax-types/corporate-income-tax/"
t = Pwc("GH", "ghana")
R += t.vat(
    15,
    zero=True,
    notes="Plus NHIL 2.5% and GETFund levy 2.5% on the same base; 5% communication service tax; 3% VAT flat-rate scheme for retailers.",
)
R += t.cit(
    25,
    notes="35% mining and upstream petroleum; 22% hotels; Growth and Sustainability Levy 2.5–5% of profit before tax (2023–2028).",
)
R += t.pit(35, notes="Residents 0–35% (35% above GHS 600,000); non-residents flat 25%.")
R += t.wht(8, 8, 15, notes="Management, consulting and technical fees 20%.")

t = Pwc("CI", "ivory-coast")
R += t.vat(18, [9], applies="Milk, luxury rice, non-ECOWAS meat, durum-wheat pasta")
R += t.cit(25, notes="30% for telecommunications, IT and communication sectors; minimum tax 0.5% of turnover.")
R += t.pit(32, notes="Monthly brackets 0% to XOF 75,000 … 32% above XOF 8m (Ordinance 2023-718).")
R += t.wht(
    15,
    18,
    20,
    roy_notes="BNC: 25% on 80% of the gross amount (20% effective) on royalties, licence, management and service fees.",
)

t = Pwc("SN", "senegal")
R += t.vat(
    18, [10], applies="Tourism activities", notes="17% special tax on financial activities applies instead of VAT."
)
R += t.cit(30, notes="Minimum CIT 0.5% of turnover, capped at XOF 5m.")
R += t.pit(43, notes="Progressive 0/20/30/35/37/40/43% (43% above XOF 50m); family-quotient system.")
R += t.wht(10, 16, 20, int_notes="16% on loans; 13%/6% bonds; 8% bank deposits.")

t = Pwc("CM", "republic-of-cameroon")
R += t.vat(
    19.25,
    [10],
    zero=True,
    thr=50_000_000,
    cur="XAF",
    desc="Total VAT rate (17.5% plus 10% additional council tax)",
    applies="Social housing (2026 Finance Law)",
)
R += t.cit(
    33,
    desc="Total CIT including 10% council surcharge for turnover above XAF 3bn (27.5% below)",
    notes="Minimum tax 2.2%/5.5% of turnover; 3% digital significant-economic-presence tax from 1 Jan 2026.",
)
R += t.pit(38.5, notes="Salaries 11/16.5/27.5/38.5% (including council tax); 38.5% above XAF 5m.")
R += t.wht(16.5, 16.5, 15, notes="33% to tax havens; royalties 15% special income tax without surcharge.")

t = Pwc("TZ", "tanzania")
R += t.vat(
    18,
    [16],
    zero=True,
    thr=200_000_000,
    cur="TZS",
    applies="B2C purchases paid via bank or approved electronic payment system (from 1 Sep 2025)",
    notes="Zanzibar: 15% standard (18% banking, postal and telecommunications); threshold TZS 100m.",
)
R += t.cit(
    30, notes="Newly DSE-listed 25% for three years; alternative minimum tax 1% of turnover for perpetual loss-makers."
)
R += t.pit(30, notes="30% above TZS 1m per month; non-residents 15% flat on employment income.")
R += t.wht(
    10,
    10,
    15,
    div_notes="5% from DSE-listed companies.",
    notes="Non-resident digital service suppliers: 2% of turnover.",
)

t = Pwc("UG", "uganda")
R += t.vat(18, zero=True, thr=150_000_000, cur="UGX")
R += t.cit(30, notes="Presumptive tax for resident companies with turnover ≤ UGX 150m.")
R += t.pit(40, notes="0% to UGX 2.82m; 10/20/30%; 40% above UGX 120m.")
R += t.wht(15, 15, 15, int_notes="20% on government securities (10% if maturity ≥ 10 years).")

t = Pwc("RW", "rwanda")
R += t.vat(18, zero=True, thr=20_000_000, cur="RWF", thr_notes="RWF 20m in any year or RWF 5m in a calendar quarter.")
R += t.cit(28, notes="Newly listed companies 25%/20% for five years; small businesses 3% of turnover.")
R += t.pit(30, notes="Monthly bands 0/10/20/30%; 30% above RWF 200,000.")
R += t.wht(15, 15, 15, notes="5% on listed securities to Rwanda/EAC residents and treasury bonds ≥ 3 years.")

t = Pwc("ZM", "zambia")
R += t.vat(
    16,
    zero=True,
    notes="Reverse charge on imported services; services physically performed in Zambia are not zero-rated.",
)
R += t.cit(
    30, notes="Telecoms 35%; farming and agro-processing 10%; hotels 30% (formerly 15%); non-traditional exports 20%."
)
R += t.pit(37, notes="2026: 0% to ZMW 61,200; 20/30%; 37% above ZMW 110,400.")
R += t.wht(20, 20, 20, div_notes="0% on dividends paid by mining companies.")

ZIMRA = "Zimbabwe Revenue Authority (ZIMRA)"
ZW_VAT = "https://www.zimra.co.zw/domestic-taxes/vat/mechanics-of-vat"
KPMG_ZW = "https://kpmg.com/kpmg-us/content/dam/kpmg/taxnewsflash/pdf/2025/12/tnf-zimbabwe-dec-1-2025.pdf"
R += V(
    "ZW", 15.5, frm="2026-01-01", zero=True, url=ZW_VAT, src=ZIMRA, notes="Raised from 15% on 1 Jan 2026 (2026 Budget)."
)
R += HIST(
    "ZW", "vat", "standard", 15, None, "2025-12-31", url=ZW_VAT, src=ZIMRA, desc="VAT standard rate to 31 Dec 2025"
)
R += C(
    "ZW",
    25,
    url="https://www.zimra.co.zw/domestic-taxes/corporate/tax-rates",
    src=ZIMRA,
    desc="Corporate income tax 25% plus 3% AIDS levy on the tax (effective 25.75%)",
    notes="Manufacturing exporters 20/17.5/15%; special economic zones 0%/15%.",
)
R += P(
    "ZW",
    40,
    url="https://www.zimra.co.zw/domestic-taxes/individual/pay-as-you-earn-paye",
    src=ZIMRA,
    notes="40% above USD 36,000 (ZWG 84,000) per year plus 3% AIDS levy (2025 tables; 2026 tables not yet posted).",
)
R += W(
    "ZW",
    10,
    15,
    15,
    url=KPMG_ZW,
    src="KPMG TaxNewsFlash – Zimbabwe 2026 Budget (Dec 2025) (secondary)",
    int_notes="15% non-resident tax on interest reintroduced from 1 Jan 2026 (payable in USD).",
    notes="Dividend and royalty rates from aggregator sources (conflicting); verify against the Income Tax Act.",
)
R += P2(
    "ZW",
    "2026 Budget / Finance Act: 15% domestic minimum top-up tax on 'high-earning foreign entities' (MNE groups with consolidated turnover ≥ EUR 750m) from 1 Jan 2026 — per KPMG; verify against the Finance Act text.",
    frm="2026-01-01",
    url=KPMG_ZW,
    src="KPMG TaxNewsFlash – Zimbabwe 2026 Budget (secondary)",
)

t = Pwc("MZ", "mozambique")
R += t.vat(
    16,
    [5],
    zero=True,
    thr=2_500_000,
    cur="MZN",
    notes="VAT Code overhaul effective 1 Jan 2026 (special regimes eliminated; digital-goods rules).",
)
R += t.cit(
    32,
    notes="10% for agriculture, livestock, aquaculture and urban transport; 35% autonomous taxation of undocumented expenses.",
)
R += t.pit(32, notes="10/15/20/25/32%; 32% above MZN 1,512,000; non-residents flat 20%.")
R += t.wht(20, 20, 20, notes="10% on digital goods and services.")

t = Pwc("AO", "angola")
R += t.vat(
    14,
    [1, 2, 5, 7],
    zero=True,
    thr=350_000_000,
    cur="AOA",
    applies="1%/2%: Cabinda; 5%: listed food and agricultural inputs; 7%: hotels, restaurants and simplified regime",
    thr_notes="Standard regime above AOA 350m (manufacturing AOA 25m); simplified regime AOA 25m–350m pays 7% of turnover.",
)
R += t.cit(25, notes="Simplified regime for turnover ≤ AOA 25m.")
R += t.pit(25, notes="Group A employment income progressive to 25% above AOA 10m.")
R += t.wht(
    10,
    15,
    10,
    notes="Levied as investment income tax (IIT): 15% general; 10% on dividends, bond interest, shareholder-loan interest and royalties. Services 6.5%.",
)

t = Pwc("NA", "republic-of-namibia")
R += t.vat(15, zero=True, thr=1_000_000, cur="NAD", thr_notes="Voluntary registration above NAD 200,000.")
R += t.cit(
    30,
    frm="2025-01-01",
    notes="Reduced from 31% for financial years commencing on/after 1 Jan 2025; manufacturers 18%; diamond mining 55%; other mining 37.5%.",
)
R += t.hist(
    "corporate_income",
    "headline",
    31,
    None,
    "2024-12-31",
    "Corporate income tax rate for financial years commencing before 1 Jan 2025",
    page="corporate/taxes-on-corporate-income",
)
R += t.pit(37, notes="FY Mar 2025–Feb 2026: 0% to NAD 100,000 … 37% above NAD 1.55m.")
R += t.wht(10, 10, 10, div_notes="10% where the recipient company holds ≥ 25%; otherwise 20%.")

t = Pwc("BW", "botswana")
R += t.vat(14, zero=True, thr=1_000_000, cur="BWP")
R += t.cit(22, notes="Approved manufacturing and IFSC companies 15%; mining formula rate not below 22%.")
R += t.pit(25, notes="Residents 0% to BWP 48,000 … 25% above BWP 156,000.")
R += t.wht(10, 15, 15, notes="Management/consultancy fees 15%; entertainment 10%.")

t = Pwc("MU", "mauritius")
R += t.vat(
    15,
    zero=True,
    thr=3_000_000,
    cur="MUR",
    notes="Foreign suppliers of specified digital services must register from 1 Jan 2026 regardless of turnover.",
)
R += t.cit(
    15,
    notes="3% on export of goods and Freeport activities; 80% partial exemption on specified foreign-source income; alternative minimum tax 10% for hotels, insurance, finance, real estate and telecoms from YoA 1 Jul 2026.",
)
R += t.pit(
    20,
    notes="From 1 Jul 2025: 0% to MUR 500,000; 10% to MUR 1m; 20% above; Fair Share Contribution 15% on net income above MUR 12m.",
)
R += t.wht(0, 15, 15, int_notes="No WHT on interest paid by global business licensees out of foreign-source income.")
R += t.p2(
    "Qualified Domestic Minimum Top-up Tax for MNE groups ≥ EUR 750m from the year of assessment commencing 1 July 2025.",
    frm="2025-07-01",
)

t = Pwc("MG", "madagascar")
R += t.vat(
    20,
    [10],
    zero=True,
    thr=400_000_000,
    cur="MGA",
    applies="Import and sale of butane gas",
    thr_notes="No threshold for non-resident suppliers.",
)
R += t.cit(20, notes="Synthetic tax (5% of 70% of turnover) below MGA 400m; minimum CIT 1% of turnover.")
R += t.pit(20, notes="IRSA 0/5/10/15/20% on a monthly scale.")
R += t.wht(10, 20, 10)

DGI_ML = "https://www.dgi.gouv.ml/CGI/"
ML_SRC = "Direction Générale des Impôts du Mali – Code général des impôts (online consolidation, 2017)"
R += V(
    "ML",
    18,
    [5],
    thr=50_000_000,
    cur="XOF",
    url=DGI_ML,
    src=ML_SRC,
    applies="IT equipment, solar equipment and other listed products",
    notes="Exports exempt (exonération) rather than zero-rated.",
)
R += C("ML", 30, url=DGI_ML, src=f"{ML_SRC}, art. 85", notes="Minimum tax 1% of turnover (art. 86).")
R += P(
    "ML",
    37,
    url=DGI_ML,
    src=f"{ML_SRC}, art. 10 (ITS)",
    notes="ITS schedule from 1 Jul 2015: 0% to 37% above XOF 3,494,130.",
)
R += W(
    "ML",
    10,
    None,
    15,
    url=DGI_ML,
    src=f"{ML_SRC}, arts. 42 and 94–97",
    div_notes="IRVM 10% (7% for CREPMF-listed companies).",
    roy_notes="30% on 50% of the gross amount (15% effective) for persons without a permanent installation.",
    notes="Interest: 9% deposits, 6% bonds, 13% negotiable debt — no single rate.",
)

DGI_BF = "https://dgi.bf/verification/CGI"
BF_SRC = "Direction Générale des Impôts du Burkina Faso – Code général des impôts, Version 2024"
R += V(
    "BF",
    18,
    [10],
    zero=True,
    thr=50_000_000,
    cur="XOF",
    url=DGI_BF,
    src=f"{BF_SRC}, arts. 300, 308, 317",
    applies="Accommodation and restaurant services of approved hotels and restaurants",
)
R += C("BF", 27.5, url=DGI_BF, src=f"{BF_SRC}, art. 87")
R += P(
    "BF", 25, url=DGI_BF, src=f"{BF_SRC}, art. 112 (IUTS)", notes="Monthly IUTS schedule 0% to 25% above XOF 250,100."
)
R += W(
    "BF",
    12.5,
    25,
    20,
    url=DGI_BF,
    src=f"{BF_SRC}, arts. 140 and 212",
    div_notes="IRCM 12.5% (6.25% for mining permit holders and new companies).",
    int_notes="IRCM 25% on revenus des créances (6% on Burkina-issued bonds).",
    roy_notes="20% withholding on non-resident service providers (art. 212).",
)

NE_LF26 = "https://finances.gouv.ne/index.php/lois-de-finances/file/1314-2025-josp-25-lfi-2026-1er-cahier"
NE_LF25 = "https://finances.gouv.ne/index.php/lois-de-finances/file/1226-josp-lf-2025-1-cahier"
R += V(
    "NE",
    19,
    url=NE_LF26,
    src="Loi de finances 2026 (Ordonnance 2025-44), Journal Officiel – Ministère des Finances du Niger",
    notes="Rate stated in the exposé des motifs; reduced rates and threshold not extracted. CIT rate not located (new CGI 2025 not online).",
)
R += P(
    "NE",
    35,
    url=NE_LF26,
    src="Loi de finances 2026, art. 150 (ITS) – Ministère des Finances du Niger",
    notes="Monthly ITS 1–35%; 35% above XOF 1m per month.",
)
R += W(
    "NE",
    10,
    None,
    20,
    url=NE_LF25,
    src="Loi de finances 2025, arts. 47–48 and 74 – Ministère des Finances du Niger",
    div_notes="IRCM 10% (7% CREPMF-listed).",
    roy_notes="20% on royalties and services paid to non-residents (raised from 16%).",
)

t = Pwc("TD", "chad")
R += t.vat(
    18,
    [9],
    zero=True,
    applies="Local products: cement, sugar, oil, soap, textiles, concrete, iron",
    notes="PwC page last reviewed Aug 2024.",
)
R += t.cit(35, notes="Minimum tax 1.5% of turnover; flat-tax regime ≤ XAF 50m, simplified XAF 50m–500m.")
R += t.pit(30, notes="0% to XAF 800,000 … 30% above XAF 12m.")
R += t.wht(20, 25, 25, notes="CEMAC-resident recipients: 5% interest, 7.5% other income.")

BJ_CGI = "https://api.impots.bj/media/6984ebbbb7bc0_B%C3%A9nin-Code%20G%C3%A9n%C3%A9ral%20des%20Imp%C3%B4ts%202026.pdf"
BJ_SRC = "Code Général des Impôts 2026 – DGI Bénin"
R += V(
    "BJ",
    18,
    url=BJ_CGI,
    src=f"{BJ_SRC}, art. 241",
    notes="2026 Finance Law extends VAT to non-resident digital service providers (secondary).",
)
R += C(
    "BJ",
    30,
    url=BJ_CGI,
    src=f"{BJ_SRC}, art. 46",
    notes="25% for industrial companies (excluding extractives) and private schools.",
)
R += P(
    "BJ", 30, url=BJ_CGI, src=f"{BJ_SRC}, art. 125 (ITS)", notes="ITS 0/10/15/19/30%; 30% above XOF 500,000 per month."
)
R += W(
    "BJ",
    5,
    15,
    20,
    url=BJ_CGI,
    src=f"{BJ_SRC}, arts. 86–88, 141–142",
    div_notes="IRCM 5% on dividends to non-resident shareholders (10% other dividends).",
)

OTR_CGI = "https://www.otr.tg/index.php/fr/impots/reglementations-fiscales/code-general-des-impots/600-code-general-des-impots-livre-des-procedures-fiscales-mis-a-jour-2025/file.html"
TG_SRC = "Code Général des Impôts mis à jour 2025 – Office Togolais des Recettes (OTR)"
R += V(
    "TG",
    18,
    thr=60_000_000,
    cur="XOF",
    url=OTR_CGI,
    src=f"{TG_SRC}, art. 195",
    notes="Single 18% rate; real regime (VAT liability) above XOF 60m turnover.",
)
R += C("TG", 27, url=OTR_CGI, src=f"{TG_SRC}, art. 113")
R += P("TG", 35, url=OTR_CGI, src=f"{TG_SRC}, art. 74 (IRPP)", notes="Exempt to XOF 900,000; 3–30%; 35% above XOF 20m.")
R += W(
    "TG",
    13,
    6,
    20,
    url=OTR_CGI,
    src=f"{TG_SRC}, arts. 79–80; LPF art. 98",
    div_notes="13% on distributed income (7% CREPMF-listed).",
    int_notes="6% on fixed-income products paid to legal persons (13% individuals).",
)

t = Pwc("GA", "gabon")
R += t.vat(
    18, [10, 5], zero=True, thr=60_000_000, cur="XAF", notes="Special solidarity contribution 1% on turnover ≥ XAF 30m."
)
R += t.cit(30, notes="35% for oil and mining companies; minimum tax 1% of turnover.")
R += t.pit(35, notes="IRPP progressive to 35% above XAF 11m per family share; plus 5% complementary tax on salaries.")
R += t.wht(25, 25, 25, notes="25% on payments to persons without a permanent professional base in Gabon.")

t = Pwc("CG", "republic-of-congo")
R += t.vat(
    18, [5], notes="Plus a 5% surtax on the VAT (18.9% overall); 5% reduced rate on listed products and SEZ developers."
)
R += t.cit(30, notes="25% microfinance and private schools; 28% mining and real estate; minimum tax 1% of turnover.")
R += t.pit(40, notes="1% to XOF 464,000; 10/25%; 40% above XOF 3m.")
R += t.wht(15, 20, 20, notes="Services to foreign suppliers 20% general (CEMAC 10%).")

t = Pwc("CD", "democratic-republic-of-the-congo")
R += t.vat(
    16,
    [1, 5],
    zero=True,
    applies="1%: specified essential goods; 5%: domestic air tickets",
    notes="Non-residents without a PE must appoint a VAT representative.",
)
R += t.cit(30, notes="Minimum tax 1% of turnover; small companies 1%/2% of turnover.")
R += t.pit(40, desc="Top nominal IPR bracket (40% above CDF 43.2m), capped at 30% of taxable salary")
R += t.wht(20, 20, 20, div_notes="10% in the mining sector.", roy_notes="20% on 70% of the invoice (net basis).")

GN_CGI = "https://mbudget.gov.gn/wp-content/uploads/Code-General-des-Impots.pdf"
GN_SRC = "Code général des impôts de la République de Guinée – Ministère du Budget"
R += V(
    "GN",
    18,
    zero=True,
    thr=1_000_000_000,
    cur="GNF",
    frm="2022-01-01",
    url=GN_CGI,
    src=f"{GN_SRC}, arts. 359 and 373",
    thr_notes="Franchise below GNF 1bn prior-year turnover.",
)
R += C(
    "GN",
    25,
    frm="2022-01-01",
    url=GN_CGI,
    src=f"{GN_SRC}, art. 229",
    notes="35% telephony, banks, insurance and petroleum distribution; 30% mining title holders.",
)
R += P("GN", 20, url=GN_CGI, src=f"{GN_SRC}, art. 63", notes="Monthly schedule 0/5/8/10/15/20%; 20% above GNF 20m.")
R += W("GN", 15, 15, 15, url=GN_CGI, src=f"{GN_SRC}, arts. 187 and 198")

NRA_SL = "National Revenue Authority, Sierra Leone"
R += V(
    "SL",
    15,
    tax_type="gst",
    zero=True,
    thr=500_000,
    cur="SLE",
    frm="2024-01-01",
    url="https://mail.nra.gov.sl/individuals-and-partnerships/goods-and-services-tax",
    src=f"{NRA_SL} – Goods and Services Tax",
    thr_notes="Finance Act 2024 s.13: NLe 500,000 (new leone).",
    notes="Single 15% rate since 1 Sep 2009 (GST Act 2009); exports zero-rated except minerals.",
)
R += C(
    "SL",
    25,
    url="https://www.sliepa.gov.sl/media/userfiles/subsite_198/files/2022%20NRA%20TAX%20GUIDE_0.pdf",
    src=f"{NRA_SL} – Tax and Non-Tax Revenue Guide (2022)",
    notes="15% for manufacturers outside the Western Area; 2% minimum alternate tax for loss-makers (Finance Act 2024).",
)
R += P(
    "SL",
    30,
    url="https://www.sliepa.gov.sl/media/userfiles/subsite_198/files/2022%20NRA%20TAX%20GUIDE_0.pdf",
    src=f"{NRA_SL} – Tax and Non-Tax Revenue Guide (2022)",
    notes="Non-resident individuals flat 25%.",
)
R += W(
    "SL",
    15,
    15,
    15,
    url="https://mof.gov.sl/wp-content/uploads/2024/01/The-Finance-Act-2024.pdf",
    src="Sierra Leone Ministry of Finance – Finance Act 2024, s.12 (Second Schedule Part II)",
    notes="Contractors 10%; employment income 25%.",
)

t = Pwc("LR", "republic-of-liberia")
R += t.vat(
    12,
    tax_type="gst",
    notes="Raised from 10% (Tax Amendment Act 2024). A VAT was expected to replace GST on or before 1 Jul 2026 — status unconfirmed on the PwC page (reviewed Jan 2026).",
)
R += t.cit(25, notes="Specialised sectors 15–30%.")
R += t.pit(25, notes="25% above LRD 800,000; non-residents flat 20%.")
R += t.wht(15, 15, 15, notes="Services 20%; gaming winnings 30%.")

DTT_MW = "https://www.deloitte.com/content/dam/assets-zone1/ke/en/docs/services/tax/2025/2025-26-mid-year-budget-deloitte-commentary.pdf"
MW_SRC = "Deloitte Malawi – 2025/26 Mid-Year Budget commentary (Nov 2025) (secondary)"
R += V(
    "MW",
    16.5,
    url=DTT_MW,
    src=MW_SRC,
    notes="An increase to 17.5% was announced in the Nov 2025 mid-year budget; enactment/gazette not verified, so the prior 16.5% is kept as current. MRA website unreadable to automated clients.",
)
R += C(
    "MW",
    30,
    url=DTT_MW,
    src=MW_SRC,
    notes="Profits above MWK 5bn taxed at 40% (announced); branch/PE rate reduced from 35% to 30% from 1 Apr 2025.",
)
R += P(
    "MW",
    35,
    url=DTT_MW,
    src=MW_SRC,
    notes="An updated PAYE top rate of 40% above MWK 10m per month was announced Nov 2025; enactment not verified.",
)
R += W(
    "MW",
    10,
    15,
    15,
    url="https://bats-consulting.com/assets/pdf/taxrules/Malawi.pdf",
    src="EY Worldwide Corporate Tax Guide – Malawi chapter (copy) (secondary)",
    notes="15% final WHT on payments to non-residents without a PE; 10% for mining-project interest/royalties.",
)

RSL = "Revenue Services Lesotho (RSL)"
R += V(
    "LS",
    15,
    [10],
    zero=True,
    thr=2_000_000,
    cur="LSL",
    url="https://www.rsl.org.ls/value-added-tax-vat",
    src=RSL,
    applies="Electricity",
    thr_notes="LSL 2m from 25 Apr 2025 (law-firm guide).",
)
R += C(
    "LS",
    25,
    url="https://www.rsl.org.ls/corporate-income-tax",
    src=RSL,
    notes="10% for manufacturing and commercial farming.",
)
R += P(
    "LS",
    30,
    url="https://zmayetlaw.co.ls/lesotho-tax-guide-effective-1-april-2025/",
    src="Mayet & Associates – Lesotho tax guide (1 Apr 2025) (secondary)",
    notes="20% to LSL 74,040; 30% above; RSL page confirms the LSL 12,240 credit but not the brackets.",
)
R += W(
    "LS",
    25,
    25,
    25,
    url="https://www.rsl.org.ls/sites/default/files/2025-06/Withholding%20Tax%20Public%20Ruling_1.pdf",
    src=f"{RSL} – Income Tax Public Ruling: withholding taxes",
    notes="No WHT on dividends paid out of manufacturing income; 15% on royalties under certain treaties.",
)

t = Pwc("SZ", "eswatini")
R += t.vat(15)
R += t.cit(25, frm="2025-01-01", notes="Reduced from 27.5% for year-ends after 31 Dec 2024.")
R += t.hist(
    "corporate_income",
    "headline",
    27.5,
    None,
    "2024-12-31",
    "Corporate income tax rate for year-ends to 31 Dec 2024",
    page="corporate/taxes-on-corporate-income",
)
R += t.pit(33, notes="SZL 47,500 plus 33% above SZL 200,000.")
R += t.wht(15, 10, 15, div_notes="12.5% for companies in Botswana, Lesotho and South Africa.")

SRC_SC = "https://src.gov.sc/seychelles-tax-system/"
SC_SRC = "Seychelles Revenue Commission – Seychelles tax system"
R += V(
    "SC",
    15,
    zero=True,
    thr=2_000_000,
    cur="SCR",
    url=SRC_SC,
    src=SC_SRC,
    thr_notes="Voluntary registration from SCR 100,000 (1 Jan 2025).",
)
R += C(
    "SC",
    25,
    url=SRC_SC,
    src=SC_SRC,
    desc="Business tax — 25% above SCR 1m (15% on the first SCR 1m; presumptive 1.5% of turnover below SCR 1m)",
)
R += P(
    "SC",
    30,
    url="https://src.gov.sc/income-and-non-monetary-benefits-tax/",
    src="Seychelles Revenue Commission – income and non-monetary benefits tax",
    notes="Monthly emoluments: 0%/15%/20%; 30% above SCR 83,333.",
)
R += W(
    "SC",
    15,
    15,
    15,
    url=SRC_SC,
    src=SC_SRC,
    notes="Also 15% on natural-resource amounts and technical/managerial fees; entertainers and insurance premiums 5%.",
)
R += P2(
    "SC",
    "Not adopted; SRC capacity-building on GloBE rules with ATAF (May 2026), no DMTT/IIR legislation.",
    adopted=False,
    url="https://src.gov.sc/src-intensifies-transfer-pricing-and-global-minimum-tax-capacity-builing-through-ataf/",
    src="Seychelles Revenue Commission",
)

t = Pwc("CV", "cabo-verde")
R += t.vat(
    15,
    [8],
    zero=True,
    applies="Electricity and water to private consumers",
    notes="Micro/small companies (turnover ≤ CVE 10m) pay a 4% single special tax instead of VAT.",
)
R += t.cit(20, notes="20.4% including the 2% fire-brigade surcharge in Praia/Mindelo.")
R += t.pit(27.5, notes="16.5% to CVE 960,000; 23.1% to 1.8m; 27.5% above.")
R += t.wht(0, 20, 20, div_notes="Full WHT relief on profit distributions.", int_notes="Bond interest 10% (listed 5%).")
R += t.p2(
    "State Budget 2026 creates a 15% qualified global minimum tax for groups ≥ EUR 750m; implementing legislation and effective date pending. STTR multilateral convention signed Sep 2024."
)

GRA_GM = "https://www.gra.gm/domestic-faqs"
GM_SRC = "Gambia Revenue Authority – domestic taxes FAQs"
R += V("GM", 15, thr=2_000_000, cur="GMD", url=GRA_GM, src=GM_SRC)
R += C(
    "GM", 27, url=GRA_GM, src=GM_SRC, notes="Higher of 27% of net profit or 1% (audited) / 2% (unaudited) of turnover."
)
R += W(
    "GM",
    15,
    None,
    None,
    url=GRA_GM,
    src=GM_SRC,
    div_notes="15% on gross dividends for resident and non-resident shareholders.",
    notes="Interest and royalty WHT rates not stated by the GRA; PIT top rate not available (1st Schedule not online).",
)

t = Pwc("MR", "mauritania")
R += t.vat(16, zero=True)
R += t.cit(25, desc="Higher of 25% of net taxable profit or 2.5% of turnover (normal and intermediate real regimes)")
R += t.pit(40, notes="Monthly employment income 15%/25%; 40% above MRU 21,000.")
R += t.wht(10, 10, 15, notes="15% on services and royalties to non-established foreign suppliers.")

OBR_TVA = "https://www.obr.bi/images/LOI_N1_10_DU_16_NOVEMBRE_2020_PORTANT_MODIFICATION_DE_LA_LOI_N1_12_DU_29_JUILLET_2013_PORTANT_REVISION_DE_LA_LOI_N1_02_DU_17_FEVRIER_2009_PORTANT_INSTITUTION_DE_LA_TAXE_SUR_LA_VALEUR_AJOUTEE_TVA_.pdf"
OBR_IR = "https://www.obr.bi/images/LOI_N1_14_DU_24_DECEMBRE_2020_PORTANT_MODIFICATION_DE_LA_LOI_N1_02_DU_24_JANVIER_2013_RELATIVE_AUX_IMPOTS_SUR_LES_REVENUS_1.pdf"
R += V(
    "BI",
    18,
    [10],
    zero=True,
    url=OBR_TVA,
    src="Loi n°1/10 du 16 novembre 2020 (TVA), art. 19 – Office Burundais des Recettes (scanned PDF)",
    applies="Agricultural inputs, locally processed agricultural products, listed foodstuffs, hotel services",
)
R += C(
    "BI",
    30,
    url=OBR_IR,
    src="Loi n°1/14 du 24 décembre 2020 (impôts sur les revenus), art. 103 – OBR (scanned PDF)",
    notes="Minimum tax 1% of turnover.",
)
R += P(
    "BI",
    30,
    url=OBR_IR,
    src="Loi n°1/14 du 24 décembre 2020 (impôts sur les revenus), art. 21 – OBR (scanned PDF)",
    notes="0% to BIF 1.8m; 20% to 3.6m; 30% above.",
)
R += W(
    "BI",
    15,
    15,
    15,
    url="https://www.obr.bi/images/LOI_DE_FINANCES_2026-2027_PROMULGUEE_compressed.pdf",
    src="Loi de finances 2026/2027, art. 156 – OBR (scanned PDF)",
    notes="15% on dividends, interest (except inter-bank), royalties and non-resident services.",
)

t = Pwc("GQ", "equatorial-guinea")
R += t.vat(15, [5], zero=True, applies="Basic consumables and books")
R += t.cit(25, notes="Minimum income tax 1.5% of turnover (creditable).")
R += t.pit(25, notes="0% to XAF 1.4m; 25% above XAF 15m.")
R += t.wht(15, 15, 10, roy_notes="10% for non-CEMAC residents; 10% on all non-resident services from 1 Jan 2025.")

GW_LEG = "https://kontaktu.mef.gw/legislation"
GW_SRC = "Ministério das Finanças da Guiné-Bissau – Kontaktu legislation portal"
R += V(
    "GW",
    19,
    [10],
    zero=True,
    thr=40_000_000,
    cur="XOF",
    url=GW_LEG,
    src=f"Código do IVA (Lei n.º 4/2022) – {GW_SRC}",
    applies="Annex I goods and services",
)
R += C(
    "GW",
    25,
    url=GW_LEG,
    src=f"Código da Contribuição Industrial (as amended by Lei 8/2020) – {GW_SRC}",
    desc="Contribuição Industrial (corporate income tax) rate",
)
R += P(
    "GW",
    20,
    url=GW_LEG,
    src=f"Código do Imposto Profissional, art. 27 – {GW_SRC}",
    desc="Imposto Profissional top rate (20% above XOF 1.5m per month)",
)
R += W(
    "GW",
    15,
    15,
    None,
    url=GW_LEG,
    src=f"Código do Imposto de Capitais, art. 22 – {GW_SRC}",
    int_notes="15% bank deposit interest (< 1 year); 10% bonds and T-bills; 5% securities > 3 years.",
    notes="Royalties not separately rated (25% on non-resident services under the Contribuição Industrial).",
)

R += NOSRC(
    "CF",
    url="http://www.finances.gouv.cf/finances/la-fiscalite-en-rca",
    src="No reliable public source (Ministère des Finances et du Budget page lists no rates)",
    notes="impots.gouv.cf returned HTTP 503; the CGI 2025/2026 exists only in print. No Big-4 or IMF rate table located.",
)

# ----------------------------------------------------------------------------------------------------------------
# Americas
# ----------------------------------------------------------------------------------------------------------------
t = Pwc("GT", "guatemala")
R += t.vat(12, notes="Exports exempt (not described as zero-rated).")
R += t.cit(25, desc="General regime on net income (optional simplified regime: 5%/7% on gross income)")
R += t.pit(7, notes="5% to GTQ 300,000; GTQ 15,000 plus 7% on the excess.")
R += t.wht(5, 10, 15, notes="Other payments 25%; Guatemala has no tax treaties in force.")

t = Pwc("HN", "honduras")
R += t.vat(
    15,
    higher=[18],
    desc="Sales tax (ISV) general rate",
    notes="18% on alcoholic beverages, tobacco and first/business-class air tickets.",
)
R += t.cit(
    25,
    notes="Plus 5% solidarity contribution on taxable income above HNL 1m; minimum tax 1% of gross income above HNL 1bn.",
)
R += t.pit(25, notes="Exempt to HNL 228,324; 15/20%; 25% above HNL 809,661.")
R += t.wht(10, 10, 25, notes="Honduras has no tax treaties.")

t = Pwc("SV", "el-salvador")
R += t.vat(13, zero=True)
R += t.cit(30, notes="25% for taxable income ≤ USD 150,000; territorial system.")
R += t.pit(30, notes="30% above USD 22,857; non-domiciled individuals flat 30%.")
R += t.wht(5, 20, 20, notes="25% for tax-haven recipients; 5% also on certain intangibles.")

t = Pwc("NI", "nicaragua")
R += t.vat(15, zero=True)
R += t.cit(30, desc="Higher of 30% of net taxable income or a definitive minimum tax of 1–3% of gross income")
R += t.pit(30, notes="0/15/20/25/30%; 30% above NIO 500,000; non-residents 20% definitive WHT.")
R += t.wht(15, 15, 15, notes="Services 20%; tax-haven payments 30%; no tax treaties.")

t = Pwc("CR", "costa-rica")
R += t.vat(
    13,
    [4, 2, 1, 0.5],
    frm="2019-07-01",
    applies="4%: private health, domestic flights; 2%: medicines, private education, insurance; 1%: basic goods; 0.5%: organic agriculture",
)
R += t.cit(
    30, notes="Small companies (gross income ≤ CRC 119m) 5–20% brackets; non-residents without a PE taxed via WHT."
)
R += t.pit(25, notes="Self-employed 2026: 0% to CRC 4.09m … 25% above CRC 20.4m; salaries 0–25%.")
R += t.wht(
    15,
    15,
    25,
    div_notes="5% or 15% depending on the distributing entity.",
    int_notes="5.5% for foreign banks in regulated CR financial groups, rising to 15%.",
)

t = Pwc("PA", "panama")
R += t.vat(
    7,
    higher=[10, 15],
    zero=True,
    desc="ITBMS (VAT) general rate",
    notes="10% alcoholic beverages and hotel accommodation; 15% tobacco; exports untaxed with input refund.",
)
R += t.cit(
    25,
    notes="CAIR alternative: greater of net taxable income or 4.67% of gross income for taxable income > USD 1.5m; territorial system.",
)
R += t.pit(25, notes="0% to USD 11,000; 15% to 50,000; 25% above.")
R += t.wht(10, 12.5, 12.5, div_notes="5%/10%/20% depending on the source of profits and share type.")

DGII_ITBIS = "https://dgii.gov.do/cicloContribuyente/obligacionesTributarias/principalesImpuestos/Paginas/ITBIS.aspx"
t = Pwc("DO", "dominican-republic")
R += t.vat(
    18,
    zero=True,
    desc="ITBIS (VAT) standard rate",
    notes="0% on exports including sales to free-trade zones; 3.5% on FTZ sales to the local market.",
)
R += t.cit(
    27,
    notes="30% transitional rate for fiscal years 2026–2028 for taxpayers with income ≥ DOP 1bn; 1% assets tax as alternative minimum.",
)
R += t.pit(25, notes="0% to DOP 416,220; 15/20%; 25% above DOP 867,123.")
R += t.wht(10, 10, 27, roy_notes="27% on royalties, technical assistance and other services.")

LEY113 = "https://uva.uart.edu.cu/pluginfile.php/18108/mod_folder/content/0/02-%20Leyes/Ley%20113%20-%202012%20Del%20Sistema%20Tributario%20actualizada%202024.pdf?forcedownload=1"
CU_SRC = "Ley No. 113 del Sistema Tributario (consolidated text, 2024)"
R += NOVAT(
    "CU",
    "No VAT; sales tax (impuesto sobre las ventas) and services tax (impuesto sobre los servicios) under Ley 113/2012 apply",
    url=LEY113,
    src=CU_SRC,
)
R += V(
    "CU",
    10,
    tax_type="sales_use",
    frm="2020-12-10",
    url=LEY113,
    src=f"{CU_SRC}, arts. 136–152",
    desc="Sales tax on retail sales by natural persons / services tax (10%); entity rates set by the Ministry of Finance and Prices",
)
R += C(
    "CU",
    35,
    frm="2013-01-01",
    url=LEY113,
    src=f"{CU_SRC}, art. 97",
    desc="Impuesto sobre utilidades — up to 35% (Council of Ministers may raise to 50% for natural-resource exploitation; agricultural cooperatives 17.5%)",
)
R += P(
    "CU",
    50,
    url=LEY113,
    src=f"{CU_SRC}, art. 26",
    notes="Annual scale 15/20/30/40/50%; 50% above CUP 50,000 (exempt minimum CUP 39,120).",
)
R += W(
    "CU",
    4,
    4,
    4,
    url=LEY113,
    src=f"{CU_SRC}, arts. 73, 98–99",
    notes="Flat 4% on gross Cuban-source income of foreign legal persons without a PE; no separate dividend/interest/royalty schedule.",
)
R += P2(
    "CU",
    "Not adopted (no IIR, UTPR or QDMTT).",
    adopted=False,
    url="https://taxfoundation.org/data/all/global/corporate-tax-rates-by-country-2025/",
    src="Tax Foundation – corporate tax rates by country 2025 (secondary)",
)

t = Pwc("JM", "jamaica")
R += t.vat(
    15,
    [10],
    higher=[25],
    zero=True,
    thr=15_000_000,
    cur="JMD",
    desc="General Consumption Tax (GCT) standard rate",
    applies="Tourism sector (effective ~10%)",
    thr_notes="Raised from JMD 10m on 1 Apr 2025.",
    notes="25% on telephone services and handsets.",
)
R += t.cit(25, desc="Unregulated companies 25% (regulated companies 33⅓%; building societies 30%)")
R += t.pit(30, notes="25% to JMD 6m; 30% above; tax-free threshold JMD 1,902,360 from 1 Apr 2026.")
R += t.wht(
    15,
    15,
    33.33,
    div_notes="Non-resident corporations 15% from 1 Apr 2025 (previously 33⅓%).",
    roy_notes="33⅓% to non-resident corporations; 25% to non-resident individuals.",
)

t = Pwc("TT", "trinidad-and-tobago")
R += t.vat(
    12.5,
    zero=True,
    thr=600_000,
    cur="TTD",
    notes="Basic food, agricultural supplies, crude oil, natural gas, exports and yachting services zero-rated.",
)
R += t.cit(
    30,
    notes="35% petrochemicals and commercial banks; petroleum profits tax 50%; business levy 0.6% and green fund levy 0.3% of gross revenue.",
)
R += t.pit(30, notes="25% on chargeable income up to TTD 1m; 30% above.")
R += t.wht(
    8,
    15,
    15,
    div_notes="3% to parent companies, 8% to other non-resident companies, 10% to individuals.",
    notes="Statutory rates apply where a treaty rate would be higher (from 1 Jan 2022).",
)

BS_IR = "Department of Inland Revenue, The Bahamas"
BS_VAT = "https://inlandrevenue.finance.gov.bs/value-added-tax/about-vat/"
BS_DMTT = "https://inlandrevenue.finance.gov.bs/dmtt/"
t = Pwc("BS", "the-bahamas")
R += t.vat(
    10,
    [5],
    zero=True,
    thr=100_000,
    cur="BSD",
    applies="Medical and hygiene products",
    notes="Unprepared food sold in food stores exempt from 1 Apr 2026.",
)
R += t.cit(
    0,
    desc="No corporate income tax; business licence fee on turnover (Business Licence Act 2023); 15% DMTT for in-scope MNE groups from 2025",
)
R += t.pit(0, desc="No personal income tax")
R += t.wht(0, 0, 0, notes="The Bahamas imposes no withholding taxes.")
R += t.p2(
    "Domestic Minimum Top-up Tax Act 2024 (enacted 29 Nov 2024): 15% DMTT for MNE groups ≥ EUR 750m, applying from fiscal years beginning 1 Jan 2025 (2024 only where the group is subject to an IIR/UTPR elsewhere).",
    frm="2025-01-01",
)

t = Pwc("BB", "barbados")
R += t.vat(
    17.5,
    [10],
    higher=[22],
    zero=True,
    thr=200_000,
    cur="BBD",
    applies="Hotel and tourism accommodation",
    notes="22% on mobile voice, data and text services; digital services VAT from 1 Dec 2019.",
)
R += t.cit(
    9,
    frm="2024-01-01",
    desc="Standard CIT rate from income year 2024 (approved small businesses 5.5%; international shipping 1–5.5%; in-scope MNE members pay a 15% top-up)",
)
R += t.pit(28.5, notes="12.5% basic rate; 28.5% above BBD 50,000 (from 1 Jan 2020).")
R += t.wht(
    0,
    0,
    0,
    div_notes="0% where paid out of foreign-source income; otherwise 5%.",
    notes="No WHT on interest, royalties or management fees to non-treaty non-residents.",
)
R += t.p2(
    "Corporation Top-up Tax Act 2024: 15% QDMTT for MNE groups ≥ EUR 750m from 1 January 2024 (de-minimis exclusion and transitional CbCR safe harbour).",
    frm="2024-01-01",
)

BTS = "Belize Tax Service"
R += V(
    "BZ",
    12.5,
    tax_type="gst",
    zero=True,
    thr=75_000,
    cur="BZD",
    url="https://bts.gov.bz/guide/file-your-general-sales-tax-return",
    src=f"{BTS} – general sales tax return guide",
    desc="General Sales Tax (VAT-type) standard rate",
    notes="bts.gov.bz is a single-page app; text read from its public CMS API (Mar 2026).",
)
R += C(
    "BZ",
    None,
    url="https://bts.gov.bz/guide/business-tax-guide",
    src=f"{BTS} – business tax guide",
    desc="No profit-based corporate income tax for most businesses: business tax on gross receipts (1.75% general trade; 1.75–19% by sector) under the Income and Business Tax Act",
)
R += P(
    "BZ",
    25,
    url="https://bts.gov.bz/guide/file-your-personal-income-tax-form",
    src=f"{BTS} – personal income tax guide",
    desc="Flat employee income tax rate (25%; personal relief BZD 25,600)",
)
R += W(
    "BZ",
    15,
    15,
    None,
    url="https://bts.gov.bz/guide/business-tax-guide",
    src=f"{BTS} – business tax guide, s.10.1 taxation of non-residents",
    notes="Management fees, technical services, rental of plant and insurance premiums 25%; royalties not in the domestic non-resident list.",
)
R += P2(
    "BZ",
    "Not adopted (no IIR, UTPR or QDMTT).",
    adopted=False,
    url="https://taxfoundation.org/data/all/global/corporate-tax-rates-by-country-2025/",
    src="Tax Foundation – corporate tax rates by country 2025 (secondary)",
)

DGI_HT = "Direction Générale des Impôts, Haïti"
R += NOVAT(
    "HT",
    "No VAT; taxe sur le chiffre d'affaires (TCA) turnover tax of 10% on sales and services",
    url="https://hditcabinetvolmar.com/fr/obligations-financieres-et-legales-des-entreprises-en-haiti/",
    src="HDIT Cabinet Volmar – obligations des entreprises en Haïti (secondary)",
)
R += V(
    "HT",
    10,
    tax_type="sales_use",
    url="https://hditcabinetvolmar.com/fr/obligations-financieres-et-legales-des-entreprises-en-haiti/",
    src="HDIT Cabinet Volmar – obligations des entreprises en Haïti (secondary)",
    desc="Taxe sur le chiffre d'affaires (TCA) rate",
    notes="Rate seen only on a secondary page; verify against the TCA decree.",
)
R += C(
    "HT",
    30,
    frm="2005-09-29",
    url="https://metienne.wordpress.com/2014/06/16/decret-du-29-septembre-2005-modifiant-celui-du-29-septembre-1986-relatif-a-limpot-sur-le-revenu/",
    src="Décret du 29 septembre 2005 (impôt sur le revenu), art. 149 B – text reproduced by J. E. Etienne (secondary host)",
    notes="Forfait regime 1% of turnover below HTG 1.25m.",
)
R += P(
    "HT",
    30,
    url="https://dgi.gouv.ht/dgi_sev/declaration-definitive-impot-revenu/",
    src=f"{DGI_HT} – déclaration définitive d'impôt sur le revenu",
    notes="0% to HTG 60,000; 10/15/25%; 30% above HTG 1m.",
)
R += W(
    "HT",
    20,
    15,
    20,
    url="https://dgi.gouv.ht/dgi_sev/les-retenus-a-la-source/",
    src=f"{DGI_HT} – retenues à la source",
    roy_notes="20% on patent/trademark licence income (final).",
)

t = Pwc("UY", "uruguay")
R += t.vat(
    22,
    [10],
    zero=True,
    applies="Food, medicines, hotel and health services, first sale of immovable property",
    notes="Law 19,210 reduces VAT by 2 points on final-consumer sales paid by debit card or e-money.",
)
R += t.cit(25, notes="Source principle; trading companies notional 3% of gross margin.")
R += t.pit(36, notes="IRPF on work income 10–36%; 36% above UYU 9,472,320 (2025).")
R += t.wht(7, 12, 12, notes="25% for entities in low/no-tax jurisdictions.")
R += t.p2(
    "Domestic Minimum Top-up Tax: 15% minimum effective rate for MNE groups ≥ EUR 750m following the GloBE Model Rules; qualified status pending OECD review; effective date not stated on the source."
)

t = Pwc("PY", "paraguay")
R += t.vat(10, [5], applies="Housing leases, real estate sales, family-basket foods, agricultural products, medicines")
R += t.cit(
    10,
    desc="Business income tax (IRE) rate",
    notes="IRE SIMPLE for income ≤ PYG 2bn; RESIMPLE for sole proprietors ≤ PYG 80m.",
)
R += t.pit(10, desc="Personal income tax (IRP) top rate on personal services (8%/9%/10%)")
R += t.wht(
    None,
    15,
    15,
    notes="Non-resident tax (INR) applies 15% to presumed-income bases that vary by payment type; dividends to non-residents taxed under the IDU (not stated on the WHT page).",
)

t = Pwc("BO", "bolivia")
R += t.vat(
    13, desc="VAT (IVA) standard rate (tax-inclusive base; Law 1733 requires separate display once its decree issues)"
)
R += t.cit(
    25,
    notes="25% surtax on extractive activities; additional 25% for financial institutions with ROE > 6%; 3% transaction tax (IT) on gross income, creditable.",
)
R += t.pit(13, desc="RC-IVA flat rate on personal income")
R += t.wht(12.5, 12.5, 12.5, notes="25% on a deemed 50% profit margin.")

SRI = "Servicio de Rentas Internas (SRI), Ecuador"
SRI_IVA = "https://www.sri.gob.ec/impuesto-al-valor-agregado-iva"
t = Pwc("EC", "ecuador")
R += t.vat(
    15,
    [5],
    frm="2024-04-01",
    zero=True,
    applies="Local transfers of construction materials (from Mar 2024)",
    notes="Raised from 12% on 1 Apr 2024 (Decreto Ejecutivo 198).",
)
R += t.hist("vat", "standard", 12, None, "2024-03-31", "VAT standard rate to 31 Mar 2024")
R += t.cit(
    25,
    desc="General CIT rate (22%/25%/28% depending on shareholder structure and ownership disclosure)",
    notes="Free-trade-zone entities 0% for five years then 15%.",
)
R += t.pit(37, notes="2026 table: 0% to USD 12,208 … 37% above USD 109,956; non-residents 25%.")
R += t.wht(
    10,
    25,
    25,
    div_notes="14% where the ownership structure is not disclosed.",
    notes="37% where the beneficiary is in a tax haven.",
)

t = Pwc("VE", "venezuela")
R += t.vat(
    16,
    [8],
    zero=True,
    notes="Statutory range 8–16.5%, set annually; 15% additional rate on luxury goods; 5–25% surcharge on transactions paid in foreign currency or crypto.",
)
R += t.cit(34, desc="Top rate of Tariff 2 (15%/22%/34% in tax units; 50% oil exploitation; 40% banks and insurers)")
R += t.pit(34, notes="Tariff 1 progressive 6–34%; non-residents flat 34%.")
R += t.wht(
    34,
    4.95,
    30.6,
    div_notes="Only on the excess of distributed profits over profits taxed at corporate level.",
    int_notes="4.95% to foreign financial institutions; other interest taxed under Tariff 2 on 95% of gross.",
    roy_notes="Tariff 2 applied to 90% of gross (maximum 30.6%).",
)

t = Pwc("GY", "guyana")
R += t.vat(14, zero=True, notes="Exports and certain medical supplies zero-rated.")
R += t.cit(
    25,
    desc="Non-commercial companies 25% (commercial companies 40%; telephone companies 45%)",
    notes="Minimum corporation tax 2% of turnover for commercial companies.",
)
R += t.pit(35, notes="25% to GYD 3.36m; 35% above.")
R += t.wht(20, 20, 20, notes="The 20% statutory rate applies where a treaty rate would be higher.")

BD_SR = "Belastingdienst Suriname"
SR_IB = "https://belastingdienst.sr/wp-content/uploads/2024/10/Wet-Inkomstenbelasting.pdf"
R += V(
    "SR",
    10,
    [5],
    higher=[25],
    zero=True,
    thr=1_000_000,
    cur="SRD",
    frm="2023-01-01",
    url="https://belastingdienst.sr/wp-content/uploads/2025/06/Brochure-met-een-beschrijving-van-de-BTW-wetgeving-op-hoofdlijnen-2025.pdf",
    src=f"{BD_SR} – BTW brochure (Apr 2025)",
    desc="Belasting over de Toegevoegde Waarde (BTW) standard rate",
    applies="Household water, electricity, cooking gas and listed items",
    notes="BTW replaced the turnover tax on 1 Jan 2023; 25% on luxury goods.",
)
R += C("SR", 36, url=SR_IB, src=f"{BD_SR} – Wet Inkomstenbelasting 1922 (as amended S.B. 2024 no. 3), art. 36")
R += P(
    "SR",
    38,
    url=SR_IB,
    src=f"{BD_SR} – Wet Inkomstenbelasting 1922, art. 34",
    notes="First SRD 108,000 nil; 8/18/28%; 38% above SRD 234,000.",
)
R += W(
    "SR",
    25,
    None,
    None,
    url="https://belastingdienst.sr/wp-content/uploads/2024/10/Wet-Dividendbelasting.pdf",
    src=f"{BD_SR} – Wet Dividendbelasting, art. 5",
    notes="No withholding tax on interest or royalties located in the income tax act.",
)

t = Pwc("PR", "puerto-rico")
R += t.vat(
    11.5,
    [4],
    tax_type="sales_use",
    desc="Sales and use tax (IVU): 10.5% Commonwealth plus 1% municipal",
    applies="Business-to-business and designated professional services",
    notes="Exports exempt (not zero-rated); every merchant must register.",
)
R += t.cit(
    37.5,
    desc="Maximum nominal CIT rate (18.5% normal tax plus graduated surtax of 5–19%)",
    notes="Alternative minimum tax 18.5% (23% for gross proceeds ≥ USD 10m).",
)
R += t.pit(
    33, notes="33% above USD 61,500 plus 5% gradual adjustment above USD 500,000; alternate basic tax up to 24%."
)
R += t.wht(
    10,
    29,
    29,
    notes="29% on FDAP income of corporations not engaged in a Puerto Rico trade or business; no tax treaties.",
)

t = Pwc("BM", "bermuda")
R += t.novat("No VAT or sales tax in Bermuda (customs import duty, commonly 25%, and payroll tax instead)")
R += t.cit(
    15,
    frm="2025-01-01",
    desc="Corporate Income Tax Act 2023: 15% on Bermuda constituent entities of MNE groups with revenue ≥ EUR 750m from fiscal years beginning 1 Jan 2025; all other businesses remain untaxed on profits",
    notes="Tax Assurance Certificates do not shield in-scope entities.",
)
R += t.hist(
    "corporate_income",
    "headline",
    0,
    None,
    "2024-12-31",
    "No corporate income tax before 2025",
    page="corporate/taxes-on-corporate-income",
)
R += t.pit(0, desc="No personal income tax (employee share of payroll tax 0.5–12.5%)")
R += t.wht(0, 0, 0, notes="No withholding taxes, unchanged under the CIT regime.")
R += t.p2(
    "No IIR/QDMTT/UTPR; Bermuda's Pillar Two response is the 15% Corporate Income Tax (from 2025) on in-scope MNE groups, computed on GloBE-style financial accounting income with an economic transition adjustment.",
    frm="2025-01-01",
)

t = Pwc("KY", "cayman-islands")
R += t.novat(
    "No VAT or sales tax in the Cayman Islands (import duty generally 22–27%; stamp duty 7.5% on real property)"
)
R += t.cit(
    0,
    desc="No corporate income tax; economic-substance regime (International Tax Co-operation (Economic Substance) Act) applies to relevant entities",
)
R += t.pit(0, desc="No personal income tax")
R += t.wht(0, 0, 0, notes="No withholding taxes on dividends, interest or royalties.")

DTT_VG = "https://www.deloitte.com/content/dam/assets-shared/docs/services/tax/2025/dttl-tax-britishvirginislandshighlights-2025.pdf"
VG_SRC = "Deloitte International Tax – British Virgin Islands Highlights 2025 (secondary)"
R += NOVAT(
    "VG",
    "No VAT, GST or sales tax (import duties, 12% stamp duty on property transfers and payroll tax instead)",
    url=DTT_VG,
    src=VG_SRC,
)
R += C(
    "VG",
    0,
    url=DTT_VG,
    src=VG_SRC,
    desc="No corporate income tax; economic-substance regime (Economic Substance (Companies and Limited Partnerships) Act 2018) and payroll tax apply",
)
R += P("VG", 0, url=DTT_VG, src=VG_SRC, desc="No personal income tax (8% employee payroll tax above USD 10,000)")
R += W(
    "VG",
    0,
    0,
    0,
    url=DTT_VG,
    src=VG_SRC,
    notes="No WHT on dividends, interest, royalties or technical fees; no tax treaties.",
)
R += P2(
    "VG",
    "Not adopted: no announcements on implementing GloBE/Pillar Two rules (Deloitte, Jan 2025).",
    adopted=False,
    url=DTT_VG,
    src=VG_SRC,
)

DTT_AW = "https://www.deloitte.com/content/dam/assets-shared/docs/services/tax/2026/dttl-tax-arubahighlights-2026.pdf"
AW_DI = "Departamento di Impuesto, Aruba"
R += NOVAT(
    "AW",
    "No VAT (introduction shelved); cumulative turnover taxes BBO 2.5% + BAVP 1.5% + BAZV 3% (7% combined) apply, including on imports since Aug 2023",
    url="https://www.impuesto.aw/hoeveel-bbo-en-bavp-moet-u-betalen",
    src=AW_DI,
)
R += V(
    "AW",
    7,
    tax_type="sales_use",
    frm="2023-01-01",
    thr=50_000,
    cur="AWG",
    url="https://www.impuesto.aw/hoeveel-bbo-en-bavp-moet-u-betalen",
    src=AW_DI,
    desc="Combined turnover taxes BBO + BAVP + BAZV (cumulative, not a VAT)",
    thr_notes="Small-entrepreneur relief below AWG 50,000.",
    notes="6% from 1 Jul 2018; 7% from 1 Jan 2023.",
)
R += C(
    "AW",
    22,
    url=DTT_AW,
    src="Deloitte International Tax – Aruba Highlights 2026 (secondary)",
    notes="Free-zone 2%; oil refinery/terminal 6–10%; IPC regime abolished from 2023.",
)
R += P(
    "AW",
    52,
    url="https://www.impuesto.aw/tarief-inkomstenbelasting-en-loonbelasting",
    src=f"{AW_DI} – tarief inkomstenbelasting 2026",
    notes="2026: 0% to AWG 34,930; 21/42%; 52% above AWG 135,527.",
)
R += W(
    "AW",
    10,
    0,
    0,
    url=DTT_AW,
    src="Deloitte International Tax – Aruba Highlights 2026 (secondary)",
    div_notes="10% to non-resident companies (5% for qualifying holdings; 0% in certain cases); dividend WHT law effective 1 Jan 2026.",
)
R += P2(
    "AW",
    "Not adopted: Aruba has not implemented GloBE/Pillar Two rules (Deloitte, Jan 2026).",
    adopted=False,
    url=DTT_AW,
    src="Deloitte International Tax – Aruba Highlights 2026 (secondary)",
)

BD_CW = "Belastingdienst Curaçao"
R += NOVAT(
    "CW",
    "No VAT; cumulative sales tax (omzetbelasting, OB) at 6% general rate (7% insurance and short-stay lodging; 9% listed goods and services)",
    url="https://belastingdienst.cw/ondernemer/themas/omzetbelasting/",
    src=BD_CW,
)
R += V(
    "CW",
    6,
    higher=[7, 9],
    tax_type="sales_use",
    url="https://belastingdienst.cw/ondernemer/themas/omzetbelasting/",
    src=BD_CW,
    desc="Omzetbelasting (OB) general rate (cumulative sales tax, not a VAT)",
)
R += C(
    "CW",
    22,
    frm="2023-01-01",
    url="https://belastingdienst.cw/ondernemer/themas/winstbelasting/",
    src=BD_CW,
    desc="Winstbelasting — 22% above XCG 500,000 taxable profit (15% on the first XCG 500,000); territorial system",
)
R += P(
    "CW",
    46.5,
    url="https://belastingdienst.cw/particulier/themas/belastingtarieven/",
    src=BD_CW,
    notes="Progressive 9.75%–46.5%.",
)
R += W(
    "CW",
    0,
    0,
    0,
    url="https://www.deloitte.com/content/dam/assets-shared/docs/services/tax/2026/dttl-tax-curacaohighlights-2026.pdf",
    src="Deloitte International Tax – Curaçao Highlights 2026 (secondary)",
    notes="No WHT on dividends, interest or royalties to non-residents.",
)
R += P2(
    "CW",
    "Partial: IIR to be introduced with retroactive effect from 1 Jan 2025; QDMTT and UTPR will not be implemented following the OECD side-by-side package (Ministry of Finance, 13 Apr 2026).",
    adopted=False,
    url="https://minfin.cw/en/updates/curacao-bepaalt-koers-ten-aanzien-van-invoering-pillar-2-na-publicatie-oeso-side-by-side-package-2/",
    src="Ministry of Finance, Curaçao",
)

DTT_SX = (
    "https://www.deloitte.com/content/dam/assets-shared/docs/services/tax/2026/dttl-tax-sintmaartenhighlights-2026.pdf"
)
SX_SRC = "Deloitte International Tax – Sint Maarten Highlights 2026 (secondary)"
R += NOVAT("SX", "No VAT; turnover tax (belasting op bedrijfsomzetten, BBO) at 5% applies", url=DTT_SX, src=SX_SRC)
R += V("SX", 5, tax_type="sales_use", url=DTT_SX, src=SX_SRC, desc="Turnover tax (BBO) standard rate")
R += C("SX", 34.5, url=DTT_SX, src=SX_SRC, desc="Corporate income tax 30% plus 15% surtax on the tax (effective 34.5%)")
R += P(
    "SX",
    47.5,
    url=DTT_SX,
    src=SX_SRC,
    notes="2026 table including 25% surtax: 12.5% to XCG 36,576 … 47.5% above XCG 161,540.",
)
R += W(
    "SX",
    0,
    0,
    0,
    url=DTT_SX,
    src=SX_SRC,
    notes="No WHT; a 10% creditable dividend withholding tax has been proposed but not enacted.",
)
R += P2(
    "SX",
    "Not adopted: Sint Maarten has not committed to GloBE/Pillar Two rules (Deloitte, Apr 2026).",
    adopted=False,
    url=DTT_SX,
    src=SX_SRC,
)

DTT_AG = "https://www.deloitte.com/content/dam/assets-shared/docs/services/tax/2026/dttl-tax-antiguaandbarbudahighlights-2026.pdf"
AG_SRC = "Deloitte International Tax – Antigua and Barbuda Highlights 2026 (secondary)"
R += V(
    "AG",
    17,
    [14],
    zero=True,
    thr=300_000,
    cur="XCD",
    url=DTT_AG,
    src=AG_SRC,
    desc="Antigua and Barbuda Sales Tax (ABST, VAT-type) standard rate",
    applies="Hotels",
    notes="IRD FAQ page still shows the pre-2024 15% rate.",
)
R += C(
    "AG",
    25,
    url=DTT_AG,
    src=AG_SRC,
    notes="22.5% mortgage-lending banks; 10% insurers, certain financial institutions, petroleum and telecoms.",
)
R += P(
    "AG",
    0,
    url=DTT_AG,
    src=AG_SRC,
    desc="No personal income tax (abolished 2016); unincorporated business tax applies to business income",
)
R += W(
    "AG",
    0,
    25,
    25,
    url=DTT_AG,
    src=AG_SRC,
    div_notes="Dividends not subject to WHT (Deloitte; KPMG shows a rate — conflict flagged).",
)
R += P2(
    "AG",
    "Not adopted: Antigua and Barbuda has not committed to GloBE/Pillar Two rules (Deloitte 2026).",
    adopted=False,
    url=DTT_AG,
    src=AG_SRC,
)

GD_IRD_VAT = "http://web.archive.org/web/20250813011224/https://ird.gd/index.php/taxes/value-added-tax"
DTT_GD = "https://www.deloitte.com/content/dam/assets-shared/docs/services/tax/2026/dttl-tax-grenadahighlights-2026.pdf"
R += V(
    "GD",
    15,
    [10, 7.5],
    higher=[20],
    zero=True,
    thr=300_000,
    cur="XCD",
    frm="2010-02-01",
    url=GD_IRD_VAT,
    src="Grenada Inland Revenue Division – VAT (Wayback Machine capture, 13 Aug 2025)",
    applies="10%: hotel accommodation and dive operations; 7.5%: electricity",
    notes="20% on mobile phone services. ird.gd currently redirects to Facebook.",
)
R += C(
    "GD",
    28,
    url=DTT_GD,
    src="Deloitte International Tax – Grenada Highlights 2026 (secondary)",
    notes="Ministry of Finance page still states 30% (outdated).",
)
R += P(
    "GD",
    28,
    url=DTT_GD,
    src="Deloitte International Tax – Grenada Highlights 2026 (secondary)",
    notes="10% on the first XCD 24,000; 28% above; personal allowance XCD 36,000.",
)
R += W(
    "GD",
    15,
    15,
    15,
    url="http://web.archive.org/web/20250813002104/https://ird.gd/index.php/taxes/withholding-tax",
    src="Grenada Inland Revenue Division – withholding tax (Wayback Machine capture, 13 Aug 2025)",
    notes="Withholding Tax Act 36/1994: 15% on payments to non-residents.",
)

IRD_VC = "Inland Revenue Department, St Vincent and the Grenadines"
R += V(
    "VC",
    16,
    [11],
    zero=True,
    thr=300_000,
    cur="XCD",
    url="https://ird.gov.vc/index.php/taxes",
    src=IRD_VC,
    applies="Accommodation",
)
R += C(
    "VC",
    28,
    url="https://ird.gov.vc/index.php/taxes",
    src=IRD_VC,
    notes="KPMG (Dec 2025) reported announced direct/indirect rate cuts for 2026 — not reflected on the IRD page.",
)
R += P(
    "VC",
    28,
    url="https://ird.gov.vc/images/pdf/tax-tables-2024.pdf",
    src=f"{IRD_VC} – tax tables (effective 1 Jan 2024)",
    notes="10% to XCD 5,000; 20% to 10,000; 28% above.",
)
R += W(
    "VC",
    0,
    20,
    20,
    url="https://ird.gov.vc/index.php/taxes",
    src=IRD_VC,
    div_notes="IRD page lists no dividend WHT; KPMG WHT guide 2026 shows 0%.",
    notes="Standard 20% on services and other payments to non-residents; CARICOM royalties/interest/management fees 15%.",
)

SKN_IRD = "St Kitts and Nevis Inland Revenue Department"
R += V(
    "KN",
    17,
    [10],
    zero=True,
    thr=150_000,
    cur="XCD",
    url="https://www.sknird.com/inland-revenue-department-announces-discounts-vat-rate-days-in-august-2026-and-opens-applications-for-businesses/",
    src=f"{SKN_IRD} – discounted VAT rate days (Aug 2026)",
    thr_notes="XCD 150,000 (XCD 96,000 for services).",
)
R += C(
    "KN",
    25,
    frm="2024-01-01",
    url="https://www.sknis.gov.kn/2023/12/13/corporate-income-tax-rate-in-st-kitts-and-nevis-set-at-25-from-january-2024/",
    src="St Kitts and Nevis Information Service – CIT set at 25% from January 2024",
    notes="Follows temporary reductions through 2023; aggregators still quote 33%.",
)
R += P(
    "KN",
    0,
    url="https://www.sknird.com/corporate-income-tax/",
    src=SKN_IRD,
    desc="No personal income tax (abolished 1980); unincorporated business tax applies",
)
R += W(
    "KN",
    15,
    15,
    15,
    url="https://www.deloitte.com/content/dam/assets-shared/docs/services/tax/2026/dttl-tax-stkittsandnevishighlights-2026.pdf",
    src="Deloitte International Tax – St Kitts and Nevis Highlights 2026 (secondary)",
    notes="Technical service fees 15%; 0% to residents.",
)
R += P2(
    "KN",
    "Not adopted: St Kitts and Nevis has not committed to GloBE/Pillar Two rules (Deloitte 2026).",
    adopted=False,
    url="https://www.deloitte.com/content/dam/assets-shared/docs/services/tax/2026/dttl-tax-stkittsandnevishighlights-2026.pdf",
    src="Deloitte International Tax – St Kitts and Nevis Highlights 2026 (secondary)",
)

IRD_DM = "Inland Revenue Division, Commonwealth of Dominica"
R += V(
    "DM",
    15,
    [10],
    zero=True,
    frm="2006-03-01",
    url="https://ird.gov.dm/tax-laws/value-added-tax",
    src=IRD_DM,
    applies="Accommodation and diving activities",
)
R += C("DM", 25, frm="2016-01-01", url="https://ird.gov.dm/customer-service/current-income-tax-rates", src=IRD_DM)
R += P(
    "DM",
    35,
    frm="2018-01-01",
    url="https://ird.gov.dm/customer-service/current-income-tax-rates",
    src=IRD_DM,
    notes="First XCD 30,000 exempt; 15% to 50,000; 25% to 80,000; 35% above.",
)
R += W(
    "DM",
    15,
    15,
    15,
    url="https://ird.gov.dm/tax-laws/withholding-tax",
    src=IRD_DM,
    notes="Income Tax Act Chap. 67:01: 15% on dividends, interest, royalties, rents and management fees paid to non-residents.",
)

t = Pwc("LC", "saint-lucia")
R += t.vat(
    12.5,
    [10, 7],
    zero=True,
    thr=400_000,
    cur="XCD",
    applies="10%: hotel sector; 7%: tourism accommodation services (from 1 Dec 2020)",
    notes="2.5% Health and Citizen Security Levy applies alongside VAT (Aug 2023).",
)
R += t.cit(30, notes="33.33% for companies with tax arrears; territorial system since 1 Jan 2019.")
R += t.pit(30, notes="15% to XCD 15,000; 20% to 30,000; 30% above.")
R += t.wht(25, 15, 25, notes="CARICOM recipients 15%.")

IRD_AI = "https://ird.gov.ai/Services/Tax/GenST"
DTT_AI = (
    "https://www.deloitte.com/content/dam/assets-shared/docs/services/tax/2026/dttl-tax-anguillahighlights-2026.pdf"
)
AI_SRC = "Deloitte International Tax – Anguilla Highlights 2026 (secondary)"
R += NOVAT(
    "AI",
    "No VAT; the 2022 Goods and Services Tax was replaced on 1 Aug 2025 by a General Services Tax (13% on services) and a Goods Tax (9% on imports)",
    url=IRD_AI,
    src="Inland Revenue Department, Anguilla – General Services Tax",
)
R += V(
    "AI",
    13,
    higher=[9],
    tax_type="sales_use",
    frm="2025-08-01",
    thr=300_000,
    cur="XCD",
    url=IRD_AI,
    src="Inland Revenue Department, Anguilla – General Services Tax (rates per Deloitte 2026)",
    desc="General Services Tax on services (the 9% row is the Goods Tax on imports)",
    notes="Act PDFs on ird.gov.ai are scanned images; rates taken from Deloitte 2026.",
)
R += C(
    "AI",
    0,
    url=DTT_AI,
    src=AI_SRC,
    desc="No corporate income tax or other direct taxes; Universal Social Levy (3%) and economic-substance rules apply",
)
R += P("AI", 0, url=DTT_AI, src=AI_SRC, desc="No personal income tax (3% Universal Social Levy on wages)")
R += W("AI", 0, 0, 0, url=DTT_AI, src=AI_SRC, notes="No withholding taxes; no tax treaties.")
R += P2(
    "AI",
    "Not adopted: Anguilla has not committed to GloBE/Pillar Two rules (Deloitte, Jan 2026).",
    adopted=False,
    url=DTT_AI,
    src=AI_SRC,
)

MCRS = "Montserrat Customs and Revenue Service"
MS_ICTA = "https://www.gov.ms/wp-content/uploads/2020/06/Income-and-Incorporation-Tax-Act.pdf"
R += NOVAT(
    "MS",
    "No VAT or GST; consumption tax on imported and locally produced goods at tariff-line rates (Customs Duties and Consumption Tax Act, Cap. 17.05)",
    url="https://www.gov.ms/wp-content/uploads/2026/02/17.05-Customs-Duties-and-Consumption-Tax-Act.pdf",
    src="Government of Montserrat – Customs Duties and Consumption Tax Act Cap. 17.05 (rev. 2025)",
)
R += C("MS", 30, url="https://mcrs.ms/company-tax-information/", src=f"{MCRS} – company tax information")
R += P(
    "MS",
    40,
    frm="2024-01-01",
    url="https://parliament.ms/wp-content/uploads/2024/06/Bill-No.-15-of-2024-Income-and-Corporation-Tax-Amendment-Bill-2024-submitted-to-Leg-Ass-18.06.2024.pdf",
    src="Montserrat Legislative Assembly – Income and Corporation Tax (Amendment) Act No. 20 of 2024, Schedule 2",
    notes="From YA 2024: 5/20/25/30%; 40% above XCD 150,000; personal deduction XCD 18,000.",
)
R += W(
    "MS",
    15,
    20,
    20,
    url=MS_ICTA,
    src="Income and Corporation Tax Act Cap. 17.01, s.40 and Schedule 1 para 3 – Government of Montserrat",
    notes="Rental of immovable property 10%; movable property and entertainers 20%.",
)

TCI_REV = "https://gov.tc/revenue/streams"
MS_TC = "https://www.misickstanbrook.tc/wp-content/uploads/2022/08/Country-Guides_TurksCaicosIslands_August2022.pdf"
TC_SRC = "Misick & Stanbrook – Turks and Caicos Islands country guide (Aug 2022) (secondary)"
R += NOVAT(
    "TC",
    "No VAT or GST; five sector sales-type taxes at 12% (hotel and tourism, communications, domestic financial services, vehicle hire) and a 2.5% insurance premium tax, plus customs import duties",
    url=TCI_REV,
    src="TCI Government Revenue Department – revenue streams",
)
R += V(
    "TC",
    12,
    [2.5],
    tax_type="sales_use",
    url=TCI_REV,
    src="TCI Government Revenue Department – revenue streams",
    desc="Sector sales-type taxes (hotel and tourism, communications, domestic financial services, vehicle hire)",
    applies="Insurance premium sales tax",
)
R += C(
    "TC",
    0,
    url=MS_TC,
    src=TC_SRC,
    desc="No corporate income tax or other direct taxes (no income, capital gains, inheritance or corporation taxes)",
)
R += P("TC", 0, url=MS_TC, src=TC_SRC, desc="No personal income tax (National Insurance and NHIP contributions only)")
R += W(
    "TC",
    0,
    0,
    0,
    url=MS_TC,
    src=TC_SRC,
    notes="No income tax regime, hence no withholding taxes (derived; no explicit primary statement).",
)

BIR_VI = "https://bir.vi.gov/content/booklets/tax_structure.pdf"
VI_SRC = "V.I. Bureau of Internal Revenue – Tax Structure Booklet"
USC = "U.S. Code via Cornell LII"
R += NOVAT(
    "VI",
    "No VAT; 5% gross receipts tax (businesses with annual receipts ≥ USD 225,000; USD 9,000/month exemption below), excise tax on imports and 12.5% hotel room tax",
    url=BIR_VI,
    src=VI_SRC,
)
R += V(
    "VI",
    5,
    tax_type="sales_use",
    thr=9_000,
    cur="USD",
    url=BIR_VI,
    src=VI_SRC,
    desc="Gross receipts tax",
    thr_notes="Monthly exemption for businesses with annual gross receipts below USD 225,000.",
)
R += C(
    "VI",
    23.1,
    url=BIR_VI,
    src=f"{VI_SRC}; 48 U.S.C. 1397",
    desc="Mirror-code corporate income tax: 21% federal rate plus 10% territorial surcharge (effective 23.1%)",
)
R += P(
    "VI",
    37,
    url="https://www.law.cornell.edu/uscode/text/26/1",
    src=f"26 U.S.C. 1(j) as mirrored by 48 U.S.C. 1397 – {USC}",
    desc="Mirror-code top individual rate (37%, made permanent by P.L. 119-21)",
)
R += W(
    "VI",
    30,
    30,
    30,
    url="https://www.law.cornell.edu/uscode/text/26/1442",
    src=f"26 U.S.C. 1441/1442 as mirrored by 48 U.S.C. 1397 – {USC}",
    notes="Mirrored IRC chapter 3: 30% on FDAP income paid to foreign persons.",
)

R += NOVAT(
    "GU",
    "No VAT; Business Privilege Tax on gross receipts (4.5% from 1 Oct 2025; 4% from 1 Oct 2026; 3% small business)",
    url="https://www.postguam.com/forum/letter_to_the_editor/guam-chamber-of-commerce-statement-on-veto-override-restoring-bpt-relief/article_808da6cd-5bb1-4ffe-a5fe-32bb8231a806.html",
    src="Guam Daily Post – Chamber statement on Bill 44-38 veto override (Sep 2025) (secondary)",
)
R += V(
    "GU",
    4.5,
    [3],
    tax_type="sales_use",
    frm="2025-10-01",
    url="https://www.postguam.com/forum/letter_to_the_editor/guam-chamber-of-commerce-statement-on-veto-override-restoring-bpt-relief/article_808da6cd-5bb1-4ffe-a5fe-32bb8231a806.html",
    src="Guam Daily Post – Chamber statement on Bill 44-38 veto override (Sep 2025) (secondary)",
    desc="Business Privilege Tax (gross receipts) — 4.5% from 1 Oct 2025, scheduled 4% from 1 Oct 2026",
    applies="Small business rate",
    notes="Public-law text not retrievable; press-sourced.",
)
R += C(
    "GU",
    21,
    frm="2018-01-01",
    url="https://www.law.cornell.edu/uscode/text/48/1421i",
    src=f"48 U.S.C. 1421i (Guam Territorial Income Tax mirror code); 26 U.S.C. 11 – {USC}",
    desc="Mirror-code corporate income tax (IRC §11 rate applied as a separate territorial income tax)",
)
R += P(
    "GU",
    37,
    url="https://www.law.cornell.edu/uscode/text/26/1",
    src=f"26 U.S.C. 1(j) as mirrored by 48 U.S.C. 1421i – {USC}",
    desc="Mirror-code top individual rate (37%)",
)
R += W(
    "GU",
    30,
    30,
    30,
    url="https://www.law.cornell.edu/uscode/text/26/1442",
    src=f"26 U.S.C. 1441/1442 as mirrored by 48 U.S.C. 1421i – {USC}",
    notes="Mirrored IRC chapter 3: 30% on FDAP income paid to foreign persons.",
)

# ----------------------------------------------------------------------------------------------------------------
# Verification pass 2026-08-25 — see docs/data-audit.md, "Country coverage expansion (2026-08)"
# ----------------------------------------------------------------------------------------------------------------
# (jurisdiction, tax_type, rate_kind) whose current value was confirmed on a live primary authority page on
# CHECK_DATE (HTTP 200 and the rate found in the page text). Value None keeps the row's own URL (already primary);
# a URL replaces the PwC landing page the row was authored from. Everything else remains `reported`.
VERIFIED: dict[tuple[str, str, str], str | None] = {
    # Europe / Caucasus
    ("BY", "personal_income", "top_marginal"): None,
    ("AD", "vat", "standard"): None,
    ("AD", "corporate_income", "headline"): None,
    ("AD", "personal_income", "top_marginal"): None,
    ("FO", "vat", "standard"): None,
    ("FO", "withholding", "dividends"): None,
    ("GI", "corporate_income", "headline"): GI_URL,
    ("GG", "corporate_income", "headline"): GG_CO,
    ("JE", "corporate_income", "headline"): JE_CO,
    # Asia
    ("LK", "vat", "standard"): None,
    ("LK", "corporate_income", "headline"): None,
    ("BT", "gst", "standard"): None,
    ("BT", "personal_income", "top_marginal"): None,
    ("BT", "withholding", "dividends"): None,
    ("BT", "withholding", "interest"): None,
    ("BT", "withholding", "royalties"): None,
    ("TJ", "vat", "standard"): None,
    ("TJ", "corporate_income", "headline"): None,
    ("TJ", "personal_income", "top_marginal"): None,
    ("TJ", "withholding", "dividends"): None,
    ("TJ", "withholding", "interest"): None,
    ("TL", "corporate_income", "headline"): None,
    ("TL", "personal_income", "top_marginal"): None,
    ("TL", "withholding", "dividends"): None,
    ("TL", "withholding", "interest"): None,
    ("TL", "withholding", "royalties"): None,
    # Oceania
    ("FJ", "vat", "standard"): None,
    ("FJ", "corporate_income", "headline"): None,
    ("FJ", "personal_income", "top_marginal"): None,
    ("WS", "gst", "standard"): None,
    ("WS", "corporate_income", "headline"): None,
    ("WS", "personal_income", "top_marginal"): None,
    ("TO", "vat", "standard"): None,
    ("TO", "corporate_income", "headline"): None,
    ("TO", "personal_income", "top_marginal"): None,
    ("TO", "withholding", "dividends"): None,
    ("TO", "withholding", "interest"): None,
    ("TO", "withholding", "royalties"): None,
    ("VU", "vat", "standard"): None,
    ("SB", "corporate_income", "headline"): None,
    ("SB", "personal_income", "top_marginal"): None,
    ("SB", "withholding", "dividends"): None,
    ("KI", "vat", "standard"): None,
    ("KI", "corporate_income", "headline"): None,
    ("KI", "personal_income", "top_marginal"): None,
    ("KI", "withholding", "dividends"): None,
    ("KI", "withholding", "interest"): None,
    ("KI", "withholding", "royalties"): None,
    ("FM", "personal_income", "top_marginal"): None,
    ("MH", "personal_income", "top_marginal"): None,
    ("PW", "gst", "standard"): None,
    ("PW", "corporate_income", "headline"): None,
    ("NR", "personal_income", "top_marginal"): None,
    ("NR", "withholding", "interest"): None,
    ("NR", "withholding", "royalties"): None,
    ("TV", "vat", "standard"): None,
    ("TV", "corporate_income", "headline"): None,
    ("TV", "personal_income", "top_marginal"): None,
    ("TV", "withholding", "dividends"): None,
    ("TV", "withholding", "interest"): None,
    ("TV", "withholding", "royalties"): None,
    # Africa
    ("DZ", "vat", "standard"): None,
    ("DZ", "corporate_income", "headline"): None,
    ("DZ", "personal_income", "top_marginal"): None,
    ("DZ", "withholding", "dividends"): None,
    ("SD", "corporate_income", "headline"): None,
    ("SD", "personal_income", "top_marginal"): None,
    ("DJ", "vat", "standard"): None,
    ("DJ", "corporate_income", "headline"): None,
    ("DJ", "personal_income", "top_marginal"): None,
    ("GH", "vat", "standard"): GH_VAT,
    ("GH", "corporate_income", "headline"): GH_CIT,
    ("GM", "vat", "standard"): None,
    ("GM", "corporate_income", "headline"): None,
    ("GM", "withholding", "dividends"): None,
    ("GN", "vat", "standard"): None,
    ("GN", "corporate_income", "headline"): None,
    ("GN", "personal_income", "top_marginal"): None,
    ("GN", "withholding", "dividends"): None,
    ("GN", "withholding", "interest"): None,
    ("GN", "withholding", "royalties"): None,
    ("SL", "gst", "standard"): None,
    ("SL", "corporate_income", "headline"): None,
    ("SL", "personal_income", "top_marginal"): None,
    ("SL", "withholding", "dividends"): None,
    ("SL", "withholding", "interest"): None,
    ("SL", "withholding", "royalties"): None,
    ("ML", "vat", "standard"): None,
    ("ML", "corporate_income", "headline"): None,
    ("ML", "personal_income", "top_marginal"): None,
    ("ML", "withholding", "dividends"): None,
    ("BF", "vat", "standard"): None,
    ("BF", "corporate_income", "headline"): None,
    ("BF", "personal_income", "top_marginal"): None,
    ("BF", "withholding", "dividends"): None,
    ("GW", "vat", "standard"): None,
    ("GW", "corporate_income", "headline"): None,
    ("GW", "personal_income", "top_marginal"): None,
    ("GW", "withholding", "dividends"): None,
    ("GW", "withholding", "interest"): None,
    ("BJ", "vat", "standard"): None,
    ("BJ", "corporate_income", "headline"): None,
    ("BJ", "personal_income", "top_marginal"): None,
    ("BJ", "withholding", "dividends"): None,
    ("TG", "vat", "standard"): None,
    ("TG", "corporate_income", "headline"): None,
    ("TG", "personal_income", "top_marginal"): None,
    ("TG", "withholding", "dividends"): None,
    ("LS", "vat", "standard"): None,
    ("LS", "corporate_income", "headline"): None,
    ("LS", "withholding", "dividends"): None,
    ("LS", "withholding", "interest"): None,
    ("LS", "withholding", "royalties"): None,
    ("SC", "vat", "standard"): None,
    ("SC", "corporate_income", "headline"): None,
    ("SC", "personal_income", "top_marginal"): None,
    ("SC", "withholding", "dividends"): None,
    ("SC", "withholding", "interest"): None,
    ("SC", "withholding", "royalties"): None,
    ("ZW", "vat", "standard"): None,
    ("ZW", "corporate_income", "headline"): None,
    ("ZW", "personal_income", "top_marginal"): None,
    # Americas
    ("DO", "vat", "standard"): DGII_ITBIS,
    ("TT", "vat", "standard"): "https://www.ird.gov.tt/vat",
    ("EC", "vat", "standard"): SRI_IVA,
    ("EC", "corporate_income", "headline"): "https://www.sri.gob.ec/impuesto-renta",
    ("BS", "vat", "standard"): BS_VAT,
    ("BS", "pillar_two", "minimum"): BS_DMTT,
    ("CU", "sales_use", "standard"): None,
    ("CU", "corporate_income", "headline"): None,
    ("CU", "personal_income", "top_marginal"): None,
    ("CU", "withholding", "dividends"): None,
    ("CU", "withholding", "interest"): None,
    ("CU", "withholding", "royalties"): None,
    ("HT", "personal_income", "top_marginal"): None,
    ("HT", "withholding", "dividends"): None,
    ("SR", "vat", "standard"): None,
    ("SR", "corporate_income", "headline"): None,
    ("SR", "personal_income", "top_marginal"): None,
    ("SR", "withholding", "dividends"): None,
    ("CW", "sales_use", "standard"): None,
    ("CW", "corporate_income", "headline"): None,
    ("CW", "personal_income", "top_marginal"): None,
    ("GD", "vat", "standard"): None,
    ("VC", "vat", "standard"): None,
    ("VC", "corporate_income", "headline"): None,
    ("VC", "personal_income", "top_marginal"): None,
    ("KN", "vat", "standard"): None,
    ("KN", "corporate_income", "headline"): None,
    ("DM", "vat", "standard"): None,
    ("DM", "corporate_income", "headline"): None,
    ("DM", "personal_income", "top_marginal"): None,
    ("DM", "withholding", "dividends"): None,
    ("DM", "withholding", "interest"): None,
    ("DM", "withholding", "royalties"): None,
    ("MS", "corporate_income", "headline"): None,
    ("MS", "withholding", "dividends"): None,
    ("TC", "sales_use", "standard"): None,
    ("VI", "corporate_income", "headline"): None,
    ("VI", "personal_income", "top_marginal"): None,
    ("VI", "withholding", "dividends"): None,
    ("VI", "withholding", "interest"): None,
    ("VI", "withholding", "royalties"): None,
    ("GU", "personal_income", "top_marginal"): None,
    ("GU", "withholding", "dividends"): None,
    ("GU", "withholding", "interest"): None,
    ("GU", "withholding", "royalties"): None,
}  # fmt: skip


def _apply_verified(rows: list[dict]) -> None:
    check = d(CHECK_DATE)
    for r in rows:
        if r["effective_to"] is not None:
            continue
        key = (r["jurisdiction_code"], r["tax_type"], r["rate_kind"])
        if key in VERIFIED:
            r["confidence"] = "verified"
            r["as_of"] = check
            if VERIFIED[key]:
                r["source_url"] = VERIFIED[key]


_apply_verified(R)

RATES_COUNTRIES_2: list[dict] = R
