# Spec: connect a locally running LLM

Status: ready for agent. Plan and task order: `local-llm.md` in this folder.

## Problem Statement

Practising the naturalization conversation needs an API key from OpenAI, Google or Anthropic. A visitor without one, or one who does not want to pay per minute or send their voice and answers to a cloud provider, cannot use the trainer at all. Many visitors already run a model on their own computer with Ollama, LM Studio or a similar server, but the site has no way to talk to it.

## Solution

A new provider, "Local model (OpenAI-compatible)", appears in the provider list on the published site. The visitor enters the address of their local server (Ollama's address is filled in), optionally a key, and connects. The site lists the installed models, the visitor picks one, and from then on the interview and the review run on that model. The browser handles listening and speaking, as it already does for Claude. If the browser cannot reach the server, the site explains the usual causes and how to fix them for each common server. Nothing about the connection is stored beyond the tab's memory.

## User Stories

1. As a visitor without a cloud API key, I want to choose a local model as the provider, so that I can practise for free.
2. As a visitor, I want the provider to be named so it is clear it means a server on my own computer, so that I do not confuse it with a cloud service.
3. As an Ollama user, I want the server address to be filled in with Ollama's default, so that I can connect without typing anything.
4. As an LM Studio user, I want a hint with LM Studio's default address, so that I know what to type.
5. As a visitor, I want to edit the server address, so that I can use a non-default port or path.
6. As a visitor, I want an address that is not on my own computer to be rejected with an explanation, so that I understand why only localhost works.
7. As a visitor whose server requires a key, I want an optional key field, so that I can connect to vLLM or LM Studio with authentication enabled.
8. As a visitor whose server needs no key, I want to connect with the key field empty, so that I am not asked for something I do not have.
9. As a visitor choosing the local provider, I want no "get a key" link for it, so that I am not sent to a page that does not apply.
10. As a visitor, I want the connect button to check that the server answers, so that a wrong address or a stopped server shows up before the interview.
11. As a visitor, I want to see the models installed on my server after connecting, so that I can pick one without remembering its exact name.
12. As a visitor whose server returns no models or does not support listing them, I want to type the model name, so that I can still connect.
13. As a visitor, I want the connected status to show the model name, so that I know which model is examining me.
14. As a visitor, I want to disconnect and choose another model or provider, so that I can compare models.
15. As a visitor whose browser blocks the request, I want a help text instead of "invalid key", so that I know the problem is the connection, not my key.
16. As an Ollama user, I want the help text to tell me how to allow the site's origin, so that I can fix a CORS error myself.
17. As an LM Studio user, I want the help text to tell me where to enable CORS, so that I can fix it myself.
18. As a Chrome or Edge user, I want the help text to explain the browser's local network access prompt, so that I allow it instead of blocking the site.
19. As a Safari user, I want to be told if my browser cannot reach a local server from this site at all, so that I switch browsers instead of debugging.
20. As a visitor whose server rejects my key, I want a message that says so, so that I can tell it apart from a connection problem.
21. As a visitor, I want a short note that quality depends on the model, so that I do not blame the trainer for a weak small model.
22. As a visitor, I want to be told that the browser handles speech with this provider, so that I know the voice will sound like my system voice and may go through the browser's maker.
23. As a visitor, I want the examiner to start speaking soon after it starts generating, so that slow local generation does not mean long silences.
24. As a visitor, I want to answer by voice, so that the practice feels like the real conversation.
25. As a visitor whose browser has no speech recognition, I want to type my answers, so that I can still practise.
26. As a visitor using a reasoning model, I want the model's hidden reasoning left out of what is spoken and shown, so that the examiner does not read its thoughts aloud.
27. As a visitor, I want the transcript to show the examiner's reply without reasoning, so that the review works on the real conversation.
28. As a visitor, I want the same examiner behaviour as with cloud providers, so that practice with a local model prepares me just as well.
29. As a visitor, I want leaving the page to stop generation, speech and the microphone, so that nothing keeps running against my server.
30. As a visitor, I want a review at the end produced by the same local model, so that I do not need a cloud key for any part.
31. As a visitor whose server does not support JSON mode, I want the review to still work, so that I am not locked out by a server limitation.
32. As a visitor whose model returns a broken review, I want the existing "retry review" option, so that I can try again with the same conversation.
33. As a visitor using a reasoning model, I want the review to ignore the reasoning before the JSON, so that the review is read correctly.
34. As a visitor, I want the server address, key and model forgotten when I close or reload the tab, so that the site keeps its promise to store nothing.
35. As a Russian-speaking visitor, I want every new text in Russian, so that the setup and help are understandable.
36. As an English-speaking visitor, I want every new text in English, so that the setup and help are understandable.
37. As a visitor of the published site, I want the site's security policy to allow my local server and still block every other host, so that the key safety of the other providers is unchanged.
38. As a Claude user, I want Claude to work exactly as before after the speech code is shared, so that the new provider costs me nothing.
39. As a reader of the README, I want a section on setting up a local server with CORS for each common server, so that I can prepare before opening the site.
40. As the owner, I want the README provider table to include the local provider, so that the overview stays complete.
41. As the owner, I want the release recorded as a minor version with a changelog entry, so that the change is visible.
42. As the owner, I want a list of what an agent could not verify, so that I know which real-world checks to run with my own server and microphone.

## Implementation Decisions

- **Protocol.** The provider speaks the OpenAI-compatible API: a model listing and chat completions. Ollama's native API is not used. The requests use plain `fetch`, without an SDK.
- **Provider registration.** A new provider id, `local`, registered alongside the others and shipped in the production build. It is marked as using browser speech and has no key link.
- **Connection shape.** The connection becomes a discriminated union on the provider. Only `local` carries a base URL and a model; its key may be empty. Voice session configuration and the reviewers receive the whole connection instead of a bare key, and the existing adapters adapt to that.
- **Loopback rule.** A base URL is accepted only when its host is `localhost` or `127.0.0.1`, with any port and path. The check lives in code, because the development build has no security policy. The production security policy adds `http://localhost:*` and `http://127.0.0.1:*` to `connect-src` and nothing else.
- **Connecting.** For `local`, connecting lists the server's models. A successful listing confirms the address, CORS and the key at once, and fills a model choice. A listing that is empty, or fails with an HTTP error the server returned, falls back to a free-text model name. A network-level failure is a distinct error kind, so the interface can show the connection help instead of the invalid-key message.
- **Shared browser speech.** The speech recognition, speech synthesis, sentence splitting and phase bookkeeping now inside the Claude session move into a shared module. A text provider plugs in only "stream a reply to this history". Claude keeps its own model, effort, fallback and refusal handling, and its behaviour does not change.
- **Interview.** The local session keeps the history as chat messages with the one examiner prompt as the system message, requests streaming, parses server-sent events (including events split across chunks and the final done marker), and hands text to the shared speech module sentence by sentence. Stopping aborts the request.
- **Reasoning output.** Reasoning blocks delimited by think tags are removed from the stream before speech and transcript, including blocks that open and close in different chunks. A separate reasoning field in the response is ignored. The review strips them too before parsing.
- **Review.** One non-streaming request on the same model, asking for a JSON object response. If the server answers with a client error, the request is repeated once without the JSON format, and the existing review parsing extracts the object from the text. There are no overload retries.
- **Connect panel.** For `local` it shows the base URL field with the Ollama default and an LM Studio hint, an optional key, the model choice, a note on model quality without naming models, and the connection help on network errors. The connected status includes the model name. New styles are classes in the stylesheet, because the policy allows no inline styles.
- **Content.** Every new string exists in every locale, and the provider name is localized.
- **Memory only.** The base URL, key and model live only in React state, like the other connections.
- **Release.** Minor version bump in both version files and a changelog entry.

## Testing Decisions

- A good test drives the feature through its public contract and checks what a visitor or the interview would observe: events emitted, requests sent, text shown. It does not look at private fields or the shared speech module's internals.
- Three existing seams, no new ones:
  - **The `VoiceSession` contract, through `createVoiceSession('local', …)`.** `fetch` is stubbed with a streamed server-sent-events body, and browser speech globals are stubbed. The tests cover the request body (model, system prompt, history, streaming), sentence-by-sentence speech, turns and phases in order, events split across chunks, the done marker, think-tag stripping across chunks, typed answers when recognition is missing, and `stop()` aborting the request and silencing speech. The shared speech module is tested only through this contract and through Claude's existing behaviour. Prior art: the Gemini and OpenAI adapter tests.
  - **`generateReview` with a `local` connection.** `fetch` is stubbed. The tests cover the JSON format request, the single retry without it after a client error, no retry after a network error, think-tag stripping before parsing, and the key sent only when present. Prior art: the Gemini and OpenAI review tests.
  - **`App`.** `fetch` is stubbed for the model listing. The tests cover picking the local provider, rejecting a non-loopback address, the model dropdown, the free-text fallback, the connection help on a network error, the invalid-key message on a 401, and the model name in the connected status. Prior art: the connect and interview tests in the app suite.
- The locale completeness test and the version test must still pass unchanged.
- Unit tests prove nothing about real servers. A real interview and review against Ollama and LM Studio, the production build over HTTPS against a local server, the browser's local network prompt, and Claude after the refactor are the owner's checks.

## Out of Scope

- Local speech recognition or synthesis (Whisper, Piper and similar).
- Servers on hosts other than loopback, including other machines on the local network and remote vLLM.
- Ollama's native API.
- Remembering the server address or model between visits.
- Naming recommended models before the owner has tested them.
- Publishing to GitHub Pages, which stays the owner's decision.

## Further Notes

- The first task is research into how Chrome and Edge (local network access), Firefox and Safari treat requests from an HTTPS page to `http://localhost`, the exact CORS settings of Ollama, LM Studio, llama.cpp server and vLLM, and whether a port wildcard in `connect-src` matches every port in all three engines. The help text and the README section are written from its findings.
- This spec replaces the plan's line about separate tests for the shared speech module: that module is tested through the `VoiceSession` contract.
