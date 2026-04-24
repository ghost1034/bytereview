"""Writing tool and prediction helpers for the Inkwise module."""

from __future__ import annotations

# pyright: reportAttributeAccessIssue=false, reportGeneralTypeIssues=false, reportArgumentType=false, reportOptionalMemberAccess=false

from dataclasses import dataclass

from inkwise.schemas import InkwisePredictionRequest, InkwiseWritingToolRequest
from models.inkwise_models import InkwiseDocument


@dataclass(frozen=True)
class NormalizedPredictionResult:
    text: str
    reason: str | None = None


def _action_guidance(*, action: str, has_selection: bool) -> list[str]:
    if action == "coherent":
        return [
            "Make the writing more coherent by improving flow, transitions, and structure.",
            "Preserve the original meaning, claims, and intent.",
        ]
    if action == "concise":
        return [
            "Make the writing more concise.",
            "Keep the essential meaning and key details.",
        ]
    if action == "detailed":
        return [
            "Add relevant detail, specificity, and supporting context where it helps the reader.",
            "Do not pad with repetition or generic filler.",
        ]
    if action == "humanize":
        return [
            "Make the writing sound more natural, clear, and human.",
            "Keep the substance accurate and professional.",
        ]
    if action == "other":
        if has_selection:
            return ["Revise the selected text exactly as requested by the user."]
        return ["Write new text at the cursor exactly as requested by the user."]
    return []


def build_writing_tool_prompt(*, body: InkwiseWritingToolRequest, document: InkwiseDocument | None) -> str:
    selection_text = (body.selection_text or "").strip()
    parts: list[str] = []
    parts.append("You are Inkwise Writing Tools.")
    parts.append("You must follow the user's instruction.")
    parts.append("Return only the requested text, with no preamble.")
    parts.append("")

    if document and document.language:
        parts.append(f"Language: {document.language}")
    if document and document.init_prompt:
        parts.append(f"Document guidance: {document.init_prompt}")

    parts.append(f"Action: {body.action}")
    parts.extend(_action_guidance(action=body.action, has_selection=bool(selection_text)))
    parts.append(f"Instruction: {body.instruction}")
    if selection_text:
        parts.append("")
        parts.append("Selection:")
        parts.append(selection_text)
    else:
        parts.append("")
        parts.append("Task:")
        parts.append("Write new text at the cursor that follows the user's instruction.")
    if body.surrounding_text:
        parts.append("")
        parts.append("Surrounding context:")
        parts.append(body.surrounding_text)

    return "\n".join(parts).strip() + "\n"


def build_writing_tool_retrieval_query(*, body: InkwiseWritingToolRequest) -> str:
    parts: list[str] = []
    if body.instruction.strip():
        parts.append(body.instruction.strip())
    if (body.selection_text or "").strip():
        parts.append((body.selection_text or "").strip())
    if body.surrounding_text and body.surrounding_text.strip():
        parts.append(body.surrounding_text.strip()[:2000])
    return "\n\n".join(parts).strip()


def build_grounded_writing_tool_prompt(
    *,
    body: InkwiseWritingToolRequest,
    document: InkwiseDocument | None,
    evidence_pack: str,
) -> str:
    selection_text = (body.selection_text or "").strip()
    parts: list[str] = []
    parts.append("You are Inkwise Writing Tools.")
    if selection_text:
        parts.append("Revise the selected text using the user's instruction and the grounded evidence provided.")
    else:
        parts.append("Write new text at the cursor using the user's instruction and the grounded evidence provided.")
    parts.append("Use the evidence for factual accuracy whenever it is relevant.")
    if selection_text:
        parts.append("If the selected text conflicts with the evidence, prefer the evidence.")
    parts.append("Return only the requested text, with no preamble or notes.")
    parts.append("")
    parts.append("Citation rules:")
    parts.append("- Whenever a sentence or clause relies on grounded evidence, append the supporting evidence IDs immediately after that sentence or clause, like [E01] or [E01][E02].")
    parts.append("- Only cite IDs that appear in the grounded evidence below.")
    parts.append("- Do not move all citations to the end. Place them exactly where the support applies.")
    parts.append("- Leave purely connective or stylistic text uncited if it does not rely on evidence.")
    parts.append("- Evidence headers include modality and segment_type metadata.")
    parts.append("- If multiple evidence blocks overlap or say the same thing, cite the single most specific block.")
    parts.append("- Avoid citing duplicate support from different modalities unless both are necessary.")
    parts.append("")

    if document and document.language:
        parts.append(f"Language: {document.language}")
    if document and document.init_prompt:
        parts.append(f"Document guidance: {document.init_prompt}")

    parts.append(f"Action: {body.action}")
    parts.extend(_action_guidance(action=body.action, has_selection=bool(selection_text)))
    parts.append(f"Instruction: {body.instruction}")
    if selection_text:
        parts.append("")
        parts.append("Selection:")
        parts.append(selection_text)
    else:
        parts.append("")
        parts.append("Task:")
        parts.append("Write new text at the cursor.")
    if body.surrounding_text:
        parts.append("")
        parts.append("Surrounding context:")
        parts.append(body.surrounding_text)
    parts.append("")
    parts.append("Grounded evidence:")
    parts.append(evidence_pack.rstrip())

    return "\n".join(parts).strip() + "\n"


def build_prediction_prompt(*, body: InkwisePredictionRequest, document: InkwiseDocument) -> str:
    current_block_prefix = body.current_block_prefix_text.strip()

    parts: list[str] = []
    parts.append("You are Inkwise Autocomplete.")
    parts.append("Return only the exact text that should be inserted at the cursor.")
    parts.append("")
    parts.append("Rules:")
    parts.append("- Continue the user's draft naturally from the cursor position.")
    parts.append("- Match the draft's language, tone, and formatting.")
    parts.append("- Keep the completion short and tabbable: usually one clause or one sentence fragment.")
    parts.append("- Include any needed leading space or punctuation.")
    parts.append("- Do not repeat text that is already before the cursor.")
    parts.append("- Do not add markdown, code fences, notes, bullets, headings, or quotation marks unless the draft already requires them.")
    parts.append("- Do not explain your answer.")
    parts.append("")

    if document.language:
        parts.append(f"Document language: {document.language}")
    if document.init_prompt:
        parts.append(f"Document guidance: {document.init_prompt}")

    parts.append(f"Document title: {document.title}")
    parts.append("")
    parts.append("Current block text before cursor:")
    parts.append(current_block_prefix)

    return "\n".join(parts).strip() + "\n"


def build_grounded_prediction_retrieval_query(*, body: InkwisePredictionRequest, document: InkwiseDocument) -> str:
    parts: list[str] = []
    current_block_prefix = body.current_block_prefix_text.strip()

    if document.init_prompt:
        parts.append(document.init_prompt.strip())
    parts.append(current_block_prefix)

    return "\n\n".join(part for part in parts if part).strip()


def build_grounded_prediction_prompt(
    *,
    body: InkwisePredictionRequest,
    document: InkwiseDocument,
    evidence_pack: str,
) -> str:
    current_block_prefix = body.current_block_prefix_text.strip()

    parts: list[str] = []
    parts.append("You are Inkwise Autocomplete.")
    parts.append("Return only the exact text that should be inserted at the cursor.")
    parts.append("")
    parts.append("Rules:")
    parts.append("- Continue the user's draft naturally from the cursor position.")
    parts.append("- Use the grounded evidence when it is relevant to the next text.")
    parts.append("- Keep the completion short and tabbable: usually one clause or one sentence fragment.")
    parts.append("- Include any needed leading space or punctuation.")
    parts.append("- Do not repeat text that is already before the cursor.")
    parts.append("- If the completion relies on grounded evidence, append the supporting evidence IDs immediately after the supported clause, like [E01] or [E01][E02].")
    parts.append("- Only cite IDs that appear in the grounded evidence below.")
    parts.append("- Evidence headers include modality and segment_type metadata.")
    parts.append("- If multiple evidence blocks overlap or say the same thing, cite the single most specific block.")
    parts.append("- Avoid citing duplicate support from different modalities unless both are necessary.")
    parts.append("- Do not add notes, bullets, or explanations.")
    parts.append("")

    if document.language:
        parts.append(f"Document language: {document.language}")
    if document.init_prompt:
        parts.append(f"Document guidance: {document.init_prompt}")

    parts.append(f"Document title: {document.title}")
    parts.append("")
    parts.append("Current block text before cursor:")
    parts.append(current_block_prefix)

    parts.append("")
    parts.append("Grounded evidence:")
    parts.append(evidence_pack.rstrip())

    return "\n".join(parts).strip() + "\n"


def normalize_prediction_result(*, raw_text: str, body: InkwisePredictionRequest) -> NormalizedPredictionResult:
    text = (raw_text or "").replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("```", "").strip("\n\t")

    lines = [line for line in text.split("\n") if line.strip()]
    if not lines:
        return NormalizedPredictionResult(text="", reason="empty_response")

    suggestion = lines[0].rstrip()
    if not suggestion:
        return NormalizedPredictionResult(text="", reason="empty_first_line")

    current_block_prefix_tail = body.current_block_prefix_text[-200:].strip()
    if current_block_prefix_tail and suggestion.strip() == current_block_prefix_tail:
        return NormalizedPredictionResult(text="", reason="duplicate_current_block_prefix")

    return NormalizedPredictionResult(text=suggestion, reason=None)


def normalize_prediction_text(*, raw_text: str, body: InkwisePredictionRequest) -> str:
    return normalize_prediction_result(raw_text=raw_text, body=body).text
