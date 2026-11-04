export type ProviderId = 'openai' | 'gemini' | 'claude' | 'demo'

export interface Connection {
  provider: ProviderId
  apiKey: string
}

export type SessionPhase = 'connecting' | 'examiner-speaking' | 'your-turn' | 'recording' | 'thinking'

export interface TranscriptTurn {
  id: string
  role: 'examiner' | 'applicant'
  text: string
}

export interface VoiceSessionEvents {
  onPhase(phase: SessionPhase): void
  /** Emitting a known id replaces that turn's text, because transcription can arrive late. */
  onTurn(turn: TranscriptTurn): void
  onError(error: Error): void
}

export interface VoiceSessionConfig {
  apiKey: string
  instructions: string
  events: VoiceSessionEvents
}

/** One conversation with one provider. It is never reused: each interview creates a new one. */
export interface VoiceSession {
  start(): Promise<void>
  startAnswer(): void
  finishAnswer(): void
  sendText(text: string): void
  /** False when the microphone or speech recognition is unavailable, leaving typed answers. */
  canRecord(): boolean
  /** Safe to call at any time and more than once. Releases the microphone, audio and requests. */
  stop(): void
}

/** The API rejected the key or the request. The message can be shown as it is. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}
