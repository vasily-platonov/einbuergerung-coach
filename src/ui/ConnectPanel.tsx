import { useState, type FormEvent } from 'react'
import { PROVIDERS, verifyKey } from '../agent/providers'
import type { Connection, ProviderId } from '../agent/types'
import type { UiStrings } from '../content'

interface Props {
  ui: UiStrings
  connection: Connection | null
  onConnect(connection: Connection | null): void
}

export function ConnectPanel({ ui, connection, onConnect }: Props) {
  const text = ui.connect
  const [provider, setProvider] = useState<ProviderId>(PROVIDERS[0].id)
  const [apiKey, setApiKey] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState(false)
  const info = PROVIDERS.find((candidate) => candidate.id === provider)!

  async function submit(event: FormEvent) {
    event.preventDefault()
    setChecking(true)
    setError(false)
    try {
      await verifyKey(provider, apiKey.trim())
      onConnect({ provider, apiKey: apiKey.trim() })
      setApiKey('')
    } catch {
      setError(true)
    } finally {
      setChecking(false)
    }
  }

  if (connection) {
    const connected = PROVIDERS.find((candidate) => candidate.id === connection.provider)
    return (
      <section className="card connected">
        <span>
          <span className="status-dot" aria-hidden="true" /> {text.connectedAs}: {connected?.name}
        </span>
        <button type="button" className="button ghost" onClick={() => onConnect(null)}>
          {text.disconnect}
        </button>
      </section>
    )
  }

  return (
    <section className="card">
      <h2>{text.title}</h2>
      <p className="muted">{text.description}</p>
      <form className="connect-form" onSubmit={submit}>
        <label>
          {text.provider}
          <select value={provider} onChange={(event) => setProvider(event.target.value as ProviderId)}>
            {PROVIDERS.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text.apiKey}
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            required={provider !== 'demo'}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
        <button type="submit" className="button primary" disabled={checking}>
          {checking ? text.checking : text.submit}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {text.invalidKey}
        </p>
      )}
      <div className="key-links small">
        <span className="muted">{text.getKey}</span>
        {PROVIDERS.filter((candidate) => candidate.keyUrl).map((candidate) => (
          <a key={candidate.id} href={candidate.keyUrl} target="_blank" rel="noreferrer noopener">
            {candidate.name}
          </a>
        ))}
      </div>
      <p className="small">{text.sessionOnly}</p>
      <p className="muted small">{info.basicVoice ? text.basicVoice : text.nativeVoice}</p>
      <p className="muted small">{text.cost}</p>
      <p className="muted small">{text.safety}</p>
    </section>
  )
}
