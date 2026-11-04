import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './ui/styles.css'

// A <meta> policy cannot set frame-ancestors, so the site itself refuses to show its key field inside another page.
if (window.top === window.self) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
