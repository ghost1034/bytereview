import { commands, page } from '@vitest/browser/context'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'

import '@/app/globals.css'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const RECORD_BASELINES = false
const surfaces = [
  'home',
  'project-list',
  'project-board',
  'project-timeline',
  'task-detail',
  'inbox',
  'reporting',
  'settings',
  'psa-tables',
] as const

type Surface = (typeof surfaces)[number]

function Rows({ labels }: { labels: string[] }) {
  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card">
      {labels.map((label, index) => (
        <div className="flex h-9 items-center gap-3 px-3 text-sm" key={label}>
          <span className="size-3 rounded-full border border-border-strong" />
          <span className="flex-1">{label}</span>
          <Badge variant="outline">{index % 2 ? 'In review' : 'On track'}</Badge>
        </div>
      ))}
    </div>
  )
}

function SurfaceBody({ surface }: { surface: Surface }) {
  if (surface === 'home') {
    return <div className="grid gap-3 md:grid-cols-3">{['My tasks', 'Goals', 'Recent projects'].map((title) => <Card key={title}><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><Rows labels={['Tax close', 'Client review']} /></CardContent></Card>)}</div>
  }
  if (surface === 'project-list') return <Rows labels={['Reconcile cash', 'Review variance', 'Issue close package', 'Collect approval']} />
  if (surface === 'project-board') {
    return <div className="grid gap-3 md:grid-cols-3">{['To do', 'In progress', 'Complete'].map((title) => <Card key={title}><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="space-y-2"><div className="rounded-md border p-3 text-sm">Reconcile cash</div><div className="rounded-md border p-3 text-sm">Review variance</div></CardContent></Card>)}</div>
  }
  if (surface === 'project-timeline') {
    return <div className="overflow-hidden rounded-lg border"><div className="grid grid-cols-[180px_repeat(5,1fr)] bg-surface-muted text-xs"><span className="p-2">Task</span>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day) => <span className="border-l p-2" key={day}>{day}</span>)}</div>{['Reconcile cash', 'Review variance', 'Close package'].map((task, index) => <div className="grid h-11 grid-cols-[180px_repeat(5,1fr)] items-center border-t text-sm" key={task}><span className="px-2">{task}</span><span className="col-span-3 h-5 rounded bg-primary" style={{ gridColumnStart: index + 2 }} /></div>)}</div>
  }
  if (surface === 'task-detail') {
    return <Card className="ml-auto max-w-2xl"><CardHeader><CardTitle>Reconcile cash</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Input aria-label="Assignee reference" value="Morgan Lee" readOnly /><Input aria-label="Due date reference" value="August 31" readOnly /><div className="min-h-28 rounded-md border p-3 text-sm sm:col-span-2">Document the reconciliation and attach the final support.</div><Button className="w-fit">Complete task</Button></CardContent></Card>
  }
  if (surface === 'inbox') {
    return <div className="grid overflow-hidden rounded-lg border md:grid-cols-[360px_1fr]"><div className="border-r p-3"><Input aria-label="Inbox filter reference" placeholder="Filter inbox" className="mb-3" /><Rows labels={['Morgan mentioned you', 'Task assigned', 'Approval requested']} /></div><div className="p-6"><Badge>Unread</Badge><h2 className="mt-3 text-xl font-semibold">Reconcile cash</h2><p className="mt-2 text-sm text-foreground-muted">Morgan assigned this task to you for review.</p></div></div>
  }
  if (surface === 'reporting') {
    return <div className="grid gap-3 md:grid-cols-3">{['Open work', 'Utilization', 'Budget'].map((title, index) => <Card key={title}><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold tabular-nums">{[42, 87, 64][index]}{index ? '%' : ''}</p><div className="mt-4 h-2 rounded bg-primary-soft"><div className="h-full w-2/3 rounded bg-primary" /></div></CardContent></Card>)}</div>
  }
  if (surface === 'settings') {
    return <div className="grid gap-3 md:grid-cols-3">{['Workspace', 'Members', 'Integrations', 'Approvals', 'Billing controls', 'AI teammates'].map((title) => <Card key={title}><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="text-sm text-foreground-muted">Configure shared workspace behavior.</CardContent></Card>)}</div>
  }
  return <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[880px] text-sm"><thead className="bg-surface-muted text-left"><tr><th className="p-3">Professional</th><th>Client</th><th>Hours</th><th>Rate</th><th>Amount</th><th>Status</th></tr></thead><tbody>{['Alex Admin', 'Morgan Lee', 'Taylor Reed'].map((name, index) => <tr className="border-t" key={name}><td className="p-3">{name}</td><td>Northstar Advisory</td><td>{7 + index}.5</td><td>$240</td><td>$1,800</td><td><Badge variant="outline">Approved</Badge></td></tr>)}</tbody></table></div>
}

function TasklyticVisualReference({ surface }: { surface: Surface }) {
  const title = surface.replace(/-/g, ' ')
  return (
    <main className="tasklytic-root min-h-[720px] bg-background font-sans text-foreground" aria-label={`${title} visual reference`}>
      <header className="flex h-14 items-center gap-3 border-b border-border px-4">
        <span className="font-semibold">CPAAutomation</span><span className="text-foreground-subtle">/</span><span className="capitalize">{title}</span><span className="flex-1" /><Input aria-label="Shared search reference" className="w-64" placeholder="Search…" /><Button>Create</Button>
      </header>
      <div className="grid min-h-[666px] grid-cols-[220px_1fr]">
        <nav className="border-r border-border bg-surface-muted p-3" aria-label="Tasklytic reference navigation"><p className="mb-3 text-sm font-medium">Northstar workspace</p>{['Home', 'My tasks', 'Projects', 'Inbox', 'Reporting'].map((item) => <div className="rounded-md px-2 py-2 text-sm" key={item}>{item}</div>)}</nav>
        <section className="min-w-0 p-5"><div className="mb-4 flex items-center gap-3"><h1 className="text-2xl font-semibold capitalize">{title}</h1><span className="flex-1" /><Button variant="outline">Customize</Button></div><SurfaceBody surface={surface} /></section>
      </div>
    </main>
  )
}

async function expectVisualBaseline(surface: Surface, element: Element) {
  const path = `project-management/visual-baselines/${surface}.png`
  const screenshot = await page.screenshot({ element, save: false })
  if (RECORD_BASELINES) {
    await commands.writeFile(path, screenshot, 'base64')
    return
  }
  expect(screenshot).toBe(await commands.readFile(path, 'base64'))
}

describe('Tasklytic shared-shell visual baselines', () => {
  for (const surface of surfaces) {
    it(`matches the ${surface} CPAAutomation reference`, async () => {
      await page.viewport(1440, 900)
      const screen = render(<TasklyticVisualReference surface={surface} />)
      await expectVisualBaseline(surface, screen.getByRole('main').element())
    })
  }
})
