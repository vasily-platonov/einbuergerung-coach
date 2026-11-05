import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

// Keeps out third-party and injected scripts, and limits fetch and WebSocket traffic to the provider APIs
// and to a local model server on this computer (loopback only, any port; the code also rejects other hosts).
// Both loopback hosts are listed, because browsers compare hosts as plain strings.
// It does not cover WebRTC, which OpenAI voice needs, or navigation, so a script already running could still use those.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "media-src 'self' blob:",
  "connect-src https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com http://localhost:* http://127.0.0.1:*",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

// Added only to the production build: Vite's dev server needs inline scripts and its own WebSocket.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  test: {
    environment: 'jsdom',
  },
})
