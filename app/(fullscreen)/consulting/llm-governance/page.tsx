import { generateMetadata, pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.llmGovernance)

// The LLM governance deck is a self-contained HTML presentation (fixed 1920x1080
// stage, document-level keyboard/wheel/touch navigation, its own global styles).
// It is served verbatim from /public and embedded in an iframe so its styles and
// listeners stay isolated from the app shell.
export default function LlmGovernancePage() {
  return (
    <iframe
      src="/llm-governance.html"
      title="CPA Automation - LLM Governance Operating Model"
      className="block h-full w-full border-0"
      allowFullScreen
    />
  )
}
