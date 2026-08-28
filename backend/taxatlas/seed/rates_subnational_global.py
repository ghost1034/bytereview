"""Sub-national rates for the 2026-08-25 global expansion: BR (ICMS), CH (cantonal CIT/PIT), DE (GrESt, Gewerbesteuer),
ES (IRPF, ITP), IN (stamp duty, profession tax, petrol VAT), MX (ISN payroll tax), JP (enterprise tax, effective CIT),
IT (IRAP, addizionale regionale), AR (Ingresos Brutos), NG (PIT schedule). CN and AE are geography-only.

Verification 2026-08-25 (docs/data-audit.md, "Sub-national expansion (2026-08)"): `verified` rows were read on the
state/cantonal/regional authority page, statute text or gazette; `reported` rows rest on a secondary copy of the
statute (LegisWeb, dentrode, leyes-ar), a professional-firm summary (KPMG, PwC, Forvis Mazars) or a consistent set
of aggregators, with the primary page bot-blocked or unreachable; `estimated` rows are derived (DE Gewerbesteuer =
3.5% x average Hebesatz). Historical rows carry as_of = effective_to.
"""

from __future__ import annotations

from taxatlas.seed._helpers import rate
from taxatlas.seed.jurisdictions import NG_STATES

AUDIT_DATE = "2026-08-25"
R: list[dict] = []


def _hist(jur, tax_type, kind, history, *, src, url, desc, unit_note=None):
    """Append historical rows: history = [(rate, effective_from|None, effective_to, note)]."""
    for old, frm, to, note in history:
        R.append(
            rate(
                jur,
                tax_type,
                kind,
                old,
                frm=frm,
                to=to,
                as_of=to,
                conf="reported",
                src=src,
                url=url,
                desc=desc,
                notes=note if unit_note is None else f"{note} {unit_note}".strip(),
            )
        )


# ====================================================================================================== Brazil ICMS
LEGISWEB = "LegisWeb (copy of state statute / SEFAZ notice)"
BR_DIFAL = (
    "Internal (intrastate) modal rate. Interstate rates are fixed by Senate Resolutions 22/1989 and 13/2012 at 12% "
    "(general), 7% (from S/SE ex-ES to N/NE/CO/ES) and 4% (imported goods); on interstate sales to final consumers the "
    "destination state collects DIFAL = its internal rate (plus any poverty-fund add-on) minus the interstate rate "
    "(EC 87/2015, LC 190/2022). ICMS continues at full rate through 2028, is phased down 2029-2032 and is extinguished "
    "on 1 Jan 2033 (LC 214/2025; 2026 is the IBS/CBS test year at 0.1%/0.9%)."
)
# code: (rate, effective_from, confidence, source_name, source_url, note, history[(rate, frm, to, note)])
BR_ICMS: dict[str, tuple] = {
    "AC": (
        19.0,
        "2023-04-01",
        "reported",
        LEGISWEB,
        "https://www.legisweb.com.br/noticia/?id=27162",
        "LC 422/2022 amended LC 55/1997 art. 18 (17% -> 19% from 1 Apr 2023); no FECOEP add-on; sefaz.ac.gov.br "
        "unreachable (TLS) so statute page not seen.",
        [(17.0, None, "2023-03-31", "Rate before LC 422/2022")],
    ),
    "AL": (
        20.5,
        "2026-04-01",
        "reported",
        LEGISWEB,
        "https://www.legisweb.com.br/legislacao/?id=495048",
        "Lei 9.776/2025 (DOE-AL 23 Dec 2025) amended Lei 5.900/1996 art. 17 to 20.5% from 1 Apr 2026; FECOEP +1% "
        "(Lei 6.558/2004) applies to most goods, so the SEFAZ-AL comunicado quotes 21.5%; figure excludes FECOEP.",
        [(19.0, None, "2026-03-31", "Rate before Lei 9.776/2025 (SEFAZ-AL Comunicado SURE 3/2026)")],
    ),
    "AM": (
        20.0,
        "2023-04-01",
        "verified",
        "SEFAZ-AM (LC 242/2022)",
        "https://sistemas.sefaz.am.gov.br/get/Normas.do?metodo=viewDoc&uuidDoc=0569a7de-c88a-4bc1-b895-6aaccb7f88b7",
        "LC 242/2022 rewrote LC 19/1997 art. 12 I 'b' to 20%; OS 001/2023-SER/SEFAZ fixes efficacy at 1 Apr 2023; "
        "no poverty-fund add-on on the modal rate.",
        [(18.0, None, "2023-03-31", "Rate before LC 242/2022 (LegisWeb)")],
    ),
    "AP": (
        18.0,
        None,
        "reported",
        LEGISWEB,
        "https://www.legisweb.com.br/legislacao/?id=118630",
        "Lei 400/1997 art. 37 III 'i' (wording from Lei 1.949/2015): 18% for other goods and services; no 2023-2026 "
        "change found; sefaz.ap.gov.br returned 404.",
        [],
    ),
    "BA": (
        20.5,
        "2024-02-07",
        "verified",
        "SEFAZ-BA (Lei 7.014/1996 annotated)",
        "http://mbusca.sefaz.ba.gov.br/DITRI/leis/leis_estaduais/legest_1996_7014_icmscomnotas.pdf",
        "Lei 7.014/1996 art. 15 I: 20.5% per Lei 14.629/2023 with effect 7 Feb 2024 (SEFAZ annotation); no FECOEP on "
        "the modal rate.",
        [
            (19.0, "2023-03-22", "2024-02-06", "Lei 14.527/2022 step (18% -> 19%)"),
            (18.0, None, "2023-03-21", "Rate in force 10 Mar 2016 - 21 Mar 2023"),
        ],
    ),
    "CE": (
        20.0,
        "2024-01-01",
        "verified",
        "SEFAZ-CE (Lei 18.665/2023)",
        "https://sefazlegis.sefaz.ce.gov.br/api/openFile?id=a131b7f7-c712-47a5-843f-57a37b11d319",
        "Lei 18.665/2023 art. 65 I 'g': 20% from 1 Jan 2024 (increase first enacted by Lei 18.305/2023); no FECOP on "
        "the modal rate.",
        [(18.0, None, "2023-12-31", "Lei 18.665/2023 art. 65 I 'f': 18% until 31 Dec 2023")],
    ),
    "DF": (
        20.0,
        "2024-01-21",
        "verified",
        "SINJ-DF (Lei 7.326/2023)",
        "https://www.sinj.df.gov.br/sinj/Norma/f308fe684e544a29af7a1570ee07ce3f/Lei_7326_20_10_2023.html",
        "Lei 7.326/2023 amended Lei 1.254/1996 art. 18 II 'c' to 20%, in force 1 Jan 2024 subject to the 90-day rule "
        "(DODF 23 Oct 2023 -> effects 21 Jan 2024 per aggregators; SUREC guidance cites 22 Jan; exact day unverified).",
        [(18.0, None, "2024-01-20", "Rate before Lei 7.326/2023")],
    ),
    "ES": (
        17.0,
        None,
        "verified",
        "SEFAZ-ES (notícia 19 Dec 2023)",
        "https://sefaz.es.gov.br/Noticia/governo-do-estado-vai-revogar-aumento-da-aliquota-de-icms-que-entraria-em-vigor-em-2024",
        "Lei 7.000/2001 art. 20 I: 17%; the increase to 19.5% enacted by Lei 11.981/2023 was revoked before taking "
        "effect (revoking act reported as Lei 12.020/2023, number unverified); no FECOEP on the modal rate.",
        [],
    ),
    "GO": (
        19.0,
        "2024-04-01",
        "reported",
        LEGISWEB,
        "https://www.legisweb.com.br/legislacao/?id=453049",
        "Lei 22.460/2023 amended CTE (Lei 11.651/1991) art. 27 I to 19% from 1 Apr 2024; goias.gov.br unavailable "
        "(electoral-period notice); no PROTEGE add-on on the modal rate.",
        [(17.0, None, "2024-03-31", "Rate before Lei 22.460/2023")],
    ),
    "MA": (
        23.0,
        "2025-02-23",
        "reported",
        LEGISWEB,
        "https://www.legisweb.com.br/noticia/?id=30231",
        "Lei 12.426/2024 (25 Nov 2024) amended Lei 7.799/2002 art. 23 to 23% from 23 Feb 2025; the 2023 step 18% -> "
        "20% is reported without a confirmed law number; sefaz.ma.gov.br connection reset; no FUMACOP add-on.",
        [
            (22.0, "2024-02-19", "2025-02-22", "Lei 12.120/2023 step"),
            (20.0, "2023-04-01", "2024-02-18", "2023 step (law number unconfirmed)"),
            (18.0, None, "2023-03-31", "Rate before the 2023 increase"),
        ],
    ),
    "MG": (
        18.0,
        None,
        "verified",
        "ALMG (Lei 6.763/1975 consolidated)",
        "https://www.almg.gov.br/legislacao-mineira/texto/LEI/6763/1975/?cons=1",
        "Lei 6.763/1975 art. 12 I 'd': 18% for unspecified operations (wording since Lei 10.562/1991); FEM 2% applies "
        "only to listed superfluous goods.",
        [],
    ),
    "MS": (
        17.0,
        None,
        "verified",
        "SEFAZ-MS (e-Fazenda FAQ)",
        "https://efazenda.servicos.ms.gov.br/daecomm/consultaragruparemitirdaems_publico.aspx",
        "SEFAZ-MS states the internal rate is 17% (Lei 1.810/1997 art. 41 I, statute text not fetched); no FECOMP "
        "add-on on the modal rate.",
        [],
    ),
    "MT": (
        17.0,
        None,
        "reported",
        LEGISWEB,
        "https://www.legisweb.com.br/legislacao/?id=131447",
        "Lei 7.098/1998 art. 14 I: 17%; Mato Grosso kept 17% while peers raised (Contábeis, Feb 2025); "
        "legislacao.mt.gov.br returned 404; no FECEP add-on on the modal rate.",
        [],
    ),
    "PA": (
        19.0,
        "2023-03-16",
        "reported",
        LEGISWEB,
        "https://www.legisweb.com.br/legislacao/?id=443037",
        "Lei 9.755/2022 (DOE 16 Dec 2022, 90-day rule -> 16 Mar 2023) set the Lei 5.530/1989 modal rate at 19%, "
        "regulated by Decreto 2.931/2023; sefa.pa.gov.br refused connection; no poverty-fund add-on.",
        [(17.0, None, "2023-03-15", "Rate before Lei 9.755/2022")],
    ),
    "PB": (
        20.0,
        "2024-01-01",
        "reported",
        LEGISWEB,
        "https://www.legisweb.com.br/legislacao/?id=454124",
        "Lei 12.788/2023 (DOE 29 Sep 2023) raised Lei 6.379/1996 art. 11 modal rate 18% -> 20% from 1 Jan 2024 "
        "(Decreto 44.675/2023); sefaz.pb.gov.br refused connection; FUNCEP 2% only on listed goods.",
        [(18.0, None, "2023-12-31", "Rate before Lei 12.788/2023")],
    ),
    "PE": (
        20.5,
        "2024-01-01",
        "verified",
        "SEFAZ-PE (Lei 18.305/2023)",
        "https://www.sefaz.pe.gov.br/Legislacao/Tributaria/Documents/legislacao/Leis_Tributarias/2023/Lei18305_2023.htm",
        "Lei 18.305/2023 rewrote Lei 15.730/2016 art. 15 VII to 20.5% with effect 1 Jan 2024; FECEP 2% applies only to "
        "listed superfluous goods.",
        [(18.0, None, "2023-12-31", "Rate before Lei 18.305/2023 (LegisWeb/Contábeis)")],
    ),
    "PI": (
        22.5,
        "2025-04-01",
        "reported",
        LEGISWEB,
        "https://www.legisweb.com.br/legislacao/?id=470993",
        "Lei 8.558/2024 (DOE 24 Dec 2024) rewrote Lei 4.257/1989 art. 23 I 'c' to 22.5% from 1 Apr 2025 (SEFAZ-PI "
        "Comunicado 1/2025); portal.sefaz.pi.gov.br not fetched; no FECOP add-on.",
        [
            (21.0, "2023-03-08", "2025-03-31", "LC 269/2022 step (18% -> 21%)"),
            (18.0, None, "2023-03-07", "Rate before LC 269/2022"),
        ],
    ),
    "PR": (
        19.5,
        "2024-03-18",
        "verified",
        "Legislação-PR (Decreto 5.143/2024 implementing Lei 21.850/2023)",
        "https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=321803&codItemAto=2038037",
        "Lei 21.850/2023 set Lei 11.580/1996 art. 14 VIII at 19.5% with effect 18 Mar 2024; FECOP 2% only on listed "
        "goods.",
        [
            (19.0, "2023-03-13", "2024-03-17", "Lei 21.308/2022 step (LegisWeb)"),
            (18.0, None, "2023-03-12", "Rate before Lei 21.308/2022"),
        ],
    ),
    "RJ": (
        20.0,
        "2024-03-20",
        "verified",
        "ALERJ (Lei 10.253/2023) / SEFAZ-RJ Consulta 44/2024",
        "https://www.alerj.rj.gov.br/Visualizar/Noticia/62648",
        "Lei 10.253/2023 (DOE 21 Dec 2023) amended Lei 2.657/1996 art. 14 I 18% -> 20%, exigible from 20 Mar 2024; FECP "
        "+2% (LC 210/2023) applies on top, so the effective burden is 22% (figure excludes FECP); "
        "portal.fazenda.rj.gov.br blocked the fetch.",
        [(18.0, None, "2024-03-19", "Rate before Lei 10.253/2023 (18% + 2% FECP = 20% total)")],
    ),
    "RN": (
        20.0,
        "2025-03-20",
        "verified",
        "AL-RN (Lei 11.999/2024)",
        "https://www.al.rn.leg.br/storage/legislacao/2025/stqpzaxnkhj8e1efdy6wnsk815m85v.pdf",
        "Lei 11.999/2024 rewrote Lei 6.968/1996 art. 27 I 'a' to 20%, effects 90 days after DOE 20 Dec 2024; FECOP +2% "
        "only on listed goods; set.rn.gov.br not fetched.",
        [
            (18.0, "2024-01-01", "2025-03-19", "Reverted to 18% after the temporary 2023 rate lapsed"),
            (20.0, "2023-04-01", "2023-12-31", "Temporary 20% under Lei 11.314/2022"),
            (18.0, None, "2023-03-31", "Rate before Lei 11.314/2022"),
        ],
    ),
    "RO": (
        19.5,
        "2024-01-12",
        "reported",
        LEGISWEB,
        "https://www.legisweb.com.br/legislacao/?id=159967",
        "Lei 688/1996 art. 27 I 'c': 19.5% per Lei 5.634/2023 (DOE 1 Nov 2023), effects 12 Jan 2024 (Lei 5.629/2023 "
        "had first set 21%, superseded); sefin.ro.gov.br page does not state the rate; FECOEP 2% only on listed goods.",
        [(17.5, None, "2024-01-11", "Rate before Lei 5.634/2023")],
    ),
    "RR": (
        20.0,
        "2023-03-30",
        "reported",
        LEGISWEB,
        "https://www.legisweb.com.br/noticia/?id=27276",
        "Lei 1.767/2022 (30 Dec 2022) set the modal rate in Lei 59/1993 at 20%, 90-day rule -> 30 Mar 2023; "
        "sefaz.rr.gov.br not fetched; no poverty-fund add-on.",
        [(17.0, None, "2023-03-29", "Rate before Lei 1.767/2022")],
    ),
    "RS": (
        17.0,
        None,
        "reported",
        LEGISWEB,
        "https://www.legisweb.com.br/legislacao/?id=153615",
        "Lei 8.820/1989 art. 12 II 'j': 17% (temporary 17.5% under Lei 15.576/2020 lapsed in 2021); "
        "legislacao.sefaz.rs.gov.br refused connection; AMPARA/RS 2% only on listed goods.",
        [],
    ),
    "SC": (
        17.0,
        None,
        "verified",
        "SEF-SC (Lei 10.297/1996)",
        "https://legislacao.sef.sc.gov.br/html/leis/1996/lei_96_10297.htm",
        "Lei 10.297/1996 art. 19 I: 17%; art. 19 III 'n' gives 12% on internal B2B sales to ICMS taxpayers; no "
        "2023-2026 change.",
        [],
    ),
    "SE": (
        19.0,
        "2023-04-01",
        "reported",
        LEGISWEB,
        "https://www.legisweb.com.br/legislacao/?id=444823",
        "Lei 9.176/2023 cut the modal rate from 22% to 19% (RICMS art. 40 I); FECOEP +1% on most final-consumer sales "
        "from 1 May 2023 (Lei 9.177/2023) and +2% on superfluous goods, so most consumer sales bear 20%; figure "
        "excludes FECOEP; state sites blocked (electoral period).",
        [
            (22.0, "2023-03-20", "2023-03-31", "Lei 9.120/2022 step, in force 12 days"),
            (18.0, None, "2023-03-19", "Rate before Lei 9.120/2022"),
        ],
    ),
    "SP": (
        18.0,
        None,
        "verified",
        "SEFAZ-SP (RICMS/2000 art. 52)",
        "https://legislacao.fazenda.sp.gov.br/Paginas/art052.aspx",
        "RICMS art. 52 I: 18% on internal operations (Lei 6.374/1989 art. 34); no 2023-2026 change; no poverty-fund "
        "add-on.",
        [],
    ),
    "TO": (
        20.0,
        "2024-01-01",
        "reported",
        LEGISWEB,
        "https://www.legisweb.com.br/legislacao/?id=452595",
        "Lei 4.141/2023 (from MP 33/2022) raised Lei 1.287/2001 art. 27 modal rate 18% -> 20%; after STF ADI 7375, "
        "SEFAZ-TO IN GABSEC 9/2023 fixed 1 Jan 2024 as the start; dtri.sefaz.to.gov.br returned 403.",
        [(18.0, None, "2023-12-31", "Rate before Lei 4.141/2023")],
    ),
}
for uf, (val, frm, conf, src, url, note, history) in BR_ICMS.items():
    jur = f"BR-{uf}"
    desc = "ICMS standard internal rate (alíquota interna modal) on goods and services not otherwise specified"
    R.append(
        rate(
            jur,
            "vat",
            "standard",
            val,
            frm=frm,
            as_of=AUDIT_DATE,
            conf=conf,
            src=src,
            url=url,
            desc=desc,
            notes=f"{note} {BR_DIFAL}",
        )
    )
    _hist(jur, "vat", "standard", history, src=src, url=url, desc="Prior ICMS standard internal rate")

# ================================================================================================ Switzerland
KPMG_CH = "KPMG Clarity on Swiss Taxes 2026 (May 2026), cantonal capital tables"
KPMG_CH_URL = (
    "https://assets.kpmg.com/content/dam/kpmgsites/ch/pdf/kpmg-ch-swiss-taxes-2026-clarity.pdf.coredownload.inline.pdf"
)
CH_CIT_NOTE = (
    "Maximum effective pre-tax rate on profit for federal (8.5% statutory = 7.83% effective), cantonal and communal "
    "taxes in the cantonal capital, tax year 2026, per KPMG. ESTV publishes current-year burdens only through its "
    "Steuerrechner web app (the 'Steuerbelastung in den Kantonshauptorten' archive ends with tax year 2021), so the "
    "figure is reported, not verified on a federal page."
)
CH_PIT_NOTE = (
    "Top marginal rate for a single taxpayer without church tax in the cantonal capital: cantonal + communal top rate "
    "+ 11.5% direct federal tax, tax year 2026, per KPMG."
)
# code: (capital, cit, cit_from, cit_hist[(rate, frm, to, note)], pit, pit_2025 or None, note)
CH_CANTON_RATES: dict[str, tuple] = {
    "AG": (
        "Aarau",
        14.71,
        "2026-01-01",
        [
            (15.03, "2025-01-01", "2025-12-31", "2025 rate (3% Kantonssteuerabschlag)"),
            (15.07, "2024-01-01", "2024-12-31", "2024 rate"),
            (16.26, None, "2023-12-31", "2023 rate"),
        ],
        33.39,
        34.27,
        "Grosser Rat cut the Kantonssteuerfuss from 108% to 100% for 2026; a further profit-tax cut was "
        "adopted as a motion on 5 May 2026 (no year fixed).",
    ),
    "AI": ("Appenzell", 12.66, None, [], 23.66, None, "Unchanged 2023-2026."),
    "AR": ("Herisau", 13.04, None, [], 30.74, None, "Unchanged 2023-2026."),
    "BE": (
        "Bern",
        20.54,
        "2024-01-01",
        [(21.04, None, "2023-12-31", "2023 rate")],
        40.85,
        None,
        "Highest CIT in Switzerland; three-tier cantonal rate with a lower rate on profit up to CHF 66,800.",
    ),
    "BL": (
        "Liestal",
        13.45,
        "2025-01-01",
        [(15.90, None, "2024-12-31", "2024 rate, before the final TRAF step")],
        42.22,
        None,
        "Final TRAF step cut the effective rate by 2.45 pp in 2025.",
    ),
    "BS": (
        "Basel",
        14.53,
        "2026-01-01",
        [(13.04, None, "2025-12-31", "Rate to 2025 (single tier)")],
        39.75,
        None,
        "14.53% is the top tier on profit above CHF 50m from 2026 (OECD minimum-tax alignment); 13.04% applies up to "
        "CHF 50m; cantonal press pages fetched did not state the rate.",
    ),
    "FR": (
        "Fribourg",
        14.12,
        None,
        [],
        35.26,
        None,
        "Includes the cantonal social-security contribution (8.5% of the simple cantonal profit tax); KPMG 2024 "
        "showed 13.87% excluding it; FR multipliers are 2025 values per KPMG.",
    ),
    "GE": (
        "Geneva",
        14.70,
        "2024-01-01",
        [(14.00, None, "2023-12-31", "2023 rate")],
        43.24,
        None,
        "Increase from 2024 linked to the OECD minimum tax; highest PIT in Switzerland.",
    ),
    "GL": (
        "Glarus",
        12.50,
        "2026-01-01",
        [(12.32, "2024-01-01", "2025-12-31", "2024-2025 rate"), (12.31, None, "2023-12-31", "2023 rate")],
        31.17,
        None,
        "2026 increase is communal (Gemeinde Glarus Steuerfuss +5%); cantonal Steuerfuss stays 58%.",
    ),
    "GR": ("Chur", 14.77, None, [], 31.30, 31.63, "CIT unchanged 2023-2026."),
    "JU": (
        "Delémont",
        15.80,
        "2026-01-01",
        [(16.00, None, "2025-12-31", "2024-2025 rate")],
        40.44,
        39.00,
        "Canton communiqué of 6 Jun 2025: Delémont effective rate falls 0.2 pp per year from 16% (2025) to 15% "
        "(2030) (jura.ch, consistent with KPMG).",
    ),
    "LU": (
        "Lucerne",
        11.66,
        "2026-01-01",
        [
            (11.91, "2025-01-01", "2025-12-31", "2025 rate"),
            (12.09, "2024-01-01", "2024-12-31", "2024 rate"),
            (12.15, None, "2023-12-31", "2023 rate"),
        ],
        28.59,
        29.16,
        "Lowest CIT canton from 2026 (Steuergesetzrevision 2025 approved Sept 2024).",
    ),
    "NE": (
        "Neuchâtel",
        14.89,
        None,
        [],
        37.96,
        37.69,
        "Progressive: 13.57%-14.16% on profit up to CHF 40m; 14.89% is the top tier.",
    ),
    "NW": ("Stans", 11.97, None, [], 25.28, None, "Unchanged 2023-2026."),
    "OW": ("Sarnen", 12.74, None, [], 24.30, None, "Unchanged 2023-2026."),
    "SG": ("St. Gallen", 14.29, None, [], 32.15, None, "Unchanged 2023-2026."),
    "SH": (
        "Schaffhausen",
        15.08,
        "2025-01-01",
        [(15.05, "2024-01-01", "2024-12-31", "2024 top tier"), (13.80, None, "2023-12-31", "2023 rate")],
        27.24,
        27.83,
        "13.80%-15.05% applies on profit up to CHF 15m; 15.08% is the top tier introduced for the OECD minimum tax.",
    ),
    "SO": (
        "Solothurn",
        15.45,
        "2026-01-01",
        [(15.29, None, "2025-12-31", "2024-2025 rate")],
        33.65,
        None,
        "2026 increase is communal (city of Solothurn Steuerfuss 112%); SO multipliers are 2025 values per KPMG.",
    ),
    "SZ": (
        "Schwyz",
        13.30,
        "2026-01-01",
        [(13.45, "2025-01-01", "2025-12-31", "2025 rate"), (13.91, None, "2024-12-31", "2024 rate")],
        23.30,
        23.55,
        "Cantonal statutory profit rate 1.95% unchanged since 2020; declines reflect Steuerfuss cuts.",
    ),
    "TG": ("Frauenfeld", 13.21, None, [], 31.74, None, "Unchanged 2023-2026."),
    "TI": (
        "Bellinzona",
        16.05,
        "2025-01-01",
        [(19.16, None, "2024-12-31", "2024 rate")],
        38.52,
        39.48,
        "Largest 2024 -> 2025 cut (-3.11 pp).",
    ),
    "UR": (
        "Altdorf",
        12.64,
        "2025-01-01",
        [(12.62, None, "2024-12-31", "2023-2024 rate")],
        25.34,
        None,
        "Cantonal statutory rate 2.8% (ESTV Steuermäppchen 2025).",
    ),
    "VD": (
        "Lausanne",
        14.72,
        "2025-01-01",
        [(14.00, None, "2024-12-31", "2024 rate (single tier)")],
        41.50,
        None,
        "14.72% applies above CHF 10m profit from 2025 (OECD minimum-tax alignment); 14.00% up to CHF 10m.",
    ),
    "VS": (
        "Sion",
        17.12,
        None,
        [],
        36.50,
        None,
        "Two-tier rate (lower rate on profit up to CHF 250,000); 17.12% is the top tier; unchanged 2023-2026.",
    ),
    "ZG": (
        "Zug",
        11.71,
        "2026-01-01",
        [(11.85, "2024-01-01", "2025-12-31", "2024-2025 rate"), (11.80, None, "2023-12-31", "2023 rate")],
        21.90,
        22.23,
        "Voters approved 'Mehrwert für alle' on 30 Nov 2025: Kantonssteuerfuss 82% -> 78% for "
        "2026-2029 (zg.ch); lowest PIT in Switzerland.",
    ),
    "ZH": (
        "Zurich",
        19.47,
        "2026-01-01",
        [(19.61, "2024-01-01", "2025-12-31", "2024-2025 rate"), (19.65, None, "2023-12-31", "2023 rate")],
        39.10,
        39.71,
        "Kantonsrat set the Staatssteuerfuss for 2026-2027 at 95% (from 98%; LS 631.21, in force "
        "1 Jan 2026); the statutory profit-rate cut 7% -> 6% was rejected in the 18 May 2025 vote.",
    ),
}
for c, (capital, cit, cit_frm, cit_hist, pit, pit_prev, note) in CH_CANTON_RATES.items():
    jur = f"CH-{c}"
    R.append(
        rate(
            jur,
            "corporate_income",
            "headline",
            cit,
            frm=cit_frm,
            as_of=AUDIT_DATE,
            conf="reported",
            src=KPMG_CH,
            url=KPMG_CH_URL,
            desc=f"Combined effective corporate income tax rate in {capital} (federal + cantonal + communal)",
            notes=f"{note} {CH_CIT_NOTE}",
            extra={"capital": capital},
        )
    )
    _hist(
        jur,
        "corporate_income",
        "headline",
        cit_hist,
        src=KPMG_CH,
        url=KPMG_CH_URL,
        desc=f"Prior combined effective corporate income tax rate in {capital}",
    )
    R.append(
        rate(
            jur,
            "personal_income",
            "top_marginal",
            pit,
            frm="2026-01-01" if pit_prev else None,
            as_of=AUDIT_DATE,
            conf="reported",
            src=KPMG_CH,
            url=KPMG_CH_URL,
            desc=f"Top combined marginal personal income tax rate in {capital} (federal + cantonal + communal, single, no church tax)",
            notes=CH_PIT_NOTE,
            extra={"capital": capital},
        )
    )
    if pit_prev:
        _hist(
            jur,
            "personal_income",
            "top_marginal",
            [(pit_prev, "2025-01-01", "2025-12-31", "2025 rate per KPMG")],
            src=KPMG_CH,
            url=KPMG_CH_URL,
            desc=f"Prior top combined marginal personal income tax rate in {capital}",
        )

# ==================================================================================================== Germany
HAUFE_GREST = "Haufe, Grunderwerbsteuer Ländertabelle (Stand Jan 2025; article 1 Jul 2025)"
HAUFE_GREST_URL = "https://www.haufe.de/immobilien/wirtschaft-politik/grunderwerbsteuer-laender-nehmen-rekordsummen-ein_84342_508990.html"
DESTATIS = "Destatis, Statistischer Bericht Realsteuervergleich 2024 (table 71231-b01, corrected edition 29 Sep 2025)"
DESTATIS_URL = "https://www.destatis.de/DE/Themen/Staat/Steuern/Steuereinnahmen/Publikationen/Downloads-Realsteuern/statistischer-bericht-realsteuervergleich-2141010247005.xlsx?__blob=publicationFile"
DE_REPORTED_NOTE = (
    "Land finance-ministry page not reachable (404/403/JS-only); rate confirmed on Haufe's Ländertabelle and the "
    "de.wikipedia Grunderwerbsteuer table (rev. 23 May 2026), which agree; no 2025/2026 change found in either."
)
# code: (GrESt %, effective_from, confidence, source_name, source_url, note, history, avg Hebesatz 2024)
DE_LAND: dict[str, tuple] = {
    "BW": (5.0, "2011-11-05", "reported", HAUFE_GREST, HAUFE_GREST_URL, DE_REPORTED_NOTE, [], 378.7),
    "BY": (
        3.5,
        None,
        "verified",
        "Gesetze im Internet, § 11 GrEStG",
        "https://www.gesetze-im-internet.de/grestg_1983/__11.html",
        "Bayern is the only Land that never used the 2006 rate-setting competence, so the federal default of 3.5% "
        "(§ 11 GrEStG) applies.",
        [],
        375.7,
    ),
    "BE": (
        6.0,
        "2014-01-01",
        "verified",
        "Senatsverwaltung für Finanzen Berlin, FAQ Grunderwerbsteuer",
        "https://www.berlin.de/sen/finanzen/steuern/informationen-fuer-steuerzahler-/faq-steuern/artikel.9062.php",
        "6% since 1 Jan 2014 per the Senate FAQ; Berlin is a single municipality so its Hebesatz (410%) is also the "
        "Land average.",
        [],
        410.0,
    ),
    "BB": (
        6.5,
        "2015-07-01",
        "reported",
        HAUFE_GREST,
        HAUFE_GREST_URL,
        DE_REPORTED_NOTE + " Lowest average Gewerbesteuer Hebesatz of any Land.",
        [],
        337.2,
    ),
    "HB": (
        5.5,
        "2025-07-01",
        "verified",
        "Gesetzblatt der Freien Hansestadt Bremen 2025 Nr. 9 (5 Feb 2025)",
        "https://www.gesetzblatt.bremen.de/fastmedia/218/2025_02_05_GBl_Nr_0009_signed.pdf",
        "Zweites Gesetz zur Änderung des Gesetzes über die Festsetzung des Steuersatzes für die Grunderwerbsteuer "
        "(22 Jan 2025): 5.5% for acquisitions realised from 1 Jul 2025.",
        [(5.0, "2014-01-01", "2025-06-30", "Rate 1 Jan 2014 - 30 Jun 2025")],
        460.0,
    ),
    "HH": (
        5.5,
        "2023-01-01",
        "verified",
        "Hamburg Senate press release 5 Jan 2022",
        "https://www.hamburg.de/pressearchiv-fhh/15757766/2022-01-05-gruderwerbsteuer-ermaessigungen/",
        "Increase 4.5% -> 5.5% from 1 Jan 2023 with a reduced 3.5% rate for young families, social housing and "
        "Erbbaurecht; highest average Hebesatz of any Land.",
        [(4.5, "2009-01-01", "2022-12-31", "Rate 1 Jan 2009 - 31 Dec 2022")],
        470.0,
    ),
    "HE": (6.0, "2014-08-01", "reported", HAUFE_GREST, HAUFE_GREST_URL, DE_REPORTED_NOTE, [], 419.6),
    "MV": (6.0, "2019-07-01", "reported", HAUFE_GREST, HAUFE_GREST_URL, DE_REPORTED_NOTE, [], 397.5),
    "NI": (5.0, "2014-01-01", "reported", HAUFE_GREST, HAUFE_GREST_URL, DE_REPORTED_NOTE, [], 412.5),
    "NW": (6.5, "2015-01-01", "reported", HAUFE_GREST, HAUFE_GREST_URL, DE_REPORTED_NOTE, [], 459.4),
    "RP": (5.0, "2012-03-01", "reported", HAUFE_GREST, HAUFE_GREST_URL, DE_REPORTED_NOTE, [], 377.5),
    "SL": (
        6.5,
        "2015-01-01",
        "reported",
        HAUFE_GREST,
        HAUFE_GREST_URL,
        DE_REPORTED_NOTE + " saarland.de returned 403.",
        [],
        446.2,
    ),
    "SN": (
        5.5,
        "2023-01-01",
        "verified",
        "Sächsisches Staatsministerium der Finanzen, Medienservice 21 Dec 2022",
        "https://www.medienservice.sachsen.de/medien/news/1060053",
        "First Saxon increase since 2007: 3.5% -> 5.5% from 1 Jan 2023.",
        [(3.5, None, "2022-12-31", "Rate to 31 Dec 2022")],
        425.8,
    ),
    "ST": (5.0, "2012-03-01", "reported", HAUFE_GREST, HAUFE_GREST_URL, DE_REPORTED_NOTE, [], 390.3),
    "SH": (
        6.5,
        "2014-01-01",
        "reported",
        HAUFE_GREST,
        HAUFE_GREST_URL,
        DE_REPORTED_NOTE + " A discussed cut could not be confirmed or excluded.",
        [],
        388.9,
    ),
    "TH": (
        5.0,
        "2024-01-01",
        "reported",
        HAUFE_GREST,
        HAUFE_GREST_URL,
        "Only GrESt reduction since 2023 (6.5% -> 5% from 1 Jan 2024 per Haufe); Thüringen ministry and landesrecht "
        "pages are JS-only, so not upgradable to verified.",
        [(6.5, "2017-01-01", "2023-12-31", "Rate 1 Jan 2017 - 31 Dec 2023")],
        413.6,
    ),
}
for land, (grest, frm, conf, src, url, note, history, hebesatz) in DE_LAND.items():
    jur = f"DE-{land}"
    R.append(
        rate(
            jur,
            "property",
            "stamp_duty",
            grest,
            frm=frm,
            as_of=AUDIT_DATE,
            conf=conf,
            src=src,
            url=url,
            desc="Grunderwerbsteuer (real estate transfer tax) rate on the consideration",
            notes=note,
        )
    )
    _hist(jur, "property", "stamp_duty", history, src=src, url=url, desc="Prior Grunderwerbsteuer rate")
    R.append(
        rate(
            jur,
            "corporate_income",
            "trade_tax",
            round(3.5 * hebesatz / 100, 2),
            as_of=AUDIT_DATE,
            conf="estimated",
            src=DESTATIS,
            url=DESTATIS_URL,
            desc="Average Gewerbesteuer burden: 3.5% Steuermesszahl x weighted-average municipal Hebesatz 2024",
            notes=f"Gewogener Durchschnittshebesatz 2024 = {hebesatz}% (Destatis; national average 408.8% -> 14.31%). "
            "Derived figure: actual burden depends on the municipality. Gewerbesteuer is not deductible and adds to 15% "
            "KSt + 5.5% SolZ (15.825%), giving a combined CIT of roughly 27.6% (BB average) to 32.3% (HH). "
            "Realsteuervergleich 2025 not yet published.",
            extra={"hebesatz_avg": hebesatz, "reference_year": 2024, "messzahl": 3.5},
        )
    )

# ====================================================================================================== Spain
AEAT_RENTA = "AEAT Manual práctico Renta 2025, gravamen autonómico"
AEAT_BASE = "https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c15-calculo-impuesto-determinacion-cuotas-integras/gravamen-base-liquidable-general/gravamen-autonomico/"
HACIENDA_CAP4 = "Ministerio de Hacienda, Tributación Autonómica 2026, Cap. IV (act. 29 Apr 2026)"
HACIENDA_CAP4_URL = (
    "https://www.hacienda.gob.es/sgfal/financiacionterritorial/autonomica/capitulo-iv-tributacion-autonomica-2026.pdf"
)
HACIENDA_CAP2_URL = (
    "https://www.hacienda.gob.es/sgfal/financiacionterritorial/autonomica/capitulo-ii-tributacion-autonomica-2026.pdf"
)
REAF_2026 = "REAF-CGE, Panorama de la fiscalidad autonómica y foral 2026"
REAF_2026_URL = "https://multimedia2.coev.com/pdfs/panorama-fiscalidad2026.pdf"
ES_IRPF_NOTE = (
    "State scale top rate 24.5% (art. 63 LIRPF, above EUR 300,000) + regional top rate. Regional scale is the tax-year "
    "2025 scale (AEAT Manual Renta 2025); Hacienda's 'Tributación Autonómica 2026' (29 Apr 2026) lists no 2026 "
    "regional-scale change, so the 2026 combined rate is the same."
)
ITSGF = "Impuesto Temporal de Solidaridad de las Grandes Fortunas"
# code: (aeat page slug, combined top %, regional top %, regional threshold EUR, irpf_conf, irpf_url_override, irpf_note,
#        ITP general %, ITP top %, ITP from, ITP conf, ITP src, ITP url, ITP history, ITP note)
ES_CCAA: dict[str, tuple] = {
    "AN": (
        "comunidad-autonoma-andalucia.html",
        47.0,
        22.5,
        60000,
        "verified",
        None,
        f"Wealth tax: the 100% regional bonus (DL 7/2022) is suspended while the state {ITSGF} is in force; a "
        "differential bonus keeps the cuota equal to what the ITSGF would collect.",
        7.0,
        7.0,
        "2021-04-28",
        "verified",
        HACIENDA_CAP4,
        HACIENDA_CAP4_URL,
        [],
        "Flat 7% (art. 41 Ley 5/2021; temporary from 28 Apr 2021, permanent from 2022) replacing the 8-10% scale.",
    ),
    "AR": (
        "comunidad-autonoma-aragon.html",
        50.0,
        25.5,
        130000,
        "verified",
        None,
        "Regional scale in force since 2023 (Ley 17/2023); wealth-tax mínimo exento EUR 700,000, no general bonus.",
        8.0,
        10.0,
        "2016-01-01",
        "verified",
        HACIENDA_CAP4,
        HACIENDA_CAP4_URL,
        [],
        "Progressive by value: 8% to 400k, 8.5% to 450k, 9% to 500k, 9.5% to 750k, 10% above (art. 121-1 TR DLeg 1/2005).",
    ),
    "AS": (
        "comunidad-autonoma-principado-asturias.html",
        50.5,
        26.0,
        175000,
        "verified",
        None,
        "New regional scale from 2025 (Ley 3/2025); no wealth-tax general bonus.",
        8.0,
        10.0,
        "2010-07-15",
        "verified",
        HACIENDA_CAP4,
        HACIENDA_CAP4_URL,
        [],
        "Progressive: 8% to 300k, 9% to 500k, 10% above (art. 26 TR DLeg 2/2014).",
    ),
    "CB": (
        "comunidad-autonoma-cantabria.html",
        49.0,
        24.5,
        90000,
        "verified",
        None,
        f"Regional scale in force since 2024 (Ley 3/2023); 100% wealth-tax bonus from 2024 not applicable while the {ITSGF} "
        "is in force for net wealth above EUR 3m (differential bonus instead).",
        9.0,
        9.0,
        "2024-01-01",
        "verified",
        HACIENDA_CAP4,
        HACIENDA_CAP4_URL,
        [(10.0, "2018-01-01", "2023-12-31", "Ley 9/2017 rate")],
        "Cut from 10% to 9% by art. 3.Quince Ley 3/2023 (art. 9.1 TR DLeg 62/2008).",
    ),
    "CE": (
        "especialidad-escala-autonomica-contribuyentes.html",
        47.0,
        22.5,
        60000,
        "verified",
        None,
        "No regional scale: the state complementary scale (DA 32ª LIRPF, top 22.5%) applies; residents deduct 60% of "
        "the cuota attributable to Ceuta income (art. 68.4 LIRPF), so the effective top marginal rate is about 18.8%.",
        6.0,
        6.0,
        None,
        "verified",
        "BOE, RDLeg 1/1993 TR LITPAJD (consolidated)",
        "https://www.boe.es/buscar/act.php?id=BOE-A-1993-25359",
        [],
        "State default 6% (art. 11.1.a TRLITPAJD) with a 50% bonificación en cuota (art. 57 bis.3.a, since 2003): "
        "effective 3%.",
    ),
    "CL": (
        "comunidad-castilla-leon.html",
        46.0,
        21.5,
        53407.20,
        "verified",
        None,
        "Regional scale per Ley 2/2022; no wealth-tax general bonus.",
        8.0,
        10.0,
        "2013-01-01",
        "verified",
        HACIENDA_CAP4,
        HACIENDA_CAP4_URL,
        [],
        "8% on the base up to EUR 250,000 and 10% on the excess (arts. 24-25 TR DLeg 1/2013).",
    ),
    "CM": (
        "comunidad-autonoma-castilla-mancha.html",
        47.0,
        22.5,
        60000,
        "verified",
        None,
        "Regional scale in force since 2015; no wealth-tax general bonus.",
        9.0,
        9.0,
        "2016-06-01",
        "verified",
        HACIENDA_CAP4,
        HACIENDA_CAP4_URL,
        [],
        "Art. 19.1 Ley 8/2013 as amended by Ley 3/2016.",
    ),
    "CN": (
        "comunidad-autonoma-canarias.html",
        50.5,
        26.0,
        123745,
        "verified",
        None,
        "No wealth-tax general bonus.",
        6.5,
        6.5,
        "2005-01-01",
        "verified",
        HACIENDA_CAP4,
        HACIENDA_CAP4_URL,
        [],
        "Art. 31 TR DLeg 1/2009; Ley 9/2025 (1 Jan 2026) only raised the reduced 5% main-home ceiling to EUR 200,000.",
    ),
    "CT": (
        "comunidad-autonoma-cataluna.html",
        50.0,
        25.5,
        175000,
        "verified",
        None,
        f"Regional scale per DL 5/2025 (no change in DL 3/2026); own wealth-tax scale (top 2.75%) plus an {ITSGF}-aligned "
        "scale; no general bonus.",
        10.0,
        13.0,
        "2025-06-27",
        "verified",
        "Agència Tributària de Catalunya, tarifas ITP-TPO",
        "https://atc.gencat.cat/es/tributs/itpajd/tpo/tarifes-tipus/",
        [(10.0, "2017-03-31", "2025-06-26", "Ley 5/2017 scale: 10% up to EUR 1m, 11% above")],
        "Progressive on total value from 27 Jun 2025 (Decret llei 5/2025): 10% to 600k, 11% to 900k, 12% to 1.5m, "
        "13% above; 20% for grandes tenedores and whole buildings.",
    ),
    "EX": (
        "comunidad-autonoma-extremadura.html",
        49.5,
        25.0,
        120200,
        "verified",
        None,
        f"Regional scale in force since 2023 (DL 4/2023). Extremadura keeps its 100% wealth-tax bonus (art. 15 bis TR "
        f"DLeg 1/2018), so the {ITSGF} captures the relieved cuota for net wealth above EUR 3m.",
        8.0,
        11.0,
        "2012-06-26",
        "verified",
        HACIENDA_CAP4,
        HACIENDA_CAP4_URL,
        [],
        "Progressive by tramo: 8% to 360k, 10% to 600k, 11% above (art. 36 TR DLeg 1/2018); Ley 2/2026 (3 Aug 2026) "
        "reportedly reorders reduced housing rates only (guiafiscal; not confirmed on an official page).",
    ),
    "GA": (
        "comunidad-autonoma-galicia.html",
        47.0,
        22.5,
        60000,
        "verified",
        None,
        f"Regional scale per Ley 7/2022; 50% wealth-tax bonus suspended while the {ITSGF} applies (DT 3ª Ley 10/2023).",
        8.0,
        8.0,
        "2024-01-01",
        "verified",
        HACIENDA_CAP4,
        HACIENDA_CAP4_URL,
        [(10.0, "2013-03-01", "2023-12-31", "Ley 2/2013 rate")],
        "Cut from 10% to 8% by art. 4.Uno Ley 10/2023 (art. 14 TR DLeg 1/2011); 7% for vivienda habitual.",
    ),
    "IB": (
        "comunidad-autonoma-illes-balears.html",
        49.25,
        24.75,
        175000,
        "verified",
        None,
        "Regional scale in force since 2024; no wealth-tax general bonus (mínimo exento above state level).",
        8.0,
        13.0,
        "2023-01-01",
        "verified",
        HACIENDA_CAP4,
        HACIENDA_CAP4_URL,
        [],
        "Progressive on total value: 8% to 400k, 9% to 600k, 10% to 1m, 12% to 2m, 13% above (art. 10.a TR DLeg "
        "1/2014; 12%/13% brackets from 1 Jan 2023).",
    ),
    "MC": (
        "comunidad-autonoma-region-murcia.html",
        47.0,
        22.5,
        60000,
        "verified",
        None,
        f"Regional scale in force since 2019; 100% wealth-tax bonus deactivated while the {ITSGF} is in force, settled "
        "through a differential bonus (Ley 3/2025).",
        7.75,
        7.75,
        "2025-07-25",
        "verified",
        "BOE, Ley 3/2025 de la Región de Murcia",
        "https://www.boe.es/buscar/doc.php?id=BOE-A-2025-16147",
        [(8.0, None, "2025-07-24", "Rate until Ley 3/2025")],
        "Art. 6.1 TR DLeg 1/2010 as amended by art. 55.Catorce Ley 3/2025 (in force 25 Jul 2025).",
    ),
    "MD": (
        "comunidad-madrid.html",
        45.0,
        20.5,
        57320.40,
        "verified",
        None,
        f"Lowest common-regime top rate; 100% wealth-tax bonus (art. 20 TR DLeg 1/2010, since 2009) not applicable while "
        f"the {ITSGF} is in force; a differential bonus keeps the cuota in Madrid.",
        6.0,
        6.0,
        "2014-01-01",
        "verified",
        HACIENDA_CAP4,
        HACIENDA_CAP4_URL,
        [],
        "Art. 28.1 TR DLeg 1/2010 as amended by Ley 6/2013.",
    ),
    "ML": (
        "especialidad-escala-autonomica-contribuyentes.html",
        47.0,
        22.5,
        60000,
        "verified",
        None,
        "No regional scale: the state complementary scale (DA 32ª LIRPF, top 22.5%) applies; residents deduct 60% of "
        "the cuota attributable to Melilla income (art. 68.4 LIRPF), so the effective top marginal rate is about 18.8%.",
        6.0,
        6.0,
        None,
        "verified",
        "BOE, RDLeg 1/1993 TR LITPAJD (consolidated)",
        "https://www.boe.es/buscar/act.php?id=BOE-A-1993-25359",
        [],
        "State default 6% with a 50% bonificación en cuota (art. 57 bis.3.a TRLITPAJD): effective 3%.",
    ),
    "NC": (
        None,
        52.0,
        None,
        334344,
        "reported",
        "https://www.boe.es/buscar/doc.php?id=BOE-A-2024-1694",
        "Foral regime (Convenio Económico): single foral scale with no state component, top 52% above EUR 334,344 "
        "(Ley Foral 22/2023, BOE-A-2024-1694); reported unchanged for 2026 (LF 17/2025) but the 2026 text was not read.",
        6.0,
        6.0,
        None,
        "reported",
        REAF_2026,
        REAF_2026_URL,
        [],
        "6% general per REAF example tables and aggregators; Hacienda Navarra page not reachable; 5% for families with "
        "children (reported).",
    ),
    "PV": (
        None,
        49.0,
        None,
        208390,
        "reported",
        "https://www.bizkaia.eus/documents/880307/15187815/ca_13_2013.pdf/ce52e403-4fca-9ef7-bf85-2505ba29f921?t=1784098584068",
        "Foral regime (Concierto Económico): NF 13/2013 art. 75 (Bizkaia, consolidated with 2026 deflated brackets) top "
        "49% above EUR 208,390; Gipuzkoa and Álava scales reported identical (NF 6/2025, NF 21/2025) but not read.",
        7.0,
        7.0,
        None,
        "reported",
        REAF_2026,
        REAF_2026_URL,
        [],
        "7% general (4% for dwellings) in the three territories per REAF example tables; Diputación Foral ITP pages not "
        "fetched.",
    ),
    "RI": (
        "comunidad-autonoma-rioja.html",
        51.5,
        27.0,
        120000,
        "verified",
        None,
        f"Ley 9/2025 adds automatic deflation only if regional CPI exceeds 3%; 100% wealth-tax bonus from 2025 (Ley 6/2024) "
        f"not applicable while the {ITSGF} is in force.",
        7.0,
        7.0,
        "2002-01-01",
        "verified",
        HACIENDA_CAP4,
        HACIENDA_CAP4_URL,
        [],
        "Art. 44.1 Ley 10/2017 (first set by Ley 7/2001); 4% for first home under 40 since 3 Mar 2025 (reported).",
    ),
    "VC": (
        "comunitat-valenciana.html",
        54.0,
        29.5,
        200000,
        "verified",
        None,
        "Highest top rate in Spain (Ley 9/2022, in force since 2023); wealth-tax mínimo exento raised to EUR 1m for "
        "devengos from 31 Dec 2025 (Ley 5/2025), no general bonus.",
        9.0,
        11.0,
        "2026-06-01",
        "verified",
        "Ministerio de Hacienda, Tributación Autonómica 2026, Cap. II",
        HACIENDA_CAP2_URL,
        [(10.0, None, "2026-05-31", "General rate until Ley 5/2025 took effect")],
        "Art. 33 Ley 5/2025 (DOGV 31 May 2025): 9% general and 11% on the whole value when the property exceeds EUR 1m, "
        "for devengos from 1 Jun 2026; AJD cut 1.5% -> 1.4% on the same date.",
    ),
}
for cc, (
    slug,
    top,
    reg_top,
    thr,
    irpf_conf,
    irpf_url,
    irpf_note,
    itp,
    itp_top,
    itp_frm,
    itp_conf,
    itp_src,
    itp_url,
    itp_hist,
    itp_note,
) in ES_CCAA.items():
    jur = f"ES-{cc}"
    R.append(
        rate(
            jur,
            "personal_income",
            "top_marginal",
            top,
            thr=thr,
            cur="EUR",
            as_of=AUDIT_DATE,
            conf=irpf_conf,
            src=AEAT_RENTA
            if slug
            else ("BOE (Ley Foral 22/2023)" if cc == "NC" else "Bizkaia NF 13/2013 (consolidated)"),
            url=irpf_url or AEAT_BASE + slug,
            desc="Top combined marginal IRPF rate (state + regional scale; foral scale for NC/PV) above the threshold",
            notes=f"{irpf_note} {ES_IRPF_NOTE if slug else ''}".strip(),
            extra={"regional_top_rate": reg_top, "state_top_rate": 24.5 if slug else None},
        )
    )
    R.append(
        rate(
            jur,
            "property",
            "stamp_duty",
            itp,
            frm=itp_frm,
            as_of=AUDIT_DATE,
            conf=itp_conf,
            src=itp_src,
            url=itp_url,
            desc="ITP (Transmisiones Patrimoniales Onerosas) general rate on second-hand real estate",
            notes=itp_note,
            extra={"top_rate": itp_top} if itp_top != itp else None,
        )
    )
    _hist(jur, "property", "stamp_duty", itp_hist, src=itp_src, url=itp_url, desc="Prior ITP general rate")

# ======================================================================================================= India
PPAC = "PPAC, State-wise VAT/sales tax on petrol and diesel (table posted 12 Aug 2026)"
PPAC_URL = "https://ppac.gov.in/prices/vat-sales-tax-gst-rates"
DESICALC = "desicalc.in stamp-duty comparison (2 Aug 2026), corroborated by legiscore.in, jumptools.in, studiomatrx.org"
DESICALC_URL = "https://desicalc.in/comparisons/stamp-duty-rates-all-states"
BANKBAZAAR_PT = "https://www.bankbazaar.com/tax/professional-tax.html"
IN_SD_REPORTED = (
    "State IGR/registration portal refused automated connections; rate taken from four consistent aggregator tables "
    "(desicalc 2 Aug 2026, legiscore 6 Aug 2026, jumptools Mar 2026, studiomatrx Apr 2026). Male/general urban rate, "
    "excluding registration fee."
)
# code: (stamp duty % or None, sd_conf, sd_src, sd_url, sd_note, prof tax max INR or None, pt_url, pt_note, petrol VAT %, petrol note)
IN_STATE_RATES: dict[str, tuple] = {
    "AP": (
        5.0,
        "reported",
        DESICALC,
        DESICALC_URL,
        "Plus 1.5% transfer duty (urban) and 1% registration; no female concession.",
        2400,
        BANKBAZAAR_PT,
        "INR 200/month top slab.",
        31.0,
        "Plus INR 4/litre VAT and INR 1/litre road development cess.",
    ),
    "AR": (
        6.0,
        "reported",
        DESICALC,
        DESICALC_URL,
        "Uniform 6%, registration 1%.",
        None,
        None,
        "Not levied.",
        14.5,
        "",
    ),
    "AS": (
        None,
        None,
        None,
        None,
        "Sources split 8.25% vs 6% (female 5%); no value recorded.",
        2496,
        "https://www.greythr.com/wiki/acts/professional-tax-assam/",
        "INR 208/month top slab (Bankbazaar rounds to 2,500).",
        24.77,
        "Or INR 18.80/litre, whichever is higher.",
    ),
    "BR": (
        6.0,
        "reported",
        DESICALC,
        DESICALC_URL,
        "Female buyer 5.7% (male-to-female), 6.3% female-to-male; registration 2%.",
        2500,
        BANKBAZAAR_PT,
        "",
        23.58,
        "Or INR 16.65/litre, whichever is higher; 30% surcharge on VAT.",
    ),
    "CG": (
        5.0,
        "reported",
        DESICALC,
        DESICALC_URL,
        "Female buyers 4%; registration 4%.",
        2400,
        "https://www.greythr.com/wiki/acts/professional-tax-chhattisgarh/",
        "Vritti Kar Adhiniyam 1995 caps at INR 2,400; salaried employees reportedly exempted by a 2011 notification "
        "(aggregators conflict: 2,500 / not applicable).",
        24.0,
        "Plus INR 2/litre VAT.",
    ),
    "GA": (
        None,
        None,
        None,
        None,
        "Slab duty 3.5%-5% by value (desicalc adds 6% above INR 5 crore); tiers conflict, no value recorded.",
        None,
        None,
        "Not levied.",
        21.5,
        "Plus 0.5% green cess.",
    ),
    "GJ": (
        4.9,
        "reported",
        DESICALC,
        DESICALC_URL,
        "4.9% = 3.5% basic + 1.4% surcharge; registration 1% waived for sole female buyers.",
        2400,
        BANKBAZAAR_PT,
        "",
        13.7,
        "Plus 4% cess on town rate and VAT.",
    ),
    "HR": (
        7.0,
        "reported",
        DESICALC,
        DESICALC_URL,
        "Urban 7% male / 5% female / 6% joint; rural 5%/3%/4%; registration is a capped slab fee.",
        None,
        None,
        "Not levied.",
        18.2,
        "Plus 5% additional tax on VAT; or INR 14.50/litre, whichever is higher.",
    ),
    "HP": (
        None,
        None,
        None,
        None,
        "Male rate conflicts 5% vs 6% (female 4%); no value recorded.",
        None,
        None,
        "Not levied.",
        17.5,
        "Plus INR 0.60/litre cess; or INR 13.50/litre, whichever is higher.",
    ),
    "JH": (
        4.0,
        "reported",
        DESICALC,
        DESICALC_URL,
        "No gender concession; registration 3%.",
        2500,
        BANKBAZAAR_PT,
        "",
        22.0,
        "Plus INR 1/litre cess; or INR 17/litre, whichever is higher.",
    ),
    "KA": (
        5.0,
        "reported",
        "https://desicalc.in/stamp-duty/karnataka",
        "https://desicalc.in/stamp-duty/karnataka",
        "5% above INR 45 lakh (3% INR 21-45 lakh, 2% up to INR 20 lakh) plus 2% surcharge and 10% cess on the duty "
        "(about 5.6% effective in BBMP); registration 1%.",
        2500,
        "https://cleartax.in/s/professional-tax",
        "INR 200/month with INR 300 in February (2024 amendment); greythr still shows 2,400.",
        29.84,
        "Sales tax; no per-litre cess.",
    ),
    "KL": (
        8.0,
        "verified",
        "Kerala Registration Department, Stamp Duty & Fees schedule",
        "https://keralaregistration.gov.in/fileUploads/Stamp%20Duty%20&%20Fees.pdf",
        "Art. 21(i): sale/conveyance 8%, registration fee 2%; no female concession.",
        2500,
        BANKBAZAAR_PT,
        "Collected half-yearly, max INR 1,250 per half-year.",
        30.08,
        "Plus INR 1/litre additional sales tax, 1% cess and INR 2/litre social security cess.",
    ),
    "MP": (
        7.5,
        "reported",
        DESICALC,
        DESICALC_URL,
        "7.5% urban headline includes municipal duty; registration 3%.",
        2500,
        BANKBAZAAR_PT,
        "",
        29.0,
        "Plus INR 2.5/litre VAT and 1% cess.",
    ),
    "MH": (
        5.0,
        "reported",
        "https://desicalc.in/stamp-duty/maharashtra",
        "https://desicalc.in/stamp-duty/maharashtra",
        "Base 5%; Mumbai 6% (with 1% metro cess), Pune/Nagpur and other corporations 7% (1% LBT + 1% metro cess); women "
        "1% concession; registration 1% capped INR 30,000.",
        2500,
        BANKBAZAAR_PT,
        "INR 200/month with INR 300 in February.",
        25.0,
        "Plus INR 5.12/litre additional tax.",
    ),
    "MN": (
        7.0,
        "reported",
        DESICALC,
        DESICALC_URL,
        "No gender concession; registration 3% (cap INR 25,000).",
        2500,
        "https://www.greythr.com/wiki/acts/professional-tax-manipur/",
        "INR 208 x 11 + INR 212 (Manipur Professions Tax Act 1979 as amended 2012); some aggregators list 'not applicable'.",
        25.0,
        "",
    ),
    "ML": (
        9.9,
        "reported",
        DESICALC,
        DESICALC_URL,
        "Highest flat rate reported in India; studiomatrx shows a 4.6%-9.9% tiered scale; registration 1.5%.",
        2500,
        BANKBAZAAR_PT,
        "",
        13.5,
        "Plus INR 0.10/litre pollution surcharge; or INR 13.50/litre, whichever is higher.",
    ),
    "MZ": (
        None,
        None,
        None,
        None,
        "Sources give 3% (Mizoram Amendment Act 2024), 5% and 9%; no value recorded.",
        None,
        None,
        "Mizoram Professions Tax Act 1995 exists but aggregators conflict on applicability; no value recorded.",
        18.0,
        "Plus INR 2,000/KL social infrastructure cess and INR 2,000/KL road maintenance cess.",
    ),
    "NL": (
        8.25,
        "reported",
        DESICALC,
        DESICALC_URL,
        "No gender concession; registration 1%-1.25%.",
        2496,
        "https://www.greythr.com/wiki/acts/professional-tax-nagaland/",
        "INR 208/month above INR 12,000.",
        21.75,
        "Or INR 16.94/litre, whichever is higher.",
    ),
    "OD": (
        5.0,
        "verified",
        "IGR Odisha fee schedule",
        "https://www.igrodisha.gov.in/FeeDetails.aspx?fee=DOCF",
        "Sale of immovable property: stamp 5%, registration 2%; female buyers 4% (reported, not on the IGR fee page).",
        2500,
        BANKBAZAAR_PT,
        "",
        28.0,
        "",
    ),
    "PB": (
        7.0,
        "reported",
        DESICALC,
        DESICALC_URL,
        "7% = 5% duty + 1% Social Infrastructure Cess + 1% PIDB fee; female 5%, joint 6%; registration 1%.",
        2400,
        "https://www.greythr.com/wiki/acts/professional-tax-punjab/",
        "Punjab State Development Tax Act 2018: INR 200/month; several aggregators list Punjab as 'not levied'.",
        16.58,
        "Plus 10% additional tax on VAT, INR 2,050/KL cess, INR 0.10/litre urban transport fund and INR 0.25/litre SIDF; "
        "or INR 14.93/litre, whichever is higher.",
    ),
    "RJ": (
        6.0,
        "reported",
        DESICALC,
        DESICALC_URL,
        "6% male / 5% female plus a 20%-33% surcharge on the duty (excluded); registration 1%.",
        None,
        None,
        "Not levied.",
        29.04,
        "Plus INR 1,500/KL road development cess.",
    ),
    "SK": (
        None,
        None,
        None,
        None,
        "Land purchase restricted to Sikkim Subject holders; sources conflict 5% vs 1%; no value recorded.",
        2400,
        "https://hrone.cloud/blog/professional-tax-slab-rates-2026-27/",
        "INR 200/month (Bankbazaar shows 2,500).",
        22.0,
        "Plus INR 4,000/KL cess.",
    ),
    "TN": (
        7.0,
        "reported",
        DESICALC,
        DESICALC_URL,
        "Flat 7%, no gender concession; registration 4% (women 3% up to INR 10 lakh from Apr 2025); tnreginet.gov.in unreachable.",
        2500,
        BANKBAZAAR_PT,
        "INR 1,250 per half-year.",
        13.0,
        "Plus INR 11.52/litre.",
    ),
    "TS": (
        4.0,
        "reported",
        "https://rateinfo.in/stamp-duty/telangana",
        "https://rateinfo.in/stamp-duty/telangana",
        "4% duty plus 1.5% transfer duty (urban) and 0.5% registration (2% rural); registration.telangana.gov.in unreachable.",
        2400,
        BANKBAZAAR_PT,
        "",
        35.2,
        "",
    ),
    "TR": (
        5.0,
        "reported",
        DESICALC,
        DESICALC_URL,
        "No gender concession; registration about 1%-1.5% (revised Jun 2025).",
        2496,
        "https://www.greythr.com/wiki/acts/professional-tax-tripura/",
        "INR 208/month; aggregators conflict (2,500 / 2,400 / 1,500).",
        17.5,
        "Plus 3% Tripura road development cess.",
    ),
    "UP": (
        7.0,
        "reported",
        DESICALC,
        DESICALC_URL,
        "Women 6% (1% rebate capped INR 1 lakh, property up to INR 1 crore, since Jul 2025); registration 1%; igrsup.gov.in JS-only.",
        None,
        None,
        "Not levied.",
        19.36,
        "Or INR 14.85/litre, whichever is higher.",
    ),
    "UK": (
        5.0,
        "verified",
        "Uttarakhand Registration Department, stamp duty and registration fee GOs",
        "https://registration.uk.gov.in/stampduty-registration-fee/",
        "GO 31 May 2011 cut conveyance duty 6% -> 5%; women 3.75% (25% rebate) up to INR 25 lakh; registration 2% (cap INR 50,000 from 16 Nov 2025).",
        None,
        None,
        "Not levied.",
        16.97,
        "Or INR 13.14/litre, whichever is greater.",
    ),
    "WB": (
        6.0,
        "reported",
        DESICALC,
        DESICALC_URL,
        "6% urban up to INR 1 crore, 7% above; rural 5%/6%; no gender concession; wbregistration.gov.in JS-only.",
        2400,
        BANKBAZAAR_PT,
        "",
        25.0,
        "Plus INR 1,000/KL cess and 20% additional tax on VAT; or INR 13.12/litre, whichever is higher.",
    ),
    # union territories
    "AN": (
        None,
        None,
        None,
        None,
        "Aggregators conflict 5% vs 6%; no value recorded.",
        None,
        None,
        "Not levied.",
        1.0,
        "",
    ),
    "CH": (
        None,
        None,
        None,
        None,
        "Aggregators conflict 5% vs 6% (female 4%); no value recorded.",
        None,
        None,
        "Not levied.",
        15.24,
        "Plus INR 10/KL cess; or INR 12.42/litre, whichever is higher.",
    ),
    "DH": (
        None,
        None,
        None,
        None,
        "Only weak aggregators (5%); no value recorded.",
        None,
        None,
        "Not levied.",
        12.75,
        "",
    ),
    "DL": (
        6.0,
        "reported",
        "paisabazaar.com stamp duty table (28 Nov 2024), corroborated by desicalc/legiscore/jumptools",
        "https://www.paisabazaar.com/home-loan/stamp-duty-and-registration-charges/",
        "Female 4%, joint 5%; registration 1%; MCD transfer duty (2%-3%) excluded.",
        None,
        None,
        "Not levied.",
        19.4,
        "",
    ),
    "JK": (
        None,
        None,
        None,
        None,
        "Aggregators conflict (5% vs 6% male; 3%-4% female); no value recorded.",
        None,
        None,
        "Not levied.",
        24.0,
        "Motor spirit tax; plus INR 2/litre employment cess; rebate INR 3.50/litre.",
    ),
    "LA": (
        None,
        None,
        None,
        None,
        "Sources conflict 5% vs 7%; no value recorded.",
        None,
        None,
        "Not levied.",
        15.0,
        "Motor spirit tax; plus INR 5/litre employment cess; reduction INR 2.5/litre.",
    ),
    "LD": (None, None, None, None, "Single weak source (5%); no value recorded.", None, None, "Not levied.", 10.0, ""),
    "PY": (
        None,
        None,
        None,
        None,
        "Four aggregators give four different rates (6%-10%); no value recorded.",
        2500,
        "https://hrone.cloud/blog/professional-tax-slab-rates-2026-27/",
        "INR 1,250 per half-year (aggregators conflict).",
        16.98,
        "",
    ),
}
for st, (sd, sd_conf, sd_src, sd_url, sd_note, pt, pt_url, pt_note, petrol, petrol_note) in IN_STATE_RATES.items():
    jur = f"IN-{st}"
    if sd is not None:
        R.append(
            rate(
                jur,
                "property",
                "stamp_duty",
                sd,
                as_of=AUDIT_DATE,
                conf=sd_conf,
                src=sd_src,
                url=sd_url,
                desc="Stamp duty on conveyance/sale deed of immovable property (general urban rate, excl. registration fee)",
                notes=sd_note if sd_conf == "verified" else f"{sd_note} {IN_SD_REPORTED}",
            )
        )
    if pt is not None:
        R.append(
            rate(
                jur,
                "payroll_social",
                "other",
                None,
                thr=pt,
                cur="INR",
                as_of=AUDIT_DATE,
                conf="reported",
                src="State Professions Tax Act via Bankbazaar / greythr / ClearTax state tables (Jun-Aug 2026)",
                url=pt_url,
                desc="Profession tax: maximum annual liability per person (constitutional cap INR 2,500, Art. 276)",
                notes=(pt_note + " State commercial-tax page not fetched; Act-based aggregator used.").strip(),
            )
        )
    R.append(
        rate(
            jur,
            "excise",
            "standard",
            petrol,
            as_of=AUDIT_DATE,
            conf="verified",
            src=PPAC,
            url=PPAC_URL,
            desc="State VAT / sales tax on petrol (ad valorem component, outside GST)",
            notes=(
                petrol_note + " PPAC table 'as per details provided by OMCs', page last updated 25 Aug 2026; VAT also "
                "applies to dealer commission in DL, GJ, DH, HR, MP, RJ, PB, CH, PY, AN, ML, LD."
            ).strip(),
        )
    )

# ====================================================================================================== Mexico
# code: (ISN %, effective_from, confidence, source_name, source_url, note, history)
MX_ISN: dict[str, tuple] = {
    "AGU": (
        2.5,
        "2023-01-01",
        "verified",
        "Ley de Hacienda del Estado de Aguascalientes (Normateca)",
        "https://eservicios2.aguascalientes.gob.mx/normatecaadministrador/archivos/edo-18-27.pdf",
        "Art. 67 LH: 2.5%; cut to 2.0% for 2022 only and restored by the 2023 fiscal package; unchanged for 2026 with a "
        "50% stimulus for certain new hires.",
        [(2.0, "2022-01-01", "2022-12-31", "Temporary 2022 rate")],
    ),
    "BCN": (
        4.25,
        "2024-01-01",
        "verified",
        "Ley de Hacienda del Estado de Baja California (Congreso BC, ed. 18 Jun 2026)",
        "https://www.congresobc.gob.mx/Documentos/ProcesoParlamentario/Leyes/TOMO_II/20260618_LEYHACES.PDF",
        "Art. 151-16 LH: single statutory 4.25% since the 2024 package consolidated the former 1.80% base + 1.20% + "
        "1.25% Ley de Ingresos sobretasas; effective burden 4.25% since 1 Nov 2022.",
        [],
    ),
    "BCS": (
        3.0,
        "2026-01-01",
        "reported",
        "Ley de Ingresos del Estado de BCS 2026 (Congreso BCS)",
        "https://www.cbcs.gob.mx/LEYES-BCS/LIngresosBCS-2026.doc",
        "LI 2026 art. 6 distributes ISN revenue 'equivalent to the 3% rate'; the 2.5% -> 3% Ley de Hacienda reform "
        "(arts. 33-36, Dec 2025) is reported by El Congresista/OEM; the consolidated LH copy online still shows 2.5%.",
        [(2.5, None, "2025-12-31", "Rate 1 Mar 2006 - 31 Dec 2025")],
    ),
    "CAM": (
        3.0,
        None,
        "verified",
        "Ley de Hacienda del Estado de Campeche (LEXIUS)",
        "https://consejeria.campeche.gob.mx/pagina/LEXIUSCAMPECHE/docs/est/100047.pdf",
        "Art. 23 LH (Decreto 7, P.O. 1553 of 5 Nov 2021): 3%; tables listing 2% are outdated.",
        [],
    ),
    "CHH": (
        4.0,
        "2026-01-01",
        "verified",
        "Congreso de Chihuahua, nota 16 Dec 2025 (Ley de Hacienda art. 75)",
        "https://www.congresochihuahua.gob.mx/detalleNota.php?id=12847",
        "Art. 75 LH base rate 3%; a transitory article applies 4% for FY2026-2027 (P.O. 24 Dec 2025, reported); "
        "surcharges: 6% Impuesto Adicional Universitario and 10% + 5% contribuciones extraordinarias computed on the "
        "3% base (reported); 2026 stimulus 20%/10%/5% for 1-10/11-30/31-50 employees.",
        [
            (3.0, "2024-01-01", "2025-12-31", "Base rate 2024-2025"),
            (3.5, "2023-01-01", "2023-12-31", "Transitory 2023 rate"),
        ],
    ),
    "CHP": (
        3.0,
        "2026-01-01",
        "verified",
        "Ley de Ingresos del Estado de Chiapas 2026 (SH Chiapas)",
        "https://www.finanzaschiapas.gob.mx/marco-juridico/Estatal/informacion/Leyes/LI2026.PDF",
        "LI 2026 exposición: ISN raised from 2% to 3% for FY2026; Código de la Hacienda Pública arts. 229-238 "
        "(Decreto 036, P.O. 075, 9 Dec 2025); bimonthly filing.",
        [(2.0, None, "2025-12-31", "Rate through 2025")],
    ),
    "CMX": (
        4.0,
        "2025-01-01",
        "reported",
        "Forvis Mazars México tax alert (Código Fiscal CDMX art. 158)",
        "https://www.forvismazars.com/mx/es/insights/forvis-mazars-en-mexico-lideres-de-opinion/tax-alert/incremento-al-impuesto-sobre-nomina-en-cdmx-2025",
        "Art. 158 Código Fiscal CDMX reformed in Gaceta Oficial 27 Dec 2024 from 3% to 4%, with 1 pt reduction for "
        "micro (<=10 workers), 0.5 pt for small (11-50) and 1 pt for new companies or >=33% headcount growth (art. 278); "
        "DFK confirms unchanged for 2026; the consolidated PDFs on congresocdmx.gob.mx still show 3%.",
        [(3.0, None, "2024-12-31", "Rate through 2024")],
    ),
    "COA": (
        3.0,
        "2024-01-01",
        "verified",
        "Ley de Hacienda para el Estado de Coahuila (Congreso)",
        "https://www.congresocoahuila.gob.mx/transparencia/03/Leyes_Coahuila/coa25.pdf",
        "Art. 24 LH: 3% (Decreto 563, P.O. 8 Dec 2023, in force 1 Jan 2024).",
        [(2.0, None, "2023-12-31", "Rate through 2023")],
    ),
    "COL": (
        3.0,
        "2026-01-01",
        "verified",
        "Ley de Hacienda del Estado de Colima (Congreso, ed. 30 Jun 2026)",
        "https://congresocol.gob.mx/web/Sistema/uploads/LegislacionEstatal/LeyesEstatales/Ley_de_hacienda_30junio2026.pdf",
        "Art. 41 Q LH (Decreto 199, P.O. 123 Supl. 1, 18 Dec 2025): 3%.",
        [(2.0, None, "2025-12-31", "Rate through 2025")],
    ),
    "DUR": (
        3.0,
        "2024-01-01",
        "verified",
        "Ley de Hacienda del Estado de Durango (Congreso)",
        "https://congresodurango.gob.mx/Archivos/legislacion/LEY%20DE%20HACIENDA%20DEL%20ESTADO%20DE%20DURANGO.pdf",
        "Art. 7 LH: 3% (Decreto 540, P.O. 26 Dec 2023); IDC dates the 2% -> 3% change to 2023, so the effective date "
        "carries a one-year conflict; 2% reportedly retained for micro-employers (<=10 workers).",
        [(2.0, None, "2023-12-31", "Rate through 2023 (effective date of change disputed: 2023 vs 2024)")],
    ),
    "GRO": (
        3.0,
        "2025-01-01",
        "verified",
        "Ley 419 de Hacienda del Estado de Guerrero (SEFINA Paquete Fiscal 2025)",
        "https://esefina.ingresos-guerrero.gob.mx/PaqueteFiscal/L2025/LEY%20419%20HACIENDA.pdf",
        "Art. 44 Ley 419: 3% (Decreto 200, P.O. Alcance III 31 Dec 2024); three impuestos adicionales of 15% each on the "
        "tax (education, tourism, ecology) give about 4.35% effective (reported).",
        [(2.0, None, "2024-12-31", "Rate through 2024")],
    ),
    "GUA": (
        3.0,
        "2022-01-01",
        "reported",
        "Ley de Ingresos del Estado de Guanajuato 2026 art. 10 (via Grupo Cervel)",
        "https://grupocervel.com/blog/isn-queretaro-guanajuato-2026",
        "LH art. 5 delegates the rate to the annual Ley de Ingresos; LI 2026 (P.O. 31 Dec 2025) keeps 3% (2.3% in 2021, "
        "3% since 2022); the official LI 2026 PDF was fetched but its text layer was not extractable.",
        [],
    ),
    "HID": (
        3.0,
        None,
        "verified",
        "Ley de Hacienda del Estado de Hidalgo (Congreso)",
        "https://www.congreso-hidalgo.gob.mx/biblioteca_legislativa/leyes_cintillo/Ley%20de%20Hacienda%20del%20Estado%20de%20Hidalgo.pdf",
        "Art. 24 LH: 3%; no change found 2023-2026.",
        [],
    ),
    "JAL": (
        3.0,
        "2023-07-01",
        "verified",
        "Ley de Ingresos del Estado de Jalisco 2026 art. 13 (Congreso, ed. 24 Feb 2026)",
        "https://congresoweb.congresojal.gob.mx/BibliotecaVirtual/legislacion/Ingresos/Documentos_PDF-Ingresos/Ley%20de%20Ingresos%20del%20Estado%20de%20Jalisco-240226.pdf",
        "LI 2026 art. 13: 3.0% on the Ley de Hacienda base (arts. 39-45); LI 2023 phased 2.75% (Jan-Jun) and 3.0% "
        "(Jul-Dec 2023) after a 2.125%-2.50% quarterly schedule in 2022.",
        [(2.75, "2023-01-01", "2023-06-30", "LI 2023 first-half rate")],
    ),
    "MEX": (
        3.0,
        None,
        "verified",
        "Código Financiero del Estado de México y Municipios art. 57",
        "https://ccc.edomex.gob.mx/sites/ccc.edomex.gob.mx/files/files/Marco%20Juridico/C%C3%B3digos/codvig007.pdf",
        "Art. 57 CFEM: 3.0% (art. 56 Bis fixed quota for construction labour); LI 2026 art. 11 grants 100%/50%/36% "
        "subsidies for relocations, new operations and export maquila (reported).",
        [],
    ),
    "MIC": (
        3.0,
        None,
        "verified",
        "Ley de Hacienda del Estado de Michoacán (ed. Oct 2025)",
        "https://michoacan.gob.mx/wp-content/uploads/2025/10/LEY-DE-HACIENDA-DEL-ESTADO-DE-MICHOACA%CC%81N.pdf",
        "Art. 45 LH: 3%; no rate change for 2026 (Quadratín, 30 Nov 2025).",
        [],
    ),
    "MOR": (
        3.0,
        "2026-01-01",
        "verified",
        "Ley General de Hacienda del Estado de Morelos (última reforma 2 Mar 2026)",
        "https://marcojuridico.morelos.gob.mx/documentos/2823/download",
        "Art. 58 BIS-4 LGH: 3.0% (Decreto 997, P.O. 6506 Extraordinaria 22 Dec 2025); the executive's 4.25% proposal "
        "was cut to 3% in committee.",
        [
            (2.5, "2025-01-01", "2025-12-31", "Decreto 24 (P.O. 6382, 31 Dec 2024) rate"),
            (2.0, None, "2024-12-31", "Rate through 2024"),
        ],
    ),
    "NAY": (
        3.0,
        "2022-01-01",
        "verified",
        "Ley de Hacienda del Estado de Nayarit (Contraloría normateca 2025)",
        "https://contraloria.nayarit.gob.mx/assets/pdf/normateca/2025/LEYES/LEY%20DE%20HACIENDA%20DEL%20ESTADO%20DE%20NAYARIT.pdf",
        "Art. 87 LH (reformed 8 Dec 2021): 3.0%; base includes honorarios asimilados (art. 86).",
        [],
    ),
    "NLE": (
        3.0,
        None,
        "verified",
        "Ley de Hacienda del Estado de Nuevo León (H. Congreso NL)",
        "https://www.hcnl.gob.mx/trabajo_legislativo/leyes/pdf/LEY%20DE%20HACIENDA%20DEL%20ESTADO%20DE%20NUEVO%20LEON.pdf",
        "Art. 157 LH: 3%; the 2026 proposal to raise it to 4% was rejected by Congress in Dec 2025 (Telediario).",
        [],
    ),
    "OAX": (
        3.0,
        None,
        "verified",
        "Ley Estatal de Hacienda del Estado de Oaxaca (2024 copy)",
        "https://oaxaca.gob.mx/semovi/wp-content/uploads/sites/34/2024/04/LEY_ESTATAL_DE_HACIENDA_DEL_ESTADO_DE_OAXACA.pdf",
        "Art. 66 LEH: 3%, bimonthly declarations; Dec 2024 reform changed exemptions only.",
        [],
    ),
    "PUE": (
        3.0,
        None,
        "verified",
        "Ley de Ingresos del Estado de Puebla 2026 (Orden Jurídico Poblano)",
        "https://ojp.puebla.gob.mx/media/k2/attachments/Ley_de_Ingresos_del_Estado_de_Puebla%2c_para_el_Ejercicio_Fiscal_2026_EV_27112025.pdf",
        "LI 2026 fixes 3% for the Impuesto sobre Erogaciones por Remuneraciones al Trabajo Personal (LH arts. 12-13); "
        "2.5% -> 3% in 2019 (reported).",
        [],
    ),
    "QUE": (
        3.0,
        "2022-01-01",
        "verified",
        "Ley de Hacienda del Estado de Querétaro (Legislatura)",
        "https://site.legislaturaqueretaro.gob.mx/CloudPLQ/InvEst/Leyes/LEY-ID-028.pdf",
        "Art. 72 LH: 3% (2% -> 3% reform P.O. 23 Dec 2021); base reduced by 8 monthly minimum wages (reported).",
        [],
    ),
    "ROO": (
        4.0,
        "2023-01-01",
        "verified",
        "Ley del Impuesto sobre Nóminas del Estado de Quintana Roo (Congreso, ed. 16 Dec 2025)",
        "https://documentos.congresoqroo.gob.mx/leyes/L167-XVIII-20251216-L1820251216190-Ley-del-Impuesto-sobre-N%C3%B3minas.pdf",
        "Art. 6: 4% (POE 23 Dec 2022, Decreto 031 in force 1 Jan 2023), 12.5% of proceeds to the security trust; later "
        "decrees changed retention rules only.",
        [(3.0, None, "2022-12-31", "Rate through 2022")],
    ),
    "SLP": (
        3.0,
        None,
        "verified",
        "Ley de Hacienda del Estado de San Luis Potosí (Congreso, edición al 30 Jan 2026)",
        "https://congresosanluis.gob.mx/sites/default/files/unpload/legislacion/leyes/2026/02/Ley%20de%20Hacienda%20del%20Estado%20%28al%2030%20enero%202026%29.pdf",
        "Art. 23 LH: 3% on the base of art. 22 (Impuesto sobre Erogaciones por Remuneraciones al Trabajo Personal, arts. 20-27); "
        "monthly declaration by the 15th; no rate change found for 2023-2026.",
        [],
    ),
    "SIN": (
        3.0,
        "2017-01-01",
        "verified",
        "Congreso de Sinaloa, comunicado on the reform of Ley de Hacienda art. 18",
        "https://www.congresosinaloa.gob.mx/comunicados/reforman-la-ley-de-hacienda-del-estado-de-sinaloa-en-materia-del-isn/",
        "Progressive monthly tariff (art. 18 LH): 2.4% up to MXN 500k; 2.6% to 700k; 2.8% to 900k; 3.0% above MXN 900k "
        "(top marginal recorded); unchanged through 2026.",
        [],
    ),
    "SON": (
        3.0,
        "2023-01-01",
        "reported",
        "AFG Consultoría boletín fiscal (Ley de Hacienda de Sonora arts. 213-221 Bis)",
        "https://www.afgconsultoriadenegocios.com.mx/blog/boletin-fiscal/impuesto-sobre-remuneracion-al-trabajo-personal-isrtp-3-al-estado/",
        "3% (1% for agriculture/forestry/fishing) since 2023, consolidating the former 2% plus university/education/"
        "bomberos contributions (about 2.9%); from 2025 an additional 1% for employers with more than 100 workers "
        "(security fund) is reported; hacienda.sonora.gob.mx returned 403.",
        [],
    ),
    "TAB": (
        3.5,
        "2025-01-01",
        "verified",
        "Ley de Hacienda del Estado de Tabasco (Congreso, ed. Jun 2026)",
        "https://congresotabasco.gob.mx/wp-content/uploads/2026/06/Ley-de-Hacienda-del-Estado-de-Tabasco-Enero-2023.pdf",
        "Art. 30 LH (Decreto 033, P.O. 8586 'L', 18 Dec 2024): 3.5% for private taxpayers, 3.0% for federal/state/"
        "municipal bodies, from FY2025.",
        [(2.5, None, "2024-12-31", "General rate through 2024 (3.0% for public-sector payers)")],
    ),
    "TAM": (
        3.0,
        None,
        "verified",
        "Ley de Hacienda para el Estado de Tamaulipas (compendio fiscal 2026)",
        "https://finanzas.tamaulipas.gob.mx/uploads/2026/01/compendio_fiscal/LEY_DE_HACIENDA_2026.pdf",
        "Art. 49 LH: 3% (arts. 45-52); the P.O. 150 reform of 16 Dec 2025 did not touch the rate.",
        [],
    ),
    "TLA": (
        3.0,
        None,
        "verified",
        "Código Financiero para el Estado de Tlaxcala y sus Municipios (Congreso)",
        "https://congresodetlaxcala.gob.mx/archivo/leyes2020/pdf/3_codigo_financier.pdf",
        "Art. 134 CF (reformed P.O. 19 Dec 2016): 3%; exemptions amended P.O. 18 Dec 2024.",
        [],
    ),
    "VER": (
        3.0,
        None,
        "verified",
        "Código Financiero para el Estado de Veracruz (SEFIPLAN, ed. Jan 2026)",
        "https://www.veracruz.gob.mx/finanzas/wp-content/uploads/sites/2/2026/01/CODIGO-FINANCIERO-ESTADO-DE-VERACRUZ-DE-IGNACIO-DE-LA-LLAVE.pdf",
        "Art. 101 CF: 3%; the executive's proposal to cut to 2% for 2026 was rejected by Congress (Dec 2025).",
        [],
    ),
    "YUC": (
        3.75,
        "2026-01-01",
        "verified",
        "Diario Oficial del Gobierno del Estado de Yucatán No. 35,877 (26 Dec 2025), Decreto 138/2025",
        "https://www.yucatan.gob.mx/docs/diario_oficial/diarios/2025/2025-12-26_1.pdf",
        "Art. 24 Ley General de Hacienda: 3.75% from 1 Jan 2026; Decreto 147/2025 refunds the 0.75 pt increase to micro "
        "and small employers for FY2026 (effective 3%).",
        [(3.0, None, "2025-12-31", "Rate through 2025")],
    ),
    "ZAC": (
        3.5,
        "2025-01-01",
        "verified",
        "SEFIN Zacatecas, ficha Impuesto sobre Nóminas (Ley de Hacienda arts. 37-44)",
        "https://sefin.zacatecas.gob.mx/wp-content/uploads/2025/01/IMPUESTO-SOBRE-NOMINAS.pdf",
        "Art. 40 LH (Decreto 22, Dec 2024): 3.5% from 2025, plus a 10% impuesto adicional for the UAZ (about 3.85% "
        "effective).",
        [(3.0, None, "2024-12-31", "Rate through 2024")],
    ),
}
for st, (val, frm, conf, src, url, note, history) in MX_ISN.items():
    jur = f"MX-{st}"
    R.append(
        rate(
            jur,
            "payroll_social",
            "standard",
            val,
            frm=frm,
            as_of=AUDIT_DATE,
            conf=conf,
            src=src,
            url=url,
            desc="Impuesto Sobre Nóminas / Erogaciones por Remuneraciones al Trabajo Personal (state payroll tax) rate",
            notes=note,
        )
    )
    _hist(jur, "payroll_social", "standard", history, src=src, url=url, desc="Prior state payroll tax rate")

# ======================================================================================================= Japan
SOUMU_TABLE = "総務省 令和7年度 法人住民税・法人事業税 税率一覧表 (as of 1 Apr 2025, published Sep 2025)"
SOUMU_TABLE_URL = "https://www.soumu.go.jp/main_content/001032861.pdf"
MOF_CIT = "https://www.mof.go.jp/tax_policy/summary/corporation/c01.htm"
PWC_JP = "https://taxsummaries.pwc.com/japan/corporate/taxes-on-corporate-income"
JP_ENT_DESC = (
    "Prefectural enterprise tax (法人事業税) income levy (所得割) rate for size-based corporations (capital > JPY 100m)"
)
JP_ENT_NOTE = (
    "Standard rates are fixed nationally in the Local Tax Act (所得割 1.0%, 付加価値割 1.2%, 資本割 0.5% for size-based "
    "corporations; 3.5%/5.3%/7.0% brackets for capital <= JPY 100m); a prefecture may apply excess rates up to 1.2x "
    "the standard. The special corporate business tax (特別法人事業税, 260% of the standard-rate income levy; 37% for "
    "non-size-based corporations) is collected with it and redistributed nationally."
)
# prefecture number -> (所得割 rate, confidence, note) for the 8 excess-rate prefectures; all others standard 1.0%
JP_EXCESS: dict[str, tuple] = {
    "04": (
        1.18,
        "verified",
        "Miyagi applies excess rates (所得割 1.18%, 付加価値割 1.26%, 資本割 0.525%) for fiscal years ending by 29 Feb 2028.",
    ),
    "13": (
        1.18,
        "verified",
        "Tokyo excess rates: 所得割 1.18%, 付加価値割 1.26%, 資本割 0.525%; small-capital brackets 3.75%/5.665%/7.48% "
        "(standard rates for capital <= JPY 100m with income <= JPY 25m); open-ended (当分の間).",
    ),
    "14": (
        1.18,
        "reported",
        "Kanagawa excess rates (所得割 1.18%, 付加価値割 1.26%, 資本割 0.525%); the soumu table lists the excess "
        "period as ending with fiscal years ending 31 Oct 2025 and its renewal was not confirmed.",
    ),
    "22": (1.18, "verified", "Shizuoka applies excess rates (所得割 1.18%) for fiscal years ending by 31 Mar 2029."),
    "23": (
        1.216,
        "verified",
        "Aichi excess rates: 所得割 1.216%, 付加価値割 1.2144%, 資本割 0.506%; small-capital brackets "
        "3.65%/5.519%/7.288%; period to fiscal years ending 31 Jan 2028.",
    ),
    "26": (1.18, "verified", "Kyoto applies excess rates (所得割 1.18%) for fiscal years ending by 31 Oct 2026."),
    "27": (
        1.18,
        "reported",
        "Osaka excess rates (所得割 1.18%); the soumu table lists the period as ending with fiscal years "
        "ending 31 Dec 2025 and its renewal was not confirmed; ハートフル税制 reductions for disability-employment companies.",
    ),
    "28": (
        1.18,
        "reported",
        "Hyogo excess rates (所得割 1.18%); the soumu table lists the period as ending with fiscal years "
        "ending 11 Mar 2026 and its renewal was not confirmed.",
    ),
}
for n in range(1, 48):
    code = f"{n:02d}"
    jur = f"JP-{code}"
    val, conf, note = JP_EXCESS.get(
        code, (1.0, "verified", "Standard rate (one of the 39 prefectures without excess taxation on enterprise tax).")
    )
    R.append(
        rate(
            jur,
            "corporate_income",
            "regional",
            val,
            as_of=AUDIT_DATE,
            conf=conf,
            src=SOUMU_TABLE,
            url=SOUMU_TABLE_URL,
            desc=JP_ENT_DESC,
            notes=f"{note} {JP_ENT_NOTE}",
            extra={"standard_rate": 1.0, "value_added_levy_standard": 1.2, "capital_levy_standard": 0.5},
        )
    )
    if code == "13":
        R.append(
            rate(
                jur,
                "corporate_income",
                "headline",
                31.52,
                frm="2026-04-01",
                as_of=AUDIT_DATE,
                conf="reported",
                src="PwC Worldwide Tax Summaries, Japan (reviewed 7 Aug 2026)",
                url=PWC_JP,
                desc="Effective statutory corporate tax rate in Tokyo for a company with paid-in capital > JPY 100m",
                notes="PwC Tokyo table for fiscal years beginning on/after 1 Apr 2026: corporate tax 23.2%, local corporate "
                "tax 2.39%, enterprise tax 1.18%, special corporate business tax 2.6%, inhabitants' tax 2.413%, defence "
                "special corporation tax 0.928% = 32.71% nominal, 31.52% effective after deducting enterprise taxes. The "
                "pre-defence-surtax figure (about 30.62%) no longer appears on the live PwC page.",
            )
        )
    elif code not in JP_EXCESS:
        R.append(
            rate(
                jur,
                "corporate_income",
                "headline",
                30.64,
                frm="2026-04-01",
                as_of=AUDIT_DATE,
                conf="verified",
                src="Ministry of Finance Japan, 法人課税に関する基本的な資料 (法人実効税率)",
                url=MOF_CIT,
                desc="Effective statutory corporate tax rate at standard local rates (large company, no excess taxation)",
                notes="MOF: 29.74% since FY2018 at standard rates; 30.64% for fiscal years beginning on/after 1 Apr 2026 for "
                "companies subject to the defence special corporation tax (防衛特別法人税); JETRO section 3.3 quotes the same "
                "figures. Prefectures with excess enterprise-tax rates (Miyagi, Tokyo, Kanagawa, Shizuoka, Aichi, Kyoto, "
                "Osaka, Hyogo) have a slightly higher effective rate and are not given a headline row here.",
            )
        )
        _hist(
            jur,
            "corporate_income",
            "headline",
            [(29.74, "2018-04-01", "2026-03-31", "Standard-rate effective CIT FY2018-FY2025 (MOF)")],
            src="Ministry of Finance Japan",
            url=MOF_CIT,
            desc="Prior effective statutory corporate tax rate at standard local rates",
        )

# ======================================================================================================= Italy
MEF_IRAP = "MEF Dipartimento delle Finanze, IRAP aliquote applicabili 2026 (elenco vigente, agg. 28 Jul 2026)"
MEF_IRAP_URL = "https://www1.finanze.gov.it/finanze2/dipartimentopolitichefiscali/fiscalitalocale/aliquoteirap/download/download.php?tipo=irp&anno=2026"
MEF_ADD = "MEF Dipartimento delle Finanze, addizionale regionale IRPEF aliquote 2026 (agg. 19 Jun 2026)"
MEF_ADD_BASE = "https://www1.finanze.gov.it/finanze2/dipartimentopolitichefiscali/fiscalitalocale/addregirpef/addregirpef.php?reg={reg}&anno=2026"
# code: (MEF reg id, IRAP %, IRAP from, IRAP history, IRAP note, addizionale top %, add from, add history, add note)
IT_REGION_RATES: dict[str, tuple] = {
    "21": (
        "13",
        3.90,
        None,
        [],
        "Ordinary rate.",
        3.33,
        None,
        [],
        "4 brackets 1.62/2.68/3.31/3.33 (<=15k/15-28k/28-50k/>50k); 2026 raised the two middle brackets (L.R. 16/2025), top unchanged.",
    ),
    "23": (
        "20",
        3.90,
        None,
        [],
        "Ordinary rate.",
        1.23,
        None,
        [],
        "Single rate 1.23 with full exemption below EUR 15,000 (L.R. 29/2025).",
    ),
    "25": (
        "10",
        3.90,
        None,
        [],
        "Ordinary rate; 4.65% only for listed ATECO sectors (L.R. 34/2022).",
        1.73,
        None,
        [],
        "4 brackets 1.23/1.58/1.72/1.73.",
    ),
    "32": (
        "03",
        3.90,
        None,
        [],
        "Bolzano ordinary 3.90% (2.68% reduced for employers paying additional economic elements, L.P. 9/1998 "
        "art. 21-bis); Trento's general rate for art. 16 c.1 subjects is the reduced 2.68% (L.P. 21/2015), with 2.00% and 4.82% tiers.",
        1.73,
        None,
        [],
        "Both provinces top out at 1.73%: Bolzano 1.23/1.23/1.73 with a EUR 430.50 detrazione below EUR 90k; "
        "Trento 1.23/1.23/1.23/1.73 with a EUR 30k deduction for imponibile <= 30k (MEF reg 03 Bolzano, reg 18 Trento).",
    ),
    "34": (
        "21",
        4.08,
        "2025-01-01",
        [(3.90, None, "2024-12-31", "Ordinary rate before the generalised surcharge")],
        "3.90% + 0.18 pp generalised surcharge from tax year 2025 (L.R. 32/2024 art. 2; MEF labels it 'maggiorazione generalizzata').",
        1.23,
        None,
        [],
        "Single rate 1.23.",
    ),
    "36": ("07", 3.90, None, [], "Ordinary rate.", 1.23, None, [], "0.70% up to EUR 15k, 1.23% above."),
    "42": (
        "09",
        3.90,
        None,
        [],
        "Ordinary rate.",
        3.23,
        None,
        [],
        "3 brackets 1.23 (<=28k) / 3.18 (28-50k) / 3.23 (>50k).",
    ),
    "45": (
        "06",
        3.90,
        None,
        [],
        "Ordinary rate.",
        3.33,
        None,
        [],
        "4 brackets 1.33/1.93/2.78/3.33; 28-50k bracket cut from 2.93 (2025) to 2.78 (2026), top unchanged.",
    ),
    "52": ("17", 3.90, None, [], "Ordinary rate.", 3.33, None, [], "4 brackets 1.42/1.43/3.32/3.33."),
    "55": (
        "19",
        4.30,
        "2026-01-01",
        [(3.90, None, "2025-12-31", "Ordinary rate through 2025")],
        "Raised to 4.30% for 2026 under L.R. 2/2025 art. 1 c.4 (4.82% for listed ATECO sectors).",
        3.33,
        None,
        [],
        "4 brackets 1.73/3.02/3.12/3.33 with L.R. 2/2025 surcharges waived below EUR 28k.",
    ),
    "57": (
        "11",
        4.73,
        None,
        [],
        "Regional surcharge under L.R. 35/2001 art. 1 c.3 (riparametrata per L. 244/2007).",
        1.73,
        None,
        [],
        "4 brackets 1.23/1.53/1.70/1.73.",
    ),
    "62": (
        "08",
        4.82,
        None,
        [],
        "3.90% + 0.92 pp health-deficit surcharge (art. 1 c.174 L. 311/2004), restated for 2026 by L.R. 20/2025 "
        "with 3.90% tiers for mountain-municipality firms, ETS and relocating businesses.",
        3.33,
        None,
        [],
        "1.73% up to EUR 15k, 3.33% on all brackets above.",
    ),
    "65": (
        "01",
        4.82,
        None,
        [],
        "3.90% + 0.92 pp health-deficit surcharge (art. 1 c.174 L. 311/2004; L.R. 44/2006).",
        3.33,
        None,
        [],
        "3 brackets 1.67 (<=28k) / 2.87 / 3.33.",
    ),
    "67": (
        "12",
        4.97,
        None,
        [],
        "Deficit region: 3.90% + 0.92 regional surcharge + 0.15 automatic surcharge (art. 2 c.86 L. 191/2009).",
        3.63,
        None,
        [],
        "4 brackets 2.03/2.23/3.63/3.63 per the 19 Jun 2026 publication layering the automatic +0.30 deficit surcharge "
        "over the January schedule 1.73/1.93/3.33/3.33; same two-step pattern as 2025.",
    ),
    "72": (
        "05",
        4.97,
        None,
        [],
        "Deficit region: 3.90% + 0.92 + 0.15 automatic health-deficit surcharge (L.R. 4/2014; art. 2 c.86 L. 191/2009).",
        3.33,
        None,
        [],
        "4 brackets 1.73/2.96/3.20/3.33 (L.R. 31/2021; child detrazioni below EUR 28k).",
    ),
    "75": (
        "14",
        4.82,
        None,
        [],
        "L.R. 40/2015 art. 4.",
        3.33,
        "2026-01-01",
        [
            (
                1.85,
                None,
                "2025-12-31",
                "Top rate of the 1.33/1.43/1.63/1.85 schedule in force through 2025 and in the Jan 2026 list",
            )
        ],
        "New schedule 1.33/2.13/3.23/3.33 for 2026 under Decree no. 3 of 28 May 2026 of the Regional President as Commissario ad "
        "acta (art. 1 c.174 L. 311/2004) to cover the Q4-2025 health-service deficit; MEF publication 29 May 2026.",
    ),
    "77": ("02", 3.90, None, [], "Ordinary rate.", 1.23, None, [], "Single rate 1.23."),
    "78": (
        "04",
        4.82,
        None,
        [],
        "Deficit region: 3.90% + 0.92 (art. 1 c.174 L. 311/2004).",
        1.73,
        None,
        [],
        "Single rate 1.73 = 1.23 + 0.50 deficit surcharge (L.R. 30/2002; art. 29 c.14 D.L. 216/2011).",
    ),
    "82": ("16", 3.90, None, [], "Ordinary rate (L.R. 8/2017 art. 3 c.16).", 1.23, None, [], "Single rate 1.23."),
    "88": (
        "15",
        2.93,
        None,
        [],
        "Ordinary rate reduced by 0.97 pp (L.R. 5/2015 art. 3 c.5 lett. a).",
        1.23,
        None,
        [],
        "Single rate 1.23.",
    ),
}
IT_IRAP_NOTE = (
    "Per-region MEF IRAP pages render client-side, so the source is the MEF 2026 'vigenti' CSV. National base 3.9% "
    "(art. 16 c.1 D.Lgs. 446/1997) adjustable by +/-0.92 pp; deficit regions carry automatic surcharges."
)
for code, (reg, irap, irap_frm, irap_hist, irap_note, add, add_frm, add_hist, add_note) in IT_REGION_RATES.items():
    jur = f"IT-{code}"
    add_url = MEF_ADD_BASE.format(reg=reg)
    R.append(
        rate(
            jur,
            "corporate_income",
            "regional",
            irap,
            frm=irap_frm,
            as_of=AUDIT_DATE,
            conf="verified",
            src=MEF_IRAP,
            url=MEF_IRAP_URL,
            desc="IRAP ordinary rate (aliquota ordinaria) for general businesses, tax period 2026",
            notes=f"{irap_note} {IT_IRAP_NOTE}",
            extra={"trento": 2.68, "bolzano": 3.90} if code == "32" else None,
        )
    )
    _hist(
        jur, "corporate_income", "regional", irap_hist, src=MEF_IRAP, url=MEF_IRAP_URL, desc="Prior IRAP ordinary rate"
    )
    R.append(
        rate(
            jur,
            "personal_income",
            "regional",
            add,
            frm=add_frm,
            as_of=AUDIT_DATE,
            conf="verified",
            src=MEF_ADD,
            url=add_url,
            desc="Addizionale regionale IRPEF top rate, tax year 2026 (national base 1.23%)",
            notes=add_note,
        )
    )
    _hist(
        jur,
        "personal_income",
        "regional",
        add_hist,
        src=MEF_ADD,
        url=add_url,
        desc="Prior addizionale regionale IRPEF top rate",
    )

# =================================================================================================== Argentina
IIBB_DESC = "gross receipts tax (Ingresos Brutos)"
# code: (rate, effective_from, confidence, source_name, source_url, note, history, proxy flag)
AR_IIBB: dict[str, tuple] = {
    "A": (
        3.0,
        None,
        "reported",
        "Ley 6611 (Ley Impositiva Salta) consolidated, art. 12 (leyes-ar.com, 22 Apr 2026)",
        "https://leyes-ar.com/ley_impositiva_salta/12.htm",
        "Art. 12: 30 per mil general rate (Impuesto a las Actividades Económicas); specials 25 per mil wholesale/construction, "
        "18 per mil hydrocarbons, 50 per mil intermediation/financial; Ley Impositiva 2026 (25 Nov 2025) kept all rates; "
        "aggregators cite 3.5-3.6%, DGR Salta pages are JS-only.",
        [],
        False,
    ),
    "B": (
        5.0,
        "2026-01-01",
        "verified",
        "ARBA, Ley 15.558 (Ley Impositiva 2026)",
        "https://www.arba.gov.ar/archivos/Publicaciones/leyimpositiva2026.pdf",
        "No single statutory general rate: art. 20 per-activity table; retail commerce (NAIIB 4711) 5% (3.5%/2.5% reduced "
        "by income tramo), professional services 4.5%, industry 1.5%. Retail commerce rate recorded as the proxy.",
        [],
        True,
    ),
    "C": (
        3.0,
        "2026-01-01",
        "verified",
        "Boletín Oficial CABA, Ley 6927 (Ley Impositiva 2026) Anexo",
        "https://documentosboletinoficial.buenosaires.gob.ar/publico/PL-LEY-LCABA-LCBA-6927-25-ANX.pdf",
        "Art. 21 alícuota subsidiaria 3.00%; commerce 3% up to ARS 364m prior-year income then 5%; services 3% up to ARS 2,004m "
        "then 3.75-5%; industry 1%; Ley 6948 (1 Jun 2026) raised the thresholds.",
        [],
        False,
    ),
    "D": (
        4.2,
        "2026-01-01",
        "verified",
        "DPIP San Luis, Ley VIII-0254-2025 (Ley Impositiva 2026)",
        "https://dpip.sanluis.gov.ar/rentas_sanluis/Normativas/Leyes/2025/LEY%20IMPOSITIVA%20N%C2%BA%20VIII-0254-2025.pdf",
        "Anexo I general column: retail and professional services 4.20%, applied by default when DPIP is silent; 20% "
        "compliance discount (art. 17); 2.0-2.5% for smaller taxpayers; promoted industry exempt.",
        [],
        False,
    ),
    "E": (
        3.5,
        None,
        "reported",
        "Ley 9622 art. 7 consolidated (leyes-ar.com, 22 Apr 2026)",
        "https://leyes-ar.com/ley_impositiva_entre_rios/7.htm",
        "Art. 7 general 3.5% (4.5% for taxpayers headquartered outside the province); Decreto 301/2026 lifted income "
        "thresholds 30% (commerce 3.5% to ARS 1,040m, 4% to 5,200m, 5% above); ATER site unreachable.",
        [],
        False,
    ),
    "F": (
        3.0,
        "2026-01-01",
        "verified",
        "DGIP La Rioja, Ley 10.852 (Ley Impositiva 2026)",
        "https://www.dgiplarioja.gob.ar/archivos/Legislacion/Leyes%20Impositivas/LEY%20IMPOSITIVA%202026.pdf",
        "Art. 19: 3% for activities not listed in Anexo I.",
        [],
        False,
    ),
    "G": (
        3.0,
        None,
        "reported",
        "DGR Santiago del Estero, Ley 6.793",
        "http://www.dgrsantiago.gov.ar/wp-content/uploads/2022/01/DESCARGAR-LEY-6793.pdf",
        "Art. 2 fixes 3% general for commerce and services; no annual 2026 Ley Impositiva located, so the 2026 status of the "
        "standing law is unconfirmed.",
        [],
        False,
    ),
    "H": (
        2.9,
        "2026-01-01",
        "verified",
        "ATP Chaco, Ley Tarifaria 299-F texto vigente desde 1 Jul 2025",
        "https://atp.chaco.gob.ar/documentos/legislativos/ley-tarifaria-l-299-f-vigencia-desde-01-07-2025.docx",
        "Art. 7: 3.2% until 31 Dec 2025 and 2.9% from 1 Jan 2026 for general and wholesale rates (Ley 4156-F of 25 Jun 2025).",
        [
            (3.2, "2025-07-01", "2025-12-31", "Ley 4156-F interim rate"),
            (3.5, None, "2025-06-30", "Rate until 30 Jun 2025"),
        ],
        False,
    ),
    "J": (
        3.0,
        "2026-01-01",
        "verified",
        "DGR San Juan, Ley 2803-I (Ley Impositiva 2026)",
        "https://abc.dgrsj.gob.ar/uploads/pdfs/c5ff7198-7bb0-4594-9079-9ac7cae18c15.pdf",
        "Art. 45: 3% general for activities without special treatment; primary 0.75%, industry 1.5%.",
        [],
        False,
    ),
    "K": (
        3.0,
        "2026-01-01",
        "reported",
        "Ley 5927 / Decreto 1679 (Ley Impositiva 2026, BO 19 Dec 2025) via dentrode.com.ar",
        "https://www.dentrode.com.ar/tablas/provincias/catamarca_2026.pdf",
        "Art. 14: commerce 3%, services 3%, industry 1.5%, primary 0.75%, construction 2.5%, financial 7%; official "
        "Catamarca sites not fetchable.",
        [],
        False,
    ),
    "L": (
        3.0,
        "2026-01-01",
        "reported",
        "Ley 3636 (Ley Impositiva 2026) via Bolsa de Comercio de La Pampa",
        "https://bcp.org.ar/userfiles/files/LeyImpositivaLaPampa.pdf",
        "Art. 24 applies the general rate of 3.0%; Anexo I rates not text-extractable; industry 1%.",
        [],
        False,
    ),
    "M": (
        3.5,
        "2026-01-01",
        "verified",
        "ATM Mendoza, Ley 9680 Planilla Analítica Alícuotas IIBB 2026",
        "https://atm.mendoza.gov.ar/wp-content/uploads/2025/12/Planilla-Analitica-y-Detalle-de-Referencia.pdf",
        "Three tiers (reducida <= ARS 450m 2025 income, general, incrementada > ARS 4,500m): retail/wholesale 2.5/3.5/4.5%, "
        "professional services 3/4/5%; the general-tier commerce rate is recorded as the proxy.",
        [],
        True,
    ),
    "N": (
        2.5,
        None,
        "reported",
        "Digesto Misiones, Ley XXII-N°25 (Ley de Alícuotas) consolidated 2023",
        "https://digestomisiones.gob.ar/archivospdf/1688643175_Ley%20XXII%20-%20N%2025.pdf",
        "Art. 11 general 2.5%; art. 12 3.4% for sales/services to final consumers; 2026 amendments not checked.",
        [],
        False,
    ),
    "P": (
        3.0,
        None,
        "verified",
        "Poder Judicial Formosa, Ley 1590 (Ley Impositiva)",
        "http://jusformosa.gov.ar/fx/biblioteca/legislacion/LeyImpositiva1590.pdf",
        "Art. 50: 3% general; primary 0.75%, secondary production 1.5%, fuel 2%; no annual law, ATP RG 05/2026 updated minimums only.",
        [],
        False,
    ),
    "Q": (
        3.0,
        "2026-01-01",
        "reported",
        "Ley 3541 (Ley Impositiva 2026) via dentrode.com.ar; Ley 3479 (2025) official",
        "https://www.dentrode.com.ar/tablas/provincias/neuquen_2026.pdf",
        "Art. 4 general 3%; retail commerce 5%, services 4-5%, MiPyME progressive 2-3.5%, micro/small industry 0%.",
        [],
        False,
    ),
    "R": (
        5.0,
        "2026-01-01",
        "verified",
        "Legislatura Río Negro, Ley 5837 (P-1570/2025; BO 29 Dec 2025)",
        "https://web.legisrn.gov.ar/legislativa/proyectos/documento?c=P&n=1570&a=2025&e=original",
        "No single general rate: art. 6 per-activity table with retail and professional services 5%, software 3%, primary 0%; "
        "retail rate recorded as the proxy; 2026 cut gas/electricity distribution 2.5% -> 1%.",
        [],
        True,
    ),
    "S": (
        4.5,
        None,
        "verified",
        "Gobierno de Santa Fe, Ley Impositiva Anual 3650 art. 6 (texto modificado)",
        "https://www.santafe.gob.ar/normativa/getFile.php?id=1312086&item=169232&cod=b495aae8a3b153bd8e86666ae4f0f587",
        "Alícuota básica 4.50%, 5% above the SEPyME thresholds; Ley 14.426 (BO 23 Dec 2025) left the basic rate unchanged.",
        [],
        False,
    ),
    "T": (
        5.0,
        "2026-01-01",
        "verified",
        "DGR Tucumán, Nomenclador de Actividades y Alícuotas IIBB 2026",
        "https://www.rentastucuman.gob.ar/nomina/rentastuc2/nwx1ut2pa3lo/nomencladordgr.pdf",
        "Ley 5121 sets no single general rate: 315 commerce/service codes at 5%, industry 1.5%, primary 0.75%; 3.5% for "
        "small taxpayers (art. 7); predominant rate recorded as the proxy.",
        [],
        True,
    ),
    "U": (
        5.0,
        "2026-01-01",
        "reported",
        "Ley XXIV N°119 (Obligaciones Tributarias 2026) via dentrode.com.ar",
        "https://www.dentrode.com.ar/tablas/provincias/chubut_2026.pdf",
        "No single general rate: retail 5%, business services 4%, utilities 3.75%, health 3.5%, primary 0.75%; retail rate "
        "recorded as the proxy; ARECH site is JS-only.",
        [],
        True,
    ),
    "V": (
        3.0,
        None,
        "reported",
        "argentina.gob.ar, Ley 440 (Ley Impositiva TDF) texto actualizado",
        "https://www.argentina.gob.ar/normativa/provincial/ley-440-123456789-0abc-defg-639-0000vvorpyel/actualizacion",
        "Art. 25: general rate 3.0% for non-codified activities; Anexo I nomenclador carries 0.5-3.5% bands; consolidation "
        "date not confirmed.",
        [],
        False,
    ),
    "W": (
        2.9,
        None,
        "verified",
        "DGR Corrientes, Ley 6249 (Ley Tarifaria) art. 3",
        "https://www.dgrcorrientes.gov.ar/rentascorrientes/contenidos/archivos%20pdf/Ley%206249_modif%2009032021.pdf",
        "General 2.90% for all activities except specials (primary 1.15%, industry 1.75%, transport 2%, construction 2.5%); "
        "2026 consolidated text unchanged.",
        [],
        False,
    ),
    "X": (
        4.75,
        "2026-01-01",
        "verified",
        "Rentas Córdoba, Ley 11.090 (Ley Impositiva Anual 2026) art. 13",
        "https://www.rentascordoba.gob.ar/cms/wp-content/uploads/2026/02/ley_n_11090_%E2%80%93_ley_impositiva_anual_2026.pdf",
        "General 4.75% capped at the Consenso Fiscal ceiling; commerce 3.5%/4.75%/5.5% by income tier (small-commerce rate "
        "cut to 2.5% in 2026).",
        [],
        False,
    ),
    "Y": (
        3.5,
        "2026-01-01",
        "verified",
        "Boletín Oficial Jujuy N°144, Ley 6492 (Ley Impositiva 2026)",
        "https://boletinoficial.jujuy.gob.ar/?p=324226",
        "Anexo III art. 1 general 3.5%; commerce 2.5-4.5%, industry 1.5-1.8%, construction 2.5%.",
        [],
        False,
    ),
    "Z": (
        3.0,
        None,
        "reported",
        "Ley 3485 (Ley Impositiva Santa Cruz) art. 5 via dentrode.com.ar",
        "https://www.dentrode.com.ar/tablas/provincias/santacruz_2026.pdf",
        "3% for activities not in Anexo I (supermarket retail 5%, wholesale food 3%, professional services 3%); ASIP site "
        "lists no statute PDF.",
        [],
        False,
    ),
}
for p, (val, frm, conf, src, url, note, history, proxy) in AR_IIBB.items():
    jur = f"AR-{p}"
    desc = (
        f"{IIBB_DESC} general rate"
        if not proxy
        else f"{IIBB_DESC} retail-commerce rate (no single statutory general rate)"
    )
    R.append(
        rate(
            jur,
            "sales_use",
            "standard",
            val,
            frm=frm,
            as_of=AUDIT_DATE,
            conf=conf,
            src=src,
            url=url,
            desc=desc,
            notes=note,
            extra={"proxy": "retail_commerce"} if proxy else None,
        )
    )
    _hist(jur, "sales_use", "standard", history, src=src, url=url, desc=f"Prior {IIBB_DESC} general rate")

# ===================================================================================================== Nigeria
NTA_GAZETTE = "Nigeria Tax Act 2025 (Official Gazette No. 117, 26 Jun 2025, Act No. 7), Fourth Schedule — LIRS copy"
NTA_GAZETTE_URL = "https://lirs.gov.ng/assets/docs/Gazette%20-%20NIGERIA%20TAX%20ACT,%202025.pdf"
PWC_NG = "https://taxsummaries.pwc.com/nigeria/individual/significant-developments"
NG_NOTE = (
    "Personal income tax on residents is assessed and collected by the State Internal Revenue Service (Nigeria Tax "
    "Administration Act 2025 s.3(2), s.87), but the rate schedule is fixed nationally in the Fourth Schedule of the "
    "Nigeria Tax Act 2025 and is therefore identical in every state: 0% on the first NGN 800,000; 15% next 2.2m; 18% next "
    "9m; 21% next 13m; 23% next 25m; 25% above NGN 50m (minimum-wage earners exempt). Effective 1 Jan 2026; assented "
    "26 Jun 2025."
)
for code, _name, *_ in NG_STATES:
    R.append(
        rate(
            code,
            "personal_income",
            "top_marginal",
            25.0,
            thr=50_000_000,
            cur="NGN",
            frm="2026-01-01",
            as_of=AUDIT_DATE,
            conf="verified",
            src=NTA_GAZETTE,
            url=NTA_GAZETTE_URL,
            desc="Top marginal personal income tax rate (state-administered, uniform national schedule)",
            notes=NG_NOTE,
        )
    )
    _hist(
        code,
        "personal_income",
        "top_marginal",
        [
            (
                24.0,
                None,
                "2025-12-31",
                "Personal Income Tax Act (Cap. P8, as amended 2011) Sixth Schedule: 7/11/15/19/21/24%, top rate above NGN 3.2m (PwC)",
            )
        ],
        src="PwC Worldwide Tax Summaries, Nigeria",
        url=PWC_NG,
        desc="Prior top marginal personal income tax rate",
    )

RATES_SUBNATIONAL_GLOBAL: list[dict] = R
