import { useState, type FormEvent } from 'react'
import { assertLoopback, DEFAULT_LOCAL_BASE_URL, isLoopbackUrl } from '../agent/adapters/local'
import { PROVIDERS, verifyConnection, type ProviderInfo } from '../agent/providers'
import type { Connection, ProviderId } from '../agent/types'
import type { UiStrings } from '../content'

interface Props {
  ui: UiStrings
  connection: Connection | null
  onConnect(connection: Connection | null): void
}

type ConnectError = 'invalidKey' | 'notLoopback' | 'localFailed'

function providerName(info: ProviderInfo, ui: UiStrings): string {
  return info.name ?? ui.connect.providerNames[info.id as keyof UiStrings['connect']['providerNames']]
}

export function ConnectPanel({ ui, connection, onConnect }: Props) {
  const text = ui.connect
  const [provider, setProvider] = useState<ProviderId>(PROVIDERS[0].id)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(DEFAULT_LOCAL_BASE_URL)
  const [model, setModel] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<ConnectError | null>(null)
  const info = PROVIDERS.find((candidate) => candidate.id === provider)!
  const local = provider === 'local'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (local && !isLoopbackUrl(baseUrl)) {
      setError('notLoopback')
      return
    }
    setChecking(true)
    setError(null)
    try {
      const candidate: Connection = local
        ? { provider, baseUrl: assertLoopback(baseUrl), model: model.trim(), apiKey: apiKey.trim() }
        : { provider, apiKey: apiKey.trim() }
      await verifyConnection(candidate)
      onConnect(candidate)
      setApiKey('')
    } catch {
      setError(local ? 'localFailed' : 'invalidKey')
    } finally {
      setChecking(false)
    }
  }

  if (connection) {
    const connected = PROVIDERS.find((candidate) => candidate.id === connection.provider)
    return (
      <section className="card connected">
        <span>
          <span className="status-dot" aria-hidden="true" /> {text.connectedAs}: {connected && providerName(connected, ui)}
        </span>
        <button type="button" className="button ghost" onClick={() => onConnect(null)}>
          {text.disconnect}
        </button>
      </section>
    )
  }

  const keyField = (
    <label>
      {local ? text.apiKeyOptional : text.apiKey}
      <input
        type="password"
        autoComplete="new-password"
        spellCheck={false}
        required={provider !== 'demo' && !local}
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
      />
    </label>
  )

  return (
    <section className="card">
      <h2>{text.title}</h2>
      <p className="muted">{text.description}</p>
      <form className={local ? 'connect-form local' : 'connect-form'} onSubmit={submit}>
        <label>
          {text.provider}
          <select
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value as ProviderId)
              setError(null)
            }}
          >
            {PROVIDERS.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {providerName(candidate, ui)}
              </option>
            ))}
          </select>
        </label>
        {local ? (
          <>
            <label>
              {text.baseUrl}
              <input
                type="url"
                spellCheck={false}
                required
                aria-describedby="base-url-hint"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
              />
              <span id="base-url-hint" className="field-hint">
                {text.baseUrlHint}
              </span>
            </label>
            <label>
              {text.model}
              <input
                type="text"
                spellCheck={false}
                required
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </label>
            {keyField}
          </>
        ) : (
          keyField
        )}
        <button type="submit" className="button primary" disabled={checking}>
          {checking ? text.checking : text.submit}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {text[error]}
        </p>
      )}
      <div className="key-links small">
        <span className="muted">{text.getKey}</span>
        {PROVIDERS.filter((candidate) => candidate.keyUrl).map((candidate) => (
          <a key={candidate.id} href={candidate.keyUrl} target="_blank" rel="noreferrer noopener">
            {providerName(candidate, ui)}
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
