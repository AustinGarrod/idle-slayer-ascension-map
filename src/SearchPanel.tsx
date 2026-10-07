import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Profile, Upgrade } from './domain/types'
import { discoverUpgrades } from './domain/discovery'
import type { DiscoveryFilter, UpgradeState } from './domain/discovery'
import { Icon } from './UpgradeCard'
import { trackEvent } from './analytics'
import './SearchPanel.css'

const stateLabels: Record<UpgradeState, string> = {
  available: '+ Available', locked: '◇ Locked', purchased: '✓ Owned and active', pending: '◷ Owned · awaiting activation',
}

export function SearchPanel({ upgrades, profile, inputRef, open, onOpenChange, onSelect }: {
  upgrades: Upgrade[]
  profile: Profile
  inputRef: RefObject<HTMLInputElement | null>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (id: string, keyboard: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [queryRevision, setQueryRevision] = useState(0)
  const [filter, setFilter] = useState<DiscoveryFilter>('all')
  const panel = useRef<HTMLDivElement>(null)
  const results = useMemo(() => discoverUpgrades(upgrades, profile, query, filter), [upgrades, profile, query, filter])
  const latestSearch = useRef<{ query_length: '1-3' | '4-10' | '11-30' | '31+'; results: '0' | '1-5' | '6-20' | '21+' } | null>(null)
  latestSearch.current = query.trim() ? {
    query_length: query.length <= 3 ? '1-3' : query.length <= 10 ? '4-10' : query.length <= 30 ? '11-30' : '31+',
    results: results.length === 0 ? '0' : results.length <= 5 ? '1-5' : results.length <= 20 ? '6-20' : '21+',
  } : null
  useEffect(() => {
    if (!queryRevision || !latestSearch.current) return
    const timer = window.setTimeout(() => {
      if (latestSearch.current) trackEvent('search_performed', latestSearch.current)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [queryRevision])
  useEffect(() => { if (panel.current) panel.current.scrollTop = 0 }, [query, filter])
  function close() { inputRef.current?.focus({ preventScroll: true }); onOpenChange(false) }
  return <div className="search-box" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
    <label className="sr-only" htmlFor="search">Search visible upgrade titles and effects</label><span aria-hidden="true">⌕</span>
    <input className="telemetry-private rr-block" id="search" ref={inputRef} type="search" autoComplete="off" placeholder="Find an upgrade…" value={query}
      onFocus={() => onOpenChange(true)}
      onChange={(event) => { setQuery(event.target.value); setQueryRevision((revision) => revision + 1); onOpenChange(true) }}
      onKeyDown={(event) => { if (event.key === 'Enter' && results[0]) { event.preventDefault(); onSelect(results[0].node.id, true) } }} />
    {open && <div ref={panel} className="search-results upgrade-discovery telemetry-private rr-block" role="region" aria-label="Visible upgrade results">
      <div className="results-heading"><span aria-live="polite">{results.length} visible results</span><button onClick={close} aria-label="Close search results">×</button></div>
      <div className="discovery-controls"><label htmlFor="discovery-state">Progress state</label><select id="discovery-state" value={filter} onChange={(event) => setFilter(event.target.value as DiscoveryFilter)}>
        <option value="all">All visible</option><option value="available">Available</option><option value="locked">Locked</option><option value="owned">Owned</option><option value="pending">Awaiting activation</option>
      </select><small>Available: native requirements recorded. SP balance is not checked.</small></div>
      <div className="discovery-list">
        {results.map(({ node, state, duplicateTitle }) => <button className="search-result" key={node.id} data-upgrade-id={node.id} onClick={(event) => onSelect(node.id, event.detail === 0)}>
          <Icon node={node} /><span><span className="discovery-title">{node.title}</span><small className={`discovery-state ${state}`}>{stateLabels[state]}</small><small>{BigInt(node.cost).toLocaleString('en')} SP</small>
            {duplicateTitle && <small className="discovery-identity">ID: {node.id}</small>}<small className="discovery-effect">{node.description}</small></span>
        </button>)}
        {results.length === 0 && <p>No visible upgrades match{filter === 'all' ? '.' : ' this progress state.'}</p>}
      </div>
    </div>}
  </div>
}
