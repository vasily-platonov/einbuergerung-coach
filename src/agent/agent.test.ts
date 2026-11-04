import { describe, expect, it, vi } from 'vitest'
import { splitSentences } from './adapters/claude'
import { base64ToBytes, bytesToBase64, parseSampleRate, pcm16ToFloat32 } from './adapters/gemini'
import { buildReviewPrompt, formatTranscript } from './prompt'
import { generateReview, parseReview } from './review'

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
