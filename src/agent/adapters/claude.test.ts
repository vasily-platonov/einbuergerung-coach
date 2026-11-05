import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionPhase, TranscriptTurn } from '../types'
import { ClaudeVoiceSession } from './claude'

/** A streamed Messages API response that the test feeds piece by piece. */
function streamedReply(signal?: AbortSignal | null) {
  const encoder = new TextEncoder()
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) })
  // Like a real fetch, an aborted request fails its body.
  signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')))
  const send = (type: string, data: object) =>
    controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`))
  send('message_start', {
    message: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  })
  send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
  return {
    response: new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
    text: (text: string) => send('content_block_delta', { index: 0, delta: { type: 'text_delta', text } }),
    end: () => {
      send('content_block_stop', { index: 0 })
      send('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } })
      send('message_stop', {})
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

class FakeRecognition {
  static latest: FakeRecognition
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((event: unknown) => void) | null = null
  onend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  start = vi.fn()
  stop = vi.fn(() => this.onend?.())
  abort = vi.fn()
  constructor() {
    FakeRecognition.latest = this
  }
  hear(transcript: string) {
    this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript }], { isFinal: true })] })
  }
}

function setup() {
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
  const session = new ClaudeVoiceSession({
    connection: { provider: 'claude', apiKey: 'key' },
    instructions: 'Prompt',
    events: { onPhase: (phase) => phases.push(phase), onTurn: (turn) => turns.push(turn), onError },
  })
  const reply = async (index: number) => {
    await vi.waitFor(() => expect(replies[index]).toBeDefined())
    return replies[index]
  }
  const requestBody = (index: number) => JSON.parse(fetchMock.mock.calls[index][1].body as string)
  return { session, fetchMock, reply, requestBody, speech, utterances, phases, turns, onError }
}

describe('ClaudeVoiceSession', () => {
  beforeEach(() => {
    vi.stubGlobal('SpeechRecognition', undefined)
    vi.stubGlobal('webkitSpeechRecognition', undefined)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('speaks each sentence as it streams and gives the turn back after the last utterance', async () => {
    const { session, reply, requestBody, utterances, phases, turns } = setup()
    const started = session.start()
    const first = await reply(0)

    first.text('Guten Tag. Warum ')
    await vi.waitFor(() => expect(utterances.map((u) => u.text)).toEqual(['Guten Tag.']))
    first.text('sind Sie hier?')
    first.end()
    await started

    expect(utterances.map((u) => u.text)).toEqual(['Guten Tag.', 'Warum sind Sie hier?'])
    expect(utterances[0].lang).toBe('de-DE')
    expect(turns).toEqual([{ id: 'turn-1', role: 'examiner', text: 'Guten Tag. Warum sind Sie hier?' }])
    expect(phases).toEqual(['connecting', 'thinking', 'examiner-speaking', 'examiner-speaking'])

    utterances[0].onend?.()
    expect(phases.at(-1)).toBe('examiner-speaking')
    utterances[1].onend?.()
    expect(phases.at(-1)).toBe('your-turn')

    expect(requestBody(0)).toMatchObject({
      model: 'claude-opus-5-5',
      system: 'Prompt',
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Das Gespräch beginnt jetzt.' }],
    })
  })

  it('waits for the end of the stream when the speech finishes first', async () => {
    const { session, reply, utterances, phases } = setup()
    const started = session.start()
    const first = await reply(0)

    first.text('Guten Tag. ')
    await vi.waitFor(() => expect(utterances).toHaveLength(1))
    utterances[0].onend?.()
    expect(phases.at(-1)).toBe('examiner-speaking')

    first.end()
    await started
    expect(phases.at(-1)).toBe('your-turn')
  })

  it('takes typed answers when speech recognition is missing and sends the whole history', async () => {
    const { session, reply, requestBody, utterances, phases, turns } = setup()
    expect(session.canRecord()).toBe(false)
    const started = session.start()
    const first = await reply(0)
    first.text('Was ist Demokratie?')
    first.end()
    await started
    utterances[0].onend?.()

    session.startAnswer()
    expect(phases).not.toContain('recording')

    session.sendText('Das Volk wählt.')
    const second = await reply(1)
    expect(turns[1]).toEqual({ id: 'turn-2', role: 'applicant', text: 'Das Volk wählt.' })
    expect(phases.at(-1)).toBe('thinking')
    expect(requestBody(1).messages).toEqual([
      { role: 'user', content: 'Das Gespräch beginnt jetzt.' },
      { role: 'assistant', content: [{ type: 'text', text: 'Was ist Demokratie?' }] },
      { role: 'user', content: 'Das Volk wählt.' },
    ])
    second.text('Danke.')
    second.end()
    await vi.waitFor(() => expect(turns).toHaveLength(3))
    expect(turns[2]).toEqual({ id: 'turn-3', role: 'examiner', text: 'Danke.' })
  })

  it('sends what recognition heard when the answer is finished', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
    const { session, reply, requestBody, utterances, phases, turns } = setup()
    expect(session.canRecord()).toBe(true)
    const started = session.start()
    const first = await reply(0)
    first.text('Was ist Demokratie?')
    first.end()
    await started
    utterances[0].onend?.()

    session.startAnswer()
    expect(phases.at(-1)).toBe('recording')
    FakeRecognition.latest.hear('Das Volk wählt.')
    session.finishAnswer()

    await reply(1)
    expect(turns[1]).toEqual({ id: 'turn-2', role: 'applicant', text: 'Das Volk wählt.' })
    expect(requestBody(1).messages.at(-1)).toEqual({ role: 'user', content: 'Das Volk wählt.' })
  })

  it('aborts the request and silences speech when stopped', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition)
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
    expect(FakeRecognition.latest.abort).toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(phases).toHaveLength(phaseCount)
  })
})
