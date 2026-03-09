🔍 PageIndex Retrieval (legacy)

This existing retrieval API is legacy and remains available for backward compatibility.

For most use cases, we recommend using the Chat API instead. We are also working on a new agentic retrieval API — see the agentic retrieval notebook for a minimal preview.

Retrieve From a PageIndex Document

    Submits a query to create a retrieval task for a specific PageIndex document.
    Returns a retrieval task ID.

Before Retrieval

Before submitting a retrieval query, you should check if the document is ready for retrieval:

if pi_client.is_retrieval_ready(doc_id):
    retrieval = pi_client.submit_query(doc_id, query)
else:
    print("Document is not ready for retrieval yet")

Parameters
Name	Type	Required	Description	Default
doc_id	string	yes	The PageIndex document ID to retrieve from.	-
query	string	yes	The user question or information need.	-
thinking	boolean	no	If set to True, the model will perform a deeper retrieval. It will return more comprehensive results but take longer to complete.	False

Example Request

retrieval = pi_client.submit_query(
    doc_id="pi-abc123def456",
    query="What are the main sources of revenue?",
    thinking=False
)
retrieval_id = retrieval["retrieval_id"]

Example Response

{
  "retrieval_id": "xyz789ghi012"
}

Get Retrieval Status & Results

Get the status and, when ready, the result for a specific retrieval query.

Parameters
Name	Type	Required	Description
retrieval_id	string	yes	Retrieval task ID

Example Request

retrieval_result = pi_client.get_retrieval(retrieval_id)
if retrieval_result.get("status") == "completed":
    print("Retrieved Content:", retrieval_result.get("retrieved_nodes"))

Example Response (Processing)

{
  "retrieval_id": "xyz789ghi012",
  "status": "processing"
}

Example Response (Completed)

{
  "retrieval_id": "xyz789ghi012",
  "doc_id": "pi-abc123def456",
  "status": "completed",
  "query": "What are the recent trends in the labor market?",
  "retrieved_nodes": [
    {
      "title": "March 2024 Summary",
      "node_id": "0005",
      "relevant_contents": [
        {
          "page_index": 10,
          "relevant_content": "The labor market has gained averaging 239,000 per month since June 2023..."
        }
      ]
    }
  ]
}
