/** Server-side Tasklytic AI adapter — the server rebuilds all authorized context. */
import { newId } from '../ids'
import { tasklyticApiJson } from '../tasklyticApi'
import type { AiAdapter, AiGenerateInput, AiGenerateResult, AiProposal } from './types'

type ServerAiResponse = {
  text: string
  reasoning?: string
  proposals?: Omit<AiProposal, 'id'>[]
}

export function createServerAiAdapter(model?: string): AiAdapter {
  const modelLabel = model ?? 'vertex'
  return {
    capabilities: { provider: 'gemini', model: modelLabel },
    async generate(input: AiGenerateInput): Promise<AiGenerateResult> {
      const res = await tasklyticApiJson<ServerAiResponse>('/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          prompt: input.prompt,
          scope: input.context.scope,
          history: input.history ?? [],
          model,
        }),
      })
      return {
        text: res.text,
        reasoning: res.reasoning,
        proposals: (res.proposals ?? []).map((proposal) => ({ ...proposal, id: newId() })),
      }
    },
  }
}
