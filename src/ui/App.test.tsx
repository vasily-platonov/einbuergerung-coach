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

    async function listModels() {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Показать модели' }))
      })
    }

    it('asks for the server address and an optional key, without a key link', () => {
      render(<App />)
      const option = screen.getByRole('option', { name: 'Локальная модель (OpenAI-совместимая)' }) as HTMLOptionElement
      expect(option.value).toBe('local')
      chooseLocal()

      const baseUrl = screen.getByLabelText(/^Адрес сервера/) as HTMLInputElement
      expect(baseUrl.value).toBe('http://localhost:11434/v1')
      expect(baseUrl.getAttribute('aria-describedby')).toBeTruthy()
      expect(screen.getByText(/LM Studio: http:\/\/localhost:1234\/v1/)).toBeTruthy()
      expect((screen.getByLabelText('API-ключ (необязательно)') as HTMLInputElement).required).toBe(false)
      expect(screen.queryByLabelText(/^Название модели/)).toBeNull()
      expect(screen.queryByRole('link', { name: /Локальная модель/ })).toBeNull()
      expect(screen.getByText(/^Базовый голос/)).toBeTruthy()
      expect(screen.getByText(/^Модель работает на вашем компьютере/)).toBeTruthy()
      expect(screen.queryByText(/^Нужен свой API-ключ/)).toBeNull()
      expect(screen.getByText(/^Качество зависит от модели/)).toBeTruthy()
    })

    it('rejects a server that is not on this computer without contacting it', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      render(<App />)
      chooseLocal()
      fireEvent.change(screen.getByLabelText(/^Адрес сервера/), { target: { value: 'http://192.168.1.10:11434/v1' } })
      await listModels()

      expect(screen.getByRole('alert').textContent).toMatch(/только сервер на вашем компьютере/)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(screen.queryByText(/^Подключено/)).toBeNull()
    })

    it('lists the models in a dropdown and connects with the one picked', async () => {
      const fetchMock = vi.fn(async () =>
        Response.json({ object: 'list', data: [{ id: 'llama-test' }, { id: 'qwen3:14b' }] }),
      )
      vi.stubGlobal('fetch', fetchMock)
      render(<App />)
      chooseLocal()
      await listModels()

      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('http://localhost:11434/v1/models')
      expect(init.headers).toEqual({})
      const choice = screen.getByLabelText('Модель') as HTMLSelectElement
      expect(Array.from(choice.options, (option) => option.value)).toEqual(['llama-test', 'qwen3:14b'])
      fireEvent.change(choice, { target: { value: 'qwen3:14b' } })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Подключить' }))
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(screen.getByText('Подключено: Локальная модель (OpenAI-совместимая) · qwen3:14b')).toBeTruthy()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Отключить' }))
      })
      expect(screen.queryByText(/^Подключено/)).toBeNull()
      expect(screen.getByLabelText('Провайдер')).toBeTruthy()
    })

    it('starts over when the address changes after listing', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [{ id: 'qwen-test' }] })))
      render(<App />)
      chooseLocal()
      await listModels()
      expect(screen.getByLabelText('Модель')).toBeTruthy()

      fireEvent.change(screen.getByLabelText(/^Адрес сервера/), { target: { value: 'http://localhost:1234/v1' } })
      expect(screen.queryByLabelText('Модель')).toBeNull()
      expect(screen.getByRole('button', { name: 'Показать модели' })).toBeTruthy()
    })

    it('falls back to a typed model name when the server lists no models', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({ object: 'list', data: [] })))
      render(<App />)
      chooseLocal()
      await listModels()

      expect(screen.getByText(/^Сервер не показал список моделей/)).toBeTruthy()
      fireEvent.change(screen.getByLabelText(/^Название модели/), { target: { value: ' qwen-test ' } })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Подключить' }))
      })
      expect(screen.getByText('Подключено: Локальная модель (OpenAI-совместимая) · qwen-test')).toBeTruthy()
    })

    it('falls back to a typed model name when the listing fails with an HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
      render(<App />)
      chooseLocal()
      await listModels()

      expect(screen.queryByRole('alert')).toBeNull()
      const name = screen.getByLabelText(/^Название модели/) as HTMLInputElement
      expect(name.required).toBe(true)
      fireEvent.change(name, { target: { value: 'qwen-test' } })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Подключить' }))
      })
      expect(screen.getByText('Подключено: Локальная модель (OpenAI-совместимая) · qwen-test')).toBeTruthy()
    })

    it('shows the connection help with this site origin when the server cannot be reached', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
      render(<App />)
      chooseLocal()
      await listModels()

      const help = screen.getByRole('alert').textContent ?? ''
      const origin = window.location.origin
      expect(help).toMatch(/^Не удалось связаться с локальным сервером/)
      expect(help).toContain('http://localhost:11434/v1/models')
      expect(help).toContain(`OLLAMA_ORIGINS=${origin}`)
      expect(help).toContain(`--allowed-origins '["${origin}"]'`)
      expect(help).toContain('Enable CORS')
      expect(help).toMatch(/доступ к локальной сети/)
      expect(help).toMatch(/Safari не может подключиться/)
      expect(help).not.toMatch(/Проверьте ключ|не принял ключ/)
      expect(screen.queryByLabelText(/^Название модели/)).toBeNull()
    })

    it('says the key was rejected on a 401 or 403 instead of asking for a model name', async () => {
      for (const status of [401, 403]) {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })))
        render(<App />)
        chooseLocal()
        await listModels()

        expect(screen.getByRole('alert').textContent, String(status)).toMatch(/^Сервер не принял ключ/)
        expect(screen.queryByLabelText(/^Название модели/)).toBeNull()
        cleanup()
      }
    })
  })

  it('warns on the start page that a language model runs the interview and can be wrong', () => {
    render(<App />)
    expect(screen.getByText(/языковая модель \(LLM\): она может ошибаться/)).toBeTruthy()
  })

  it('links from the key notice to a guide for each cloud provider', async () => {
    render(<App />)
    const link = screen.getByRole('link', { name: 'как его получить' })
    expect(link.getAttribute('href')).toBe('#/howto')
    await go('#/howto')
    expect(screen.getByRole('heading', { level: 1, name: 'Как получить API-ключ' })).toBeTruthy()
    for (const name of ['OpenAI', 'Google Gemini', 'Anthropic Claude']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy()
    }
    const keyPages = screen.getAllByRole('link', { name: 'Страница ключей' }).map((link) => link.getAttribute('href'))
    expect(keyPages).toHaveLength(3)
    const signIns = ['платформу OpenAI', 'Google AI Studio', 'Claude Console'].map((name) =>
      screen.getByRole('link', { name }).getAttribute('href'),
    )
    expect(signIns).toEqual(keyPages)
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
