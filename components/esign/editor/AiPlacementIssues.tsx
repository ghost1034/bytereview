import type { EsignAiFieldPlacementIssue } from '@/lib/api'

export function AiPlacementIssues({ issues, onFocus }: {
  issues: EsignAiFieldPlacementIssue[]
  onFocus: (issue: EsignAiFieldPlacementIssue) => void
}) {
  if (!issues.length) return null
  return <div className="space-y-2 rounded bg-warning-soft p-2 text-warning" data-testid="ai-placement-issues">
    <p className="font-medium">Locations needing review</p>
    {issues.map((issue, index) => <div key={`${issue.target_id ?? issue.document_id}-${index}`}>
      <button type="button" className="text-left font-medium underline underline-offset-2" onClick={() => onFocus(issue)}>
        {issue.label} · Page {issue.page_number + 1}
      </button>
      <p>{issue.reason}</p>
    </div>)}
  </div>
}
