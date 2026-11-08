# Release notes

## 1.2.0 (2026-11-08)

A guide to getting an API key.

### Added

- **How-to page:** the connect panel says "You need your own API key (how to get one)", and the link opens a new page, `#/howto`. For OpenAI, Google Gemini and Anthropic Claude it explains which voice you get, how billing works and how to create a key, with links to the key page and to billing and limits.

## 1.1.0 (2026-11-06)

Practise with a model running on your own computer, with no API key.

### Added

- **Local model:** a new provider, "Local model (OpenAI-compatible)", connects to Ollama, LM Studio, llama.cpp server, vLLM or another OpenAI-compatible server on `localhost` or `127.0.0.1`. The same model runs the interview and the review, and the browser handles speech, as with Claude.
- **Model choice:** the site lists the models installed on the server. If the server lists none, you can type the model name. The connected status shows the model.
- **Reasoning models:** `<think>` blocks are left out of what the examiner says, the transcript and the review.
- **Review without JSON mode:** if the server rejects JSON mode, the review is requested again without it. A review with trailing commas, which small models often write, is still read.
- **Connection help:** when the browser cannot reach the server, the page explains how to allow the site's origin for each common server, the browser's local network prompt, and that Safari blocks such requests. A rejected key gets its own message.

### Changed

- **Security policy:** `connect-src` also allows `http://localhost:*` and `http://127.0.0.1:*`, and no other hosts.
- **Browser speech:** Claude and the local model share one module for listening and speaking. Claude behaves as before.

### Documentation

- The README covers setting up a local server, CORS for each server, the local network prompt and the Safari limitation.

## 1.0.2 (2026-11-06)

Set default language to EN

### Changed

- **Default language:** set to EN.

## 1.0.1 (2026-11-05)

Security and privacy fixes from a review of the repository.

### Fixed

- **Microphone:** with OpenAI, leaving a page while the permission prompt was open and then allowing access left the microphone on until the tab closed. No audio was sent. The microphone is now released.

### Changed

- **Voice privacy:** the Claude option now says that the browser may send your voice to its maker, such as Google or Microsoft, and suggests typing instead.
- **Key field:** the field now asks browsers not to fill in a saved password, and the site asks visitors to decline any offer to save the key.
- **Framing:** the site no longer shows its content inside another page's frame.
- **Deployment:** only the deploy job can publish to GitHub Pages, so install scripts and tests no longer hold that permission. GitHub Actions are pinned to commit SHAs.

### Documentation

- The README and the policy comment now state what the Content Security Policy does not cover: WebRTC and navigation.
- The README explains that all Pages projects on a `<user>.github.io` address share one origin.
