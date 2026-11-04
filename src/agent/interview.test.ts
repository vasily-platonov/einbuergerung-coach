import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Interview, SESSION_LIMIT_MS, WARNING_BEFORE_END_MS, type InterviewDependencies, type InterviewState } from './interview'
import { END_PHRASE } from './prompt'
import type { Review } from './review'
import type { VoiceSession, VoiceSessionConfig } from './types'

const REVIEW: Review = {
  readiness: 'ready',
  summary: 'ok',
  correct: [],
  toFix: [],
  languageNotes: [],
  improvedAnswer: 'gut',
}

function setup() {
  let config!: VoiceSessionConfig
  const session: VoiceSession = {
    start: vi.fn(async () => undefined),
    startAnswer: vi.fn(),
    finishAnswer: vi.fn(),
    sendText: vi.fn(),
    canRecord: () => true,
    stop: vi.fn(),
  }
  const review = vi.fn<InterviewDependencies['review']>(async () => REVIEW)
  const states: InterviewState[] = []
  const interview = new Interview(
    { provider: 'demo', apiKey: 'k' },
    'Was ist Demokratie?',
    'Russian',
    (state) => states.push(state),
    {
      createSession: (_provider, sessionConfig) => {
        config = sessionConfig
        return session
      },
      review,
    },
  )
  return { interview, session, review, latest: () => states[states.length - 1], events: () => config.events, prompt: () => config.instructions }
}

describe('Interview', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('puts the page question into the prompt', async () => {
    const { interview, prompt } = setup()
    await interview.start()
    expect(prompt()).toContain('Was ist Demokratie?')
    expect(prompt()).not.toContain('{{QUESTION}}')
  })

  it('reviews after the examiner has finished saying the end phrase', async () => {
    const { interview, session, review, latest, events } = setup()
    await interview.start()
    events().onTurn({ id: '1', role: 'applicant', text: 'Das Volk wählt.' })
    events().onTurn({ id: '2', role: 'examiner', text: `Danke. ${END_PHRASE}` })
    expect(review).not.toHaveBeenCalled()

    events().onPhase('your-turn')
    await vi.runOnlyPendingTimersAsync()

    expect(session.stop).toHaveBeenCalled()
    expect(review).toHaveBeenCalledOnce()
    expect(latest().status).toBe('reviewed')
    expect(latest().review).toEqual(REVIEW)
  })

  it('fills in a late transcript without changing the turn order', async () => {
    const { interview, latest, events } = setup()
    await interview.start()
    events().onTurn({ id: 'a', role: 'applicant', text: '' })
    events().onTurn({ id: 'b', role: 'examiner', text: 'Warum?' })
    events().onTurn({ id: 'a', role: 'applicant', text: 'Weil.' })
    expect(latest().transcript.map((turn) => turn.text)).toEqual(['Weil.', 'Warum?'])
  })

  it('skips the review when the applicant never answered', async () => {
    const { interview, review, latest } = setup()
    await interview.start()
    await interview.finish()
    expect(review).not.toHaveBeenCalled()
    expect(latest().status).toBe('reviewed')
    expect(latest().review).toBeNull()
  })

  it('warns one minute before the limit and ends at the limit', async () => {
    const { interview, session, latest } = setup()
    await interview.start()
    await vi.advanceTimersByTimeAsync(SESSION_LIMIT_MS - WARNING_BEFORE_END_MS)
    expect(latest().timeWarning).toBe(true)
    expect(session.stop).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(WARNING_BEFORE_END_MS)
    expect(session.stop).toHaveBeenCalled()
  })

  it('stops the session and ignores later events when disposed', async () => {
    const { interview, session, latest, events } = setup()
    await interview.start()
    const before = latest()
    interview.dispose()
    events().onTurn({ id: 'x', role: 'examiner', text: 'Noch da?' })
    events().onPhase('your-turn')
    expect(session.stop).toHaveBeenCalled()
    expect(latest()).toBe(before)
  })

  it('keeps the conversation after a failed review and can retry it', async () => {
    const { interview, review, latest, events } = setup()
    await interview.start()
    events().onTurn({ id: '1', role: 'applicant', text: 'Das Volk wählt.' })
    review.mockRejectedValueOnce(new Error('HTTP 503'))

    await interview.finish()
    expect(latest().status).toBe('review-failed')
    expect(latest().error).toBe('HTTP 503')

    await interview.retryReview()
    expect(review).toHaveBeenCalledTimes(2)
    expect(review.mock.calls[1]).toEqual(review.mock.calls[0])
    expect(latest().status).toBe('reviewed')
    expect(latest().error).toBeNull()
    expect(latest().review).toEqual(REVIEW)
  })

  it('reports a failed start', async () => {
    const { interview, session, latest } = setup()
    vi.mocked(session.start).mockRejectedValueOnce(new Error('HTTP 401'))
    await interview.start()
    expect(latest().status).toBe('failed')
    expect(latest().error).toBe('HTTP 401')
    expect(session.stop).toHaveBeenCalled()
  })
})
