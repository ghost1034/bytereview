"""Headless-browser listing adapter: Chromium renders the page, then the HTML adapter's selector parser reads it.

For sites whose listing is built client-side (Next.js / AEM / SharePoint / WebSphere / web components) or that answer
plain HTTP clients with a bot-manager interstitial. A source switches from ``html`` to ``browser`` by changing the
``adapter`` field; every ``item_selector`` / ``title_selector`` / ``link_selector`` / ``date_selector`` /
``summary_selector`` / ``base_url`` / ``include_keywords`` key keeps its meaning (``parse_listing`` is shared).

Browser-only config keys (all optional):
  wait_for         CSS selector that must appear before the DOM is read (default: none; the load state is enough)
  wait_until       Playwright load state: "networkidle" (default), "load", "domcontentloaded"
  click            list of CSS selectors clicked in order after load (cookie banners, "load more"); a missing
                   selector is skipped, not an error
  scroll           number of scroll-to-bottom passes after load (infinite-scroll lists); default 0
  settle_ms        extra milliseconds to wait after the last interaction (default 500 when click/scroll is used)
  timeout_ms       navigation timeout (default: settings.browser_timeout_seconds * 1000)
  headers          {"Accept-Language": ...} is honoured (other request headers are sent as extra HTTP headers)
  user_agent       override the default desktop Chrome UA
  block_resources  False to load images/fonts/media (default True: they are aborted to keep page loads fast)

Lifecycle. Playwright's sync API is bound to the thread that created it, so the adapter keeps one
``BrowserSession`` (Playwright driver + Chromium) per thread. ``python -m taxatlas.jobs crawl-browser`` and
``python -m taxatlas.crawler run`` open a session around the whole run (``with browser_session():``) so the browser is
launched once and reused; a bare ``fetch`` outside a session opens and closes its own. Each source gets a fresh
browser context (cookies, storage) that is always closed. ``shutdown_all()`` is also registered with ``atexit``.

Availability. The API image carries neither Playwright nor Chromium. ``fetch`` raises
``BrowserUnavailable("browser adapter unavailable: install playwright")`` there; the runner never reaches it because
it marks browser sources *skipped* while ``settings.browser_enabled`` is false (the browser job image sets
``BROWSER_ENABLED=true``).
"""

from __future__ import annotations

import atexit
import contextlib
import logging
import threading
from collections.abc import Iterator
from typing import Any

import httpx

from taxatlas.core.config import get_settings
from taxatlas.crawler.adapters.base import (
    MAX_RESPONSE_BYTES,
    BaseAdapter,
    FetchResult,
    filter_keywords,
    polite_delay,
)
from taxatlas.crawler.adapters.html import parse_listing
from taxatlas.models import Source

log = logging.getLogger("taxatlas.crawler.browser")

UNAVAILABLE_MESSAGE = "browser adapter unavailable: install playwright"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36"
)
DEFAULT_ACCEPT_LANGUAGE = "en-US,en;q=0.9"
DEFAULT_VIEWPORT = {"width": 1366, "height": 900}
BLOCKED_RESOURCE_TYPES = {"image", "media", "font"}
CLICK_TIMEOUT_MS = 4_000
WAIT_FOR_TIMEOUT_MS = 20_000

# Markers of bot-manager interstitials. Checked against <title> + the first 4 KB of visible text of the *rendered*
# page, so a challenge Chromium could not pass is reported as such instead of "0 items — selectors may be stale".
CHALLENGE_MARKERS: tuple[str, ...] = (
    "just a moment",  # Cloudflare
    "checking your browser",
    "verify you are human",
    "cf-browser-verification",
    "challenge-platform",
    "attention required! | cloudflare",
    "access denied",  # Akamai ("Access Denied ... Reference #18.xxxx")
    "reference #18.",
    "request unsuccessful. incapsula",  # Imperva
    "_incapsula_resource",
    "pardon our interruption",  # Distil / Imperva
    "radware",  # Radware Bot Manager
    "captcha-delivery.com",  # DataDome
    "challenge validation",  # gob.mx
    "please enable javascript and cookies",
    "bot verification",
)


class BrowserUnavailable(RuntimeError):
    """Playwright (or its Chromium build) is not installed in this image/venv."""


class BrowserChallenge(RuntimeError):
    """The rendered page is a bot-manager interstitial, not the listing."""


# --------------------------------------------------------------------------------------
# Browser lifecycle (one Playwright driver + Chromium per thread; contexts per source)
# --------------------------------------------------------------------------------------
_local = threading.local()
_sessions_lock = threading.Lock()
_sessions: set[BrowserSession] = set()


def _import_playwright():
    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import TimeoutError as PlaywrightTimeout
        from playwright.sync_api import sync_playwright
    except ImportError as exc:  # pragma: no cover - exercised via monkeypatch in tests
        raise BrowserUnavailable(UNAVAILABLE_MESSAGE) from exc
    return sync_playwright, PlaywrightError, PlaywrightTimeout


class BrowserSession:
    """A running Playwright driver and one headless Chromium. Use as a context manager or via `browser_session()`."""

    def __init__(self) -> None:
        self._pw_cm: Any = None
        self._pw: Any = None
        self._browser: Any = None
        self.errors: tuple[type[BaseException], type[BaseException]] | None = None
        self.pages_loaded = 0

    @property
    def started(self) -> bool:
        return self._browser is not None

    def start(self) -> BrowserSession:
        if self.started:
            return self
        sync_playwright, pw_error, pw_timeout = _import_playwright()
        self.errors = (pw_error, pw_timeout)
        self._pw_cm = sync_playwright()
        self._pw = self._pw_cm.__enter__()
        try:
            self._browser = self._pw.chromium.launch(
                headless=True, args=["--disable-blink-features=AutomationControlled"]
            )
        except pw_error as exc:
            self.close()
            text = str(exc)
            if "Executable doesn't exist" in text or "playwright install" in text:
                raise BrowserUnavailable(f"{UNAVAILABLE_MESSAGE} (run `playwright install chromium`)") from exc
            raise
        with _sessions_lock:
            _sessions.add(self)
        log.info("chromium launched (%s)", self._browser.version)
        return self

    def close(self) -> None:
        browser, self._browser = self._browser, None
        pw_cm, self._pw_cm = self._pw_cm, None
        self._pw = None
        with _sessions_lock:
            _sessions.discard(self)
        if browser is not None:
            with contextlib.suppress(Exception):
                browser.close()
        if pw_cm is not None:
            with contextlib.suppress(Exception):
                pw_cm.__exit__(None, None, None)

    @property
    def connected(self) -> bool:
        return bool(self._browser is not None and self._browser.is_connected())

    def __enter__(self) -> BrowserSession:
        return self.start()

    def __exit__(self, *exc: object) -> None:
        self.close()

    # -------------------------------------------------------------------------- page work
    @contextlib.contextmanager
    def context(self, **kwargs: Any) -> Iterator[Any]:
        ctx = self._browser.new_context(**kwargs)
        try:
            yield ctx
        finally:
            with contextlib.suppress(Exception):
                ctx.close()


def current_session() -> BrowserSession | None:
    return getattr(_local, "session", None)


@contextlib.contextmanager
def browser_session() -> Iterator[BrowserSession]:
    """Run a block with one shared Chromium for every browser fetch on this thread. Nested calls reuse the outer one."""
    existing = current_session()
    if existing is not None:
        yield existing
        return
    session = BrowserSession()
    _local.session = session
    try:
        yield session
    finally:
        _local.session = None
        session.close()


def shutdown_all() -> None:
    """Close every live session (atexit safety net; the normal path is the context manager)."""
    with _sessions_lock:
        live = list(_sessions)
    for s in live:
        s.close()


atexit.register(shutdown_all)


# --------------------------------------------------------------------------------------
# Challenge detection
# --------------------------------------------------------------------------------------
def detect_challenge(title: str, body_text: str, status: int | None) -> str | None:
    """Return the marker that identifies a bot-manager interstitial, or None when the page looks like content."""
    hay = f"{title}\n{body_text[:4000]}".lower()
    for marker in CHALLENGE_MARKERS:
        if marker in hay:
            # "access denied" appears in ordinary prose too; only trust it on a short page or an error status.
            if marker in ("access denied", "radware") and not (status in (401, 403, 429, 503) or len(body_text) < 1500):
                continue
            return marker
    return None


# --------------------------------------------------------------------------------------
# Adapter
# --------------------------------------------------------------------------------------
class BrowserAdapter(BaseAdapter):
    name = "browser"

    def fetch(self, source: Source, http_client: httpx.Client | None) -> FetchResult:  # http_client unused
        session = current_session()
        if session is not None:
            return self._fetch(session.start(), source)
        with BrowserSession() as own:
            return self._fetch(own, source)

    # ------------------------------------------------------------------------------ internals
    def _fetch(self, session: BrowserSession, source: Source) -> FetchResult:
        cfg = source.config or {}
        settings = get_settings()
        headers = {str(k): str(v) for k, v in (cfg.get("headers") or {}).items()}
        accept_language = headers.pop("Accept-Language", None) or headers.pop("accept-language", None)
        timeout_ms = int(cfg.get("timeout_ms") or settings.browser_timeout_seconds * 1000)
        wait_until = cfg.get("wait_until") or "networkidle"
        notes: list[str] = []
        assert session.errors is not None
        pw_error, pw_timeout = session.errors

        polite_delay(source.url)
        ctx_kwargs: dict[str, Any] = {
            "user_agent": cfg.get("user_agent") or settings.browser_user_agent or DEFAULT_USER_AGENT,
            "locale": (accept_language or DEFAULT_ACCEPT_LANGUAGE).split(",")[0].strip() or "en-US",
            "viewport": DEFAULT_VIEWPORT,
            "extra_http_headers": {"Accept-Language": accept_language or DEFAULT_ACCEPT_LANGUAGE, **headers},
            "ignore_https_errors": bool(cfg.get("ignore_https_errors", False)),
            "java_script_enabled": True,
        }
        with session.context(**ctx_kwargs) as ctx:
            ctx.set_default_timeout(timeout_ms)
            if cfg.get("block_resources", True):
                ctx.route(
                    "**/*",
                    lambda route: (
                        route.abort() if route.request.resource_type in BLOCKED_RESOURCE_TYPES else route.continue_()
                    ),
                )
            page = ctx.new_page()
            try:
                response = page.goto(source.url, wait_until=wait_until, timeout=timeout_ms)
            except pw_timeout:
                if wait_until == "networkidle":
                    # Analytics beacons can keep a page from ever going idle; what is loaded is usually complete.
                    notes.append("networkidle timeout; continuing with the loaded DOM")
                    response = None
                else:
                    raise
            status = response.status if response is not None else None
            final_url = page.url
            if final_url and final_url != source.url:
                notes.append(f"final URL {final_url}")

            if cfg.get("wait_for"):
                try:
                    page.wait_for_selector(cfg["wait_for"], timeout=min(timeout_ms, WAIT_FOR_TIMEOUT_MS))
                except pw_timeout:
                    notes.append(f"wait_for {cfg['wait_for']!r} did not appear; parsing what rendered")
            interacted = False
            for css in cfg.get("click") or []:
                try:
                    page.click(css, timeout=CLICK_TIMEOUT_MS)
                    interacted = True
                    notes.append(f"clicked {css!r}")
                except (pw_timeout, pw_error):
                    notes.append(f"click target {css!r} not found; skipped")
            for _ in range(int(cfg.get("scroll") or 0)):
                page.mouse.wheel(0, 20_000)
                page.wait_for_timeout(400)
                interacted = True
            settle = cfg.get("settle_ms")
            if settle is None and interacted:
                settle = 500
            if settle:
                page.wait_for_timeout(int(settle))

            title = page.title() or ""
            html = page.content()
            session.pages_loaded += 1
            if len(html.encode("utf-8", "ignore")) > MAX_RESPONSE_BYTES:
                raise ValueError(f"rendered page too large (> {MAX_RESPONSE_BYTES // 1_000_000} MB): {source.url}")
            try:
                body_text = page.inner_text("body", timeout=2_000)
            except (pw_timeout, pw_error):
                body_text = ""

        marker = detect_challenge(title, body_text, status)
        if marker:
            raise BrowserChallenge(
                f"bot-manager challenge page (marker {marker!r}, HTTP {status}) — headless Chromium is blocked too"
            )
        if status is not None and status >= 400:
            raise RuntimeError(f"HTTP {status} for {source.url} (rendered title {title[:80]!r})")

        items = filter_keywords(parse_listing(html, source), source)
        if not items:
            raise ValueError("browser adapter matched 0 items — selectors may be stale or the list did not render")
        return FetchResult(items=items, http_status=status, notes=notes)


__all__ = [
    "BrowserAdapter",
    "BrowserChallenge",
    "BrowserSession",
    "BrowserUnavailable",
    "UNAVAILABLE_MESSAGE",
    "browser_session",
    "current_session",
    "detect_challenge",
    "shutdown_all",
]
