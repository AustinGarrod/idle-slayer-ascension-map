import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Background, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import '@fontsource/press-start-2p/latin-400.css'
import type { Catalog, Profile, Requirement, Upgrade } from './domain/types'
import { emptyProfile } from './domain/types'
import { planPurchase, planRemoval, planUltraAscension, satisfies, searchVisible, visibility } from './domain/rules'
import { exportProfileBackup, loadProfile, parseProfileBackup, saveProfile } from './domain/storage'
import { createMapLayout, MAP_NODE_HEIGHT, MAP_NODE_WIDTH } from './domain/map-layout'
import { DependencyEdge } from './DependencyEdge'
import { recommendUpgrades } from './domain/recommendations'
import { schemaVersion, source as wikiSource, rows as wikiRows } from './data/wiki-priorities.json'
import { RecommendationPanel } from './RecommendationPanel'
import { importGameSave } from './domain/game-save-import'
import type { GameSaveImportPreview } from './domain/game-save-import'
import { MAX_GAME_SAVE_BYTES } from './domain/save-codec'
import { GameSaveImportPanel } from './GameSaveImportPanel'

type UpgradeNode = Node<{ upgrade: Upgrade; state: string }, 'upgrade'>
type Preview = { title: string; text: string; profile: Profile; changes?: string[]; groups?: { label: string; ids: string[] }[]; replaceStorage?: boolean }

function Icon({ node }: { node: Upgrade }) {
  return <img className="upgrade-icon" src={`${import.meta.env.BASE_URL}${node.icon}`} alt="" />
}

function UpgradeCard({ data }: NodeProps<UpgradeNode>) {
  return <div className={`upgrade-node nopan ${data.state}`}>
    <Handle type="target" position={Position.Top} id="top-in" />
    <Handle type="target" position={Position.Bottom} id="bottom-in" />
    <Handle type="target" position={Position.Left} id="left-in" />
    <Handle type="target" position={Position.Right} id="right-in" />
    <Icon node={data.upgrade} />
    <span className="node-symbol" aria-hidden="true">{data.state === 'purchased' ? '✓' : data.state === 'pending' ? '◷' : data.state === 'available' ? '+' : '◇'}</span>
    <span className="node-title">{data.upgrade.title}</span>
    <Handle type="source" position={Position.Top} id="top-out" />
    <Handle type="source" position={Position.Bottom} id="bottom-out" />
    <Handle type="source" position={Position.Left} id="left-out" />
    <Handle type="source" position={Position.Right} id="right-out" />
  </div>
}
const nodeTypes = { upgrade: UpgradeCard }
const edgeTypes = { dependency: DependencyEdge }
const wikiPriorities = { schemaVersion, source: wikiSource, rows: wikiRows }
const cost = (value: string) => BigInt(value).toLocaleString('en')

function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previousFocus = document.activeElement
    const dialog = ref.current
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={ref} onCancel={(event) => { event.preventDefault(); close() }} aria-labelledby="dialog-title">
    <div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button aria-label="Close dialog" onClick={close}>×</button></div>
    {children}
  </dialog>
}

function Atlas({ catalog }: { catalog: Catalog }) {
  const [profile, setProfile] = useState(() => emptyProfile(catalog.revision))
  const [loaded, setLoaded] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [storageWritable, setStorageWritable] = useState(false)
  const [history, setHistory] = useState<Profile[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [menu, setMenu] = useState<'options' | 'progress' | 'milestones' | 'about' | 'recommendations' | 'game-import' | null>(null)
  const [gameImport, setGameImport] = useState<{ result: GameSaveImportPreview; original: Profile } | null>(null)
  const [gameImportError, setGameImportError] = useState('')
  const [gameImportLoading, setGameImportLoading] = useState(false)
  const gameImportRequest = useRef(0)
  const currentProfile = useRef(profile)
  currentProfile.current = profile
  const [layoutMode, setLayoutMode] = useState<'native' | 'web'>('web')
  const [detailExpanded, setDetailExpanded] = useState(false)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [purchaseTarget, setPurchaseTarget] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<string, number>>({})
  const [message, updateMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef<number | undefined>(undefined)
  const fileInput = useRef<HTMLInputElement>(null)
  const gameFileInput = useRef<HTMLInputElement>(null)
  const mapElement = useRef<HTMLElement>(null)
  const flow = useReactFlow<UpgradeNode>()
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const visible = useMemo(() => visibility(catalog, profile), [catalog, profile])
  const index = useMemo(() => new Map(catalog.upgrades.map((node) => [node.id, node])), [catalog])
  const detail = selected && visible.ids.has(selected) ? index.get(selected) : undefined
  const visibleGraphKey = JSON.stringify([visible.upgrades.map((node) => node.id), visible.connections])
  const layout = useMemo(() => createMapLayout({ mode: layoutMode, upgrades: visible.upgrades, connections: visible.connections }), [catalog, layoutMode, visibleGraphKey])
  const incoming = visible.connections.filter((edge) => edge.to === detail?.id).map((edge) => index.get(edge.from)!)
  const outgoing = visible.connections.filter((edge) => edge.from === detail?.id).map((edge) => index.get(edge.to)!)
  const related = new Set([...incoming, ...outgoing].map((node) => node.id))
  const results = useMemo(() => searchVisible(catalog, profile, query), [catalog, profile, query])
  const purchasePlan = purchaseTarget ? planPurchase(catalog, profile, purchaseTarget, choices) : null
  const recommendations = useMemo(() => recommendUpgrades(catalog, profile, wikiPriorities), [catalog, profile])
  function selectSuggestion(id: string, purchase = false) {
    if (!recommendations.suggestions.some((suggestion) => suggestion.upgrade.id === id)) return
    setMenu(null); center(id)
    if (purchase) { setChoices({}); setPurchaseTarget(id) }
  }
  function setMessage(text: string) {
    updateMessage(text); setToastVisible(Boolean(text)); window.clearTimeout(toastTimer.current)
    if (text) toastTimer.current = window.setTimeout(() => setToastVisible(false), 4000)
  }
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])
  function persist(next: Profile, replaceStorage = false) {
    if (!storageWritable && !replaceStorage) {
      setStorageError('Saved data could not be read. Changes stay in memory. Retry recovery, export a backup, or explicitly restore/clear progress to replace stored data.')
      return
    }
    try {
      const result = saveProfile(window.localStorage, next)
      setStorageError(result.ok ? '' : result.error.message)
    } catch { setStorageError('Local storage is unavailable. Your current session is still usable; export a backup to keep it.') }
  }
  function change(next: Profile, announcement: string, replaceStorage = false) {
    if (replaceStorage) setStorageWritable(true)
    setHistory((past) => [...past.slice(-19), profile]); setProfile(next); persist(next, replaceStorage); setMessage(announcement)
  }
  useEffect(() => {
    try {
      const result = loadProfile(window.localStorage, catalog.revision)
      if (result.ok) { setProfile(result.profile); setStorageWritable(true) }
      else setStorageError(result.error.message)
    } catch { setStorageError('Local storage is unavailable. Export a backup to keep this session.') }
    setLoaded(true)
  }, [catalog.revision])
  function retryStorage() {
    if (storageWritable) { persist(profile); return }
    try {
      const result = loadProfile(window.localStorage, catalog.revision)
      if (!result.ok) { setStorageError(result.error.message); return }
      if (result.source === 'new') { setStorageWritable(true); persist(profile, true); return }
      setPreview({ title: 'Recover saved progress?', text: 'Replace the current session with the recovered saved profile. Undo remains available. Export this session first if you want to keep both.', profile: result.profile, replaceStorage: true })
    } catch { setStorageError('Local storage remains unavailable. Export a backup to keep this session.') }
  }
  useEffect(() => { if (selected && !visible.ids.has(selected)) setSelected(null) }, [selected, visible.ids])
  function moveCamera(id: string, zoom = 1) {
    const position = layout.centers.get(id)
    if (!position) return
    // Docked details resize the canvas. Wait for its new dimensions before centering.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const map = mapElement.current?.getBoundingClientRect()
      const camera = mapElement.current?.querySelector('.camera-controls')?.getBoundingClientRect()
      let inset = 0
      if (map && camera && camera.right > map.left + map.width / 2 - MAP_NODE_WIDTH * zoom / 2) {
        const safeCenter = Math.max(MAP_NODE_HEIGHT * zoom / 2 + 8,
          Math.min(map.height / 2, camera.top - map.top - MAP_NODE_HEIGHT * zoom / 2 - 12))
        inset = (map.height / 2 - safeCenter) / zoom
      }
      void flow.setCenter(position.x, position.y + inset, { zoom, duration: reducedMotion ? 0 : 220 })
    }))
  }
  function center(id: string) {
    if (!visible.ids.has(id)) return
    if (!selected) setDetailExpanded(false)
    setSelected(id); setSearchOpen(false); moveCamera(id)
  }
  useEffect(() => {
    if (loaded) moveCamera(selected && visible.ids.has(selected) ? selected : catalog.startId, selected ? 1 : 0.85)
  }, [layout, loaded, detailExpanded])
  useEffect(() => {
    const resize = () => { if (loaded) moveCamera(selected && visible.ids.has(selected) ? selected : catalog.startId, selected ? 1 : 0.85) }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [layout, loaded, selected])
  const state = (node: Upgrade) => satisfies({ kind: 'owned', id: node.id }, profile)
    ? satisfies({ kind: 'active', id: node.id }, profile) ? 'purchased' : 'pending'
    : satisfies(node.purchase, profile) ? 'available' : 'locked'
  const nodes: UpgradeNode[] = visible.upgrades.map((node) => ({ id: node.id, type: 'upgrade', position: layout.centers.get(node.id)!,
    data: { upgrade: node, state: state(node) }, selected: selected === node.id,
    className: detail && node.id !== detail.id ? related.has(node.id) ? 'node-related' : 'node-muted' : '',
    ariaLabel: `${node.title}, ${state(node)}, ${cost(node.cost)} Slayer Points`, width: MAP_NODE_WIDTH, height: MAP_NODE_HEIGHT }))
  const edges = visible.connections.map((edge) => {
    const from = layout.centers.get(edge.from)!, to = layout.centers.get(edge.to)!
    const dx = to.x - from.x, dy = to.y - from.y
    const horizontal = Math.abs(dx) > Math.abs(dy)
    const sourceHandle = layoutMode === 'web' ? 'right-out' : horizontal ? dx > 0 ? 'right-out' : 'left-out' : dy > 0 ? 'bottom-out' : 'top-out'
    const targetHandle = layoutMode === 'web' ? 'left-in' : horizontal ? dx > 0 ? 'left-in' : 'right-in' : dy > 0 ? 'top-in' : 'bottom-in'
    const direction = edge.to === detail?.id ? 'incoming' : edge.from === detail?.id ? 'outgoing' : null
    const color = direction === 'incoming' ? '#f1d79b' : '#b860af'
    return { id: `${edge.from}:${edge.to}`, source: edge.from, target: edge.to, sourceHandle, targetHandle,
      type: layoutMode === 'web' ? 'dependency' : 'straight', focusable: false, selectable: false,
      data: { points: layout.edgePaths.get(`${edge.from}:${edge.to}`) },
      className: detail ? direction ? `connection-${direction}` : 'connection-muted' : '',
      style: { stroke: color, strokeWidth: direction ? 4 : 2 }, zIndex: direction ? 1 : 0,
      markerEnd: { type: MarkerType.ArrowClosed, markerUnits: 'userSpaceOnUse', width: 32, height: 32, color } }
  })
  function label(requirement: Requirement): string {
    switch (requirement.kind) {
      case 'always': return 'No prerequisites'
      case 'ultra-ascended': return 'At least one Ultra Ascension'
      case 'all': return requirement.requirements.map(label).join(' AND ')
      case 'any': return requirement.requirements.map(label).join(' OR ')
      case 'milestone': return visible.milestones.find((item) => item.id === requirement.id)?.title ?? 'Unrevealed milestone'
      case 'owned': case 'active': return `${visible.ids.has(requirement.id) ? index.get(requirement.id)?.title ?? 'Unknown upgrade' : 'Unrevealed upgrade'}${requirement.kind === 'active' ? ' (active)' : ''}`
    }
  }
  function previewRemoval(id: string, milestone = false) {
    const result = planRemoval(catalog, profile, id, milestone)
    setPreview({ title: milestone ? 'Remove milestone?' : 'Remove purchase?', text: `This clears ${result.removed.length} purchase${result.removed.length === 1 ? '' : 's'} that would lose their dependency path. Valid alternate paths and earlier retained ownership stay intact.`, profile: result.profile, changes: result.removed })
  }
  function ultra() {
    const result = planUltraAscension(catalog, profile)
    if (!result) { setMessage(`Ultra Ascension requires: ${label(catalog.ultraAscension)}.`); return }
    setMenu(null)
    setPreview({ title: 'Ultra Ascend?', text: `Start epoch ${result.profile.epoch}. Clear ${result.cleared.length} repeat purchases, activate ${result.activated.length} Astral locks, and retain ${result.granted.length} purchased grant targets. Keep Astral ownership and milestones.`, profile: result.profile, groups: [{ label: 'Repeat purchases cleared', ids: result.cleared }, { label: 'Astral locks activated', ids: result.activated }, { label: 'Purchased grant targets retained', ids: result.granted }] })
  }
  function backup() {
    const result = exportProfileBackup(profile)
    if (!result.ok) { setMessage(result.error.message); return }
    const url = URL.createObjectURL(new Blob([result.text], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'idle-slayer-progress.json'; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage('Progress backup exported.')
  }
  async function restore(file: File) {
    if (file.size > 4 * 1024 * 1024) { setMessage('The backup exceeds the 4 MiB limit. Progress was not replaced.'); return }
    let text: string
    try { text = await file.text() } catch { setMessage('The backup could not be read. Progress was not replaced.'); return }
    const result = parseProfileBackup(text)
    if (!result.ok) { setMessage(result.error.message); return }
    setMenu(null)
    setPreview({ title: 'Restore progress?', text: `Replace this profile and its stored data with ${Object.keys(result.profile.purchases).length} recorded purchases and ${Object.keys(result.profile.milestones).length} milestones, in epoch ${result.profile.epoch}. Unknown IDs are retained. Undo remains available.`, profile: { ...result.profile, catalogRevision: catalog.revision }, replaceStorage: true })
  }
  function closeGameImport() {
    gameImportRequest.current++
    setGameImport(null); setGameImportError(''); setGameImportLoading(false); setMenu('progress')
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-game-import-trigger]')?.focus({ preventScroll: true }))
  }
  async function readGameSave(file: File) {
    const request = ++gameImportRequest.current
    setGameImport(null); setGameImportError(''); setGameImportLoading(true); setMenu('game-import')
    let bytes: Uint8Array
    try {
      if (file.size > MAX_GAME_SAVE_BYTES) throw new Error('too-large')
      bytes = new Uint8Array(await file.arrayBuffer())
    } catch {
      if (request !== gameImportRequest.current) return
      setGameImportLoading(false)
      setGameImportError(file.size > MAX_GAME_SAVE_BYTES ? 'The game save exceeds the 4 MiB import limit. Map progress was not changed.' : 'The game save could not be read. Map progress was not changed.')
      return
    }
    if (request !== gameImportRequest.current) return
    const original = currentProfile.current
    const result = importGameSave(catalog, original, bytes)
    setGameImportLoading(false)
    if (!result.ok) { setGameImportError(result.error); return }
    setGameImport({ result, original })
  }
  function applyGameImport() {
    if (!gameImport) return
    if (currentProfile.current !== gameImport.original) {
      setGameImport(null); setGameImportError('Map progress changed while reviewing this import. Choose the save again to create a fresh preview.')
      return
    }
    change(gameImport.result.profile, 'Game progress imported. Undo is available.', true)
    gameImportRequest.current++; setGameImport(null); setGameImportError(''); setMenu(null)
  }
  const verified = Object.entries(catalog.verification).filter(([key]) => key !== 'evidence').every(([, value]) => value === true)
  return <main className="atlas">
    <header className="toolbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true">✦</span><div><h1>Ascension Map</h1><p>Idle Slayer · {catalog.gameVersion}</p></div></div>
      <div className="search-box"><label className="sr-only" htmlFor="search">Search visible upgrade titles</label><span aria-hidden="true">⌕</span><input id="search" type="search" autoComplete="off" placeholder="Find an upgrade…" value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true) }} onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); if (event.key === 'Enter' && results[0]) center(results[0].id) }} />
        {searchOpen && <div className="search-results" aria-label="Visible upgrade results"><div className="results-heading"><span>{results.length} visible results</span><button onClick={() => setSearchOpen(false)} aria-label="Close search results">×</button></div>{results.slice(0, 40).map((node) => <button className="search-result" key={node.id} onClick={() => center(node.id)}><Icon node={node} /><span>{node.title}<small>{cost(node.cost)} SP</small></span></button>)}{results.length > 40 && <p>Refine your search to see more results.</p>}{results.length === 0 && <p>No visible upgrades match.</p>}</div>}
      </div>
      <button className="next-upgrade" onClick={() => { setSearchOpen(false); setMenu('recommendations') }}>Next upgrade</button>
      <div className="layout-control" role="group" aria-label="Map layout"><button aria-pressed={layoutMode === 'web'} onClick={() => setLayoutMode('web')} title="Readable dependency layout">Web</button><button aria-pressed={layoutMode === 'native'} onClick={() => setLayoutMode('native')} title="Original game positions">Game</button></div>
      <label className="spoiler-control desktop-action"><input type="checkbox" checked={profile.showSpoilers} onChange={(event) => change({ ...profile, showSpoilers: event.target.checked }, event.target.checked ? 'Spoilers shown.' : 'Spoilers hidden.')} />Show spoilers</label>
      <button className="desktop-action" onClick={() => setMenu('milestones')}>Milestones</button><button className="desktop-action" onClick={() => setMenu('progress')}>Progress</button>
      <button className="mobile-options" aria-label="Map options" onClick={() => { setSearchOpen(false); setMenu('options') }}>☰</button>
    </header>
    {storageError && <div className="notice" role="alert">{storageError} <button onClick={retryStorage}>{storageWritable ? 'Retry saving' : 'Retry recovery'}</button><button onClick={backup}>Export backup</button></div>}
    {!verified && <div className="notice">Local preview · Catalog verification is incomplete. Publication is gated.</div>}
    <div className={`workspace ${detail ? 'has-details' : ''} ${detailExpanded ? 'details-expanded' : ''}`}>
      <section ref={mapElement} className="map" aria-label="Ascension tree">
        {loaded && <ReactFlow<UpgradeNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} nodeOrigin={[0.5, 0.5]} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} selectionKeyCode={null} multiSelectionKeyCode={null} minZoom={0.15} maxZoom={2.5} defaultViewport={{ x: 0, y: 0, zoom: 0.7 }} onInit={(instance) => { const start = layout.centers.get(catalog.startId); if (start) void instance.setCenter(start.x, start.y, { zoom: 0.85 }) }} onNodesChange={(changes) => { const selection = changes.find((entry) => entry.type === 'select' && entry.selected); if (selection?.type === 'select' && selection.id !== selected) center(selection.id); else if (changes.some((entry) => entry.type === 'select' && !entry.selected && entry.id === selected)) setSelected(null) }} onNodeClick={(_, node) => center(node.id)} onPaneClick={() => setSearchOpen(false)} ariaLabelConfig={{ 'node.a11yDescription.default': 'Press Enter to select an upgrade. The tree positions are fixed.' }}><Background color="#514432" gap={32} size={1} /></ReactFlow>}
        <div className="map-summary"><span><b>{visible.owned}</b> / {visible.total} visible upgrades owned</span><span>Epoch {profile.epoch} · {profile.showSpoilers ? 'Spoilers shown' : 'Spoilers hidden'}</span><span className="connection-hint">{detail ? 'Dashed: connected from · Solid: leads to' : layoutMode === 'web' ? 'Prerequisite → upgrade · Select to trace connections' : 'Game positions · Select to trace connections'}</span></div>
        <div className="camera-controls"><button aria-label="Zoom out" onClick={() => { void flow.zoomOut({ duration: reducedMotion ? 0 : 150 }) }}>−</button><button aria-label="Zoom in" onClick={() => { void flow.zoomIn({ duration: reducedMotion ? 0 : 150 }) }}>+</button><button onClick={() => center(catalog.startId)}>Return to start</button><button aria-label="Map navigation" aria-expanded={navigationOpen} aria-controls="pan-controls" onClick={() => setNavigationOpen(!navigationOpen)}>↔</button></div>
        {navigationOpen && <div className="pan-controls" id="pan-controls" aria-label="Map navigation controls"><button aria-label="Pan map left" onClick={() => { const v = flow.getViewport(); void flow.setViewport({ ...v, x: v.x + 180 }) }}>←</button><button aria-label="Pan map right" onClick={() => { const v = flow.getViewport(); void flow.setViewport({ ...v, x: v.x - 180 }) }}>→</button><button aria-label="Pan map up" onClick={() => { const v = flow.getViewport(); void flow.setViewport({ ...v, y: v.y + 180 }) }}>↑</button><button aria-label="Pan map down" onClick={() => { const v = flow.getViewport(); void flow.setViewport({ ...v, y: v.y - 180 }) }}>↓</button></div>}
      </section>
      {detail && <aside className={`details ${detailExpanded ? 'expanded' : ''}`} aria-label="Upgrade details"><div className="detail-heading"><div className="detail-identity"><Icon node={detail} /><div><h2>{detail.title}</h2><small className="detail-cost">{cost(detail.cost)} SP</small></div></div><div className="detail-tools"><button className="detail-toggle" aria-expanded={detailExpanded} aria-controls="detail-content" onClick={() => setDetailExpanded(!detailExpanded)}>{detailExpanded ? 'Hide details' : 'Show details'}</button><button aria-label="Close upgrade details" onClick={() => setSelected(null)}>×</button></div></div><p className={`state-label ${state(detail)}`}>{state(detail) === 'pending' ? '◷ Owned · awaiting activation' : state(detail) === 'purchased' ? '✓ Purchased and active' : state(detail) === 'locked' ? '◇ Locked' : '+ Available'}</p><div className="detail-content" id="detail-content"><p className="detail-description">{detail.description}</p><dl><dt>Purchase requirements</dt><dd>{label(detail.purchase)}</dd><dt>Reveal requirements</dt><dd>{label(detail.reveal)}</dd><dt>Ultra Ascension</dt><dd>{detail.retention === 'repeat' ? 'Repeat purchase · clears on reset' : 'Ownership retained'}{detail.activation === 'after-ultra-ascension' ? ' · Astral lock' : ''}</dd></dl>
        <div className="connection-list"><section aria-label="Connected from"><h3>Connected from</h3>{incoming.length ? incoming.map((node) => <button key={node.id} onClick={() => center(node.id)}><Icon node={node} /><span>{node.title}</span><span aria-hidden="true">←</span></button>) : <p>No visible incoming connections.</p>}</section><section aria-label="Leads to"><h3>Leads to</h3>{outgoing.length ? outgoing.map((node) => <button key={node.id} onClick={() => center(node.id)}><Icon node={node} /><span>{node.title}</span><span aria-hidden="true">→</span></button>) : <p>No visible outgoing connections.</p>}</section><small>Connections show paths. Purchase requirements above specify AND / OR and activation gates.</small></div>
        <div className="source-notes"><h3>Sources</h3>{detail.sources.map((source, i) => <p key={i}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a> : source.label}{source.evidence && <small>{source.evidence}</small>}</p>)}</div></div>
        <div className="detail-actions">
        {profile.purchases[detail.id] ? <button className="danger full" onClick={() => previewRemoval(detail.id)}>Remove purchase…</button> : visible.grants.has(detail.id) ? <p>Granted permanently by an active upgrade.</p> : <button className="primary full" onClick={() => { setChoices({}); setPurchaseTarget(detail.id) }}>Record purchase…</button>}
        {profile.purchases[detail.id] && detail.activation === 'after-ultra-ascension' && !profile.purchases[detail.id].active && <button className="full" onClick={() => setPreview({ title: 'Record an activated Astral?', text: 'Use this when entering existing game progress where this Astral lock is already activated.', profile: { ...profile, purchases: { ...profile.purchases, [detail.id]: { ...profile.purchases[detail.id], active: true } } } })}>Already activated…</button>}
        </div></aside>}
    </div>
    <footer><span>Unofficial companion · Progress stays on this device</span><button disabled={!history.length} onClick={() => { const previous = history.at(-1)!; setProfile(previous); setHistory(history.slice(0, -1)); persist(previous); setMessage('Progress change undone.') }}>Undo</button><button onClick={() => setMenu('about')}>About & sources</button></footer>
    <p className="sr-only" role="status">{message}</p>{message && toastVisible && <div className="toast" onClick={() => setMessage('')}>{message}<button aria-label="Dismiss status" onClick={() => setMessage('')}>×</button></div>}
    <input className="sr-only" aria-label="Map progress JSON backup" ref={fileInput} type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restore(file); event.target.value = '' }} />
    <input className="sr-only" aria-label="Idle Slayer game save" ref={gameFileInput} type="file" accept=".sav" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void readGameSave(file) }} />
    {menu === 'game-import' && <Dialog title="Import game progress" close={closeGameImport}>{gameImport ? <GameSaveImportPanel catalog={catalog} currentProfile={gameImport.original} preview={gameImport.result} onApply={applyGameImport} onCancel={closeGameImport} /> : <div className="game-save-picker">{gameImportLoading ? <p role="status">Reading game save…</p> : <><p role="alert">{gameImportError}</p><p>Choose <b>savedata.sav</b> or <b>backup.sav</b> from Idle Slayer 7.2.0 on Steam. The selected file is read locally in your browser.</p><p className="game-save-path">%USERPROFILE%\AppData\LocalLow\Pablo Leban\Idle Slayer\</p></>}<div className="dialog-actions">{!gameImportLoading && <button className="primary" onClick={() => gameFileInput.current?.click()}>Choose game save…</button>}<button onClick={closeGameImport}>Cancel</button></div></div>}</Dialog>}
    {menu === 'recommendations' && <Dialog title="Suggested next upgrade" close={() => setMenu(null)}><RecommendationPanel catalog={catalog} recommendations={recommendations} onSelect={(id) => selectSuggestion(id)} onPurchase={(id) => selectSuggestion(id, true)} /></Dialog>}
    {menu === 'options' && <Dialog title="Map options" close={() => setMenu(null)}><div className="map-options"><p><b>{visible.owned} / {visible.total}</b> visible upgrades owned · Epoch {profile.epoch}<br />{profile.showSpoilers ? 'Spoilers shown' : 'Spoilers hidden'}</p><label className="spoiler-control"><input type="checkbox" checked={profile.showSpoilers} onChange={(event) => change({ ...profile, showSpoilers: event.target.checked }, event.target.checked ? 'Spoilers shown.' : 'Spoilers hidden.')} />Show spoilers</label><button onClick={() => setMenu('milestones')}>Milestones</button><button onClick={() => setMenu('progress')}>Progress</button><button disabled={!history.length} onClick={() => { const previous = history.at(-1)!; setProfile(previous); setHistory(history.slice(0, -1)); persist(previous); setMessage('Progress change undone.'); setMenu(null) }}>Undo</button><button onClick={() => setMenu('about')}>About & sources</button><small>Unofficial companion · Progress stays on this device</small></div></Dialog>}
    {menu === 'milestones' && <Dialog title="Milestones" close={() => setMenu(null)}><p>Record the required item received or purchased in the game.</p>{visible.milestones.map((item) => <label className="milestone" key={item.id}><input type="checkbox" checked={profile.milestones[item.id] === true} onChange={(event) => { if (event.target.checked) change({ ...profile, milestones: { ...profile.milestones, [item.id]: true } }, 'Milestone recorded.'); else { setMenu(null); previewRemoval(item.id, true) } }} /><span>{item.title}<small>{item.description}</small></span></label>)}{!visible.milestones.length && <p>No milestone controls are currently revealed.</p>}</Dialog>}
    {menu === 'progress' && <Dialog title="Your progress" close={() => setMenu(null)}><p>One local profile. Keep a backup when changing browsers or devices.</p><div className="progress-actions"><button data-game-import-trigger disabled={!loaded} onClick={() => gameFileInput.current?.click()}>Import game save…</button><small>Steam 7.2.0 · Choose savedata.sav or backup.sav. A local preview appears before map progress changes.<code className="game-save-path">%USERPROFILE%\AppData\LocalLow\Pablo Leban\Idle Slayer\</code></small><button onClick={backup}>Export JSON backup</button><button onClick={() => fileInput.current?.click()}>Restore JSON backup…</button><button onClick={ultra}>Ultra Ascend…</button><label>Previous Ultra Ascensions<input type="number" min="0" max="1000000" defaultValue={profile.epoch} onBlur={(event) => { const epoch = Number(event.target.value); if (Number.isInteger(epoch) && epoch >= profile.epoch && epoch <= 1000000 && epoch !== profile.epoch) change({ ...profile, epoch, purchases: Object.fromEntries(Object.entries(profile.purchases).map(([id, purchase]) => [id, purchase.epoch === profile.epoch && index.has(id) ? { ...purchase, epoch } : purchase])) }, 'Previous Ultra Ascensions recorded.'); else event.target.value = String(profile.epoch) }} /></label><button className="danger" onClick={() => { setMenu(null); setPreview({ title: 'Clear all progress?', text: 'Clear every purchase, milestone and unknown ID, and return to epoch 0 with spoilers hidden. You can undo this change in this session.', profile: emptyProfile(catalog.revision), replaceStorage: true }) }}>Clear all progress…</button></div></Dialog>}
    {menu === 'about' && <Dialog title="About this map" close={() => setMenu(null)}><p>Unofficial Idle Slayer companion. Game assets belong to their respective rights holders. Application code and asset attribution are documented separately.</p><p>Game {catalog.gameVersion} · Steam build {catalog.steamBuild}<br />Catalog {catalog.revision}</p><p>All map data and icons are bundled locally. No account, backend or analytics.</p><a href="https://github.com/AustinGarrod/idle-slayer-ascension-map">Source and extraction documentation</a></Dialog>}
    {purchasePlan && purchaseTarget && <Dialog title={purchasePlan.kind === 'choice' ? 'Choose a prerequisite path' : purchasePlan.kind === 'blocked' ? 'Explicit progress required' : 'Record purchase?'} close={() => setPurchaseTarget(null)}>{purchasePlan.kind === 'choice' ? <><p>This OR requirement has no satisfied path. Choose before any progress changes.</p>{purchasePlan.options.map((option, i) => <button className="full" key={i} onClick={() => setChoices({ ...choices, [purchasePlan.key]: i })}>{label(option)}</button>)}</> : purchasePlan.kind === 'blocked' ? <><p>{label(purchasePlan.requirement)}</p><p>{purchasePlan.reason}</p><button onClick={() => setPurchaseTarget(null)}>Close</button></> : <><p>Record {purchasePlan.added.length} purchase{purchasePlan.added.length === 1 ? '' : 's'}, including missing prerequisites.</p><ul>{purchasePlan.added.filter((id) => visible.ids.has(id)).map((id) => <li key={id}>{index.get(id)?.title}</li>)}</ul><button className="primary" onClick={() => { change(purchasePlan.profile, 'Purchase recorded.'); setPurchaseTarget(null) }}>Apply purchases</button><button onClick={() => setPurchaseTarget(null)}>Cancel</button></>}</Dialog>}
    {preview && <Dialog title={preview.title} close={() => setPreview(null)}><p>{preview.text}</p>{preview.changes && <ul>{preview.changes.filter((id) => visible.ids.has(id)).map((id) => <li key={id}>{index.get(id)?.title}</li>)}</ul>}{preview.groups?.map((group) => <section key={group.label}><h3>{group.label} ({group.ids.length})</h3><ul>{group.ids.filter((id) => visible.ids.has(id)).map((id) => <li key={id}>{index.get(id)?.title}</li>)}</ul></section>)}<div className="dialog-actions"><button className="primary" onClick={() => { change(preview.profile, 'Progress updated.', preview.replaceStorage); setPreview(null) }}>Apply changes</button><button onClick={() => setPreview(null)}>Cancel</button></div></Dialog>}
  </main>
}

export default function MapApp({ catalog }: { catalog: Catalog }) {
  return <ReactFlowProvider><Atlas catalog={catalog} /></ReactFlowProvider>
}
