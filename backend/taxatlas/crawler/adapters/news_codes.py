"""Code tables for the `news` adapter's GDELT provider.

GDELT's DOC 2.0 API filters by *FIPS 10-4* country codes (``sourcecountry:``) and by its own language names
(``sourcelang:``), not by ISO. Both tables below were checked against GDELT's published lookups on 2026-08-25:

- https://data.gdeltproject.org/api/v2/guides/LOOKUP-COUNTRIES.TXT  (FIPS code -> name)
- https://data.gdeltproject.org/api/v2/guides/LOOKUP-LANGUAGES.TXT  (ISO 639-3 code -> name)

Keys are ISO 3166-1 alpha-2 (what `Source.jurisdiction_code` / the `news` config use) and ISO 639-1. A missing key means
GDELT has no filter for it: the provider then searches without that restriction and says so in the run notes.
"""

from __future__ import annotations

# ISO 3166-1 alpha-2 -> FIPS 10-4 (GDELT `sourcecountry`). Where FIPS and ISO differ the ISO name is in the comment.
ISO2_TO_FIPS: dict[str, str] = {
    "AD": "AN",  # Andorra
    "AE": "AE",
    "AF": "AF",
    "AG": "AC",  # Antigua and Barbuda
    "AI": "AV",  # Anguilla
    "AL": "AL",
    "AM": "AM",
    "AO": "AO",
    "AQ": "AY",  # Antarctica
    "AR": "AR",
    "AS": "AQ",  # American Samoa
    "AT": "AU",  # Austria
    "AU": "AS",  # Australia
    "AW": "AA",  # Aruba
    "AX": "FI",  # Åland Islands (GDELT has no separate code; Finland)
    "AZ": "AJ",  # Azerbaijan
    "BA": "BK",  # Bosnia and Herzegovina
    "BB": "BB",
    "BD": "BG",  # Bangladesh
    "BE": "BE",
    "BF": "UV",  # Burkina Faso
    "BG": "BU",  # Bulgaria
    "BH": "BA",  # Bahrain
    "BI": "BY",  # Burundi
    "BJ": "BN",  # Benin
    "BL": "TB",  # Saint Barthélemy
    "BM": "BD",  # Bermuda
    "BN": "BX",  # Brunei
    "BO": "BL",  # Bolivia
    "BQ": "NT",  # Bonaire, Sint Eustatius and Saba (GDELT keeps the Netherlands Antilles code)
    "BR": "BR",
    "BS": "BF",  # Bahamas
    "BT": "BT",
    "BV": "BV",
    "BW": "BC",  # Botswana
    "BY": "BO",  # Belarus
    "BZ": "BH",  # Belize
    "CA": "CA",
    "CC": "CK",  # Cocos (Keeling) Islands
    "CD": "CG",  # Congo, Democratic Republic of the
    "CF": "CT",  # Central African Republic
    "CG": "CF",  # Congo, Republic of the
    "CH": "SZ",  # Switzerland
    "CI": "IV",  # Côte d'Ivoire
    "CK": "CW",  # Cook Islands
    "CL": "CI",  # Chile
    "CM": "CM",
    "CN": "CH",  # China
    "CO": "CO",
    "CR": "CS",  # Costa Rica
    "CU": "CU",
    "CV": "CV",
    "CW": "NT",  # Curaçao (GDELT still uses the Netherlands Antilles code)
    "CX": "KT",  # Christmas Island
    "CY": "CY",
    "CZ": "EZ",  # Czechia
    "DE": "GM",  # Germany
    "DJ": "DJ",
    "DK": "DA",  # Denmark
    "DM": "DO",  # Dominica
    "DO": "DR",  # Dominican Republic
    "DZ": "AG",  # Algeria
    "EC": "EC",
    "EE": "EN",  # Estonia
    "EG": "EG",
    "EH": "WI",  # Western Sahara
    "ER": "ER",
    "ES": "SP",  # Spain
    "ET": "ET",
    "FI": "FI",
    "FJ": "FJ",
    "FK": "FK",
    "FM": "FM",
    "FO": "FO",
    "FR": "FR",
    "GA": "GB",  # Gabon
    "GB": "UK",  # United Kingdom
    "GD": "GJ",  # Grenada
    "GE": "GG",  # Georgia
    "GF": "FG",  # French Guiana
    "GG": "GK",  # Guernsey
    "GH": "GH",
    "GI": "GI",
    "GL": "GL",
    "GM": "GA",  # Gambia
    "GN": "GV",  # Guinea
    "GP": "GP",
    "GQ": "EK",  # Equatorial Guinea
    "GR": "GR",
    "GS": "SX",  # South Georgia and the South Sandwich Islands
    "GT": "GT",
    "GU": "GQ",  # Guam
    "GW": "PU",  # Guinea-Bissau
    "GY": "GY",
    "HK": "HK",
    "HM": "HM",
    "HN": "HO",  # Honduras
    "HR": "HR",
    "HT": "HA",  # Haiti
    "HU": "HU",
    "ID": "ID",
    "IE": "EI",  # Ireland
    "IL": "IS",  # Israel
    "IM": "IM",
    "IN": "IN",
    "IO": "IO",
    "IQ": "IZ",  # Iraq
    "IR": "IR",
    "IS": "IC",  # Iceland
    "IT": "IT",
    "JE": "JE",
    "JM": "JM",
    "JO": "JO",
    "JP": "JA",  # Japan
    "KE": "KE",
    "KG": "KG",
    "KH": "CB",  # Cambodia
    "KI": "KR",  # Kiribati
    "KM": "CN",  # Comoros
    "KN": "SC",  # Saint Kitts and Nevis
    "KP": "KN",  # North Korea
    "KR": "KS",  # South Korea
    "KW": "KU",  # Kuwait
    "KY": "CJ",  # Cayman Islands
    "KZ": "KZ",
    "LA": "LA",
    "LB": "LE",  # Lebanon
    "LC": "ST",  # Saint Lucia
    "LI": "LS",  # Liechtenstein
    "LK": "CE",  # Sri Lanka
    "LR": "LI",  # Liberia
    "LS": "LT",  # Lesotho
    "LT": "LH",  # Lithuania
    "LU": "LU",
    "LV": "LG",  # Latvia
    "LY": "LY",
    "MA": "MO",  # Morocco
    "MC": "MN",  # Monaco
    "MD": "MD",
    "ME": "MJ",  # Montenegro
    "MF": "RN",  # Saint Martin (French part)
    "MG": "MA",  # Madagascar
    "MH": "RM",  # Marshall Islands
    "MK": "MK",
    "ML": "ML",
    "MM": "BM",  # Myanmar
    "MN": "MG",  # Mongolia
    "MO": "MC",  # Macao
    "MP": "CQ",  # Northern Mariana Islands
    "MQ": "MB",  # Martinique
    "MR": "MR",
    "MS": "MH",  # Montserrat
    "MT": "MT",
    "MU": "MP",  # Mauritius
    "MV": "MV",
    "MW": "MI",  # Malawi
    "MX": "MX",
    "MY": "MY",
    "MZ": "MZ",
    "NA": "WA",  # Namibia
    "NC": "NC",
    "NE": "NG",  # Niger
    "NF": "NF",
    "NG": "NI",  # Nigeria
    "NI": "NU",  # Nicaragua
    "NL": "NL",
    "NO": "NO",
    "NP": "NP",
    "NR": "NR",
    "NU": "NE",  # Niue
    "NZ": "NZ",
    "OM": "MU",  # Oman
    "PA": "PM",  # Panama
    "PE": "PE",
    "PF": "FP",  # French Polynesia
    "PG": "PP",  # Papua New Guinea
    "PH": "RP",  # Philippines
    "PK": "PK",
    "PL": "PL",
    "PM": "SB",  # Saint Pierre and Miquelon
    "PN": "PC",  # Pitcairn
    "PR": "RQ",  # Puerto Rico
    "PS": "WE",  # Palestine (GDELT splits West Bank WE / Gaza Strip GZ; WE carries the ministries' press)
    "PT": "PO",  # Portugal
    "PW": "PS",  # Palau
    "PY": "PA",  # Paraguay
    "QA": "QA",
    "RE": "RE",
    "RO": "RO",
    "RS": "RI",  # Serbia
    "RU": "RS",  # Russia
    "RW": "RW",
    "SA": "SA",
    "SB": "BP",  # Solomon Islands
    "SC": "SE",  # Seychelles
    "SD": "SU",  # Sudan
    "SE": "SW",  # Sweden
    "SG": "SN",  # Singapore
    "SH": "SH",
    "SI": "SI",
    "SJ": "SV",  # Svalbard and Jan Mayen
    "SK": "LO",  # Slovakia
    "SL": "SL",
    "SM": "SM",
    "SN": "SG",  # Senegal
    "SO": "SO",
    "SR": "NS",  # Suriname
    "SS": "OD",  # South Sudan
    "ST": "TP",  # São Tomé and Príncipe
    "SV": "ES",  # El Salvador
    "SX": "NT",  # Sint Maarten (GDELT still uses the Netherlands Antilles code)
    "SY": "SY",
    "SZ": "WZ",  # Eswatini
    "TC": "TK",  # Turks and Caicos Islands
    "TD": "CD",  # Chad
    "TF": "FS",  # French Southern Territories
    "TG": "TO",  # Togo
    "TH": "TH",
    "TJ": "TI",  # Tajikistan
    "TK": "TL",  # Tokelau
    "TL": "TT",  # Timor-Leste
    "TM": "TX",  # Turkmenistan
    "TN": "TS",  # Tunisia
    "TO": "TN",  # Tonga
    "TR": "TU",  # Turkey
    "TT": "TD",  # Trinidad and Tobago
    "TV": "TV",
    "TW": "TW",
    "TZ": "TZ",
    "UA": "UP",  # Ukraine
    "UG": "UG",
    "US": "US",
    "UY": "UY",
    "UZ": "UZ",
    "VA": "VT",  # Vatican City
    "VC": "VC",
    "VE": "VE",
    "VG": "VI",  # British Virgin Islands
    "VI": "VQ",  # U.S. Virgin Islands
    "VN": "VM",  # Vietnam
    "VU": "NH",  # Vanuatu
    "WF": "WF",
    "WS": "WS",
    "XK": "KV",  # Kosovo
    "YE": "YM",  # Yemen
    "YT": "MF",  # Mayotte
    "ZA": "SF",  # South Africa
    "ZM": "ZA",  # Zambia
    "ZW": "ZI",  # Zimbabwe
}

# ISO 639-1 -> GDELT language name (GDELT `sourcelang`, case-insensitive). Only languages GDELT lists are present.
ISO639_TO_GDELT_LANG: dict[str, str] = {
    "af": "afrikaans",
    "sq": "albanian",
    "ar": "arabic",
    "hy": "armenian",
    "az": "azerbaijani",
    "bn": "bengali",
    "bs": "bosnian",
    "bg": "bulgarian",
    "ca": "catalan",
    "zh": "chinese",
    "hr": "croatian",
    "cs": "czech",
    "da": "danish",
    "nl": "dutch",
    "en": "english",
    "et": "estonian",
    "fi": "finnish",
    "fr": "french",
    "gl": "galician",
    "ka": "georgian",
    "de": "german",
    "el": "greek",
    "gu": "gujarati",
    "he": "hebrew",
    "hi": "hindi",
    "hu": "hungarian",
    "is": "icelandic",
    "id": "indonesian",
    "it": "italian",
    "ja": "japanese",
    "kn": "kannada",
    "kk": "kazakh",
    "ko": "korean",
    "lv": "latvian",
    "lt": "lithuanian",
    "mk": "macedonian",
    "ms": "malay",
    "ml": "malayalam",
    "mr": "marathi",
    "mn": "mongolian",
    "ne": "nepali",
    "no": "norwegian",
    "nb": "norwegian",
    "nn": "norwegiannynorsk",
    "fa": "persian",
    "pl": "polish",
    "pt": "portuguese",
    "pa": "punjabi",
    "ro": "romanian",
    "ru": "russian",
    "sr": "serbian",
    "si": "sinhalese",
    "sk": "slovak",
    "sl": "slovenian",
    "so": "somali",
    "es": "spanish",
    "sw": "swahili",
    "sv": "swedish",
    "ta": "tamil",
    "te": "telugu",
    "th": "thai",
    "bo": "tibetan",
    "tr": "turkish",
    "uk": "ukrainian",
    "ur": "urdu",
    "vi": "vietnamese",
}


def gdelt_country(iso2: str | None) -> str | None:
    """FIPS code for an ISO alpha-2 country (case-insensitive); None when unknown/unsupported."""
    if not iso2:
        return None
    return ISO2_TO_FIPS.get(iso2.strip().upper()[:2])


def gdelt_language(lang: str | None) -> str | None:
    """GDELT language name for a BCP-47 / ISO 639-1 tag ("fr", "es-419", "pt-BR", "zh-CN"); None when unsupported."""
    if not lang:
        return None
    base = lang.strip().lower().replace("_", "-").split("-")[0]
    return ISO639_TO_GDELT_LANG.get(base)


__all__ = ["ISO2_TO_FIPS", "ISO639_TO_GDELT_LANG", "gdelt_country", "gdelt_language"]
