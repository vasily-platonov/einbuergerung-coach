export type ProviderId = 'openai' | 'gemini' | 'claude' | 'demo' | 'local'

/** A cloud provider reached with the visitor's own key. */
interface KeyConnection<P extends ProviderId> {
  provider: P
  apiKey: string
}

/** An OpenAI-compatible server on the visitor's own computer. */
export interface LocalConnection {
  provider: 'local'
  /** Loopback only, without a trailing slash, for example `http://localhost:11434/v1`. */
  baseUrl: string
  model: string
  /** Empty when the server needs no key. */
  apiKey: string
}

/**
 * Everything a session or reviewer needs to reach one provider, told apart by `provider`.
 * A provider with more settings than a key adds its own member here.
 */
export type Connection =
  | KeyConnection<'openai'>
  | KeyConnection<'gemini'>
  | KeyConnection<'claude'>
  | KeyConnection<'demo'>
  | LocalConnection

export type ConnectionFor<P extends ProviderId> = Extract<Connection, { provider: P }>

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

export interface VoiceSessionConfig<C extends Connection = Connection> {
  connection: C
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
