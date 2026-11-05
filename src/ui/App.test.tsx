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

  it('keeps all translations and the vocabulary behind one toggle', async () => {
    render(<App />)
    await go('#/q/fdgo')
    const headingTranslation = screen.getByText('Что вы понимаете под свободным демократическим строем?')
    const hidden = [
      /^Это основные правила нашего государства\./,
      /^Свободный демократический строй — основа/,
      'Какой из этих принципов для вас самый важный и почему?',
      'Слова',
    ]
    expect(screen.getByText('Welcher dieser Grundsätze ist für Sie am wichtigsten, und warum?')).toBeTruthy()
    for (const text of hidden) expect(screen.queryByText(text), String(text)).toBeNull()
    expect(headingTranslation.classList.contains('invisible')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Показать перевод и слова' }))
    for (const text of hidden) expect(screen.getByText(text), String(text)).toBeTruthy()
    expect(headingTranslation.classList.contains('invisible')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Скрыть перевод и слова' }))
    for (const text of hidden) expect(screen.queryByText(text), String(text)).toBeNull()
    expect(headingTranslation.classList.contains('invisible')).toBe(true)
  })

  it('explains under the key field where to get a key, how it is kept and the cost', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'OpenAI' }).getAttribute('href')).toBe('https://platform.openai.com/api-keys')
    expect(screen.getByRole('link', { name: 'Google Gemini' }).getAttribute('href')).toBe('https://aistudio.google.com/apikey')
    expect(screen.getByRole('link', { name: 'Anthropic Claude' }).getAttribute('href')).toBe('https://platform.claude.com/settings/keys')
    expect(screen.getByText(/^Ключ хранится только на время сессии/)).toBeTruthy()
    expect(screen.getByText(/около 15 центов.*бесплатные тарифы/)).toBeTruthy()
  })

  describe('with a local model', () => {
    afterEach(() => vi.unstubAllGlobals())

    function chooseLocal() {
      fireEvent.change(screen.getByLabelText('Провайдер'), { target: { value: 'local' } })
    }

    it('asks for the server address, an optional key and the model name, without a key link', () => {
      render(<App />)
      const option = screen.getByRole('option', { name: 'Локальная модель (OpenAI-совместимая)' }) as HTMLOptionElement
      expect(option.value).toBe('local')
      chooseLocal()

      const baseUrl = screen.getByLabelText(/^Адрес сервера/) as HTMLInputElement
      expect(baseUrl.value).toBe('http://localhost:11434/v1')
      expect(baseUrl.getAttribute('aria-describedby')).toBeTruthy()
      expect(screen.getByText(/LM Studio: http:\/\/localhost:1234\/v1/)).toBeTruthy()
      expect((screen.getByLabelText('API-ключ (необязательно)') as HTMLInputElement).required).toBe(false)
      expect((screen.getByLabelText('Название модели') as HTMLInputElement).required).toBe(true)
      expect(screen.queryByRole('link', { name: /Локальная модель/ })).toBeNull()
      expect(screen.getByText(/^Базовый голос/)).toBeTruthy()
    })

    it('rejects a server that is not on this computer without contacting it', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      render(<App />)
      chooseLocal()
      fireEvent.change(screen.getByLabelText(/^Адрес сервера/), { target: { value: 'http://192.168.1.10:11434/v1' } })
      fireEvent.change(screen.getByLabelText('Название модели'), { target: { value: 'qwen-test' } })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Подключить' }))
      })

      expect(screen.getByRole('alert').textContent).toMatch(/только сервер на вашем компьютере/)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(screen.queryByText(/^Подключено/)).toBeNull()
    })

    it('connects with a typed model after the server lists its models', async () => {
      const fetchMock = vi.fn(async () => Response.json({ object: 'list', data: [{ id: 'qwen-test' }] }))
      vi.stubGlobal('fetch', fetchMock)
      render(<App />)
      chooseLocal()
      fireEvent.change(screen.getByLabelText('Название модели'), { target: { value: ' qwen-test ' } })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Подключить' }))
      })

      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('http://localhost:11434/v1/models')
      expect(init.headers).toEqual({})
      expect(screen.getByText(/Подключено: Локальная модель \(OpenAI-совместимая\)/)).toBeTruthy()
    })

    it('shows an error when the server does not answer', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
      render(<App />)
      chooseLocal()
      fireEvent.change(screen.getByLabelText('Название модели'), { target: { value: 'qwen-test' } })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Подключить' }))
      })
      expect(screen.getByRole('alert').textContent).toMatch(/^Не удалось подключиться к локальному серверу/)
    })
  })

  it('warns on the start page that a language model runs the interview and can be wrong', () => {
    render(<App />)
    expect(screen.getByText(/языковая модель \(LLM\): она может ошибаться/)).toBeTruthy()
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
