# 04: Review from the local model

**What to build:** after an interview with a local model, the visitor gets the usual review, produced by the same model, even when the server has no JSON mode or the model is a reasoning model. Spec: `docs/plans/local-llm-spec.md`.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] The `local` reviewer sends one non-streaming chat completion on the connected model with the review prompt and transcript, asking for a JSON object response.
- [ ] On a client error (4xx) it repeats the request once without the JSON format and relies on the existing review parsing to cut the object out of the text. No retry after a network error or a server error.
- [ ] Think-tag reasoning is removed before parsing. A separate reasoning field is ignored.
- [ ] The key is sent as a bearer token only when present.
- [ ] A failed review leaves the existing "retry review" option working.
- [ ] Tests through `generateReview` with a `local` connection and stubbed `fetch` cover each point above.
- [ ] `npm test` and `npm run build` pass.
