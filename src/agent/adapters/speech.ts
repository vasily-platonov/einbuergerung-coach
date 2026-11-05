import { ProviderError, type SessionPhase, type VoiceSession, type VoiceSessionEvents } from '../types'

/** What a text-only provider supplies to get a voice conversation from the browser. */
export interface TextReplier {
  /**
   * Adds the applicant's message to the provider's history, streams the examiner's reply through
   * `onText` and resolves with the whole reply, which is then part of the history.
   * Rejects with an error that can be shown as it is.
   */
  reply(text: string, onText: (delta: string) => void, signal: AbortSignal): Promise<string>
}

const OPENING_MESSAGE = 'Das Gespräch beginnt jetzt.'

/**
 * A voice conversation for providers without a realtime voice API: the browser listens and speaks,
 * the provider only writes the replies. Each reply is spoken sentence by sentence as it streams.
 */
export class BrowserSpeechSession implements VoiceSession {
  private readonly recognition: SpeechRecognition | null
  private controller = new AbortController()
  private finalSpeech = ''
  private stopped = false
  private turnCount = 0
  private pendingUtterances = 0
  private streamDone = true

  constructor(
    private readonly events: VoiceSessionEvents,
    private readonly replier: TextReplier,
  ) {
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
          events.onError(new ProviderError(`Speech recognition: ${event.error}`))
        }
      }
    }
  }

  canRecord(): boolean {
    return this.recognition !== null
  }

  async start(): Promise<void> {
    this.setPhase('connecting')
    await this.respondTo(OPENING_MESSAGE)
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
    this.events.onTurn({ id: this.nextTurnId(), role: 'applicant', text })
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
    this.controller = new AbortController()
    this.streamDone = false
    let unspoken = ''
    try {
      const reply = await this.replier.reply(
        text,
        (delta) => {
          unspoken += delta
          const { sentences, rest } = splitSentences(unspoken)
          unspoken = rest
          sentences.forEach((sentence) => this.speak(sentence))
        },
        this.controller.signal,
      )
      if (unspoken.trim()) this.speak(unspoken)
      this.events.onTurn({ id: this.nextTurnId(), role: 'examiner', text: reply })
      this.streamDone = true
      this.finishTurnIfSilent()
    } catch (error) {
      if (!this.stopped) this.events.onError(error instanceof Error ? error : new Error(String(error)))
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
    if (!this.stopped) this.events.onPhase(phase)
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
