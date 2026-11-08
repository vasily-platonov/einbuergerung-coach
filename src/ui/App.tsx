import { useEffect, useState } from 'react'
import type { Connection } from '../agent/types'
import { LOCALES, QUESTIONS, pickLocale } from '../content'
import { HomePage } from './HomePage'
import { HowToPage } from './HowToPage'
import { QuestionPage } from './QuestionPage'

function currentRoute(): string {
  return window.location.hash.replace(/^#\/?/, '')
}

export function App() {
  // All of this lives in memory on purpose: nothing is written to browser storage.
  const [locale, setLocale] = useState(() => pickLocale(navigator.languages ?? []))
  const [connection, setConnection] = useState<Connection | null>(null)
  const [route, setRoute] = useState(currentRoute)

  useEffect(() => {
    const onHashChange = () => {
      setRoute(currentRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale.code
  }, [locale])

  const questionId = route.startsWith('q/') ? route.slice(2) : null
  const index = QUESTIONS.findIndex((question) => question.id === questionId)

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          {locale.ui.appName}
        </a>
        <div className="languages" role="group" aria-label="Language">
          {LOCALES.map((option) => (
            <button
              key={option.code}
              type="button"
              className={option.code === locale.code ? 'chip active' : 'chip'}
              aria-pressed={option.code === locale.code}
              onClick={() => setLocale(option)}
            >
              {option.name}
            </button>
          ))}
        </div>
      </header>
      <main>
        {route === 'howto' ? (
          <HowToPage ui={locale.ui} />
        ) : index >= 0 ? (
          // The key makes each page a new mount, which ends any interview from the previous page.
          <QuestionPage
            key={QUESTIONS[index].id}
            index={index}
            locale={locale}
            connection={connection}
            onConnect={setConnection}
          />
        ) : (
          <HomePage locale={locale} connection={connection} onConnect={setConnection} />
        )}
      </main>
    </div>
  )
}
