import { useEffect, useRef, useState, type FormEvent } from 'react'
import { INITIAL_STATE, Interview, type InterviewState } from '../agent/interview'
import type { Connection, SessionPhase } from '../agent/types'
import type { Locale, UiStrings } from '../content'
import { ConnectPanel } from './ConnectPanel'

interface Props {
  question: string
  locale: Locale
  connection: Connection | null
  onConnect(connection: Connection | null): void
}

export function InterviewPanel({ question, locale, connection, onConnect }: Props) {
  const { ui } = locale
  const text = ui.interview
  const [state, setState] = useState<InterviewState>(INITIAL_STATE)
  const [typed, setTyped] = useState('')
  const interview = useRef<Interview | null>(null)

  // Leaving the page, or losing the connection, stops the microphone, audio and requests.
  useEffect(() => reset, [connection])

  function reset() {
    interview.current?.dispose()
    interview.current = null
  }

  function start() {
    if (!connection) return
    reset()
    setState(INITIAL_STATE)
    interview.current = new Interview(connection, question, locale.promptLanguage, setState)
    void interview.current.start()
  }

  function sendTyped(event: FormEvent) {
    event.preventDefault()
    interview.current?.sendText(typed)
    setTyped('')
  }

  if (!connection && state.status === 'idle') {
    return (
      <section className="card interview" aria-label={text.title}>
        <h2>{text.title}</h2>
        <p className="muted">{text.description}</p>
        <p>{text.connectFirst}</p>
        <ConnectPanel ui={ui} connection={connection} onConnect={onConnect} />
      </section>
    )
  }

  const canAnswer = state.phase === 'your-turn' || state.phase === 'recording'

  return (
    <section className="card interview" aria-label={text.title}>
      <h2>{text.title}</h2>

      {state.status === 'idle' && (
        <>
          <p className="muted">{text.description}</p>
          <button type="button" className="button primary large" onClick={start}>
            {text.start}
          </button>
        </>
      )}

      {state.status === 'active' && (
        <>
          <p className={`phase phase-${state.phase}`} role="status" aria-live="polite">
            <span className="status-dot" aria-hidden="true" /> {phaseLabel(state.phase, ui)}
          </p>
          {state.timeWarning && <p className="warning">{text.timeWarning}</p>}
          {state.canRecord ? (
            <button
              type="button"
              className={state.phase === 'recording' ? 'button danger large' : 'button primary large'}
              disabled={!canAnswer}
              onClick={() =>
                state.phase === 'recording' ? interview.current?.finishAnswer() : interview.current?.startAnswer()
              }
            >
              {state.phase === 'recording' ? text.finishAnswer : text.startAnswer}
            </button>
          ) : (
            state.phase !== 'connecting' && <p className="muted">{text.noMic}</p>
          )}
          <form className="typed" onSubmit={sendTyped}>
            <label>
              {text.typed}
              <textarea lang="de" rows={2} value={typed} onChange={(event) => setTyped(event.target.value)} />
            </label>
            <button type="submit" className="button ghost" disabled={state.phase !== 'your-turn' || !typed.trim()}>
              {text.send}
            </button>
          </form>
          <button type="button" className="button ghost" onClick={() => void interview.current?.finish()}>
            {text.finish}
          </button>
        </>
      )}

      {state.status === 'reviewing' && (
        <p role="status" aria-live="polite">
          {text.reviewing}
        </p>
      )}

      {state.status === 'review-failed' && (
        <>
          <p className="error" role="alert">
            {text.reviewFailed} {state.error}
          </p>
          <div className="actions">
            <button type="button" className="button primary" onClick={() => void interview.current?.retryReview()}>
              {text.retryReview}
            </button>
            <button type="button" className="button ghost" onClick={start} disabled={!connection}>
              {text.again}
            </button>
          </div>
        </>
      )}

      {state.status === 'failed' && (
        <>
          <p className="error" role="alert">
            {text.failed} {state.error}
          </p>
          <button type="button" className="button primary" onClick={start} disabled={!connection}>
            {text.again}
          </button>
        </>
      )}

      {state.status === 'reviewed' && (
        <>
          {state.review ? <ReviewView state={state} ui={ui} /> : <p>{text.noAnswers}</p>}
          <button type="button" className="button primary" onClick={start} disabled={!connection}>
            {text.again}
          </button>
        </>
      )}
    </section>
  )
}

function phaseLabel(phase: SessionPhase, ui: UiStrings): string {
  const text = ui.interview
  const labels: Record<SessionPhase, string> = {
    connecting: text.connecting,
    'examiner-speaking': text.speaking,
    'your-turn': text.yourTurn,
    recording: text.recording,
    thinking: text.thinking,
  }
  return labels[phase]
}

function ReviewView({ state, ui }: { state: InterviewState; ui: UiStrings }) {
  const review = state.review!
  const text = ui.review
  return (
    <div className="review">
      <h3>{text.title}</h3>
      <p className={`readiness readiness-${review.readiness}`}>{text.readiness[review.readiness]}</p>
      <p>{review.summary}</p>
      <ReviewList title={text.correct} items={review.correct} />
      <ReviewList title={text.toFix} items={review.toFix} />
      <ReviewList title={text.languageNotes} items={review.languageNotes} />
      <h4>{text.improvedAnswer}</h4>
      <p lang="de" className="improved">
        {review.improvedAnswer}
      </p>
      <details>
        <summary>{text.transcript}</summary>
        <ul className="transcript">
          {state.transcript
            .filter((turn) => turn.text.trim())
            .map((turn) => (
              <li key={turn.id}>
                <strong>{turn.role === 'examiner' ? text.examiner : text.applicant}:</strong>{' '}
                <span lang="de">{turn.text}</span>
              </li>
            ))}
        </ul>
      </details>
    </div>
  )
}

function ReviewList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <>
      <h4>{title}</h4>
      <ul className="plain-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  )
}
