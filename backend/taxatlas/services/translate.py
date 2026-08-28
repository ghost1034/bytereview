"""Machine translation of non-English crawled content into English (docs/translation.md).

Product rule (Ray): every non-English text on the platform shows an English rendering below the original. This module
owns detection, translation, caching and the daily spend cap; the crawler (`app.crawler.runner`) and the backfill CLI
(`python -m app.crawler translate --backfill`) are thin callers.

    service = get_service()                              # built from Settings (TRANSLATE_PROVIDER=none|google)
    lang, en = service.translate_fields(db, {"title": ..., "summary": ...})
    # lang: BCP-47 of the original ("en" when it is English);  en: {"title": "...", "summary": "..."} for the fields
    # that were translated (empty when the original is English, the provider is "none", or the call failed)

Detection is two-tiered and the first tier is free:
1. `detect_language()` — script ranges (Arabic, Hebrew, CJK, Cyrillic, Thai, ...) plus stop-word and diacritic
   scoring for Latin-script languages. "English" means the English stop-word score wins, or the text is ASCII-only with
   no signal for any language (reference numbers such as "Notice 2026-12 VAT"). English texts are never sent anywhere.
2. The provider. Cloud Translation v3 `translateText` reports the detected source language with every translation, so
   there is no separate (billed) detect call; when it says the text was English after all, `lang` becomes "en" and
   nothing is stored in `*_en`.

Cost controls: the `translations` table caches every provider result by sha256(target, text) (re-crawls, content
re-detections and backfills never pay twice) and doubles as the ledger the UTC-daily character budget is summed over,
so the crawl job and the backfill job share one cap. Every provider call is best-effort: failures return None, are
logged once per process, and leave the row eligible for the next backfill.
"""

from __future__ import annotations

import hashlib
import logging
import re
import time
import unicodedata
from collections.abc import Callable, Iterable, Iterator, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from taxatlas.core.config import Settings, get_settings
from taxatlas.models import Translation

log = logging.getLogger("taxatlas.translate")

DEFAULT_TARGET = "en"
ELLIPSIS = " …"
MAX_SEGMENTS_PER_CALL = 100  # Cloud Translation v3 allows 1024, but smaller batches keep one failure cheap
MAX_CHARS_PER_CALL = 30_000  # v3 hard limit on total code points per translateText request
PROVIDER_NONE = "none"
PROVIDER_GOOGLE = "google"
PROVIDER_PARENTHETICAL = "parenthetical"  # "<native name> (<English name>)" — the English is already in the string

# --------------------------------------------------------------------------------------------------------------------
# Tier 1: heuristic language detection (no network, no cost)
# --------------------------------------------------------------------------------------------------------------------

# Non-Latin scripts -> language guess. A script tells us "not English" for certain; the exact language is a best guess
# that the provider refines (Cyrillic could be ru/uk/bg/sr; Han could be zh or ja without kana).
_SCRIPT_RANGES: tuple[tuple[str, tuple[tuple[int, int], ...]], ...] = (
    ("ar", ((0x0600, 0x06FF), (0x0750, 0x077F), (0x08A0, 0x08FF), (0xFB50, 0xFDFF), (0xFE70, 0xFEFF))),
    ("he", ((0x0590, 0x05FF),)),
    ("el", ((0x0370, 0x03FF), (0x1F00, 0x1FFF))),
    ("cyrl", ((0x0400, 0x04FF), (0x0500, 0x052F))),
    ("hy", ((0x0530, 0x058F),)),
    ("ka", ((0x10A0, 0x10FF),)),
    ("hi", ((0x0900, 0x097F),)),
    ("bn", ((0x0980, 0x09FF),)),
    ("ta", ((0x0B80, 0x0BFF),)),
    ("th", ((0x0E00, 0x0E7F),)),
    ("lo", ((0x0E80, 0x0EFF),)),
    ("my", ((0x1000, 0x109F),)),
    ("km", ((0x1780, 0x17FF),)),
    ("am", ((0x1200, 0x137F),)),
    ("ko", ((0xAC00, 0xD7AF), (0x1100, 0x11FF), (0x3130, 0x318F))),
    ("kana", ((0x3040, 0x309F), (0x30A0, 0x30FF), (0xFF66, 0xFF9F))),
    ("han", ((0x4E00, 0x9FFF), (0x3400, 0x4DBF), (0xF900, 0xFAFF), (0x20000, 0x2A6DF))),
)
_UKRAINIAN_ONLY = set("їєґІЇЄҐ")

# Function words and a few domain words per Latin-script language. Hits are summed per language; overlap between
# languages (de/nl "de", es/fr/it "la", ...) is expected and resolved by the total.
_STOPWORDS: dict[str, frozenset[str]] = {
    k: frozenset(v.split())
    for k, v in {
        "en": (
            "the of and to in for on with is are by from that this as at be or an a new tax notice guidance rules "
            "will has have its not which their you your we about under after before between into over under "
            "revenue service authority agency ministry finance department administration customs office board "
            "inland federal national vat income duty tariff court ruling decision released announces announced "
            "update updated published publishes issued issues returns return filing deadline extended"
        ),
        "de": (
            "der die das und für mit von zu den dem des ist sind auf ein eine einer eines nicht bei nach über zum zur "
            "wird werden auch oder als aus im am steuer steuern bundes finanzen finanzministerium verordnung gesetz "
            "zoll umsatzsteuer einkommensteuer neue neuen ab bis durch wie sich ihre ihrer seit noch nur"
        ),
        "fr": (
            "le la les des du de et à au aux un une pour dans sur par est sont en ce cette ces qui que avec pas plus "
            "ou ne se sa son ses leur leurs impôt impôts fiscale fiscal fiscaux taxe taxes finances publiques loi "
            "décret arrêté nouvelle nouveau nouvelles entreprises déclaration revenus tva douane"
        ),
        "es": (
            "el la los las de del y en un una unos unas para por con que es son se su sus al como más no este esta "
            "estos estas sobre entre impuesto impuestos tributaria tributario ley hasta desde pero también renta iva "
            "contribuyentes hacienda decreto resolución circular nueva nuevo nuevas nuevos declaración"
        ),
        "pt": (
            "o a os as de do da dos das e em um uma para por com que é são se seu sua no na nos nas ao à como mais "
            "não este esta sobre entre imposto impostos tributária tributário receita federal lei até também ou "
            "contribuintes fiscal fazenda decreto portaria nova novo novas novos declaração iva"
        ),
        "it": (
            "il lo la i gli le di del della dei delle dello degli e ed in un una uno per con che è sono si su al alla "
            "ai alle dal dalla nel nella come più non questo questa tra fra imposta imposte fiscale tributo tributi "
            "anche da entrate agenzia decreto legge circolare risoluzione interpello nuova nuovo nuove nuovi iva"
        ),
        "nl": (
            "de het een en van voor met op in is zijn niet dat die dit deze te aan bij door over naar ook of als om "
            "uit wordt worden belasting belastingen belastingdienst maar hun er nog wij u je nieuwe nieuw btw "
            "ondernemers aangifte financiën"
        ),
        "pl": (
            "i w z na do się nie jest są że od po przez dla oraz jak za ze przy tego tych tym podatek podatku "
            "podatkowe podatkowa podatkowy które który która o lub będzie roku ministerstwo finansów krajowa "
            "administracja skarbowa nowe nowy nowa vat pit cit podatników"
        ),
        "no": (
            "og i av for til på er det som en et med om å ikke har fra ved kan skal skatt skatte skatten "
            "skatteetaten etter den de også eller dette blir være må seg du nye ny merverdiavgift mva"
        ),
        "sv": (
            "och i av för till på är det som en ett med om att inte har från vid kan ska skatt skatten skatteverket "
            "efter den de också eller detta blir vara måste sig du än nya ny moms"
        ),
        "da": (
            "og i af for til på er det som en et med om at ikke har fra ved kan skal skat skatten skattestyrelsen "
            "efter den de også eller dette bliver være sig du end nye ny moms"
        ),
        "fi": (
            "ja on ei että se tämä ovat oli tai sekä kun myös vero verot verotus veron verohallinto mutta kuin jos "
            "niin vain voi mukaan vuoden vuonna alkaen uusi uudet asti lisäksi arvonlisävero"
        ),
        "cs": (
            "a v ve na se je jsou že z ze do pro od po při o s k ke daň daně daní daňové daňová daňový finanční "
            "správa které který která nebo bude roku za podle také již mezi ministerstvo financí nové nový nová dph "
            "poplatníci přiznání"
        ),
        "sk": (
            "a v vo na sa je sú že z zo do pre od po pri o s k ku daň dane daní daňové daňová daňový finančná správa "
            "ktoré ktorý ktorá alebo bude roku za podľa tiež už medzi ministerstvo financií nové nový nová dph"
        ),
        "hu": (
            "a az és hogy nem is egy meg el ki be fel le vagy de mint ha már még csak adó adózás adóhatóság adózók "
            "szerint után miatt alapján között ezt ezek lesz lehet nav pénzügyminisztérium áfa új"
        ),
        "tr": (
            "ve bir bu ile için de da olarak olan gibi daha çok en mi mı vergi vergisi vergileri gelir idaresi "
            "bakanlığı hakkında tarafından kadar sonra önce göre ise var yok tebliğ kanun yeni kdv gümrük"
        ),
        "id": (
            "dan yang di ke dari untuk dengan pada ini itu adalah akan tidak atau juga pajak perpajakan oleh dalam "
            "sebagai telah dapat tentang bahwa kepada secara serta sudah wajib peraturan direktorat jenderal ditjen "
            "ppn pph baru"
        ),
        "ms": (
            "dan yang di ke dari untuk dengan pada ini itu adalah akan tidak atau juga cukai oleh dalam sebagai telah "
            "boleh tentang bahawa kepada secara serta lembaga hasil negeri percukaian baharu"
        ),
        "ro": (
            "și în de la cu pe din pentru este sunt un o al ale ai care nu se sa să ca mai prin fiscal fiscală "
            "impozit impozitul taxa taxe anaf după până între către acest această sau noi nou nouă tva"
        ),
        "lt": (
            "ir yra kad su iš į dėl bei ar bet kaip mokesčių mokestis mokesčiai inspekcija nuo iki pagal apie taip "
            "pat buvo bus gali šis ši šie tai jau metų valstybinė pvm naujas nauja"
        ),
        "lv": (
            "un ir ka ar no uz par kā bet arī vai nodokļu nodoklis nodokļi dienests līdz pēc pie šis šī šie tas tā "
            "jau gada valsts ieņēmumu tiek būs var pvn jauns jauna"
        ),
        "vi": (
            "và của các có là cho trong được với không này thuế về từ đến theo người những đã sẽ tại quy định "
            "doanh nghiệp"
        ),
    }.items()
}

# Characters that are (nearly) unique to one or a few languages; each distinct hit adds a bonus to those languages.
_DIACRITIC_HINTS: dict[str, tuple[str, ...]] = {
    "ł": ("pl",),
    "ę": ("pl", "lt"),
    "ą": ("pl", "lt"),
    "ś": ("pl",),
    "ż": ("pl",),
    "ź": ("pl",),
    "ń": ("pl",),
    "ř": ("cs",),
    "ě": ("cs",),
    "ů": ("cs",),
    "ň": ("cs", "sk"),
    "ť": ("cs", "sk"),
    "ď": ("cs", "sk"),
    "ľ": ("sk",),
    "ĺ": ("sk",),
    "ŕ": ("sk",),
    "ő": ("hu",),
    "ű": ("hu",),
    "ğ": ("tr",),
    "ı": ("tr",),
    "İ": ("tr",),
    "ş": ("tr", "ro"),
    "ã": ("pt",),
    "õ": ("pt",),
    "ñ": ("es",),
    "¿": ("es",),
    "¡": ("es",),
    "ß": ("de",),
    "ø": ("no", "da"),
    "æ": ("no", "da"),
    "å": ("no", "da", "sv"),
    "ă": ("ro",),
    "ș": ("ro",),
    "ț": ("ro",),
    "ė": ("lt",),
    "į": ("lt",),
    "ų": ("lt",),
    "ū": ("lt", "lv"),
    "ā": ("lv",),
    "ē": ("lv",),
    "ī": ("lv",),
    "ļ": ("lv",),
    "ņ": ("lv",),
    "ķ": ("lv",),
    "ģ": ("lv",),
    "œ": ("fr",),
    "ì": ("it",),
    "ò": ("it",),
    "ž": ("cs", "sk", "lt", "lv"),
    "š": ("cs", "sk", "lt", "lv"),
    "č": ("cs", "sk", "lt", "lv"),
    "ư": ("vi",),
    "ơ": ("vi",),
    "đ": ("vi",),
    "ạ": ("vi",),
    "ế": ("vi",),
    "ộ": ("vi",),
    "ớ": ("vi",),
    "ụ": ("vi",),
}
_DIACRITIC_BONUS = 2
# Accents shared by several languages: a small split bonus that only breaks ties between otherwise equal stop-word
# scores (e.g. "des" is both French and German; "é" tips it to French) and never decides on its own.
_SHARED_ACCENTS: dict[str, tuple[str, ...]] = {
    "é": ("fr", "es", "pt", "it"),
    "è": ("fr", "it"),
    "ê": ("fr", "pt"),
    "à": ("fr", "it", "pt"),
    "ó": ("es", "pt"),
    "í": ("es", "pt"),
    "ç": ("fr", "pt", "tr"),
    "ü": ("de", "tr", "hu"),
    "ö": ("de", "sv", "fi", "tr", "hu"),
    "ä": ("de", "sv", "fi", "sk"),
}
_SHARED_ACCENT_BONUS = 0.4
_WORD_RX = re.compile(r"[^\W\d_]+", re.UNICODE)
# Deterministic tie-break among non-English languages (more common in the registry first).
_LATIN_PRIORITY = tuple(k for k in _STOPWORDS if k != "en")


def _script_counts(text: str) -> tuple[int, dict[str, int]]:
    """(latin letters, {script: letters}) over the letter characters of `text`."""
    latin = 0
    scripts: dict[str, int] = {}
    for ch in text:
        if not unicodedata.category(ch).startswith("L"):
            continue
        cp = ord(ch)
        if cp < 0x0250 or 0x1E00 <= cp <= 0x1EFF:  # Basic Latin, Latin-1, Extended-A/B, Extended Additional
            latin += 1
            continue
        for lang, ranges in _SCRIPT_RANGES:
            if any(lo <= cp <= hi for lo, hi in ranges):
                scripts[lang] = scripts.get(lang, 0) + 1
                break
    return latin, scripts


def detect_language(text: str | None) -> str | None:
    """Cheap language guess: "en", a BCP-47 primary tag, or None when there is no signal (non-ASCII, no stop words).

    Script-based detection wins when a non-Latin script carries at least a quarter of the letters (bilingual strings
    such as "مصلحة الضرائب المصرية (Egyptian Tax Authority)" are Arabic first). Latin-script text is scored by
    stop-word hits plus diacritic hints; English wins on a strict majority, or by default for ASCII-only text without
    any hit (reference codes, proper names). Numbers-only / empty text is "en" (nothing to translate).
    """
    if not text or not text.strip():
        return DEFAULT_TARGET
    latin, scripts = _script_counts(text)
    total = latin + sum(scripts.values())
    if total == 0:
        return DEFAULT_TARGET
    if scripts:
        script, count = max(scripts.items(), key=lambda kv: kv[1])
        if count > latin or count * 4 >= total:
            if script == "kana" or (script == "han" and scripts.get("kana")):
                return "ja"
            if script == "han":
                return "zh"
            if script == "cyrl":
                return "uk" if any(ch in _UKRAINIAN_ONLY for ch in text) else "ru"
            return script
    lowered = text.lower()
    tokens = _WORD_RX.findall(lowered)
    scores: dict[str, float] = dict.fromkeys(_STOPWORDS, 0.0)
    for tok in tokens:
        weight = 0.5 if len(tok) == 1 else 1.0  # "v." in "South Dakota v. Wayfair" is not Czech
        for lang, words in _STOPWORDS.items():
            if tok in words:
                scores[lang] += weight
    seen_hints: set[str] = set()
    for ch in text:
        low = ch.lower()
        if low in seen_hints:
            continue
        for table, bonus in ((_DIACRITIC_HINTS, _DIACRITIC_BONUS), (_SHARED_ACCENTS, _SHARED_ACCENT_BONUS)):
            langs = table.get(ch) or table.get(low)
            if langs:
                seen_hints.add(low)
                for lang in langs:
                    scores[lang] += bonus / len(langs)
                break
    ascii_only = text.isascii()
    en = scores[DEFAULT_TARGET]
    others = {k: v for k, v in scores.items() if k != DEFAULT_TARGET}
    best_lang = max(_LATIN_PRIORITY, key=lambda k: others[k])
    best = others[best_lang] if others[best_lang] >= 1 else 0.0  # a lone one-letter hit is no evidence
    if best == 0 and en == 0:
        return DEFAULT_TARGET if ascii_only else None
    if en > best or (en == best and ascii_only):
        return DEFAULT_TARGET
    return best_lang


_PAREN_RX = re.compile(r"^(?P<outer>.+?)\s*\((?P<inner>[^()]{3,})\)\s*$")


def english_parenthetical(text: str | None) -> str | None:
    """'<native name> (<English name>)' -> the English name, when the outer part is not English and the inner is.

    Registry authority strings often carry their own translation; using it costs nothing and reads better than a
    machine rendering of the native name. Abbreviations ("(BMF)") do not qualify: the inner part needs an English
    stop-word hit, not just ASCII.
    """
    if not text:
        return None
    m = _PAREN_RX.match(text.strip())
    if not m:
        return None
    outer, inner = m.group("outer").strip(), m.group("inner").strip()
    if not outer or detect_language(outer) == DEFAULT_TARGET:
        return None
    letters = [c for c in inner if c.isalpha()]
    if not letters or sum(c.isupper() for c in letters) / len(letters) > 0.5:
        return None  # "(SEFAZ-TO)", "(NAV)": an acronym, even when a fragment happens to be an English word
    inner_tokens = _WORD_RX.findall(inner.lower())
    if len(inner_tokens) < 2 or not any(t in _STOPWORDS[DEFAULT_TARGET] and len(t) >= 3 for t in inner_tokens):
        return None
    return inner if detect_language(inner) == DEFAULT_TARGET else None


# --------------------------------------------------------------------------------------------------------------------
# Providers
# --------------------------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Translated:
    """One provider result. `text` is None when the source was already in the target language."""

    text: str | None
    lang: str | None  # detected source language (BCP-47 primary tag, possibly with region, e.g. "zh-CN")


class Translator(Protocol):
    name: str

    def detect(self, texts: Sequence[str]) -> list[str | None]: ...

    def translate(
        self, texts: Sequence[str], target: str = DEFAULT_TARGET, source: str | None = None
    ) -> list[Translated] | None:
        """Translate `texts` (already within the per-call limits). None => the whole batch failed (logged)."""
        ...


class NullTranslator:
    """Development default: detects with the heuristic, never translates, never touches the network."""

    name = PROVIDER_NONE

    def detect(self, texts: Sequence[str]) -> list[str | None]:
        return [detect_language(t) for t in texts]

    def translate(
        self, texts: Sequence[str], target: str = DEFAULT_TARGET, source: str | None = None
    ) -> list[Translated] | None:
        return None


_LEGACY_CODES = {"iw": "he", "jw": "jv", "in": "id", "ji": "yi", "mo": "ro"}


def normalize_lang(code: str | None) -> str | None:
    """Lower-case primary tag, upper-case region ("pt-br" -> "pt-BR"), legacy ISO codes mapped, fits String(8)."""
    if not code:
        return None
    code = code.strip().replace("_", "-")
    if not code:
        return None
    primary, _, rest = code.partition("-")
    primary = _LEGACY_CODES.get(primary.lower(), primary.lower())
    if rest:
        sub = rest.split("-")[0]
        sub = sub.upper() if len(sub) == 2 else sub.title() if len(sub) == 4 else sub
        return f"{primary}-{sub}"[:8]
    return primary[:8]


class GoogleTranslator:
    """Cloud Translation v3 `translateText` with ADC credentials.

    `client` is injectable for tests (anything with `.translate_text(request=...)` returning an object whose
    `.translations[i]` has `.translated_text` and `.detected_language_code`). Batches are split to at most
    MAX_SEGMENTS_PER_CALL segments / MAX_CHARS_PER_CALL characters; each call is retried with exponential backoff and a
    failed batch returns None after the first failure is logged once per process.
    """

    name = PROVIDER_GOOGLE

    def __init__(
        self,
        project: str,
        location: str = "global",
        *,
        client: Any | None = None,
        retries: int = 3,
        backoff_seconds: float = 1.0,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if not project:
            raise ValueError("GoogleTranslator needs a GCP project (TRANSLATE_GCP_PROJECT or BQ_PROJECT)")
        if client is None:
            from google.cloud import translate_v3  # lazy: only the job/crawler with TRANSLATE_PROVIDER=google needs it

            client = translate_v3.TranslationServiceClient()
        self._client = client
        self.parent = f"projects/{project}/locations/{location or 'global'}"
        self.retries = max(1, retries)
        self.backoff_seconds = backoff_seconds
        self._sleep = sleep
        self._failure_logged = False
        self.requests: list[dict[str, Any]] = []  # last requests sent (tests; bounded below)

    def detect(self, texts: Sequence[str]) -> list[str | None]:
        # Detection is billed like translation; translateText reports the detected language for free, so the
        # heuristic is used here and the provider refines it when a translation is requested.
        return [detect_language(t) for t in texts]

    def translate(
        self, texts: Sequence[str], target: str = DEFAULT_TARGET, source: str | None = None
    ) -> list[Translated] | None:
        out: list[Translated] = []
        for batch in batches(texts):
            request: dict[str, Any] = {
                "parent": self.parent,
                "contents": list(batch),
                "mime_type": "text/plain",
                "target_language_code": target,
            }
            if source:
                request["source_language_code"] = source
            response = self._call(request)
            if response is None:
                return None
            translations = list(response.translations)
            if len(translations) != len(batch):
                self._log_failure(f"provider returned {len(translations)} translations for {len(batch)} segments")
                return None
            for t in translations:
                lang = normalize_lang(getattr(t, "detected_language_code", None) or source)
                text = getattr(t, "translated_text", None)
                out.append(Translated(text=None if lang == target else text, lang=lang))
        return out

    def _call(self, request: dict[str, Any]) -> Any | None:
        self.requests.append(request)
        del self.requests[:-20]
        last: Exception | None = None
        for attempt in range(self.retries):
            try:
                return self._client.translate_text(request=request)
            except Exception as exc:  # noqa: BLE001 — any provider/network error is "this batch failed"
                last = exc
                if attempt + 1 < self.retries:
                    self._sleep(self.backoff_seconds * (2**attempt))
        self._log_failure(f"{type(last).__name__}: {last}")
        return None

    def _log_failure(self, detail: str) -> None:
        if not self._failure_logged:
            log.warning("translation provider failed (further failures logged at DEBUG): %s", detail)
            self._failure_logged = True
        else:
            log.debug("translation provider failed: %s", detail)


def batches(texts: Sequence[str]) -> Iterator[list[str]]:
    """Split into provider-sized batches (≤ MAX_SEGMENTS_PER_CALL segments, ≤ MAX_CHARS_PER_CALL chars)."""
    buf: list[str] = []
    chars = 0
    for t in texts:
        if buf and (len(buf) >= MAX_SEGMENTS_PER_CALL or chars + len(t) > MAX_CHARS_PER_CALL):
            yield buf
            buf, chars = [], 0
        buf.append(t)
        chars += len(t)
    if buf:
        yield buf


# --------------------------------------------------------------------------------------------------------------------
# Service: cache + budget + entity helpers
# --------------------------------------------------------------------------------------------------------------------


def cache_key(text: str, target: str = DEFAULT_TARGET) -> str:
    return hashlib.sha256(f"{target}\x00{text}".encode()).hexdigest()


def truncate_for_translation(text: str, max_chars: int) -> str:
    """Cut to `max_chars` on a word boundary with an ellipsis marker; the stored original is never cut."""
    text = text.strip()
    if max_chars <= 0 or len(text) <= max_chars:
        return text
    cut = text[: max_chars - len(ELLIPSIS)]
    space = cut.rfind(" ")
    if space > max_chars // 2:
        cut = cut[:space]
    return cut.rstrip() + ELLIPSIS


@dataclass
class TranslationStats:
    provider_calls: int = 0
    segments_sent: int = 0
    chars_sent: int = 0
    cache_hits: int = 0
    heuristic_english: int = 0
    failures: int = 0
    budget_stops: int = 0

    def as_dict(self) -> dict[str, int]:
        return dict(vars(self))


@dataclass
class _Pending:
    text: str
    key: str


class TranslationService:
    def __init__(
        self,
        translator: Translator,
        *,
        target: str = DEFAULT_TARGET,
        max_chars: int = 2000,
        daily_char_budget: int = 2_000_000,
    ) -> None:
        self.translator = translator
        self.target = target
        self.max_chars = max_chars
        self.daily_char_budget = daily_char_budget
        self.stats = TranslationStats()
        self.budget_exhausted = False
        self._budget_logged = False

    @property
    def enabled(self) -> bool:
        """True when a real provider is configured (the heuristic-only NullTranslator never translates)."""
        return self.translator.name != PROVIDER_NONE

    @property
    def provider(self) -> str:
        return self.translator.name

    # ---------------------------------------------------------------- detection

    def detect(self, text: str | None) -> str | None:
        return detect_language(text)

    # ---------------------------------------------------------------- budget

    @staticmethod
    def _day_start() -> datetime:
        now = datetime.now(UTC)
        return now.replace(hour=0, minute=0, second=0, microsecond=0)

    def budget_used_today(self, db: Session) -> int:
        """Characters billed to the active provider since 00:00 UTC (sum over the `translations` ledger)."""
        used = db.scalar(
            select(func.coalesce(func.sum(Translation.source_chars), 0)).where(
                Translation.provider == self.translator.name, Translation.created_at >= self._day_start()
            )
        )
        return int(used or 0)

    # ---------------------------------------------------------------- cache

    def _cached(self, db: Session, keys: Iterable[str]) -> dict[str, Translation]:
        keys = list(dict.fromkeys(keys))
        found: dict[str, Translation] = {}
        for i in range(0, len(keys), 500):
            for row in db.scalars(select(Translation).where(Translation.key.in_(keys[i : i + 500]))):
                found[row.key] = row
        return found

    def _store(self, db: Session, rows: list[dict[str, Any]]) -> None:
        """Insert cache rows, ignoring duplicates (another process may have translated the same text meanwhile)."""
        if not rows:
            return
        dialect = db.get_bind().dialect.name
        if dialect == "postgresql":
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            stmt = pg_insert(Translation).values(rows).on_conflict_do_nothing(index_elements=["key"])
        elif dialect == "sqlite":
            from sqlalchemy.dialects.sqlite import insert as sqlite_insert

            stmt = sqlite_insert(Translation).values(rows).on_conflict_do_nothing(index_elements=["key"])
        else:  # pragma: no cover - other dialects: plain insert, duplicates surface as IntegrityError
            from sqlalchemy import insert

            stmt = insert(Translation).values(rows)
        db.execute(stmt)

    # ---------------------------------------------------------------- core

    def translate_texts(self, db: Session, texts: Sequence[str], *, dry_run: bool = False) -> list[Translated | None]:
        """Translate already-truncated, non-English texts. Cache first, provider for the misses, budget enforced.

        Returns one entry per input: a `Translated` (text None when the provider says it was English), or None when
        nothing could be done (no provider, provider failure, budget exhausted). With `dry_run` the provider is never
        called and nothing is written: misses come back as None and `stats.chars_sent` counts what WOULD be sent.
        """
        results: list[Translated | None] = [None] * len(texts)
        if not texts:
            return results
        keys = [cache_key(t, self.target) for t in texts]
        cached = self._cached(db, keys)
        misses: dict[str, _Pending] = {}
        for i, (text, key) in enumerate(zip(texts, keys, strict=True)):
            row = cached.get(key)
            if row is not None:
                self.stats.cache_hits += 1
                results[i] = Translated(text=row.translated, lang=row.source_lang)
            elif text:
                misses.setdefault(key, _Pending(text=text, key=key))
        if not misses:
            return results
        pending = list(misses.values())
        chars = sum(len(p.text) for p in pending)
        if dry_run:
            self.stats.chars_sent += chars
            self.stats.segments_sent += len(pending)
            return results
        if not self.enabled:
            return results
        if self.budget_exhausted or self.budget_used_today(db) + chars > self.daily_char_budget:
            self.budget_exhausted = True
            self.stats.budget_stops += 1
            if not self._budget_logged:
                log.warning(
                    "translation daily character budget (%s) reached; skipping until tomorrow (UTC)",
                    self.daily_char_budget,
                )
                self._budget_logged = True
            return results
        translated = self.translator.translate([p.text for p in pending], target=self.target)
        self.stats.provider_calls += 1
        if translated is None or len(translated) != len(pending):
            self.stats.failures += 1
            return results
        self.stats.segments_sent += len(pending)
        self.stats.chars_sent += chars
        now = datetime.now(UTC)
        by_key = {p.key: t for p, t in zip(pending, translated, strict=True)}
        self._store(
            db,
            [
                {
                    "key": p.key,
                    "target_lang": self.target,
                    "source_lang": t.lang,
                    "source_chars": len(p.text),
                    "translated": t.text,
                    "provider": self.translator.name,
                    "created_at": now,
                }
                for p, t in zip(pending, translated, strict=True)
            ],
        )
        for i, key in enumerate(keys):
            if results[i] is None and key in by_key:
                results[i] = by_key[key]
        return results

    def translate_many(
        self, db: Session, items: Sequence[dict[str, str | None]], *, dry_run: bool = False
    ) -> list[tuple[str | None, dict[str, str]]]:
        """Entity-level translation for many records at once (one provider round-trip for the whole batch).

        Each item maps field name -> original text (title first: its detected language names the record's `lang`).
        Returns, per item, (lang, {field: english}). `lang` is "en" for English originals (nothing translated),
        the detected language otherwise, or None when the heuristic had no signal and no provider answered.
        """
        plans: list[tuple[str | None, list[tuple[str, str]]]] = []
        segments: list[str] = []
        for fields in items:
            present = [(k, v.strip()) for k, v in fields.items() if v and v.strip()]
            if not present:
                plans.append((DEFAULT_TARGET, []))
                continue
            guess = detect_language(" ".join(v for _, v in present))
            if guess == DEFAULT_TARGET:
                self.stats.heuristic_english += 1
                plans.append((DEFAULT_TARGET, []))
                continue
            inputs = [(k, truncate_for_translation(v, self.max_chars)) for k, v in present]
            plans.append((guess, inputs))
            segments.extend(v for _, v in inputs)
        answers = self.translate_texts(db, segments, dry_run=dry_run) if segments else []
        out: list[tuple[str | None, dict[str, str]]] = []
        cursor = 0
        for guess, inputs in plans:
            if not inputs:
                out.append((DEFAULT_TARGET, {}))
                continue
            en: dict[str, str] = {}
            lang: str | None = None
            answered = False
            for k, _ in inputs:
                r = answers[cursor]
                cursor += 1
                if r is None:
                    continue
                answered = True
                if lang is None and r.lang and r.lang != self.target:
                    lang = r.lang
                if r.text:
                    en[k] = r.text
            if answered and lang is None:
                lang = DEFAULT_TARGET  # the provider saw English in every field it answered
                en = {}
            out.append((lang or guess, en))
        return out

    def translate_fields(self, db: Session, fields: dict[str, str | None]) -> tuple[str | None, dict[str, str]]:
        """One record: (lang, {field: english}); see `translate_many`."""
        return self.translate_many(db, [fields])[0]

    def translate_name(self, db: Session, text: str | None, *, dry_run: bool = False) -> tuple[str | None, str | None]:
        """Authority / institution names: (lang, english). Uses an English parenthetical when the string has one."""
        if not text or not text.strip():
            return None, None
        lang = detect_language(text)
        if lang == DEFAULT_TARGET:
            return lang, None
        inner = english_parenthetical(text)
        if inner:
            if not dry_run:
                self._store(
                    db,
                    [
                        {
                            "key": cache_key(text.strip(), self.target),
                            "target_lang": self.target,
                            "source_lang": lang,
                            "source_chars": 0,
                            "translated": inner,
                            "provider": PROVIDER_PARENTHETICAL,
                            "created_at": datetime.now(UTC),
                        }
                    ],
                )
            return lang, inner
        lang2, en = self.translate_many(db, [{"name": text}], dry_run=dry_run)[0]
        return lang2, en.get("name")


# --------------------------------------------------------------------------------------------------------------------
# Backfill (CLI / Cloud Run job)
# --------------------------------------------------------------------------------------------------------------------

ENTITIES = ("regulations", "court_decisions", "tariffs", "sources", "jurisdictions")


@dataclass
class BackfillReport:
    entity: str
    scanned: int = 0
    english: int = 0
    translated: int = 0
    detected_only: int = 0  # lang set, no English available (provider off, failure, or budget)
    change_events: int = 0
    stopped: bool = False  # budget exhausted mid-way

    def as_dict(self) -> dict[str, Any]:
        return dict(vars(self))


def _apply_change_event_titles(db: Session, entity_type: str, entity_id: int, title: str, title_en: str) -> int:
    from taxatlas.models import ChangeEvent

    rows = list(
        db.scalars(
            select(ChangeEvent).where(
                ChangeEvent.entity_type == entity_type,
                ChangeEvent.entity_id == entity_id,
                ChangeEvent.title == title[:500],
                ChangeEvent.title_en.is_(None),
            )
        )
    )
    for ev in rows:
        ev.title_en = title_en
    return len(rows)


# (model, entity_type for change events, primary field, [other fields]) — primary field's English mirrors to events
_CONTENT_ENTITIES: dict[str, tuple[str, str, tuple[str, ...]]] = {
    "regulations": ("regulation", "title", ("summary",)),
    "court_decisions": ("court_decision", "case_name", ("summary", "holding")),
    "tariffs": ("tariff", "product_description", ("notes",)),
}


def _content_model(entity: str):
    from taxatlas.models import CourtDecision, Regulation, Tariff

    return {"regulations": Regulation, "court_decisions": CourtDecision, "tariffs": Tariff}[entity]


def _eligible_content(model, primary: str):
    lang = model.lang
    primary_en = getattr(model, f"{primary}_en")
    return select(model).where(lang.is_(None) | ((lang != DEFAULT_TARGET) & primary_en.is_(None))).order_by(model.id)


def backfill_content(
    db: Session,
    service: TranslationService,
    entity: str,
    *,
    limit: int | None = None,
    batch_size: int = 100,
    dry_run: bool = False,
) -> BackfillReport:
    """Fill lang / *_en on rows never detected, or detected non-English but still untranslated. Idempotent."""
    entity_type, primary, others = _CONTENT_ENTITIES[entity]
    model = _content_model(entity)
    report = BackfillReport(entity=entity)
    stmt = _eligible_content(model, primary)
    if limit:
        stmt = stmt.limit(limit)
    rows = list(db.scalars(stmt))
    fields = (primary, *others)
    for start in range(0, len(rows), batch_size):
        chunk = rows[start : start + batch_size]
        items = [{f: getattr(r, f) for f in fields} for r in chunk]
        results = service.translate_many(db, items, dry_run=dry_run)
        for row, (lang, en) in zip(chunk, results, strict=True):
            report.scanned += 1
            if lang == DEFAULT_TARGET:
                report.english += 1
            elif en:
                report.translated += 1
            else:
                report.detected_only += 1
            if dry_run:
                continue
            row.lang = lang
            for f in fields:
                if f in en:
                    setattr(row, f"{f}_en", en[f])
                elif lang == DEFAULT_TARGET:
                    setattr(row, f"{f}_en", None)
            if primary in en:
                report.change_events += _apply_change_event_titles(
                    db, entity_type, row.id, getattr(row, primary), en[primary]
                )
        if not dry_run:
            db.commit()
        if service.budget_exhausted:
            report.stopped = True
            break
    return report


def backfill_names(
    db: Session,
    service: TranslationService,
    entity: str,
    *,
    limit: int | None = None,
    dry_run: bool = False,
) -> BackfillReport:
    """Source.authority -> authority_en, Jurisdiction.tax_authority_name -> tax_authority_name_en.

    Translated once per distinct string; English strings are left with `*_en` NULL (they are re-checked by the
    heuristic on every run, which costs nothing, and by the cache when the provider once said "en").
    """
    from taxatlas.models import Jurisdiction, Source

    model, col = {"sources": (Source, "authority"), "jurisdictions": (Jurisdiction, "tax_authority_name")}[entity]
    attr = getattr(model, col)
    attr_en = getattr(model, f"{col}_en")
    report = BackfillReport(entity=entity)
    stmt = select(model).where(attr.isnot(None), attr != "", attr_en.is_(None)).order_by(model.id)
    rows = list(db.scalars(stmt))
    groups: dict[str, list[Any]] = {}
    for r in rows:
        groups.setdefault(getattr(r, col).strip(), []).append(r)
    names = list(groups)
    if limit:
        names = names[:limit]
    for name in names:
        lang, en = service.translate_name(db, name, dry_run=dry_run)
        members = groups[name]
        report.scanned += len(members)
        if lang == DEFAULT_TARGET:
            report.english += len(members)
        elif en:
            report.translated += len(members)
            if not dry_run:
                for r in members:
                    setattr(r, f"{col}_en", en)
        else:
            report.detected_only += len(members)
        if service.budget_exhausted:
            report.stopped = True
            break
    if not dry_run:
        db.commit()
    return report


def backfill(
    db: Session,
    service: TranslationService,
    *,
    entity: str = "all",
    limit: int | None = None,
    dry_run: bool = False,
    batch_size: int = 100,
) -> dict[str, Any]:
    """Run the backfill for one entity or all; returns per-entity reports plus the service's counters."""
    wanted = list(ENTITIES) if entity == "all" else [entity]
    unknown = [e for e in wanted if e not in ENTITIES]
    if unknown:
        raise ValueError(f"unknown entity {unknown[0]!r}; choose from {', '.join(ENTITIES)} or all")
    reports: dict[str, Any] = {}
    for e in wanted:
        if e in _CONTENT_ENTITIES:
            rep = backfill_content(db, service, e, limit=limit, batch_size=batch_size, dry_run=dry_run)
        else:
            rep = backfill_names(db, service, e, limit=limit, dry_run=dry_run)
        reports[e] = rep.as_dict()
        if service.budget_exhausted:
            break
    return {
        "provider": service.provider,
        "dry_run": dry_run,
        "entities": reports,
        "totals": {
            k: sum(r[k] for r in reports.values())
            for k in ("scanned", "english", "translated", "detected_only", "change_events")
        },
        "stats": service.stats.as_dict(),
        "budget_exhausted": service.budget_exhausted,
    }


# --------------------------------------------------------------------------------------------------------------------
# Wiring
# --------------------------------------------------------------------------------------------------------------------

_service: TranslationService | None = None


def build_translator(settings: Settings) -> Translator:
    provider = (settings.translate_provider or PROVIDER_NONE).strip().lower()
    if provider in {PROVIDER_NONE, "", "off", "false"}:
        return NullTranslator()
    if provider == PROVIDER_GOOGLE:
        return GoogleTranslator(settings.translate_project, settings.translate_gcp_location)
    raise ValueError(f"TRANSLATE_PROVIDER must be 'none' or 'google' (got {settings.translate_provider!r})")


def build_service(settings: Settings | None = None, translator: Translator | None = None) -> TranslationService:
    settings = settings or get_settings()
    if translator is None:
        try:
            translator = build_translator(settings)
        except Exception as exc:  # noqa: BLE001 — a broken provider must never break the crawl
            log.error("translation provider unavailable, falling back to detection only: %s", exc)
            translator = NullTranslator()
    return TranslationService(
        translator,
        target=settings.translate_target or DEFAULT_TARGET,
        max_chars=settings.translate_max_chars,
        daily_char_budget=settings.translate_daily_char_budget,
    )


def get_service() -> TranslationService:
    """Process-wide service built from Settings on first use (tests swap it with `set_service`)."""
    global _service
    if _service is None:
        _service = build_service()
    return _service


def set_service(service: TranslationService | None) -> None:
    global _service
    _service = service


__all__ = [
    "ENTITIES",
    "GoogleTranslator",
    "NullTranslator",
    "Translated",
    "TranslationService",
    "Translator",
    "backfill",
    "batches",
    "build_service",
    "cache_key",
    "detect_language",
    "english_parenthetical",
    "get_service",
    "normalize_lang",
    "set_service",
    "truncate_for_translation",
]
