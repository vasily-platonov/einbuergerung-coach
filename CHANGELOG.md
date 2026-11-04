# Release notes

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
