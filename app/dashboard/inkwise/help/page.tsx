import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const steps = [
  'Upload one or more PDFs in References.',
  'Wait for ingestion to finish so pages and tree nodes are available.',
  'Create a document in Write and bind the sources you want to ground against.',
  'Use chat or writing tools from the document workspace to draft against your evidence.',
  'Save reusable structures as templates for future work.',
]

export default function InkwiseHelpPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <CardTitle>How Inkwise Fits Into CPAAutomation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <p>
            Inkwise is now a drafting module inside your existing dashboard. It uses the same account, PostgreSQL database, GCS bucket,
            and Vertex-backed model access as the rest of the platform.
          </p>
          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Phase</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p>
            This frontend integration is in progress. The core document, sources, templates, retrieval, chat, and writing tool APIs are now wired,
            and the dashboard routes are being ported module by module.
          </p>
          <p>
            The current workspace is intentionally practical first: it focuses on connecting the new backend cleanly before the richer Inkwise V2 editor
            and polish are fully ported.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
