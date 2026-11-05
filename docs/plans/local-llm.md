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

## Research findings

Researched on 2026-11-05 for task 1 (ticket `01-research-browsers-and-cors.md`). The sources are browser docs, specs, bug trackers and each server's own docs or source code. Nothing here was tested against a real browser or server. Points marked **unconfirmed** need the owner's check.

### Summary

| Browser | HTTPS page → `http://localhost` / `127.0.0.1` | What the visitor sees |
|---|---|---|
| Chrome 142+ | Allowed (loopback is not mixed content) | A one-time permission prompt for the site. Blocking it makes every request fail. |
| Edge 143+ | Allowed | The same prompt, called "Local network access" in Edge settings. |
| Firefox 151+ | Allowed (since Firefox 55 for `127.0.0.1`, 84 for `localhost`) | A permission prompt near the address bar. It was rolled out gradually from 151. |
| Safari (all current versions) | **Blocked as mixed content** | Nothing. The request fails before it leaves the browser. The site cannot fix this. |

No server needs a special header for the browser prompt. Every server needs normal CORS that allows the site's origin, including the `OPTIONS` preflight. The preflight is sent because the requests use `Content-Type: application/json` and sometimes `Authorization`.

### Chrome and Edge: Local Network Access

- **When it appears.** Chrome 142 shipped Local Network Access (LNA). From then on, a request from a public website to a local IP or a loopback address (`127.0.0.0/8`, `::1`, `localhost`) needs the user's permission. The prompt appears on the first such request from the site. ([Intent to Ship / Extend Experiment, blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/lRnFRIfzDMU), [Chrome blog](https://developer.chrome.com/blog/local-network-access))
  - Chrome 145 split the permission in two: `local-network` covers the LAN and `loopback-network` covers this device. `local-network-access` remains as an alias. ([Intent to Ship: split permissions](https://groups.google.com/a/chromium.org/g/blink-dev/c/Zl3P6NHhMBw))
  - Edge turned the restrictions on by default in Edge 143. ([Microsoft Learn](https://learn.microsoft.com/en-us/deployedge/ms-edge-local-network-access))
- **Secure context only.** The permission is available only to HTTPS pages. From an `http://` page it is denied automatically. GitHub Pages is HTTPS, so this is fine. ([Chrome guide](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access))
- **What the visitor sees.**
  - Chrome shows a permission prompt anchored to the address bar. The developer blog shows the LAN wording, "Look for and connect to any device on your local network". Chromium's string file also has "Access other apps and services on this device", which looks like the loopback variant. **Unconfirmed:** the exact loopback wording in current stable. ([Chromium permission strings](https://chromium.googlesource.com/chromium/src/+/HEAD/components/permissions_strings.grdp), [Chrome blog](https://developer.chrome.com/blog/local-network-access))
  - The decision is remembered per site. To change it later in Chrome, open the site information icon left of the address, then Site settings, then "Loopback network" or "Local network", and choose Ask, Allow or Block. ([Chrome guide](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access), [Chrome Help](https://support.google.com/chrome/answer/114662))
  - In Edge, go to Settings, then Privacy, search, and services, then Site permissions, then All permissions, then "Local network access". ([Microsoft Support](https://support.microsoft.com/en-us/edge/control-a-website-s-access-to-the-local-network-in-microsoft-edge))
- **If the visitor declines.** The request fails like a network error: `fetch` rejects with a `TypeError`, the same as a CORS failure. The DevTools console shows something like "Permission was denied for this request to access the `loopback` address space". ([Microsoft Learn](https://learn.microsoft.com/en-us/deployedge/ms-edge-local-network-access), [Chrome guide](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access))
  - To tell the two failures apart, the page can call `navigator.permissions.query({ name: 'loopback-network' })` inside `try/catch` and treat an exception as "prompt".
  - Chrome's guide warns against querying `local-network-access`, because it crashes the renderer in older Chrome. Edge's page still shows that name in its example. Use `loopback-network`.
  - **Unconfirmed:** whether a `fetch` waits while the prompt is open, and what happens when the prompt is dismissed without an answer.
- **Trigger it from a click.** Chrome recommends making the first loopback request from a user gesture, not on page load. The Connect button already does that. ([Chrome guide](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access))
- **No special server header.** LNA gates on a permission, not on a preflight. The older Private Network Access header (`Access-Control-Allow-Private-Network`) is deprecated and not needed. Ordinary CORS (`Access-Control-Allow-Origin`) is still needed to read the response. ([LNA spec §1](https://wicg.github.io/local-network-access/), [Chrome guide](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access))
- **Mixed content.** `http://localhost` and `http://127.0.0.1` are "potentially trustworthy", so an HTTPS page may fetch them. `targetAddressSpace` is needed only for hostnames that resolve to local IPs, so the plain loopback URLs this feature allows do not need it. ([Microsoft Learn, "If you only make local network requests to localhost…"](https://learn.microsoft.com/en-us/deployedge/ms-edge-local-network-access), [LNA spec §2.5](https://wicg.github.io/local-network-access/), [MDN Secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts))

### Firefox

- **Mixed content.** Firefox does not block mixed content from `127.0.0.1` since Firefox 55 ([bug 903966](https://bugzilla.mozilla.org/show_bug.cgi?id=903966)). Since Firefox 84, `localhost` always resolves to loopback and "will not be treated as mixed content" ([Firefox 84 for developers](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/84)).
- **Local Network Access.** Firefox 151 (released 2026-05-19) began rolling out LNA restrictions to all users. Before that, they applied only with Enhanced Tracking Protection set to Strict (from Firefox 149).
  - Websites must ask for permission before connecting "to apps and services on your device", and the enterprise policy names loopback addresses explicitly.
  - Firefox shows the prompt near the address bar.
  - Sources: [Firefox 151 release notes](https://www.firefox.com/en-US/firefox/151.0/releasenotes/), [LocalNetworkAccess policy](https://firefox-admin-docs.mozilla.org/reference/policies/localnetworkaccess/), [SUMO article](https://support.mozilla.org/en-US/kb/control-personal-device-local-network-permissions-firefox).
  - **Unconfirmed:** the SUMO page did not load for me, so the details of the prompt ("allow or block for this visit", "Don't ask again") come from search snippets only.
  - Firefox does not appear to support `targetAddressSpace`. It is not needed for loopback anyway.

### Safari

- **Blocked.** WebKit treats `http://localhost` and `http://127.0.0.1` from an HTTPS page as mixed content and blocks the request. This applies even though it reports `isSecureContext` as true for localhost pages.
  - Tracking bugs: [WebKit bug 171934](https://bugs.webkit.org/show_bug.cgi?id=171934) ("Don't treat loopback addresses … as mixed content") and [bug 281149](https://bugs.webkit.org/show_bug.cgi?id=281149).
  - Bug 171934 is still NEW, last touched 2026-08-19. One comment from April 2025 describes this exact case, an app connecting to local Ollama that works everywhere except Safari.
  - A WebKit engineer objected to widening localhost access in June 2025.
  - WebKit's own LNA work ([bug 250607](https://bugs.webkit.org/show_bug.cgi?id=250607)) is also NEW.
- **Since when.** It has always been this way. No Safari version has changed it, at least up to Safari 26.6 (July 2026).
- **Unconfirmed:** [Safari 26.4 notes](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/) mention a fixed regression with `fetch(…, { targetAddressSpace: 'loopback' })`. So WebKit accepts the option, but nothing says it lifts the mixed-content block. The owner could try `fetch('http://localhost:11434/v1/models', { targetAddressSpace: 'loopback' })` from the published site in Safari. Until then the help text says Safari cannot connect and suggests Chrome, Edge or Firefox.

### CORS settings per server

The origin to allow is the site's origin: scheme and host only, no path or trailing slash. For a project page that is `https://<user>.github.io`, not `https://<user>.github.io/einbuergerung-coach/`. The help text should insert `window.location.origin` instead of hard-coding it.

| Server (version checked) | Default allowed origins | How to allow the site | Key |
|---|---|---|---|
| Ollama (`main`, v0.40.14) | `http(s)://localhost`, `127.0.0.1` and `0.0.0.0` with any port, plus `app://`, `file://`, `tauri://`, `vscode-webview://`, `vscode-file://`, and browser extensions. **A website is not allowed by default.** | `OLLAMA_ORIGINS=https://<user>.github.io` (comma-separated, `*` wildcards allowed), then restart Ollama | none |
| LM Studio (docs, Nov 2026) | CORS **off** | Developer tab → Server Settings → "Enable CORS", or `lms server start --cors` | "Require Authentication" → `Authorization: Bearer …` |
| llama.cpp `llama-server` (`master`, v0.9.0) | **Any origin**: `--cors-origins` defaults to `*`, and the server echoes the request's `Origin` with credentials allowed. With `--tools`, `--agent` or MCP flags the default becomes `localhost` only. | Nothing by default. Otherwise `--cors-origins https://<user>.github.io` (env `LLAMA_ARG_CORS_ORIGINS`). | `--api-key` (env `LLAMA_API_KEY`) |
| vLLM (`main`, v0.32.0+) | **None** since v0.32.0 (2026-10-18). Up to v0.31.0 it was `["*"]`. | `--allowed-origins '["https://<user>.github.io"]'` (a JSON list) | `--api-key` (env `VLLM_API_KEY`) |

Details and sources:

- **Ollama.**
  - `AllowedOrigins()` reads `OLLAMA_ORIGINS`, splits it on commas and appends the defaults listed above. The CORS middleware uses gin-contrib/cors with `AllowWildcard` and allows the `Authorization` and `Content-Type` headers. ([envconfig/config.go](https://github.com/ollama/ollama/blob/main/envconfig/config.go), [server/routes.go](https://github.com/ollama/ollama/blob/main/server/routes.go))
  - The variable has to reach the server process ([Ollama FAQ](https://docs.ollama.com/faq)):
    - macOS app: `launchctl setenv OLLAMA_ORIGINS "https://<user>.github.io"`, then quit and reopen Ollama.
    - Windows: quit Ollama from the tray, add the user environment variable `OLLAMA_ORIGINS`, then start Ollama again.
    - Linux systemd: `systemctl edit ollama.service`, add `Environment="OLLAMA_ORIGINS=https://<user>.github.io"`, then `systemctl daemon-reload && systemctl restart ollama`.
    - Terminal: `OLLAMA_ORIGINS=https://<user>.github.io ollama serve`.
- **LM Studio.**
  - The "Enable CORS" setting is documented as allowing "applications from different origins", and `lms server start --cors` enables it from the CLI. CORS is disabled when the flag is not set, and the docs recommend enabling authentication along with it. ([Server settings](https://lmstudio.ai/docs/developer/core/server/settings), [`lms server start`](https://lmstudio.ai/docs/cli/serve/server-start))
  - The default port is 1234 and the server binds to `127.0.0.1`.
  - LM Studio is closed source. **Unconfirmed:** whether "Enable CORS" allows any origin (`*`) or reflects the request's origin. Either way it should accept the site.
- **llama.cpp.**
  - The CORS flags are `--cors-origins`, `--cors-methods`, `--cors-headers` and `--cors-credentials`. `OPTIONS` is answered before the API key check. ([tools/server/README.md](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), [server-http.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server-http.cpp))
  - The plan's guess `--cors` is wrong. The flag is `--cors-origins`.
  - The default port is 8080.
- **vLLM.**
  - The flags are `--allowed-origins`, `--allowed-methods` (default `["*"]`), `--allowed-headers` (default `["*"]`) and `--allow-credentials` (default false). They are parsed with `json.loads`, so the value is a JSON list. ([`vllm serve` docs](https://docs.vllm.ai/en/latest/cli/serve/), [launchers/cli_args.py](https://github.com/vllm-project/vllm/blob/main/vllm/entrypoints/launchers/cli_args.py))
  - The default changed between v0.31.0 and v0.32.0 (checked in the tagged source).
  - The default port is 8000.
  - **Unconfirmed:** whether a preflight passes the `--api-key` check. Starlette's CORS middleware normally answers it first.
- **Jan** (named in the plan's goal) was not researched.

### CSP `connect-src http://localhost:* http://127.0.0.1:*`

- **Ports.** A `*` port matches any port, including a URL with no port, in all three engines:
  - [CSP3 §6.7.2.11 port-part matching](https://w3c.github.io/webappsec-csp/#match-ports), step 2.
  - Chromium [`csp_source.cc`](https://chromium.googlesource.com/chromium/src/+/main/services/network/public/cpp/content_security_policy/csp_source.cc) `SourceAllowPort`: `is_port_wildcard` → match.
  - Gecko [`nsCSPUtils.cpp`](https://github.com/mozilla-firefox/firefox/blob/main/dom/security/nsCSPUtils.cpp) `permitsPort`: `"*"` → true.
  - WebKit [`ContentSecurityPolicySource.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/csp/ContentSecurityPolicySource.cpp) `portMatches`: `m_portHasWildcard` → true.
- **Both hosts are needed.** All three engines compare the host as a plain string (`host == source.host`, `mHost.Equals(…)`, `equalIgnoringASCIICase`). So `localhost` does not cover `127.0.0.1`, and both must be listed. `[::1]` would need its own entry, but the base URL check rejects it anyway.
- **A spec inconsistency.** The CSP3 grammar note says "only 127.0.0.1 will actually match", but the host-part algorithm in §6.7.2.10 returns "Does Not Match" for any non-domain host. The three engines match the IP literal regardless. **Unconfirmed in practice:** check in `npm run preview` that a request to `http://127.0.0.1:11434` is not blocked.
- **Scheme.** `http:` sources also match `https:` URLs in all engines, so `http://localhost:*` would also allow `https://localhost`.

### `GET /v1/models` and `response_format: { type: "json_object" }`

| Server | `GET /v1/models` | `json_object` | When it is not supported |
|---|---|---|---|
| Ollama | Yes: the locally pulled models ([routes.go](https://github.com/ollama/ollama/blob/main/server/routes.go)) | Yes, mapped to Ollama's `format: "json"`. Unknown types are silently ignored. ([openai/openai.go](https://github.com/ollama/ollama/blob/main/openai/openai.go)) | No error |
| LM Studio | Yes: models visible to the server, possibly all downloaded ones when just-in-time loading is on ([docs](https://lmstudio.ai/docs/developer/openai-compat/models)) | Not documented. The docs cover only `json_schema` ([structured output](https://lmstudio.ai/docs/developer/openai-compat/structured-output)). | 400 with `{"error":"'response_format.type' must be 'json_schema'"}`, reported for 0.3.5 in [lmstudio-bug-tracker#173](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/173). **Unconfirmed for current versions.** |
| llama.cpp | Yes: the loaded model, or the router's list ([README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)) | Yes, as a generic JSON grammar ([server-common.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server-common.cpp)) | Other types → 400 `{"error":{"code":400,"message":"response_format type must be one of \"text\" or \"json_object\"…","type":"invalid_request_error"}}` |
| vLLM | Yes: the served model name(s) | Yes (`text`, `json_object`, `json_schema`) | Validation error → 400 |

Plan decision 10 holds: send `json_object` and retry once without it on a 4xx. LM Studio is the server that is likely to need the retry. A wrong `--api-key` gives 401: llama.cpp answers `{"error":{"message":"Invalid API Key","type":"authentication_error","code":401}}`. This is a normal HTTP response, not a network error, so the UI can tell it apart from CORS.

### Draft: connection help text (English, for task 4)

Shown when connecting fails with a network error. `{origin}` is `window.location.origin`.

> **Couldn't reach your local server.**
>
> 1. **Is the server running?** Open {baseUrl}/models in a new tab. You should see a list of models.
> 2. **Allow this site in your server.** The server must accept requests from `{origin}`:
>    - **Ollama:** set `OLLAMA_ORIGINS={origin}`, then quit and restart Ollama.
>    - **LM Studio:** Developer → Server Settings → turn on **Enable CORS**, or run `lms server start --cors`.
>    - **llama.cpp:** allowed by default. If you set `--cors-origins`, add `{origin}`.
>    - **vLLM:** start it with `--allowed-origins '["{origin}"]'`.
> 3. **Did your browser ask about local network access?** Chrome, Edge and Firefox ask before a website can talk to apps on your computer. Choose **Allow**. If you blocked it, open the site settings (the icon left of the address) and allow "Loopback network" or "Local network access", then try again.
> 4. **Safari can't connect** to a server on your computer from this site. Please use Chrome, Edge or Firefox.

### Draft: README section (English, for task 5)

> ### Local model
>
> Instead of an API key, you can use a model running on your own computer with any OpenAI-compatible server, such as Ollama, LM Studio, llama.cpp or vLLM. The site connects only to `http://localhost` and `http://127.0.0.1`. Your browser handles speech recognition and synthesis, as with Claude. How good the interview and the review are depends on the model, and small models often struggle with German and with the review format.
>
> 1. Install a server, download a model and start the server.
> 2. Allow this site's origin (`https://<user>.github.io`, without a path) in the server:
>
>    | Server | Default address | Allow the site |
>    |---|---|---|
>    | Ollama | `http://localhost:11434/v1` | Set `OLLAMA_ORIGINS=https://<user>.github.io` and restart Ollama. On macOS: `launchctl setenv OLLAMA_ORIGINS "https://<user>.github.io"`, then reopen the app. On Windows: add it as a user environment variable, then restart Ollama from the tray. On Linux with systemd: add `Environment="OLLAMA_ORIGINS=https://<user>.github.io"` with `systemctl edit ollama.service` and restart. |
>    | LM Studio | `http://localhost:1234/v1` | Developer → Server Settings → **Enable CORS**, or `lms server start --cors` |
>    | llama.cpp | `http://localhost:8080/v1` | Allowed by default. With `--cors-origins`, include the site. |
>    | vLLM | `http://localhost:8000/v1` | `vllm serve <model> --allowed-origins '["https://<user>.github.io"]'` |
>
> 3. Open the site, choose **Local model (OpenAI-compatible)**, enter the address, and add a key only if your server needs one (vLLM `--api-key`, llama.cpp `--api-key`, LM Studio with authentication). Then pick a model.
> 4. Chrome, Edge and Firefox ask whether the site may connect to apps on your device. Allow it. Safari blocks such connections from HTTPS sites, so use another browser.
>
> The address, key and model stay in the tab's memory only.

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
