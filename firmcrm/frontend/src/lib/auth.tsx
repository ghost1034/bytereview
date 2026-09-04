import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi } from "@/api";
import { tokenStore } from "@/api/client";
import type { Role, User } from "@/api/types";

interface AuthCtx {
  user: User | null; loading: boolean; sessionNotice: string | null;
  login: (e: string, p: string) => Promise<void>; logout: () => Promise<void>; setUser: (u: User) => void;
  hasRole: (...r: Role[]) => boolean; atLeast: (r: Role) => boolean;
}
const RANK: Record<Role, number> = { staff: 1, marketing: 1, manager: 2, partner: 3, admin: 4 };
const HAD_SESSION_KEY = "firmcrm.hadSession";
const SIGNED_OUT_NOTICE = "You were signed out. Please sign in again.";
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionNotice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    // Tokens gone but a session was established in this browser: say so instead of landing on a silent login (flows QA #23).
    if (!tokenStore.access() && !tokenStore.refresh()) { if (localStorage.getItem(HAD_SESSION_KEY)) setNotice(SIGNED_OUT_NOTICE); setLoading(false); return; }
    authApi.me().then(setUser).catch(() => { tokenStore.clear(); setNotice(SIGNED_OUT_NOTICE); }).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const onUnauth = () => { setUser(null); setNotice("Your session expired. Please sign in again."); };
    const onPwd = () => setUser((u) => (u ? { ...u, must_change_password: true } : u));
    window.addEventListener("firmcrm:unauthorized", onUnauth);
    window.addEventListener("firmcrm:password-change-required", onPwd);
    return () => { window.removeEventListener("firmcrm:unauthorized", onUnauth); window.removeEventListener("firmcrm:password-change-required", onPwd); };
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    const r = await authApi.login(email, password);
    tokenStore.set(r.access_token, r.refresh_token);
    localStorage.setItem(HAD_SESSION_KEY, "1");
    setNotice(null);
    setUser(r.user);
  }, []);
  const logout = useCallback(async () => {
    try { await authApi.logout(tokenStore.refresh()); } catch { /* already invalid */ }
    tokenStore.clear();
    localStorage.removeItem(HAD_SESSION_KEY); // explicit sign-out: no "you were signed out" notice next time
    setNotice(null);
    setUser(null);
  }, []);
  const value = useMemo<AuthCtx>(() => ({
    user, loading, sessionNotice, login, logout, setUser,
    hasRole: (...r) => !!user && r.includes(user.role),
    atLeast: (r) => !!user && RANK[user.role] >= RANK[r],
  }), [user, loading, sessionNotice, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
