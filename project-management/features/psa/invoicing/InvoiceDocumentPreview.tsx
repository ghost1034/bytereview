'use client'

import { formatMoney } from '../../../lib/billing/formatMoney'
import Image from 'next/image'

type PreviewLine = {
  id: string
  description: string
  amount: number
  serviceDate?: string
  professionalCategory?: string
  matterProjectLabel?: string
  quantity?: number
  rate?: number
}

type Props = {
  issuerName: string
  issuerDetails?: string
  billToName: string
  billToDetails?: string
  invoiceNumber: string
  issueDate?: string
  dueOn?: string
  periodStart?: string
  periodEnd?: string
  currency?: string
  accentColor?: string
  linePresentation: 'detailed' | 'summary'
  lines: PreviewLine[]
  subtotal: number
  discount?: number
  tax?: number
  taxLabel?: string
  total: number
  notes?: string
  paymentInstructions?: string
  footer?: string
  logoUrl?: string
}

export function InvoiceDocumentPreview(props: Props) {
  const currency = props.currency ?? 'USD'
  const money = (amount: number) => formatMoney(amount, currency)
  return <article className="mx-auto w-full max-w-[52rem] overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-sm" aria-label="Invoice document preview">
    <div className="h-1.5" style={{ backgroundColor: props.accentColor ?? '#2563EB' }} />
    <div className="space-y-6 p-5 sm:p-8">
      <header className="flex items-start justify-between gap-6">
        <div className="flex items-start gap-4">{props.logoUrl ? <Image alt="Invoice logo preview" className="h-auto max-h-14 w-auto max-w-36 object-contain" height={56} src={props.logoUrl} unoptimized width={144} /> : null}<div><h3 className="font-sans text-lg font-semibold">{props.issuerName || 'Your firm'}</h3>{props.issuerDetails ? <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{props.issuerDetails}</p> : null}</div></div>
        <div className="text-right"><p className="font-sans text-2xl font-semibold" style={{ color: props.accentColor ?? '#2563EB' }}>INVOICE</p><p className="font-mono text-sm">{props.invoiceNumber}</p><p className="mt-2 text-xs">Issued {props.issueDate || '—'}<br />Due {props.dueOn || '—'}</p></div>
      </header>
      <div className="h-0.5" style={{ backgroundColor: props.accentColor ?? '#2563EB' }} />
      <section className="grid gap-4 text-sm sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bill to</p><p className="font-medium">{props.billToName || 'Client'}</p>{props.billToDetails ? <p className="whitespace-pre-line text-xs text-muted-foreground">{props.billToDetails}</p> : null}</div><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service period</p><p>{props.periodStart || '—'} to {props.periodEnd || '—'}</p></div></section>
      <div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-xs"><thead><tr style={{ backgroundColor: props.accentColor ?? '#2563EB', color: 'white' }}>{props.linePresentation === 'detailed' ? <><th className="p-2 text-left">Date</th><th className="p-2 text-left">Narrative</th><th className="p-2 text-left">Professional / category</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Amount</th></> : <><th className="p-2 text-left">Matter / project</th><th className="p-2 text-left">Charge description</th><th className="p-2 text-right">Amount</th></>}</tr></thead><tbody>{props.lines.map((line) => props.linePresentation === 'detailed' ? <tr className="border-b border-border" key={line.id}><td className="p-2">{line.serviceDate || '—'}</td><td className="max-w-60 p-2">{line.description}</td><td className="p-2">{line.professionalCategory || line.matterProjectLabel || '—'}</td><td className="p-2 text-right font-mono">{line.quantity ?? 0}</td><td className="p-2 text-right font-mono">{money(line.rate ?? 0)}</td><td className="p-2 text-right font-mono">{money(line.amount)}</td></tr> : <tr className="border-b border-border" key={line.id}><td className="p-2">{line.matterProjectLabel || 'General'}</td><td className="p-2">{line.description}</td><td className="p-2 text-right font-mono">{money(line.amount)}</td></tr>)}</tbody></table></div>
      <div className="ml-auto w-full max-w-xs space-y-1 text-sm"><p className="flex justify-between"><span>Subtotal</span><span className="font-mono">{money(props.subtotal)}</span></p>{props.discount ? <p className="flex justify-between"><span>Discount</span><span className="font-mono">-{money(props.discount)}</span></p> : null}{props.tax ? <p className="flex justify-between"><span>{props.taxLabel || 'Tax'}</span><span className="font-mono">{money(props.tax)}</span></p> : null}<p className="flex justify-between border-t-2 pt-2 font-semibold" style={{ borderColor: props.accentColor ?? '#2563EB' }}><span>Amount due</span><span className="font-mono">{money(props.total)}</span></p></div>
      {props.notes ? <section><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p><p className="whitespace-pre-line text-xs">{props.notes}</p></section> : null}
      {props.paymentInstructions ? <section><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment / remittance</p><p className="whitespace-pre-line text-xs">{props.paymentInstructions}</p></section> : null}
      {props.footer ? <footer className="border-t border-border pt-3 text-center text-[10px] text-muted-foreground">{props.footer}</footer> : null}
    </div>
  </article>
}
