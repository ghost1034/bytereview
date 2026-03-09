# PageIndex Documentation

This directory is a small, documentation-only bundle for PageIndex: a PDF-first system that (1) builds an LLM-friendly hierarchical "table of contents" tree for navigation + reasoning-based RAG, and (2) provides APIs for chatting with documents, OCR, and (legacy) retrieval.

## What PageIndex Gives You

- Tree generation: a hierarchical structure that follows the document's logical flow and is optimized for reasoning-based RAG.
- Chat API (beta): chat with one or more PageIndex-processed documents; supports streaming and optional inline citations.
- OCR: page-level markdown (plus images) or node-structured output that preserves cross-page hierarchy.
- Retrieval API (legacy): still available for backward compatibility; Chat is recommended for most use cases.
- Current format support: PDF only (more formats planned).

## Quickstart (Typical Flow)

1) Submit a PDF, get a `doc_id`.
2) Poll until processing completes.
3) Use `doc_id` to:
   - fetch the PageIndex tree
   - chat with the document(s)
   - fetch OCR output

```python
from pageindex import PageIndexClient

pi_client = PageIndexClient(api_key="YOUR_PAGEINDEX_API_KEY")

# 1) Upload a PDF for processing (tree/OCR pipeline depends on your account setup)
result = pi_client.submit_document("./sample.pdf")  # mode="mcp" to expose via PageIndex MCP (if enabled)
doc_id = result["doc_id"]

# 2) Poll for the tree
tree_result = pi_client.get_tree(doc_id)
if tree_result.get("status") == "completed":
    tree = tree_result.get("result")
    print("Tree nodes:", len(tree) if isinstance(tree, list) else type(tree))

# 3) Chat with the document
chat = pi_client.chat_completions(
    messages=[{"role": "user", "content": "Summarize this document."}],
    doc_id=doc_id,
    enable_citations=True,
)
print(chat["choices"][0]["message"]["content"])

# 4) OCR results (page/node/raw)
ocr = pi_client.get_ocr(doc_id, format="page")
if ocr.get("status") == "completed":
    print("OCR pages:", len(ocr.get("result", [])))
```

## SDK Reference

- Tree generation: `sdk/tree_generation.md`
- Chat API (beta): `sdk/chat.md`
- OCR: `sdk/ocr.md`
- Retrieval (legacy): `sdk/retrieval.md`

## Tutorials

- Tree-search prompting patterns (LLM agent / MCTS note): `tutorials/tree-search/README.md`
- Searching across multiple documents (3 workflows): `tutorials/doc-search/README.md`
  - Search by metadata (closed beta): `tutorials/doc-search/metadata.md`
  - Search by semantics (vector DB + DocScore): `tutorials/doc-search/semantics.md`
  - Search by description (small sets of docs): `tutorials/doc-search/description.md`

## Cookbooks

- Notebook links (vectorless RAG, vision RAG): `cookbook/README.md`

## Support

- Discord: https://discord.gg/VuXuf29EUj
- Contact (tree-search tutorial link): https://ii2abc2jejf.typeform.com/to/tK3AXl8T
- Contact (doc-search tutorial link): https://ii2abc2jejf.typeform.com/to/meB40zV0
