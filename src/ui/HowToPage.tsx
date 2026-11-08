import type { ReactNode } from 'react'
import { PROVIDERS } from '../agent/providers'
import type { UiStrings } from '../content'

type GuideId = keyof UiStrings['howTo']['providers']
const GUIDES: GuideId[] = ['openai', 'gemini', 'claude']

/** Shows the part of a step between [brackets] as a link to `url`. */
function withLink(step: string, url: string): ReactNode {
  const match = /^(.*?)\[(.+?)\](.*)$/.exec(step)
  if (!match) return step
  return (
    <>
      {match[1]}
      <a href={url} target="_blank" rel="noreferrer noopener">
        {match[2]}
      </a>
      {match[3]}
    </>
  )
}

/** Steps to get a key from each cloud provider. */
export function HowToPage({ ui }: { ui: UiStrings }) {
  const text = ui.howTo
  return (
    <article className="howto-page">
      <nav className="crumbs">
        <a href="#/">← {text.back}</a>
      </nav>
      <h1>{text.title}</h1>
      <p>{text.intro}</p>
      {GUIDES.map((id) => {
        const info = PROVIDERS.find((candidate) => candidate.id === id)!
        const guide = text.providers[id]
        return (
          <section key={id} className="card howto-provider">
            <h2>{info.name}</h2>
            <p className="muted">{guide.summary}</p>
            <ol>
              {guide.steps.map((step) => (
                <li key={step}>{withLink(step, info.keyUrl)}</li>
              ))}
            </ol>
            <div className="key-links small">
              <a href={info.keyUrl} target="_blank" rel="noreferrer noopener">
                {text.openKeys}
              </a>
              <a href={info.billingUrl} target="_blank" rel="noreferrer noopener">
                {text.openBilling}
              </a>
            </div>
          </section>
        )
      })}
      <p>{text.afterwards}</p>
      <p className="muted small">{ui.connect.safety}</p>
    </article>
  )
}
