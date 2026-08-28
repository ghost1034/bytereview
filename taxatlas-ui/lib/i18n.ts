/* Language helpers for bilingual rendering (original + English).
 * `lang` values are BCP-47 codes from the API (`ar`, `pl`, `zh-Hant`, `pt-BR`, …); null/undefined means "not detected".
 * The English line itself always carries lang="en"; these helpers only describe the *original*. */

/** Primary language subtag, lower-cased (`"zh-Hant"` → `"zh"`). Empty string for null/blank. */
export function primarySubtag(lang: string | null | undefined): string {
  if (!lang) return "";
  const head = lang.trim().split(/[-_]/)[0];
  return head ? head.toLowerCase() : "";
}

/** True for `en`, `en-GB`, … Unknown (null) is *not* English — callers that want "show nothing when unknown" use `isForeign`. */
export function isEnglish(lang: string | null | undefined): boolean {
  return primarySubtag(lang) === "en";
}

/** True only when the language is known and is not English: the cases where a translation line is expected. */
export function isForeign(lang: string | null | undefined): boolean {
  const p = primarySubtag(lang);
  return p !== "" && p !== "en" && p !== "und" && p !== "mul" && p !== "zxx";
}

// Languages written right-to-left. Script subtags (Arab, Hebr, …) are honoured too for codes like `ku-Arab`.
const RTL_LANGS = new Set(["ar", "he", "iw", "fa", "ur", "ps", "yi", "ji", "dv", "ug", "syr", "ckb", "sd", "ks", "pnb", "arc", "nqo", "sam", "man"]);
const RTL_SCRIPTS = new Set(["arab", "hebr", "thaa", "syrc", "nkoo", "samr", "adlm", "rohg", "mand"]);

/** Right-to-left script? Used for tests and for callers that cannot rely on `dir="auto"` (e.g. SVG text). */
export function isRTL(lang: string | null | undefined): boolean {
  if (!lang) return false;
  const parts = lang.trim().toLowerCase().split(/[-_]/);
  if (RTL_LANGS.has(parts[0])) return true;
  return parts.slice(1).some((p) => RTL_SCRIPTS.has(p));
}

// Fallback names for environments without Intl.DisplayNames (older jsdom) or for codes it does not know.
const FALLBACK_NAMES: Record<string, string> = {
  ar: "Arabic", bg: "Bulgarian", cs: "Czech", da: "Danish", de: "German", el: "Greek", en: "English", es: "Spanish", et: "Estonian",
  fa: "Persian", fi: "Finnish", fr: "French", he: "Hebrew", hi: "Hindi", hr: "Croatian", hu: "Hungarian", id: "Indonesian", it: "Italian",
  ja: "Japanese", ko: "Korean", lt: "Lithuanian", lv: "Latvian", ms: "Malay", nb: "Norwegian Bokmål", nl: "Dutch", no: "Norwegian",
  pl: "Polish", pt: "Portuguese", ro: "Romanian", ru: "Russian", sk: "Slovak", sl: "Slovenian", sv: "Swedish", th: "Thai", tr: "Turkish",
  uk: "Ukrainian", ur: "Urdu", vi: "Vietnamese", zh: "Chinese",
};

let displayNames: Intl.DisplayNames | null | undefined;
function intlNames(): Intl.DisplayNames | null {
  if (displayNames !== undefined) return displayNames;
  try {
    displayNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "language" }) : null;
  } catch {
    displayNames = null;
  }
  return displayNames;
}

/** English display name for a BCP-47 code (`"pt-BR"` → `"Brazilian Portuguese"`, `"ar"` → `"Arabic"`). Falls back to the code. */
export function langName(lang: string | null | undefined): string {
  if (!lang) return "";
  const code = lang.trim();
  if (!code) return "";
  const names = intlNames();
  if (names) {
    try {
      const n = names.of(code);
      if (n && n.toLowerCase() !== code.toLowerCase()) return n;
    } catch {
      /* invalid tag → fall through */
    }
  }
  return FALLBACK_NAMES[primarySubtag(code)] ?? code;
}

/** Compact mono badge text for the Lang column: the upper-cased primary subtag (`"AR"`, `"PL"`, `"ZH"`).
 *  Returns null for English or unknown so callers render nothing. */
export function langBadge(lang: string | null | undefined): string | null {
  if (!isForeign(lang)) return null;
  return primarySubtag(lang).toUpperCase();
}

/** Tooltip for the Lang badge and the original line: `"Arabic (ar) · original text"`. */
export function langTitle(lang: string | null | undefined): string | undefined {
  if (!lang) return undefined;
  const name = langName(lang);
  return name && name !== lang ? `${name} (${lang}) · original text` : `${lang} · original text`;
}

/** Text shown on the "EN" marker. One place so copy stays consistent. */
export const MACHINE_TRANSLATION_NOTE = "Machine translation (Google Cloud Translation)";
export const NO_TRANSLATION_NOTE = "(no English translation yet)";

/** Regulations carry `authority` but no `authority_en`; the crawler's Source does. Use the source's English name when
 *  the regulation's authority is the source's authority (or the regulation has none of its own). */
export function authorityEn(rec: { authority: string | null; authority_en?: string | null }, src?: { authority: string | null; authority_en?: string | null } | null): string | null {
  if (rec.authority_en) return rec.authority_en;
  if (!src?.authority_en) return null;
  if (!rec.authority || !src.authority) return src.authority_en;
  return rec.authority.trim().toLocaleLowerCase() === src.authority.trim().toLocaleLowerCase() ? src.authority_en : null;
}
