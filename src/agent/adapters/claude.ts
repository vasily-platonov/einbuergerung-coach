import Anthropic from '@anthropic-ai/sdk'
import type { BetaMessage, BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { ProviderError, type ConnectionFor, type VoiceSessionConfig } from '../types'
import { BrowserSpeechSession, type TextReplier } from './speech'

export const CLAUDE_MODEL = 'claude-opus-5-5'
export const CLAUDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01'

export function createClaudeClient(apiKey: string): Anthropic {
  // The visitor's own key, held only in this tab, is the design of this site.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

export function claudeText(message: BetaMessage): string {
  if (message.stop_reason === 'refusal') throw new ProviderError('Claude declined this request.')
  return message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
}

/** Claude has no realtime voice API, so the browser handles both listening and speaking. */
export class ClaudeVoiceSession extends BrowserSpeechSession {
  constructor(config: VoiceSessionConfig<ConnectionFor<'claude'>>) {
    super(config.events, new ClaudeReplier(config.connection.apiKey, config.instructions))
  }
}

class ClaudeReplier implements TextReplier {
  private readonly client: Anthropic
  private readonly history: BetaMessageParam[] = []

  constructor(
    apiKey: string,
    private readonly instructions: string,
  ) {
    this.client = createClaudeClient(apiKey)
  }

  async reply(text: string, onText: (delta: string) => void, signal: AbortSignal): Promise<string> {
    this.history.push({ role: 'user', content: text })
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: CLAUDE_MODEL,
          max_tokens: 16000,
          betas: [CLAUDE_FALLBACK_BETA],
          fallbacks: 'default',
          output_config: { effort: 'low' },
          system: this.instructions,
          messages: this.history,
        },
        { signal },
      )
      stream.on('text', (delta) => onText(delta))
      const message = await stream.finalMessage()
      const reply = claudeText(message)
      this.history.push({ role: 'assistant', content: message.content })
      return reply
    } catch (error) {
      throw toError(error)
    }
  }
}

function toError(error: unknown): Error {
  if (error instanceof Anthropic.APIError) return new ProviderError(error.message)
  return error instanceof Error ? error : new Error(String(error))
}
