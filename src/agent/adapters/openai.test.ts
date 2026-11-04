import { afterEach, expect, it, vi } from 'vitest'
import { OpenAIVoiceSession } from './openai'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('releases a microphone granted after the session was stopped', async () => {
  const track = { stop: vi.fn() }
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
  let grant!: (value: unknown) => void
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: () => new Promise((resolve) => (grant = resolve)) },
  })
  const fetchStub = vi.fn()
  vi.stubGlobal('fetch', fetchStub)

  const session = new OpenAIVoiceSession({
    apiKey: 'test',
    instructions: '',
    events: { onPhase: vi.fn(), onTurn: vi.fn(), onError: vi.fn() },
  })
  const started = session.start()
  session.stop()
  grant(stream)
  await started

  expect(track.stop).toHaveBeenCalled()
  expect(fetchStub).not.toHaveBeenCalled()
})
