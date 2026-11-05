# Plan: connect a locally running LLM

Status: agreed, not started. Branch: `allow-local-llm`, one commit per task, one PR at the end.

## Goal

A visitor of the published site can practise with a model running on their own computer (Ollama, LM Studio, llama.cpp server, vLLM, Jan) instead of a paid API key. The product rules in `AGENTS.md` still hold: frontend only, memory only, one prompt, a fresh session per page.

## Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Audience | Every visitor. The provider ships in the production build, not only in dev like Demo. |
| 2 | Protocol | OpenAI-compatible API: `GET /v1/models`, `POST /v1/chat/completions`. One adapter covers all common local servers. |
| 3 | Scope | The same local model runs both the interview and the review. No cloud fallback. |
| 4 | Voice | Browser speech recognition and synthesis, as Claude uses now. The speech logic moves out of `ClaudeVoiceSession` into a shared module. No local Whisper or TTS. |
| 5 | Allowed hosts | Loopback only: `http://localhost:<port>` and `http://127.0.0.1:<port>`. Other hosts would need an open `connect-src`, which weakens the key safety the README describes. |
| 6 | Base URL | One field, default `http://localhost:11434/v1` (Ollama), with a hint for LM Studio (`http://localhost:1234/v1`). The code rejects non-loopback hosts with a clear message, because dev builds have no CSP. |
| 7 | API key | Optional. When filled, it is sent as `Authorization: Bearer …` (vLLM `--api-key`, LM Studio with auth). No "get a key" link for this provider. |
| 8 | Model choice | Connecting calls `GET /v1/models`. This replaces `verifyKey` for this provider and checks the address, CORS and key at once. Then a dropdown of installed models. If the list is empty or `/models` fails with a non-network error, a free text field. Base URL and model are kept in `Connection`, in memory only. |
| 9 | Interview streaming | `stream: true` (SSE). Speak sentence by sentence while generating, as Claude does with `splitSentences`. |
| 10 | Review JSON | Send `response_format: { type: "json_object" }`. On a 4xx answer, retry once without it and rely on `parseReview` cutting `{…}` out of the text. No overload retries; the page already offers "retry review". |
| 11 | Reasoning models | Strip `<think>…</think>` and ignore `reasoning_content` in speech, transcript and review (Qwen, DeepSeek-R1 and similar). Handle a think block split across stream chunks. |
| 12 | Connection errors | A network failure (`TypeError: Failed to fetch`, usually CORS) shows localized help: is the server running, how to allow the site's origin (`OLLAMA_ORIGINS` for Ollama, "Enable CORS" in LM Studio), and what to do if the browser asks for local network access. The README gets the same instructions. |
| 13 | Quality note | A short localized note in the connect panel: quality depends on the model, and small models struggle with German and the review format. No model names until the owner has tested some. |
| 14 | Naming | Id `local`. Display name "Local model (OpenAI-compatible)" in English, "Локальная модель (OpenAI-совместимая)" in Russian. |
| 15 | Release | Minor version: `1.0.2` → `1.1.0` in `VERSION` and `package.json`, plus a `CHANGELOG.md` entry. |

## Shape of the change

- `Connection` becomes a union, so only the local provider carries the extra fields:
  `{ provider: 'openai' | 'gemini' | 'claude' | 'demo'; apiKey: string } | { provider: 'local'; baseUrl: string; model: string; apiKey: string }`.
  `VoiceSessionConfig` and the reviewers receive the `Connection` instead of a bare `apiKey`.
- `src/agent/adapters/browserSpeech.ts` (new) owns recognition, synthesis, sentence splitting and the phase bookkeeping (`pendingUtterances`, `streamDone`). A text provider supplies only "stream a reply to this history".
- `src/agent/adapters/local.ts` (new) has `LocalVoiceSession`, `listLocalModels`, `assertLoopback`, SSE parsing and think stripping.
- `src/agent/providers.ts` registers `local` (`basicVoice: true`, empty `keyUrl`).
- `src/agent/review.ts` gets a `local` reviewer.
- `src/ui/ConnectPanel.tsx` shows Base URL, optional key and model for `local`.
- `vite.config.ts` adds `http://localhost:* http://127.0.0.1:*` to `connect-src`.

## Tasks

### 1. Research: HTTPS page to `http://localhost`

Find out from primary sources (browser docs, specs, release notes) and record the findings in this file:

- Chrome and Edge: the Local Network Access permission prompt (formerly Private Network Access). When it appears, what the visitor sees, and whether the server must answer a preflight header.
- Firefox: mixed content rules for `http://localhost` and `127.0.0.1`.
- Safari: whether it blocks `http://localhost` from an HTTPS page. If it does, the help text says so, because nothing on the site can fix it.
- CORS settings for Ollama (`OLLAMA_ORIGINS`), LM Studio, llama.cpp server (`--cors`?) and vLLM (`--allowed-origins`), exact names checked against their docs.
- Whether a CSP source `http://localhost:*` matches every port in all three engines.

Done when: each point has an answer with a link, and the help text in task 4 and the README section in task 5 are drafted from it.

### 2. Refactor: shared browser speech

Move the speech logic out of `ClaudeVoiceSession` into `browserSpeech.ts` without changing behaviour. Claude keeps its model, effort, fallback beta and refusal handling.

Done when: Claude works exactly as before (manual check in `npm run dev`, and the owner with a key), and the existing tests pass. Test the shared module only through the `VoiceSession` contract (see `local-llm-spec.md`): the phase sequence when the stream ends before or after the last utterance, and `stop()` releasing everything.

### 3. Local adapter and reviewer

- Change `Connection` and `VoiceSessionConfig` as above; update the existing adapters and reviewers.
- `assertLoopback(baseUrl)`: accepts `http(s)://localhost` and `127.0.0.1` with any port and path, rejects everything else.
- `listLocalModels(connection)`: `GET {baseUrl}/models`, returns ids.
- `LocalVoiceSession`: history as `messages` with the system prompt first, `stream: true`, SSE parsing via `fetch` + `ReadableStream` (no SDK), think stripping across chunks, abort on `stop()`.
- `local` reviewer: non-streaming request with `response_format`, one retry without it on 4xx, think stripping before `parseReview`.
- Network errors become a distinct error type, so the UI can show the CORS help instead of "invalid key".

Done when: unit tests with a stubbed `fetch` cover SSE parsing (including a `[DONE]` line and events split across chunks), think stripping, loopback validation, the review retry without `response_format`, model listing and the network error type.

### 4. Connect panel and locales

- Base URL field with the Ollama default and the LM Studio hint, optional key, then a model dropdown or text field after a successful check.
- Help text for network errors (from task 1), a quality note, and the connected status showing the model name.
- All new strings in `en.json` and `ru.json`. `content.test.ts` must still pass.
- New styles as classes in `styles.css`.

Done when: `App.test.tsx` or a new component test covers connecting to `local` with a stubbed model list, the fallback to a text field, and the error help; the Demo flow still works in `npm run dev`.

### 5. CSP and README

- Add `http://localhost:* http://127.0.0.1:*` to `connect-src`, and update the comment above it.
- README: a row in the provider table, a "Local model" section with server setup and CORS per server, and the note that the browser handles speech, as with Claude.

Done when: `npm run build` and `npm run preview` show the policy in the built `index.html`, and a request to a local server is not blocked by CSP in preview.

### 6. Release

Bump to `1.1.0` in `VERSION` and `package.json`, add a `CHANGELOG.md` entry. Open the PR. Publishing to GitHub Pages stays the owner's decision.

Done when: `npm test` and `npm run build` pass, and their output is shown before committing.

## Verification the owner has to do

These need the owner's machine, microphone and keys, and cannot be closed by an agent:

- A full interview and review with Ollama and with LM Studio, at least one small and one larger model, in Chrome and Firefox (Safari if task 1 says it can work).
- The production build served over HTTPS (or `npm run preview`) talking to a local server, including the browser's local network prompt.
- Claude still works after the refactor in task 2.
- After testing, decide whether the README should name models that worked well.

## Out of scope

- Local speech recognition or synthesis (Whisper, Piper and similar).
- Hosts other than loopback (LAN machines, remote vLLM).
- Ollama's native API.
- Saving the base URL or model between visits.
