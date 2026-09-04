import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { TOUR_AUTOSTART_KEY } from "@/components/tour/Tour";
import { Play } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";

const DEMO = [["admin@demo.firm", "Admin"], ["partner.lit@demo.firm", "Litigation partner"], ["partner.audit@demo.firm", "Audit partner"], ["manager@demo.firm", "Manager"], ["staff@demo.firm", "Staff"], ["marketing@demo.firm", "Marketing"]];

export default function LoginPage() {
  const { login, sessionNotice } = useAuth();
  const [email, setEmail] = useState("admin@demo.firm");
  const [password, setPassword] = useState("Demo1234!Demo");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await login(email, password); } catch (e) { setErr(e instanceof Error ? e.message : "Login failed"); } finally { setBusy(false); }
  };
  const demoNow = async () => {
    setBusy(true); setErr(null);
    try { localStorage.setItem(TOUR_AUTOSTART_KEY, "1"); await login("admin@demo.firm", "Demo1234!Demo"); }
    catch (e) { localStorage.removeItem(TOUR_AUTOSTART_KEY); setErr(e instanceof Error ? e.message : "Could not start the demo"); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid h-full place-items-center bg-sand-50 p-6">
      <div className="w-[380px]">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-sand-900 text-[13px] font-bold text-white">F</div>
          <div className="text-[15px] font-semibold tracking-[-0.01em] text-sand-900">FirmCRM</div>
        </div>
        <div className="card p-6">
          <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] text-sand-900">Sign in</h1>
          <p className="mt-1 text-[12px] leading-4 text-sand-500">Use your firm workspace credentials.</p>
          {sessionNotice && <div className="mt-4 rounded-md border border-warn-200 bg-warn-50 px-3 py-2 text-[12px] leading-4 text-warn-700">{sessionNotice}</div>}
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" /></Field>
            <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
            {err && <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-[12px] leading-4 text-danger-700">{err}</div>}
            <Button variant="primary" size="lg" type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          <Button type="button" variant="secondary" size="lg" className="w-full justify-center" disabled={busy} onClick={demoNow} data-tour="login-demo"><Play size={13} />Demo now — guided walkthrough</Button>
          </form>
        </div>
        <div className="mt-5 text-[12px] leading-4 text-sand-500">
          <div className="mb-2 font-medium text-sand-600">Demo accounts <span className="font-normal text-sand-500">· password <code className="mono text-sand-700">Demo1234!Demo</code></span></div>
          <div className="flex flex-wrap gap-1.5">{DEMO.map(([e, l]) => <button key={e} type="button" onClick={() => setEmail(e)} aria-pressed={email === e} className={`inline-flex h-7 items-center rounded-full border bg-sand-100 px-2.5 text-[11px] leading-4 font-medium text-sand-700 transition-colors duration-[120ms] ${email === e ? "border-sand-900" : "border-sand-150 hover:border-sand-300"}`}>{l}</button>)}</div>
        </div>
      </div>
    </div>
  );
}
