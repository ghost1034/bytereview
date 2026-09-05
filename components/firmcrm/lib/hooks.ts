import { useQuery } from "@/components/firmcrm/lib/query";
import type { User } from "@/components/firmcrm/api/types";
import { refApi, usersApi } from "@/components/firmcrm/api";

export const useUsers = () => useQuery({ queryKey: ["users"], queryFn: () => usersApi.list(), staleTime: 5 * 60_000 });
/** `activeOnly` for pickers on new/edit records (flows QA #9); list filters pass `false` and label inactive areas themselves. */
export const usePracticeAreas = (activeOnly = false) => useQuery({ queryKey: ["practice-areas", activeOnly], queryFn: () => refApi.practiceAreas(activeOnly), staleTime: 5 * 60_000 });
/** Filter-row label: inactive areas stay selectable for historical records but are marked. */
export const paLabel = (p: { name: string; is_active: boolean }) => (p.is_active ? p.name : `${p.name} (inactive)`);
export const usePipelines = () => useQuery({ queryKey: ["pipelines"], queryFn: refApi.pipelines, staleTime: 5 * 60_000 });

export const opt = <T extends { id: number | string }>(rows: T[] | undefined, label: (r: T) => string) => (rows ?? []).map((r) => ({ value: r.id, label: label(r) }));
export const strOpts = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: x.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));

/** Administrators have partner privileges; retain an inherited engagement owner when editing. */
export const partnerOptions = (users: User[] | undefined, currentId?: string | null) =>
  opt(users?.filter((user) => user.role === "partner" || user.role === "admin" || user.id === currentId), (user) => user.full_name);
