import { describe, expect, it } from 'vitest'
import ru from './locales/ru.json'
import { GERMAN, LOCALES, QUESTIONS, SOURCES, pickLocale } from './index'

function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => keysOf(child, `${prefix}.${key}`))
}

describe('content', () => {
  it('has unique ids and known sources', () => {
    const ids = QUESTIONS.map((question) => question.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const question of QUESTIONS) {
      expect(question.sources.length).toBeGreaterThan(0)
      for (const source of question.sources) expect(SOURCES[source], source).toBeDefined()
    }
  })

  it('has German text with short and full answers for every question', () => {
    for (const { id } of QUESTIONS) {
      expect(GERMAN[id], id).toBeDefined()
      expect(GERMAN[id].shortAnswer.length, id).toBeLessThan(GERMAN[id].fullAnswer.length)
      expect(GERMAN[id].variants.length, id).toBeGreaterThanOrEqual(3)
      expect(GERMAN[id].followUps.length, id).toBe(2)
    }
  })

  it('offers Russian and English', () => {
    expect(LOCALES.map((locale) => locale.code).sort()).toEqual(['en', 'ru'])
  })

  for (const locale of LOCALES) {
    it(`${locale.code} is complete`, () => {
      expect(keysOf(locale.ui).sort()).toEqual(keysOf(ru.ui).sort())
      for (const { id } of QUESTIONS) {
        const question = locale.questions[id]
        expect(question, id).toBeDefined()
        expect(question.variants.length, id).toBe(GERMAN[id].variants.length)
        expect(question.followUps.length, id).toBe(2)
        expect(question.keyIdeas.length, id).toBeGreaterThan(0)
        expect(question.mistakes.length, id).toBeGreaterThan(0)
        expect(question.glossary.length, id).toBeGreaterThan(0)
        expect(question.shortAnswer, id).toBeTruthy()
        expect(question.fullAnswer, id).toBeTruthy()
      }
    })
  }

  it('chooses the language from the browser, falling back to English', () => {
    expect(pickLocale(['ru-RU', 'en']).code).toBe('ru')
    expect(pickLocale(['fr', 'en-GB']).code).toBe('en')
    expect(pickLocale(['fr']).code).toBe('en')
  })
})
