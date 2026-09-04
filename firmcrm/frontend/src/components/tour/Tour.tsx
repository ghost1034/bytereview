/* Guided product tour ("Demo now"). Navigates the real app, spotlights the element for each step and explains it.
   Auto-plays (7s/step), with Next / Back / Skip, ← → Esc keys, and pauses while the pointer is over the card. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Pause, Play, X } from "lucide-react";
import { conflictsApi, oppsApi } from "@/api";
import { Button, cn } from "@/components/ui";
import { useAuth } from "@/lib/auth";

type Ctx = { oppId: number | null; accountId: number | null; isManager: boolean };
type Step = { route: (c: Ctx) => string; target: string; title: string; body: string; skip?: (c: Ctx) => boolean; placement?: "bottom" | "top" | "right" | "left" };

const STEPS: Step[] = [
  { route: () => "/", target: "[data-tour=nav]", title: "One workspace for the whole firm", body: "Pipeline (leads, opportunities, clearance, engagements) and Firm (accounts, contacts, campaigns, reports) sit in one place. Managers and admins also see Data and Admin.", placement: "right" },
  { route: () => "/", target: "[data-tour=kpis]", title: "Numbers you can trust", body: "Open and weighted pipeline, what was won this quarter against the same point last quarter, what closes in 30 days, and what needs attention: stale pursuits and pending clearances." },
  { route: () => "/", target: "[data-tour=pipeline-chart]", title: "Pipeline by stage", body: "Amount and probability-weighted value per stage, with a totals row. Every figure is computed live from the records — nothing is hand-keyed." },
  { route: () => "/opportunities", target: "main [draggable]", title: "The pursuit board", body: "Each card is a matter being pursued. The shield shows clearance state, the amber edge marks a stale pursuit, and the avatar is the owner. Drag cards between stages." , placement: "right" },
  { route: () => "/opportunities", target: "[data-tour=drop-won]", title: "Closed Won is gated", body: "A pursuit can only be won once the conflict or independence check is cleared and the engagement letter is signed. Drop a card here and the app tells you exactly what is still missing.", placement: "top" },
  { route: (c) => `/opportunities/${c.oppId}`, target: "[data-tour=stage-rail]", title: "Stage rail with gates", body: "Completed stages in accent, the current stage with its probability and days in stage, and a lock wherever a gate is unmet. Click a stage to move the pursuit." },
  { route: (c) => `/opportunities/${c.oppId}`, target: "[data-tour=clearance-card]", title: "Conflict and independence checks", body: "Checks search every client, alias, contact and adverse party the firm has ever recorded. Matches route to a manager; waiving a conflict needs a partner and a documented basis — all of it audited.", placement: "left" },
  { route: (c) => `/opportunities/${c.oppId}`, target: "[data-tour=closed-won]", title: "The gate, enforced", body: "This button stays disabled until the check is cleared or waived and the engagement letter is signed. Winning creates the engagement, flips the account to client, and logs every step.", placement: "bottom" },
  { route: () => "/clearance", target: "main h1", title: "The clearance queue", body: "Every pending check across the firm in one list, with an ad-hoc search for quick conflict lookups before intake." },
  { route: (c) => `/accounts/${c.accountId}`, target: "[data-tour=wall-panel]", title: "Ethical walls", body: "A partner can wall off an account or a single matter to a named team. Everyone else sees nothing — not in lists, search or exports — while conflict search still flags the party as a restricted matter.", placement: "left" },
  { route: () => "/engagements", target: "main table", title: "Won work becomes engagements", body: "Closed Won creates exactly one engagement per matter, with a reference for your practice-management or PSA system. Reopen or lose the pursuit and the engagement follows." },
  { route: () => "/reports", target: "[data-tour=report-tabs]", title: "Origination and referrals", body: "Win/loss, practice-area performance, origination credit by partner and the referral sources that actually send work — all from the same records." },
  { route: () => "/data", target: "[data-tour=import-card]", title: "Bring your data", body: "Import accounts, contacts and leads from CSV with a dry run and a row-level exception report; export any list. Nothing is written until you commit.", skip: (c) => !c.isManager },
  { route: () => "/", target: "[data-tour=search]", title: "That is the tour", body: "Search anything with ⌘K, and replay this walkthrough any time from the Demo button. Demo logins for every role are on the sign-in page.", placement: "bottom" },
];

interface TourApi { active: boolean; index: number; total: number; autoplay: boolean; start: () => void; stop: () => void; next: () => void; back: () => void; toggleAutoplay: () => void }
const TourCtx = createContext<TourApi | null>(null);
export const useTour = () => { const c = useContext(TourCtx); if (!c) throw new Error("useTour outside provider"); return c; };
export const TOUR_AUTOSTART_KEY = "firmcrm.tour.autostart";
export const TOUR_DONE_KEY = "firmcrm.tour.done";

export function TourProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const { user, atLeast } = useAuth();
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [ctx, setCtx] = useState<Ctx>({ oppId: null, accountId: null, isManager: false });
  const steps = useMemo(() => STEPS.filter((s) => !s.skip?.(ctx)), [ctx]);

  const resolve = useCallback(async (): Promise<Ctx> => {
    const isManager = atLeast("manager");
    try {
      const pending = await conflictsApi.list({ status: "pending", limit: 1 });
      let oppId = pending.items[0]?.opportunity_id ?? null;
      let accountId = pending.items[0]?.account_id ?? null;
      if (!oppId) {
        const open = await oppsApi.list({ status: "open", limit: 1 });
        oppId = open.items[0]?.id ?? null; accountId = open.items[0]?.account_id ?? null;
      }
      return { oppId, accountId, isManager };
    } catch { return { oppId: null, accountId: null, isManager }; }
  }, [atLeast]);

  const start = useCallback(async () => { const c = await resolve(); setCtx(c); setIndex(0); setAutoplay(true); setActive(true); }, [resolve]);
  const stop = useCallback(() => { setActive(false); localStorage.setItem(TOUR_DONE_KEY, "1"); }, []);
  const next = useCallback(() => setIndex((i) => { if (i + 1 >= steps.length) { setActive(false); localStorage.setItem(TOUR_DONE_KEY, "1"); return i; } return i + 1; }), [steps.length]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const toggleAutoplay = useCallback(() => setAutoplay((a) => !a), []);

  // Autostart after "Demo now" on the login page.
  useEffect(() => { if (user && localStorage.getItem(TOUR_AUTOSTART_KEY)) { localStorage.removeItem(TOUR_AUTOSTART_KEY); void start(); } }, [user, start]);
  // Navigate for the current step.
  const step = active ? steps[Math.min(index, steps.length - 1)] : undefined;
  const { pathname } = useLocation();
  useEffect(() => { if (step) { const r = step.route(ctx); if (r && r !== pathname && !r.includes("null")) nav(r); } }, [step, ctx, nav, pathname]);
  // Steps whose record could not be resolved are skipped.
  useEffect(() => { if (step && step.route(ctx).includes("null")) next(); }, [step, ctx, next]);

  const api = useMemo<TourApi>(() => ({ active, index, total: steps.length, autoplay, start: () => void start(), stop, next, back, toggleAutoplay }), [active, index, steps.length, autoplay, start, stop, next, back, toggleAutoplay]);
  return <TourCtx.Provider value={api}>{children}{active && step && <TourOverlay step={step} ctx={ctx} />}</TourCtx.Provider>;
}

function TourOverlay({ step, ctx }: { step: Step; ctx: Ctx }) {
  const { index, total, autoplay, next, back, stop, toggleAutoplay } = useTour();
  const { pathname } = useLocation();
  const onRoute = step.route(ctx) === pathname;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [hover, setHover] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Locate the target (poll briefly while the page loads), scroll it into view, track its rect.
  useEffect(() => {
    // Only look for the target once the step's route is the current one — the same selector (e.g. `main h1`)
    // would otherwise match the page we are navigating away from.
    setRect(null);
    if (!onRoute) return;
    let cancelled = false; let tries = 0; let el: Element | null = null;
    const measure = () => { if (el && el.isConnected) setRect(el.getBoundingClientRect()); else if (!cancelled) find(); };
    const find = () => {
      el = document.querySelector(step.target);
      if (el) { el.scrollIntoView({ block: "center", inline: "nearest" }); setTimeout(measure, 60); return; }
      if (!cancelled && tries++ < 40) setTimeout(find, 100); else if (!cancelled) setRect(null);
    };
    find();
    const tick = setInterval(measure, 400);  // follow late layout shifts (fonts, data loading)
    window.addEventListener("resize", measure); window.addEventListener("scroll", measure, true);
    return () => { cancelled = true; clearInterval(tick); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [step, onRoute]);
  // Autoplay (pauses while hovering the card).
  useEffect(() => { if (!autoplay || hover) return; const t = setTimeout(next, 7000); return () => clearTimeout(t); }, [autoplay, hover, index, next]);
  // Keys.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") stop(); else if (e.key === "ArrowRight" || e.key === "Enter") next(); else if (e.key === "ArrowLeft") back(); };
    window.addEventListener("keydown", h, true); return () => window.removeEventListener("keydown", h, true);
  }, [next, back, stop]);

  const pad = 6, W = 360, vw = window.innerWidth, vh = window.innerHeight;
  const spot = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  const place = step.placement ?? "bottom";
  let cardStyle: React.CSSProperties = { left: Math.max(16, (vw - W) / 2), top: vh - 220 };
  if (spot) {
    const below = spot.top + spot.height + 12, above = spot.top - 12;
    if (place === "right" && spot.left + spot.width + W + 24 < vw) cardStyle = { left: spot.left + spot.width + 12, top: Math.min(Math.max(16, spot.top), vh - 220) };
    else if (place === "left" && spot.left - W - 24 > 0) cardStyle = { left: spot.left - W - 12, top: Math.min(Math.max(16, spot.top), vh - 220) };
    else if (place === "top" || (place === "bottom" && below + 200 > vh)) cardStyle = { left: Math.min(Math.max(16, spot.left), vw - W - 16), top: Math.max(16, above - 190) };
    else cardStyle = { left: Math.min(Math.max(16, spot.left), vw - W - 16), top: Math.min(below, vh - 210) };
  }
  return (
    <div data-testid="tour" className="pointer-events-none fixed inset-0 z-[80]">
      {spot ? <div data-testid="tour-spotlight" className="absolute rounded-lg ring-2 ring-accent-400 transition-[left,top,width,height] duration-200" style={{ ...spot, boxShadow: "0 0 0 9999px rgba(26,25,22,.45)" }} />
            : <div className="absolute inset-0 bg-sand-900/45" />}
      <div ref={cardRef} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} role="dialog" aria-label={`Tour step ${index + 1} of ${total}`}
           className="pointer-events-auto absolute w-[360px] rounded-xl border border-sand-150 bg-sand-0 p-4 shadow-modal" style={cardStyle}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-[11px] leading-4 font-medium text-sand-500 num">Step {index + 1} of {total}</div>
          <button type="button" onClick={stop} aria-label="End tour" className="grid h-6 w-6 place-items-center rounded-md text-sand-500 hover:bg-sand-100 hover:text-sand-900"><X size={14} /></button>
        </div>
        <div className="mt-1 text-[15px] leading-[22px] font-semibold tracking-[-0.01em] text-sand-900">{step.title}</div>
        <p className="mt-1.5 text-[13px] leading-5 text-sand-700">{step.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button type="button" onClick={toggleAutoplay} aria-pressed={autoplay} title={autoplay ? "Pause auto-play" : "Resume auto-play"} className={cn("inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] leading-4 font-medium", autoplay ? "bg-sand-100 text-sand-900" : "text-sand-600 hover:bg-sand-100")}>
              {autoplay ? <Pause size={12} /> : <Play size={12} />}{autoplay ? "Auto" : "Paused"}
            </button>
            <div className="ml-2 flex items-center gap-1" aria-hidden>{Array.from({ length: total }).map((_, i) => <span key={i} className={cn("h-1 w-1 rounded-full", i <= index ? "bg-accent-600" : "bg-sand-200")} />)}</div>
          </div>
          <div className="flex items-center gap-2">
            {index > 0 && <Button size="sm" variant="ghost" onClick={back}>Back</Button>}
            <Button size="sm" variant="primary" onClick={next} data-testid="tour-next">{index + 1 >= total ? "Finish" : "Next"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Top-bar entry point. */
export function DemoNowButton({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  const { start, active } = useTour();
  return <Button size={size} variant="secondary" onClick={start} disabled={active} className={className} data-tour="demo-now"><Play size={13} />Demo now</Button>;
}
