📑 PageIndex OCR

Classic OCR systems analyze each page in isolation, dividing it into blocks and processing each block independently. This ultimately returns a flat, fragmented output with structural errors and loss of document hierarchy. PageIndex OCR leverages the context window of large vision-language models and treats the entire document as a cohesive, structured whole. It can not only generate accurate page-level markdown content, but also preserve the hierarchical organization of content — titles, sections, subsections, bullet lists, tables, references — across page boundaries. See our blog  for a detailed introduction to our OCR method.

Submit Document for OCR Processing

    Uploads a PDF file for OCR processing.
    Returns a document identifier (doc_id) for subsequent operations.

Parameters
Name	Type	Required	Description
file_path	string	yes	Local path to the file

Example Request

result = pi_client.submit_document("./sample.pdf")
doc_id = result["doc_id"]

Example Response

{
  "doc_id": "pi-abc123def456"
}

Get OCR Processing Status & Results

Check processing status and (when complete) get the OCR results for a submitted document.

Parameters
Name	Type	Required	Description	Default
doc_id	string	yes	Document ID	-
format	string	no	Output format: “page”, “node”, or “raw"	"page”

Format Options:

    "page" (default): Returns results organized by page, with each page containing markdown content and images
    "node": Returns a list of nodes that preserve the hierarchical structure of the document.
    "raw": Returns all markdown content concatenated into a single string.

This node view returns a tree structure of the documents. However, it differs from the PageIndex tree, which is optimized for retrieval efficiency.

Example Request

# Get OCR results in page format (default)
ocr_result = pi_client.get_ocr(doc_id)
if ocr_result.get("status") == "completed":
    print("OCR Results:", ocr_result.get("result"))
 
# Get OCR results in node format
ocr_result = pi_client.get_ocr(doc_id, format="node")
if ocr_result.get("status") == "completed":
    print("OCR Results:", ocr_result.get("result"))
 
# Get OCR results in raw format (concatenated markdown)
ocr_result = pi_client.get_ocr(doc_id, format="raw")
if ocr_result.get("status") == "completed":
    print("Raw Markdown:", ocr_result.get("result"))

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
      "page_index": 1,
      "markdown": "Content from page 1 in markdown format",
      "images": [
        "iVBORw0KGgoAAAANSUhEUgAA...",   // Base64-encoded image(s)
        "iVBORw0KGgoAAAANSUhEUgAB..."    // More images if present
      ]
    },
    {
      "page_index": 2,
      "markdown": "Content from page 2 in markdown format",
      "images": []
    }
  ]
}

Each page object includes:

    page_index (1-based)
    markdown (OCR-formatted markdown text)
    images (array of base64-encoded images; may be empty)

Delete an OCR Document

    Remove a previously uploaded OCR document.

Parameters
Name	Type	Required	Description
doc_id	string	yes	Document ID

Example Request

pi_client.delete_document(doc_id)
