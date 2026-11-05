# 05: Model list and connected status

**What to build:** after the server answers, the visitor picks one of their installed models from a list instead of typing it, sees which model is connected, and is told that quality depends on the model. Spec: `docs/plans/local-llm-spec.md`.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Connecting to `local` first lists the server's models and shows them in a dropdown; the visitor picks one and confirms.
- [ ] If the list is empty, or the listing fails with an HTTP error the server returned, the model name text field remains as the fallback.
- [ ] The connected status shows the provider and the model name.
- [ ] A short localized note says quality depends on the model and small models struggle with German and the review format. It names no models.
- [ ] Disconnecting returns to the connect form, ready for another model or provider.
- [ ] New styles are classes in the stylesheet. Every new string exists in every locale.
- [ ] App tests with stubbed `fetch`: dropdown filled from the listing, text fallback on an empty list, model name in the connected status.
- [ ] `npm test` and `npm run build` pass.
