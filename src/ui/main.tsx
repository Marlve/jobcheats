import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Inter is bundled rather than fetched — the app must render correctly offline.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './tokens.css'
import './components/ui.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
