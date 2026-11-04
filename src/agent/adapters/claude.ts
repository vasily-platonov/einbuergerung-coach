import Anthropic from '@anthropic-ai/sdk'
import type { BetaMessage, BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { ProviderError, type SessionPhase, type VoiceSession, type VoiceSessionConfig } from '../types'

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
export class ClaudeVoiceSession implements VoiceSession {
  private readonly client: Anthropic
  private readonly recognition: SpeechRecognition | null
  private readonly history: BetaMessageParam[] = []
  private controller = new AbortController()
  private finalSpeech = ''
  private stopped = false
  private turnCount = 0
  private pendingUtterances = 0
  private streamDone = true

  constructor(private readonly config: VoiceSessionConfig) {
    this.client = createClaudeClient(config.apiKey)
    this.recognition = createRecognition()
    if (this.recognition) {
      this.recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) this.finalSpeech += `${event.results[i][0].transcript} `
        }
      }
      this.recognition.onend = () => this.handleRecognitionEnd()
      this.recognition.onerror = (event) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          config.events.onError(new ProviderError(`Speech recognition: ${event.error}`))
        }
      }
    }
  }

  canRecord(): boolean {
    return this.recognition !== null
  }

  async start(): Promise<void> {
    this.setPhase('connecting')
    await this.respondTo('Das Gespräch beginnt jetzt.')
  }

  startAnswer(): void {
    if (!this.recognition) return
    this.finalSpeech = ''
    this.recognition.start()
    this.setPhase('recording')
  }

  finishAnswer(): void {
    this.setPhase('thinking')
    this.recognition?.stop()
  }

  sendText(text: string): void {
    this.config.events.onTurn({ id: this.nextTurnId(), role: 'applicant', text })
    void this.respondTo(text)
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.controller.abort()
    this.recognition?.abort()
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  }

  private handleRecognitionEnd(): void {
    if (this.stopped) return
    const text = this.finalSpeech.trim()
    if (text) {
      this.sendText(text)
    } else {
      this.setPhase('your-turn')
    }
  }

  private async respondTo(text: string): Promise<void> {
    this.setPhase('thinking')
    this.history.push({ role: 'user', content: text })
    this.controller = new AbortController()
    this.streamDone = false
    let unspoken = ''
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: CLAUDE_MODEL,
          max_tokens: 16000,
          betas: [CLAUDE_FALLBACK_BETA],
          fallbacks: 'default',
          output_config: { effort: 'low' },
          system: this.config.instructions,
          messages: this.history,
        },
        { signal: this.controller.signal },
      )
      stream.on('text', (delta) => {
        unspoken += delta
        const { sentences, rest } = splitSentences(unspoken)
        unspoken = rest
        sentences.forEach((sentence) => this.speak(sentence))
      })
      const message = await stream.finalMessage()
      const reply = claudeText(message)
      if (unspoken.trim()) this.speak(unspoken)
      this.history.push({ role: 'assistant', content: message.content })
      this.config.events.onTurn({ id: this.nextTurnId(), role: 'examiner', text: reply })
      this.streamDone = true
      this.finishTurnIfSilent()
    } catch (error) {
      if (!this.stopped) this.config.events.onError(toError(error))
    }
  }

  private speak(text: string): void {
    if (this.stopped || typeof speechSynthesis === 'undefined') return
    this.setPhase('examiner-speaking')
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'de-DE'
    const voice = speechSynthesis.getVoices().find((candidate) => candidate.lang.startsWith('de'))
    if (voice) utterance.voice = voice
    this.pendingUtterances++
    const done = () => {
      this.pendingUtterances--
      this.finishTurnIfSilent()
    }
    utterance.onend = done
    utterance.onerror = done
    speechSynthesis.speak(utterance)
  }

  private finishTurnIfSilent(): void {
    if (!this.stopped && this.streamDone && this.pendingUtterances === 0) this.setPhase('your-turn')
  }

  private setPhase(phase: SessionPhase): void {
    if (!this.stopped) this.config.events.onPhase(phase)
  }

  private nextTurnId(): string {
    return `turn-${++this.turnCount}`
  }
}

export function splitSentences(text: string): { sentences: string[]; rest: string } {
  const sentences: string[] = []
  let rest = text
  for (let match = /[.!?]\s/.exec(rest); match; match = /[.!?]\s/.exec(rest)) {
    sentences.push(rest.slice(0, match.index + 1).trim())
    rest = rest.slice(match.index + 2)
  }
  return { sentences, rest }
}

function createRecognition(): SpeechRecognition | null {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
  if (!Recognition) return null
  const recognition = new Recognition()
  recognition.lang = 'de-DE'
  recognition.continuous = true
  recognition.interimResults = false
  return recognition
}

function toError(error: unknown): Error {
  if (error instanceof Anthropic.APIError) return new ProviderError(error.message)
  return error instanceof Error ? error : new Error(String(error))
}

declare global {
  interface SpeechRecognition {
    lang: string
    continuous: boolean
    interimResults: boolean
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onend: (() => void) | null
    onerror: ((event: { error: string }) => void) | null
    start(): void
    stop(): void
    abort(): void
  }
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
}
