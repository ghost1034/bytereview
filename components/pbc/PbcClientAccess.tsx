'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Copy, Link2, Mail, MoreHorizontal, Settings2, ShieldCheck, Trash2, UserPlus, Users, X,
} from 'lucide-react'

import { pbcApi } from '@/lib/pbc/api'
import type { PbcContact, PbcEngagement, PbcRequestItem } from '@/lib/pbc/types'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type ContactRole = 'coordinator' | 'contributor'
type AccessForm = { role: ContactRole; requestIds: string[] }

export function PbcClientAccess({ engagement, requests, busy, onRun }: {
  engagement: PbcEngagement
  requests: PbcRequestItem[]
  busy: string | null
  onRun: (key: string, action: () => Promise<unknown>) => Promise<void>
}) {
  const contacts = engagement.contacts || []
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [invite, setInvite] = React.useState({ name: '', email: '', role: 'coordinator' as ContactRole, requestIds: [] as string[] })
  const [managing, setManaging] = React.useState<PbcContact | null>(null)
  const [access, setAccess] = React.useState<AccessForm>({ role: 'coordinator', requestIds: [] })
  const [removing, setRemoving] = React.useState<PbcContact | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const allRequestIds = requests.map((request) => request.id)
  const invalidContributorInvite = invite.role === 'contributor' && invite.requestIds.length === 0
  const invalidContributorAccess = access.role === 'contributor' && access.requestIds.length === 0

  const openManage = (contact: PbcContact) => {
    const role = contact.role || 'contributor'
    setAccess({
      role,
      requestIds: role === 'coordinator' ? allRequestIds : (contact.request_ids || []),
    })
    setManaging(contact)
  }

  const inviteContact = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!engagement.client_id || invalidContributorInvite) return
    setNotice(null)
    await onRun('contact-invite', async () => {
      const created = await pbcApi.createContact({ name: invite.name, email: invite.email, client_id: engagement.client_id })
      const requestIds = invite.role === 'coordinator' ? allRequestIds : invite.requestIds
      await pbcApi.assignContact(engagement.id, created.id, { role: invite.role, request_ids: requestIds })
      const result = await pbcApi.accessLink(engagement.id, {
        contact_id: created.id, purpose: 'portal_login', request_ids: [], expires_in_days: 7, send_email: true,
      })
      setInviteOpen(false)
      setInvite({ name: '', email: '', role: 'coordinator', requestIds: [] })
      setNotice(result.email_delivered === false
        ? `${created.name} was added, but the invitation email could not be delivered.`
        : `Invitation sent to ${created.email}.`)
    })
  }

  const saveAccess = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!managing || invalidContributorAccess) return
    setNotice(null)
    await onRun(`contact-access-${managing.id}`, async () => {
      await pbcApi.assignContact(engagement.id, managing.id, {
        role: access.role,
        request_ids: access.role === 'coordinator' ? allRequestIds : access.requestIds,
      })
      setManaging(null)
      setNotice(`Access updated for ${managing.name}.`)
    })
  }

  const sendAccessLink = async (contact: PbcContact, sendEmail: boolean) => {
    setNotice(null)
    await onRun(`contact-link-${contact.id}`, async () => {
      const result = await pbcApi.accessLink(engagement.id, {
        contact_id: contact.id, purpose: 'portal_login', request_ids: [], expires_in_days: 7, send_email: sendEmail,
      })
      if (sendEmail) {
        setNotice(result.email_delivered === false
          ? `A link was created for ${contact.name}, but the email could not be delivered.`
          : `A new secure link was sent to ${contact.email}.`)
        return
      }
      try {
        await navigator.clipboard.writeText(result.url)
        setNotice(`A new secure link for ${contact.name} was copied to the clipboard.`)
      } catch {
        window.prompt('Copy secure PBC link', result.url)
        setNotice(`A new secure link was created for ${contact.name}.`)
      }
    })
  }

  const removeAccess = async () => {
    if (!removing) return
    const contact = removing
    setNotice(null)
    await onRun(`contact-remove-${contact.id}`, async () => {
      await pbcApi.removeContact(engagement.id, contact.id)
      setRemoving(null)
      setNotice(`${contact.name} no longer has access to this engagement.`)
    })
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm" aria-labelledby="client-access-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-foreground-muted" />
            <h2 id="client-access-heading" className="font-semibold">Client access</h2>
            <Badge variant="secondary">{contacts.length}</Badge>
          </div>
          <p className="mt-1 text-sm text-foreground-muted">Manage who can open this engagement and which requests they can see.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {engagement.tasklytic_workspace_id && engagement.tasklytic_project_id && (
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/dashboard/project-management/w/${engagement.tasklytic_workspace_id}/projects/${engagement.tasklytic_project_id}`}>
                <Link2 className="mr-2 size-4" />Open linked project
              </Link>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-2 size-4" />Invite contact
          </Button>
        </div>
      </div>

      {notice && (
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>{notice}</span>
          <button type="button" className="ml-auto" onClick={() => setNotice(null)} aria-label="Dismiss"><X className="size-4" /></button>
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-surface-muted"><UserPlus className="size-5 text-foreground-muted" /></div>
          <h3 className="mt-3 text-sm font-medium">No client contacts yet</h3>
          <p className="mt-1 text-sm text-foreground-muted">Invite a coordinator or contributor before publishing the engagement.</p>
        </div>
      ) : (
        <div className="divide-y">
          {contacts.map((contact) => {
            const requestCount = contact.role === 'coordinator' ? requests.length : (contact.request_ids || []).length
            const contactBusy = busy?.endsWith(contact.id)
            return (
              <div key={contact.id} className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {contact.name.trim().charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{contact.name}</p>
                      <Badge variant="outline">{contact.role === 'coordinator' ? 'Coordinator' : 'Contributor'}</Badge>
                      {!contact.active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <p className="truncate text-sm text-foreground-muted">{contact.email}</p>
                  </div>
                </div>
                <div className="md:w-44">
                  <p className="text-sm font-medium">{contact.role === 'coordinator' ? 'All requests' : `${requestCount} of ${requests.length} requests`}</p>
                  <p className="text-xs text-foreground-muted">{contact.role === 'coordinator' ? 'Full engagement access' : 'Limited request access'}</p>
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  <Button size="sm" variant="outline" disabled={!!contactBusy} onClick={() => openManage(contact)}>
                    <Settings2 className="mr-2 size-3.5" />Manage
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" disabled={!!contactBusy} aria-label={`More controls for ${contact.name}`}><MoreHorizontal className="size-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onSelect={() => sendAccessLink(contact, true)}><Mail />Send new link</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => sendAccessLink(contact, false)}><Copy />Copy new link</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setRemoving(contact)}><Trash2 />Remove access</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {engagement.status === 'draft' && contacts.length > 0 && (
        <div className="flex items-start gap-2 border-t bg-surface-muted/40 px-5 py-3 text-xs text-foreground-muted">
          <Link2 className="mt-0.5 size-3.5 shrink-0" />Portal access becomes available when this engagement is published.
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invite client contact</DialogTitle>
            <DialogDescription>Add the contact, choose their access, and send a secure one-time portal link.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={inviteContact}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="pbc-contact-name">Name</Label><Input id="pbc-contact-name" required value={invite.name} onChange={(event) => setInvite({ ...invite, name: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="pbc-contact-email">Email</Label><Input id="pbc-contact-email" required type="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} /></div>
            </div>
            <RoleField value={invite.role} onChange={(role) => setInvite({ ...invite, role })} />
            {invite.role === 'contributor' && <RequestAccessPicker requests={requests} selected={invite.requestIds} onChange={(requestIds) => setInvite({ ...invite, requestIds })} />}
            <Button className="w-full" disabled={busy === 'contact-invite' || invalidContributorInvite}>
              {busy === 'contact-invite' ? 'Sending…' : 'Add contact and send link'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!managing} onOpenChange={(open) => !open && setManaging(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage access</DialogTitle>
            <DialogDescription>Update the role and request visibility for {managing?.name}.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={saveAccess}>
            <RoleField value={access.role} onChange={(role) => setAccess({ ...access, role })} />
            {access.role === 'contributor' && <RequestAccessPicker requests={requests} selected={access.requestIds} onChange={(requestIds) => setAccess({ ...access, requestIds })} />}
            <Button className="w-full" disabled={!managing || busy === `contact-access-${managing?.id}` || invalidContributorAccess}>
              {busy === `contact-access-${managing?.id}` ? 'Saving…' : 'Save access'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This immediately revokes their outstanding links and active portal sessions for this engagement. The contact remains available elsewhere in the firm.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={removeAccess}>Remove access</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function RoleField({ value, onChange }: { value: ContactRole; onChange: (role: ContactRole) => void }) {
  return (
    <div className="space-y-2">
      <Label>Role</Label>
      <Select value={value} onValueChange={(role) => onChange(role as ContactRole)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="coordinator">Coordinator — all requests</SelectItem>
          <SelectItem value="contributor">Contributor — selected requests</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function RequestAccessPicker({ requests, selected, onChange }: {
  requests: PbcRequestItem[]
  selected: string[]
  onChange: (requestIds: string[]) => void
}) {
  const selectedSet = new Set(selected)
  const toggle = (requestId: string, checked: boolean) => {
    onChange(checked ? [...selectedSet, requestId] : selected.filter((id) => id !== requestId))
  }
  return (
    <fieldset className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div><legend className="text-sm font-medium">Request access</legend><p className="text-xs text-foreground-muted">Select at least one request.</p></div>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(selected.length === requests.length ? [] : requests.map((request) => request.id))}>
          {selected.length === requests.length ? 'Clear all' : 'Select all'}
        </Button>
      </div>
      <div className="max-h-60 divide-y overflow-y-auto rounded-lg border">
        {requests.length === 0 && <p className="p-4 text-sm text-foreground-muted">Add requests before assigning a contributor.</p>}
        {requests.map((request) => (
          <label key={request.id} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-surface-muted/50">
            <Checkbox className="mt-0.5" checked={selectedSet.has(request.id)} onCheckedChange={(checked) => toggle(request.id, checked === true)} />
            <span className="min-w-0 text-sm"><span className="mr-2 font-mono text-xs text-foreground-muted">{request.request_number}</span><span className="font-medium">{request.title}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
