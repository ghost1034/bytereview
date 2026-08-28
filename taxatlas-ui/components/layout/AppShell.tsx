import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "@/taxatlas-ui/lib/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/taxatlas-ui/lib/api";
import { useAuth } from "@/taxatlas-ui/lib/auth";
import { fmtInt } from "@/taxatlas-ui/lib/format";
import { cn } from "@/taxatlas-ui/lib/utils";
import { useTheme, type Theme } from "@/taxatlas-ui/hooks/useTheme";
import { Kbd, MOD } from "@/taxatlas-ui/components/ui/Kbd";
import { Popover } from "@/taxatlas-ui/components/ui/Popover";
import { Segmented } from "@/taxatlas-ui/components/ui/Segmented";
import { CommandPalette, openPalette } from "@/taxatlas-ui/components/CommandPalette";
import { WordmarkGlyph } from "@/taxatlas-ui/components/layout/Wordmark";
import { RouteErrorBoundary } from "@/taxatlas-ui/components/ErrorBoundary";

const NAV = [
  { to: "/map", label: "Map" },
  { to: "/overview", label: "Overview" },
  { to: "/jurisdictions", label: "Jurisdictions" },
  { to: "/regulations", label: "Regulations" },
  { to: "/court-decisions", label: "Courts" },
  { to: "/tariffs", label: "Tariffs" },
  { to: "/changes", label: "Changes" },
  { to: "/sources", label: "Sources" },
];

const LAST_SEEN_KEY = "ta.changes.lastSeen";

function initials(name: string | undefined | null, email: string | undefined | null): string {
  const src = (name && name.trim()) || email || "?";
  const parts = src.split(/[\s._@-]+/).filter(Boolean);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase();
}

function utcClock(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ageH = (Date.now() - d.getTime()) / 36e5;
  if (ageH < 24) return `${hh}:${mm} UTC`;
  return `${d.toISOString().slice(5, 10)} ${hh}:${mm} UTC`;
}

function useOnline(): boolean {
  const [on, setOn] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return on;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const loc = useLocation();
  const isMap = loc.pathname.startsWith("/map");
  const online = useOnline();
  const [theme, setTheme] = useTheme();

  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats.overview, refetchInterval: 60_000, staleTime: 30_000, enabled: !!user });
  const unread = useQuery({ queryKey: ["notifications", "unread"], queryFn: () => api.account.notifications(true), refetchInterval: 60_000, enabled: !!user });
  const unreadCount = unread.data?.length ?? 0;

  // Changes unseen since the last visit to /changes (mono count on the nav item).
  const [lastSeen, setLastSeen] = useState<string | null>(() => localStorage.getItem(LAST_SEEN_KEY));
  useEffect(() => {
    if (loc.pathname.startsWith("/changes")) {
      const now = new Date().toISOString();
      localStorage.setItem(LAST_SEEN_KEY, now);
      setLastSeen(now);
    }
  }, [loc.pathname]);
  const unseen = useQuery({
    queryKey: ["changes", "unseen", lastSeen],
    queryFn: () => api.changes.list({ since: lastSeen, limit: 1 }),
    enabled: !!user && !!lastSeen && !loc.pathname.startsWith("/changes"),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const unseenCount = lastSeen ? unseen.data?.total ?? 0 : stats.data?.changes_7d ?? 0;

  // Freshness: positive when last crawl < 24 h and ≥ 80 % sources enabled; attention otherwise; negative when the API fails.
  const s = stats.data;
  const ageH = s?.last_crawl_at ? (Date.now() - new Date(s.last_crawl_at).getTime()) / 36e5 : Infinity;
  const ratio = s && s.sources ? s.sources_enabled / s.sources : 0;
  const tone: "positive" | "attention" | "negative" | "unknown" = stats.isError ? "negative" : !s ? "unknown" : ageH < 24 && ratio >= 0.8 ? "positive" : "attention";
  const freshnessTitle = stats.isError ? "API unreachable" : s?.last_crawl_at ? `Last crawl ${new Date(s.last_crawl_at).toISOString().replace("T", " ").slice(0, 16)} UTC · ${s.sources_enabled} of ${s.sources} sources enabled` : "No crawl runs yet";

  return (
    <div className="flex h-full min-w-0 flex-col">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="bar">
        <Link to="/map" className="wordmark" aria-label="TaxAtlas home">
          <WordmarkGlyph />
          <span className="name">TaxAtlas</span>
        </Link>
        <nav aria-label="Primary" className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to}>
              {n.label}
              {n.to === "/changes" && unseenCount > 0 && !loc.pathname.startsWith("/changes") && (
                <span className="count" title={`${fmtInt(unseenCount)} changes since your last visit`}>
                  {fmtInt(unseenCount)}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="nav-menu text-sm text-ink-2 hover:text-ink-1" onClick={() => openPalette(">")}>
          Menu
        </button>
        <button type="button" className="search" onClick={() => openPalette()} aria-label="Search" title={`Search (${MOD}K)`}>
          <svg viewBox="0 0 16 16" fill="none" strokeWidth="1.75" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" />
          </svg>
          <span className="truncate">Search jurisdictions, regulations, cases…</span>
          <Kbd>{MOD}K</Kbd>
        </button>
        <div className="bar-right">
          <Link to="/sources" className="freshness" title={freshnessTitle}>
            <span className="dot" data-tone={tone} aria-hidden="true" />
            {stats.isError ? (
              <span>API unreachable</span>
            ) : s?.last_crawl_at ? (
              <>
                <span>
                  Crawled <span className="num">{utcClock(s.last_crawl_at)}</span>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <span className="num">
                    {s.sources_enabled}/{s.sources}
                  </span>{" "}
                  sources
                </span>
              </>
            ) : (
              <span>{s ? "No crawl yet" : "Checking sources…"}</span>
            )}
          </Link>
          <a href="/api/docs" target="_blank" rel="noreferrer" className="text-xs text-ink-3 no-underline hover:text-ink-1">
            API docs
          </a>
          <Popover
            align="end"
            width={240}
            trigger={({ props }) => (
              <button type="button" className="user" {...props} aria-label={`Account menu — ${user?.full_name ?? user?.email ?? ""}`} title="Account menu">
                <span className="avatar" aria-hidden="true">
                  {initials(user?.full_name, user?.email)}
                </span>
                <span className="max-w-[160px] truncate">{user?.full_name ?? user?.email}</span>
                {unreadCount > 0 && (
                  <span className="mono text-2xs text-ink-3" title={`${unreadCount} unread notifications`}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            )}
          >
            {({ close }) => (
              <div className="flex flex-col">
                <div className="px-2 pt-1.5 pb-2">
                  <div className="truncate text-sm text-ink-1">{user?.full_name}</div>
                  <div className="mono truncate text-xs text-ink-3">{user?.email}</div>
                  <div className="mt-0.5 text-xs text-ink-3">
                    {user?.role}
                    {user?.organization ? ` · ${user.organization}` : ""}
                    {" · CPAAutomation identity"}
                  </div>
                </div>
                <div className="menu-sep" />
                <Link to="/account" className="menu-item" onClick={close}>
                  Account
                </Link>
                <Link to="/account?tab=notifications" className="menu-item" onClick={close}>
                  Notifications
                  <span className="meta">{unreadCount > 0 ? `${fmtInt(unreadCount)} unread` : "none unread"}</span>
                </Link>
                <Link to="/account?tab=quickstart" className="menu-item" onClick={close}>
                  API quickstart
                </Link>
                <div className="menu-sep" />
                <div className="menu-head">Theme</div>
                <div className="px-2 pb-1.5">
                  <Segmented<Theme>
                    ariaLabel="Theme"
                    value={theme}
                    onChange={setTheme}
                    options={[
                      { value: "dark", label: "Dark" },
                      { value: "light", label: "Light" },
                      { value: "auto", label: "Auto" },
                    ]}
                  />
                </div>
              </div>
            )}
          </Popover>
        </div>
      </header>
      {!online && (
        <div className="offline" role="status">
          Offline — showing cached data{s?.last_crawl_at ? <> from <span className="mono ml-1">{utcClock(s.last_crawl_at)}</span></> : ""}.
        </div>
      )}
      <main id="main" tabIndex={-1} className={cn("min-h-0 flex-1 outline-none", isMap ? "relative overflow-hidden" : "overflow-y-auto")}>
        <RouteErrorBoundary>
          {children}
        </RouteErrorBoundary>
      </main>
      <CommandPalette />
    </div>
  );
}
