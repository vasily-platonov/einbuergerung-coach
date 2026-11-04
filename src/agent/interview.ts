import { END_PHRASE, buildInterviewPrompt } from './prompt'
import { generateReview, type Review } from './review'
import { createVoiceSession } from './providers'
import type { Connection, SessionPhase, TranscriptTurn, VoiceSession, VoiceSessionConfig } from './types'

export const SESSION_LIMIT_MS = 10 * 60 * 1000
export const WARNING_BEFORE_END_MS = 60 * 1000

export interface InterviewState {
  status: 'idle' | 'active' | 'reviewing' | 'reviewed' | 'review-failed' | 'failed'
  phase: SessionPhase
  canRecord: boolean
  timeWarning: boolean
  transcript: TranscriptTurn[]
  review: Review | null
  error: string | null
}

export const INITIAL_STATE: InterviewState = {
  status: 'idle',
  phase: 'connecting',
  canRecord: false,
  timeWarning: false,
  transcript: [],
  review: null,
  error: null,
}

export interface InterviewDependencies {
  createSession(provider: Connection['provider'], config: VoiceSessionConfig): VoiceSession
  review: typeof generateReview
}

/**
 * One interview from first greeting to review. Each page creates its own, so nothing the
 * agent heard on one page can reach the next. dispose() is the only cleanup callers need.
 */
export class Interview {
  private state = INITIAL_STATE
  private session: VoiceSession | null = null
  private readonly timers: ReturnType<typeof setTimeout>[] = []
  private readonly reviewController = new AbortController()
  private endPhraseHeard = false
  private disposed = false

  constructor(
    private readonly connection: Connection,
    private readonly question: string,
    private readonly language: string,
    private readonly onChange: (state: InterviewState) => void,
    private readonly dependencies: InterviewDependencies = { createSession: createVoiceSession, review: generateReview },
  ) {}

  async start(): Promise<void> {
    this.update({ ...INITIAL_STATE, status: 'active' })
    this.timers.push(
      setTimeout(() => this.update({ timeWarning: true }), SESSION_LIMIT_MS - WARNING_BEFORE_END_MS),
      setTimeout(() => void this.finish(), SESSION_LIMIT_MS),
    )
    const session = this.dependencies.createSession(this.connection.provider, {
      apiKey: this.connection.apiKey,
      instructions: buildInterviewPrompt(this.question),
      events: {
        onPhase: (phase) => this.handlePhase(phase),
        onTurn: (turn) => this.handleTurn(turn),
        onError: (error) => this.fail(error),
      },
    })
    this.session = session
    try {
      await session.start()
      if (!this.disposed) this.update({ canRecord: session.canRecord() })
    } catch (error) {
      this.fail(error)
    }
  }

  startAnswer(): void {
    this.session?.startAnswer()
  }

  finishAnswer(): void {
    this.session?.finishAnswer()
  }

  sendText(text: string): void {
    if (text.trim()) this.session?.sendText(text.trim())
  }

  /** Ends the conversation and asks for the review. */
  async finish(): Promise<void> {
    if (this.disposed || this.state.status !== 'active') return
    this.releaseSession()
    const answered = this.state.transcript.some((turn) => turn.role === 'applicant' && turn.text.trim())
    if (!answered) {
      this.update({ status: 'reviewed', review: null })
      return
    }
    await this.requestReview()
  }

  /** Sends the same conversation again after a failed review. */
  async retryReview(): Promise<void> {
    if (!this.disposed && this.state.status === 'review-failed') await this.requestReview()
  }

  private async requestReview(): Promise<void> {
    this.update({ status: 'reviewing', error: null })
    try {
      const review = await this.dependencies.review(
        this.connection,
        this.question,
        this.language,
        this.state.transcript,
        this.reviewController.signal,
      )
      if (!this.disposed) this.update({ status: 'reviewed', review })
    } catch (error) {
      if (!this.disposed) {
        this.update({ status: 'review-failed', error: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  dispose(): void {
    this.disposed = true
    this.reviewController.abort()
    this.releaseSession()
  }

  private handlePhase(phase: SessionPhase): void {
    if (this.disposed || this.state.status !== 'active') return
    this.update({ phase })
    if (phase === 'your-turn' && this.endPhraseHeard) void this.finish()
  }

  private handleTurn(turn: TranscriptTurn): void {
    if (this.disposed) return
    if (turn.role === 'examiner' && turn.text.includes(END_PHRASE)) this.endPhraseHeard = true
    const known = this.state.transcript.some((existing) => existing.id === turn.id)
    this.update({
      transcript: known
        ? this.state.transcript.map((existing) => (existing.id === turn.id ? turn : existing))
        : [...this.state.transcript, turn],
    })
  }

  private fail(error: unknown): void {
    if (this.disposed) return
    this.releaseSession()
    this.update({ status: 'failed', error: error instanceof Error ? error.message : String(error) })
  }

  private releaseSession(): void {
    this.timers.forEach(clearTimeout)
    this.session?.stop()
    this.session = null
  }

  private update(change: Partial<InterviewState>): void {
    this.state = { ...this.state, ...change }
    this.onChange(this.state)
  }
}
