import Link from 'next/link'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Section = { id: string; label: string }

const sections: Section[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'concepts', label: 'Key concepts' },
  { id: 'write', label: 'Documents and folders' },
  { id: 'editor', label: 'The editor' },
  { id: 'ai-tools', label: 'AI tools' },
  { id: 'citations', label: 'Citations and evidence' },
  { id: 'version-history', label: 'Version history' },
  { id: 'references', label: 'References' },
  { id: 'templates', label: 'Templates' },
  { id: 'export', label: 'Export' },
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
  { id: 'faq', label: 'FAQ and troubleshooting' },
  { id: 'limits', label: 'Known limits' },
  { id: 'contact', label: 'Get help' },
]

const overviewSteps = [
  'Upload sources in References — PDF, DOCX, ZIP, JPG, PNG, or capture a webpage. Audio and video uploads require a Pro plan.',
  'Wait for ingestion. Sources need status Ready before they can ground AI output.',
  'Open or create a document in Write, then bind the references you want this document grounded against from the editor sidebar.',
  'Draft with AI Chat, inline writing tools, and grounded prediction. Every grounded output cites the evidence it used.',
  'Use Document Settings for per-document guidance, Version History to restore prior drafts, and Templates to start from a reusable shape.',
]

const glossary: Array<{ term: string; definition: string }> = [
  {
    term: 'Reference / Source',
    definition:
      'An uploaded file or captured webpage that has been ingested into segments and embeddings. Sources live in the References page and can be bound to any document.',
  },
  {
    term: 'Document',
    definition:
      'A draft you write in the editor. The AI sees the document you have open, but documents are not visible to the AI from other documents.',
  },
  {
    term: 'Template',
    definition:
      'A reusable starter — either a personal template you create or a system template — used to prefill the content of a new document.',
  },
  {
    term: 'Binding',
    definition:
      'The per-document selection of which Ready sources are eligible for grounding. Binding is set from the editor sidebar, not on the source itself.',
  },
  {
    term: 'Grounding',
    definition:
      'When an AI output (chat, writing tool, prediction) is informed by retrieved passages from your bound sources. Grounded output cites specific evidence.',
  },
  {
    term: 'Evidence',
    definition:
      'The retrieved passages a grounded AI call used. Each piece of evidence shows up as a numbered citation bubble below the AI output.',
  },
  {
    term: 'Folder',
    definition:
      'Optional grouping for documents in Write. Documents without a folder are listed under Unfiled. Deleting a folder moves its documents to Unfiled — it does not delete them.',
  },
  {
    term: 'Revision',
    definition:
      'A snapshot of document content saved on save, AI tool application, accepted prediction, or restore. Revisions are listed in Version History.',
  },
]

const editorFeatures: Array<{ title: string; body: string }> = [
  {
    title: 'Formatting toolbar',
    body: 'Bold, italic, Heading 1, Heading 2, bullet list, numbered list, blockquote, undo, and redo — applied to the current selection or block.',
  },
  {
    title: 'Tables',
    body: 'Insert a table from the toolbar, then use the table-tools menu (active when your cursor is inside a table) to add or remove rows and columns.',
  },
  {
    title: 'Page breaks',
    body: 'Insert a page break to control where exported PDFs and DOCX files split.',
  },
  {
    title: 'Notes',
    body: 'Insert a footnote or endnote from the Notes button in the toolbar — useful when you want to author a citation manually instead of relying on AI evidence.',
  },
  {
    title: 'Comments',
    body: 'Select text in the editor, click Comment in the toolbar, and write a note. Open comments live in the Review tab of the right sidebar, where they can be jumped to, resolved, reopened, or deleted.',
  },
  {
    title: 'Track Changes',
    body: 'Toggle Track Changes in the toolbar to mark insertions and deletions for later review. Pending changes show up in the Review tab with per-change Accept and Reject buttons, plus Accept all and Reject all.',
  },
  {
    title: 'Document Settings',
    body: 'Click Settings to edit the document title, document guidance (a per-document prompt the AI sees on every grounded call), and citation style (Default, APA, MLA, Chicago, Bluebook, or No Citation Needed).',
  },
  {
    title: 'Focus mode',
    body: 'Click Focus mode for a distraction-free view with an optional white-noise background. Use the speaker icon to mute the audio; your mute preference is remembered.',
  },
  {
    title: 'Save state',
    body: 'The editor auto-saves on blur and when AI tools apply changes. The Save button forces an immediate save; the cloud icon and version number show the live save state.',
  },
]

export default function InkwiseHelpPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <nav aria-label="On this page" className="sticky top-32 space-y-1 text-sm">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            On this page
          </div>
          {sections.map((section) => (
            <Link
              key={section.id}
              href={`#${section.id}`}
              className="block rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {section.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="space-y-10">
        <Section id="overview" title="Overview">
          <Card>
            <CardHeader>
              <CardTitle>What Inkwise is</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-600">
              <p>
                Inkwise is the grounded writing workspace inside CPAAutomation. It pairs a document editor with a library of references, so AI assistance — chat, inline writing tools, and inline prediction — can draw from the sources you upload and cite the evidence it used.
              </p>
              <ol className="space-y-3">
                {overviewSteps.map((step, index) => (
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
        </Section>

        <Section id="concepts" title="Key concepts">
          <Card>
            <CardHeader>
              <CardTitle>Vocabulary used throughout Inkwise</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
                {glossary.map((entry) => (
                  <div key={entry.term} className="contents">
                    <dt className="font-semibold text-slate-900">{entry.term}</dt>
                    <dd className="text-slate-600">{entry.definition}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </Section>

        <Section id="write" title="Documents and folders">
          <Card>
            <CardHeader>
              <CardTitle>Managing documents in Write</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-600">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong className="text-slate-900">Create a document</strong> from the New document button. Name it later in Document Settings or in the title field at the top of the editor.
                </li>
                <li>
                  <strong className="text-slate-900">Search and sort</strong> the document grid by Updated, Title A–Z, Title Z–A, Newest, or Oldest.
                </li>
                <li>
                  <strong className="text-slate-900">Folders</strong> are listed in the left sidebar with per-folder document counts. Create, rename, and delete folders from the sidebar; deleting a folder moves its documents to <em>Unfiled</em> rather than deleting them.
                </li>
                <li>
                  <strong className="text-slate-900">Move documents</strong> between folders by drag and drop on the document grid.
                </li>
              </ul>
            </CardContent>
          </Card>
        </Section>

        <Section id="editor" title="The editor">
          <Card>
            <CardHeader>
              <CardTitle>What the editor lets you do</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {editorFeatures.map((feature) => (
                  <div key={feature.title} className="rounded-2xl border bg-slate-50/60 p-4">
                    <div className="text-sm font-semibold text-slate-900">{feature.title}</div>
                    <p className="mt-1 text-sm text-slate-600">{feature.body}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section id="ai-tools" title="AI tools">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>AI Chat</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <p>
                  AI Chat lives in the right sidebar of the editor. You can keep multiple threads per document; threads name themselves automatically after the first response.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>Citation bubbles appear inline in assistant messages whenever the answer is grounded in your bound sources.</li>
                  <li>
                    Use <strong className="text-slate-900">Retry</strong> to re-run generation against the same evidence, or <strong className="text-slate-900">Fresh evidence</strong> to re-run retrieval first.
                  </li>
                  <li>
                    Chat sees: your message, the thread history, your bound Ready sources, and the document&rsquo;s guidance and citation style from Document Settings.
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Inline writing tools</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <p>
                  Select text in the editor and the wand icon appears. Click it to open the Write with AI panel, then choose a preset or write a custom instruction:
                </p>
                <ul className="list-disc space-y-1.5 pl-5">
                  <li><strong className="text-slate-900">Coherent</strong> — improve flow, transitions, and structure while preserving meaning.</li>
                  <li><strong className="text-slate-900">Concise</strong> — shorten while preserving the key meaning and details.</li>
                  <li><strong className="text-slate-900">Detailed</strong> — expand with more relevant detail and specificity.</li>
                  <li><strong className="text-slate-900">Humanize</strong> — make the prose sound more natural.</li>
                  <li><strong className="text-slate-900">Custom</strong> — write your own instruction.</li>
                </ul>
                <p>
                  The panel shows your bound sources with checkboxes — by default all Ready sources are attached, and you can use Select All or None. Output streams in with a grounding badge (Grounded to N evidence segments, No matching evidence found, or fell back to ungrounded). When ready, use <strong className="text-slate-900">Replace selection</strong>, <strong className="text-slate-900">Insert after</strong>, or <strong className="text-slate-900">Insert</strong> to apply it. <strong className="text-slate-900">Retry</strong> reruns the call with fresh retrieval.
                </p>
                <p>
                  With no selection, the wand icon also appears on an empty line — pick Custom and the panel will draft from scratch into the cursor position.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Grounded prediction</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <p>
                  Pause typing and Inkwise drafts the next phrase as inline ghost text. The status bar under the editor tells you whether the suggestion is grounded in your references or ungrounded. If grounded, the evidence appears below the editor as citation bubbles before you accept.
                </p>
                <ul className="list-disc space-y-1.5 pl-5">
                  <li>Press <kbd className="rounded border bg-slate-100 px-1.5 py-0.5 text-xs">Tab</kbd> to accept the prediction.</li>
                  <li>Press <kbd className="rounded border bg-slate-100 px-1.5 py-0.5 text-xs">Esc</kbd> to dismiss it.</li>
                  <li>Predictions need a collapsed cursor (no active selection) and roughly one second of idle typing.</li>
                  <li>Up to ~4,000 characters of preceding text in the current block are used as context.</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section id="citations" title="Citations and evidence">
          <Card>
            <CardHeader>
              <CardTitle>How citations work</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <p>
                Any grounded AI output is followed by numbered citation bubbles. Click a bubble to open the Evidence Viewer, which shows the source title, the modality (e.g., PDF page, webpage section), the excerpt, and a preview of the asset. Use the arrows in the sheet to step through sibling evidence items.
              </p>
              <p>
                Inline citation formatting in inserted text is controlled by the <strong className="text-slate-900">Citation style</strong> setting in Document Settings: Default, APA, MLA, Chicago, Bluebook, or No Citation Needed. Choosing No Citation Needed keeps evidence bubbles available but does not add inline citations, footnotes, or endnotes to the document body.
              </p>
              <p>
                If a citation preview fails to load, the source was probably deleted or unbound after the message was generated. The citation reference stays in your chat history, but the asset is no longer available to preview.
              </p>
            </CardContent>
          </Card>
        </Section>

        <Section id="version-history" title="Version history">
          <Card>
            <CardHeader>
              <CardTitle>Restore and audit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <p>
                Open Version history from the editor&rsquo;s ⋮ menu. Each revision shows a revision number, a timestamp, and the action that created it.
              </p>
              <p>
                Select a revision to preview it, then click Restore to make it the new head. Restore is non-destructive — it creates a new revision rather than deleting history, so you can always restore an earlier revision again.
              </p>
            </CardContent>
          </Card>
        </Section>

        <Section id="references" title="References">
          <Card>
            <CardHeader>
              <CardTitle>Importing and managing sources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-600">
              <div>
                <div className="font-semibold text-slate-900">Supported file types</div>
                <p className="mt-1">
                  PDF, DOCX, ZIP archives (each contained file must be supported), JPG, PNG, and captured webpage snapshots. <strong className="text-slate-900">Pro plan</strong>: MP3, WAV, MP4, MPEG audio and video.
                </p>
              </div>

              <div>
                <div className="font-semibold text-slate-900">Three ways to import</div>
                <ul className="mt-1 list-disc space-y-1.5 pl-5">
                  <li><strong className="text-slate-900">Add Files</strong> or <strong className="text-slate-900">Add Folder</strong> — local file picker (multi-select; folder upload preserves relative paths).</li>
                  <li><strong className="text-slate-900">Capture Webpage</strong> — paste a URL to capture a snapshot, which is then stored and ingested.</li>
                  <li><strong className="text-slate-900">Google Drive</strong> — select files via the Drive picker; multi-select supported.</li>
                </ul>
              </div>

              <div>
                <div className="font-semibold text-slate-900">Ingestion lifecycle</div>
                <p className="mt-1">
                  Sources progress from Pending → Ingesting → <strong className="text-slate-900">Ready</strong> (or Error). Only Ready sources can be bound to a document or used for grounding. Ingestion runs in the background; refresh the page or come back in a moment.
                </p>
              </div>

              <div>
                <div className="font-semibold text-slate-900">Per-source actions</div>
                <ul className="mt-1 list-disc space-y-1.5 pl-5">
                  <li><strong className="text-slate-900">Preview</strong> — open the source in a new tab.</li>
                  <li><strong className="text-slate-900">Re-ingest</strong> — rebuild segments and embeddings, useful after editing metadata.</li>
                  <li><strong className="text-slate-900">Metadata</strong> — edit bibliographic metadata (title, authors, publication date, URL); used to format inline citations, footnotes, and endnotes.</li>
                  <li><strong className="text-slate-900">Remove</strong> — delete the source and break its bindings on every document.</li>
                </ul>
              </div>

              <div>
                <div className="font-semibold text-slate-900">Binding to a document</div>
                <p className="mt-1">
                  Binding is per-document. Open a document, switch the right sidebar to References, and pick which sources participate in grounding for that document.
                </p>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section id="templates" title="Templates">
          <Card>
            <CardHeader>
              <CardTitle>Reusable starters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong className="text-slate-900">My Templates</strong> — create a template from scratch, or import a DOCX file as a template.
                </li>
                <li>
                  <strong className="text-slate-900">System categories</strong> — read-only starters published for everyone, organized by category tabs.
                </li>
                <li>
                  Editing a template uses the same toolbar and shortcuts as the document editor.
                </li>
                <li>
                  <strong className="text-slate-900">Use Template</strong> creates a new document prefilled with that template&rsquo;s content.
                </li>
              </ul>
            </CardContent>
          </Card>
        </Section>

        <Section id="export" title="Export">
          <Card>
            <CardHeader>
              <CardTitle>Getting work out of Inkwise</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <p>From the editor&rsquo;s ⋮ menu:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li><strong className="text-slate-900">Export as PDF</strong> — downloads a PDF rendered from the document.</li>
                <li><strong className="text-slate-900">Export as DOCX</strong> — downloads a Word file (the most lossless option for formatting).</li>
                <li><strong className="text-slate-900">Export to Drive</strong> — opens a folder picker and creates a new PDF or DOCX in Google Drive. Each export creates a new file; existing Drive exports are not overwritten.</li>
              </ul>
            </CardContent>
          </Card>
        </Section>

        <Section id="shortcuts" title="Keyboard shortcuts">
          <Card>
            <CardHeader>
              <CardTitle>Shortcuts wired up in the editor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-2xl border">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Action</th>
                      <th className="px-4 py-2">Shortcut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-700">
                    <Shortcut action="Accept inline prediction" keys="Tab" />
                    <Shortcut action="Dismiss inline prediction" keys="Esc" />
                    <Shortcut action="Close Write with AI panel" keys="Esc" />
                    <Shortcut action="Bold / Italic" keys="⌘B / ⌘I" />
                    <Shortcut action="Undo / Redo" keys="⌘Z / ⌘⇧Z" />
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                On Windows and Linux, replace ⌘ with Ctrl.
              </p>
            </CardContent>
          </Card>
        </Section>

        <Section id="faq" title="FAQ and troubleshooting">
          <Card>
            <CardHeader>
              <CardTitle>Common questions</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              <Faq question='My source is stuck on "Ingesting…"'>
                Ingestion runs asynchronously — refresh the page or come back in a minute. If it stays stuck, click <strong className="text-slate-900">Re-ingest</strong> on the source.
              </Faq>
              <Faq question="The AI ignored my reference">
                Confirm the source status is <strong className="text-slate-900">Ready</strong>, that you bound it on the editor&rsquo;s References sidebar, and that the inline tool&rsquo;s source filter isn&rsquo;t excluding it. Try <strong className="text-slate-900">Fresh evidence</strong> to re-run retrieval.
              </Faq>
              <Faq question="The AI cited the wrong section">
                Use <strong className="text-slate-900">Fresh evidence</strong> to re-run retrieval. If it persists, edit the source&rsquo;s bibliographic metadata and Re-ingest.
              </Faq>
              <Faq question="Why is the citation preview blank?">
                The source was probably deleted or unbound after the message was generated. The citation reference stays in your chat history, but the asset is no longer available.
              </Faq>
              <Faq question="Predictions stopped appearing">
                Predictions need a collapsed cursor (no active selection) and at least a moment of idle typing. For grounded predictions specifically, the document also needs at least one bound Ready source.
              </Faq>
              <Faq question="Why can't I upload audio or video?">
                Audio and video references require a Pro plan. PDF, DOCX, ZIP, JPG, and PNG work on all plans, as does webpage capture.
              </Faq>
              <Faq question="I want plain prose without inline citations">
                Open Document Settings and set <strong className="text-slate-900">Citation style</strong> to <em>No Citation Needed</em>. Evidence bubbles will still appear under AI output for verification, but inserted text will not include inline citations, footnotes, or endnotes.
              </Faq>
              <Faq question="Can I undo a Restore?">
                Yes — Restore creates a new revision rather than deleting history. Open Version history again and restore an earlier revision.
              </Faq>
              <Faq question="Where did my document go?">
                If you deleted its folder, it moved to <strong className="text-slate-900">Unfiled</strong>, not the trash.
              </Faq>
              <Faq question="Track changes in Review tab show nothing">
                Track Changes only marks edits made <em>after</em> you turn it on. Toggle it from the editor toolbar, then start typing — pending insertions and deletions will appear in the Review tab of the right sidebar.
              </Faq>
            </CardContent>
          </Card>
        </Section>

        <Section id="limits" title="Known limits">
          <Card>
            <CardHeader>
              <CardTitle>Things to be aware of</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              <ul className="list-disc space-y-2 pl-5">
                <li>OCR for scanned PDFs is English only.</li>
                <li>Lexical full-text search is English only; vector retrieval works across languages.</li>
                <li>Inline prediction uses up to ~4,000 characters of preceding text in the current block as context.</li>
                <li>The reference library lists 50 sources per page.</li>
                <li>Audio and video references require a Pro plan.</li>
                <li>Each Drive export creates a new file — Inkwise does not overwrite previous Drive exports.</li>
              </ul>
            </CardContent>
          </Card>
        </Section>

        <Section id="contact" title="Get help">
          <Card>
            <CardHeader>
              <CardTitle>Still stuck?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <p>
                If something here didn&rsquo;t answer your question, reach out from the{' '}
                <Link href="/contact" className="font-medium text-emerald-700 underline-offset-4 hover:underline">
                  Contact page
                </Link>
                . When you write in, including the document name, the source name(s) you were grounding against, an approximate timestamp, and what you expected versus what happened helps us reproduce the issue quickly.
              </p>
            </CardContent>
          </Card>
        </Section>
      </div>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32 space-y-3">
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

function Shortcut({ action, keys }: { action: string; keys: string }) {
  return (
    <tr>
      <td className="px-4 py-2">{action}</td>
      <td className="px-4 py-2 font-mono text-xs">{keys}</td>
    </tr>
  )
}

function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group py-4 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-slate-900">
        <span>{question}</span>
        <span
          aria-hidden
          className="text-slate-400 transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="mt-2 text-sm text-slate-600">{children}</div>
    </details>
  )
}
