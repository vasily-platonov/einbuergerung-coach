# Einbürgerung Coach

A browser-only trainer for the German naturalization conversation. `README.md` covers what it does, the models and where to edit content.

## Product rules

- **Frontend only.** Each browser talks straight to the provider with the visitor's own API key.
- **Memory only.** Keys, conversations, progress and settings live in React state or `Interview`, and browser storage and cookies stay empty.
- **One prompt.** `src/agent/prompt.ts` holds one examiner prompt for every page, and only the page's question changes.
- **A fresh session per page.** `App.tsx` keys `QuestionPage` by question id, so a new page remounts and disposes the previous `Interview`.
- **A conversation, not a language exam.** Reviews judge the idea and understanding first. Grammar counts only where it changes the meaning.

## Code

- A new voice provider implements `VoiceSession` in `src/agent/adapters/` and registers in `src/agent/providers.ts`.
- A new API host also goes into `connect-src` in `vite.config.ts`, or the production build blocks it. The policy applies only to the build, so check new hosts with `npm run build` and `npm run preview`.
- Styles go in `src/ui/styles.css` as classes, because the policy has `style-src 'self'`.
- Every change raises the version and adds an entry to `CHANGELOG.md` before it is committed: a new feature raises the minor number, a fix or small change the patch number. Update `VERSION`, `package.json` and the two `version` fields at the top of `package-lock.json`. A test keeps `VERSION` and `package.json` equal.

## Content

- Every locale in `src/content/locales/` has the same keys and question ids, enforced by `content.test.ts`. Every interface change needs text in each locale.
- Sample answers are in simple German: `shortAnswer` at A2, `fullAnswer` at B1.
- Write answers in your own words and check them against the laws linked in `sources.json`. The source set of questions came from Baden-Württemberg and was drafted with ChatGPT, so treat its claims as unverified. The target state is North Rhine-Westphalia.
- Present the material as study help, never as an official list or legal advice.

## Providers

Provider documentation has been wrong or ambiguous here, so real behaviour wins. Unit tests stub the network and say nothing about whether a real API accepts a request.

- **Gemini Live:** `responseModalities` belongs under `setup.generationConfig`. The getting-started sample places it directly under `setup`, which the server rejects.
- **OpenAI JSON mode:** the word "json" has to appear in the `input`, not only in `instructions`.
- **Gemini reviews:** one request to `gemini-3.8-flash`, then up to three to `gemini-3.6-flash`. The owner chose this after seeing the first model often overloaded.

## Verifying

- A change is done when `npm test` and `npm run build` both pass.
- For interview flows, use the **Demo** provider in `npm run dev`. It needs no key or microphone.
- Real voice sessions need the owner's keys and microphone. Say which ones you could not run, and ask the owner to test them.

## Git

Commit and push when the owner asks, and show the result of the checks first. Publishing to GitHub Pages is a separate decision for the owner: `.github/workflows/deploy.yml` runs only when started by hand.
