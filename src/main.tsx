import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeAnalytics } from './analytics'
import { createProgressTransferInbox } from './progress-transfer-inbox'
import { initializeUpgradeReferences } from './upgrade-reference-receiver'

const transferInbox = createProgressTransferInbox(window)
const references = initializeUpgradeReferences(window, import.meta.env.BASE_URL)
if (transferInbox.trackingSafe) initializeAnalytics()
references.cleanAddress()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App transferInbox={transferInbox} />
  </StrictMode>,
)
