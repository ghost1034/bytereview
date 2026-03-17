import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const steps = [
  'Upload one or more PDFs in References.',
  'Wait for ingestion to finish so retrieval segments and embeddings are available.',
  'Create a document in Write and bind the sources you want to ground against.',
  'Use chat or writing tools from the document workspace to draft against your evidence.',
  'Save reusable structures as templates for future work.',
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
            Inkwise is now a module within CPAAutomation.
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
          <CardTitle>Having issues?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p>
            Our upgraded AI drafting pipeline is actively under development.
          </p>
          <p>
            If AI outputs are not to your expectations, please contact us on our Contact page.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
