# 03: Tracer bullet: interview with a local model by typed name

**What to build:** a visitor picks "Local model (OpenAI-compatible)", keeps the Ollama address, types a model name, connects and has a full spoken (or typed) interview with their local model. The review is not part of this ticket. Spec: `docs/plans/local-llm-spec.md`.

**Blocked by:** 02

**Status:** done

- [x] Provider `local` is registered in every build, uses browser speech, has no "get a key" link, and has a localized name in every locale.
- [x] The connect panel shows for `local`: a base URL field defaulting to `http://localhost:11434/v1` with a hint for LM Studio (`http://localhost:1234/v1`), an optional key, and a model name text field.
- [x] A base URL whose host is not `localhost` or `127.0.0.1` is rejected in code with a localized explanation.
- [x] Connecting calls the server's model listing; success connects, failure shows an error. The key is sent as a bearer token only when filled.
- [x] The interview streams chat completions (server-sent events), speaks sentence by sentence through the shared speech module, keeps the history with the one examiner prompt as the system message, and aborts on stop.
- [x] Think-tag reasoning is removed from speech and transcript, including blocks split across chunks. A separate reasoning field is ignored.
- [x] The production security policy allows `http://localhost:*` and `http://127.0.0.1:*` in `connect-src`, and nothing else is added. The comment above it is updated.
- [x] Tests through `createVoiceSession('local', …)` with stubbed `fetch` and speech: request body, sentence-by-sentence speech, turn and phase order, events split across chunks, the done marker, think stripping across chunks, stop aborting. App tests: choosing `local`, rejecting a non-loopback address, connecting with a typed model.
- [x] Every new string exists in every locale. `npm test`, `npm run build` and `npm run preview` (policy present in the built page) pass.
