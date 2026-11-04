import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

// Only the provider APIs may receive data, so a stray script cannot send a key anywhere else.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "media-src 'self' blob:",
  "connect-src https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com",
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
