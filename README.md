# Einbürgerung Coach

Practice the German naturalization conversation (`Bekenntnis` and loyalty declaration) in the browser. Study a question, then talk to an AI examiner in German and get a review. The interface and reviews are in Russian or English.

This is study material, not an official question list and not legal advice.

## Run locally

```bash
npm install
npm run dev
```

Other commands: `npm test`, `npm run build`, `npm run preview`.

In development, the provider list includes **Demo**, which runs a short interview with no API key or microphone. The production build leaves it out.

## How it works

- **Frontend only.** There is no backend. The site talks straight to the provider you choose.
- **Your own API key.** Regular subscriptions (Claude Pro, ChatGPT Plus, Gemini) cannot connect to third-party sites, so you need an API key. The provider charges you for what you use.
- **Nothing is saved.** The key, conversations and progress stay in the tab's memory and disappear when you close or reload it. The site does not use cookies or browser storage.
- **A new session on every page.** Leaving a page stops the microphone, audio and requests, and the next page starts with a new agent.

| Provider | Voice | Interview model | Review model |
|---|---|---|---|
| OpenAI | Native, over WebRTC | `gpt-realtime-2.1`, with `gpt-transcribe` for your speech | `gpt-6.1-terra` |
| Google Gemini | Native, over WebSocket | `gemini-3.8-live` | `gemini-3.8-flash`, then `gemini-3.6-flash` |
| Anthropic Claude | Browser speech (best in Chrome and Edge) | `claude-opus-5-5` | `claude-opus-5-5` |

If a review request fails:

- **OpenAI** retries temporary server errors up to two more times.
- **Gemini** makes one request to `gemini-3.8-flash`. If that fails, it makes up to three requests to `gemini-3.6-flash`, retrying only temporary server errors.
- **Claude** relies on the retries built into the Anthropic SDK. Its requests also use `fallbacks: "default"`, so if a safety classifier declines a request on a topic such as the Holocaust or extremism, Anthropic retries it on another model.

If the review still fails, the page offers to retry it with the same conversation.

### Key safety

The key is available to the page's JavaScript and is sent only to the provider. A strict Content Security Policy in the production build blocks third-party scripts and limits `fetch` and WebSocket requests to the provider APIs. It does not cover WebRTC or navigation, so a script that was already running could still send data out that way. The site also refuses to run inside another page's frame. Even so, use a separate key with a spending limit. OpenAI's documentation recommends creating session tokens on a server, and this site deliberately does it in the browser, using your own key, so that no server handles it. The Gemini Live API receives the key as a URL parameter over an encrypted connection. Browsers may offer to save the key like a password, and the site asks visitors to decline.

### Voice privacy

OpenAI and Gemini receive your voice directly. With Claude, the browser handles speech recognition and may send your voice to its maker, such as Google or Microsoft, so the site suggests typing as the alternative.

## Change the content

| To change | Edit |
|---|---|
| Question order, section, sources | `src/content/questions.json`, `src/content/sources.json` |
| German questions and answers | `src/content/de.json` |
| Translations, notes and interface text | `src/content/locales/<language>.json` |
| The examiner and review prompts | `src/agent/prompt.ts` |

To add a language, add one file to `src/content/locales/`. The tests check that it is complete.

## Content sources

The first 16 questions follow a [set of examples published on LiveJournal](https://homaaxel.livejournal.com/1823476.html), whose author says the answers were drafted with ChatGPT from guides issued by authorities in Baden-Württemberg. The answers here were rewritten, adapted to North Rhine-Westphalia and checked against the laws linked on each page. The last 8 questions were added separately. None of this has been reviewed by a lawyer or an authority.

## Publish

`.github/workflows/deploy.yml` publishes to GitHub Pages. It runs only when started by hand from the Actions tab, after you enable Pages with **GitHub Actions** as the source in the repository settings.

On a `<user>.github.io` address, every Pages project of that account shares one origin, including the microphone permission. Publish there only next to projects you trust, or use a custom domain.

## License

[MIT](LICENSE)
