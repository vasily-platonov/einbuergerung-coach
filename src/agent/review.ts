import { createClaudeClient, CLAUDE_MODEL, CLAUDE_FALLBACK_BETA, claudeText } from './adapters/claude'
import { formatTranscript, buildReviewPrompt } from './prompt'
import { ProviderError, type Connection, type TranscriptTurn } from './types'

export interface Review {
  readiness: 'ready' | 'almost' | 'repeat'
  summary: string
  correct: string[]
  toFix: string[]
  languageNotes: string[]
  improvedAnswer: string
}

const OPENAI_REVIEW_MODEL = 'gpt-6.1-terra'
const GEMINI_REVIEW_MODEL = 'gemini-3.8-flash'

export function parseReview(raw: string): Review {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) throw new ProviderError('The review was not valid JSON.')
  const value = JSON.parse(raw.slice(start, end + 1)) as Partial<Review>
  return {
    readiness: value.readiness === 'ready' || value.readiness === 'almost' ? value.readiness : 'repeat',
    summary: String(value.summary ?? ''),
    correct: toStrings(value.correct),
    toFix: toStrings(value.toFix),
    languageNotes: toStrings(value.languageNotes),
    improvedAnswer: String(value.improvedAnswer ?? ''),
  }
}

function toStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

export async function generateReview(
  connection: Connection,
  question: string,
  language: string,
  turns: TranscriptTurn[],
  signal: AbortSignal,
): Promise<Review> {
  const system = buildReviewPrompt(question, language)
  const transcript = formatTranscript(turns)
  const raw = await REVIEWERS[connection.provider](connection.apiKey, system, transcript, signal)
  return parseReview(raw)
}

type Reviewer = (apiKey: string, system: string, transcript: string, signal: AbortSignal) => Promise<string>

const REVIEWERS: Record<Connection['provider'], Reviewer> = {
  async claude(apiKey, system, transcript, signal) {
    const stream = createClaudeClient(apiKey).beta.messages.stream(
      {
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        betas: [CLAUDE_FALLBACK_BETA],
        fallbacks: 'default',
        output_config: { effort: 'high' },
        system,
        messages: [{ role: 'user', content: transcript }],
      },
      { signal },
    )
    return claudeText(await stream.finalMessage())
  },

  async openai(apiKey, system, transcript, signal) {
    const data = await postJson<OpenAIResponse>(
      'https://api.openai.com/v1/responses',
      { Authorization: `Bearer ${apiKey}` },
      {
        model: OPENAI_REVIEW_MODEL,
        instructions: system,
        input: transcript,
        text: { format: { type: 'json_object' } },
      },
      signal,
    )
    return (data.output ?? [])
      .flatMap((item) => item.content ?? [])
      .map((part) => part.text ?? '')
      .join('')
  },

  async gemini(apiKey, system, transcript, signal) {
    const data = await postJson<GeminiResponse>(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_REVIEW_MODEL}:generateContent`,
      { 'x-goog-api-key': apiKey },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: transcript }] }],
        generationConfig: { responseMimeType: 'application/json' },
      },
      signal,
    )
    return (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('')
  },

  async demo() {
    return JSON.stringify({
      readiness: 'almost',
      summary: 'Demo review: the main idea is right, one important point is missing.',
      correct: ['You explained that people elect the parliament.'],
      toFix: ['Add that the courts are independent and control the state.'],
      languageNotes: [],
      improvedAnswer: 'Das Volk wählt das Parlament. Gerichte sind unabhängig und kontrollieren den Staat.',
    } satisfies Review)
  },
}

interface OpenAIResponse {
  output?: { content?: { text?: string }[] }[]
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

async function postJson<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) throw new ProviderError(`HTTP ${response.status}: ${await response.text()}`)
  return (await response.json()) as T
}
