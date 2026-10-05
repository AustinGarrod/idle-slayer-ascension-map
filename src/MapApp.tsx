import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Background, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import '@fontsource/press-start-2p/latin-400.css'
import type { Catalog, Profile, Requirement, Upgrade } from './domain/types'
import { emptyProfile } from './domain/types'
import { planPurchase, planRemoval, planUltraAscension, satisfies, searchVisible, visibility } from './domain/rules'
import { exportProfileBackup, loadProfile, parseProfileBackup, saveProfile } from './domain/storage'

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
const cost = (value: string) => BigInt(value).toLocaleString('en')

function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
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
  const [menu, setMenu] = useState<'progress' | 'milestones' | 'about' | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [purchaseTarget, setPurchaseTarget] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<string, number>>({})
  const [message, setMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const mapElement = useRef<HTMLElement>(null)
  const flow = useReactFlow<UpgradeNode>()
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const visible = useMemo(() => visibility(catalog, profile), [catalog, profile])
  const index = useMemo(() => new Map(catalog.upgrades.map((node) => [node.id, node])), [catalog])
  const detail = selected && visible.ids.has(selected) ? index.get(selected) : undefined
  const results = useMemo(() => searchVisible(catalog, profile, query), [catalog, profile, query])
  const purchasePlan = purchaseTarget ? planPurchase(catalog, profile, purchaseTarget, choices) : null
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
  function center(id: string) {
    const node = index.get(id)
    if (!node || !visible.ids.has(id)) return
    setSelected(id); setSearchOpen(false)
    // Let React Flow measure the resized canvas, then account for the mobile sheet.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const map = mapElement.current?.getBoundingClientRect()
      const sheet = mapElement.current?.parentElement?.querySelector('.details')?.getBoundingClientRect()
      const overlap = window.innerWidth <= 960 && map && sheet ? Math.max(0, map.bottom - sheet.top) : 0
      void flow.setCenter(node.position.x, node.position.y + overlap / 2, { zoom: 1, duration: reducedMotion ? 0 : 220 })
    }))
  }
  const state = (node: Upgrade) => satisfies({ kind: 'owned', id: node.id }, profile)
    ? satisfies({ kind: 'active', id: node.id }, profile) ? 'purchased' : 'pending'
    : satisfies(node.purchase, profile) ? 'available' : 'locked'
  const nodes: UpgradeNode[] = visible.upgrades.map((node) => ({ id: node.id, type: 'upgrade', position: node.position,
    data: { upgrade: node, state: state(node) }, selected: selected === node.id,
    ariaLabel: `${node.title}, ${state(node)}, ${cost(node.cost)} Slayer Points`, width: 132, height: 122 }))
  const edges = visible.connections.map((edge) => {
    const from = index.get(edge.from)!, to = index.get(edge.to)!
    const dx = to.position.x - from.position.x, dy = to.position.y - from.position.y
    const horizontal = Math.abs(dx) > Math.abs(dy)
    const sourceHandle = horizontal ? dx > 0 ? 'right-out' : 'left-out' : dy > 0 ? 'bottom-out' : 'top-out'
    const targetHandle = horizontal ? dx > 0 ? 'left-in' : 'right-in' : dy > 0 ? 'top-in' : 'bottom-in'
    return { id: `${edge.from}:${edge.to}`, source: edge.from, target: edge.to, sourceHandle, targetHandle, type: 'straight', focusable: false }
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
  const verified = Object.entries(catalog.verification).filter(([key]) => key !== 'evidence').every(([, value]) => value === true)
  return <main className="atlas">
    <header className="toolbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true">✦</span><div><h1>Ascension Map</h1><p>Idle Slayer · {catalog.gameVersion}</p></div></div>
      <div className="search-box"><label className="sr-only" htmlFor="search">Search visible upgrade titles</label><span aria-hidden="true">⌕</span><input id="search" type="search" autoComplete="off" placeholder="Find an upgrade…" value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true) }} onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); if (event.key === 'Enter' && results[0]) center(results[0].id) }} />
        {searchOpen && <div className="search-results" aria-label="Visible upgrade results"><div className="results-heading"><span>{results.length} visible results</span><button onClick={() => setSearchOpen(false)} aria-label="Close search results">×</button></div>{results.slice(0, 40).map((node) => <button className="search-result" key={node.id} onClick={() => center(node.id)}><Icon node={node} /><span>{node.title}<small>{cost(node.cost)} SP</small></span></button>)}{results.length > 40 && <p>Refine your search to see more results.</p>}{results.length === 0 && <p>No visible upgrades match.</p>}</div>}
      </div>
      <label className="spoiler-control"><input type="checkbox" checked={profile.showSpoilers} onChange={(event) => change({ ...profile, showSpoilers: event.target.checked }, event.target.checked ? 'Spoilers shown.' : 'Spoilers hidden.')} />Show spoilers</label>
      <button onClick={() => setMenu('milestones')}>Milestones</button><button onClick={() => setMenu('progress')}>Progress</button>
    </header>
    {storageError && <div className="notice" role="alert">{storageError} <button onClick={retryStorage}>{storageWritable ? 'Retry saving' : 'Retry recovery'}</button><button onClick={backup}>Export backup</button></div>}
    {!verified && <div className="notice">Local preview · Catalog verification is incomplete. Publication is gated.</div>}
    <div className={`workspace ${detail ? 'has-details' : ''}`}>
      <section ref={mapElement} className="map" aria-label="Ascension tree">
        {loaded && <ReactFlow<UpgradeNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} nodeOrigin={[0.5, 0.5]} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} selectionKeyCode={null} multiSelectionKeyCode={null} minZoom={0.15} maxZoom={2.5} defaultViewport={{ x: 0, y: 0, zoom: 0.7 }} onInit={(instance) => { const start = index.get(catalog.startId); if (start) void instance.setCenter(start.position.x, start.position.y, { zoom: 0.85 }) }} onNodesChange={(changes) => { const selection = changes.find((entry) => entry.type === 'select' && entry.selected); if (selection?.type === 'select' && selection.id !== selected) center(selection.id); else if (changes.some((entry) => entry.type === 'select' && !entry.selected && entry.id === selected)) setSelected(null) }} onNodeClick={(_, node) => center(node.id)} onPaneClick={() => setSearchOpen(false)} ariaLabelConfig={{ 'node.a11yDescription.default': 'Press Enter to select an upgrade. The tree positions are fixed.' }}><Background color="#514432" gap={32} size={1} /></ReactFlow>}
        <div className="map-summary"><span><b>{visible.owned}</b> / {visible.total} visible upgrades owned</span><span>Epoch {profile.epoch} · {profile.showSpoilers ? 'Spoilers shown' : 'Spoilers hidden'}</span></div>
        <div className="camera-controls"><button aria-label="Zoom out" onClick={() => { void flow.zoomOut({ duration: reducedMotion ? 0 : 150 }) }}>−</button><button aria-label="Zoom in" onClick={() => { void flow.zoomIn({ duration: reducedMotion ? 0 : 150 }) }}>+</button><button onClick={() => center(catalog.startId)}>Return to start</button><button aria-label="Pan map left" onClick={() => { const v = flow.getViewport(); void flow.setViewport({ ...v, x: v.x + 180 }) }}>←</button><button aria-label="Pan map right" onClick={() => { const v = flow.getViewport(); void flow.setViewport({ ...v, x: v.x - 180 }) }}>→</button><button aria-label="Pan map up" onClick={() => { const v = flow.getViewport(); void flow.setViewport({ ...v, y: v.y + 180 }) }}>↑</button><button aria-label="Pan map down" onClick={() => { const v = flow.getViewport(); void flow.setViewport({ ...v, y: v.y - 180 }) }}>↓</button></div>
      </section>
      {detail && <aside className="details" aria-label="Upgrade details"><div className="detail-heading"><p className="eyebrow">Upgrade details</p><button aria-label="Close upgrade details" onClick={() => setSelected(null)}>×</button></div><div className="detail-identity"><Icon node={detail} /><h2>{detail.title}</h2></div><p className={`state-label ${state(detail)}`}>{state(detail) === 'pending' ? '◷ Owned · awaiting activation' : state(detail) === 'purchased' ? '✓ Purchased and active' : state(detail) === 'locked' ? '◇ Locked' : '+ Available'}</p><p className="detail-description">{detail.description}</p><dl><dt>Cost</dt><dd>{cost(detail.cost)} <span>Slayer Points</span></dd><dt>Purchase requirements</dt><dd>{label(detail.purchase)}</dd><dt>Reveal requirements</dt><dd>{label(detail.reveal)}</dd><dt>Ultra Ascension</dt><dd>{detail.retention === 'repeat' ? 'Repeat purchase · clears on reset' : 'Ownership retained'}{detail.activation === 'after-ultra-ascension' ? ' · Astral lock' : ''}</dd></dl>
        {profile.purchases[detail.id] ? <button className="danger full" onClick={() => previewRemoval(detail.id)}>Remove purchase…</button> : visible.grants.has(detail.id) ? <p>Granted permanently by an active upgrade.</p> : <button className="primary full" onClick={() => { setChoices({}); setPurchaseTarget(detail.id) }}>Record purchase…</button>}
        {profile.purchases[detail.id] && detail.activation === 'after-ultra-ascension' && !profile.purchases[detail.id].active && <button className="full" onClick={() => setPreview({ title: 'Record an activated Astral?', text: 'Use this when entering existing game progress where this Astral lock is already activated.', profile: { ...profile, purchases: { ...profile.purchases, [detail.id]: { ...profile.purchases[detail.id], active: true } } } })}>Already activated…</button>}
        <div className="source-notes"><h3>Sources</h3>{detail.sources.map((source, i) => <p key={i}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a> : source.label}{source.evidence && <small>{source.evidence}</small>}</p>)}</div></aside>}
    </div>
    <footer><span>Unofficial companion · Progress stays on this device</span><button disabled={!history.length} onClick={() => { const previous = history.at(-1)!; setProfile(previous); setHistory(history.slice(0, -1)); persist(previous); setMessage('Progress change undone.') }}>Undo</button><button onClick={() => setMenu('about')}>About & sources</button></footer>
    <p className="sr-only" role="status">{message}</p>{message && <div className="toast" onClick={() => setMessage('')}>{message}<button aria-label="Dismiss status" onClick={() => setMessage('')}>×</button></div>}
    <input className="sr-only" ref={fileInput} type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restore(file); event.target.value = '' }} />
    {menu === 'milestones' && <Dialog title="Milestones" close={() => setMenu(null)}><p>Record the required item received or purchased in the game.</p>{visible.milestones.map((item) => <label className="milestone" key={item.id}><input type="checkbox" checked={profile.milestones[item.id] === true} onChange={(event) => { if (event.target.checked) change({ ...profile, milestones: { ...profile.milestones, [item.id]: true } }, 'Milestone recorded.'); else { setMenu(null); previewRemoval(item.id, true) } }} /><span>{item.title}<small>{item.description}</small></span></label>)}{!visible.milestones.length && <p>No milestone controls are currently revealed.</p>}</Dialog>}
    {menu === 'progress' && <Dialog title="Your progress" close={() => setMenu(null)}><p>One local profile. Keep a backup when changing browsers or devices.</p><div className="progress-actions"><button onClick={backup}>Export JSON backup</button><button onClick={() => fileInput.current?.click()}>Restore JSON backup…</button><button onClick={ultra}>Ultra Ascend…</button><label>Previous Ultra Ascensions<input type="number" min="0" max="1000000" defaultValue={profile.epoch} onBlur={(event) => { const epoch = Number(event.target.value); if (Number.isInteger(epoch) && epoch >= profile.epoch && epoch <= 1000000 && epoch !== profile.epoch) change({ ...profile, epoch, purchases: Object.fromEntries(Object.entries(profile.purchases).map(([id, purchase]) => [id, purchase.epoch === profile.epoch && index.has(id) ? { ...purchase, epoch } : purchase])) }, 'Previous Ultra Ascensions recorded.'); else event.target.value = String(profile.epoch) }} /></label><button className="danger" onClick={() => { setMenu(null); setPreview({ title: 'Clear all progress?', text: 'Clear every purchase, milestone and unknown ID, and return to epoch 0 with spoilers hidden. You can undo this change in this session.', profile: emptyProfile(catalog.revision), replaceStorage: true }) }}>Clear all progress…</button></div></Dialog>}
    {menu === 'about' && <Dialog title="About this map" close={() => setMenu(null)}><p>Unofficial Idle Slayer companion. Game assets belong to their respective rights holders. Application code and asset attribution are documented separately.</p><p>Game {catalog.gameVersion} · Steam build {catalog.steamBuild}<br />Catalog {catalog.revision}</p><p>All map data and icons are bundled locally. No account, backend or analytics.</p><a href="https://github.com/AustinGarrod/idle-slayer-ascension-map">Source and extraction documentation</a></Dialog>}
    {purchasePlan && purchaseTarget && <Dialog title={purchasePlan.kind === 'choice' ? 'Choose a prerequisite path' : purchasePlan.kind === 'blocked' ? 'Explicit progress required' : 'Record purchase?'} close={() => setPurchaseTarget(null)}>{purchasePlan.kind === 'choice' ? <><p>This OR requirement has no satisfied path. Choose before any progress changes.</p>{purchasePlan.options.map((option, i) => <button className="full" key={i} onClick={() => setChoices({ ...choices, [purchasePlan.key]: i })}>{label(option)}</button>)}</> : purchasePlan.kind === 'blocked' ? <><p>{label(purchasePlan.requirement)}</p><p>{purchasePlan.reason}</p><button onClick={() => setPurchaseTarget(null)}>Close</button></> : <><p>Record {purchasePlan.added.length} purchase{purchasePlan.added.length === 1 ? '' : 's'}, including missing prerequisites.</p><ul>{purchasePlan.added.filter((id) => visible.ids.has(id)).map((id) => <li key={id}>{index.get(id)?.title}</li>)}</ul><button className="primary" onClick={() => { change(purchasePlan.profile, 'Purchase recorded.'); setPurchaseTarget(null) }}>Apply purchases</button><button onClick={() => setPurchaseTarget(null)}>Cancel</button></>}</Dialog>}
    {preview && <Dialog title={preview.title} close={() => setPreview(null)}><p>{preview.text}</p>{preview.changes && <ul>{preview.changes.filter((id) => visible.ids.has(id)).map((id) => <li key={id}>{index.get(id)?.title}</li>)}</ul>}{preview.groups?.map((group) => <section key={group.label}><h3>{group.label} ({group.ids.length})</h3><ul>{group.ids.filter((id) => visible.ids.has(id)).map((id) => <li key={id}>{index.get(id)?.title}</li>)}</ul></section>)}<div className="dialog-actions"><button className="primary" onClick={() => { change(preview.profile, 'Progress updated.', preview.replaceStorage); setPreview(null) }}>Apply changes</button><button onClick={() => setPreview(null)}>Cancel</button></div></Dialog>}
  </main>
}

export default function MapApp({ catalog }: { catalog: Catalog }) {
  return <ReactFlowProvider><Atlas catalog={catalog} /></ReactFlowProvider>
}
