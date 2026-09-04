import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { contactsApi, oppsApi } from "@/api";
import type { Contact } from "@/api/types";
import { Badge, Button, Card, DL, Empty, PageHeader, Spinner, statusTone } from "@/components/ui";
import { FormModal, type FormValues } from "@/components/ui/Form";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";
import { Dash, cellMoney } from "@/components/ui/cells";
import { FactsGrid, NotFound, type Fact } from "@/components/ui/facts";
import { useContactFields } from "./ContactsPage";
import { fmtDate, money, titleCase } from "@/lib/format";

export default function ContactDetailPage() {
  const id = Number(useParams().id);
  const qc = useQueryClient(); const { toast } = useToast(); const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const c = useQuery({ queryKey: ["contact", id], queryFn: () => contactsApi.get(id) });
  const referred = useQuery({ queryKey: ["opps", { referral_contact: id }], queryFn: () => oppsApi.list({ status: "all", limit: 1000 }), select: (p) => p.items.filter((o) => o.referral_contact_id === id || o.primary_contact_id === id), enabled: !!c.data });
  const { atLeast } = useAuth(); const { error } = useToast();
  const archiveM = useMutation({ mutationFn: () => (c.data!.is_archived ? contactsApi.restore(id) : contactsApi.archive(id)), onSuccess: (k) => { qc.invalidateQueries({ queryKey: ["contact", id] }); qc.invalidateQueries({ queryKey: ["contacts"] }); toast(k.is_archived ? "Contact archived" : "Contact restored"); }, onError: error });
  const fields = useContactFields();
  if (c.isError) return <NotFound what="Contact" backTo="/contacts" backLabel="Back to contacts" />;
  if (c.isLoading || !c.data) return <Spinner />;
  const k = c.data;

  const related = referred.data ?? [];
  const openRelated = related.filter((o) => o.status === "open");
  const facts: Fact[] = [
    { label: "Account", value: k.account_name ? <Link to={`/accounts/${k.account_id}`} className="text-sand-900 hover:text-accent-600">{k.account_name}</Link> : <Dash />, sub: [k.title, k.role ? titleCase(k.role) : null].filter(Boolean).join(" · ") || "No title", size: "text" },
    { label: "Owner", value: k.owner_name ?? <Dash />, sub: k.do_not_contact ? "Marketing opt-out" : "Marketing allowed", size: "text" },
    { label: "Related pipeline", value: referred.data ? money(openRelated.reduce((s, o) => s + (o.amount ?? 0), 0)) : <Dash />, sub: referred.data ? `${related.length} related ${related.length === 1 ? "opportunity" : "opportunities"}` : "—" },
    { label: "Last activity", value: k.last_activity_at ? fmtDate(k.last_activity_at) : <Dash />, sub: `Created ${fmtDate(k.created_at)}`, size: "text" },
  ];
  return (
    <div>
      <PageHeader
        title={<>{k.full_name}<Badge tone={statusTone(k.lifecycle)}>{titleCase(k.lifecycle)}</Badge>{k.do_not_contact && <Badge tone="danger">Do not contact</Badge>}{k.is_archived && <Badge>Archived</Badge>}</>}
        subtitle={<>{k.title ?? "No title"}{k.account_name && <> · <Link to={`/accounts/${k.account_id}`}>{k.account_name}</Link></>}{k.email && <> · <a href={`mailto:${k.email}`}>{k.email}</a></>}</>}
        actions={<>
          {atLeast("manager") && <Button variant={k.is_archived ? "secondary" : "ghost"} disabled={archiveM.isPending} onClick={async () => { if (k.is_archived || await confirm({ title: "Archive this contact?", body: "The contact leaves lists but stays on the account history and can be restored.", confirmLabel: "Archive" })) archiveM.mutate(); }}>{k.is_archived ? <><ArchiveRestore size={14} />Restore</> : <><Archive size={14} />Archive</>}</Button>}
          <Button variant="primary" onClick={() => setEditing(true)}><Pencil size={14} />Edit</Button>
        </>} />
      <FactsGrid facts={facts} />
      <div className="grid grid-cols-12 items-start gap-4">
        <Card title="Activity" className="col-span-8"><ActivityTimeline filter={{ contact_id: id }} linkTo /></Card>
        <div className="col-span-4 space-y-4">
          <Card title="Details"><DL columns={1} items={[{ label: "Email", value: k.email ? <a href={`mailto:${k.email}`}>{k.email}</a> : null }, { label: "Phone", value: k.phone }, { label: "LinkedIn", value: k.linkedin ? <a href={k.linkedin} target="_blank" rel="noreferrer">Profile</a> : null }, { label: "Notes", value: k.notes }]} /></Card>
          <Card title="Related opportunities" padded={false}>
            {referred.isLoading ? <Spinner /> : !related.length ? <Empty title="No related opportunities" hint="Opportunities where this person is the primary or referring contact appear here." /> : (
              <table className="tbl"><tbody>{related.map((o) => (
                <tr key={o.id}>
                  <td><Link to={`/opportunities/${o.id}`} className="font-medium">{o.name}</Link><div className="text-[12px] leading-4 text-sand-500">{o.referral_contact_id === id ? "Referred" : "Primary contact"} · {o.stage_name}</div></td>
                  <td className="w-[128px] text-right num font-medium">{cellMoney(o.amount)}</td>
                </tr>))}</tbody></table>)}
          </Card>
        </div>
      </div>
      <FormModal open={editing} onClose={() => setEditing(false)} title="Edit contact" fields={fields} initial={k as unknown as FormValues}
        onSubmit={async (v) => { const body: Record<string, unknown> = {}; for (const f of fields) body[f.name] = v[f.name] ?? null; await contactsApi.update(id, body as Partial<Contact>); qc.invalidateQueries({ queryKey: ["contact", id] }); qc.invalidateQueries({ queryKey: ["contacts"] }); toast("Contact updated"); }} />
    </div>
  );
}
