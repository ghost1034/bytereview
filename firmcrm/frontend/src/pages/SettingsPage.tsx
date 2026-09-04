import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LogOut, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authApi } from "@/api";
import { ApiError, tokenStore } from "@/api/client";
import type { SessionInfo } from "@/api/types";
import { Button, Card, Empty, Field, Input, PageHeader, Spinner } from "@/components/ui";
import { useFieldValidation } from "@/components/ui/Form";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";
import { Dash } from "@/components/ui/cells";

const PASSWORD_HINT = "At least 12 characters with letters and digits; must not contain your email name.";
const SESSIONS_SHOWN = 10;

/** Friendly "Chrome · macOS" label from a raw user-agent string (QA #12). Falls back to the first token. */
export function friendlyAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari"
    : /curl|python|node|httpx|axios|postman|insomnia/i.test(ua) ? "API client" : ua.split(/[\s/]/)[0] || "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : null;
  return os ? `${browser} · ${os}` : browser;
}

/** Inline validation via useFieldValidation (§6.10; QA #4, #23): required, 12-char policy, and confirm mismatch — no toasts for client-side errors. */
export function ChangePasswordForm({ forced = false, onDone, autoFocus = false }: { forced?: boolean; onDone?: () => void; autoFocus?: boolean }) {
  const { setUser } = useAuth(); const { toast, error } = useToast();
  const [values, setValues] = useState({ current: "", next: "", confirm: "" });
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const rules = useMemo(() => ({
    current: (v: unknown) => (typeof v === "string" && v ? null : "Enter your current password."),
    next: (v: unknown) => { const s = typeof v === "string" ? v : ""; if (!s) return "Enter a new password."; if (s.length < 12 || !/[A-Za-z]/.test(s) || !/\d/.test(s)) return "At least 12 characters with letters and digits."; return null; },
    confirm: (v: unknown, all: typeof values) => (typeof v === "string" && v ? (v === all.next ? null : "New passwords do not match.") : "Re-enter the new password."),
  }), []);
  const fv = useFieldValidation(values, rules);
  // A wrong current password is a field error (400 `invalid_current_password`), not session expiry; the form stays put (flows QA #3).
  const [currentErr, setCurrentErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => authApi.changePassword(values.current, values.next),
    onSuccess: (r) => { tokenStore.set(r.access_token, r.refresh_token); setUser(r.user); toast("Password changed. Other sessions were signed out."); setValues({ current: "", next: "", confirm: "" }); fv.reset(); onDone?.(); },
    onError: (e) => {
      if (e instanceof ApiError && (e.code === "invalid_current_password" || e.code === "invalid_credentials" || e.status === 401)) { setCurrentErr("Current password is incorrect."); return; }
      error(e);
    },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); fv.touchAll(); if (!fv.valid) return; m.mutate(); };
  return (
    <form onSubmit={submit} noValidate className="max-w-sm space-y-4">
      {forced && <div className="flex items-start gap-1.5 text-[12px] leading-4 text-warn-700"><AlertTriangle size={14} className="mt-px shrink-0 text-warn-600" aria-hidden /><span>Your password was set by an administrator. Choose a new one to continue.</span></div>}
      <Field label="Current password" error={fv.shown("current") ?? currentErr} errorId={fv.errorId("current")}>
        <Input type="password" value={values.current} onChange={(e) => { setCurrentErr(null); set("current")(e); }} autoComplete="current-password" autoFocus={autoFocus} {...fv.fieldProps("current")}
               aria-invalid={fv.shown("current") || currentErr ? true : undefined} aria-describedby={fv.shown("current") || currentErr ? fv.errorId("current") : undefined} />
      </Field>
      <Field label="New password" hint={PASSWORD_HINT} error={fv.shown("next")} errorId={fv.errorId("next")}><Input type="password" value={values.next} onChange={set("next")} autoComplete="new-password" {...fv.fieldProps("next")} /></Field>
      <Field label="Confirm new password" error={fv.shown("confirm")} errorId={fv.errorId("confirm")}><Input type="password" value={values.confirm} onChange={set("confirm")} autoComplete="new-password" {...fv.fieldProps("confirm")} /></Field>
      <Button variant="primary" type="submit" disabled={m.isPending}>{m.isPending ? "Saving…" : "Change password"}</Button>
    </form>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient(); const { user, logout } = useAuth(); const { toast, error } = useToast(); const confirm = useConfirm();
  const [showAll, setShowAll] = useState(false);
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: authApi.sessions });
  const revoke = useMutation({ mutationFn: (id: number) => authApi.revokeSession(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["sessions"] }); toast("Session revoked"); }, onError: error });
  const all = useMutation({ mutationFn: authApi.logoutAll, onSuccess: async () => { toast("All sessions signed out"); await logout(); }, onError: error });
  const signOutEverywhere = async () => {
    const ok = await confirm({ title: "Sign out everywhere?", body: "Every device, including this one, is signed out and will need to sign in again.", confirmLabel: "Sign out everywhere" });
    if (ok) all.mutate();
  };
  const list: SessionInfo[] = sessions.data ?? [];
  const shown = showAll ? list : list.slice(0, SESSIONS_SHOWN);
  const hidden = list.length - shown.length;
  return (
    <div>
      <PageHeader title="Account settings" subtitle={<>{user?.full_name} · {user?.email} · {titleCase(user?.role)}</>} />
      <div className="grid grid-cols-2 items-start gap-4">
        <Card title="Change password"><ChangePasswordForm /></Card>
        <Card title={<>Active sessions{list.length > 0 && <span className="mono ml-1.5 text-[11px] text-sand-500">{list.length}</span>}</>} padded={false} actions={<Button size="sm" variant="danger" onClick={signOutEverywhere} disabled={all.isPending}><LogOut size={12} />Sign out everywhere</Button>}>
          {sessions.isLoading ? <Spinner /> : !list.length ? <Empty title="No active sessions" /> : <table className="tbl table-fixed"><thead><tr><th style={{ width: 170 }}>Started</th><th style={{ width: 120 }}>Expires</th><th style={{ width: 130 }}>IP</th><th>Client</th><th style={{ width: 48 }}></th></tr></thead>
            <tbody>{shown.map((s) => <tr key={s.id}>
              <td className="num whitespace-nowrap">{fmtDateTime(s.created_at)}</td><td className="num whitespace-nowrap text-sand-600">{fmtDate(s.expires_at)}</td><td className="mono whitespace-nowrap text-sand-700">{s.ip ?? <Dash />}</td>
              <td><span className="block truncate whitespace-nowrap text-sand-700" title={s.user_agent ?? ""}>{friendlyAgent(s.user_agent) ?? <Dash />}</span></td>
              <td className="!pl-0 text-right"><Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)} aria-label="Revoke session" className="!px-1.5"><X size={14} /></Button></td></tr>)}</tbody></table>}
          {(hidden > 0 || showAll) && list.length > SESSIONS_SHOWN && (
            <div className="flex h-11 items-center justify-between border-t border-sand-150 px-4 text-[12px] leading-4 text-sand-500">
              <span className="num">{showAll ? `All ${list.length} sessions` : `${shown.length} of ${list.length} sessions`}</span>
              <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show fewer" : `Show all ${list.length}`}</Button>
            </div>)}
          <div className="border-t border-sand-150 px-5 py-2.5 text-[12px] leading-4 text-sand-500">Each session is a refresh token. Revoking a session signs that device out immediately."Sign out everywhere" to end every session at once.</div>
        </Card>
      </div>
    </div>
  );
}

/** Forced first-sign-in password change: reuses the login frame (brand block + 28px display title; QA #23). */
export function ForcedPasswordChangePage() {
  const { logout } = useAuth(); const nav = useNavigate();
  return (
    <div className="grid h-full place-items-center bg-sand-50 p-6">
      <div className="w-[380px]">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-sand-900 text-[13px] font-bold text-white">F</div>
          <div className="text-[15px] font-semibold tracking-[-0.01em] text-sand-900">FirmCRM</div>
        </div>
        <div className="card p-6">
          <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] text-sand-900">Set a new password</h1>
          <p className="mt-1 text-[12px] leading-4 text-sand-500">You are signed in as a new user. Pick a password only you know.</p>
          <div className="mt-5"><ChangePasswordForm forced autoFocus onDone={() => nav("/", { replace: true })} /></div>
          <div className="mt-4 flex justify-start"><Button size="sm" variant="ghost" onClick={() => logout()}><LogOut size={12} />Sign out instead</Button></div>
        </div>
      </div>
    </div>
  );
}
