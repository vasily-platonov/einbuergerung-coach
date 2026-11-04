import { ProviderError, type VoiceSession, type VoiceSessionConfig } from '../types'

const API = 'https://api.openai.com/v1'
const REALTIME_MODEL = 'gpt-realtime-2.1'
const TRANSCRIPTION_MODEL = 'gpt-transcribe'
const VOICE = 'marin'

interface RealtimeEvent {
  type: string
  transcript?: string
  item_id?: string
  error?: { message?: string }
}

/** Native voice over WebRTC. Answers are sent only on the button, with turn detection off. */
export class OpenAIVoiceSession implements VoiceSession {
  private peer: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private microphone: MediaStream | null = null
  private audio: HTMLAudioElement | null = null
  private readonly controller = new AbortController()
  private stopped = false
  private audioPlaying = false
  private turnCount = 0
  /** Turn ids waiting for a transcript, because transcription finishes after the answer. */
  private readonly pendingAnswers: string[] = []

  constructor(private readonly config: VoiceSessionConfig) {}

  canRecord(): boolean {
    return this.microphone !== null
  }

  async start(): Promise<void> {
    this.config.events.onPhase('connecting')
    this.microphone = (await navigator.mediaDevices?.getUserMedia({ audio: true }).catch(() => null)) ?? null
    const token = await this.createClientSecret()
    if (this.stopped) return this.stop()

    this.peer = new RTCPeerConnection()
    this.audio = new Audio()
    this.audio.autoplay = true
    this.peer.ontrack = (event) => {
      if (this.audio) this.audio.srcObject = event.streams[0]
    }
    const track = this.microphone?.getAudioTracks()[0]
    if (track && this.microphone) {
      track.enabled = false
      this.peer.addTrack(track, this.microphone)
    } else {
      this.peer.addTransceiver('audio', { direction: 'recvonly' })
    }

    this.channel = this.peer.createDataChannel('oai-events')
    this.channel.onmessage = (event) => this.handleEvent(JSON.parse(event.data as string) as RealtimeEvent)
    this.channel.onopen = () => {
      this.config.events.onPhase('thinking')
      this.send({ type: 'response.create' })
    }

    const offer = await this.peer.createOffer()
    await this.peer.setLocalDescription(offer)
    const response = await fetch(`${API}/realtime/calls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' },
      body: offer.sdp,
      signal: this.controller.signal,
    })
    if (!response.ok) throw new ProviderError(`HTTP ${response.status}: ${await response.text()}`)
    await this.peer.setRemoteDescription({ type: 'answer', sdp: await response.text() })
  }

  startAnswer(): void {
    this.send({ type: 'input_audio_buffer.clear' })
    this.setMicrophone(true)
    this.config.events.onPhase('recording')
  }

  finishAnswer(): void {
    this.setMicrophone(false)
    const id = this.nextTurnId()
    this.pendingAnswers.push(id)
    this.config.events.onTurn({ id, role: 'applicant', text: '' })
    this.config.events.onPhase('thinking')
    this.send({ type: 'input_audio_buffer.commit' })
    this.send({ type: 'response.create' })
  }

  sendText(text: string): void {
    this.config.events.onTurn({ id: this.nextTurnId(), role: 'applicant', text })
    this.config.events.onPhase('thinking')
    this.send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    })
    this.send({ type: 'response.create' })
  }

  stop(): void {
    this.stopped = true
    this.controller.abort()
    this.channel?.close()
    this.peer?.close()
    this.microphone?.getTracks().forEach((track) => track.stop())
    if (this.audio) this.audio.srcObject = null
  }

  private async createClientSecret(): Promise<string> {
    // The long-lived key is used once, from this tab, to get a token that expires with the session.
    const response = await fetch(`${API}/realtime/client_secrets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 900 },
        session: {
          type: 'realtime',
          model: REALTIME_MODEL,
          instructions: this.config.instructions,
          audio: {
            input: {
              transcription: { model: TRANSCRIPTION_MODEL, language: 'de' },
              turn_detection: null,
            },
            output: { voice: VOICE },
          },
        },
      }),
      signal: this.controller.signal,
    })
    if (!response.ok) throw new ProviderError(`HTTP ${response.status}: ${await response.text()}`)
    return ((await response.json()) as { value: string }).value
  }

  private handleEvent(event: RealtimeEvent): void {
    if (this.stopped) return
    switch (event.type) {
      case 'output_audio_buffer.started':
        this.audioPlaying = true
        this.config.events.onPhase('examiner-speaking')
        break
      case 'output_audio_buffer.stopped':
        this.audioPlaying = false
        this.config.events.onPhase('your-turn')
        break
      case 'response.done':
        if (!this.audioPlaying) this.config.events.onPhase('your-turn')
        break
      case 'response.output_audio_transcript.done':
        this.config.events.onTurn({ id: this.nextTurnId(), role: 'examiner', text: event.transcript ?? '' })
        break
      case 'conversation.item.input_audio_transcription.completed': {
        const id = this.pendingAnswers.shift()
        if (id) this.config.events.onTurn({ id, role: 'applicant', text: event.transcript ?? '' })
        break
      }
      case 'error':
        this.config.events.onError(new ProviderError(event.error?.message ?? 'Realtime error'))
        break
    }
  }

  private setMicrophone(enabled: boolean): void {
    this.microphone?.getAudioTracks().forEach((track) => {
      track.enabled = enabled
    })
  }

  private send(event: unknown): void {
    if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(event))
  }

  private nextTurnId(): string {
    return `turn-${++this.turnCount}`
  }
}
