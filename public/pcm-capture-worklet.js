// Runs on the audio thread and hands 16-bit PCM chunks of about 100 ms to the page.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.samples = []
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (channel) {
      for (const sample of channel) {
        const clamped = Math.max(-1, Math.min(1, sample))
        this.samples.push(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff)
      }
      if (this.samples.length >= sampleRate / 10) {
        const chunk = Int16Array.from(this.samples)
        this.samples = []
        this.port.postMessage(chunk.buffer, [chunk.buffer])
      }
    }
    return true
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor)
