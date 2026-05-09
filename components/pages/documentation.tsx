import Link from 'next/link'
import { Database, FileText, Shield, Zap } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CodeBlock } from '@/components/marketing/code-block'
import { FeatureCard } from '@/components/marketing/feature-card'
import { IconTile } from '@/components/ui/icon-tile'
import { MarketingHero } from '@/components/marketing/marketing-hero'
import { Section } from '@/components/ui/section'

const API_ENDPOINTS = [
  {
    method: 'POST',
    endpoint: '/api/jobs/initiate',
    description: 'Create a new job and request signed upload URLs',
    params: ['files[]', 'name'],
  },
  {
    method: 'GET',
    endpoint: '/api/templates',
    description: 'List available templates',
    params: [],
  },
  {
    method: 'POST',
    endpoint: '/api/jobs/{job_id}/files:initiate',
    description: 'Initiate uploads for an existing job run',
    params: ['run_id', 'files[]'],
  },
  {
    method: 'POST',
    endpoint: '/api/jobs/{job_id}/start',
    description: 'Submit a configured job run for processing',
    params: ['run_id', 'fields', 'task_definitions'],
  },
]

const CODE_EXAMPLE = `// Initialize Financial Extract API
const fe = new FinancialExtract({
  apiKey: 'your_api_key',
  environment: 'production'
});

// Extract data from document
const result = await fe.extract({
  file: documentFile,
  template: 'invoice_processing',
  customRules: {
    'invoice_number': 'Find the invoice ID or reference number',
    'total_amount': 'Extract the final total amount due'
  }
});

// Get results in preferred format
const data = await result.export('excel');
console.log(data);`

const FILTER_EXAMPLES = [
  { query: 'has:attachment', description: 'Process any email with attachments' },
  {
    query: 'subject:invoice has:attachment',
    description: 'Process emails with "invoice" in subject and attachments',
  },
  { query: 'filename:pdf', description: 'Process emails with PDF file attachments' },
]

export default function Documentation() {
  return (
    <>
      <MarketingHero
        backdrop="plain"
        width="narrow"
        title="Documentation"
        description="Complete guide to integrating CPAAutomation into your workflow."
      />

      <section className="bg-background py-12 sm:py-16">
        <div className="mx-auto max-w-6xl space-y-16 px-4 sm:px-6 lg:px-8">
          {/* Quick Start */}
          <div>
            <h2 className="mb-8 text-balance text-3xl font-semibold tracking-tight text-foreground">
              Quick start guide
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <FeatureCard
                icon={FileText}
                tone="brand"
                title="1. Upload document"
                description="Send PDF or image files to our extraction API endpoint with your authentication token."
              />
              <FeatureCard
                icon={Zap}
                tone="success"
                title="2. Configure rules"
                description="Use pre-built templates or create custom extraction rules for your specific document types."
              />
              <FeatureCard
                icon={Database}
                tone="info"
                title="3. Get results"
                description="Receive structured data in JSON, Excel, or CSV format ready for your applications."
              />
            </div>
          </div>

          {/* API Reference */}
          <div>
            <h2 className="mb-8 text-balance text-3xl font-semibold tracking-tight text-foreground">
              API reference
            </h2>
            <Section variant="card">
              <div className="space-y-6">
                <div>
                  <h3 className="mb-3 text-lg font-semibold text-foreground">
                    Base URL
                  </h3>
                  <CodeBlock copyable={false}>
                    https://api.financialextract.com/v1
                  </CodeBlock>
                </div>

                <div>
                  <h3 className="mb-3 text-lg font-semibold text-foreground">
                    Endpoints
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-surface-muted">
                          <TableHead className="w-24">Method</TableHead>
                          <TableHead>Endpoint</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Parameters</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {API_ENDPOINTS.map((endpoint) => (
                          <TableRow key={endpoint.endpoint}>
                            <TableCell>
                              <Badge
                                variant={
                                  endpoint.method === 'GET'
                                    ? 'secondary'
                                    : 'default'
                                }
                              >
                                {endpoint.method}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {endpoint.endpoint}
                            </TableCell>
                            <TableCell className="text-sm text-foreground-muted">
                              {endpoint.description}
                            </TableCell>
                            <TableCell className="text-xs text-foreground-subtle">
                              {endpoint.params.join(', ') || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </Section>
          </div>

          {/* Code Example */}
          <div>
            <h2 className="mb-8 text-balance text-3xl font-semibold tracking-tight text-foreground">
              Code example
            </h2>
            <CodeBlock language="JavaScript" title="JavaScript SDK">
              {CODE_EXAMPLE}
            </CodeBlock>
            <p className="mt-3 text-sm text-foreground-muted">
              This example shows how to extract data from a document using our
              JavaScript SDK.
            </p>
          </div>

          {/* Email Automations */}
          <div>
            <h2 className="mb-8 text-balance text-3xl font-semibold tracking-tight text-foreground">
              Email automations
            </h2>
            <Section variant="card">
              <div className="space-y-6">
                <p className="text-foreground-muted">
                  Set up automated workflows to process documents sent via
                  email without manual intervention.
                </p>

                <div className="rounded-lg border border-primary/15 bg-primary-soft p-6">
                  <h4 className="mb-2 font-semibold text-primary-soft-foreground">
                    Email address for automations
                  </h4>
                  <p className="mb-2 font-mono text-xl text-primary-soft-foreground">
                    document@cpaautomation.ai
                  </p>
                  <p className="text-sm text-primary-soft-foreground/80">
                    Send or forward emails with PDF attachments to this address
                    to trigger your automations.
                  </p>
                </div>

                <div>
                  <h3 className="mb-4 text-xl font-semibold text-foreground">
                    How it works
                  </h3>
                  <ol className="list-decimal space-y-2 pl-6 text-foreground-muted">
                    <li>
                      <strong className="text-foreground">Send email:</strong>{' '}
                      Send or forward emails with PDF attachments to
                      document@cpaautomation.ai
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Account matching:
                      </strong>{' '}
                      System matches your sender email to your account
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Filter matching:
                      </strong>{' '}
                      Emails are checked against your automation filters
                    </li>
                    <li>
                      <strong className="text-foreground">Processing:</strong>{' '}
                      Matching attachments are automatically processed using
                      your extraction template
                    </li>
                    <li>
                      <strong className="text-foreground">Export:</strong>{' '}
                      Results are exported to your configured destination
                      (Google Drive, etc.)
                    </li>
                  </ol>
                </div>

                <div>
                  <h3 className="mb-4 text-xl font-semibold text-foreground">
                    Email filter examples
                  </h3>
                  <div className="space-y-2">
                    {FILTER_EXAMPLES.map((ex) => (
                      <CodeBlock
                        key={ex.query}
                        copyable={false}
                        title={ex.description}
                      >
                        {ex.query}
                      </CodeBlock>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-4 text-xl font-semibold text-foreground">
                    Requirements
                  </h3>
                  <ul className="list-disc space-y-2 pl-6 text-foreground-muted">
                    <li>Send from the same email address as your account</li>
                    <li>Include PDF attachments for processing</li>
                    <li>Email content should match your automation filters</li>
                    <li>
                      Have an active automation configured with appropriate
                      filters
                    </li>
                  </ul>
                </div>
              </div>
            </Section>
          </div>

          {/* Authentication */}
          <div>
            <h2 className="mb-8 text-balance text-3xl font-semibold tracking-tight text-foreground">
              Authentication
            </h2>
            <Section variant="card">
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <IconTile icon={Shield} tone="warning" size="lg" />
                  <div>
                    <h3 className="mb-2 text-lg font-semibold text-foreground">
                      API key authentication
                    </h3>
                    <p className="text-foreground-muted">
                      All API requests require authentication using your API
                      key in the Authorization header.
                    </p>
                  </div>
                </div>

                <CodeBlock copyable={false}>
                  Authorization: Bearer your_api_key_here
                </CodeBlock>

                <div>
                  <h4 className="mb-2 font-semibold text-foreground">
                    Getting your API key
                  </h4>
                  <ol className="list-decimal space-y-2 pl-6 text-foreground-muted">
                    <li>Log into your CPAAutomation dashboard</li>
                    <li>Navigate to Settings → API Keys</li>
                    <li>Click &ldquo;Generate New Key&rdquo;</li>
                    <li>Copy and securely store your key</li>
                  </ol>
                </div>

                <Alert>
                  <AlertDescription>
                    <strong>Security note:</strong> Keep your API keys secure
                    and never expose them in client-side code. Use environment
                    variables or secure key management systems.
                  </AlertDescription>
                </Alert>
              </div>
            </Section>
          </div>

          <Section
            variant="card"
            className="bg-surface-muted text-center"
            title="Need integration help?"
            description="Our technical team can help you integrate CPAAutomation into your existing workflow."
          >
            <div className="flex justify-center">
              <Button asChild>
                <Link href="/contact">Contact technical support</Link>
              </Button>
            </div>
          </Section>
        </div>
      </section>
    </>
  )
}
