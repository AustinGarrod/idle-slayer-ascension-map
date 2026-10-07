import { useEffect, useState } from 'react'
import type { Catalog } from './domain/types'
import MapApp from './MapApp'
import { catalogErrors } from './domain/catalog'
import { ANALYTICS_PREFERENCE_KEY, getTrackingStatus, setTrackingPreference, trackEvent } from './analytics'
import { PrivacyPanel, trackingDisclosure } from './PrivacyPanel'
import type { TransferCapture } from './domain/progress-transfer'

export default function App({ initialTransfer = null }: { initialTransfer?: TransferCapture }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [trackingStatus, setTrackingStatus] = useState(getTrackingStatus)
  useEffect(() => {
    if (catalog) return
    const refreshTracking = (event: StorageEvent) => {
      if (event.key === null || event.key === ANALYTICS_PREFERENCE_KEY || event.key === 'umami.disabled') setTrackingStatus(getTrackingStatus())
    }
    window.addEventListener('storage', refreshTracking)
    return () => window.removeEventListener('storage', refreshTracking)
  }, [catalog])
  useEffect(() => {
    const controller = new AbortController()
    let failure: 'network' | 'validation' = 'network'
    void fetch(`${import.meta.env.BASE_URL}catalog.json`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('The verified game catalog is not available.'); failure = 'validation'; return response.json() as Promise<Catalog> })
      .then((data) => { const errors = catalogErrors(data); if (errors.length) { failure = 'validation'; throw new Error('The catalog failed validation.') }; if (!controller.signal.aborted) setCatalog(data) })
      .catch(() => { if (!controller.signal.aborted) { setLoadFailed(true); trackEvent('catalog_error', { reason: failure }) } })
    return () => controller.abort()
  }, [])
  if (catalog) return <MapApp catalog={catalog} initialTransfer={initialTransfer} />
  return <main className="loading">
    <h1>Ascension Map</h1>
    <p role="status">{loadFailed ? 'The verified game catalog could not be loaded. Please try again.' : 'Loading the native Ascension tree…'}</p>
    {loadFailed && <button onClick={() => window.location.reload()}>Try again</button>}
    <p className="startup-disclosure">{trackingDisclosure}</p>
    <details className="startup-privacy" onToggle={(event) => { if (event.currentTarget.open) setTrackingStatus(getTrackingStatus()) }}>
      <summary>Privacy & tracking</summary>
      <PrivacyPanel status={trackingStatus} onChange={(enabled) => {
        const { reloadURL } = setTrackingPreference(enabled)
        window.history.replaceState(window.history.state, '', reloadURL)
        window.location.reload()
      }} />
    </details>
  </main>
}
