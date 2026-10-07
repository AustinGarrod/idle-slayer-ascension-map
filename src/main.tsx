import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeAnalytics } from './analytics'
import { captureProgressTransfer } from './domain/progress-transfer'

const initialTransfer = captureProgressTransfer(window)
if (initialTransfer?.cleaned !== false) initializeAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App initialTransfer={initialTransfer} />
  </StrictMode>,
)
