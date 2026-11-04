import type { Connection } from '../agent/types'
import { BLOCKS, GERMAN, QUESTIONS, type Locale } from '../content'
import { ConnectPanel } from './ConnectPanel'

interface Props {
  locale: Locale
  connection: Connection | null
  onConnect(connection: Connection | null): void
}

export function HomePage({ locale, connection, onConnect }: Props) {
  const { ui } = locale
  return (
    <>
      <section className="hero">
        <h1>{ui.tagline}</h1>
        <p>{ui.intro}</p>
      </section>
      <ConnectPanel ui={ui} connection={connection} onConnect={onConnect} />
      <aside className="notice">
        <strong>{ui.disclaimerTitle}</strong>
        <p>{ui.disclaimer}</p>
      </aside>
      <h2 className="section-title">{ui.questionsTitle}</h2>
      {BLOCKS.map((block) => (
        <section key={block} className="question-block">
          <h3>{ui.blocks[block]}</h3>
          <ol className="question-list">
            {QUESTIONS.filter((question) => question.block === block).map((question) => (
              <li key={question.id}>
                <a href={`#/q/${question.id}`}>
                  <span lang="de">{GERMAN[question.id].question}</span>
                  <span className="muted small">{locale.questions[question.id].question}</span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  )
}
