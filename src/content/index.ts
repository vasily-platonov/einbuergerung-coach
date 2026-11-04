import german from './de.json'
import questionList from './questions.json'
import sourceList from './sources.json'
import type ru from './locales/ru.json'

export type Block = 'democracy' | 'rights' | 'history' | 'extremism' | 'summary' | 'extra'
export const BLOCKS: Block[] = ['democracy', 'rights', 'history', 'extremism', 'summary', 'extra']

export interface QuestionMeta {
  id: string
  block: Block
  sources: string[]
}

export interface GermanQuestion {
  question: string
  variants: string[]
  followUps: string[]
  shortAnswer: string
  fullAnswer: string
}

export interface LocalizedQuestion extends GermanQuestion {
  keyIdeas: string[]
  mistakes: string[]
  glossary: { term: string; meaning: string }[]
}

export type UiStrings = (typeof ru)['ui']

export interface Locale {
  code: string
  name: string
  /** The language name given to the review prompt. */
  promptLanguage: string
  ui: UiStrings
  questions: Record<string, LocalizedQuestion>
}

// A new language needs only a new file in ./locales.
const localeFiles = import.meta.glob<Omit<Locale, 'code'>>('./locales/*.json', { eager: true, import: 'default' })

export const LOCALES: Locale[] = Object.entries(localeFiles).map(([path, locale]) => ({
  ...locale,
  code: /([\w-]+)\.json$/.exec(path)![1],
}))

export const QUESTIONS = questionList as QuestionMeta[]
export const GERMAN = german as Record<string, GermanQuestion>
export const SOURCES = sourceList as Record<string, { label: string; url: string }>

export function pickLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const match = LOCALES.find((locale) => locale.code === language.toLowerCase().split('-')[0])
    if (match) return match
  }
  return LOCALES.find((locale) => locale.code === 'en') ?? LOCALES[0]
}
