# Inkwise Demo Script — RAG & the Evidence Inspector

**Demo:** How Inkwise RAG works, the evidence inspector, and how RAG prevents hallucinations
**Target length:** 8–9 minutes
**Presenter setup:** Logged into CPAAutomation, Inkwise open. Use a *different* library state than the citation demo (or a separate demo account) so only this demo's sources appear. Browser at 100% zoom, 1920×1080 recording.

---

## Reference set

Three well-known financial documents — the natural material for a CPA audience, and rich in precise numbers, which is exactly where hallucination matters most:

| # | Reference | Type | How to add |
|---|-----------|------|------------|
| 1 | Apple Inc., Form 10-K, fiscal year 2023 | PDF | **Add Files** → PDF from SEC EDGAR (`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&type=10-K` → FY2023 filing) |
| 2 | Berkshire Hathaway, 2023 Annual Shareholder Letter (Warren Buffett) | PDF | **Add Files** → `https://www.berkshirehathaway.com/letters/2023ltr.pdf` |
| 3 | SEC Investor.gov, "How to Read a 10-K/10-Q" investor bulletin | Webpage | **Capture Webpage** → `https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/how-read-10` |

**Pre-record prep (do before recording):**

- [ ] Download both PDFs; verify the Apple 10-K is the FY2023 filing (net sales $383,285M; total net sales down 3% year over year) so you can vouch for the numbers on camera.
- [ ] **Ingest all three sources before recording.** The 10-K is large; this demo narrates ingestion over already-processing/processed cards rather than waiting live. Optionally re-add one small source on camera to show live status changes.
- [ ] Create a document `FY2023 Market Review — Client Briefing` in advance is **not** needed — it's created on camera.
- [ ] Dry-run every prompt below once and note which pages the evidence lands on, so you can react naturally on camera.

---

## Scene 1 — Intro: the problem (0:00–0:50)

> **SPOKEN:** "Everyone has seen an AI assistant state a wrong number with total confidence. For our customers — accountants, auditors, lawyers — a fabricated figure isn't an oops, it's a liability. Inkwise is built on a different contract: the AI may only write from documents you gave it, and it has to show you where every claim came from. The machinery behind that contract is called RAG — retrieval-augmented generation — and in this demo I'll show you how Inkwise RAG works, how to audit it with the evidence inspector, and what happens when you ask about something your documents don't contain."

**ACTIONS:**

1. Start on the Inkwise **References** page with the three source cards visible.

---

## Scene 2 — Ingestion: how sources become evidence (0:50–2:00)

**ACTIONS:**

1. Hover over the three cards; point at the status labels and page counts.
2. (Optional live moment) Re-add the Investor.gov capture or click **Re-ingest** on it to show the status walk: *Queued for ingestion* → *Preparing for grounding* → **Ready for binding**.

> **SPOKEN:** "My library has three documents everyone in finance knows: Apple's fiscal 2023 10-K, Warren Buffett's 2023 shareholder letter, and the SEC's own investor bulletin on how to read a 10-K — that last one captured straight from the webpage. When a source is added, Inkwise ingests it: the document is split into segments — pages, sections, passages — and each segment is indexed two ways: semantically, as vector embeddings that capture meaning, and lexically, for exact words and figures. That dual index matters in this domain: 'net sales' needs to match by meaning, but '$383 billion' needs to match exactly. When a card says **Ready for binding**, the source is fully indexed and can ground the AI."

**EXPECT:** Cards show type, page counts, and **Ready for binding**.

---

## Scene 3 — Bind and ask: retrieval in action (2:00–3:30)

**ACTIONS:**

1. Switch to **Write** → **New document** → title `FY2023 Market Review — Client Briefing` → **Create & Open**.
2. Open the right sidebar → **References** tab → **Bind** all three sources.
3. Switch to the **AI Chat** tab. In **Chat references** at the bottom, confirm all three sources are ticked.
4. Type the first question:

   > **PROMPT:** `What were Apple's total net sales in fiscal 2023, and how did they change from fiscal 2022?`

5. Send, and let the answer stream.

> **SPOKEN (while it streams):** "Here's what just happened behind that question. Inkwise turned it into a retrieval query, ran it against both indexes — the semantic one and the exact-match one — fused the results, and re-ranked them so the best passages win. Those top passages become an evidence pack, and the model is instructed to answer using *only* that evidence — with a citation for every claim. So the number you're about to see isn't from the model's memory of Apple. It's read out of the 10-K we uploaded."

**EXPECT:** A grounded answer stating net sales of ~$383.3 billion, down ~3% from fiscal 2022, with citation bubbles attached.

---

## Scene 4 — The evidence inspector (3:30–5:15)

*This is the heart of the demo — take it slowly.*

**ACTIONS:**

1. Click the citation bubble on the net-sales sentence. The evidence sheet opens.
2. Walk the panel top to bottom:
   - **Evidence** — the retrieved passage, with the cited span highlighted; click **Show full passage** and back to **Show cited passage**.
   - **Locator** — the page reference (e.g., *p.N* of the 10-K).
   - **Reference Preview** — the actual PDF, opened at that page, with the cited text findable; click **Open snapshot** to show it in a full tab if you like.
3. Use the **‹ ›** arrows at the top to step through *Evidence 1 of N* → *Evidence 2 of N*.

> **SPOKEN:** "This is the evidence inspector. Click any citation and you get three layers of proof. First, the evidence excerpt — the exact passage that was retrieved, with the specific words supporting the sentence highlighted. Inkwise pins each citation to a verbatim quote from the source, so this isn't 'somewhere in this document' — it's *these words*. Second, the locator: page such-and-such of the 10-K. Third, the reference preview: the actual filing, opened to that page, so you can verify with your own eyes in the primary document. And when a claim rests on several passages, you can step through each piece of evidence right here. For an auditor, this is the difference between trusting the tool and *verifying* the tool — every number in the draft has a paper trail."

**EXPECT:** Highlighted excerpt, page locator, embedded PDF preview at the cited page; arrows navigate between evidence items.

4. Close the sheet. Hover the assistant answer and click **Append to end** (or **Insert at cursor**).

> **SPOKEN:** "And when I move the answer into my draft, the citations travel with it — the paper trail follows the text into the document."

**EXPECT:** The paragraph lands in the editor with green citation anchors attached.

---

## Scene 5 — Conversational retrieval + a second source (5:15–6:15)

**ACTIONS:**

1. Back in **AI Chat**, ask the follow-up exactly as written (the vague "that" is deliberate):

   > **PROMPT:** `How does that compare with what Buffett said about Berkshire's operating earnings for 2023?`

2. When the answer arrives, click a citation bubble and show that the evidence now comes from the shareholder letter.

> **SPOKEN:** "Notice I asked a lazy follow-up — 'how does *that* compare' — without repeating myself. Before retrieving, Inkwise rewrites the question into a standalone one using the conversation, so retrieval still finds the right passages — this time in a completely different document. Open the citation, and the inspector now shows Buffett's letter: same excerpt, same locator, same preview, different source."

**EXPECT:** Answer contrasts Apple's revenue decline with Berkshire's record 2023 operating earnings, citing the letter; inspector shows the letter's pages.

---

## Scene 6 — Hallucination prevention (6:15–7:45)

*The contrast moment. Two beats: chat, then writing tools.*

**ACTIONS:**

1. In **AI Chat**, ask:

   > **PROMPT:** `What were Apple's total net sales in fiscal 2025, and what did management attribute the change to?`

**EXPECT:** No invented figures. The assistant says the bound sources don't contain fiscal 2025 results — the 10-K covers fiscal 2023 — and asks for the missing filing.

> **SPOKEN:** "Now the question that breaks ordinary chatbots. Fiscal 2025 isn't in any of these documents. A general-purpose assistant would happily produce a plausible number — and plausible is the dangerous kind of wrong. Inkwise's answer contract is: use only the evidence, and if the evidence is insufficient, *say what's missing*. So instead of a guess, I get told the library only covers fiscal 2023 — and the fix is to upload the newer 10-K, not to hope the model knew it. The failure mode becomes 'go get the document,' never 'trust me.'"

2. Now show the same honesty in the writing tools. Click into the draft, select the Apple paragraph, open **Write with AI**, choose **Custom**:

   > **PROMPT:** `Add a sentence about Apple's dividend announcements made in 2025.`

**EXPECT:** The panel reports **No matching evidence found in the selected sources** and the result is explicitly ungrounded (or declines to add specifics).

> **SPOKEN:** "The same contract runs through the whole editor. When a rewrite is backed by sources, the panel says 'Grounded to N evidence segments.' When nothing relevant exists, it tells you — 'No matching evidence found' — instead of quietly making something up. Grounded and ungrounded text are always labeled, so you always know which sentences carry evidence and which are just prose."

3. (Optional, if timing allows) Place the cursor at the end of the draft, type `In fiscal 2023, Apple's Services segment` and pause; when the inline prediction appears, point at the status bar (*Press Tab to accept the grounded inline prediction. Using N evidence segments.*) and press **Tab**, then point at the **Prediction Evidence** bubbles.

> **SPOKEN (optional beat):** "Even autocomplete obeys it — inline predictions are retrieved from the same index, and the status bar tells you how many evidence segments the suggestion is standing on."

---

## Scene 7 — Wrap-up (7:45–8:30)

**ACTIONS:**

1. Scroll the draft showing the cited paragraphs; open one last citation bubble briefly, then close it.

> **SPOKEN:** "So that's Inkwise RAG end to end. Your documents are segmented and indexed for both meaning and exact wording. Every question is answered from retrieved evidence only, re-ranked so the best passages win. The evidence inspector gives you the highlighted passage, the page, and the original document for every single claim. And when the evidence isn't there, Inkwise says so instead of improvising. For professionals who sign their names to what they write, that's the point: not just fast drafting — drafting you can defend. In our companion demo, we show what happens downstream of this evidence: fully formatted citations in APA, Chicago, and Bluebook, as inline citations, footnotes, and endnotes."

---

## Contingencies

- **Fiscal-2025 question gets a hedged answer with a guessed number (should not happen, but verify in dry run):** re-ask as `According to my bound sources only, what were Apple's fiscal 2025 net sales?` — and keep the phrasing that behaved best in rehearsal.
- **Follow-up ("how does that compare") retrieves from the wrong source:** click **Retry** on the answer — retrieval reruns fresh; or restate with `Compare Apple's fiscal 2023 revenue trend with Berkshire's 2023 operating earnings as described in Buffett's letter.`
- **PDF preview slow to load in the inspector:** narrate the excerpt and locator first (they render immediately); the preview typically arrives within a few seconds.
- **10-K ingestion incomplete at record time:** bind only the shareholder letter and bulletin, swap Scene 3's question to `What did Buffett report for Berkshire's 2023 operating earnings?`, and keep the fiscal-2025 Apple question for the hallucination scene (it works even better with no Apple filing bound).
