import { useState } from 'react'
import type { Connection } from '../agent/types'
import { GERMAN, QUESTIONS, SOURCES, type Locale } from '../content'
import { InterviewPanel } from './InterviewPanel'

interface Props {
  index: number
  locale: Locale
  connection: Connection | null
  onConnect(connection: Connection | null): void
}

export function QuestionPage({ index, locale, connection, onConnect }: Props) {
  const { ui } = locale
  const text = ui.question
  const meta = QUESTIONS[index]
  const german = GERMAN[meta.id]
  const translated = locale.questions[meta.id]
  const [showTranslation, setShowTranslation] = useState(false)
  const previous = QUESTIONS[index - 1]
  const next = QUESTIONS[index + 1]
  const hasPlaceholders = german.shortAnswer.includes('[')

  return (
    <article className="question-page">
      <nav className="crumbs">
        <a href="#/">← {text.back}</a>
        <span className="muted">
          {text.progress.replace('{current}', String(index + 1)).replace('{total}', String(QUESTIONS.length))}
        </span>
      </nav>

      <p className="eyebrow">{ui.blocks[meta.block]}</p>
      <h1 lang="de">{german.question}</h1>
      {/* Always in the layout, so the toggle below stays in place when this appears. */}
      <p className={showTranslation ? 'muted' : 'muted invisible'}>{translated.question}</p>
      <button
        type="button"
        className="button translation-toggle"
        aria-pressed={showTranslation}
        onClick={() => setShowTranslation(!showTranslation)}
      >
        {showTranslation ? text.hideTranslation : text.showTranslation}
      </button>

      <section className="card">
        <h2>{text.variants}</h2>
        <ul className="plain-list">
          {german.variants.map((variant, position) => (
            <li key={variant}>
              <span lang="de">{variant}</span>
              {showTranslation && <span className="translation">{translated.variants[position]}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>{text.keyIdeas}</h2>
        <ul className="plain-list">
          {translated.keyIdeas.map((idea) => (
            <li key={idea}>{idea}</li>
          ))}
        </ul>
      </section>

      <div className="answers">
        <Answer title={text.shortAnswer} german={german.shortAnswer} translation={translated.shortAnswer} show={showTranslation} />
        <Answer title={text.fullAnswer} german={german.fullAnswer} translation={translated.fullAnswer} show={showTranslation} />
      </div>
      {hasPlaceholders && <p className="muted small">{text.placeholders}</p>}

      <section className="card">
        <h2>{text.followUps}</h2>
        <ul className="plain-list">
          {german.followUps.map((followUp, position) => (
            <li key={followUp}>
              <span lang="de">{followUp}</span>
              {showTranslation && <span className="translation">{translated.followUps[position]}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>{text.mistakes}</h2>
        <ul className="plain-list">
          {translated.mistakes.map((mistake) => (
            <li key={mistake}>{mistake}</li>
          ))}
        </ul>
      </section>

      {showTranslation && (
        <section className="card">
          <h2>{text.glossary}</h2>
          <dl className="glossary">
            {translated.glossary.map((entry) => (
              <div key={entry.term}>
                <dt lang="de">{entry.term}</dt>
                <dd>{entry.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <InterviewPanel
        question={german.question}
        locale={locale}
        connection={connection}
        onConnect={onConnect}
      />

      <section className="sources">
        <h2>{text.sources}</h2>
        <ul>
          {meta.sources.map((key) => (
            <li key={key}>
              <a href={SOURCES[key].url} target="_blank" rel="noreferrer noopener">
                {SOURCES[key].label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <nav className="pager">
        {previous ? <a className="button ghost" href={`#/q/${previous.id}`}>← {text.previous}</a> : <span />}
        {next && <a className="button primary" href={`#/q/${next.id}`}>{text.next} →</a>}
      </nav>
    </article>
  )
}

function Answer(props: { title: string; german: string; translation: string; show: boolean }) {
  return (
    <section className="card answer">
      <h2>{props.title}</h2>
      <p lang="de">{props.german}</p>
      {props.show && <p className="translation">{props.translation}</p>}
    </section>
  )
}
