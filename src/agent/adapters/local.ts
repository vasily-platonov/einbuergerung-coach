import { ProviderError, type LocalConnection, type VoiceSessionConfig } from '../types'
import { BrowserSpeechSession, type TextReplier } from './speech'

/** Ollama's address. LM Studio's default is `http://localhost:1234/v1`. */
export const DEFAULT_LOCAL_BASE_URL = 'http://localhost:11434/v1'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])

/**
 * True for an http(s) address on this computer, with any port and path. The check lives in code,
 * because the development build has no security policy to enforce it.
 */
export function isLoopbackUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl.trim())
    return (url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

/** Returns the address without trailing slashes, or throws when it is not on this computer. */
export function assertLoopback(baseUrl: string): string {
  if (!isLoopbackUrl(baseUrl)) throw new ProviderError('Only a server on localhost or 127.0.0.1 can be used.')
  return baseUrl.trim().replace(/\/+$/, '')
}

function headers(apiKey: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

/** The ids of the models the server offers. A successful listing confirms address, CORS and key at once. */
export async function listLocalModels(connection: Pick<LocalConnection, 'baseUrl' | 'apiKey'>): Promise<string[]> {
  const baseUrl = assertLoopback(connection.baseUrl)
  const response = await fetch(`${baseUrl}/models`, { headers: headers(connection.apiKey) })
  if (!response.ok) throw new ProviderError(`HTTP ${response.status}`, response.status)
  const data = (await response.json()) as { data?: { id?: unknown }[] }
  return (data.data ?? []).flatMap((model) => (typeof model.id === 'string' ? [model.id] : []))
}

/** A local model writes the replies, and the browser listens and speaks. */
export class LocalVoiceSession extends BrowserSpeechSession {
  constructor(config: VoiceSessionConfig<LocalConnection>) {
    super(config.events, new LocalReplier(config.connection, config.instructions))
  }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatChunk {
  choices?: { delta?: { content?: string | null } }[]
  error?: { message?: string } | string
}

class LocalReplier implements TextReplier {
  private readonly history: ChatMessage[] = []

  constructor(
    private readonly connection: LocalConnection,
    private readonly instructions: string,
  ) {}

  async reply(text: string, onText: (delta: string) => void, signal: AbortSignal): Promise<string> {
    const baseUrl = assertLoopback(this.connection.baseUrl)
    const messages: ChatMessage[] = [
      { role: 'system', content: this.instructions },
      ...this.history,
      { role: 'user', content: text },
    ]
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers(this.connection.apiKey) },
      body: JSON.stringify({ model: this.connection.model, messages, stream: true }),
      signal,
    })
    if (!response.ok) throw new ProviderError(`HTTP ${response.status}: ${await response.text()}`, response.status)
    if (!response.body) throw new ProviderError('The server sent an empty reply.')

    const filter = new ThinkFilter()
    let reply = ''
    const emit = (visible: string) => {
      if (!visible) return
      // Reasoning models put blank lines after the think block, which should not reach the speech.
      const delta = reply ? visible : visible.trimStart()
      if (!delta) return
      reply += delta
      onText(delta)
    }
    for await (const data of serverSentEvents(response.body)) {
      if (data === '[DONE]') break
      const chunk = JSON.parse(data) as ChatChunk
      if (chunk.error) {
        throw new ProviderError(typeof chunk.error === 'string' ? chunk.error : (chunk.error.message ?? 'Server error'))
      }
      // A separate reasoning field (`reasoning_content`, `reasoning`) is ignored on purpose.
      const content = chunk.choices?.[0]?.delta?.content
      if (content) emit(filter.push(content))
    }
    emit(filter.flush())

    reply = reply.trim()
    this.history.push({ role: 'user', content: text }, { role: 'assistant', content: reply })
    return reply
  }
}

/** Yields the data of each server-sent event, however the stream splits it into chunks. */
export async function* serverSentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let data: string[] = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r\n|\r|\n/)
      // The last piece may be an unfinished line, unless the stream has ended.
      buffer = done ? '' : (lines.pop() ?? '')
      for (const line of lines) {
        if (line === '') {
          if (data.length) yield data.join('\n')
          data = []
        } else if (line.startsWith('data:')) {
          data.push(line.slice(line.startsWith('data: ') ? 6 : 5))
        }
      }
      if (done) {
        if (data.length) yield data.join('\n')
        return
      }
    }
  } finally {
    reader.releaseLock()
  }
}

const OPEN_TAG = '<think>'
const CLOSE_TAG = '</think>'

/** Removes `<think>…</think>` blocks from streamed text, including tags split across chunks. */
export class ThinkFilter {
  private buffer = ''
  private thinking = false

  /** Returns the text that is certainly outside a think block. */
  push(text: string): string {
    this.buffer += text
    let visible = ''
    for (;;) {
      const tag = this.thinking ? CLOSE_TAG : OPEN_TAG
      const index = this.buffer.indexOf(tag)
      if (index !== -1) {
        if (!this.thinking) visible += this.buffer.slice(0, index)
        this.buffer = this.buffer.slice(index + tag.length)
        this.thinking = !this.thinking
        continue
      }
      // Hold back an ending that could be the start of the tag; inside a block, drop the rest.
      const kept = partialTagLength(this.buffer, tag)
      if (!this.thinking) visible += this.buffer.slice(0, this.buffer.length - kept)
      this.buffer = this.buffer.slice(this.buffer.length - kept)
      return visible
    }
  }

  /** The held-back text at the end of the stream. An unclosed think block is dropped. */
  flush(): string {
    const rest = this.thinking ? '' : this.buffer
    this.buffer = ''
    return rest
  }
}

function partialTagLength(text: string, tag: string): number {
  for (let length = Math.min(tag.length - 1, text.length); length > 0; length--) {
    if (text.endsWith(tag.slice(0, length))) return length
  }
  return 0
}
