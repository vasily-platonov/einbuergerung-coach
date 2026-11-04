import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoVoiceSession } from '../agent/adapters/demo'
import { App } from './App'

async function connectDemo() {
  fireEvent.change(screen.getByLabelText('API-ключ'), { target: { value: 'x' } })
  fireEvent.change(screen.getByLabelText('Провайдер'), { target: { value: 'demo' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Подключить' }))
  })
}

async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

describe('App', () => {
  beforeEach(() => {
    window.location.hash = '#/'
    window.scrollTo = vi.fn()
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ru'])
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows study material without a key', async () => {
    render(<App />)
    await go('#/q/fdgo')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('freiheitlichen demokratischen')
    expect(screen.getByText('Ключевые мысли')).toBeTruthy()
    expect(screen.getByText('Сначала подключите провайдера:')).toBeTruthy()
  })

  it('always shows answer translations and offers translated follow-up questions', async () => {
    render(<App />)
    await go('#/q/fdgo')
    expect(screen.getByText(/^Это основные правила нашего государства\./)).toBeTruthy()
    expect(screen.getByText(/^Свободный демократический строй — основа/)).toBeTruthy()
    expect(screen.getByText('Welcher dieser Grundsätze ist für Sie am wichtigsten, und warum?')).toBeTruthy()
    expect(screen.queryByText('Какой из этих принципов для вас самый важный и почему?')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Показать перевод вопросов' }))
    expect(screen.getByText('Какой из этих принципов для вас самый важный и почему?')).toBeTruthy()
  })

  it('explains under the key field where to get a key, how it is kept and the cost', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'OpenAI' }).getAttribute('href')).toBe('https://platform.openai.com/api-keys')
    expect(screen.getByRole('link', { name: 'Google Gemini' }).getAttribute('href')).toBe('https://aistudio.google.com/apikey')
    expect(screen.getByRole('link', { name: 'Anthropic Claude' }).getAttribute('href')).toBe('https://platform.claude.com/settings/keys')
    expect(screen.getByText(/^Ключ хранится только на время сессии/)).toBeTruthy()
    expect(screen.getByText(/около 15 центов/)).toBeTruthy()
  })

  it('switches the language', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Questions' })).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
  })

  it('stops the interview and starts clean when moving to the next page', async () => {
    const stop = vi.spyOn(DemoVoiceSession.prototype, 'stop')
    const start = vi.spyOn(DemoVoiceSession.prototype, 'start')
    render(<App />)
    await connectDemo()

    await go('#/q/fdgo')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Начать собеседование' }))
    })
    expect(start).toHaveBeenCalledTimes(1)
    expect(stop).not.toHaveBeenCalled()

    await go('#/q/volkssouveraenitaet')
    expect(stop).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Начать собеседование' })).toBeTruthy()
    expect(screen.queryByText('Завершить и получить разбор')).toBeNull()
  })
})
