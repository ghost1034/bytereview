import Link from 'next/link'
import {
  Archive,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileCheck2,
  FileLock2,
  Fingerprint,
  Hash,
  KeyRound,
  Scale,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'

const requirements = [
  {
    title: 'Consent to electronic records',
    statute: 'ESIGN consumer consent and UETA consent principles',
    icon: ClipboardCheck,
    status: 'Met in product flow',
    description: 'Before signing, each signer must accept the envelope-specific electronic records disclosure. CPAAutomation stores the disclosure text hash, signer IP address, user agent, and consent timestamp.',
    evidence: 'esign_consent_records plus consent_given audit events.',
  },
  {
    title: 'Intent to sign',
    statute: 'ESIGN/UETA intent requirement',
    icon: BadgeCheck,
    status: 'Met in product flow',
    description: 'The signing ceremony requires an explicit signature adoption step and submit action. The product flow requires assigned fields to be completed before the signature can be submitted.',
    evidence: 'Adopt-and-sign submit endpoint, field validation, signed audit events, and signature records.',
  },
  {
    title: 'Attribution to the signer',
    statute: 'UETA attribution and authentication evidence',
    icon: Fingerprint,
    status: 'Met with authentication evidence',
    description: 'Recipients are authorized by a hashed, expiring bearer link delivered to the sender-selected email address. Account authentication remains available as an optional stronger access path.',
    evidence: 'Recipient and invitation IDs, access method, IP address, user agent, event timestamps, and Firebase/MFA evidence when an account path is used.',
  },
  {
    title: 'Association of signature with record',
    statute: 'ESIGN/UETA signature attached to or logically associated with the record',
    icon: FileCheck2,
    status: 'Met in completed PDF',
    description: 'Signed fields are flattened into the PDF and the completed PDF is sealed as one record. The certificate of completion is retained as a separate record.',
    evidence: 'Flattened document hashes, signature field records, certificate PDF, and final sealed PDF hash.',
  },
  {
    title: 'Tamper evidence',
    statute: 'Integrity and evidentiary reliability requirement',
    icon: FileLock2,
    status: 'Met for completed envelopes',
    description: 'Completed PDFs are sealed with a PAdES digital signature using a KMS-backed asymmetric key. Signature validation reports later PDF modifications, while hash comparison detects byte-level differences from the stored record.',
    evidence: 'pyHanko PAdES seal, KMS key-version details, sealed SHA-256, and verification endpoint results.',
  },
  {
    title: 'Record retention and reproducibility',
    statute: 'ESIGN retained-record accessibility requirement',
    icon: Archive,
    status: 'Met by application design',
    description: 'Envelopes are voided rather than hard-deleted. Original, flattened, sealed, certificate, consent, signature, and audit evidence is stored for later download or verification.',
    evidence: 'No envelope delete route, restricted audit-event foreign key, GCS object references, and download URLs for retained PDFs.',
  },
  {
    title: 'Audit trail integrity',
    statute: 'Evidentiary chain of custody',
    icon: ShieldCheck,
    status: 'Met for audit events',
    description: 'The audit trail records create, send, view, consent, sign, decline, void, reminder, completed, sealed, and expired events. A database trigger blocks update or delete of audit events.',
    evidence: 'Append-only esign_events table with actor, recipient, IP, user agent, MFA metadata, details, and timestamp.',
  },
  {
    title: 'Independent verification',
    statute: 'Practical evidentiary validation',
    icon: Hash,
    status: 'Met in product tooling',
    description: 'Users can verify a completed envelope by ID or upload a PDF to compare SHA-256 hashes and validate the embedded PAdES signature.',
    evidence: '/dashboard/esign/verify and POST /api/esign/verify.',
  },
]

const esraRequirements = [
  {
    requirement: 'Electronic signature definition',
    status: 'Met',
    detail: 'CPAAutomation uses typed or drawn signature adoption as an electronic process attached to and logically associated with the envelope PDF.',
  },
  {
    requirement: 'Intent to sign',
    status: 'Met',
    detail: 'The signer must complete the signing ceremony and submit the envelope after adopting a signature; passive viewing does not sign the record.',
  },
  {
    requirement: 'Attribution and signer identity',
    status: 'Met',
    detail: 'Signer access is limited by a hashed secure-link credential tied to one envelope recipient, with account and phone-MFA evidence recorded only when that access path is used.',
  },
  {
    requirement: 'Capable of verification',
    status: 'Met',
    detail: 'Verification is supported by recipient records, consent records, signature records, audit events, SHA-256 hashes, the certificate of completion, and the PAdES validation endpoint.',
  },
  {
    requirement: 'Signature associated with the record',
    status: 'Met',
    detail: 'Fields are flattened into the signed PDF and the final PDF is sealed as one completed record. The completion certificate is retained separately.',
  },
  {
    requirement: 'Tamper evidence after completion',
    status: 'Met',
    detail: 'The completed PDF is sealed with a PAdES digital signature; signature validation, modification reporting, and stored hashes help detect altered PDFs.',
  },
  {
    requirement: 'Retention and accessibility',
    status: 'Supported',
    detail: 'The product retains envelopes and completed PDFs for later download and verification, but customer retention periods and New York records schedules remain customer-specific.',
  },
  {
    requirement: 'Agency acceptance and transaction authority',
    status: 'Customer-specific',
    detail: 'ESRA does not force every New York state or local agency to accept every electronic process. Agency rules, filing instructions, and document-specific statutes still control.',
  },
]

function RequirementCard({ requirement }: { requirement: (typeof requirements)[number] }) {
  const Icon = requirement.icon
  return (
    <article className="rounded-xl border border-border bg-surface p-5 shadow-xs">
      <div className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success" aria-hidden>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 space-y-2">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">{requirement.statute}</p>
            <h3 className="text-base font-semibold text-foreground">{requirement.title}</h3>
          </div>
          <span className="inline-flex items-center rounded-full border border-success/30 bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">
            <CheckCircle2 className="mr-1 size-3.5" aria-hidden />
            {requirement.status}
          </span>
          <p className="text-sm leading-6 text-foreground-muted">{requirement.description}</p>
          <p className="text-xs leading-5 text-foreground-subtle">
            <span className="font-medium text-foreground-muted">Evidence:</span> {requirement.evidence}
          </p>
        </div>
      </div>
    </article>
  )
}

export default function EsignLegalPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="E-Signature Legal Basis"
        title="Electronic signature requirements we support"
        description="A product-level summary of the controls CPAAutomation implements for legally defensible electronic signatures. This is a technical compliance summary, not legal advice."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/esign">
              <ArrowLeft className="mr-1.5 size-3.5" aria-hidden />
              Back to envelopes
            </Link>
          </Button>
        }
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-xs">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-5 p-6 sm:p-8">
            <div className="flex items-center gap-3 text-success">
              <span className="flex size-11 items-center justify-center rounded-xl bg-success-soft" aria-hidden>
                <Scale className="size-5" />
              </span>
              <p className="text-sm font-medium uppercase tracking-wide">Review result</p>
            </div>
            <div className="space-y-3">
              <h2 className="max-w-3xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                The module satisfies the core US ESIGN/UETA product controls for ordinary business e-signatures.
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-foreground-muted">
                CPAAutomation captures consent, signer intent, authentication evidence, field-level signature records, immutable audit events, document hashes, a completion certificate, and a tamper-evident PAdES seal on completed PDFs.
              </p>
            </div>
          </div>
          <div className="border-t border-border bg-surface-muted p-6 lg:border-l lg:border-t-0">
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <KeyRound className="size-4 text-success" aria-hidden />
                  Authentication
                </div>
                <p className="mt-2 text-sm leading-6 text-foreground-muted">Recipients may use a secure email link without an account. Account and phone-MFA evidence is captured when that optional access path is used.</p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Eye className="size-4 text-success" aria-hidden />
                  Evidence trail
                </div>
                <p className="mt-2 text-sm leading-6 text-foreground-muted">Audit events record actor, recipient, time, IP address, user agent, MFA data, and event details.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Section variant="card" title="What the implementation meets" description="Each item maps a legal enforceability requirement to implemented CPAAutomation evidence.">
        <div className="grid gap-4 xl:grid-cols-2">
          {requirements.map((requirement) => (
            <RequirementCard key={requirement.title} requirement={requirement} />
          ))}
        </div>
      </Section>

      <Section
        variant="card"
        title="New York ESRA coverage"
        description="New York's Electronic Signatures and Records Act recognizes electronic signatures and records when the electronic process satisfies the signature, attribution, verification, association, and retention needs of the transaction."
      >
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-[minmax(0,1fr)_8rem] bg-surface-muted px-4 py-3 text-xs font-medium uppercase tracking-wide text-foreground-subtle md:grid-cols-[minmax(0,16rem)_8rem_minmax(0,1fr)]">
            <div>ESRA item</div>
            <div>Status</div>
            <div className="hidden md:block">CPAAutomation support</div>
          </div>
          <div className="divide-y divide-border bg-surface">
            {esraRequirements.map((item) => (
              <div key={item.requirement} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,16rem)_8rem_minmax(0,1fr)] md:items-start">
                <div className="font-medium text-foreground">{item.requirement}</div>
                <div>
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${item.status === 'Met' ? 'border-success/30 bg-success-soft text-success' : item.status === 'Supported' ? 'border-info/30 bg-info-soft text-info' : 'border-warning/30 bg-warning-soft text-warning'}`}>
                    {item.status}
                  </span>
                </div>
                <p className="text-sm leading-6 text-foreground-muted">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-warning/30 bg-warning-soft p-4">
          <div className="flex gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="text-sm leading-6 text-foreground-muted">
              ESRA readiness is not the same as universal New York acceptance. CPAAutomation provides the technical controls and evidence trail, but the sender must confirm that the relevant New York agency, court, filing portal, or transaction type accepts electronic signatures for the specific document.
            </p>
          </div>
        </div>
      </Section>
    </div>
  )
}
