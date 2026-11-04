import { ProviderError, type VoiceSession, type VoiceSessionConfig } from '../types'

const ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
const LIVE_MODEL = 'models/gemini-3.8-live'
const INPUT_SAMPLE_RATE = 16000
const DEFAULT_OUTPUT_SAMPLE_RATE = 24000

interface LiveMessage {
  setupComplete?: unknown
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { data: string; mimeType?: string } }[] }
    inputTranscription?: { text?: string }
    outputTranscription?: { text?: string }
    turnComplete?: boolean
  }
}

/** Native voice over the Live API WebSocket, with the button marking the start and end of an answer. */
export class GeminiVoiceSession implements VoiceSession {
  private socket: WebSocket | null = null
  private microphone: MediaStream | null = null
  private captureContext: AudioContext | null = null
  private playbackContext: AudioContext | null = null
  private playbackEnd = 0
  private drainTimer: ReturnType<typeof setTimeout> | undefined
  private recording = false
  private stopped = false
  private turnCount = 0
  private examinerText = ''
  private answerId: string | null = null
  private answerText = ''

  constructor(private readonly config: VoiceSessionConfig) {}

  canRecord(): boolean {
    return this.microphone !== null
  }

  async start(): Promise<void> {
    this.config.events.onPhase('connecting')
    // Created here, inside the click that started the interview, so the browser allows playback.
    this.playbackContext = new AudioContext()
    await this.prepareMicrophone()
    if (this.stopped) return this.stop()

    await new Promise<void>((resolve, reject) => {
      // The Live API takes the key as a URL parameter. The connection is encrypted and goes only to Google.
      const socket = new WebSocket(`${ENDPOINT}?key=${encodeURIComponent(this.config.apiKey)}`)
      this.socket = socket
      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            setup: {
              model: LIVE_MODEL,
              responseModalities: ['AUDIO'],
              systemInstruction: { parts: [{ text: this.config.instructions }] },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
            },
          }),
        )
        resolve()
      }
      socket.onerror = () => reject(new ProviderError('Could not connect to Gemini.'))
      socket.onclose = (event) => {
        if (!this.stopped && event.code !== 1000) {
          this.config.events.onError(new ProviderError(`Gemini closed the connection: ${event.reason || event.code}`))
        }
      }
      socket.onmessage = async (event) => {
        const text = event.data instanceof Blob ? await event.data.text() : (event.data as string)
        this.handleMessage(JSON.parse(text) as LiveMessage)
      }
    })
  }

  startAnswer(): void {
    this.answerId = this.nextTurnId()
    this.answerText = ''
    this.send({ realtimeInput: { activityStart: {} } })
    this.recording = true
    this.config.events.onPhase('recording')
  }

  finishAnswer(): void {
    this.recording = false
    this.send({ realtimeInput: { activityEnd: {} } })
    this.config.events.onPhase('thinking')
  }

  sendText(text: string): void {
    this.config.events.onTurn({ id: this.nextTurnId(), role: 'applicant', text })
    this.send({ realtimeInput: { text } })
    this.config.events.onPhase('thinking')
  }

  stop(): void {
    this.stopped = true
    this.recording = false
    clearTimeout(this.drainTimer)
    this.socket?.close()
    this.microphone?.getTracks().forEach((track) => track.stop())
    void this.captureContext?.close().catch(() => undefined)
    void this.playbackContext?.close().catch(() => undefined)
  }

  private async prepareMicrophone(): Promise<void> {
    const stream = await navigator.mediaDevices?.getUserMedia({ audio: true }).catch(() => null)
    if (!stream) return
    this.microphone = stream
    this.captureContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE })
    await this.captureContext.audioWorklet.addModule(`${import.meta.env.BASE_URL}pcm-capture-worklet.js`)
    const source = this.captureContext.createMediaStreamSource(stream)
    const worklet = new AudioWorkletNode(this.captureContext, 'pcm-capture')
    worklet.port.onmessage = (event) => {
      if (!this.recording) return
      this.send({
        realtimeInput: {
          audio: {
            data: bytesToBase64(new Uint8Array(event.data as ArrayBuffer)),
            mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
          },
        },
      })
    }
    source.connect(worklet)
  }

  private handleMessage(message: LiveMessage): void {
    if (this.stopped) return
    if (message.setupComplete !== undefined) {
      this.config.events.onPhase('thinking')
      this.send({ realtimeInput: { text: 'Das Gespräch beginnt jetzt.' } })
    }
    const content = message.serverContent
    if (!content) return

    for (const part of content.modelTurn?.parts ?? []) {
      if (part.inlineData) {
        this.config.events.onPhase('examiner-speaking')
        this.play(part.inlineData.data, part.inlineData.mimeType)
      }
    }
    if (content.inputTranscription?.text && this.answerId) {
      this.answerText += content.inputTranscription.text
      this.config.events.onTurn({ id: this.answerId, role: 'applicant', text: this.answerText })
    }
    if (content.outputTranscription?.text) this.examinerText += content.outputTranscription.text
    if (content.turnComplete) {
      if (this.examinerText) {
        this.config.events.onTurn({ id: this.nextTurnId(), role: 'examiner', text: this.examinerText })
      }
      this.examinerText = ''
      this.finishAfterPlayback()
    }
  }

  private play(base64: string, mimeType?: string): void {
    const context = this.playbackContext
    if (!context) return
    const samples = pcm16ToFloat32(base64ToBytes(base64))
    const buffer = context.createBuffer(1, samples.length, parseSampleRate(mimeType))
    buffer.copyToChannel(samples, 0)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    const startAt = Math.max(context.currentTime, this.playbackEnd)
    source.start(startAt)
    this.playbackEnd = startAt + buffer.duration
  }

  private finishAfterPlayback(): void {
    const remaining = Math.max(0, this.playbackEnd - (this.playbackContext?.currentTime ?? 0))
    clearTimeout(this.drainTimer)
    this.drainTimer = setTimeout(() => {
      if (!this.stopped) this.config.events.onPhase('your-turn')
    }, remaining * 1000)
  }

  private send(message: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message))
  }

  private nextTurnId(): string {
    return `turn-${++this.turnCount}`
  }
}

export function parseSampleRate(mimeType?: string): number {
  const match = /rate=(\d+)/.exec(mimeType ?? '')
  return match ? Number(match[1]) : DEFAULT_OUTPUT_SAMPLE_RATE
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

export function pcm16ToFloat32(bytes: Uint8Array): Float32Array<ArrayBuffer> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const samples = new Float32Array(Math.floor(bytes.byteLength / 2))
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 0x8000
  return samples
}
