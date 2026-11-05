import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeminiVoiceSession } from './gemini'

class FakeWebSocket {
  static OPEN = 1
  static latest: FakeWebSocket
  readyState = FakeWebSocket.OPEN
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null

  constructor(readonly url: string) {
    FakeWebSocket.latest = this
    queueMicrotask(() => this.onopen?.())
  }

  send(message: string) {
    this.sent.push(JSON.parse(message))
  }

  close() {}
}

describe('GeminiVoiceSession', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('asks for audio through generationConfig and uses the button to mark answers', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('AudioContext', class { close = async () => undefined })
    const session = new GeminiVoiceSession({
      connection: { provider: 'gemini', apiKey: 'key' },
      instructions: 'Prompt',
      events: { onPhase: vi.fn(), onTurn: vi.fn(), onError: vi.fn() },
    })

    await session.start()
    session.stop()

    expect(FakeWebSocket.latest.sent[0]).toMatchObject({
      setup: {
        generationConfig: { responseModalities: ['AUDIO'] },
        systemInstruction: { parts: [{ text: 'Prompt' }] },
        realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
      },
    })
    expect(FakeWebSocket.latest.sent[0]).not.toHaveProperty('setup.responseModalities')
  })
})
