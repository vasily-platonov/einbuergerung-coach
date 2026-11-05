import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVoiceSession, verifyConnection } from '../providers'
import type { LocalConnection, SessionPhase, TranscriptTurn } from '../types'

/** A streamed chat completions response that the test feeds as raw chunks of server-sent events. */
function streamedReply(signal?: AbortSignal | null) {
  const encoder = new TextEncoder()
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) })
  // Like a real fetch, an aborted request fails its body.
  signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')))
  const event = (delta: object) => `data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`
  const raw = (chunk: string) => controller.enqueue(encoder.encode(chunk))
  return {
    response: new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
    raw,
    event,
    text: (content: string) => raw(event({ content })),
    end: () => {
      raw('data: [DONE]\n\n')
      controller.close()
    },
  }
}

class FakeUtterance {
  lang = ''
  voice: unknown = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(readonly text: string) {}
}

const CONNECTION: LocalConnection = {
  provider: 'local',
  baseUrl: 'http://localhost:11434/v1',
  model: 'qwen-test',
  apiKey: '',
}

function setup(connection: LocalConnection = CONNECTION) {
  const replies: ReturnType<typeof streamedReply>[] = []
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const reply = streamedReply(init.signal)
    replies.push(reply)
    return reply.response
  })
  vi.stubGlobal('fetch', fetchMock)
  const utterances: FakeUtterance[] = []
  const speech = {
    speak: vi.fn((utterance: FakeUtterance) => utterances.push(utterance)),
    cancel: vi.fn(),
    getVoices: () => [],
  }
  vi.stubGlobal('speechSynthesis', speech)
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)

  const phases: SessionPhase[] = []
  const turns: TranscriptTurn[] = []
  const onError = vi.fn()
  const session = createVoiceSession({
    connection,
    instructions: 'Prompt',
    events: { onPhase: (phase) => phases.push(phase), onTurn: (turn) => turns.push(turn), onError },
  })
  const reply = async (index: number) => {
    await vi.waitFor(() => expect(replies[index]).toBeDefined())
    return replies[index]
  }
  const request = (index: number) => {
    const [url, init] = fetchMock.mock.calls[index]
    return { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) }
  }
  const spoken = () => utterances.map((utterance) => utterance.text)
  return { session, fetchMock, reply, request, speech, utterances, spoken, phases, turns, onError }
}

describe('LocalVoiceSession', () => {
  beforeEach(() => {
    vi.stubGlobal('SpeechRecognition', undefined)
    vi.stubGlobal('webkitSpeechRecognition', undefined)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('streams chat completions, speaks sentence by sentence and gives the turn back', async () => {
    const { session, reply, request, utterances, spoken, phases, turns } = setup()
    const started = session.start()
    const first = await reply(0)

    first.text('Guten Tag. Warum ')
    await vi.waitFor(() => expect(spoken()).toEqual(['Guten Tag.']))
    first.text('sind Sie hier?')
    first.end()
    await started

    expect(spoken()).toEqual(['Guten Tag.', 'Warum sind Sie hier?'])
    expect(utterances[0].lang).toBe('de-DE')
    expect(turns).toEqual([{ id: 'turn-1', role: 'examiner', text: 'Guten Tag. Warum sind Sie hier?' }])
    expect(phases).toEqual(['connecting', 'thinking', 'examiner-speaking', 'examiner-speaking'])
    utterances[0].onend?.()
    expect(phases.at(-1)).toBe('examiner-speaking')
    utterances[1].onend?.()
    expect(phases.at(-1)).toBe('your-turn')

    const { url, headers, body } = request(0)
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    expect(headers).not.toHaveProperty('Authorization')
    expect(body).toEqual({
      model: 'qwen-test',
      stream: true,
      messages: [
        { role: 'system', content: 'Prompt' },
        { role: 'user', content: 'Das Gespräch beginnt jetzt.' },
      ],
    })
  })

  it('sends the key as a bearer token when one is set, and trims a trailing slash', async () => {
    const { session, reply, request } = setup({ ...CONNECTION, baseUrl: 'http://127.0.0.1:1234/v1/', apiKey: 'secret' })
    const started = session.start()
    const first = await reply(0)
    first.text('Hallo.')
    first.end()
    await started
    expect(request(0).url).toBe('http://127.0.0.1:1234/v1/chat/completions')
    expect(request(0).headers.Authorization).toBe('Bearer secret')
  })

  it('takes typed answers and sends the whole history after the system prompt', async () => {
    const { session, reply, request, utterances, phases, turns } = setup()
    expect(session.canRecord()).toBe(false)
    const started = session.start()
    const first = await reply(0)
    first.text('Was ist Demokratie?')
    first.end()
    await started
    utterances[0].onend?.()

    session.sendText('Das Volk wählt.')
    const second = await reply(1)
    expect(turns[1]).toEqual({ id: 'turn-2', role: 'applicant', text: 'Das Volk wählt.' })
    expect(phases.at(-1)).toBe('thinking')
    expect(request(1).body.messages).toEqual([
      { role: 'system', content: 'Prompt' },
      { role: 'user', content: 'Das Gespräch beginnt jetzt.' },
      { role: 'assistant', content: 'Was ist Demokratie?' },
      { role: 'user', content: 'Das Volk wählt.' },
    ])
    second.text('Danke.')
    second.end()
    await vi.waitFor(() => expect(turns).toHaveLength(3))
    expect(turns[2]).toEqual({ id: 'turn-3', role: 'examiner', text: 'Danke.' })
  })

  it('reads events split across chunks, several events in one chunk, and stops at the done marker', async () => {
    const { session, reply, spoken, turns } = setup()
    const started = session.start()
    const first = await reply(0)
    const one = first.event({ content: 'Guten ' })
    const two = first.event({ content: 'Tag. ' })
    const three = first.event({ content: 'Wie geht es?' })

    first.raw(one.slice(0, 10))
    first.raw(one.slice(10) + two.slice(0, 20))
    first.raw(two.slice(20) + three)
    // Events after the done marker are ignored, and the stream is not even closed.
    first.raw('data: [DONE]\n\n' + first.event({ content: ' Nachtrag.' }))
    await started

    expect(spoken()).toEqual(['Guten Tag.', 'Wie geht es?'])
    expect(turns).toEqual([{ id: 'turn-1', role: 'examiner', text: 'Guten Tag. Wie geht es?' }])
  })

  it('removes think blocks from speech and transcript, also across chunks, and ignores reasoning fields', async () => {
    const { session, reply, spoken, turns } = setup()
    const started = session.start()
    const first = await reply(0)

    first.raw(first.event({ reasoning_content: 'Ich sollte grüßen.', content: '' }))
    first.text('<thi')
    first.text('nk>Der Bewerber ist nervös. Ich spreche ')
    first.text('langsam.</th')
    first.text('ink>\n\nGuten Tag. <think>kurz</think>Was ')
    first.raw(first.event({ reasoning: 'noch mehr', content: 'ist das?' }))
    first.end()
    await started

    expect(spoken()).toEqual(['Guten Tag.', 'Was ist das?'])
    expect(turns).toEqual([{ id: 'turn-1', role: 'examiner', text: 'Guten Tag. Was ist das?' }])
  })

  it('aborts the request and silences speech when stopped', async () => {
    const { session, fetchMock, reply, speech, phases, onError } = setup()
    const started = session.start()
    const first = await reply(0)
    first.text('Guten Tag. ')
    await vi.waitFor(() => expect(speech.speak).toHaveBeenCalledOnce())
    const phaseCount = phases.length

    session.stop()
    await started

    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true)
    expect(speech.cancel).toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(phases).toHaveLength(phaseCount)
  })

  it('reports an HTTP error from the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('model "nope" not found', { status: 404 })),
    )
    const onError = vi.fn()
    const session = createVoiceSession({
      connection: CONNECTION,
      instructions: 'Prompt',
      events: { onPhase: () => undefined, onTurn: () => undefined, onError },
    })
    await session.start()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('404') }))
  })

  it('refuses a server that is not on this computer, without sending anything', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const onError = vi.fn()
    const session = createVoiceSession({
      connection: { ...CONNECTION, baseUrl: 'http://192.168.1.10:11434/v1' },
      instructions: 'Prompt',
      events: { onPhase: () => undefined, onTurn: () => undefined, onError },
    })
    await session.start()
    expect(onError).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('verifyConnection for a local server', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists the models, with the key only when one is set', async () => {
    const fetchMock = vi.fn(async () => Response.json({ object: 'list', data: [{ id: 'qwen-test' }] }))
    vi.stubGlobal('fetch', fetchMock)

    await verifyConnection(CONNECTION)
    await verifyConnection({ ...CONNECTION, apiKey: 'secret' })

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][0]).toBe('http://localhost:11434/v1/models')
    expect(calls[0][1].headers).toEqual({})
    expect(calls[1][1].headers).toEqual({ Authorization: 'Bearer secret' })
  })

  it('fails on an HTTP error and on a host that is not loopback', async () => {
    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(verifyConnection(CONNECTION)).rejects.toThrow('401')

    fetchMock.mockClear()
    for (const baseUrl of [
      'http://example.com/v1',
      'http://localhost.example.com/v1',
      'http://[::1]:11434/v1',
      'ftp://localhost/v1',
      'localhost:11434',
    ]) {
      await expect(verifyConnection({ ...CONNECTION, baseUrl }), baseUrl).rejects.toThrow()
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
