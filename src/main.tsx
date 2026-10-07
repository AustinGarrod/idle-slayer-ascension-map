import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeAnalytics } from './analytics'
import { createProgressTransferInbox } from './progress-transfer-inbox'

const transferInbox = createProgressTransferInbox(window)
if (transferInbox.trackingSafe) initializeAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App transferInbox={transferInbox} />
  </StrictMode>,
)
