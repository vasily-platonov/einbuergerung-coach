import { ClaudeVoiceSession, createClaudeClient } from './adapters/claude'
import { DemoVoiceSession } from './adapters/demo'
import { GeminiVoiceSession } from './adapters/gemini'
import { OpenAIVoiceSession } from './adapters/openai'
import { ProviderError, type Connection, type ProviderId, type VoiceSession, type VoiceSessionConfig } from './types'

export interface ProviderInfo {
  id: ProviderId
  name: string
  keyUrl: string
  /** Browser speech instead of the provider's own voice. */
  basicVoice: boolean
}

export const PROVIDERS: ProviderInfo[] = [
  { id: 'openai', name: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys', basicVoice: false },
  { id: 'gemini', name: 'Google Gemini', keyUrl: 'https://aistudio.google.com/apikey', basicVoice: false },
  { id: 'claude', name: 'Anthropic Claude', keyUrl: 'https://platform.claude.com/settings/keys', basicVoice: true },
  ...(import.meta.env.DEV
    ? [{ id: 'demo' as const, name: 'Demo (dev only)', keyUrl: '', basicVoice: false }]
    : []),
]

export function createVoiceSession(config: VoiceSessionConfig): VoiceSession {
  const { connection } = config
  switch (connection.provider) {
    case 'openai':
      return new OpenAIVoiceSession({ ...config, connection })
    case 'gemini':
      return new GeminiVoiceSession({ ...config, connection })
    case 'claude':
      return new ClaudeVoiceSession({ ...config, connection })
    case 'demo':
      return new DemoVoiceSession({ ...config, connection })
  }
}

/** Checks the connection with a free model listing, so a typo shows up before the interview starts. */
export async function verifyConnection(connection: Connection): Promise<void> {
  switch (connection.provider) {
    case 'openai':
      return checkResponse(
        await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${connection.apiKey}` } }),
      )
    case 'gemini':
      return checkResponse(
        await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
          headers: { 'x-goog-api-key': connection.apiKey },
        }),
      )
    case 'claude':
      await createClaudeClient(connection.apiKey).models.list({ limit: 1 })
      return
    case 'demo':
      return
  }
}

async function checkResponse(response: Response): Promise<void> {
  if (!response.ok) throw new ProviderError(`HTTP ${response.status}`)
}
