import { ClaudeVoiceSession, createClaudeClient } from './adapters/claude'
import { DemoVoiceSession } from './adapters/demo'
import { GeminiVoiceSession } from './adapters/gemini'
import { listLocalModels, LocalVoiceSession } from './adapters/local'
import { OpenAIVoiceSession } from './adapters/openai'
import { ProviderError, type Connection, type ProviderId, type VoiceSession, type VoiceSessionConfig } from './types'

export interface ProviderInfo {
  id: ProviderId
  /** A brand name. Without one, the locale names the provider in `connect.providerNames`. */
  name?: string
  /** Empty when the provider needs no key from a website. */
  keyUrl: string
  /** Where to pay and set a spending limit. Empty when the provider has no billing. */
  billingUrl: string
  /** Browser speech instead of the provider's own voice. */
  basicVoice: boolean
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    billingUrl: 'https://platform.openai.com/settings/organization/billing/overview',
    basicVoice: false,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    billingUrl: 'https://aistudio.google.com/billing',
    basicVoice: false,
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    keyUrl: 'https://platform.claude.com/settings/keys',
    billingUrl: 'https://platform.claude.com/settings/billing',
    basicVoice: true,
  },
  { id: 'local', keyUrl: '', billingUrl: '', basicVoice: true },
  ...(import.meta.env.DEV
    ? [{ id: 'demo' as const, name: 'Demo (dev only)', keyUrl: '', billingUrl: '', basicVoice: false }]
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
    case 'local':
      return new LocalVoiceSession({ ...config, connection })
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
    case 'local':
      await listLocalModels(connection)
      return
  }
}

async function checkResponse(response: Response): Promise<void> {
  if (!response.ok) throw new ProviderError(`HTTP ${response.status}`)
}
