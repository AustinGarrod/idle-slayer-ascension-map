import { useEffect, useState } from 'react'
import type { Catalog } from './domain/types'
import MapApp from './MapApp'
import { catalogErrors } from './domain/catalog'
import { trackEvent } from './analytics'

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let failure: 'network' | 'validation' = 'network'
    void fetch(`${import.meta.env.BASE_URL}catalog.json`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('The verified game catalog is not available.'); failure = 'validation'; return response.json() as Promise<Catalog> })
      .then((data) => { const errors = catalogErrors(data); if (errors.length) { failure = 'validation'; throw new Error(`The catalog failed validation: ${errors[0]}`) }; if (!controller.signal.aborted) setCatalog(data) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'The catalog could not be loaded.'); trackEvent('catalog_error', { reason: failure }) } })
    return () => controller.abort()
  }, [])
  if (catalog) return <MapApp catalog={catalog} />
  return <main className="loading"><h1>Ascension Map</h1><p role="status">{error || 'Loading the native Ascension tree…'}</p>{error && <button onClick={() => window.location.reload()}>Try again</button>}</main>
}
