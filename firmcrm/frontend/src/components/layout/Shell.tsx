import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, Target, Kanban, ShieldCheck, Briefcase, Megaphone, BarChart3, Settings, LayoutDashboard, CheckSquare, LogOut, Search, Database, UserCog, ChevronDown, type LucideIcon, Play } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { DemoNowButton, useTour } from "@/components/tour/Tour";
import { accountsApi, contactsApi, oppsApi } from "@/api";
import { OverflowMenu, cn } from "@/components/ui";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { initials, titleCase } from "@/lib/format";

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };
type NavGroup = { label?: string; items: NavItem[]; managerOnly?: boolean };

const NAV: NavGroup[] = [
  { items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/tasks", label: "My Tasks", icon: CheckSquare },
  ] },
  { label: "Pipeline", items: [
    { to: "/leads", label: "Leads", icon: Target },
    { to: "/opportunities", label: "Opportunities", icon: Kanban },
    { to: "/clearance", label: "Clearance", icon: ShieldCheck },
    { to: "/engagements", label: "Engagements", icon: Briefcase },
  ] },
  { label: "Firm", items: [
    { to: "/accounts", label: "Accounts", icon: Building2 },
    { to: "/contacts", label: "Contacts", icon: Users },
    { to: "/campaigns", label: "Campaigns", icon: Megaphone },
    { to: "/reports", label: "Reports", icon: BarChart3 },
  ] },
  { label: "Admin", managerOnly: true, items: [
    { to: "/data", label: "Data", icon: Database },
    { to: "/admin", label: "Admin", icon: Settings },
  ] },
];

/** Routes whose content is capped at 1344px (§5): Dashboard, detail pages, Settings, Data, Reports. Lists and the board stay full width. */
const isConstrained = (pathname: string) =>
  pathname === "/" || pathname === "/settings" || pathname === "/data" || pathname === "/reports" || /^\/(accounts|contacts|opportunities)\/[^/]+$/.test(pathname);

/** Resolve "Group / Page" for the top-bar title area from the current route. */
function useCrumb() {
  const { pathname } = useLocation();
  if (pathname === "/settings") return { group: null, page: "Settings" };
  const seg = "/" + (pathname.split("/")[1] ?? "");
  for (const g of NAV) for (const i of g.items) if (i.to === seg) return { group: g.label ?? null, page: i.label };
  return { group: null, page: "Dashboard" };
}

/** Global search (§6.2). In `compact` mode (icon rail) it is a 28px icon button that reveals and focuses the field; ⌘K does the same. */
function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const enabled = q.trim().length >= 2;
  const accounts = useQuery({ queryKey: ["search", "accounts", q], queryFn: () => accountsApi.list({ q, limit: 5 }), enabled });
  const contacts = useQuery({ queryKey: ["search", "contacts", q], queryFn: () => contactsApi.list({ q, limit: 5 }), enabled });
  const opps = useQuery({ queryKey: ["search", "opps", q], queryFn: () => oppsApi.list({ q, status: "all", limit: 5 }), enabled });
  const showField = !compact || revealed;
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(false); if (compact && !q) setRevealed(false); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [compact, q]);
  useEffect(() => {
    // ⌘K / Ctrl+K focuses (and in compact mode reveals) the search field.
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setRevealed(true); setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => { if (compact && revealed) requestAnimationFrame(() => inputRef.current?.focus()); }, [compact, revealed]);
  const go = (path: string) => { setOpen(false); setQ(""); setRevealed(false); nav(path); };
  const groups = [
    { label: "Accounts", items: (accounts.data?.items ?? []).map((a) => ({ id: a.id, label: a.name, sub: titleCase(a.account_type), path: `/accounts/${a.id}` })) },
    { label: "Contacts", items: (contacts.data?.items ?? []).map((c) => ({ id: c.id, label: c.full_name, sub: c.account_name ?? "", path: `/contacts/${c.id}` })) },
    { label: "Opportunities", items: (opps.data?.items ?? []).map((o) => ({ id: o.id, label: o.name, sub: o.stage_name ?? "", path: `/opportunities/${o.id}` })) },
  ].filter((g) => g.items.length);
  if (!showField) {
    return (
      <button type="button" onClick={() => setRevealed(true)} aria-label="Search (⌘K)" title="Search (⌘K)"
              className="grid h-7 w-7 place-items-center rounded-md text-sand-600 transition-colors duration-[120ms] hover:bg-sand-100 hover:text-sand-900">
        <Search size={16} />
      </button>
    );
  }
  return (
    <div ref={ref} className="relative w-[320px]">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sand-400" />
      <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
             onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); if (compact && !q) setRevealed(false); (e.target as HTMLInputElement).blur(); } }}
             placeholder="Search…" aria-label="Search accounts, contacts, opportunities" className="field pl-8 pr-12" />
      <kbd className="mono pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-[4px] border border-sand-150 bg-sand-25 px-1 text-[11px] leading-4 text-sand-500">⌘K</kbd>
      {open && enabled && (
        <div className="menu-in absolute right-0 z-dropdown mt-1.5 max-h-[420px] w-full min-w-[480px] overflow-auto rounded-lg border border-sand-150 bg-sand-0 py-1 shadow-menu">
          {groups.length === 0 && <div className="px-3 py-3 text-[12px] text-sand-500">No matches</div>}
          {groups.map((g) => (
            <div key={g.label}>
              <div className="px-3 pt-2.5 pb-1 text-[11px] leading-4 font-medium text-sand-500">{g.label}</div>
              {g.items.map((i) => (
                <button key={i.id} type="button" onClick={() => go(i.path)} className="flex h-9 w-full items-center justify-between gap-3 px-3 text-left hover:bg-sand-50">
                  <span className="truncate text-sand-900">{i.label}</span><span className="shrink-0 text-[12px] text-sand-500">{i.sub}</span>
                </button>
              ))}
            </div>))}
        </div>
      )}
    </div>
  );
}

/** Nav item (§6.1). Focus ring is set explicitly: Tailwind's preflight gives anchors `outline-color: currentColor`, which would otherwise win over the base rule. */
function NavEntry({ item, rail }: { item: NavItem; rail: boolean }) {
  return (
    <NavLink to={item.to} end={item.end} title={rail ? item.label : undefined} aria-label={rail ? item.label : undefined} className={({ isActive }) => cn(
      "flex h-8 items-center rounded-md text-[13px] font-medium no-underline hover:no-underline transition-colors duration-[120ms]",
      "focus-visible:outline-2 focus-visible:outline-accent-600 focus-visible:-outline-offset-2",
      rail ? "w-10 justify-center" : "gap-2.5 pl-2.5 pr-2",
      isActive ? "bg-sand-100 font-semibold text-sand-900 [&_svg]:text-sand-900" : "text-sand-700 hover:bg-sand-100 hover:text-sand-900 [&_svg]:text-sand-500",
    )}>
      <item.icon size={16} strokeWidth={1.5} />{!rail && item.label}
    </NavLink>
  );
}

export default function Shell() {
  const { user, logout, atLeast } = useAuth();
  const crumb = useCrumb();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const rail = useMediaQuery("(max-width: 1179px)");
  const board = pathname === "/opportunities";
  const today = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const tour = useTour();
  const userMenu = [
    { label: "Account settings", icon: <UserCog />, onSelect: () => nav("/settings") },
    { label: "Replay demo tour", icon: <Play />, onSelect: () => tour.start() },
    { label: "Sign out", icon: <LogOut />, onSelect: () => logout() },
  ];
  return (
    <div className="flex h-full bg-sand-50">
      <aside className={cn("flex shrink-0 flex-col bg-sand-50 pt-3 pb-3", rail ? "w-14 items-center px-2" : "w-[232px] pl-4 pr-3")} aria-label="Primary">
        <div className={cn("flex h-10 items-center gap-2.5 rounded-md", rail ? "w-10 justify-center" : "px-2")} title={rail ? "FirmCRM" : undefined}>
          <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-sand-900 text-[12px] font-bold text-white">F</div>
          {!rail && <><div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-sand-900">FirmCRM</div><ChevronDown size={14} className="text-sand-500" /></>}
        </div>
        <nav data-tour="nav" className={cn("mt-5 flex-1 overflow-y-auto", rail && "w-full")}>
          {NAV.filter((g) => !g.managerOnly || atLeast("manager")).map((g, gi) => (
            <div key={g.label ?? gi} className={cn("space-y-0.5", rail && "flex flex-col items-center")}>
              {g.label && (rail
                ? <div className="my-2 h-px w-6 bg-sand-150" role="separator" aria-label={g.label} />
                : <div className="px-2.5 pt-4 pb-1.5 text-[11px] leading-4 font-medium text-sand-500">{g.label}</div>)}
              {g.items.map((i) => <NavEntry key={i.to} item={i} rail={rail} />)}
            </div>
          ))}
        </nav>
        {/* User block (§6.1): name flex-1 min-w-0; Settings + Sign out collapse into a ⋯ menu shown on hover / focus-within. */}
        <div className={cn("group mt-3 flex items-center border-t border-sand-150 pt-3", rail ? "w-10 flex-col gap-1.5 justify-center" : "gap-2.5 px-2")}>
          <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sand-200 text-[10px] font-semibold text-sand-700" title={rail ? `${user?.full_name} · ${titleCase(user?.role)}` : undefined}>{user ? initials(user.full_name) : "?"}</div>
          {!rail && <div className="min-w-0 flex-1"><div className="truncate text-[12px] leading-4 font-medium text-sand-900">{user?.full_name}</div><div className="truncate text-[11px] leading-4 text-sand-500">{titleCase(user?.role)}</div></div>}
          <OverflowMenu items={userMenu} label="Account menu" side="top" align={rail ? "start" : "end"}
                        className={cn("transition-opacity duration-[120ms]", !rail && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[open]:opacity-100")}
                        buttonClassName="text-sand-500" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-topbar flex h-[52px] shrink-0 items-center justify-between gap-4 bg-sand-50 px-8">
          <div className="flex min-w-0 items-center text-[12px] leading-4 text-sand-500">
            {crumb.group && <><span>{crumb.group}</span><span className="mx-2 text-sand-300">/</span></>}
            <span className="truncate font-medium text-sand-900">{crumb.page}</span>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div data-tour="search"><GlobalSearch compact={rail} /></div>
            <DemoNowButton size="sm" />
            <div className="text-[12px] leading-4 text-sand-500 num">{today}</div>
          </div>
        </header>
        <main className={cn("flex-1 overflow-auto", board ? "px-6 pt-5 pb-6" : "px-8 pt-6 pb-10")}>
          {isConstrained(pathname) ? <div className="max-w-[1344px]"><Outlet /></div> : <Outlet />}
        </main>
      </div>
    </div>
  );
}
