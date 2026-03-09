💭 PageIndex Chat API (beta)

The PageIndex Chat API (beta) allows you to have conversations with your PageIndex-processed documents, with the ability to scope to specific documents. You can also try the Chat service directly in our PageIndex Chat platform.

Chat with Documents

Parameters
Name	Type	Required	Description	Default
messages	List[Dict[str, str]]	yes	Conversation messages with ‘role’ and ‘content’ keys.	-
stream	boolean	no	Enable streaming responses for real-time output.	False
doc_id	string or List[string]	no	Document ID(s) to scope the conversation. Can be a single ID or list of IDs.	None
temperature	float	no	Sampling temperature (0.0 to 1.0). Lower is more deterministic.	None
stream_metadata	boolean	no	If True with stream=True, return raw chunks with metadata instead of just text.	False
enable_citations	boolean	no	Enable inline citations in responses (e.g., <doc=file.pdf;page=1>).	False
Non-Streaming Chat

Get non-streaming responses from PageIndex Chat API.

Example Request with Single Document

# Chat with a specific document
response = pi_client.chat_completions(
    messages=[
        {"role": "user", "content": "What are the key findings in this document?"}
    ],
    doc_id="pi-abc123def456"
)
 
print(response["choices"][0]["message"]["content"])

Example Request with Multiple Documents

# Chat with multiple documents
response = pi_client.chat_completions(
    messages=[
        {"role": "user", "content": "Compare the findings across these documents"}
    ],
    doc_id=["pi-abc123def456", "pi-xyz789ghi012"]
)
 
print(response["choices"][0]["message"]["content"])

Example Response

{
  "id": "chatcmpl-xyz789",
  "object": "chat.completion",
  "created": 1234567890,
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Based on the document, the key findings are..."
    },
    "finish_reason": "end_turn"
  }],
  "usage": {
    "prompt_tokens": 1234,
    "completion_tokens": 567,
    "total_tokens": 1801
  }
}

Streaming Chat

Stream PageIndex Chat API responses in real-time for better user experience.

Example Request

from pageindex import PageIndexClient
 
pi_client = PageIndexClient(api_key="YOUR_PAGEINDEX_API_KEY")
 
# Streaming chat with document
for chunk in pi_client.chat_completions(
    messages=[
        {"role": "user", "content": "Summarize this document"}
    ],
    doc_id="pi-abc123def456",
    stream=True
):
    print(chunk, end='', flush=True)

Example with Multi-Turn Conversation

# Continue a conversation
messages = [
    {"role": "user", "content": "What is the main topic of this document?"},
    {"role": "assistant", "content": "The main topic is climate change and its effects on agriculture."},
    {"role": "user", "content": "What solutions does it propose?"}
]
 
for chunk in pi_client.chat_completions(
    messages=messages,
    doc_id="pi-abc123def456",
    stream=True
):
    print(chunk, end='', flush=True)

Advanced: Streaming with Intermediate Metadata

Track tool calls and intermediate steps using raw streaming mode.

Example Request

from pageindex import PageIndexClient
 
pi_client = PageIndexClient(api_key="YOUR_PAGEINDEX_API_KEY")
 
# Stream with metadata about tool calls
for chunk in pi_client.chat_completions(
    messages=[
        {"role": "user", "content": "What are the main findings?"}
    ],
    doc_id="pi-abc123def456",
    stream=True,
    stream_metadata=True
):
    # Check for metadata about tool calls
    metadata = chunk.get("block_metadata", {})
    if metadata:
        block_type = metadata.get("type")
 
        # Tool call started
        if block_type == "mcp_tool_use_start":
            tool_name = metadata.get("tool_name")
            print(f"\n[Searching document using {tool_name}]\n", flush=True)
 
        # Tool result received
        elif block_type == "mcp_tool_result_start":
            print(f"\n[Retrieved relevant content]\n", flush=True)
 
    # Get content
    content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
    if content:
        print(content, end='', flush=True)

Available Block Types

    text_block_start / text_stop - Text content blocks
    mcp_tool_use_start / mcp_tool_use_stop - PageIndex tool being called
    mcp_tool_result_start / mcp_tool_result_stop - Tool results received

Document Management

Check document status and metadata before chatting.
Get Document Metadata

Retrieve document information including processing status, page count, and creation time.

Method: pi_client.get_document(doc_id)

Parameters
Name	Type	Required	Description
doc_id	string	yes	Document ID

Returns
Field	Type	Description
id	string	Document ID
name	string	Document filename
description	string	Document description (if available)
status	string	Processing status: “queued”, “processing”, “completed”, “failed”
createdAt	string	Creation timestamp in ISO 8601 format
pageNum	int	Number of pages in the document

Response Example

{
  "id": "pi-abc123def456",
  "name": "research_paper.pdf",
  "description": "Machine Learning Research Paper",
  "status": "completed",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "pageNum": 42
}

Example Usage

from pageindex import PageIndexClient
 
pi_client = PageIndexClient(api_key="YOUR_PAGEINDEX_API_KEY")
 
# Get document metadata
doc_metadata = pi_client.get_document("pi-abc123def456")
print(f"Document: {doc_metadata['name']}")
print(f"Status: {doc_metadata['status']}")
print(f"Pages: {doc_metadata['pageNum']}")

List Documents

Retrieve a paginated list of all documents, ordered by creation date (newest first).

Method: pi_client.list_documents(limit=50, offset=0)

Parameters
Name	Type	Description	Default
limit	int	Maximum number of documents to return (1-100)	50
offset	int	Number of documents to skip for pagination	0

Returns: Object with documents (array of document metadata), total, limit, and offset.

Example

# List documents
result = pi_client.list_documents(limit=10)
 
print(f"Total: {result['total']}")
for doc in result['documents']:
    print(f"- {doc['name']} ({doc['status']})")
 
# Next page
result = pi_client.list_documents(limit=10, offset=10)
