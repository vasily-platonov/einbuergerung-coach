# 06: Connection help and README

**What to build:** a visitor whose browser cannot reach their local server sees what to do instead of "invalid key", and the README explains how to set up each common server before opening the site. Spec: `docs/plans/local-llm-spec.md`. Findings: the "Research findings" section of `docs/plans/local-llm.md` (ticket 01).

**Blocked by:** 01, 05

**Status:** done

- [x] A network-level failure (the browser's generic fetch error, usually CORS or a stopped server) is a distinct error kind, and the connect panel shows localized help instead of the invalid-key message.
- [x] The help covers, from ticket 01's findings: is the server running and at that address; how to allow the site's origin in Ollama and LM Studio (and llama.cpp and vLLM if short); what to do with the browser's local network access prompt; and the Safari limitation if the research found one.
- [x] A 401 or 403 from the server shows a message that the key was rejected.
- [x] The README gets a row for the local provider in the provider table, a "Local model" section with setup and CORS per server, and the note that the browser handles speech, as with Claude.
- [x] Every new string exists in every locale.
- [x] App tests with stubbed `fetch`: help shown on a network error, key message on 401.
- [x] `npm test` and `npm run build` pass.
