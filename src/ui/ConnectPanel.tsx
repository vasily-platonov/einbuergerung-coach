import { useState, type FormEvent, type ReactNode } from 'react'
import {
  assertLoopback,
  DEFAULT_LOCAL_BASE_URL,
  isLoopbackUrl,
  listLocalModels,
  LocalNetworkError,
} from '../agent/adapters/local'
import { PROVIDERS, verifyConnection, type ProviderInfo } from '../agent/providers'
import { ProviderError, type Connection, type ProviderId } from '../agent/types'
import type { UiStrings } from '../content'

interface Props {
  ui: UiStrings
  connection: Connection | null
  onConnect(connection: Connection | null): void
}

type ConnectError = 'invalidKey' | 'notLoopback' | 'localFailed' | 'localKeyRejected' | 'localUnreachable'

/**
 * The second step for `local`: the server's models to pick from, or a free-text name when the
 * server listed none or answered the listing with an HTTP error.
 */
type ModelStep = { kind: 'choose'; models: string[] } | { kind: 'type' }

function providerName(info: ProviderInfo, ui: UiStrings): string {
  return info.name ?? ui.connect.providerNames[info.id as keyof UiStrings['connect']['providerNames']]
}

export function ConnectPanel({ ui, connection, onConnect }: Props) {
  const text = ui.connect
  const [provider, setProvider] = useState<ProviderId>(PROVIDERS[0].id)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(DEFAULT_LOCAL_BASE_URL)
  const [model, setModel] = useState('')
  const [step, setStep] = useState<ModelStep | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<ConnectError | null>(null)
  const info = PROVIDERS.find((candidate) => candidate.id === provider)!
  const local = provider === 'local'

  /** A new address, key or provider makes the listed models stale. */
  function resetStep() {
    setStep(null)
    setModel('')
    setError(null)
  }

  async function listModels() {
    if (!isLoopbackUrl(baseUrl)) {
      setError('notLoopback')
      return
    }
    setChecking(true)
    setError(null)
    try {
      const models = await listLocalModels({ baseUrl, apiKey: apiKey.trim() })
      if (models.length) {
        setStep({ kind: 'choose', models })
        setModel(models[0])
      } else {
        setStep({ kind: 'type' })
      }
    } catch (failure) {
      const status = failure instanceof ProviderError ? failure.status : undefined
      if (failure instanceof LocalNetworkError) setError('localUnreachable')
      else if (status === 401 || status === 403) setError('localKeyRejected')
      // Another HTTP status means the server answered, so the visitor can still name the model.
      else if (status !== undefined) setStep({ kind: 'type' })
      else setError('localFailed')
    } finally {
      setChecking(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (local) {
      if (!step) return listModels()
      // The listing already reached the server, so connecting needs no second request.
      onConnect({ provider, baseUrl: assertLoopback(baseUrl), model: model.trim(), apiKey: apiKey.trim() })
      setApiKey('')
      resetStep()
      return
    }
    setChecking(true)
    setError(null)
    try {
      const candidate: Connection = { provider, apiKey: apiKey.trim() }
      await verifyConnection(candidate)
      onConnect(candidate)
      setApiKey('')
    } catch {
      setError('invalidKey')
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
          {connection.provider === 'local' && ` · ${connection.model}`}
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
        onChange={(event) => {
          setApiKey(event.target.value)
          if (local) resetStep()
        }}
      />
    </label>
  )

  let submitLabel = checking ? text.checking : text.submit
  if (local && !step) submitLabel = checking ? text.listing : text.listModels

  return (
    <section className="card">
      <h2>{text.title}</h2>
      <p className="muted">{local ? text.descriptionLocal : text.description}</p>
      <form className={local ? 'connect-form local' : 'connect-form'} onSubmit={submit}>
        <label>
          {text.provider}
          <select
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value as ProviderId)
              resetStep()
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
                onChange={(event) => {
                  setBaseUrl(event.target.value)
                  resetStep()
                }}
              />
              <span id="base-url-hint" className="field-hint">
                {text.baseUrlHint}
              </span>
            </label>
            {keyField}
            {step?.kind === 'choose' && (
              <label>
                {text.modelChoice}
                <select value={model} onChange={(event) => setModel(event.target.value)}>
                  {step.models.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {step?.kind === 'type' && (
              <label>
                {text.model}
                <input
                  type="text"
                  spellCheck={false}
                  required
                  aria-describedby="model-hint"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
                <span id="model-hint" className="field-hint">
                  {text.modelsMissing}
                </span>
              </label>
            )}
          </>
        ) : (
          keyField
        )}
        <button type="submit" className="button primary" disabled={checking}>
          {submitLabel}
        </button>
      </form>
      {error === 'localUnreachable' && <LocalHelp ui={ui} baseUrl={baseUrl.trim().replace(/\/+$/, '')} />}
      {error && error !== 'localUnreachable' && (
        <p className="error" role="alert">
          {text[error]}
        </p>
      )}
      {local && <p className="muted small">{text.localQuality}</p>}
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

/** Fills `{name}` placeholders and shows the parts between backticks as code. */
function withCode(template: string, values: Record<string, string>): ReactNode[] {
  const filled = template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match)
  return filled.split('`').map((part, index) => (index % 2 ? <code key={index}>{part}</code> : part))
}

/** What to check when the browser got no answer from the local server at all. */
function LocalHelp({ ui, baseUrl }: { ui: UiStrings; baseUrl: string }) {
  const help = ui.connect.localHelp
  const values = { baseUrl, origin: window.location.origin }
  const servers: [string, string][] = [
    ['Ollama', help.ollama],
    ['LM Studio', help.lmStudio],
    ['llama.cpp', help.llamaCpp],
    ['vLLM', help.vllm],
  ]
  return (
    <div className="local-help small" role="alert">
      <p className="error">{help.title}</p>
      <ol>
        <li>{withCode(help.running, values)}</li>
        <li>
          {withCode(help.allow, values)}
          <ul>
            {servers.map(([name, template]) => (
              <li key={name}>
                <strong>{name}:</strong> {withCode(template, values)}
              </li>
            ))}
          </ul>
        </li>
        <li>{help.prompt}</li>
        <li>{help.safari}</li>
      </ol>
    </div>
  )
}
