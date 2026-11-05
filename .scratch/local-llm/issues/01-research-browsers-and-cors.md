# 01: Research how browsers and local servers allow the connection

**What to build:** documented, sourced answers that the connection help text and the README section are written from. Spec: `docs/plans/local-llm-spec.md`. Plan: `docs/plans/local-llm.md`.

**Blocked by:** None (can start immediately)

**Status:** done

Answer each question from primary sources (browser docs, specs, release notes, the server projects' own docs) and record the answers, each with a link, in a "Research findings" section of the plan:

- [x] Chrome and Edge: when the Local Network Access prompt (formerly Private Network Access) appears for an HTTPS page fetching `http://localhost` or `http://127.0.0.1`, what the visitor sees, what happens if they decline, and whether the local server must answer a special preflight header.
- [x] Firefox: whether mixed-content rules allow an HTTPS page to fetch `http://localhost` and `http://127.0.0.1`.
- [x] Safari: whether it blocks those requests, and since which version if that changed.
- [x] Exact CORS settings to allow a site's origin for Ollama, LM Studio, llama.cpp server and vLLM, including the default allowed origins.
- [x] Whether a CSP `connect-src` source `http://localhost:*` matches every port in Chromium, Gecko and WebKit, and whether `localhost` and `127.0.0.1` both need listing.
- [x] Whether these servers answer `GET /v1/models` and accept `response_format: { type: "json_object" }` on chat completions, and what they return when they do not.
- [x] A short draft of the help text (English) and of the README setup section, based on the findings.
- [x] No source code changes.
