/* Ethical wall panel for a record page: shows restriction status; partners/admins can create, manage members, lift. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen, UserMinus, UserPlus } from "lucide-react";
import { wallsApi } from "@/api";
import { ApiError } from "@/api/client";
import { Badge, Button, Card, Field, Modal, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { useAuth } from "@/lib/auth";
import { useUsers, opt } from "@/lib/hooks";
import { fmtDateTime, initials } from "@/lib/format";

export function useWall(entityType: "account" | "opportunity", id: number, enabled = true) {
  return useQuery({ queryKey: ["wall", entityType, id], queryFn: () => wallsApi.forEntity(entityType, id), enabled });
}

export function WallPanel({ entityType, id, entityName }: { entityType: "account" | "opportunity"; id: number; entityName: string }) {
  const qc = useQueryClient(); const { toast, error } = useToast(); const { hasRole, user } = useAuth();
  const confirm = useConfirm();
  const canManage = hasRole("partner", "admin");
  const wall = useWall(entityType, id);
  const users = useUsers();
  const [creating, setCreating] = useState(false); const [reason, setReason] = useState(""); const [members, setMembers] = useState<number[]>([]); const [adding, setAdding] = useState("");
  const inv = () => { qc.invalidateQueries({ queryKey: ["wall", entityType, id] }); qc.invalidateQueries({ queryKey: ["walls"] }); };
  const create = useMutation({ mutationFn: () => wallsApi.create({ entity_type: entityType, entity_id: id, reason, member_ids: members }), onSuccess: () => { inv(); setCreating(false); setReason(""); setMembers([]); toast("Ethical wall raised"); }, onError: error });
  const add = useMutation({ mutationFn: (uid: number) => wallsApi.addMember(wall.data!.id, uid), onSuccess: () => { inv(); setAdding(""); }, onError: error });
  const remove = useMutation({ mutationFn: (uid: number) => wallsApi.removeMember(wall.data!.id, uid), onSuccess: inv,
    onError: (e) => error(e instanceof ApiError && e.code === "self_lockout" ? new Error("You cannot remove yourself: no other partner or admin would remain inside this wall. Add one first, or lift the wall.") : e) });
  const lift = useMutation({ mutationFn: () => wallsApi.lift(wall.data!.id), onSuccess: () => { inv(); toast("Wall lifted — record is visible firm-wide again"); }, onError: error });
  const w = wall.data;
  if (!w && !canManage) return null;
  const memberIds = new Set(w?.members.map((m) => m.user_id));
  // The API refuses removing yourself when no other partner/admin would remain (`self_lockout`, flows QA #4); hide the control in that case.
  const otherPrivileged = (w?.members ?? []).some((m) => m.user_id !== user?.id && (m.role === "partner" || m.role === "admin"));
  const canRemove = (uid: number) => uid !== user?.id || otherPrivileged;
  return (
    <Card tourId="wall-panel" title={<span className="inline-flex items-center gap-1.5">{w ? <Lock size={14} className="text-danger-600" /> : <LockOpen size={14} className="text-sand-500" />}Access{w && <Badge tone="danger">Restricted</Badge>}</span>}
          actions={canManage && (w ? <Button size="sm" variant="danger" onClick={async () => { if (await confirm({ title: "Lift the ethical wall?", body: <>{entityName} becomes visible firm-wide again; the change is recorded in the audit log.</>, confirmLabel: "Lift wall" })) lift.mutate(); }}>Lift wall</Button> : <Button size="sm" onClick={() => setCreating(true)}><Lock size={12} />Raise wall</Button>)}>
      {!w ? <div className="text-[12px] leading-4 text-sand-500">Visible firm-wide. Raise an ethical wall to restrict this {entityType} and everything under it to a named team.</div> : (
        <div className="space-y-3 text-[13px] leading-5">
          <div className="text-sand-900">{w.reason}</div>
          <div className="text-[12px] leading-4 text-sand-500">Raised by {w.created_by_name} · <span className="num">{fmtDateTime(w.created_at)}</span>. Non-members cannot see this record; conflict searches show it as a restricted matter.</div>
          <ul className="divide-y divide-sand-100 rounded-md border border-sand-150">
            {w.members.map((m) => (
              <li key={m.user_id} className="flex h-9 items-center justify-between gap-2 px-3">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sand-200 text-[9px] font-semibold text-sand-700">{initials(m.full_name)}</span>
                  <span className="truncate">{m.full_name}</span><span className="text-[12px] text-sand-500">{m.role}</span>
                  {m.user_id === user?.id && <Badge>you</Badge>}
                </span>
                {canManage && (canRemove(m.user_id)
                  ? <Button size="sm" variant="ghost" onClick={() => remove.mutate(m.user_id)} title="Remove" aria-label={`Remove ${m.full_name}`}><UserMinus size={12} /></Button>
                  : <span className="text-[11px] leading-4 text-sand-500" title="You are the only partner or admin inside this wall. Add another partner first, or lift the wall.">only partner inside</span>)}
              </li>))}
          </ul>
          {canManage && <div className="flex gap-2"><Select value={adding} onChange={(e) => setAdding(e.target.value)} options={opt(users.data?.filter((u) => !memberIds.has(u.id)), (u) => `${u.full_name} (${u.role})`)} placeholder="Add member…" aria-label="Add member" /><Button disabled={!adding} onClick={() => add.mutate(Number(adding))} className="shrink-0"><UserPlus size={12} />Add</Button></div>}
        </div>)}
      <Modal open={creating} onClose={() => setCreating(false)} title="Raise ethical wall" footer={<><Button onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" disabled={reason.trim().length < 5 || create.isPending} onClick={() => create.mutate()}>Raise wall</Button></>}>
        <div className="space-y-4">
          <p className="text-[13px] leading-5 text-sand-600">Restricts <span className="font-medium text-sand-900">{entityName}</span> and everything under it to the team named below.</p>
          <Field label="Reason (recorded in the audit log)" hint="e.g. adverse to an existing client; board-level confidential transaction"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Field label="Team with access" hint="You are always included. Admins can see walled records by default; ask your administrator if that should change.">
            <div className="grid max-h-[200px] grid-cols-2 gap-1.5 overflow-auto rounded-md border border-sand-150 p-3">
              {users.data?.filter((u) => u.id !== user?.id).map((u) => <label key={u.id} className="flex items-center gap-2 text-[13px] leading-5 text-sand-900"><input type="checkbox" checked={members.includes(u.id)} onChange={(e) => setMembers(e.target.checked ? [...members, u.id] : members.filter((x) => x !== u.id))} />{u.full_name} <span className="text-[12px] text-sand-500">{u.role}</span></label>)}
            </div>
          </Field>
        </div>
      </Modal>
    </Card>
  );
}
