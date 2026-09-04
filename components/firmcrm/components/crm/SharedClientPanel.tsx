'use client'
import { useState } from 'react'
import type { components } from '@/lib/api-types'
import type { Account, Contact } from '../../api/types'
import { get, post } from '../../api/client'
import { useQuery, useQueryClient } from '../../lib/query'
import { useCrmContext } from '../../lib/auth'
import { Button, Card, Field, Input, Modal, Select } from '../ui'
import { useToast } from '../ui/Toast'

type Client = components['schemas']['FirmCrmClientChoice']
export function SharedClientPanel({ account, contacts }: { account: Account; contacts: Contact[] }) {
  const { can_share_clients } = useCrmContext()
  const [open,setOpen] = useState(false)
  const [clientId,setClientId] = useState('')
  const [search,setSearch] = useState('')
  const [contactId,setContactId] = useState('')
  const [busy,setBusy] = useState(false)
  const { error,toast } = useToast()
  const qc = useQueryClient()
  const choices = useQuery({queryKey:['shared-clients',search],enabled:open&&can_share_clients,queryFn:()=>get<Client[]>('/shared-clients',{q:search})})
  const contact = contacts.find(c=>String(c.id)===contactId)
  const selected = choices.data?.find(c=>c.id===clientId)
  return <Card title="Shared client directory"><p className="text-crm-sand-600">{account.shared_client_id ? 'Linked to the CPAAutomation client directory. Name and industry are shared across modules.' : 'This account is currently available only in FirmCRM.'}</p>
    {!account.shared_client_id && can_share_clients && <Button className="mt-3" onClick={()=>setOpen(true)}>Link or publish as client</Button>}
    <Modal open={open} onClose={()=>setOpen(false)} title="Share client identity" footer={<><Button onClick={()=>setOpen(false)}>Cancel</Button><Button variant="primary" disabled={busy||choices.isPending||choices.isError} onClick={async()=>{setBusy(true);try{await post(`/accounts/${account.id}/shared-client`,{client_id:clientId||null,contact_id:contactId?Number(contactId):null});await qc.invalidateQueries({queryKey:[]});setOpen(false);toast('Client linked')}catch(e){error(e)}finally{setBusy(false)}}}>{clientId?'Link client':'Publish client'}</Button></>}>
      <div className="space-y-4"><p>This permanently shares the selected identity with other CPAAutomation modules. Linked accounts cannot have an account-level ethical wall. CRM notes, opportunities, and clearance details stay in CRM.</p>
        {choices.isError && <p role="alert">{choices.error.message}</p>}
        <Field label="Find an existing client"><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search the shared client directory"/></Field>
        <Field label="Existing client"><Select value={clientId} onChange={e=>setClientId(e.target.value)} placeholder="Publish a new client" options={(choices.data??[]).map(c=>({value:c.id,label:c.name}))}/></Field>
        {!clientId && <Field label="Include contact details"><Select value={contactId} onChange={e=>setContactId(e.target.value)} placeholder="Do not publish contact details" options={contacts.map(c=>({value:String(c.id),label:c.full_name}))}/></Field>}
        <dl className="space-y-2 rounded-crm-md border border-crm-sand-150 p-3"><div><dt>Name</dt><dd className="font-semibold">{selected?.name??account.name}</dd></div><div><dt>Industry</dt><dd>{selected?.industry??account.industry??'—'}</dd></div>{!clientId&&contact&&<div><dt>Contact (copied once)</dt><dd>{contact.full_name} · {contact.email??'—'} · {contact.phone??'—'}</dd></div>}</dl>
      </div>
    </Modal>
  </Card>
}
