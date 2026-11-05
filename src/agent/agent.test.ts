import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { splitSentences } from './adapters/speech'
import { base64ToBytes, bytesToBase64, parseSampleRate, pcm16ToFloat32 } from './adapters/gemini'
import { buildReviewPrompt, formatTranscript } from './prompt'
import { generateReview, parseReview } from './review'

describe('generateReview with Gemini', () => {
  const turns = [{ id: '1', role: 'applicant' as const, text: 'Darum.' }]
  const connection = { provider: 'gemini' as const, apiKey: 'k' }
  const answer = () =>
    Response.json({ candidates: [{ content: { parts: [{ text: '{"readiness":"ready"}' }] } }] })

  afterEach(() => vi.unstubAllGlobals())

  it('asks the first model once and then moves to the second', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('gemini-3.6-flash') ? answer() : new Response('busy', { status: 503 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const review = await generateReview(connection, 'Frage?', 'Russian', turns, new AbortController().signal)

    expect(review.readiness).toBe('ready')
    expect(fetchMock.mock.calls.map(([url]) => /gemini-[\d.]+-flash/.exec(url)?.[0])).toEqual([
      'gemini-3.8-flash',
      'gemini-3.6-flash',
    ])
  })

  it('makes one request to the first model and three to the second, reporting each retry', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (_url: string) => new Response('busy', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    const onRetry = vi.fn()

    const result = generateReview(connection, 'Frage?', 'Russian', turns, new AbortController().signal, onRetry).catch(
      (error: Error) => error.message,
    )
    await vi.runAllTimersAsync()
    vi.useRealTimers()

    expect(await result).toContain('HTTP 503')
    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(urls.filter((url) => url.includes('gemini-3.8-flash'))).toHaveLength(1)
    expect(urls.filter((url) => url.includes('gemini-3.6-flash'))).toHaveLength(3)
    expect(onRetry).toHaveBeenCalledTimes(3)
  })

  it('does not repeat a rejected request on the second model', async () => {
    const fetchMock = vi.fn(async () => new Response('bad request', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateReview(connection, 'Frage?', 'Russian', turns, new AbortController().signal)).rejects.toThrow('HTTP 400')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('generateReview with OpenAI when overloaded', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('retries temporary errors', async () => {
    const fetchMock = vi.fn(async () => new Response('busy', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = generateReview(
      { provider: 'openai', apiKey: 'k' },
      'Frage?',
      'Russian',
      [{ id: '1', role: 'applicant', text: 'Darum.' }],
      new AbortController().signal,
    ).catch((error: Error) => error.message)
    await vi.runAllTimersAsync()

    expect(await result).toContain('HTTP 503')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('generateReview with OpenAI', () => {
  it('mentions JSON in the input, as JSON mode requires, and reads the reply', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ output: [{ content: [{ text: '{"readiness":"ready","summary":"gut"}' }] }] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    try {
      const review = await generateReview(
        { provider: 'openai', apiKey: 'k' },
        'Frage?',
        'Russian',
        [{ id: '1', role: 'applicant', text: 'Darum.' }],
        new AbortController().signal,
      )
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { input: string }
      expect(body.input).toMatch(/json/i)
      expect(body.input).toContain('Applicant: Darum.')
      expect(review.readiness).toBe('ready')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('generateReview with a local model', () => {
  const turns = [{ id: '1', role: 'applicant' as const, text: 'Darum.' }]
  const connection = { provider: 'local' as const, baseUrl: 'http://localhost:11434/v1/', model: 'qwen3', apiKey: '' }
  const reply = (content: string, extra: Record<string, unknown> = {}) =>
    Response.json({ choices: [{ message: { content, ...extra } }] })
  const review = (conn: typeof connection = connection, onRetry?: () => void) =>
    generateReview(conn, 'Frage?', 'Russian', turns, new AbortController().signal, onRetry)
  const bodyOf = (init: RequestInit) => JSON.parse(init.body as string) as Record<string, unknown>
  const headersOf = (init: RequestInit) => init.headers as Record<string, string>

  afterEach(() => vi.unstubAllGlobals())

  it('sends one non-streaming JSON-mode request with the review prompt and transcript', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => reply('{"readiness":"ready","summary":"gut"}'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await review()

    expect(result).toMatchObject({ readiness: 'ready', summary: 'gut' })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    expect(init.method).toBe('POST')
    const body = bodyOf(init) as { model: string; stream: boolean; response_format: unknown; messages: { role: string; content: string }[] }
    expect(body.model).toBe('qwen3')
    expect(body.stream).toBe(false)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages[0]).toEqual({ role: 'system', content: buildReviewPrompt('Frage?', 'Russian') })
    expect(body.messages[1].role).toBe('user')
    expect(body.messages[1].content).toMatch(/json/i)
    expect(body.messages[1].content).toContain(formatTranscript(turns))
  })

  it('repeats a rejected request once without the JSON format and cuts the object out of the text', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      'response_format' in bodyOf(init)
        ? new Response('response_format.type must be json_schema or text', { status: 400 })
        : reply('Hier ist der Bericht:\n{"readiness":"almost"}\nViel Erfolg!'),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onRetry = vi.fn()

    const result = await review(connection, onRetry)

    expect(result.readiness).toBe('almost')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(bodyOf(fetchMock.mock.calls[1][1])).not.toHaveProperty('response_format')
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('repeats at most once after client errors', async () => {
    const fetchMock = vi.fn(async () => new Response('bad request', { status: 422 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(review()).rejects.toThrow('HTTP 422')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([401, 403, 500, 503])('does not repeat after HTTP %i', async (status) => {
    const fetchMock = vi.fn(async () => new Response('no', { status }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(review()).rejects.toThrow(`HTTP ${status}`)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('does not repeat after a network error', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(review()).rejects.toThrow('Failed to fetch')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('removes think blocks and ignores a separate reasoning field', async () => {
    const fetchMock = vi.fn(async () =>
      reply('<think>Maybe {"readiness":"repeat"}?</think>\n\n{"readiness":"ready"}', {
        reasoning_content: '{"readiness":"repeat"}',
        reasoning: '{"readiness":"repeat"}',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    expect((await review()).readiness).toBe('ready')
  })

  it('sends the key as a bearer token only when there is one', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => reply('{"readiness":"ready"}'))
    vi.stubGlobal('fetch', fetchMock)

    await review()
    await review({ ...connection, apiKey: 'secret' })

    expect(headersOf(fetchMock.mock.calls[0][1])).not.toHaveProperty('Authorization')
    expect(headersOf(fetchMock.mock.calls[1][1]).Authorization).toBe('Bearer secret')
  })

  it('refuses an address outside this computer before sending anything', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(review({ ...connection, baseUrl: 'http://192.168.1.5:11434/v1' })).rejects.toThrow('localhost')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('parseReview', () => {
  it('reads JSON wrapped in other text and normalizes missing fields', () => {
    const review = parseReview('Here it is:\n```json\n{"readiness":"almost","summary":"s","correct":["a"]}\n```')
    expect(review).toEqual({
      readiness: 'almost',
      summary: 's',
      correct: ['a'],
      toFix: [],
      languageNotes: [],
      improvedAnswer: '',
    })
  })

  it('treats an unknown readiness as needing more practice', () => {
    expect(parseReview('{"readiness":"perfect"}').readiness).toBe('repeat')
  })

  it('rejects text with no JSON', () => {
    expect(() => parseReview('sorry')).toThrow()
  })
})

describe('prompts', () => {
  it('fills the review prompt and leaves no placeholders', () => {
    const prompt = buildReviewPrompt('Frage?', 'Russian')
    expect(prompt).toContain('Frage?')
    expect(prompt).toContain('Russian')
    expect(prompt).not.toContain('{{')
  })

  it('leaves empty turns out of the transcript', () => {
    expect(
      formatTranscript([
        { id: '1', role: 'examiner', text: 'Warum?' },
        { id: '2', role: 'applicant', text: ' ' },
        { id: '3', role: 'applicant', text: 'Darum.' },
      ]),
    ).toBe('Examiner: Warum?\nApplicant: Darum.')
  })
})

describe('splitSentences', () => {
  it('keeps an unfinished sentence for later', () => {
    expect(splitSentences('Guten Tag. Warum sind Sie hier? Ich')).toEqual({
      sentences: ['Guten Tag.', 'Warum sind Sie hier?'],
      rest: 'Ich',
    })
  })
})

describe('Gemini audio helpers', () => {
  it('round-trips base64', () => {
    const bytes = new Uint8Array([0, 1, 254, 255])
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('decodes little-endian 16-bit samples', () => {
    expect(Array.from(pcm16ToFloat32(new Uint8Array([0x00, 0x80, 0x00, 0x40])))).toEqual([-1, 0.5])
  })

  it('reads the rate from the mime type and has a default', () => {
    expect(parseSampleRate('audio/pcm;rate=48000')).toBe(48000)
    expect(parseSampleRate(undefined)).toBe(24000)
  })
})
