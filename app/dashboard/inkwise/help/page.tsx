import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const steps = [
  'Upload one or more PDFs or DOCX files, or capture webpage snapshots in References.',
  'Wait for ingestion to finish so retrieval segments and embeddings are available.',
  'Create or open a document in Write, then bind the references you want to ground against from the sidebar.',
  'Use AI Chat, inline tools, retry controls, citation bubbles, and grounded prediction directly from the writing workspace.',
  'Open Document Settings for prompt guidance, Version History for restore, and Templates for reusable starters.',
]

export default function InkwiseHelpPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <CardTitle>How does Inkwise fit into CPAAutomation?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <p>
            Inkwise is the grounded writing workspace inside CPAAutomation. It combines references, drafting, AI chat, templates, and document history in one document-first experience.
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
          <CardTitle>What can Inkwise do now?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p>
            Inkwise now supports multimodal references, grounded chat, citation bubbles, retry flows, document version history, and grounded predictive writing.
          </p>
          <p>
            If AI outputs are not to your expectations, first confirm that your references are fully ingested and bound to the current document. If problems continue, contact us from the Contact page.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
