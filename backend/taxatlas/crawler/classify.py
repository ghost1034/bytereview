"""Keyword heuristics that turn a raw title/summary into TaxAtlas enum values.

Deliberately deterministic and transparent: every decision is a table lookup or a regex so an
analyst can audit why an item was tagged. Tune the tables; do not add ML here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from taxatlas.models.enums import DocType, MeasureStatus, RegulationStatus, Significance, TariffMeasure, TaxType

# --------------------------------------------------------------------------------------
# Tax-type keyword tables. Order matters: earlier entries win ties; more specific first.
# --------------------------------------------------------------------------------------
TAX_TYPE_KEYWORDS: list[tuple[TaxType, tuple[str, ...]]] = [
    (
        TaxType.PILLAR_TWO,
        (
            "pillar two",
            "pillar 2",
            "globe rules",
            "global minimum tax",
            "qualified domestic minimum top-up",
            "qdmtt",
            "income inclusion rule",
            "undertaxed profits",
            "utpr",
            "top-up tax",
            "minimum tax directive",
            "beps 2.0",
            "amount b",
        ),
    ),
    (
        TaxType.TRANSFER_PRICING,
        (
            "transfer pricing",
            "arm's length",
            "arm’s length",
            "advance pricing",
            "apa program",
            "mutual agreement procedure",
            "country-by-country",
            "cbcr",
            "intercompany pricing",
            "section 482",
            "§ 482",
        ),
    ),
    (
        TaxType.DIGITAL_SERVICES,
        (
            "digital services tax",
            "digital service tax",
            "dst ",
            "digital tax",
            "digital levy",
            "equalisation levy",
            "equalization levy",
            "significant economic presence",
            "amount a",
            "digital platform reporting",
            "dac7",
            "platform economy",
        ),
    ),
    (
        TaxType.CUSTOMS_TARIFF,
        (
            "tariff",
            "customs",
            "antidumping",
            "anti-dumping",
            "countervailing",
            "section 232",
            "section 301",
            "ieepa",
            "safeguard",
            "import duty",
            "import duties",
            "harmonized tariff",
            "htsus",
            "hts ",
            "rules of origin",
            "trade remed",
            "cbam",
            "carbon border",
            "duty rate",
            "duty-free",
            "de minimis",
            "quota",
            "export control",
            "entity list",
            "reciprocal tariff",
            "trade agreement",
            "free trade agreement",
            "bonded warehouse",
            "csms",
            "country of origin",
            "foreign-trade zone",
            "foreign trade zone",
            "ad/cvd",
            "dumping",
            "関税",  # ja: customs duty
            "关税",  # zh: customs duty
        ),
    ),
    (
        TaxType.VAT,
        (
            "vat",
            "value added tax",
            "value-added tax",
            "taxe sur la valeur ajoutée",
            "tva",
            "umsatzsteuer",
            "mehrwertsteuer",
            "btw",
            "iva",
            "one stop shop",
            "oss",
            "import one-stop",
            "ioss",
            "vida",
            "vat in the digital age",
            "e-invoicing",
            "e-invoice",
            "electronic invoicing",
            "reverse charge",
            "input tax",
            "place of supply",
            "mini one stop",
            "消費税",  # ja: consumption tax
            "增值税",  # zh: VAT
        ),
    ),
    (
        TaxType.GST,
        ("gst", "goods and services tax", "harmonized sales tax", "hst", "igst", "cgst", "sgst", "input tax credit"),
    ),
    (
        TaxType.SALES_USE,
        (
            "sales tax",
            "sales and use",
            "sales & use",
            "use tax",
            "seller's permit",
            "marketplace facilitator",
            "economic nexus",
            "remote seller",
            "wayfair",
            "local sales",
            "transaction privilege",
            "gross receipts tax",
            "retail sales",
            "sales-tax",
        ),
    ),
    (
        TaxType.EXCISE,
        (
            "excise",
            "fuel tax",
            "fuel duty",
            "tobacco",
            "alcohol duty",
            "spirits duty",
            "beer duty",
            "cigarette",
            "vaping",
            "sugar tax",
            "soft drinks industry levy",
            "carbon tax",
            "air passenger duty",
            "plastic packaging tax",
            "stamp duty",
            "motor fuel",
            "highway use",
            "superfund",
            "medical device tax",
            "heavy vehicle use",
            "gaming tax",
            "wagering",
            "酒税",  # ja: liquor tax
            "印紙税",  # ja: stamp tax
            "たばこ税",  # ja: tobacco tax
        ),
    ),
    (
        TaxType.PAYROLL_SOCIAL,
        (
            "payroll",
            "employment tax",
            "social security",
            "national insurance",
            "fica",
            "futa",
            "unemployment insurance",
            "paye",
            "employer contribution",
            "superannuation guarantee",
            "wage withholding",
            "form 941",
            "form w-2",
            "employee retention credit",
            "erc claim",
            "tip income",
            "overtime",
            "fringe benefit",
        ),
    ),
    (
        TaxType.WITHHOLDING,
        (
            "withholding",
            "withheld",
            "fatca",
            "crs ",
            "common reporting standard",
            "chapter 3",
            "chapter 4",
            "form 1042",
            "form w-8",
            "backup withholding",
            "treaty benefit",
            "double taxation",
            "tax treaty",
            "double tax",
            "dividend tax",
            "royalty tax",
            "qualified intermediary",
            "non-resident tax",
            "源泉徴収",  # ja: withholding at source
            "租税条約",  # ja: tax treaty
        ),
    ),
    (
        TaxType.CAPITAL_GAINS,
        (
            "capital gains",
            "capital gain",
            "carried interest",
            "like-kind",
            "section 1031",
            "qualified opportunity",
            "wash sale",
            "crypto asset",
            "cryptocurrency",
            "digital asset",
            "virtual currency",
            "basis reporting",
            "form 1099-da",
            "net investment income",
        ),
    ),
    (
        TaxType.CORPORATE_INCOME,
        (
            "corporate tax",
            "corporation tax",
            "corporate income",
            "company tax",
            "business tax",
            "cit ",
            "corporate minimum",
            "camt",
            "book minimum",
            "gilti",
            "fdii",
            "subpart f",
            "beat",
            "interest limitation",
            "section 163(j)",
            "174",
            "research credit",
            "r&d credit",
            "r&d tax",
            "bonus depreciation",
            "section 179",
            "depreciation",
            "net operating loss",
            "nol",
            "partnership",
            "s corporation",
            "consolidated return",
            "tax credit",
            "investment tax credit",
            "production tax credit",
            "clean energy credit",
            "45x",
            "45y",
            "48e",
            "opportunity zone",
            "franchise tax",
            "corporate",
            "körperschaftsteuer",
            "impôt sur les sociétés",
            "vennootschapsbelasting",
            "gewerbesteuer",
            "trade tax",
            "dividend",
            "thin capitalisation",
            "thin capitalization",
            "loss relief",
            "group relief",
            "patent box",
            "innovation box",
            "tax incentive",
            "tax holiday",
            "minimum tax",
            "法人税",  # ja: corporation tax
            "企业所得税",  # zh: enterprise income tax
        ),
    ),
    (
        TaxType.PERSONAL_INCOME,
        (
            "individual income",
            "personal income",
            "income tax return",
            "form 1040",
            "tax refund",
            "refunds",
            "filing season",
            "standard deduction",
            "itemized",
            "child tax credit",
            "earned income",
            "eitc",
            "estimated tax",
            "self-employ",
            "retirement",
            "ira ",
            "401(k)",
            "pension",
            "self assessment",
            "personal allowance",
            "inheritance tax",
            "estate tax",
            "gift tax",
            "taxpayer",
            "wealth tax",
            "exit tax",
            "expat",
            "residency",
            "tax residence",
            "income tax",
            "einkommensteuer",
            "impôt sur le revenu",
            "inkomstenbelasting",
            "direct tax",
            "salary",
            "bracket",
            "tax rate",
            "rates and thresholds",
            "marginal rate",
            "interest rates",
            "free file",
            "identity theft",
            "scam",
            "tax season",
            "filing deadline",
            "extension to file",
            "tax relief",
            "disaster relief",
            "penalty relief",
            "amnesty",
            "voluntary disclosure",
            "tax return",
            "所得税",  # ja: income tax
            "相続税",  # ja: inheritance tax
            "贈与税",  # ja: gift tax
            "確定申告",  # ja: final tax return
            "个人所得税",  # zh: individual income tax
        ),
    ),
    (
        TaxType.PROPERTY,
        (
            "property tax",
            "real estate tax",
            "council tax",
            "business rates",
            "land tax",
            "land value",
            "rates relief",
            "ad valorem property",
            "real property",
            "homestead",
            "assessment appeal",
            "millage",
        ),
    ),
]

_TAX_RELEVANT_TERMS = (
    # ja
    "税",
    "国税",
    "関税",
    "申告",
    "納税",
    "源泉",
    "消費税",
    "法人税",
    "所得税",
    "路線価",
    "査察",
    "相続税",
    "酒税",
    "印紙",
    # pt / es
    "receita",
    "tributa",
    "contribuinte",
    "aduan",
    "alfândega",
    "declaração",
    "imposto",
    "impuesto",
    "contribuyente",
    "declaración",
    "factura",
    "del sat",
    "el sat",
    "al sat",
    "cfdi",
    "rfc",
    "iva",
    "isr",
    "ieps",
    "fiscalização",
    "malha",
    "simples nacional",
    "darf",
    "irpf",
    "ecf",
    "sped",
    "nota fiscal",
    # 2026-08 Americas additions: Latin American tax acronyms and terms
    "itbms",  # Panama VAT
    "itbis",  # Dominican Republic VAT
    "igv",  # Peru VAT
    "iue",  # Bolivia corporate income tax
    "icms",  # Brazil state VAT
    "cofins",
    "itcd",  # Brazil state inheritance/gift tax
    "ipva",  # Brazil state vehicle tax
    "ingresos brutos",  # Argentina provincial turnover tax
    "abst",  # Antigua and Barbuda sales tax
    "gct",  # Jamaica general consumption tax
    "tributo",
    "tributos",
    # zh / generic
    "税务",
    "税收",
    "退税",
    "vat refund",
    "departure tax",
    "tax refund",
    "tax",
    "taxation",
    "taxpayer",
    "revenue",
    "vat",
    "gst",
    "duty",
    "duties",
    "tariff",
    "customs",
    "excise",
    "levy",
    "hmrc",
    "irs",
    "internal revenue",
    "treasury",
    "oecd",
    "pillar",
    "beps",
    "transfer pricing",
    "withholding",
    "fiscal",
    "steuer",
    "impôt",
    "impot",
    "belasting",
    "imposto",
    "impuesto",
    "tributár",
    "tributar",
    "fisc",
    "budget",
    "deduction",
    "credit",
    "exemption",
    "refund",
    "filing",
    "return",
    "audit",
    "antidumping",
    "anti-dumping",
    "countervailing",
    "section 232",
    "section 301",
    "trade remed",
    "import",
    "export control",
    "dumping",
    "zoll",
    "douane",
    "aduan",
    "nexus",
    "assessment",
    "penalt",
    "compliance",
    "e-invoic",
    "invoice",
    "reporting obligation",
    "dac",
    "crs",
    "fatca",
    "treaty",
    "double taxation",
    "bofip",
    "cdtfa",
    "comptroller",
    "dor ",
    "department of revenue",
    "ruling",
    "rev. proc",
    "rev. rul",
    "notice 20",
    "levies",
    "treaties",
    "tax-free",
    "tax-filing",
    "carbon border",
    "cbam",
    "safeguard",
    "capital gains",
    "tax receipts",
    "receipts",
    "inheritance",
    # de (Steuer compounds are substrings; Abgabe stems)
    "abgabe",
    "finanzamt",
    "umsatzsteuer",
    "elster",
    # fr / be-fr
    "tva",
    "contribuabl",
    "redevance",
    "accis",
    "précompte",
    "precompte",
    "dgfip",
    # it
    "imposta",
    "imposte",
    "fisco",
    "tributi",
    "ires",
    "irap",
    "imu",
    "contribuent",
    "dichiarazion",
    "dogan",
    "interpello",
    "agenzia delle entrate",
    # nl / be-nl
    "btw",
    "accijn",
    "aangifte",
    "heffing",
    "omzetbelasting",
    "belastingdienst",
    # es (extra) / ar-es
    "hacienda",
    "renta",
    "monotributo",
    "ganancias",
    "arancel",
    "aeat",
    # pt (extra)
    "icms",
    "ipi",
    "cofins",
    "irpj",
    "csll",
    "alíquota",
    "aliquota",
    # cs
    "daň",
    "daně",
    "daní",
    "zdaněn",
    "dph",
    "celn",
    "poplatn",
    "spotřební",
    "finanční zpravodaj",
    "finanční správa",
    # pl
    "podatk",
    "podatek",
    "akcyz",
    "cło",
    "skarbow",
    "ksef",
    "jpk",
    # sv / no / da
    "skatt",
    "skat ",
    "skatte",
    "moms",
    "mva",
    "avgift",
    "afgift",
    "tull",
    "tolletaten",
    "toldstyrelsen",
    "skatteverket",
    "skatteetaten",
    "skattestyrelsen",
    # hu
    "adó",
    "áfa",
    "vám",
    "illeték",
    "jövedéki",
    "szja",
    # tr
    "vergi",
    "gümrük",
    "kdv",
    "ötv",
    "damping",
    "mükellef",
    "beyanname",
    "matrah",
    "stopaj",
    "tarife",
    # id / ms
    "pajak",
    "pph",
    "ppn",
    "ppnbm",
    "bea masuk",
    "bea keluar",
    "cukai",
    "kepabeanan",
    "spt",
    "npwp",
    "meterai",
    "coretax",
    "faktur",
    "restitusi",
    "fiskal",
    "djp",
    "duti",
    "kastam",
    "e-invois",
    "lhdn",
    # ko
    "국세",
    "세무",
    "세금",
    "과세",
    "납세",
    "조세",
    "관세",
    "세정",
    "탈세",
    "체납",
    "부가가치세",
    "법인세",
    "소득세",
    "세액",
    # ar
    "ضريب",
    "ضرائب",
    "جمرك",
    "جمارك",
    "القيمة المضافة",
    "زكاة",
    "الزكاة",
    "الفاتورة الإلكترونية",
    "دمغة",
    "رسوم",
    "رسم",
    # en (extra, for SA/SG/HK/KE feeds)
    "zakat",
    "paye",
    "trade agreement",
    "free trade agreement",
    "e-invoicing",
    "stamp duties",
    "rates concession",
    "stamp duty",
    # 2026-08 APAC additions. Non-Latin scripts match as substrings (see _relevance_rx); Latin-script terms
    # below are word-bounded unless listed in _RELEVANT_STEMS / _RELEVANT_SUBSTRINGS.
    # ru / kk / ky / tg / tk / uz (Central Asia; KZ/KG/TJ feeds are Russian-language)
    "налог",
    "ндс",
    "акциз",
    "таможен",
    "пошлин",
    "фискальн",
    "декларац",
    "эсф",
    "салық",
    "кеден",
    "ққс",
    "салык",
    "бажы",
    "андоз",
    "гумрук",
    "salgyt",
    "soliq",
    "bojxona",
    "qqs",
    "aksiz",
    # mn
    "татвар",
    "гааль",
    "нөат",
    # ur / ps / fa / dv
    "ٹیکس",
    "محصول",
    "کسٹم",
    "ڈیوٹی",
    "ایف بی آر",
    "مالیات",
    "ماليات",  # same word with Arabic yeh (U+064A), as mof.gov.af writes it
    "مالیه",
    "ګمرک",
    "گمرک",
    "عواید",
    "عوارض",
    "ޓެކްސް",
    # bn / si / ne / hi / mr / gu / ta / te / kn (India & neighbours; avoid bare कर/কর which also mean "do")
    "রাজস্ব",
    "ভ্যাট",
    "আয়কর",
    "শুল্ক",
    "করদাতা",
    "মূসক",
    "এনবিআর",
    "බදු",
    "රේගු",
    "වැට්",
    "राजस्व",
    "मूल्य अभिवृद्धि कर",
    "आयकर",
    "अन्तःशुल्क",
    "अन्त:शुल्क",
    "करदाता",
    "भन्सार",
    "बीजक",
    "जीएसटी",
    "सीमा शुल्क",
    "टैक्स",
    "वस्तु एवं सेवा कर",
    "प्राप्तिकर",
    "सीमाशुल्क",
    "જીએસટી",
    "આવકવેરો",
    "વેરો",
    "வரி",
    "சுங்க",
    "ஜிஎஸ்டி",
    "పన్ను",
    "జీఎస్టీ",
    "ತೆರಿಗೆ",
    "ಜಿಎಸ್ಟಿ",
    "ಸುಂಕ",
    # my / km / lo / th / vi / tl / tet
    "အခွန်",
    "ခွန်",  # tax morpheme: ဝင်ငွေခွန် (income tax), ကုန်သွယ်လုပ်ငန်းခွန် (commercial tax)
    "ពន្ធ",
    "អាករ",
    "គយ",
    "ອາກອນ",
    "ພາສີ",
    "ภาษี",
    "สรรพากร",
    "ศุลกากร",
    "อากร",
    "สรรพสามิต",
    "thuế",
    "hải quan",
    "phòng vệ thương mại",
    "chống bán phá giá",
    "buwis",
    "adwana",
    "impostu",
    "alfándega",
    # zh-Hant (TW / HK / MO)
    "稅",
    "關稅",
    "稅務",
    "關務",  # customs affairs (關務署)
    "統一發票",  # TW uniform (VAT) invoice
    # ko (trade)
    "덤핑방지관세",
    "반덤핑",
    "상계관세",
    # 2026-08 EMEA additions (see tests/test_sources_emea.py). Non-Latin scripts match as substrings; Latin stems /
    # compounds below are registered in _RELEVANT_STEMS / _RELEVANT_SUBSTRINGS.
    # ca (Catalan; Andorra) — 'impost' stays word-bounded so it never hits 'impostor'
    "impost",
    "impostos",
    "imposició",
    "impositiu",
    "impositius",
    "impositiva",
    "impositives",
    "tributs",
    "tributari",
    "tributària",
    "tributàries",
    "tributació",
    "duana",
    "duanes",
    "duaner",
    "duanera",
    "aranzel",
    "aranzels",
    "contribuents",
    "igi",
    # el (Greek; Cyprus) — non-Latin, so matched as substrings
    "φόρο",
    "φόρων",
    "φορολογ",
    "φπα",
    "τελωνεί",
    "τελωνει",
    "δασμ",
    "εφορί",
    "φοροδιαφυγ",
    "αφορολόγητ",
    # is (Icelandic) — 'skatt' substring already covers skattur/virðisaukaskattur
    "tollur",
    "tollar",
    "tolla",
    "tollstjóri",
    "tollamál",
    "vörugjald",
    "vörugjöld",
    "álagningarskrá",
    "staðgreiðsla",
    "gjaldskyld",
    "skattframtal",
    "tollafgrei",
    "álagning",
    "kílómetragjald",
    "bifreiðagjald",
    "kolefnisgjald",
    # et (Estonian) — bare 'maks' is 'payment', so only tax-specific forms and compounds
    "maksud",
    "maksude",
    "maksu",
    "maksusid",
    "maksumaksja",
    "maksumaksjad",
    "tolli",
    "maksustam",
    "maksukohust",
    "maksuvaba",
    "ümbrikupalg",
    "käibemaks",
    "tulumaks",
    "tollimaks",
    "aktsiis",
    "maksumärk",
    # lv (Latvian) — no bare 'muit' (pt 'muito'); Latvian-extended letters need explicit substrings
    "pvn",
    "nodok",
    "muitnie",
    "antidemping",
    "nodokļ",
    "akcīz",
    "muitas kontrol",
    "muitas deklar",
    "muitas pārvald",
    "muitas maks",
    "muitas proced",
    "muitas iestād",
    "muitas režīm",
    "muitas tarif",
    "muitas vērtīb",
    "muitošan",
    "ienākumu deklar",
    "aizsardzības pasākum",
    "brīvā apgrozībā",
    # lt (Lithuanian)
    "pvm",
    "gpm",
    "mokes",
    "apmokes",
    "akciz",
    "muitin",
    "pajamų deklar",
    "turto deklar",
    "deklaruoti pajam",
    "deklaravo pajam",
    "muitų",
    # sk (Slovak) — 'daň' substring exists; no bare 'dane'/'dani' (English names) or 'clo' (CLO)
    "daňou",
    "colník",
    "colníci",
    "zdaň",
    "coln",
    "odvod",
    # sl (Slovene) — no bare 'carina' (a given name); carinsk/carinik instead
    "davek",
    "ddv",
    "dohodnina",
    "carinik",
    "davk",
    "davčn",
    "dohodnin",
    "dajatv",
    "trošarin",
    "carinsk",
    # hr / bs / sr / me (Latin)
    "porez",
    "poresk",
    "pdv",
    "pdv-a",
    "obveznik",
    "obveznici",
    "ncts",
    # sr (Cyrillic)
    "порез",
    "пореск",
    "пдв",
    "царин",
    "фискал",
    "обвезник",
    # mk (Macedonian)
    "данок",
    "даноч",
    "даноци",
    "ддв",
    "обврзник",
    "е-фактур",
    # sq (Albanian; AL / XK) — 'dogan' stem already covers doganore
    "tvsh",
    "taksa",
    "taksat",
    "taksave",
    "taksë",
    "taksës",
    "tatimpagues",
    "tatim",
    # ro (Romanian; MD / RO) — 'fisc' stem and 'tva' already exist
    "vama",
    "vamă",
    "impozit",
    "contribuabil",
    "acciz",
    "vamal",
    # uk (Ukrainian)
    "податк",
    "митниц",
    "митний",
    "митного",
    "митне",
    "мито ",
    "фіскальн",
    # ru (extra; налог/ндс/акциз/таможен/пошлин exist)
    "ндфл",
    "ндпи",
    "таможн",
    "вычет",
    # be (Belarusian)
    "падатк",
    "мытн",
    "акцыз",
    "пошлін",
    # ka (Georgian)
    "გადასახად",
    "დღგ",
    "საბაჟო",
    "აქციზ",
    "გადამხდელ",
    # hy (Armenian) — bare 'հարկ' avoided (also 'floor', root of 'necessary')
    "հարկայ",
    "հարկեր",
    "հարկատու",
    "հարկման",
    "եկամտային հարկ",
    "շահութահարկ",
    "աահ",
    "մաքսա",
    "ակցիզ",
    # az (Azerbaijani) — 'vergi' shared with Turkish
    "ədv",
    "gömrük",
    "gömrüy",
    "rüsum",
    # fa (extra; مالیات/گمرک exist) — bare مودی/عوارض/تعرفه collide with everyday words
    "ارزش افزوده",
    "مودیان",
    "مؤدیان",
    "اظهارنامه",
    "حقوق ورودی",
    "معافیت مالیاتی",
    # am (Amharic) — bare ግብር also means 'programme' and sits inside ግብርና (agriculture)
    "ታክስ",
    "ጉምሩክ",
    "የገቢ ግብር",
    "ግብር ከፋይ",
    "ግብር ከፋዮች",
    "ተጨማሪ እሴት ታክስ",
    "ኤክሳይዝ",
    "ቀረጥ",
    "ታሪፍ",
    "ገቢዎች ሚኒስቴር",
    "ገቢዎች ባለስልጣን",
    # so (Somali)
    "canshuur",
    "cashuur",
    "tariifo",
    # sw (Swahili; TZ / KE) — bare 'kodi' collides with the name and the media player
    "ushuru",
    "forodha",
    "forodh",
    "mlipakodi",
    "walipakodi",
    "kodi ya",
    "ya kodi",
    "kodi za",
    "kulipa kodi",
    "kodi mpya",
    "kodi ya ongezeko la thamani",
    "kodi ya mapato",
    "ushuru wa forodha",
    "ushuru wa bidhaa",
    "mamlaka ya mapato",
    # rn / rw (Kirundi / Kinyarwanda; BI / RW)
    "ikori",
    "amakori",
    "umusoro",
    "imisoro",
    "gasutamo",
    "umutangakori",
    "abatangakori",
    "umusoreshwa",
    "abasoreshwa",
    "abasora",
    "gusora",
    "tangakori",
    "soreshwa",
)

_NON_TAX_NOISE = (
    "job vacancy",
    "vacancies",
    "recruit",
    "careers",
    "apprenticeship scheme",
    "charity",
    "sport",
    "award ceremony",
    "staff survey",
    "museum",
    "festival",
    "king's birthday",
    "honours list",
    "weather",
    "road closure",
    "workforce management",
    "transparency data",
    "organogram",
    "spending over",
    "gender pay gap",
    "procurement card",
    "counterfeit",
    "seized",
    "seizure",
    "arrest",
    "smuggl",
    "narcotics",
    "cocaine",
    "fentanyl seiz",
    "drug",
    # labour relations / HR (agency press feeds)
    "collective agreement",
    "bargaining",
    "strike vote",
    "on strike",
    "tentative agreement",
    "mediation with",
    "job fair",
    "public service alliance",
    "biographical notes",
    "sign language",
)

# --------------------------------------------------------------------------------------
# Document type / status
# --------------------------------------------------------------------------------------
DOC_TYPE_KEYWORDS: list[tuple[DocType, tuple[str, ...]]] = [
    (
        DocType.CONSULTATION,
        (
            "consultation",
            "public comment",
            "request for comments",
            "call for evidence",
            "comment period",
            "feedback period",
            "consulta pública",
            "konsultation",
            "seeks input",
            "seeking comments",
            "invites comments",
            "stakeholder input",
            "discussion draft",
        ),
    ),
    (
        DocType.TREATY,
        (
            "tax treaty",
            "double taxation agreement",
            "double taxation convention",
            "dta ",
            "tax convention",
            "protocol amending",
            "multilateral instrument",
            "mli",
            "competent authority arrangement",
            "tax information exchange agreement",
            "tiea",
            "free trade agreement",
            "trade agreement",
        ),
    ),
    (DocType.DIRECTIVE, ("directive", "council directive", "richtlinie", "directive (eu)")),
    (
        DocType.RULING,
        (
            "rev. rul",
            "revenue ruling",
            "private letter ruling",
            "plr ",
            "letter ruling",
            "technical advice",
            "tam ",
            "advance ruling",
            "binding ruling",
            "determination letter",
            "court",
            "tribunal",
            "judgment",
            "judgement",
            "opinion",
            "decision",
            "ruling",
            "decided",
            "v.",
            "v",
            "vs",
            "appeal",
            "case c-",
            "grand chamber",
            "advocate general",
            "chief counsel advice",
            "cca ",
            "ccm",
            "tax court",
            "commissioner v",
            "urteil",
            "arrêt",
            "arret",
            "sentencia",
        ),
    ),
    (
        DocType.STATUTE,
        (
            "act ",
            "act of",
            "bill ",
            "h.r.",
            "s. ",
            "public law",
            "pub. l.",
            "statute",
            "finance act",
            "finance bill",
            "budget act",
            "tax cuts",
            "law no",
            "law no.",
            "legislation",
            "enacted",
            "signed into law",
            "senate passes",
            "house passes",
            "gesetz",
            "loi de finances",
            "lei nº",
            "lei n",
            "code section",
            "internal revenue code",
            "royal assent",
            "legislative decree",
            "decreto",
            "ordinance",
            "loi ",
            "wet ",
        ),
    ),
    (
        DocType.REGULATION,
        (
            "regulation",
            "final rule",
            "proposed rule",
            "interim final",
            "treasury decision",
            "t.d.",
            "reg-",
            "notice of proposed rulemaking",
            "nprm",
            "cfr",
            "determination",
            "final results",
            "preliminary results",
            "initiation",
            "scope ruling",
            "administrative review",
            "sunset review",
            "code of federal regulations",
            "federal register",
            "verordnung",
            "décret",
            "decret",
            "règlement",
            "reglement",
            "implementing regulation",
            "delegated regulation",
            "rules",
            "amendment regulations",
            "statutory instrument",
            "order 20",
            "executive order",
            "proclamation",
            "circular",
            "notification no",
            "notification no.",
            "ordinance",
            "besluit",
            "regulations",
        ),
    ),
    (
        DocType.GUIDANCE,
        (
            "notice",
            "rev. proc",
            "revenue procedure",
            "guidance",
            "faq",
            "frequently asked",
            "fact sheet",
            "publication",
            "manual",
            "guide",
            "practice note",
            "brief",
            "ebrief",
            "e-brief",
            "tax tip",
            "instructions",
            "form ",
            "bulletin",
            "circular",
            "clarif",
            "explanatory",
            "interpretation",
            "bmf-schreiben",
            "schreiben",
            "bofip",
            "rescrit",
            "handbook",
            "toolkit",
            "reminder",
            "how to",
            "technical note",
            "policy paper",
            "administrative guidance",
            "commentary",
            "safe harbor",
            "safe harbour",
            "transitional relief",
            "penalty relief",
        ),
    ),
    (
        DocType.NEWS,
        (
            "press release",
            "news release",
            "announces",
            "announced",
            "announcement",  # IRS "Announcement 2026-12" items are routed to guidance via the reference pattern
            "statement",
            "speech",
            "remarks",
            "launch",
            "launches",
            "report",
            "reports",
            "publishes",
            "published",
            "releases",
            "welcomes",
            "milestone",
            "record",
            "update",
            "minister",
            "secretary",
            "commissioner",
            "readout",
            "meeting",
            "visit",
            "signs",
            "agreement",
            "deal",
        ),
    ),
]

STATUS_KEYWORDS: list[tuple[RegulationStatus, tuple[str, ...]]] = [
    (
        RegulationStatus.REPEALED,
        ("repeal", "rescind", "revoked", "withdrawn", "withdraws", "abolish", "terminat", "sunset"),
    ),
    (
        RegulationStatus.CONSULTATION,
        (
            "consultation",
            "request for comments",
            "comment period",
            "call for evidence",
            "public comment",
            "discussion draft",
            "seeks input",
            "seeking comments",
            "feedback period",
        ),
    ),
    (
        RegulationStatus.PROPOSED,
        (
            "proposed",
            "proposes",
            "propose",
            "proposal",
            "draft",
            "bill",
            "nprm",
            "notice of proposed rulemaking",
            "introduces",
            "introduced",
            "announces plan",
            "plans to",
            "would",
            "intends",
        ),
    ),
    (
        RegulationStatus.AMENDED,
        (
            "amend",
            "amendment",
            "amending",
            "modif",
            "revis",
            "updated regulations",
            "correction",
            "correcting amendment",
            "technical correction",
        ),
    ),
    (
        RegulationStatus.EFFECTIVE,
        (
            "takes effect",
            "effective from",
            "in force",
            "comes into force",
            "entered into force",
            "enters into force",
            "now applies",
            "begins",
            "starts",
            "from 1 ",
            "with effect from",
        ),
    ),
    (
        RegulationStatus.ENACTED,
        (
            "final rule",
            "final regulations",
            "treasury decision",
            "enacted",
            "signed into law",
            "royal assent",
            "adopted",
            "approved",
            "passed",
            "published in the official journal",
            "promulgated",
            "issued",
            "issues final",
        ),
    ),
    (
        RegulationStatus.GUIDANCE,
        (
            "notice",
            "rev. proc",
            "revenue procedure",
            "guidance",
            "faq",
            "fact sheet",
            "publication",
            "tax tip",
            "ebrief",
            "bulletin",
            "clarif",
            "reminder",
            "manual",
            "guide",
            "instructions",
        ),
    ),
]

TARIFF_MEASURE_KEYWORDS: list[tuple[TariffMeasure, tuple[str, ...]]] = [
    (
        TariffMeasure.SECTION_232,
        (
            "section 232",
            "sec. 232",
            "232 ",
            "national security tariff",
            "steel and aluminum",
            "steel and aluminium",
            "automobile parts tariff",
            "copper tariff",
            "lumber tariff",
            "semiconductor tariff",
            "pharmaceutical tariff",
        ),
    ),
    (
        TariffMeasure.SECTION_301,
        (
            "section 301",
            "sec. 301",
            "301 ",
            "unfair trade practices",
            "four-year review",
            "exclusion process",
            "exclusions",
            "ship fee",
            "shipbuilding",
        ),
    ),
    (
        TariffMeasure.IEEPA,
        (
            "ieepa",
            "emergency economic powers",
            "reciprocal tariff",
            "fentanyl tariff",
            "national emergency",
            "reciprocal trade",
            "liberation day",
            "baseline tariff",
        ),
    ),
    (
        TariffMeasure.ANTIDUMPING,
        ("antidumping", "anti-dumping", "dumping", "less than fair value", "ltfv", "ad duty", "ad order"),
    ),
    (TariffMeasure.COUNTERVAILING, ("countervailing", "cvd", "subsid")),
    (
        TariffMeasure.SAFEGUARD,
        ("safeguard", "section 201", "import surge", "global safeguard", "tariff-rate quota", "trq"),
    ),
    (TariffMeasure.QUOTA, ("quota", "tariff rate quota", "trq", "quantitative restriction")),
    (TariffMeasure.CBAM, ("cbam", "carbon border", "carbon border adjustment")),
    (
        TariffMeasure.RETALIATORY,
        (
            "retaliat",
            "countermeasure",
            "counter-measure",
            "rebalancing",
            "response to u.s. tariffs",
            "response to us tariffs",
            "counter-tariff",
            "countertariff",
        ),
    ),
    (
        TariffMeasure.EXPORT_CONTROL,
        (
            "export control",
            "entity list",
            "export administration",
            "ear ",
            "dual-use",
            "end-user",
            "license requirement",
            "licence requirement",
            "sanction",
            "denied person",
            "deemed export",
            "chip export",
            "semiconductor export",
        ),
    ),
    (
        TariffMeasure.PREFERENTIAL,
        (
            "preferential",
            "free trade agreement",
            "fta",
            "rules of origin",
            "gsp",
            "generalized system",
            "generalised scheme",
            "agoa",
            "usmca",
            "cusma",
            "t-mec",
            "cptpp",
            "eu-mercosur",
            "trade deal",
            "trade agreement",
            "economic partnership agreement",
            "epa ",
            "zero tariff",
            "duty-free access",
        ),
    ),
    (
        TariffMeasure.MFN,
        (
            "mfn",
            "most favoured nation",
            "most-favored-nation",
            "most favored nation",
            "bound rate",
            "applied rate",
            "general rate of duty",
            "htsus",
            "harmonized tariff schedule",
            "combined nomenclature",
            "common customs tariff",
            "wto tariff",
            "tariff reclassification",
            "classification ruling",
        ),
    ),
]

# --------------------------------------------------------------------------------------
# Reference extraction
# --------------------------------------------------------------------------------------
_REFERENCE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(Notice\s+20\d{2}-\d{1,3})\b", re.I),
    re.compile(r"\b(Rev(?:enue|\.)\s*(?:Proc(?:edure|\.)?|Rul(?:ing|\.)?)\s+20\d{2}-\d{1,3})\b", re.I),
    re.compile(r"\b(Announcement\s+20\d{2}-\d{1,3})\b", re.I),
    re.compile(r"\b(T\.?D\.?\s+\d{4,5})\b"),
    re.compile(r"\b(REG-\d{5,6}-\d{2})\b", re.I),
    re.compile(r"\b(IR-20\d{2}-\d{1,4})\b", re.I),
    re.compile(r"\b(FS-20\d{2}-\d{1,3})\b", re.I),
    re.compile(r"\b(PLR\s*\d{9})\b", re.I),
    re.compile(r"\b(Publication\s+\d{2,4}(?:-[A-Z])?)\b", re.I),
    re.compile(r"\b(Form\s+[0-9]{3,4}(?:-[A-Z]{1,3})?)\b"),
    re.compile(r"\b(\d{1,3}\s+FR\s+\d{3,6})\b"),
    re.compile(r"\b(\d{4}-\d{5})\b(?=.*federal register|$)", re.I),  # FR document number
    re.compile(r"\b([CT]-\d{1,4}/\d{2}(?:\s?P)?)\b"),  # CJEU / General Court
    re.compile(r"(\[20\d{2}\]\s+UKSC\s+\d{1,3})\b"),
    re.compile(
        r"(\[20\d{2}\]\s+(?:EWCA|EWHC|UKUT|UKFTT|UKPC|FCA|FCAFC|HCA|NZSC|SGCA|SGHC)\s+(?:Civ\s+|Crim\s+)?\d{1,4}(?:\s*\([A-Z]{2,4}\))?)\b"
    ),
    re.compile(r"\b(\d{1,3}\s+T\.C\.\s+(?:No\.\s+)?\d{1,3})\b"),
    re.compile(r"\b(T\.C\.\s+(?:Memo|Summ(?:ary)?\.?\s+Op(?:inion)?)\.?\s+20\d{2}-\d{1,3})\b", re.I),
    re.compile(r"\b(No\.\s+\d{2}-\d{3,5})\b"),
    re.compile(r"\b(Docket\s+No\.\s+[\w-]+)\b", re.I),
    re.compile(r"\b(Slip\s+Op\.?\s+\d{2}-\d{1,4})\b", re.I),
    re.compile(r"\b(CSMS\s*#?\s*\d{6,9})\b", re.I),
    re.compile(r"\b((?:Council\s+)?Directive\s+(?:\(EU\)\s+)?\d{4}/\d{1,4}(?:/EC|/EU|/EEC)?)\b", re.I),
    re.compile(r"\b(Regulation\s+\(EU\)\s+(?:No\s+)?20\d{2}/\d{1,4})\b", re.I),
    re.compile(r"\b(Proclamation\s+\d{4,5})\b", re.I),
    re.compile(r"\b(Executive\s+Order\s+\d{5})\b", re.I),
    re.compile(r"\b(eBrief\s+No\.\s*\d{1,4}/\d{2})\b", re.I),
    re.compile(r"\b(Circular\s+No\.?\s*[\w/-]+)\b", re.I),
    re.compile(r"\b(Notification\s+No\.?\s*[\w/-]+)\b", re.I),
    re.compile(r"\b(BOI-[A-Z]{2,4}-[A-Z0-9-]+)\b"),
    re.compile(r"\b(IV\s?[A-D]\s?\d\s?-\s?S\s?\d{3,4}/\d{2}/\d{5}(?:\s?:\d{3})?)\b"),  # German BMF file refs
    re.compile(r"\b([IVX]{1,4}\s[RBES]\s\d{1,4}/\d{2})\b"),  # German BFH Aktenzeichen, e.g. "II R 25/23"
    re.compile(r"\b(DS\d{3})\b"),  # WTO disputes
    re.compile(r"\b(A-\d{3}-\d{3}|C-\d{3}-\d{3})\b"),  # Commerce AD/CVD case numbers
    re.compile(r"\b(HTS(?:US)?\s+\d{4}(?:\.\d{2}){0,3})\b", re.I),
]

_HS_CODE = re.compile(
    r"\b(?:HS|HTS(?:US)?|heading|subheading|CN)\s*(?:code\s*)?(\d{4}(?:\.\d{2}){0,3}|\d{6,10})\b", re.I
)
_RATE_PCT = re.compile(r"(\d{1,3}(?:\.\d+)?)\s?(?:%|percent|per cent)", re.I)
_IRS_ANNOUNCEMENT_RX = re.compile(r"^announcement\s+20\d{2}-\d", re.I)


@dataclass(slots=True)
class Classification:
    tax_type: str = TaxType.OTHER
    tax_types: list[str] = field(default_factory=list)
    doc_type: str = DocType.OTHER
    status: str = RegulationStatus.UNKNOWN
    significance: str = Significance.ROUTINE
    measure_type: str = TariffMeasure.OTHER
    reference: str | None = None
    hs_code: str | None = None
    rate: float | None = None
    tags: list[str] = field(default_factory=list)
    tax_relevant: bool = True


def _norm(text: str) -> str:
    return " " + " ".join(text.lower().replace("’", "'").split()) + " "


_KEYWORD_RX_CACHE: dict[str, re.Pattern[str]] = {}


def _keyword_rx(kw: str) -> re.Pattern[str]:
    """Word-bounded keyword regex. Keywords ending in a space ("act ", "bill ", "form ") are exact tokens:
    they must not pick up inflections, otherwise "acts to protect" reads as a statute and "forms" as guidance.
    Other keywords tolerate simple English inflections (tariff/tariffs, order/orders, impose/imposed)."""
    rx = _KEYWORD_RX_CACHE.get(kw)
    if rx is None:
        exact = kw.endswith(" ")
        k = kw.lower().strip()
        suffix = "" if exact else r"(?:s|es|ed|ing)?"
        rx = re.compile(r"(?<![a-z0-9])" + re.escape(k) + suffix + r"(?![a-z0-9])")
        _KEYWORD_RX_CACHE[kw] = rx
    return rx


def _score(text: str, keywords: tuple[str, ...]) -> int:
    score = 0
    for kw in keywords:
        if _keyword_rx(kw).search(text) is not None:
            score += 2 if len(kw.strip()) > 6 else 1
    return score


_AUTHORITY_NOISE = re.compile(
    r"hm revenue (?:&|and) customs|revenue and customs|revenue & customs|hmrc|customs and border protection|"
    r"taxation and customs union|department of revenue|internal revenue service|revenue commissioners|receita federal|"
    r"canada revenue agency|agence du revenu du canada|minister of (?:finance and )?national revenue|"
    r"union of taxation employees|federal tax authority|state taxation administration|national tax agency|"
    r"inland revenue authority of singapore|australian taxation office|hm treasury|"
    r"skatteverket|skatteetaten|skattestyrelsen|belastingdienst|agenzia delle entrate|finanční správa|"
    r"ministerstwo finansów|krajowa administracja skarbowa|nemzeti adó- és vámhivatal|direktorat jenderal pajak|"
    r"lembaga hasil dalam negeri|zakat, tax and customs authority|kenya revenue authority|south african revenue service|"
    r"national tax service|inland revenue department|"
    r"(?:u\.s\. |us )?(?:department of the )?treasury department|department of the treasury|"
    r"secretary of the treasury|treasury secretary",
    re.I,
)


def classify_tax_types(text: str, default: list[str] | None = None) -> list[str]:
    """Return tax types ordered by keyword score (best first). Falls back to `default` or ['other']."""
    t = _norm(_AUTHORITY_NOISE.sub(" ", text))
    scored = [(ttype, _score(t, kws)) for ttype, kws in TAX_TYPE_KEYWORDS]
    hits = [str(tt) for tt, s in sorted(scored, key=lambda p: -p[1]) if s > 0]
    if hits:
        return hits[:3]
    return [str(x) for x in (default or [])] or [str(TaxType.OTHER)]


def classify_doc_type(text: str, default: str = DocType.OTHER) -> str:
    t = _norm(text)
    for dt, kws in DOC_TYPE_KEYWORDS:
        if _score(t, kws) > 0:
            return str(dt)
    return str(default)


def classify_status(text: str, doc_type: str | None = None) -> str:
    t = _norm(text)
    for st, kws in STATUS_KEYWORDS:
        if _score(t, kws) > 0:
            return str(st)
    if doc_type in (DocType.GUIDANCE, DocType.RULING):
        return str(RegulationStatus.GUIDANCE)
    if doc_type == DocType.CONSULTATION:
        return str(RegulationStatus.CONSULTATION)
    if doc_type in (DocType.REGULATION, DocType.STATUTE, DocType.DIRECTIVE):
        return str(RegulationStatus.ENACTED)
    return str(RegulationStatus.UNKNOWN)


_APEX_COURT_TERMS = (
    "supreme court",
    "uksc",
    "scotus",
    "high court of australia",
    "grand chamber",
    "bundesfinanzhof",
    "bfh",
    "supreme court of canada",
    "scc",
    "cour de cassation",
    "conseil d'état",
    "conseil d'etat",
    "hoge raad",
    "bundesverfassungsgericht",
    "constitutional court",
    "court of justice of the european union",
    "cjeu",
    "tribunal supremo",
    "supremo tribunal",
    "federal court of australia",
    "full court",
)


def classify_significance(text: str, court: str | None = None) -> str:
    """Crawled decisions are never 'landmark' (that label is curated via the seed only).

    Apex courts -> significant; everything else -> routine.
    """
    t = _norm(f"{text} {court or ''}")
    if any(k in t for k in _APEX_COURT_TERMS):
        return str(Significance.SIGNIFICANT)
    return str(Significance.ROUTINE)


def classify_measure_type(text: str, default: str = TariffMeasure.OTHER) -> str:
    t = _norm(text)
    best, best_score = None, 0
    for mt, kws in TARIFF_MEASURE_KEYWORDS:
        s = _score(t, kws)
        if s > best_score:
            best, best_score = mt, s
    return str(best) if best else str(default)


def extract_reference(text: str) -> str | None:
    for rx in _REFERENCE_PATTERNS:
        m = rx.search(text)
        if m:
            return " ".join(m.group(1).split())[:200]
    return None


def extract_hs_code(text: str) -> str | None:
    m = _HS_CODE.search(text)
    return m.group(1) if m else None


def extract_rate(text: str) -> float | None:
    m = _RATE_PCT.search(text)
    if not m:
        return None
    try:
        val = float(m.group(1))
    except ValueError:
        return None
    return val if 0 <= val <= 1000 else None


# Terms matched as word *prefixes* (stems: "penalt" -> penalty/penalties, "tributa" -> tributação, "notice 20" -> Notice 2026-12).
_RELEVANT_STEMS = frozenset(
    {
        "penalt",
        "tributa",
        "tributar",
        "tributár",
        "fiscaliza",
        "fiscalização",
        "e-invoic",
        "trade remed",
        "notice 20",
        "aduan",
        "zoll",
        "fisc",
        "dac",
        "impôt",
        "impot",
        # 2026-08 additions (de/fr/it/nl/es/cs/pl/da/hu/tr/id)
        "abgabe",
        "contribuabl",
        "redevance",
        "accis",
        "précompte",
        "precompte",
        "contribuent",
        "dichiarazion",
        "dogan",
        "accijn",
        "arancel",
        "celn",
        "poplatn",
        "akcyz",
        "skarbow",
        "zdaněn",
        "skatte",
        "tull",
        "adó",
        "tax",  # tax, taxes, taxable, taxation, taxpayer, tax-filing
        # 2026-08 EMEA additions (ca/is/et/lv/lt/sk/sl/hr/sq/ro/az/so/sw/rn)
        "tollafgrei",
        "álagning",
        "kílómetragjald",
        "bifreiðagjald",
        "antidemping",
        "tolli",
        "maksustam",
        "maksukohust",
        "maksuvaba",
        "ümbrikupalg",
        "nodok",
        "muitnie",
        "mokes",
        "apmokes",
        "akciz",
        "muitin",
        "zdaň",
        "coln",
        "odvod",
        "davk",
        "davčn",
        "dohodnin",
        "dajatv",
        "trošarin",
        "carinsk",
        "porez",
        "poresk",
        "obveznik",
        "fiskal",
        "tatim",
        "impozit",
        "contribuabil",
        "acciz",
        "vamal",
        "gömrük",
        "gömrüy",
        "aksiz",
        "rüsum",
        "canshuur",
        "cashuur",
        "kastam",
        "tariifo",
        "forodh",
    }
)
# Terms matched anywhere in the text (German/Dutch compounds put the tax word at the *end*: Umsatzsteuer, omzetbelasting).
_RELEVANT_SUBSTRINGS = frozenset(
    {
        "steuer",
        "belasting",
        "vat refund",
        "heffing",  # voorheffing, bedrijfsvoorheffing
        "daň",  # daně, daňový, zdanění is a different stem but "daň" also sits inside "nadaňový"
        "podatk",  # podatku, opodatkowanie
        "skatt",  # kvarskatt, slutskattebesked, Skatteverket, inkomstskatt
        "avgift",  # merverdiavgift, særavgift
        "afgift",  # afgifter, punktafgift
        "moms",  # momsbedrägerier, momsregistrering
        "vergi",  # vergisi, vergilendirme, gelir vergisi
        "gümrük",  # gümrükleme
        "pajak",  # perpajakan
        "cukai",  # percukaian
        # 2026-08 EMEA additions (ca/is/et/lv/lt/sk/sl/hr/sq/ro/az/so/sw/rn)
        "käibemaks",
        "tulumaks",
        "tollimaks",
        "aktsiis",
        "maksumärk",
        "kolefnisgjald",
        "nodokļ",
        "akcīz",
        "muitas kontrol",
        "muitas deklar",
        "muitas pārvald",
        "muitas maks",
        "muitas proced",
        "muitas iestād",
        "muitas režīm",
        "muitas tarif",
        "muitas vērtīb",
        "muitošan",
        "ienākumu deklar",
        "aizsardzības pasākum",
        "brīvā apgrozībā",
        "pajamų deklar",
        "turto deklar",
        "deklaruoti pajam",
        "deklaravo pajam",
        "muitų",
        "tangakori",
        "soreshwa",
        "mlipakodi",
        "walipakodi",
    }
)
# Agency names alone are not evidence that an item is about tax: "HMRC recruits apprentices", "Treasury International
# Capital data". They count only in loose mode (strict=False).
_AUTHORITY_ONLY_TERMS = frozenset(
    {
        "hmrc",
        "irs",
        "internal revenue",
        "treasury",
        "oecd",
        "cdtfa",
        "comptroller",
        "department of revenue",
        "dgfip",
        "agenzia delle entrate",
        "belastingdienst",
        "aeat",
        "finanční správa",
        "skatteverket",
        "skatteetaten",
        "skattestyrelsen",
        "djp",
        "lhdn",
        "bofip",
    }
)
# First code point beyond Latin/IPA: Greek, Cyrillic, Arabic, Indic, Thai, Khmer, CJK, Hangul ... Terms written in
# these scripts have no [a-z0-9] word boundaries and are matched as plain substrings (налог -> налогоплательщик).
_NON_LATIN = 0x0370
_RELEVANCE_RX_CACHE: dict[str, re.Pattern[str]] = {}


def _relevance_rx(term: str) -> re.Pattern[str]:
    """Relevance-term matcher. Word-bounded with inflections by default, so 'irs' does not match 'First',
    'import' does not match 'important', 'vat' does not match 'innovation' and 'iva' does not match 'Invest'."""
    rx = _RELEVANCE_RX_CACHE.get(term)
    if rx is None:
        if term in _RELEVANT_SUBSTRINGS or any(ord(ch) >= _NON_LATIN for ch in term):  # no word boundaries
            rx = re.compile(re.escape(term))
        elif term in _RELEVANT_STEMS:
            rx = re.compile(r"(?<![a-z0-9])" + re.escape(term))
        else:
            rx = _keyword_rx(term)
        _RELEVANCE_RX_CACHE[term] = rx
    return rx


def is_tax_relevant(text: str, strict: bool = False) -> bool:
    """Cheap relevance gate for generic government feeds.

    strict=False: anything mentioning a tax/customs/trade term (or a tax authority) passes.
    strict=True : authority names are stripped first (a CRA press release about a union vote is not tax news),
                  authority-only terms do not count, and obvious HR/ceremonial/labour-relations noise is rejected.
    """
    t = _norm(_AUTHORITY_NOISE.sub(" ", text) if strict else text)
    if strict and any(n in t for n in _NON_TAX_NOISE):
        return False
    for term in _TAX_RELEVANT_TERMS:
        if strict and term in _AUTHORITY_ONLY_TERMS:
            continue
        if _relevance_rx(term).search(t) is not None:
            return True
    return False


def classify(
    title: str,
    summary: str | None = None,
    *,
    default_tax_types: list[str] | None = None,
    category: str = "regulation",
    court: str | None = None,
) -> Classification:
    text = f"{title}. {summary or ''}"
    c = Classification()
    title_only = title or ""
    c.tax_types = classify_tax_types(text, default_tax_types)
    c.tax_type = c.tax_types[0]
    c.reference = extract_reference(text)
    if category == "court" or (c.reference and re.match(r"^[CT]-\d{1,4}/\d{2}", c.reference)):
        c.doc_type = str(DocType.RULING)
    else:
        c.doc_type = classify_doc_type(title_only, default="")
        if not c.doc_type:
            c.doc_type = classify_doc_type(text, default=DocType.NEWS if category == "news" else DocType.OTHER)
    if c.reference and _IRS_ANNOUNCEMENT_RX.match(c.reference) and c.doc_type in (DocType.NEWS, DocType.OTHER):
        c.doc_type = str(DocType.GUIDANCE)
    c.status = classify_status(title_only, None)
    if c.status == RegulationStatus.UNKNOWN:
        c.status = classify_status(text, c.doc_type)
    c.significance = classify_significance(text, court)
    c.measure_type = classify_measure_type(text)
    c.hs_code = extract_hs_code(text)
    c.rate = extract_rate(text) if category == "tariff" else None
    c.tax_relevant = is_tax_relevant(text)
    tags = set(c.tax_types[1:])
    if c.measure_type != TariffMeasure.OTHER and category == "tariff":
        tags.add(c.measure_type)
    c.tags = sorted(tags)
    if category == "tariff" and c.tax_type == TaxType.OTHER:
        c.tax_type = str(TaxType.CUSTOMS_TARIFF)
        c.tax_types = [c.tax_type]
    return c


__all__ = [
    "Classification",
    "classify",
    "classify_doc_type",
    "classify_measure_type",
    "classify_significance",
    "classify_status",
    "classify_tax_types",
    "extract_hs_code",
    "extract_rate",
    "extract_reference",
    "is_tax_relevant",
]


# --------------------------------------------------------------------------------------
# Court decisions: strict tax-relevance gate
# --------------------------------------------------------------------------------------
_COURT_TAX_TERMS = (
    # English
    "tax",
    "taxes",
    "taxation",
    "taxpayer",
    "taxpayers",
    "internal revenue",
    "irs",
    "commissioner of internal revenue",
    "treasury regulation",
    "excise",
    "tariff",
    "tariffs",
    "customs",
    "hmrc",
    "revenue and customs",
    "revenue commissioners",
    "vat",
    "gst",
    "withholding",
    "income tax",
    "estate tax",
    "gift tax",
    "deduction",
    "customs duty",
    "customs duties",
    "import duty",
    "import duties",
    "antidumping duty",
    "antidumping duties",
    "countervailing duty",
    "excise duty",
    "excise duties",
    "stamp duty",
    "duty-free",
    "duty rate",
    "duties on imports",
    "tax court",
    "tax tribunal",
    "tax chamber",
    "antidumping",
    "countervailing",
    "transfer pricing",
    "levy",
    "assessment of tax",
    "tax assessment",
    "inland revenue",
    "department of revenue",
    "comptroller",
    "franchise tax board",
    "board of equalization",
    "tax commission",
    "tax appeal",
    "tax appeals",
    "section 7",
    # German (substrings: Steuer compounds)
    "steuer",
    "finanzamt",
    "finanzhof",
    "finanzgericht",
    "abgaben",
    "zoll",
    # French / Dutch / Spanish / Portuguese / Italian
    "impôt",
    "impot",
    "impôts",
    "fiscal",
    "fiscale",
    "fiscaux",
    "douane",
    "douanes",
    "belasting",
    "impuesto",
    "impuestos",
    "tributario",
    "tributaria",
    "tributário",
    "tributária",
    "imposto",
    "impostos",
    "hacienda",
    "imposta",
    "imposte",
    "agenzia delle entrate",
    "sat",
    "receita federal",
    "afip",
    # 2026-08 additions: ZA / SG / NL / FR / NO / BR
    "south african revenue service",
    "sars",
    "csars",
    "comptroller of income tax",
    "comptroller of goods and services tax",
    "income tax act",
    "gst act",
    "tva",
    "contribuable",
    "taxe",
    "taxes",
    "icms",
    "cofins",
    "merverdiavgift",
    "skatteklagenemnda",
    "dian",
    # 2026-08 EMEA: Baltic / Slavic / Caucasus / African tax vocabulary for court dockets
    "maksud",
    "dane",  # sk: daň genitive (court dockets only; too name-like for the news gate)
    "maksude",
    "maksu",
    "maksuotsus",
    "nodokļi",
    "nodokļu",
    "mokesčių",
    "mokestis",
    "skattur",
    "skatts",
    "tributs",
    "daní",
    "dph",
    "daňový",
    "daňové",
    "daňovej",
    "daňového",
    "daňovým",
    "daňovom",
    "daňová",
    "colný",
    "colného",
    "colnej",
    "colné",
    "colnému",
    "podatek",
    "podatku",
    "podatkowa",
    "podatkowe",
    "podatkowej",
    "podatkowego",
    "podatkowy",
    "podatnik",
    "podatnika",
    "akcyza",
    "akcyzy",
    "akcyzowy",
    "celny",
    "celna",
    "celne",
    "celnej",
    "cło",
    "impozit",
    "vamal",
    "accize",
    "canshuur",
    "kastam",
    "ushuru",
    "forodha",
    "kodi ya",
    "ya kodi",
    "rufaa za kodi",
    "vergi",
    "gömrük",
    "ədv",
    "porez",
    "pdv",
    "davek",
    "ddv",
    "tvsh",
)
_COURT_SUBSTRING_TERMS = (
    "steuer",
    "finanzhof",
    "finanzgericht",
    "finanzamt",
    "belasting",
    "impôt",
    "impot",
    "fiscal",
    "tributa",
    "impost",
    "douane",
    "zoll",
    "tax court",
    "tax tribunal",
    "tax chamber",
    # specialist courts whose whole docket is tax/customs — the court name alone qualifies
    "court of international trade",
    "tax and chancery",
    "first-tier tribunal (tax)",
    "fiscal court",
    "skatteklagenemnda",
    "skatt",
    "belastingkamer",
    "belastingrecht",
    "tax and chancery",
    "tax chamber",
    "cour des comptes",
    # 2026-08 APAC: specialist tax tribunals whose whole docket is tax — the name alone qualifies
    "国税不服審判所",
    "裁決事例",
    "조세심판원",
    "pengadilan pajak",
    "court of tax appeals",
    "income tax appellate",
    "taxation review authority",
    "board of review (inland revenue",
    # 2026-08 EMEA: Baltic / Slavic / Caucasus / African tax vocabulary for court dockets
    "käibemaks",
    "tulumaks",
    "tollimaks",
    "aktsiis",
    "maksukorraldus",
    "daň",
    "podatk",
    "podatn",
    "akcyz",
    "φορολογ",
    "φπα",
    "τελωνει",
    "δασμ",
    "податк",
    "пдв",
    "митниц",
    "митний",
    "митного",
    "мито ",
    "акциз",
    "налог",
    "ндфл",
    "таможн",
    "таможен",
    "пошлин",
    "падатк",
    "мытн",
    "акцыз",
    "გადასახად",
    "დღგ",
    "საბაჟო",
    "հարկայ",
    "հարկեր",
    "հարկատու",
    "աահ",
    "մաքսա",
    "مالیات",
    "گمرک",
    "ታክስ",
    "ጉምሩክ",
    "የገቢ ግብር",
    "порез",
    "пореск",
    "царин",
    "данок",
    "даноч",
)


def is_court_tax_relevant(text: str) -> bool:
    """Strict gate for category=court: require a strong tax/customs term (plain 'Commissioner' is not enough)."""
    t = _norm(text)
    if any(k in t for k in _COURT_SUBSTRING_TERMS):
        return True
    return _score(t, _COURT_TAX_TERMS) > 0


# --------------------------------------------------------------------------------------
# Tariff / trade-measure specifics
# --------------------------------------------------------------------------------------
_TRADE_STRONG = (
    "antidumping",
    "anti-dumping",
    "countervailing",
    "tariff",
    "tariffs",
    "section 232",
    "section 301",
    "section 201",
    "ieepa",
    "emergency economic powers",
    "safeguard",
    "duty",
    "duties",
    "dumping",
    "less than fair value",
    # es / pt trade-remedy and tariff vocabulary (2026-08 Americas additions)
    "tarifa",
    "tarifas",
    "tarifaço",
    "seção 301",
    "seção 232",
    "sección 301",
    "sección 232",
    "cuota compensatoria",
    "cuotas compensatorias",
    "derecho antidumping",
    "derechos antidumping",
    "direito antidumping",
    "direitos antidumping",
    "apertura de examen",
    "examen por expiración",
    "apertura de investigación",
    "salvaguardia",
    "salvaguardias",
    "salvaguarda",
    "medida compensatoria",
    "medidas compensatorias",
    "medidas compensatórias",
    "ex-tarifário",
    "imposto de importação",
    "alíquota de importação",
    "licença de importação",
    "arancelario",
    "arancelaria",
    "aranceles",
    "quota",
    "tariff-rate",
    "htsus",
    "harmonized tariff",
    "cbam",
    "carbon border",
    "retaliat",
    "countermeasure",
    "de minimis",
    "rules of origin",
    "country of origin",
    "customs value",
    "customs valuation",
    "entity list",
    "export control",
    "export administration regulations",
    "trade remed",
    "import relief",
    "reciprocal trade",
    "reciprocal tariff",
    "circumvention",
    "scope ruling",
    "scope inquiry",
    "drawback",
    "adjusting imports",
    "trade agreement",
    "free trade agreement",
    "usmca",
    "generalized system of preferences",
    "preferential",
    "bonded",
    "foreign-trade zone",
    "foreign trade zone",
    "entry summary",
    "customs broker",
    "classification ruling",
    "ad/cvd",
    "cvd",
    "trade enforcement",
    "subsidy rate",
    "dumping margin",
    "section 122",
    "section 338",
    "export licen",
    "license requirement",
    "suspension agreement",
    "normal value",
    "injury determination",
    "trade act",
    # 2026-08 additions: EU/CA/JP/BR/MX/TR feeds
    "dumped",
    "subsidized",
    "subsidised",
    "subsidizing",
    "injury inquiry",
    "expiry review",
    "indication of injury",
    "trade defence",
    "trade defense",
    "rebalancing measures",
    "steel regulation",
    "customs tariff",
    "tariff schedule",
    # es
    "arancel",
    "aranceles",
    "arancelaria",
    "arancelario",
    "cuota compensatoria",
    "cuotas compensatorias",
    "salvaguardia",
    "fracción arancelaria",
    # pt
    "imposto de importação",
    "alíquota",
    "gecex",
    "camex",
    "letec",
    "ex-tarifário",
    "tarifa externa comum",
    "direito antidumping",
    # tr
    "gümrük",
    "damping",
    "korunma önlemi",
    # ja
    "関税",
    "不当廉売",
    "相殺関税",
    "緊急関税",
    "原産地",
    "輸入割当",
    "特恵",
    "税率",
    "品目表",  # tariff / statistical schedule of items
    "税関手続",  # customs procedures
    "外国為替相場",  # customs valuation exchange rates
    "関税率",
    "輸入制限",
    "trade expansion act",
    # 2026-08 APAC additions: id / zh-Hant / th / vi / ko / ru feeds
    "bea masuk",
    "anti dumping",
    "tindakan pengamanan",
    "sunset review",
    "interim review",
    "bmad",
    "bmtp",
    "關稅",
    "关税",
    "反傾銷",
    "反倾销",
    "平衡稅",
    "稅則",
    "原產地",
    "進口稅",
    "ตอบโต้การทุ่มตลาด",
    "ทุ่มตลาด",
    "มาตรการปกป้อง",
    "อากรขาเข้า",
    "พิกัดศุลกากร",
    "chống bán phá giá",
    "phòng vệ thương mại",
    "chống trợ cấp",
    "biện pháp tự vệ",
    "thuế nhập khẩu",
    "chống lẩn tránh",
    "덤핑방지관세",
    "반덤핑",
    "상계관세",
    "세이프가드",
    "антидемпинг",
    "компенсационн",
    "таможенн",
    "пошлин",
)
_TRADE_NOISE = (
    "information collection",
    "paperwork reduction",
    "agency information collection",
    "privacy act",
    "sunshine act",
    "advisory committee",
    "committee meeting",
    "open meeting",
    "notice of meeting",
    "airport",
    "seaplane",
    "port of entry designation",
    "designation of",
    "senior executive service",
    "performance review board",
    "delegation of authority",
    "system of records",
    "request for nominations",
    "membership",
    "fee schedule for passenger",
    "user fee",
    "trusted traveler",
    "global entry",
    "esta",
    "visa",
    "immigration",
    "border patrol",
    "narcotics",
    "counterfeit",
    "seizure",
    "seized",
    "arrest",
    "rescue",
    "world cup",
    "k-9",
    "canine",
    "wildlife",
    "agricultural pest",
    "boat",
    "vessel documentation",
    "recruit",
    "career",
    "memorial",
    "named director",
    "appointed",
    "ceremony",
)


def is_trade_measure_relevant(text: str) -> bool:
    """Relevance gate for category=tariff items: keep customs/trade-measure content, drop agency housekeeping.

    Strong trade-measure terms win over noise terms (e.g. an AD/CVD notice that mentions a meeting).
    """
    t = _norm(text)
    # Housekeeping notices are vetoed outright when the phrase leads the text (i.e. sits in the title), no matter how
    # many trade terms the abstract mentions — "Agency Information Collection Activities; … Entry Summary" is paperwork.
    head = t[:160]
    if any(v in head for v in _TRADE_TITLE_VETO):
        return False
    strong = _score(t, _TRADE_STRONG)
    noise = _score(t, _TRADE_NOISE)
    if strong >= 2:
        return True
    if noise:
        return False
    return strong > 0


_TRADE_TITLE_VETO = (
    "agency information collection",
    "information collection activities",
    "paperwork reduction act",
    "submission to the office of management and budget",
    "notice of open meeting",
    "senior executive service",
    "performance review board",
    "privacy act of 1974",
    "system of records notice",
)


_TARIFF_STATUS_RULES: list[tuple[MeasureStatus, tuple[str, ...]]] = [
    (
        MeasureStatus.REVOKED,
        (
            "revocation",
            "revoke",
            "revoked",
            "rescind",
            "rescission",
            "termination",
            "terminate",
            "terminated",
            "removal from the entity list",
            "removal of entities",
            "exclusion granted",
            "repeal",
        ),
    ),
    (MeasureStatus.SUSPENDED, ("suspension", "suspend", "suspended", "pause", "paused", "moratorium")),
    (
        MeasureStatus.PROPOSED,
        (
            "initiation",
            "initiate",
            "preliminary",
            "proposed",
            "proposal",
            "request for comments",
            "request for public comments",
            "investigation",
            "inquiry",
            "notice of proposed rulemaking",
            "nprm",
            "seeks comment",
            "opportunity to request",
            "intent to",
        ),
    ),
    (
        MeasureStatus.UNDER_REVIEW,
        (
            "continuation",
            "administrative review",
            "sunset review",
            "five-year review",
            "changed circumstances",
            "expedited review",
            "new shipper review",
            "circumvention inquiry",
            "scope inquiry",
            "remand",
            "review of",
        ),
    ),
    (
        MeasureStatus.IN_FORCE,
        (
            "final determination",
            "final results",
            "final rule",
            "interim final",
            "amended final",
            "antidumping duty order",
            "countervailing duty order",
            "duty order",
            "amended order",
            "imposition",
            "imposing",
            "impose",
            "adjusting imports",
            "proclamation",
            "implementation",
            "implementing",
            "effective",
            "takes effect",
            "in effect",
            "entry into force",
            "enters into force",
            "addition of entities",
            "additions to the entity list",
            "modification of",
            "extension of",
            "increase",
            "increasing",
            "raises",
            "entity list",
        ),
    ),
]


def classify_tariff_status(text: str, default: str = MeasureStatus.UNDER_REVIEW, doc_kind: str | None = None) -> str:
    """Derive MeasureStatus for a tariff/trade item from its wording (title-weighted; see _TARIFF_STATUS_RULES order)."""
    t = _norm(text)
    for status, kws in _TARIFF_STATUS_RULES:
        if _score(t, kws) > 0:  # word-bounded with inflections ("duty orders", "imposed"); avoids de-TERMINATION
            return str(status)
    kind = (doc_kind or "").lower()
    if kind in ("rule", "presidential document"):
        return str(MeasureStatus.IN_FORCE)
    if kind == "proposed rule":
        return str(MeasureStatus.PROPOSED)
    return str(default)


_AD_VALOREM = re.compile(r"(?<![\d.])(\d{1,3}(?:\.\d+)?)\s?(?:%|percent|per cent|per centum|-percent|ad valorem)", re.I)
_SPECIFIC_DUTY = re.compile(
    r"((?:US\$|\$|€|£|¥)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:per|/)\s?(?:kg|kilogram|kilograms|ton|tonne|tons|tonnes|metric ton|mt|lb|pound|pounds|liter|litre|liters|litres|unit|units|piece|pieces|item|items|each|barrel|gallon|dozen|square meter|m2|m3|cubic meter|head|kilowatt|kw|number|net ton)\b|\s?(?:per|/)\s?\w+)"
    r"|\d+(?:\.\d+)?\s?cents?\s?(?:per|/)\s?\w+)",
    re.I,
)
_HS_DOTTED = re.compile(r"\b(\d{4}\.\d{2}(?:\.\d{2}(?:\.?\d{2})?)?)\b")
_HS_KEYWORD = re.compile(
    r"\b(?:HTSUS|HTS|heading|subheading|tariff item|CN code)\s*(?:number|no\.?|code)?\s*(\d{4}(?:\.\d{2}){0,3}|\d{6,10})\b",
    re.I,
)
_HS_CHAPTER = re.compile(r"\bchapter\s+(\d{1,2})\b", re.I)


_PCT_NUM = r"\d{1,3}(?:,\d{3})*(?:\.\d+)?"
_RATE_RANGE = re.compile(
    rf"(?<![\d.])({_PCT_NUM})\s?(?:%|percent|per cent)?\s*(?:to|through|and|-|–|—)\s*({_PCT_NUM})\s?(?:%|percent|per cent|ad valorem)",
    re.I,
)


def _range_spans(text: str) -> list[tuple[int, int]]:
    return [m.span() for m in _RATE_RANGE.finditer(text)]


def extract_ad_valorem_rate(text: str) -> float | None:
    """First *single* ad valorem percentage (e.g. '25 percent', '50%', '7.5 per cent') in the text.

    Ranges such as AD/CVD margin spreads ('3.12 to 7.45 percent', '14.64 percent to 3,403.96 percent') are not a
    duty rate for the product as a whole — each exporter has its own cash-deposit rate — so they are deliberately
    *not* collapsed into `rate`; they surface in `rate_text` instead (see extract_rate_text).
    """
    ranges = _range_spans(text)
    for m in _AD_VALOREM.finditer(text):
        if any(a <= m.start() < b for a, b in ranges):
            continue
        try:
            val = float(m.group(1))
        except ValueError:
            continue
        if 0 <= val <= 1000:
            return val
    return None


def extract_rate_text(text: str) -> str | None:
    """Specific/compound duty expression ('$0.45 per kg', '12 cents per pound') or, failing that, a percentage
    range ('3.12 to 7.45 percent') that extract_ad_valorem_rate refuses to reduce to one number."""
    m = _SPECIFIC_DUTY.search(text)
    if m:
        return " ".join(m.group(1).split())[:200]
    m = _RATE_RANGE.search(text)
    return " ".join(m.group(0).split())[:200] if m else None


def extract_hts_code(text: str) -> str | None:
    """HTSUS / HS code: keyword-prefixed or dotted (7208.10.15); falls back to 'chapter NN' -> 'NN'."""
    m = _HS_KEYWORD.search(text)
    if m:
        return m.group(1)
    m = _HS_DOTTED.search(text)
    if m:
        return m.group(1)
    m = _HS_CHAPTER.search(text)
    if m:
        return m.group(1).zfill(2)
    return None


_FROM_RX = re.compile(
    r"\b[Ff]rom\s+(?:the\s+)?([A-Z][^:;()\[\]]*?)(?=\s*[:;(]|\s*[-–—]\s|\s+(?:Final|Preliminary|Initiation|Notice|Amended|Continuation|Rescission|Antidumping|Countervailing|Determination|Results|Postponement|Correction|Partial|Revocation|Affirmative|Negative|Termination|Institution|Scheduling|Commission)\b|\s*$)"
)
_PARTNER_NORMALIZE: dict[str, str] = {
    "usa": "United States",
    "u.s.a.": "United States",
    "u.s.": "United States",
    "united states": "United States",
    "united states of america": "United States",
    "america": "United States",
    "people's republic of china": "China",
    "prc": "China",
    "republic of korea": "South Korea",
    "korea": "South Korea",
    "socialist republic of vietnam": "Vietnam",
    "viet nam": "Vietnam",
    "republic of turkey": "Türkiye",
    "turkey": "Türkiye",
    "turkiye": "Türkiye",
    "russian federation": "Russia",
    "czech republic": "Czechia",
    "united kingdom of great britain and northern ireland": "United Kingdom",
    "kingdom of saudi arabia": "Saudi Arabia",
    "republic of india": "India",
    "federative republic of brazil": "Brazil",
    "united mexican states": "Mexico",
    "republic of south africa": "South Africa",
    "sultanate of oman": "Oman",
    "kingdom of thailand": "Thailand",
    "republic of indonesia": "Indonesia",
    "republic of the philippines": "Philippines",
    "the philippines": "Philippines",
    "republic of argentina": "Argentina",
    "argentine republic": "Argentina",
    "hellenic republic": "Greece",
    "federal republic of germany": "Germany",
    "italian republic": "Italy",
    "kingdom of spain": "Spain",
    "french republic": "France",
    "kingdom of the netherlands": "Netherlands",
    "the netherlands": "Netherlands",
    "kingdom of belgium": "Belgium",
    "republic of austria": "Austria",
    "portuguese republic": "Portugal",
    "slovak republic": "Slovakia",
    "republic of poland": "Poland",
    "romania": "Romania",
    "ukraine": "Ukraine",
    "taiwan": "Taiwan",
    "republic of china": "Taiwan",
    "hong kong": "Hong Kong",
    "european union": "European Union",
    "eu": "European Union",
    "republic of kazakhstan": "Kazakhstan",
    "islamic republic of iran": "Iran",
    "united arab emirates": "United Arab Emirates",
    "uae": "United Arab Emirates",
    "state of qatar": "Qatar",
    "kingdom of bahrain": "Bahrain",
    "commonwealth of australia": "Australia",
    "new zealand": "New Zealand",
    "republic of colombia": "Colombia",
    "republic of chile": "Chile",
    "republic of peru": "Peru",
    "republic of ecuador": "Ecuador",
    "dominican republic": "Dominican Republic",
    "republic of guatemala": "Guatemala",
    "arab republic of egypt": "Egypt",
    "kingdom of morocco": "Morocco",
    "republic of tunisia": "Tunisia",
    "state of israel": "Israel",
    "sri lanka": "Sri Lanka",
    "democratic socialist republic of sri lanka": "Sri Lanka",
    "people's republic of bangladesh": "Bangladesh",
    "islamic republic of pakistan": "Pakistan",
    "kingdom of cambodia": "Cambodia",
    "lao people's democratic republic": "Laos",
    "republic of singapore": "Singapore",
    "malaysia": "Malaysia",
    "brunei darussalam": "Brunei",
    "japan": "Japan",
    "canada": "Canada",
    "republic of croatia": "Croatia",
    "republic of serbia": "Serbia",
    "republic of bulgaria": "Bulgaria",
    "republic of moldova": "Moldova",
    "republic of belarus": "Belarus",
    "kingdom of norway": "Norway",
    "kingdom of sweden": "Sweden",
    "republic of finland": "Finland",
    "kingdom of denmark": "Denmark",
    "republic of ireland": "Ireland",
    "swiss confederation": "Switzerland",
    "switzerland": "Switzerland",
    "republic of korea (south)": "South Korea",
    "democratic people's republic of korea": "North Korea",
    "north korea": "North Korea",
    "bosnia and herzegovina": "Bosnia and Herzegovina",
    "trinidad and tobago": "Trinidad and Tobago",
}
_PARTNER_STOPWORDS = {
    "section",
    "the",
    "commerce",
    "treasury",
    "all",
    "certain",
    "customs",
    "cbp",
    "ustr",
    "bis",
    "executive",
    "proclamation",
    "notice",
    "federal",
    "u.s.",
    "us",
    "department",
    "import",
    "imports",
    "duty",
    "duties",
    "tariff",
    "tariffs",
    "antidumping",
    "countervailing",
    "period",
    "fiscal",
    "quarter",
    "entry",
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
    "abroad",
    "foreign",
    "multiple",
    "various",
    "other",
    "countries",
    "sale",
    "sales",
    "date",
    "entity",
    "entities",
    "china's",
    "publication",
    "office",
    "bureau",
    "commission",
    "act",
    "order",
    "president",
    "secretary",
    "congress",
}
_COUNTRY_TOKEN = re.compile(
    r"^(?:[A-Z][A-Za-zÀ-ÿ'’.-]+|and|of|the|da|de|del|des|la|le)(?:\s+(?:[A-Z][A-Za-zÀ-ÿ'’.-]+|and|of|the|da|de|del|des|la|le)){0,5}$"
)


_CORPORATE_SUFFIXES = {
    "ltd",
    "inc",
    "co",
    "llc",
    "corp",
    "corporation",
    "gmbh",
    "sa",
    "srl",
    "bv",
    "nv",
    "plc",
    "ag",
    "pte",
    "pty",
    "limited",
    "company",
    "group",
    "holdings",
}


def normalize_partner(name: str) -> str | None:
    n = " ".join(name.replace("’", "'").split()).strip(" ,.;:")
    if not n:
        return None
    low = n.lower()
    if low.startswith("the "):
        n, low = n[4:], low[4:]
    if low in _PARTNER_NORMALIZE:
        return _PARTNER_NORMALIZE[low]
    if low in _PARTNER_STOPWORDS or n.split()[0].lower() in _PARTNER_STOPWORDS:
        return None
    words = low.replace(".", "").split()
    if not _COUNTRY_TOKEN.match(n) or words[-1] in {"of", "and", "the", "under", "from"}:
        return None
    if any(w in _CORPORATE_SUFFIXES for w in words):
        return None
    # Reject things that are obviously not places (contain digits or are lowercase words)
    if any(ch.isdigit() for ch in n):
        return None
    return n


def extract_partners(text: str) -> list[str]:
    """Trade partners named after 'From' in AD/CVD-style titles, e.g. 'From Cambodia, Malaysia, Thailand, and Vietnam'."""
    out: list[str] = []
    # "China, People's Republic of" (Entity List style) -> "People's Republic of China"
    text = re.sub(r"\b([A-Z][a-z]+), (People's Republic|Republic|Kingdom|State) of\b", r"\2 of \1", text)
    for m in _FROM_RX.finditer(text):
        raw = m.group(1)
        parts = re.split(r",\s*(?:and\s+)?|\s+and\s+|\s*&\s*|\s*/\s*", raw)
        for p in parts:
            norm = normalize_partner(re.sub(r"^(?:and|or)\s+", "", p.strip()))
            if norm and norm not in out:
                out.append(norm)
        if out:
            break
    return out[:10]


__all__ += [  # noqa: PLE0605
    "classify_tariff_status",
    "is_court_tax_relevant",
    "extract_ad_valorem_rate",
    "extract_hts_code",
    "extract_partners",
    "extract_rate_text",
    "is_trade_measure_relevant",
    "normalize_partner",
]
