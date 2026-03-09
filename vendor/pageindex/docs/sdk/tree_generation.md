🌲 PageIndex Tree Generation

PageIndex generates a hierarchical “table of contents” tree that maintains the original document’s logical flow and organizational structure. This LLM-optimized “table of contents” enables precise navigation and is ready for reasoning-based RAG. See our cookbook for a practical example.

Currently accepts PDF files only (more formats coming soon).

Submit Document for Tree Generation

    Uploads a PDF document to generate a PageIndex hierarchical tree.
    Returns a document identifier (doc_id) for subsequent operations.

Parameters

Required Parameters:
Name	Type	Required	Description	Default
file_path	string	yes	Local path to the PDF file	-

Optional Parameters:
Name	Type	Required	Description	Default
mode	string	no	Processing mode: None or "mcp". When set to "mcp", the document will be accessible via PageIndex MCP	None

Example Request

result = pi_client.submit_document("./2023-annual-report.pdf")
doc_id = result["doc_id"]

Example Response

{
  "doc_id": "pi-abc123def456"
}

Get Processing Status & Tree Structure

Check processing status and (when complete) get the PageIndex tree for a submitted document.

Parameters:
Name	Type	Required	Description	Default
doc_id	string	yes	Document ID	-
node_summary	boolean	no	Include node summary for each node in response	false

Example Request

tree_result = pi_client.get_tree(doc_id)
if tree_result.get("status") == "completed":
    print("PageIndex Tree Structure:", tree_result.get("result"))

Example Response (Processing):

{
  "doc_id": "pi-abc123def456",
  "status": "processing"
}

Example Response (Completed):

{
  "doc_id": "pi-abc123def456",
  "status": "completed",
  "result": [
    {
      "title": "Financial Stability",
      "node_id": "0006",
      "page_index": 21,
      "text": "The Federal Reserve maintains financial stability through comprehensive monitoring and regulatory oversight...",
      "nodes": [
        {
          "title": "Monitoring Financial Vulnerabilities",
          "node_id": "0007",
          "page_index": 22,
          "text": "The Federal Reserve's monitoring focuses on identifying and assessing potential risks..."
        },
        {
          "title": "Domestic and International Cooperation and Coordination",
          "node_id": "0008",
          "page_index": 28,
          "text": "In 2023, the Federal Reserve collaborated internationally with central banks and regulatory authorities..."
        }
      ]
    }
  ]
}

Delete a PageIndex Document

Permanently delete a PageIndex document and all its associated data.

Parameters:
Name	Type	Required	Description
doc_id	string	yes	Document ID

Example Request

pi_client.delete_document(doc_id)
