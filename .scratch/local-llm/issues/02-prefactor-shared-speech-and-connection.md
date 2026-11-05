# 02: Prefactor: shared browser speech and the whole connection

**What to build:** the groundwork that makes the local provider an easy addition, with no visible change. Claude, OpenAI, Gemini and Demo behave exactly as before. Spec: `docs/plans/local-llm-spec.md`.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Speech recognition, speech synthesis, sentence splitting and the phase bookkeeping (speaking, your turn, thinking, stream done, pending utterances) move out of the Claude voice session into a shared browser speech module. A text provider supplies only "stream a reply to this history" and gets sentence-by-sentence speech, turns and phases from the shared module.
- [x] The Claude session uses the shared module and keeps its own model, effort, fallback beta and refusal handling.
- [x] `Connection` becomes a discriminated union on `provider`, ready for a `local` member with base URL, model and an optional key. Add the union shape but not the `local` provider itself.
- [x] Voice session configuration and the reviewers receive the whole `Connection` instead of a bare API key. Every adapter and reviewer is updated.
- [x] The shared module is tested through the `VoiceSession` contract (Claude session with a stubbed stream and stubbed speech globals): phases when the stream ends before and after the last utterance, typed answers when recognition is missing, `stop()` aborting the request and cancelling speech. No tests of the module's internals.
- [x] `npm test` and `npm run build` pass. The Demo flow still works in `npm run dev`.
