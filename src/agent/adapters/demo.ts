import { END_PHRASE } from '../prompt'
import type { VoiceSession, VoiceSessionConfig } from '../types'

const LINES = [
  'Guten Tag. Bitte erklären Sie mir das in Ihren eigenen Worten.',
  'Können Sie mir dazu ein Beispiel nennen?',
  `Vielen Dank. ${END_PHRASE}`,
]

/** Local development only: walks through an interview with no API and no microphone. */
export class DemoVoiceSession implements VoiceSession {
  private timer: ReturnType<typeof setTimeout> | undefined
  private line = 0
  private turnCount = 0

  constructor(private readonly config: VoiceSessionConfig) {}

  canRecord(): boolean {
    return true
  }

  async start(): Promise<void> {
    this.config.events.onPhase('connecting')
    this.reply()
  }

  startAnswer(): void {
    this.config.events.onPhase('recording')
  }

  finishAnswer(): void {
    this.sendText('Das Volk wählt das Parlament.')
  }

  sendText(text: string): void {
    this.config.events.onTurn({ id: `demo-${++this.turnCount}`, role: 'applicant', text })
    this.reply()
  }

  stop(): void {
    clearTimeout(this.timer)
  }

  private reply(): void {
    this.config.events.onPhase('thinking')
    this.timer = setTimeout(() => {
      this.config.events.onPhase('examiner-speaking')
      this.config.events.onTurn({ id: `demo-${++this.turnCount}`, role: 'examiner', text: LINES[this.line++] })
      this.timer = setTimeout(() => this.config.events.onPhase('your-turn'), 300)
    }, 300)
  }
}
