/**
 * In-browser Gemini adapter — V1 direct REST call with user-supplied API key.
 * Production swap: replace with /api/tasklytic/ai proxy + server-side key rotation.
 */
import { newId } from '../ids'
import type { AiAdapter, AiGenerateInput, AiGenerateResult, AiProposal } from './types'

const SYSTEM_PROMPT = `You are Tasklytic AI, an assistant for a work-management app called Tasklytic.
Summarize real workspace data when relevant. Never invent projects, tasks, or people not in context.
Return ONLY valid JSON with this shape:
{
  "text": "markdown reply to the user",
  "reasoning": "optional brief internal reasoning",
  "proposals": [
    {
      "type": "draft_status_update|create_subtasks|update_description|smart_fields|create_task",
      "title": "short card title",
      "preview": "human-readable diff/preview",
      "reasoning": "optional",
      "payload": { ... type-specific fields ... }
    }
  ]
}
Proposal payloads:
- draft_status_update: { projectId, status, title, summaryHtml, highlightsHtml?, blockersHtml?, nextStepsHtml? }
- create_subtasks: { parentTaskId, names: string[] }
- update_description: { taskId, previousNotes, nextNotes }
- smart_fields: { taskId, assigneeId?, dueOn?, priorityOptionId?, priorityFieldId?, preview: Record<string,string> }
- create_task: { workspaceId, projectId?, name, assigneeId?, dueOn? }
Only include proposals when the user asks for an actionable change. Never mutate silently.`

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

function truncateHistory(history: AiGenerateInput['history'], max = 8): NonNullable<AiGenerateInput['history']> {
  const items = history ?? []
  return items.slice(-max)
}

function parseResult(raw: string): AiGenerateResult {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned) as {
      text?: string
      reasoning?: string
      proposals?: Omit<AiProposal, 'id'>[]
    }
    return {
      text: parsed.text ?? cleaned,
      reasoning: parsed.reasoning,
      proposals: (parsed.proposals ?? []).map((p) => ({ ...p, id: newId() })),
    }
  } catch {
    return { text: raw, proposals: [] }
  }
}

/** Gemini REST adapter using generativelanguage.googleapis.com. */
export function createGeminiAdapter(apiKey: string, model: string): AiAdapter {
  return {
    capabilities: { provider: 'gemini', model },
    async generate(input: AiGenerateInput): Promise<AiGenerateResult> {
      const history = truncateHistory(input.history)
      const contents = [
        ...history.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        {
          role: 'user',
          parts: [
            {
              text: `${input.prompt}\n\n---\nContext (${input.context.label}):\n${JSON.stringify(input.context.json).slice(0, 12000)}`,
            },
          ],
        },
      ]

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
            },
          }),
        }
      )

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Gemini error ${res.status}: ${errText.slice(0, 200)}`)
      }

      const data = (await res.json()) as GeminiResponse
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      return parseResult(text)
    },
  }
}
