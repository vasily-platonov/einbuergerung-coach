# 07: Release 1.1.0

**What to build:** the finished feature recorded as a release, with every automatic check run and a list of what only the owner can verify.

**Blocked by:** 04, 06

**Status:** ready-for-agent

- [ ] `VERSION` and `package.json` say `1.1.0`; the version test passes.
- [ ] `CHANGELOG.md` has a 1.1.0 entry describing the local model provider.
- [ ] `npm test`, `npm run build` and `npm run preview` pass, and the built page's policy contains the localhost sources.
- [ ] The Demo flow still works in `npm run dev`.
- [ ] A list for the owner of the checks no agent could run: a real interview and review with Ollama and LM Studio (a small and a larger model) in Chrome and Firefox, Safari if the research says it can work, the production build over HTTPS against a local server including the local network prompt, and Claude after the prefactor.
- [ ] No push and no publishing to GitHub Pages: both are the owner's decisions.
