# Inkwise Demo Script — Citations

**Demo:** Reference metadata, citation styles, and inline/footnote/endnote citations
**Target length:** 7–8 minutes
**Presenter setup:** Logged into CPAAutomation, Inkwise open, empty (or tidy) reference library and Write workspace. Browser at 100% zoom, 1920×1080 recording.

---

## Reference set

Three well-known, public-domain documents, deliberately of three different citation types so each citation style has something interesting to format:

| # | Reference | Type | How to add |
|---|-----------|------|------------|
| 1 | Alexander Hamilton, *Federalist No. 78* (1788) | Webpage | **Capture Webpage** → `https://avalon.law.yale.edu/18th_century/fed78.asp` |
| 2 | *Marbury v. Madison*, 5 U.S. 137 (1803) | Case (PDF) | **Add Files** → upload the U.S. Reports PDF (Library of Congress: `https://tile.loc.gov/storage-services/service/ll/usrep/usrep005/usrep005137/usrep005137.pdf`) |
| 3 | Alexis de Tocqueville, *Democracy in America*, Vol. 1 (1835) | Book (PDF) | **Add Files** → upload a PDF of the Henry Reeve translation (e.g., from Project Gutenberg, ebook #815) |

**Pre-record prep (do before recording):**

- [ ] Download both PDFs to a `Demo Sources` folder on the desktop.
- [ ] Dry-run the ingestion once so you know processing times; for the recording you can either show live processing (it's fast) or have a second, pre-processed copy of the library ready as a fallback.
- [ ] Create nothing else in advance — the document and metadata edits are performed on camera.
- [ ] Confirm the metadata dialog fields against the table in Scene 2 so typing on camera is quick.

**Metadata you will enter on camera** (have this open on a second screen):

| Field | Federalist No. 78 | Marbury v. Madison | Democracy in America |
|---|---|---|---|
| Source title | Federalist No. 78 | Marbury v. Madison | Democracy in America |
| Citation type | Article | Case | Book |
| Year | 1788 | 1803 | 1835 |
| Authors | Alexander Hamilton | — | Alexis de Tocqueville |
| Short title | Federalist 78 | Marbury | Democracy in America |
| Container title | The Federalist Papers | — | — |
| Publisher | — | — | Saunders and Otley |
| Court | — | Supreme Court of the United States | — |
| Reporter | — | U.S. | — |
| Reporter volume | — | 5 | — |
| First page | — | 137 | — |
| Pin cite | — | 177 | — |

---

## Scene 1 — Intro & adding references (0:00–1:15)

> **SPOKEN:** "This is Inkwise, the AI writing workspace inside CPAAutomation. Everything Inkwise writes is grounded in your own sources — and today I want to show you what happens *after* the grounding: how Inkwise turns evidence into real, properly formatted citations. We'll build a reference library, give it bibliographic metadata, and then watch Inkwise cite those sources in APA, Chicago, and Bluebook — as inline citations, footnotes, and endnotes."

**ACTIONS:**

1. From the dashboard sidebar, click **Inkwise**, then open **References** in the Inkwise menu bar.
2. Click **Add Files** and upload the two PDFs (*Marbury v. Madison*, *Democracy in America*).
3. In the **Capture Webpage** field, type `avalon.law.yale.edu/18th_century/fed78.asp` and click **Capture Webpage**.

> **SPOKEN (while cards process):** "I'm using three documents everyone knows: Hamilton's Federalist No. 78, the Supreme Court's decision in Marbury v. Madison, and Tocqueville's Democracy in America. Notice they're three different kinds of source — an essay captured straight from a webpage, a court case, and a book — because citation styles treat each of those differently. Each card shows a live status; when a source reads **Ready for binding**, it can ground the AI."

**EXPECT:** Three cards in the Source Library moving through *Queued for ingestion* → *Preparing for grounding* → **Ready for binding**.

---

## Scene 2 — Reference metadata (1:15–2:45)

> **SPOKEN:** "Accurate citations start with accurate metadata. Inkwise extracts what it can, but every reference has an editable bibliographic record — and this is where the citation engine gets its facts."

**ACTIONS:**

1. On the *Democracy in America* card, click **Metadata**.
2. In **Edit Bibliographic Metadata**, fill in: Source title, **Citation type: Book**, Year `1835`, Authors `Alexis de Tocqueville`, Publisher `Saunders and Otley`. Click **Save metadata**.
3. On the *Marbury v. Madison* card, click **Metadata**.
4. Point at the legal-citation section before typing.

> **SPOKEN:** "For the case, look at the bottom of the dialog — Inkwise has dedicated legal-citation fields: Court, Reporter, Reporter volume, First page, Pin cite, Docket number. I'll set the citation type to **Case**, the reporter to `U.S.`, volume `5`, first page `137`, and a pin cite of `177` — that's the page with the famous line, 'It is emphatically the province and duty of the judicial department to say what the law is.' You'll see exactly why these fields matter when we switch this document to Bluebook style."

5. Fill in the Marbury metadata per the table and click **Save metadata**.
6. Repeat quickly for *Federalist No. 78* (Citation type **Article**, Year `1788`, Author `Alexander Hamilton`, Container title `The Federalist Papers`).

> **SPOKEN:** "One more thing worth knowing: if you fix a reference's metadata later, every document that already cites it refreshes automatically. Metadata is live, not baked in."

**EXPECT:** All three cards saved, all showing **Ready for binding**.

---

## Scene 3 — Create the document and bind sources (2:45–3:45)

**ACTIONS:**

1. Switch to **Write** in the Inkwise menu bar. Click **New document**.
2. Title: `Judicial Review and the Limits of Power`. Click **Create & Open**.
3. Click **Settings** in the editor header.
4. In **Document guidance**, type:

   > **PROMPT (guidance):** `A short scholarly essay on the origins of judicial review in the American constitutional system. Formal academic tone. Support every claim with the bound references.`

5. Set **Citation style** to **APA**. Click **Save settings**.
6. Open the right sidebar → **References** tab → click **Bind** on all three sources.

> **SPOKEN:** "I've created a document, given it guidance — the standing instructions the AI follows in this document — and set the citation style to APA. Then I bind my three references. Binding is what connects the library to this document: only bound, ready sources can ground what the AI writes here."

**EXPECT:** All three sources under *Bound to this document*, each showing **Ready for grounding**.

---

## Scene 4 — Grounded writing produces citations (3:45–5:00)

**ACTIONS:**

1. Click into the canvas and type a heading `The Origins of Judicial Review` (Heading 1), then place the cursor on a new line.
2. Open the **Write with AI** panel (cursor in place, no selection) and choose **Custom** with:

   > **PROMPT:** `Write an opening paragraph explaining how Federalist No. 78 anticipated judicial review and how Marbury v. Madison established it, ending with Tocqueville's observation about the political power of American courts.`

3. Wait for the streamed result; point out the status line *Grounded to N evidence segments*. Click **Insert**.

> **SPOKEN:** "I'll ask Inkwise to draft the opening paragraph. Watch the status line — 'Grounded to N evidence segments' means every sentence in this draft is backed by passages retrieved from the three sources we bound. And when I insert it… the citations come with it. These green bubbles are citation anchors: each one is pinned to the exact evidence behind the sentence it follows."

4. Click one citation bubble to open the evidence sheet; scroll briefly to show the highlighted cited passage and the page locator. Close the sheet.

> **SPOKEN:** "Clicking any bubble shows the receipts — the exact passage, highlighted, with a page locator and a preview of the source itself. We'll go deep on this inspector in our RAG demo; today it's our on-ramp to formatting, because this same panel is where an anchor becomes a formatted citation."

**EXPECT:** Inserted paragraph with 2–4 green citation bubbles; evidence sheet opens with **Evidence**, **Locator**, and **Reference Preview** sections plus a **Convert Reference** row.

---

## Scene 5 — Inline citations and citation styles (5:00–6:15)

**ACTIONS:**

1. Click the citation bubble attached to the Federalist 78 sentence. In **Convert Reference**, click **Inline Citation**.

**EXPECT:** The bubble is replaced by APA inline text: **(Hamilton, 1788, p. N)**.

> **SPOKEN:** "One click and the anchor becomes an APA inline citation — author, year, page — built from the metadata we entered, not guessed from the text."

2. Click the Marbury bubble → **Convert Reference** → **Inline Citation**.

**EXPECT:** An APA-style inline citation for the case.

3. Open **Settings**, switch **Citation style** to **Chicago**, click **Save settings**.

> **SPOKEN:** "Now the part that usually costs an afternoon: changing styles. I'll switch the document from APA to Chicago… and every citation we've already placed reformats itself. Nothing to retype."

**EXPECT:** Existing inline citations re-render in Chicago author-date form.

4. Open **Settings** again, switch to **Bluebook**, click **Save settings**. Zoom/point to the Marbury citation.

> **SPOKEN:** "And for the lawyers in the room — Bluebook. Remember those legal metadata fields? Here's the payoff: *Marbury v. Madison, 5 U.S. 137* — case name, reporter volume, reporter, first page, year — a proper Bluebook case citation, assembled from the reference record."

**EXPECT:** The Marbury citation renders as **Marbury v. Madison, 5 U.S. 137 (1803)** (with pin cite where applicable).

---

## Scene 6 — Footnotes and endnotes (6:15–7:15)

**ACTIONS:**

1. Switch **Citation style** back to **Chicago** (Save settings) — the natural home for notes.
2. Click the Tocqueville citation bubble → **Convert Reference** → **Footnote Reference**.

**EXPECT:** A superscript note marker appears in the text; a footnote with the full Chicago note citation (author, title, publisher/year, page) is created.

> **SPOKEN:** "Anchors don't have to become parenthetical citations. The same evidence can become a footnote — Inkwise drops the superscript marker in the text and writes the full Chicago note citation for you: Tocqueville, Democracy in America, publisher, year, page."

3. Click another remaining bubble → **Convert Reference** → **Endnote Reference**.

> **SPOKEN:** "Or an endnote, if that's your house style — same content, collected at the end of the document instead of the bottom of the page. And these notes are ordinary editor notes: you can open them from the Notes control in the toolbar and edit them like any other text."

4. Briefly show the **Notes** control in the toolbar (Footnote / Endnote) to note that manual notes are also available.

**EXPECT:** One footnote and one endnote, each containing a fully formatted note citation.

---

## Scene 7 — Live metadata refresh + export (7:15–8:00)

**ACTIONS:**

1. Switch to **References**, open **Metadata** on *Federalist No. 78*, and change Authors to `Alexander Hamilton (Publius)`. Click **Save metadata**.
2. Return to the document (Write → open the document).

**EXPECT:** The Hamilton citation now reflects the updated author.

> **SPOKEN:** "Earlier I promised metadata was live. I've just amended the author on the Federalist reference in the library — and back in the document, the citation has already refreshed. Fix a record once, and every document that cites it is corrected."

3. Open the **⋯** menu → **Export as PDF**. Open the download and scroll to show the footnote at the bottom of the page.

> **SPOKEN:** "Export to PDF or Word and everything survives — inline citations, footnotes at the foot of the page, endnotes at the end. That's Inkwise citations: real metadata, four citation styles you can switch at any time, and inline, footnote, or endnote placement — one click each. In the next demo we'll open up what's underneath all of this: the retrieval engine and the evidence inspector."

**EXPECT:** Exported PDF with formatted citations and notes.

---

## Contingencies

- **Slow ingestion on camera:** cut to the pre-processed backup library (prepared in the dry run) with the line "I've got a set that finished processing a moment ago."
- **AI draft doesn't mention all three sources:** click **Retry** in the Write with AI panel, or narrow the prompt to the two sources it cited and add the third with a second, smaller prompt (e.g., `Add one sentence on Tocqueville's view of the political role of American courts.`).
- **A bubble carries multiple evidence items:** that's fine — converting formats them together; mention "when a sentence rests on more than one source, the citation carries all of them."
