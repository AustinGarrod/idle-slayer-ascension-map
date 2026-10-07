import { useEffect, useState } from 'react'
import type { Catalog } from './domain/types'
import MapApp from './MapApp'
import { catalogErrors } from './domain/catalog'
import { trackEvent } from './analytics'

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let failure: 'network' | 'validation' = 'network'
    void fetch(`${import.meta.env.BASE_URL}catalog.json`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('The verified game catalog is not available.'); failure = 'validation'; return response.json() as Promise<Catalog> })
      .then((data) => { const errors = catalogErrors(data); if (errors.length) { failure = 'validation'; throw new Error('The catalog failed validation.') }; if (!controller.signal.aborted) setCatalog(data) })
      .catch(() => { if (!controller.signal.aborted) { setLoadFailed(true); trackEvent('catalog_error', { reason: failure }) } })
    return () => controller.abort()
  }, [])
  if (catalog) return <MapApp catalog={catalog} />
  return <main className="loading"><h1>Ascension Map</h1><p role="status">{loadFailed ? 'The verified game catalog could not be loaded. Please try again.' : 'Loading the native Ascension tree…'}</p>{loadFailed && <button onClick={() => window.location.reload()}>Try again</button>}</main>
}
