import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@/components/firmcrm/lib/query";
import { LockOpen, Plus, UserPlus } from "lucide-react";
import { adminApi, refApi, usersApi, wallsApi } from "@/components/firmcrm/api";
import { Link } from "@/components/firmcrm/lib/navigation";
import type { Pipeline, PracticeArea, Stage, User, Wall } from "@/components/firmcrm/api/types";
import { Badge, Button, Card, Empty, Field, FieldError, Input, Modal, OverflowMenu, PageHeader, Select, Spinner, Tabs, type MenuItem } from "@/components/firmcrm/components/ui";
import { DataTable, type Column } from "@/components/firmcrm/components/ui/DataTable";
import { FormModal, type FieldDef, type FormValues } from "@/components/firmcrm/components/ui/Form";
import { useConfirm } from "@/components/firmcrm/components/ui/Confirm";
import { useToast } from "@/components/firmcrm/components/ui/Toast";
import { Pagination, usePager } from "@/components/firmcrm/components/ui/Pagination";
import { usePipelines, usePracticeAreas, opt, strOpts } from "@/components/firmcrm/lib/hooks";
import { DISCIPLINES, ROLES } from "@/components/firmcrm/lib/options";
import { fmtDateTime, titleCase } from "@/components/firmcrm/lib/format";
import { useAuth } from "@/components/firmcrm/lib/auth";
import { Dash, FilterToggle, NameCell } from "@/components/firmcrm/components/ui/cells";

const Note = ({ children, top = false }: { children: React.ReactNode; top?: boolean }) => (
  <div className={top ? "border-b border-crm-sand-150 px-5 py-2.5 text-[12px] leading-4 text-crm-sand-500" : "border-t border-crm-sand-150 px-5 py-2.5 text-[12px] leading-4 text-crm-sand-500"}>{children}</div>
);

type AuditRow = Awaited<ReturnType<typeof adminApi.audit>>["items"][number];

export default function AdminPage() {
  const { hasRole, user } = useAuth(); const qc = useQueryClient(); const { toast, error } = useToast(); const confirm = useConfirm();
  const [tab, setTab] = useState<"users" | "practice" | "pipeline" | "walls" | "audit">("users");
  const [inactiveWalls, setInactiveWalls] = useState(false);
  const walls = useQuery({ queryKey: ["walls", inactiveWalls], queryFn: () => wallsApi.list({ include_inactive: inactiveWalls, limit: 200 }), enabled: tab === "walls" });
  const users = useQuery({ queryKey: ["users", "all"], queryFn: () => usersApi.list(true) });
  const pas = usePracticeAreas(); const activePas = usePracticeAreas(true); const pipelines = usePipelines();
  // Ethical walls: partners/admins get an escape hatch here even when they are outside the wall (flows QA #4).
  const canManageWalls = hasRole("partner", "admin");
  const [addingTo, setAddingTo] = useState<Wall | null>(null); const [addUserId, setAddUserId] = useState("");
  const invWalls = () => { qc.invalidateQueries({ queryKey: ["walls"] }); qc.invalidateQueries({ queryKey: ["wall"] }); };
  const addMember = useMutation({ mutationFn: ({ wall, uid }: { wall: Wall; uid: string }) => wallsApi.addMember(wall.id, uid), onSuccess: (_, v) => { invWalls(); setAddingTo(null); setAddUserId(""); toast(v.uid === user?.id ? "You were added to the wall" : "Member added"); }, onError: error });
  const liftWall = useMutation({ mutationFn: (w: Wall) => wallsApi.lift(w.id), onSuccess: () => { invWalls(); toast("Wall lifted — record is visible firm-wide again"); }, onError: error });
  const wallMenu = (w: Wall): MenuItem[] => {
    const isMember = w.members.some((m) => m.user_id === user?.id);
    return [
      { label: isMember ? "You are a member" : "Add me", icon: <UserPlus />, disabled: isMember || addMember.isPending, onSelect: () => user && addMember.mutate({ wall: w, uid: user.id }) },
      { label: "Add member…", icon: <Plus />, onSelect: () => { setAddUserId(""); setAddingTo(w); } },
      { label: "Lift wall", icon: <LockOpen />, tone: "danger", disabled: liftWall.isPending, onSelect: async () => {
        if (await confirm({ title: "Lift the ethical wall?", body: <>{w.entity_name ?? `${titleCase(w.entity_type)} #${w.entity_id}`} becomes visible firm-wide again; the change is recorded in the audit log.</>, confirmLabel: "Lift wall" })) liftWall.mutate(w);
      } },
    ];
  };
  const [entity, setEntity] = useState("");
  const pager = usePager(100);
  const audit = useQuery({ queryKey: ["audit", entity, pager.limit, pager.offset], queryFn: () => adminApi.audit({ entity_type: entity || undefined, limit: pager.limit, offset: pager.offset }), enabled: tab === "audit" });
  const [editUser, setEditUser] = useState<User | null>(null);
  const [newPa, setNewPa] = useState(false); const [editPa, setEditPa] = useState<PracticeArea | null>(null);
  const isAdmin = hasRole("admin");
  // Password: masked field, label/hint aligned with the enforced policy (QA #11). Required on create; optional reset on edit.
  const userFields = (): FieldDef[] => [
    { name: "role", label: "CRM role", type: "select", options: strOpts(ROLES) },
    { name: "practice_area_id", label: "Practice area", type: "select", options: opt(activePas.data, (p) => p.name) },
    { name: "is_active", label: "CRM access active", type: "checkbox" },
  ];
  const paFields: FieldDef[] = [{ name: "name", label: "Name", required: true }, { name: "discipline", label: "Discipline", type: "select", options: strOpts(DISCIPLINES) }, { name: "clearance_type", label: "Clearance gate before Closed Won", type: "select", options: [{ value: "conflict", label: "Conflict check (legal)" }, { value: "independence", label: "Independence check (attest)" }], placeholder: "None" }, { name: "is_active", label: "Active", type: "checkbox" }];
  const saveStage = useMutation({ mutationFn: (s: Stage) => refApi.updateStage(s.id, { name: s.name, position: s.position, probability: s.probability, is_won: s.is_won, is_lost: s.is_lost }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["pipelines"] }); toast("Stage saved"); }, onError: error });
  // New stages are collected in a modal first so a half-named stage never reaches the live board (flows QA #11).
  const [addingStageTo, setAddingStageTo] = useState<Pipeline | null>(null);
  const stageFields: FieldDef[] = [
    { name: "name", label: "Stage name", required: true, span: 2 },
    { name: "position", label: "Order", type: "number", required: true, min: 1, hint: "Position on the board, left to right." },
    { name: "probability", label: "Probability %", type: "number", required: true, min: 0, max: 100, hint: "Applied to opportunities entering the stage." },
  ];
  const nextPosition = (p: Pipeline) => Math.max(0, ...p.stages.filter((s) => !s.is_won && !s.is_lost).map((s) => s.position)) + 1;
  const delStage = useMutation({ mutationFn: (id: number) => refApi.deleteStage(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["pipelines"] }); toast("Stage deleted"); }, onError: error });
  const deleteStage = async (s: Stage) => {
    const ok = await confirm({ title: `Delete stage “${s.name}”?`, body: "Opportunities currently in this stage must be moved first; the stage is removed from the pipeline and the board.", confirmLabel: "Delete stage" });
    if (ok) delStage.mutate(s.id);
  };
  const active = (on: boolean) => on ? <Badge dot tone="success">Active</Badge> : <Badge dot tone="neutral">Inactive</Badge>;
  // Audit log: fixed widths on the structured columns, the free-text diff capped and truncated so the table never scrolls sideways (QA #7).
  const auditCols: Column<AuditRow>[] = [
    { key: "at", header: "When", width: "170px", nowrap: true, render: (r) => <span className="num text-crm-sand-600">{fmtDateTime(r.at)}</span> },
    { key: "actor", header: "Actor", width: "160px", nowrap: true, hideBelow: 1180, render: (r) => r.actor_name ?? <span className="text-crm-sand-500">system</span> },
    { key: "action", header: "Action", width: "150px", render: (r) => <Badge dot tone={r.action.includes("delete") || r.action.includes("archive") ? "danger" : r.action.includes("create") ? "success" : "neutral"}>{r.action}</Badge> },
    { key: "entity", header: "Entity", width: "170px", nowrap: true, render: (r) => <span className="text-crm-sand-700">{titleCase(r.entity_type)} <span className="mono text-crm-sand-500">#{r.entity_id}</span></span> },
    { key: "diff", header: "Before → after", maxWidth: "240px", render: (r) => <span className="mono block max-w-[240px] truncate text-crm-sand-600" title={`${r.before_json ?? ""} → ${r.after_json ?? ""}${r.note ? ` (${r.note})` : ""}`}>{r.before_json ? `${r.before_json} → ` : ""}{r.after_json}{r.note ? ` (${r.note})` : ""}</span> },
  ];
  return (
    <div>
      <PageHeader title="Administration" subtitle="Users and roles · practice areas and clearance gates · pipeline stages · ethical walls · audit trail" />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "users", label: "Users", count: users.data?.length }, { key: "practice", label: "Practice areas", count: pas.data?.length }, { key: "pipeline", label: "Pipeline stages" }, { key: "walls", label: "Ethical walls", count: walls.data?.total }, { key: "audit", label: "Audit log", count: audit.data?.total }]} />
      <div className="mt-5 space-y-4">
        {tab === "users" && <Card title="Users" padded={false}>
          {users.isLoading ? <Spinner /> : <table className="tbl"><thead><tr><th style={{ width: 260 }}>Name</th><th>Email</th><th style={{ width: 120 }}>Role</th><th style={{ width: 200 }} className="max-[1279px]:hidden">Practice area</th><th style={{ width: 180 }} className="max-[1179px]:hidden">Last sign-in</th><th style={{ width: 110 }}>Status</th></tr></thead>
            <tbody>{users.data?.map((u) => <tr key={u.id} className={isAdmin ? "clickable row-2line" : "row-2line"} tabIndex={isAdmin ? 0 : undefined} onClick={() => isAdmin && setEditUser(u)} onKeyDown={(e) => { if (isAdmin && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setEditUser(u); } }}>
              <td><NameCell name={u.full_name} sub={u.title} max={260} /></td><td><span className="block max-w-[260px] truncate whitespace-nowrap text-crm-sand-600" title={u.email}>{u.email}</span></td><td><Badge>{titleCase(u.role)}</Badge></td>
              <td className="whitespace-nowrap max-[1279px]:hidden">{pas.data?.find((p) => p.id === u.practice_area_id)?.name ?? <Dash />}</td><td className="num whitespace-nowrap text-crm-sand-600 max-[1179px]:hidden">{u.last_login_at ? fmtDateTime(u.last_login_at) : <Dash />}</td><td>{active(u.is_active)}</td></tr>)}</tbody></table>}
        </Card>}
        {tab === "practice" && <Card title="Practice areas" padded={false} actions={isAdmin && <Button size="sm" onClick={() => setNewPa(true)}><Plus size={12} />Add practice area</Button>}>
          {pas.isLoading ? <Spinner /> : <table className="tbl"><thead><tr><th style={{ width: 300 }}>Name</th><th style={{ width: 160 }}>Discipline</th><th>Clearance gate</th><th style={{ width: 110 }}>Status</th></tr></thead>
            <tbody>{pas.data?.map((p) => <tr key={p.id} className={isAdmin ? "clickable" : ""} tabIndex={isAdmin ? 0 : undefined} onClick={() => isAdmin && setEditPa(p)} onKeyDown={(e) => { if (isAdmin && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setEditPa(p); } }}>
              <td className="font-medium">{p.name}</td><td>{titleCase(p.discipline)}</td>
              <td>{p.clearance_type ? <Badge dot tone="warn">{titleCase(p.clearance_type)} check before Closed Won</Badge> : <span className="text-crm-sand-400">None</span>}</td><td>{active(p.is_active)}</td></tr>)}</tbody></table>}
        </Card>}
        {tab === "pipeline" && pipelines.data?.map((p) => (
          <Card key={p.id} title={<span className="flex items-center gap-2">{p.name}{p.is_default && <Badge>Default</Badge>}</span>} padded={false} actions={isAdmin && <Button size="sm" onClick={() => setAddingStageTo(p)}><Plus size={12} />Add stage</Button>}>
            <table className="tbl"><thead><tr><th style={{ width: 88 }} className="!text-right">Order</th><th>Stage</th><th style={{ width: 140 }} className="!text-right">Probability %</th><th style={{ width: 120 }}>Type</th><th style={{ width: 176 }}></th></tr></thead>
              <tbody>{p.stages.map((s) => <StageRow key={s.id} stage={s} editable={isAdmin} onSave={(st) => saveStage.mutate(st)} onDelete={() => deleteStage(s)} />)}</tbody></table>
            <Note>Probability is applied to an opportunity when it enters the stage; users may override per opportunity. Exactly one Won and one Lost stage per pipeline.</Note>
          </Card>))}
        {tab === "walls" && <Card title="Ethical walls" padded={false} actions={<FilterToggle checked={inactiveWalls} onChange={setInactiveWalls}>Show lifted</FilterToggle>}>
          <Note top>Partners and admins see all walls; other users see only walls they are inside. {canManageWalls ? "Raise walls from the account or opportunity page; add members or lift a wall here even when you are outside it." : "Raise or lift walls from the account or opportunity page."}</Note>
          {walls.isLoading ? <Spinner /> : !walls.data?.items.length ? <Empty title="No ethical walls" hint={inactiveWalls ? "No walls have been raised." : "No active walls. Lifted walls are hidden."} /> : <table className="tbl"><thead><tr><th style={{ width: 280 }}>Record</th><th>Reason</th><th style={{ width: 240 }}>Members</th><th style={{ width: 200 }}>Raised by</th><th style={{ width: 200 }}>Status</th>{canManageWalls && <th style={{ width: 56 }}></th>}</tr></thead>
            <tbody>{walls.data.items.map((w) => <tr key={w.id}>
              <td><Link to={`/${w.entity_type === "account" ? "accounts" : "opportunities"}/${w.entity_id}`} className="font-medium">{w.entity_name ?? `${w.entity_type} #${w.entity_id}`}</Link><div className="text-[12px] leading-4 text-crm-sand-500">{titleCase(w.entity_type)}</div></td>
              <td className="max-w-[360px] py-2 whitespace-normal">{w.reason}</td><td className="whitespace-normal text-crm-sand-700">{w.members.map((m) => m.full_name).join(", ")}</td>
              <td>{w.created_by_name ?? <Dash />}<div className="num text-[12px] leading-4 text-crm-sand-500">{fmtDateTime(w.created_at)}</div></td>
              <td>{w.is_active ? <Badge dot tone="danger">Active</Badge> : <Badge dot tone="neutral"><span className="num">Lifted {fmtDateTime(w.deactivated_at)}</span></Badge>}</td>
              {canManageWalls && <td className="!pl-0 text-right">{w.is_active && <OverflowMenu items={wallMenu(w)} label={`Wall actions for ${w.entity_name ?? w.entity_id}`} />}</td>}</tr>)}</tbody></table>}
        </Card>}
        {tab === "audit" && <Card title="Audit log" padded={false} actions={<Select value={entity} onChange={(e) => { setEntity(e.target.value); pager.reset(); }} options={strOpts(["account", "contact", "lead", "opportunity", "conflict_check", "engagement", "campaign", "activity", "user", "stage", "practice_area", "ethical_wall", "export", "import_job"])} placeholder="All entities" className="!w-[180px]" aria-label="Entity type" />}>
          <DataTable rows={audit.data?.items} columns={auditCols} loading={audit.isLoading} empty="No audit entries" />
          <Pagination total={audit.data?.total} limit={pager.limit} offset={pager.offset} onOffset={pager.setOffset} onLimit={pager.setLimit} />
        </Card>}
      </div>
      {editUser && <FormModal open onClose={() => setEditUser(null)} title={`Edit ${editUser.full_name}`} fields={userFields().filter((f) => f.name !== "email")} initial={{role: editUser.role, practice_area_id: editUser.practice_area_id, is_active: editUser.is_active}}
        onSubmit={async (v) => { await usersApi.update(editUser.id, v as Partial<User>); qc.invalidateQueries({ queryKey: ["users"] }); toast("User updated"); }} />}
      <FormModal open={newPa} onClose={() => setNewPa(false)} title="Add practice area" fields={paFields} initial={{ discipline: "accounting", is_active: true }} submitLabel="Create"
        onSubmit={async (v) => { await refApi.createPracticeArea(v as Omit<PracticeArea, "id">); qc.invalidateQueries({ queryKey: ["practice-areas"] }); toast("Practice area created"); }} />
      {editPa && <FormModal open onClose={() => setEditPa(null)} title={`Edit ${editPa.name}`} fields={paFields} initial={editPa as unknown as FormValues}
        onSubmit={async (v) => { const { name, discipline, clearance_type, is_active } = v as Record<string, unknown>; await refApi.updatePracticeArea(editPa.id, { name, discipline, clearance_type: clearance_type || null, is_active } as Omit<PracticeArea, "id">); qc.invalidateQueries({ queryKey: ["practice-areas"] }); toast("Saved"); }} />}
      {addingStageTo && <FormModal open onClose={() => setAddingStageTo(null)} title={`Add stage to ${addingStageTo.name}`} fields={stageFields} size="default" initial={{ position: nextPosition(addingStageTo), probability: 50 }} submitLabel="Add stage"
        onSubmit={async (v) => { await refApi.addStage(addingStageTo.id, { name: String(v.name).trim(), position: Number(v.position), probability: Number(v.probability), is_won: false, is_lost: false }); qc.invalidateQueries({ queryKey: ["pipelines"] }); toast("Stage added"); }} />}
      <Modal open={!!addingTo} onClose={() => setAddingTo(null)} title={`Add member · ${addingTo?.entity_name ?? ""}`}
             footer={<><Button onClick={() => setAddingTo(null)}>Cancel</Button><Button variant="primary" disabled={!addUserId || addMember.isPending} onClick={() => addingTo && addMember.mutate({ wall: addingTo, uid: addUserId })}><UserPlus size={12} />Add</Button></>}>
        <Field label="User" hint="The member gains access to the record and everything under it; the change is recorded in the audit log.">
          <Select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} placeholder="Choose a user…" aria-label="User to add"
                  options={opt(users.data?.filter((u) => u.is_active && !addingTo?.members.some((m) => m.user_id === u.id)), (u) => `${u.full_name} (${u.role})`)} />
        </Field>
      </Modal>
    </div>
  );
}

/** Inline stage editor row. Standard 32px fields (§6.10) in 48px rows (`py-2`) so the inputs have breathing room (QA #30). */
function StageRow({ stage, editable, onSave, onDelete }: { stage: Stage; editable: boolean; onSave: (s: Stage) => void; onDelete: () => void }) {
  const [s, setS] = useState(stage);
  const dirty = s.name !== stage.name || s.position !== stage.position || s.probability !== stage.probability;
  const terminal = s.is_won || s.is_lost;
  // Inline validation before Save, matching SchemaForm's rules (flows QA #21): the invalid value stays visible with the reason under it.
  const nameErr = s.name.trim() ? null : "Stage name is required.";
  const probErr = Number.isNaN(s.probability) ? "Enter a number." : s.probability < 0 || s.probability > 100 ? "Must be between 0 and 100." : null;
  const posErr = Number.isNaN(s.position) || s.position < 1 ? "Must be at least 1." : null;
  const invalid = Boolean(nameErr || probErr || posErr);
  return (
    <tr>
      <td className="!h-12 py-2 align-top"><Input type="number" min={1} value={s.position} disabled={!editable} onChange={(e) => setS({ ...s, position: Number(e.target.value) })} className="!w-[56px]" aria-label="Order" aria-invalid={posErr ? true : undefined} aria-describedby={posErr ? `stage-${s.id}-pos-error` : undefined} />{dirty && posErr && <FieldError id={`stage-${s.id}-pos-error`} className="text-right">{posErr}</FieldError>}</td>
      <td className="!h-12 py-2 align-top"><Input value={s.name} disabled={!editable} onChange={(e) => setS({ ...s, name: e.target.value })} className="max-w-[360px]" aria-label="Stage name" aria-invalid={nameErr ? true : undefined} aria-describedby={nameErr ? `stage-${s.id}-name-error` : undefined} />{dirty && nameErr && <FieldError id={`stage-${s.id}-name-error`}>{nameErr}</FieldError>}</td>
      <td className="!h-12 py-2 align-top"><Input type="number" min={0} max={100} value={s.probability} disabled={!editable || terminal} onChange={(e) => setS({ ...s, probability: Number(e.target.value) })} className="!ml-auto !w-[80px]" aria-label="Probability" aria-invalid={probErr ? true : undefined} aria-describedby={probErr ? `stage-${s.id}-prob-error` : undefined} />{dirty && probErr && <FieldError id={`stage-${s.id}-prob-error`} className="text-right">{probErr}</FieldError>}</td>
      <td className="!h-12 align-top pt-3.5">{s.is_won ? <Badge dot tone="success">Won</Badge> : s.is_lost ? <Badge dot tone="danger">Lost</Badge> : <Badge dot tone="info">Open</Badge>}</td>
      <td className="!h-12 align-top pt-2 text-right">{editable && <div className="flex justify-end gap-1">{dirty && <Button size="sm" variant="primary" disabled={invalid} title={invalid ? "Fix the highlighted fields first" : undefined} onClick={() => !invalid && onSave(s)}>Save</Button>}{!terminal && <Button size="sm" variant="ghost" onClick={onDelete}>Delete</Button>}</div>}</td>
    </tr>
  );
}
