import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Background, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import '@fontsource/press-start-2p/latin-400.css'
import type { Catalog, Profile, Requirement, Upgrade } from './domain/types'
import { emptyProfile } from './domain/types'
import { planAstralActivation, planPurchase, planRemoval, planUltraAscension, satisfies, searchVisible, visibility } from './domain/rules'
import { exportProfileBackup, parseProfileBackup, PROFILE_STORAGE_KEY } from './domain/storage'
import { createProfileSession, type StoredSnapshot } from './domain/profile-session'
import { createMapLayout, GAME_NODE_SIZE, MAP_NODE_HEIGHT, MAP_NODE_WIDTH } from './domain/map-layout'
import { DependencyEdge } from './DependencyEdge'
import { NativeEdge } from './NativeEdge'
import { loadLayoutPreference, saveLayoutPreference } from './domain/layout-preference'
import { recommendUpgrades } from './domain/recommendations'
import { schemaVersion, source as wikiSource, rows as wikiRows } from './data/wiki-priorities.json'
import { RecommendationPanel } from './RecommendationPanel'
import { importGameSave } from './domain/game-save-import'
import type { GameSaveImportPreview } from './domain/game-save-import'
import { MAX_GAME_SAVE_BYTES } from './domain/save-codec'
import { GameSaveImportPanel } from './GameSaveImportPanel'
import { getTrackingStatus, setTrackingPreference, trackEvent, updateAnalyticsContext } from './analytics'
import type { AnalyticsOperation } from './analytics'
import { PrivacyPanel, trackingDisclosure } from './PrivacyPanel'

type UpgradeNode = Node<{ upgrade: Upgrade; state: string }, 'upgrade'>
type Preview = { operation: AnalyticsOperation; title: string; text: string; profile: Profile; changes?: string[]; groups?: { label: string; ids: string[] }[]; replaceStorage?: boolean; upgradeId?: string; milestoneId?: string; sessionVersion?: number; resolution?: 'saved' | 'local' }
type Menu = 'options' | 'progress' | 'milestones' | 'about' | 'recommendations' | 'game-import' | 'privacy' | null
type SelectionSource = 'map' | 'search' | 'neighbor' | 'recommendation' | 'start' | 'keyboard'

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
const edgeTypes = { dependency: DependencyEdge, native: NativeEdge }
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
  const profileSession = useMemo(() => createProfileSession({ revision: catalog.revision, storage: () => window.localStorage, locks: () => window.navigator.locks }), [catalog.revision])
  const [profile, setProfile] = useState(() => emptyProfile(catalog.revision))
  const [loaded, setLoaded] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [storageWritable, setStorageWritable] = useState(false)
  const [history, setHistory] = useState<Profile[]>([])
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<StoredSnapshot | null>(null)
  const [conflictReview, setConflictReview] = useState<{ version: number; snapshot: StoredSnapshot } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [menu, setMenuState] = useState<Menu>(null)
  const [gameImport, setGameImport] = useState<{ result: GameSaveImportPreview; original: Profile } | null>(null)
  const [gameImportError, setGameImportError] = useState('')
  const [gameImportLoading, setGameImportLoading] = useState(false)
  const gameImportRequest = useRef(0)
  const restoreRequest = useRef(0)
  const trackingChangeRequest = useRef(0)
  const currentProfile = useRef(profile)
  currentProfile.current = profile
  const [layoutMode, setLayoutMode] = useState(() => loadLayoutPreference(() => window.localStorage))
  const [detailExpanded, setDetailExpanded] = useState(false)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [preview, setPreviewState] = useState<Preview | null>(null)
  const [trackingReload, setTrackingReload] = useState<boolean | null>(null)
  const [purchaseTarget, setPurchaseTarget] = useState<string | null>(null)
  const purchaseSource = useRef<'details' | 'recommendation'>('details')
  const purchaseEventKey = useRef('')
  const lastSelection = useRef<string | null>(null)
  const keyboardSelection = useRef(false)
  const cameraStart = useRef<{ x: number; y: number; zoom: number } | null>(null)
  const cameraRequest = useRef(0)
  const recenterOnMapResize = useRef(true)
  const appReadyReported = useRef(false)
  const storageLoadReported = useRef(false)
  const [choices, setChoices] = useState<Record<string, number>>({})
  const [message, updateMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef<number | undefined>(undefined)
  const fileInput = useRef<HTMLInputElement>(null)
  const gameFileInput = useRef<HTMLInputElement>(null)
  const mapElement = useRef<HTMLElement>(null)
  const detailsElement = useRef<HTMLElement>(null)
  const flow = useReactFlow<UpgradeNode>()
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const visible = useMemo(() => visibility(catalog, profile), [catalog, profile])
  const index = useMemo(() => new Map(catalog.upgrades.map((node) => [node.id, node])), [catalog])
  const detail = selected && visible.ids.has(selected) ? index.get(selected) : undefined
  useLayoutEffect(() => {
    if (detailsElement.current) detailsElement.current.scrollTop = 0
  }, [detail?.id])
  const visibleGraphKey = JSON.stringify([visible.upgrades.map((node) => node.id), visible.connections])
  const layout = useMemo(() => createMapLayout({ mode: layoutMode, upgrades: visible.upgrades, connections: visible.connections }), [catalog, layoutMode, visibleGraphKey])
  const incoming = visible.connections.filter((edge) => edge.to === detail?.id).map((edge) => index.get(edge.from)!)
  const outgoing = visible.connections.filter((edge) => edge.from === detail?.id).map((edge) => index.get(edge.to)!)
  const related = new Set([...incoming, ...outgoing].map((node) => node.id))
  const results = useMemo(() => searchVisible(catalog, profile, query), [catalog, profile, query])
  const purchasePlan = purchaseTarget ? planPurchase(catalog, profile, purchaseTarget, choices) : null
  const recommendations = useMemo(() => recommendUpgrades(catalog, profile, wikiPriorities), [catalog, profile])
  useEffect(() => {
    updateAnalyticsContext({ catalog_version: catalog.gameVersion, catalog_revision: catalog.revision,
      layout: layoutMode === 'native' ? 'game' : 'web', spoilers: profile.showSpoilers,
      visibleUpgradeIds: visible.ids, visibleMilestoneIds: new Set(visible.milestones.map((item) => item.id)) })
    if (loaded && !appReadyReported.current) { appReadyReported.current = true; trackEvent('app_ready') }
  }, [catalog, layoutMode, loaded, profile.showSpoilers, visible])
  useEffect(() => {
    if (!query.trim()) return
    const timer = window.setTimeout(() => trackEvent('search_performed', {
      query_length: query.length <= 3 ? '1-3' : query.length <= 10 ? '4-10' : query.length <= 30 ? '11-30' : '31+',
      results: results.length === 0 ? '0' : results.length <= 5 ? '1-5' : results.length <= 20 ? '6-20' : '21+',
    }), 500)
    return () => window.clearTimeout(timer)
  }, [query, results])
  useEffect(() => {
    if (!purchasePlan || !purchaseTarget) { purchaseEventKey.current = ''; return }
    const key = `${purchaseTarget}:${purchasePlan.kind}`
    if (purchaseEventKey.current === key) return
    purchaseEventKey.current = key
    if (purchasePlan.kind === 'ready') trackEvent('purchase_previewed', { upgrade_id: purchaseTarget, source: purchaseSource.current })
    else if (purchasePlan.kind === 'blocked') trackEvent('purchase_blocked', {
      upgrade_id: purchaseTarget, source: purchaseSource.current,
      reason: purchasePlan.requirement.kind === 'milestone' ? 'milestone' : purchasePlan.requirement.kind === 'active' ? 'pending' : 'reveal',
    })
  }, [purchasePlan, purchaseTarget])
  function setMenu(next: Menu) {
    if (next === menu) return
    if (menu === 'progress') restoreRequest.current++
    if (menu === 'privacy' && next !== 'privacy') trackingChangeRequest.current++
    if (menu) trackEvent('panel_closed', { panel: menu })
    if (next) trackEvent('panel_opened', { panel: next })
    if (next === 'recommendations') trackEvent('recommendations_viewed', { reason: recommendations.status === 'fallback' ? 'catalog-fallback' : recommendations.status })
    setMenuState(next)
  }
  function setPreview(next: Preview | null) {
    if (next && profileSession.getState().profile !== profile) { setMessage('Progress changed. Create a fresh preview from the current session.'); return }
    if (next) trackEvent(`${next.operation}_previewed`, { upgrade_id: next.upgradeId, milestone_id: next.milestoneId })
    else if (preview) trackEvent(`${preview.operation}_cancelled`, { upgrade_id: preview.upgradeId, milestone_id: preview.milestoneId })
    setPreviewState(next ? { ...next, sessionVersion: next.sessionVersion ?? profileSession.getState().version } : null)
  }
  function startPurchase(id: string, source: 'details' | 'recommendation' = 'details') {
    if (!visible.ids.has(id)) return
    purchaseSource.current = source; purchaseEventKey.current = ''
    trackEvent('purchase_started', { upgrade_id: id, source })
    if (source === 'recommendation') trackEvent('recommendation_purchase_started', { upgrade_id: id, source })
    setChoices({}); setPurchaseTarget(id)
  }
  function cancelPurchase() {
    if (purchaseTarget) trackEvent('purchase_cancelled', { upgrade_id: purchaseTarget, source: purchaseSource.current })
    setPurchaseTarget(null)
  }
  function selectSuggestion(id: string, purchase = false) {
    const position = recommendations.suggestions.findIndex((suggestion) => suggestion.upgrade.id === id)
    if (position < 0) return
    const suggestion = recommendations.suggestions[position]
    trackEvent('recommendation_selected', { upgrade_id: id, action: purchase ? 'purchase' : 'show', position: position + 1, basis: suggestion.basis === 'fallback' ? 'catalog-fallback' : suggestion.basis })
    setMenu(null); center(id, 'recommendation')
    if (purchase) startPurchase(id, 'recommendation')
  }
  function setMessage(text: string) {
    updateMessage(text); setToastVisible(Boolean(text)); window.clearTimeout(toastTimer.current)
    if (text) toastTimer.current = window.setTimeout(() => setToastVisible(false), 4000)
  }
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])
  useEffect(() => {
    const input = gameFileInput.current
    const cancel = () => trackEvent('game_import_cancelled')
    input?.addEventListener('cancel', cancel)
    return () => input?.removeEventListener('cancel', cancel)
  }, [])
  async function persist(next: Profile): Promise<boolean> {
    if (profileSession.getState().profile !== next) return false
    return profileSession.save()
  }
  function change(next: Profile, announcement: string, replaceStorage = false): boolean {
    if (profileSession.getState().profile !== profile) { setMessage('Progress changed. Try this action again using the current session.'); return false }
    if (!profileSession.apply(next, replaceStorage)) return false
    setMessage(announcement)
    return true
  }
  useEffect(() => {
    let externalVersion = profileSession.getState().externalVersion
    let previousError = ''
    const unsubscribe = profileSession.subscribe((state) => {
      currentProfile.current = state.profile
      setProfile(state.profile); setHistory(state.history); setStorageWritable(state.writable)
      setStorageError(state.error); setSaving(state.pending); setConflict(state.conflict)
      if (state.error && state.error !== previousError) trackEvent('storage_error', { reason: state.errorKind ?? 'unavailable', action: storageLoadReported.current ? 'save' : 'load' })
      else if (!state.error && previousError) trackEvent('storage_recovered', { action: 'save' })
      previousError = state.error
      if (state.externalVersion !== externalVersion) {
        externalVersion = state.externalVersion
        gameImportRequest.current++; restoreRequest.current++; trackingChangeRequest.current++
        setPreviewState(null); setPurchaseTarget(null); setChoices({}); setGameImport(null); setGameImportLoading(false); setGameImportError('')
        setConflictReview(null); setTrackingReload(null); setMenuState(null)
        setMessage(state.conflict ? 'Saved progress changed. This session was kept for recovery.' : 'Progress updated from another tab. Previous previews and undo were cleared.')
      }
    })
    profileSession.initialize()
    storageLoadReported.current = true
    setLoaded(true)
    const storageChanged = (event: StorageEvent) => {
      let local: Storage
      try { local = window.localStorage } catch { profileSession.refreshExternal(); return }
      if (event.storageArea === local && (event.key === null || event.key === PROFILE_STORAGE_KEY)) profileSession.refreshExternal()
    }
    window.addEventListener('storage', storageChanged)
    return () => { window.removeEventListener('storage', storageChanged); unsubscribe(); gameImportRequest.current++; restoreRequest.current++; trackingChangeRequest.current++; profileSession.cancelPending() }
  }, [profileSession])
  function reviewConflict() {
    const current = profileSession.getState()
    if (current.conflict) { setMenu(null); setConflictReview({ version: current.version, snapshot: current.conflict }) }
  }
  function retryStorage() {
    if (profileSession.retry()) reviewConflict()
  }
  useEffect(() => { if (selected && !visible.ids.has(selected)) clearSelection() }, [selected, visible.ids])
  const gameLayout = layoutMode === 'native'
  const nodeWidth = gameLayout ? GAME_NODE_SIZE : MAP_NODE_WIDTH
  const nodeHeight = gameLayout ? GAME_NODE_SIZE : MAP_NODE_HEIGHT
  const startZoom = gameLayout ? 0.6 : 0.85
  const selectionZoom = gameLayout ? 0.85 : 1
  function moveCamera(id: string, zoom = selectionZoom) {
    const position = layout.centers.get(id)
    if (!position) return
    const request = ++cameraRequest.current
    recenterOnMapResize.current = true
    // Docked details resize the canvas. Wait for its new dimensions before centering.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (request !== cameraRequest.current) return
      const map = mapElement.current?.getBoundingClientRect()
      const camera = mapElement.current?.querySelector('.camera-controls')?.getBoundingClientRect()
      let inset = 0
      if (map && camera && camera.right > map.left + map.width / 2 - nodeWidth * zoom / 2) {
        const safeCenter = Math.max(nodeHeight * zoom / 2 + 8,
          Math.min(map.height / 2, camera.top - map.top - nodeHeight * zoom / 2 - 12))
        inset = (map.height / 2 - safeCenter) / zoom
      }
      const duration = reducedMotion ? 0 : 220
      // The expanded phone inspector can resize the DOM before React Flow's
      // container observer updates. Use the actual canvas for Game centering.
      if (gameLayout && map) void flow.setViewport({
        x: map.width / 2 - position.x * zoom,
        y: map.height / 2 - (position.y + inset) * zoom,
        zoom,
      }, { duration })
      else void flow.setCenter(position.x, position.y + inset, { zoom, duration })
    }))
  }
  function center(id: string, source: SelectionSource = 'map') {
    if (!visible.ids.has(id)) return
    if (!selected) setDetailExpanded(false)
    if (lastSelection.current !== id) trackEvent('upgrade_selected', { upgrade_id: id, source })
    lastSelection.current = id
    setSelected(id); setSearchOpen(false); moveCamera(id)
  }
  function clearSelection() { lastSelection.current = null; setSelected(null) }
  function toggleSpoilers(enabled: boolean) {
    if (!change({ ...profile, showSpoilers: enabled }, enabled ? 'Spoilers shown.' : 'Spoilers hidden.')) return
    // Changing visibility must not recenter, including when a hidden selection's
    // inspector closes and resizes the canvas. Cancel pending camera work too.
    cameraRequest.current += 1
    recenterOnMapResize.current = false
    void flow.setViewport(flow.getViewport())
    trackEvent('spoilers_changed', { enabled })
  }
  function changeLayout(mode: 'native' | 'web') {
    if (mode !== layoutMode) trackEvent('map_layout_changed', { layout: mode === 'native' ? 'game' : 'web' })
    setLayoutMode(mode)
    if (!saveLayoutPreference(mode, () => window.localStorage)) setMessage('Layout selected for this visit. Your browser could not save the layout preference.')
  }
  function undo() {
    if (profileSession.undo()) { setMessage('Progress change undone.'); trackEvent('progress_undo') }
  }
  function finishTrackingChange(enabled: boolean) {
    const result = setTrackingPreference(enabled)
    // A fragment-only navigation does not tear down the recorder's listeners.
    window.history.replaceState(window.history.state, '', result.reloadURL)
    window.location.reload()
  }
  async function requestTrackingChange(enabled: boolean) {
    const request = ++trackingChangeRequest.current
    const current = profileSession.getState()
    if (current.pending) { profileSession.cancelPending(); setMenu(null); setTrackingReload(enabled); return }
    const saved = !current.dirty || await persist(current.profile)
    if (request !== trackingChangeRequest.current) return
    if (saved) finishTrackingChange(enabled)
    else { setMenu(null); setTrackingReload(enabled) }
  }
  const recenterCamera = useEffectEvent(() => {
    if (loaded) moveCamera(detail?.id ?? catalog.startId, detail ? selectionZoom : startZoom)
  })
  const resizeMapCamera = useEffectEvent(() => {
    if (gameLayout && recenterOnMapResize.current) recenterCamera()
  })
  useEffect(() => {
    recenterCamera()
  }, [layoutMode, loaded, detailExpanded])
  useEffect(() => {
    const resize = () => recenterCamera()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    if (!loaded || !mapElement.current) return
    // Grid rows can finish resizing after the initial camera frames, including
    // late font metrics. Keep this observer stable across visibility changes;
    // its initial callback must not reset the user's view on each new graph.
    const observer = new ResizeObserver(() => resizeMapCamera())
    observer.observe(mapElement.current)
    return () => observer.disconnect()
  }, [loaded])
  const state = (node: Upgrade) => satisfies({ kind: 'owned', id: node.id }, profile)
    ? satisfies({ kind: 'active', id: node.id }, profile) ? 'purchased' : 'pending'
    : satisfies(node.purchase, profile) ? 'available' : 'locked'
  const nodes: UpgradeNode[] = visible.upgrades.map((node) => ({ id: node.id, type: 'upgrade', position: layout.centers.get(node.id)!,
    data: { upgrade: node, state: state(node) }, selected: selected === node.id,
    className: detail && node.id !== detail.id ? related.has(node.id) ? 'node-related' : 'node-muted' : '',
    ariaLabel: `${node.title}, ${state(node)}, ${cost(node.cost)} Slayer Points`, width: nodeWidth, height: nodeHeight,
    ...(gameLayout ? { zIndex: 2 } : {}) }))
  const edges = visible.connections.map((edge) => {
    const from = layout.centers.get(edge.from)!, to = layout.centers.get(edge.to)!
    const dx = to.x - from.x, dy = to.y - from.y
    const horizontal = Math.abs(dx) > Math.abs(dy)
    const sourceHandle = layoutMode === 'web' ? 'right-out' : horizontal ? dx > 0 ? 'right-out' : 'left-out' : dy > 0 ? 'bottom-out' : 'top-out'
    const targetHandle = layoutMode === 'web' ? 'left-in' : horizontal ? dx > 0 ? 'left-in' : 'right-in' : dy > 0 ? 'top-in' : 'bottom-in'
    const direction = edge.to === detail?.id ? 'incoming' : edge.from === detail?.id ? 'outgoing' : null
    const color = direction === 'incoming' ? '#f1d79b' : gameLayout
      ? direction === 'outgoing' || satisfies({ kind: 'owned', id: edge.from }, profile) ? '#ff00be' : '#7d7d7d'
      : '#b860af'
    return { id: `${edge.from}:${edge.to}`, source: edge.from, target: edge.to, sourceHandle, targetHandle,
      type: gameLayout ? 'native' : 'dependency', focusable: false, selectable: false,
      data: { points: layout.edgePaths.get(`${edge.from}:${edge.to}`) },
      className: detail ? direction ? `connection-${direction}` : 'connection-muted' : '',
      style: { stroke: color, strokeWidth: gameLayout ? direction ? 14 : 12 : direction ? 4 : 2 }, zIndex: direction ? 1 : 0,
      markerEnd: gameLayout && !direction ? undefined : { type: MarkerType.ArrowClosed, markerUnits: 'userSpaceOnUse', width: gameLayout ? 24 : 32, height: gameLayout ? 24 : 32, color } }
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
    setPreview({ operation: milestone ? 'milestone_removal' : 'removal', upgradeId: milestone ? undefined : id, milestoneId: milestone ? id : undefined, title: milestone ? 'Remove milestone?' : 'Remove purchase?', text: `This clears ${result.removed.length} purchase${result.removed.length === 1 ? '' : 's'} that would lose their dependency path. Valid alternate paths and earlier retained ownership stay intact.`, profile: result.profile, changes: result.removed })
  }
  function previewAstralActivation(id: string) {
    const result = planAstralActivation(catalog, profile, id)
    if (result.kind === 'blocked') { setMessage(result.reason); return }
    setPreview({ operation: 'astral_activation', upgradeId: id, title: 'Record an activated Astral?', text: 'Use this when entering existing game progress where this Astral lock already activated in an earlier Ultra Ascension. This Astral receives an earlier-ascension ownership baseline so removing its former prerequisites keeps it. Other purchases keep their recorded history.', profile: result.profile })
  }
  function ultra() {
    const result = planUltraAscension(catalog, profile)
    if (!result) { setMessage(`Ultra Ascension requires: ${label(catalog.ultraAscension)}.`); return }
    setMenu(null)
    setPreview({ operation: 'ultra_ascension', title: 'Ultra Ascend?', text: `Start epoch ${result.profile.epoch}. Clear ${result.cleared.length} repeat purchases, activate ${result.activated.length} Astral locks, and retain ${result.granted.length} purchased grant targets. Keep Astral ownership and milestones.`, profile: result.profile, groups: [{ label: 'Repeat purchases cleared', ids: result.cleared }, { label: 'Astral locks activated', ids: result.activated }, { label: 'Purchased grant targets retained', ids: result.granted }] })
  }
  function backup(): boolean {
    const result = exportProfileBackup(profile)
    if (!result.ok) { setMessage(result.error.message); trackEvent('backup_error', { reason: result.error.kind }); return false }
    const url = URL.createObjectURL(new Blob([result.text], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'idle-slayer-progress.json'; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage('Progress backup exported.')
    trackEvent('backup_download_requested'); return true
  }
  async function restore(file: File) {
    if (menu !== 'progress') return
    const request = ++restoreRequest.current
    if (file.size > 4 * 1024 * 1024) { setMessage('The backup exceeds the 4 MiB limit. Progress was not replaced.'); trackEvent('backup_error', { reason: 'size' }); return }
    let text: string
    try { text = await file.text() } catch { if (request !== restoreRequest.current) return; setMessage('The backup could not be read. Progress was not replaced.'); trackEvent('backup_error', { reason: 'read' }); return }
    if (request !== restoreRequest.current) return
    const result = parseProfileBackup(text)
    if (!result.ok) { setMessage(result.error.message); trackEvent('backup_error', { reason: result.error.kind }); return }
    setMenu(null)
    setPreview({ operation: 'restore', title: 'Restore progress?', text: `Replace this profile and its stored data with ${Object.keys(result.profile.purchases).length} recorded purchases and ${Object.keys(result.profile.milestones).length} milestones, in epoch ${result.profile.epoch}. Unknown IDs are retained. Undo remains available.`, profile: { ...result.profile, catalogRevision: catalog.revision }, replaceStorage: true })
  }
  function chooseGameSave() { restoreRequest.current++; trackEvent('game_import_started'); gameFileInput.current?.click() }
  function closeGameImport() {
    trackEvent('game_import_cancelled')
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
      trackEvent('game_import_error', { reason: file.size > MAX_GAME_SAVE_BYTES ? 'size' : 'read' })
      return
    }
    if (request !== gameImportRequest.current) return
    const original = currentProfile.current
    const result = importGameSave(catalog, original, bytes)
    setGameImportLoading(false)
    if (!result.ok) { setGameImportError(result.error); trackEvent('game_import_error', { reason: 'validation' }); return }
    setGameImport({ result, original })
    trackEvent('game_import_previewed')
  }
  function applyGameImport() {
    if (!gameImport) return
    if (currentProfile.current !== gameImport.original) {
      setGameImport(null); setGameImportError('Map progress changed while reviewing this import. Choose the save again to create a fresh preview.')
      trackEvent('game_import_error', { reason: 'stale' })
      return
    }
    if (!change(gameImport.result.profile, 'Game progress imported. Undo is available.', true)) return
    trackEvent('game_import_applied')
    gameImportRequest.current++; setGameImport(null); setGameImportError(''); setMenu(null)
  }
  async function applyPreview() {
    if (!preview) return
    const current = profileSession.getState()
    if (preview.sessionVersion !== current.version) { setPreviewState(null); setMessage('Progress changed while reviewing this action. Create a fresh preview.'); return }
    const applied = preview.resolution === 'saved' ? profileSession.useSaved(current.version)
      : preview.resolution === 'local' ? await profileSession.save(true, current.version)
        : change(preview.profile, 'Progress updated.', preview.replaceStorage)
    if (!applied) return
    if (preview.resolution !== 'local') trackEvent(`${preview.operation}_applied`, { upgrade_id: preview.upgradeId, milestone_id: preview.milestoneId })
    if (preview.operation === 'milestone_removal') trackEvent('milestone_changed', { milestone_id: preview.milestoneId, recorded: false })
    setPreviewState(null)
  }
  const verified = Object.entries(catalog.verification).filter(([key]) => key !== 'evidence').every(([, value]) => value === true)
  return <main className="atlas" aria-busy={saving}>
    <header className="toolbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true">✦</span><div><h1>Ascension Map</h1><p>Idle Slayer · {catalog.gameVersion}</p></div></div>
      <div className="search-box"><label className="sr-only" htmlFor="search">Search visible upgrade titles</label><span aria-hidden="true">⌕</span><input className="telemetry-private rr-block" id="search" type="search" autoComplete="off" placeholder="Find an upgrade…" value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true) }} onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); if (event.key === 'Enter' && results[0]) center(results[0].id, 'search') }} />
        {searchOpen && <div className="search-results" aria-label="Visible upgrade results"><div className="results-heading"><span>{results.length} visible results</span><button onClick={() => setSearchOpen(false)} aria-label="Close search results">×</button></div>{results.slice(0, 40).map((node) => <button className="search-result" key={node.id} onClick={() => center(node.id, 'search')}><Icon node={node} /><span>{node.title}<small>{cost(node.cost)} SP</small></span></button>)}{results.length > 40 && <p>Refine your search to see more results.</p>}{results.length === 0 && <p>No visible upgrades match.</p>}</div>}
      </div>
      <button className="next-upgrade" onClick={() => { setSearchOpen(false); setMenu('recommendations') }}>Next upgrade</button>
      <div className="layout-control" role="group" aria-label="Map layout"><button aria-pressed={layoutMode === 'native'} onClick={() => changeLayout('native')} title="Original game positions">Game Layout</button><button aria-pressed={layoutMode === 'web'} onClick={() => changeLayout('web')} title="Readable dependency layout">Detailed Layout</button></div>
      <label className="spoiler-control desktop-action"><input type="checkbox" disabled={saving} checked={profile.showSpoilers} onChange={(event) => toggleSpoilers(event.target.checked)} />Show spoilers</label>
      <button className="desktop-action" onClick={() => setMenu('milestones')}>Milestones</button><button className="desktop-action" onClick={() => setMenu('progress')}>Progress</button>
      <button className="mobile-options" aria-label="Map options" onClick={() => { setSearchOpen(false); setMenu('options') }}>☰</button>
    </header>
    {storageError && <div className="notice" role="alert">{storageError} <button onClick={conflict ? reviewConflict : retryStorage}>{conflict ? 'Review progress conflict' : storageWritable ? 'Retry saving' : 'Retry recovery'}</button><button onClick={backup}>Export backup</button></div>}
    {!verified && <div className="notice">Local preview · Catalog verification is incomplete. Publication is gated.</div>}
    <div className={`workspace ${detail ? 'has-details' : ''} ${detailExpanded ? 'details-expanded' : ''}`}>
      <section ref={mapElement} className={`map ${gameLayout ? 'map-game' : ''}`} aria-label="Ascension tree" onKeyDownCapture={(event) => { keyboardSelection.current = (event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLElement && Boolean(event.target.closest('.react-flow__node')) }}>
        {loaded && <ReactFlow<UpgradeNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} elevateEdgesOnSelect={!gameLayout} nodeOrigin={[0.5, 0.5]} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} selectionKeyCode={null} multiSelectionKeyCode={null} minZoom={0.15} maxZoom={2.5} defaultViewport={{ x: 0, y: 0, zoom: 0.7 }} onInit={(instance) => { const start = layout.centers.get(catalog.startId); if (start) void instance.setCenter(start.x, start.y, { zoom: startZoom }) }} onNodesChange={(changes) => { const selection = changes.find((entry) => entry.type === 'select' && entry.selected); if (selection?.type === 'select') { if (keyboardSelection.current && selection.id !== selected) center(selection.id, 'keyboard'); keyboardSelection.current = false } else if (changes.some((entry) => entry.type === 'select' && !entry.selected && entry.id === selected)) clearSelection() }} onNodeClick={(_, node) => { keyboardSelection.current = false; center(node.id) }} onMoveStart={(event, viewport) => { if (event) cameraStart.current = viewport }} onMoveEnd={(event, viewport) => { const start = cameraStart.current; cameraStart.current = null; if (event && start) { const pan = start.x !== viewport.x || start.y !== viewport.y; const zoom = start.zoom !== viewport.zoom; if (pan || zoom) trackEvent('map_camera_used', { action: pan && zoom ? 'pan_zoom' : zoom ? 'zoom' : 'pan', source: 'pointer' }) } }} onPaneClick={() => setSearchOpen(false)} ariaLabelConfig={{ 'node.a11yDescription.default': 'Press Enter to select an upgrade. The tree positions are fixed.' }}><Background color="#514432" gap={32} size={1} /></ReactFlow>}
        <div className="map-summary"><span><b>{visible.owned}</b> / {visible.total} visible upgrades owned</span><span>Epoch {profile.epoch} · {profile.showSpoilers ? 'Spoilers shown' : 'Spoilers hidden'}</span><span className="connection-hint">{detail ? 'Dashed: connected from · Solid: leads to' : layoutMode === 'web' ? 'Prerequisite → upgrade · Select to trace connections' : 'Grey: unowned prerequisite · Magenta: owned · Select to trace'}</span></div>
        <div className="camera-controls"><button aria-label="Zoom out" onClick={() => { trackEvent('map_camera_used', { action: 'zoom_out', source: 'controls' }); void flow.zoomOut({ duration: reducedMotion ? 0 : 150 }) }}>−</button><button aria-label="Zoom in" onClick={() => { trackEvent('map_camera_used', { action: 'zoom_in', source: 'controls' }); void flow.zoomIn({ duration: reducedMotion ? 0 : 150 }) }}>+</button><button onClick={() => { trackEvent('map_camera_used', { action: 'return_start', source: 'controls' }); center(catalog.startId, 'start') }}>Return to start</button><button aria-label="Map navigation" aria-expanded={navigationOpen} aria-controls="pan-controls" onClick={() => { trackEvent('map_camera_used', { action: 'navigation_toggle', expanded: !navigationOpen }); setNavigationOpen(!navigationOpen) }}>↔</button></div>
        {navigationOpen && <div className="pan-controls" id="pan-controls" aria-label="Map navigation controls"><button aria-label="Pan map left" onClick={() => { trackEvent('map_camera_used', { action: 'pan', source: 'controls', direction: 'left' }); const v = flow.getViewport(); void flow.setViewport({ ...v, x: v.x + 180 }) }}>←</button><button aria-label="Pan map right" onClick={() => { trackEvent('map_camera_used', { action: 'pan', source: 'controls', direction: 'right' }); const v = flow.getViewport(); void flow.setViewport({ ...v, x: v.x - 180 }) }}>→</button><button aria-label="Pan map up" onClick={() => { trackEvent('map_camera_used', { action: 'pan', source: 'controls', direction: 'up' }); const v = flow.getViewport(); void flow.setViewport({ ...v, y: v.y + 180 }) }}>↑</button><button aria-label="Pan map down" onClick={() => { trackEvent('map_camera_used', { action: 'pan', source: 'controls', direction: 'down' }); const v = flow.getViewport(); void flow.setViewport({ ...v, y: v.y - 180 }) }}>↓</button></div>}
      </section>
      {detail && <aside ref={detailsElement} className={`details ${detailExpanded ? 'expanded' : ''}`} aria-label="Upgrade details"><div className="detail-heading"><div className="detail-identity"><Icon node={detail} /><div><h2>{detail.title}</h2><small className="detail-cost">{cost(detail.cost)} SP</small></div></div><div className="detail-tools"><button className="detail-toggle" aria-expanded={detailExpanded} aria-controls="detail-content" onClick={() => { trackEvent('details_toggled', { expanded: !detailExpanded }); setDetailExpanded(!detailExpanded) }}>{detailExpanded ? 'Hide details' : 'Show details'}</button><button aria-label="Close upgrade details" onClick={clearSelection}>×</button></div></div><p className={`state-label ${state(detail)}`}>{state(detail) === 'pending' ? '◷ Owned · awaiting activation' : state(detail) === 'purchased' ? '✓ Purchased and active' : state(detail) === 'locked' ? '◇ Locked' : '+ Available'}</p><div className="detail-content" id="detail-content"><p className="detail-description">{detail.description}</p><dl><dt>Purchase requirements</dt><dd>{label(detail.purchase)}</dd><dt>Reveal requirements</dt><dd>{label(detail.reveal)}</dd><dt>Ultra Ascension</dt><dd>{detail.retention === 'repeat' ? 'Repeat purchase · clears on reset' : 'Ownership retained'}{detail.activation === 'after-ultra-ascension' ? ' · Astral lock' : ''}</dd></dl>
        <div className="connection-list"><section aria-label="Connected from"><h3>Connected from</h3>{incoming.length ? incoming.map((node) => <button key={node.id} onClick={() => center(node.id, 'neighbor')}><Icon node={node} /><span>{node.title}</span><span aria-hidden="true">←</span></button>) : <p>No visible incoming connections.</p>}</section><section aria-label="Leads to"><h3>Leads to</h3>{outgoing.length ? outgoing.map((node) => <button key={node.id} onClick={() => center(node.id, 'neighbor')}><Icon node={node} /><span>{node.title}</span><span aria-hidden="true">→</span></button>) : <p>No visible outgoing connections.</p>}</section><small>Connections show paths. Purchase requirements above specify AND / OR and activation gates.</small></div>
        <div className="source-notes"><h3>Sources</h3>{detail.sources.map((source, i) => <p key={i}>{source.url ? <a onClick={() => trackEvent('source_link_opened', { source: 'details', upgrade_id: detail.id, action: 'other' })} href={source.url} target="_blank" rel="noreferrer">{source.label}</a> : source.label}{source.evidence && <small>{source.evidence}</small>}</p>)}</div></div>
        <div className="detail-actions">
        {profile.purchases[detail.id] ? <button className="danger full" disabled={saving} onClick={() => previewRemoval(detail.id)}>Remove purchase…</button> : visible.grants.has(detail.id) ? <p>Granted permanently by an active upgrade.</p> : <button className="primary full" disabled={saving} onClick={() => startPurchase(detail.id)}>Record purchase…</button>}
        {profile.purchases[detail.id] && detail.activation === 'after-ultra-ascension' && !profile.purchases[detail.id].active && <button className="full" disabled={saving} onClick={() => previewAstralActivation(detail.id)}>Already activated…</button>}
        </div></aside>}
    </div>
    <footer><span>Unofficial companion · Profile saved on this device</span><button disabled={saving || !history.length} onClick={undo}>Undo</button><button onClick={() => setMenu('about')}>About & sources</button><button onClick={() => setMenu('privacy')}>Privacy & tracking</button></footer>
    <p className="sr-only" role="status">{message}</p>{message && toastVisible && <div className="toast" onClick={() => setMessage('')}>{message}<button aria-label="Dismiss status" onClick={() => setMessage('')}>×</button></div>}
    <input className="sr-only telemetry-private rr-block" aria-label="Map progress JSON backup" ref={fileInput} type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restore(file); else restoreRequest.current++; event.target.value = '' }} />
    <input className="sr-only telemetry-private rr-block" aria-label="Idle Slayer game save" ref={gameFileInput} type="file" accept=".sav" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void readGameSave(file) }} />
    {menu === 'game-import' && <Dialog title="Import game progress" close={closeGameImport}>{gameImport ? <GameSaveImportPanel catalog={catalog} currentProfile={gameImport.original} preview={gameImport.result} onApply={applyGameImport} onCancel={closeGameImport} /> : <div className="game-save-picker">{gameImportLoading ? <p role="status">Reading game save…</p> : <><p className="telemetry-private rr-block" role="alert">{gameImportError}</p><p>Choose <b>savedata.sav</b> or <b>backup.sav</b> from Idle Slayer 7.2.0 on Steam. The selected file is read locally in your browser.</p><p className="game-save-path">%USERPROFILE%\AppData\LocalLow\Pablo Leban\Idle Slayer\</p></>}<div className="dialog-actions">{!gameImportLoading && <button className="primary" onClick={chooseGameSave}>Choose game save…</button>}<button onClick={closeGameImport}>Cancel</button></div></div>}</Dialog>}
    {menu === 'recommendations' && <Dialog title="Suggested next upgrade" close={() => setMenu(null)}><RecommendationPanel catalog={catalog} recommendations={recommendations} onSelect={(id) => selectSuggestion(id)} onPurchase={(id) => selectSuggestion(id, true)} /></Dialog>}
    {menu === 'options' && <Dialog title="Map options" close={() => setMenu(null)}><div className="map-options"><p><b>{visible.owned} / {visible.total}</b> visible upgrades owned · Epoch {profile.epoch}<br />{profile.showSpoilers ? 'Spoilers shown' : 'Spoilers hidden'}</p><label className="spoiler-control"><input type="checkbox" disabled={saving} checked={profile.showSpoilers} onChange={(event) => toggleSpoilers(event.target.checked)} />Show spoilers</label><button onClick={() => setMenu('milestones')}>Milestones</button><button onClick={() => setMenu('progress')}>Progress</button><button disabled={saving || !history.length} onClick={() => { undo(); setMenu(null) }}>Undo</button><button onClick={() => setMenu('about')}>About & sources</button><button onClick={() => setMenu('privacy')}>Privacy & tracking</button><small>Unofficial companion · Profile saved on this device</small></div></Dialog>}
    {menu === 'milestones' && <Dialog title="Milestones" close={() => setMenu(null)}><p>Record the required item received or purchased in the game.</p>{visible.milestones.map((item) => <label className="milestone" key={item.id}><input type="checkbox" disabled={saving} checked={profile.milestones[item.id] === true} onChange={(event) => { if (event.target.checked) { if (change({ ...profile, milestones: { ...profile.milestones, [item.id]: true } }, 'Milestone recorded.')) trackEvent('milestone_changed', { milestone_id: item.id, recorded: true }) } else { setMenu(null); previewRemoval(item.id, true) } }} /><span>{item.title}<small>{item.description}</small></span></label>)}{!visible.milestones.length && <p>No milestone controls are currently revealed.</p>}</Dialog>}
    {menu === 'progress' && <Dialog title="Your progress" close={() => setMenu(null)}><p>One local profile. Keep a backup when changing browsers or devices.</p><div className="progress-actions"><button data-game-import-trigger disabled={!loaded} onClick={chooseGameSave}>Import game save…</button><small>Steam 7.2.0 · Choose savedata.sav or backup.sav. A local preview appears before map progress changes.<code className="game-save-path">%USERPROFILE%\AppData\LocalLow\Pablo Leban\Idle Slayer\</code></small><button onClick={backup}>Export JSON backup</button><button onClick={() => { restoreRequest.current++; fileInput.current?.click() }}>Restore JSON backup…</button><button onClick={ultra}>Ultra Ascend…</button><label className="telemetry-private rr-block">Previous Ultra Ascensions<input key={profile.epoch} disabled={saving} type="number" min="0" max="1000000" defaultValue={profile.epoch} onBlur={(event) => { const epoch = Number(event.target.value); if (Number.isInteger(epoch) && epoch >= profile.epoch && epoch <= 1000000 && epoch !== profile.epoch) { if (change({ ...profile, epoch, purchases: Object.fromEntries(Object.entries(profile.purchases).map(([id, purchase]) => [id, purchase.epoch === profile.epoch && index.has(id) ? { ...purchase, epoch } : purchase])) }, 'Previous Ultra Ascensions recorded.')) trackEvent('prior_ascensions_recorded'); } else event.target.value = String(profile.epoch) }} /></label><button className="danger" onClick={() => { setMenu(null); setPreview({ operation: 'clear', title: 'Clear all progress?', text: 'Clear every purchase, milestone and unknown ID, and return to epoch 0 with spoilers hidden. You can undo this change in this session.', profile: emptyProfile(catalog.revision), replaceStorage: true }) }}>Clear all progress…</button></div></Dialog>}
    {menu === 'about' && <Dialog title="About this map" close={() => setMenu(null)}><p>Unofficial Idle Slayer companion. Game assets belong to their respective rights holders. Application code and asset attribution are documented separately.</p><p>Game {catalog.gameVersion} · Steam build {catalog.steamBuild}<br />Catalog {catalog.revision}</p><p>All map data and icons are bundled locally. No account or application backend is required.</p><p>{trackingDisclosure}</p><button onClick={() => setMenu('privacy')}>Privacy & tracking</button><a onClick={() => trackEvent('source_link_opened', { source: 'about', action: 'github' })} href="https://github.com/AustinGarrod/idle-slayer-ascension-map">Source and extraction documentation</a><a className="software-license-link" target="_blank" rel="noreferrer" onClick={() => trackEvent('source_link_opened', { source: 'about', action: 'license' })} href={`${import.meta.env.BASE_URL}licenses/index.html`}>Bundled software licenses</a></Dialog>}
    {menu === 'privacy' && <Dialog title="Privacy & tracking" close={() => setMenu(null)}><PrivacyPanel status={getTrackingStatus()} onChange={requestTrackingChange} /></Dialog>}
    {trackingReload !== null && <Dialog title="Reload with unsaved progress?" close={() => { setTrackingReload(null); setMenu('privacy') }}>
      <p>Current progress could not be saved. Reloading may lose these changes and clears session-only undo. Export a backup first to keep this progress.</p>
      <p>Recording stops when you confirm the tracking change and reload. Cancelling keeps this session and its current tracking choice.</p>
      <div className="dialog-actions"><button className="primary" onClick={() => { if (backup()) finishTrackingChange(trackingReload) }}>Export backup and reload</button><button className="danger" onClick={() => finishTrackingChange(trackingReload)}>Reload without backup</button><button onClick={() => { setTrackingReload(null); setMenu('privacy') }}>Cancel</button></div>
    </Dialog>}
    {conflictReview && <Dialog title="Review progress conflict" close={() => setConflictReview(null)}><div className="telemetry-private rr-block"><p>This session was kept when saved progress changed. Export a backup to keep this session before choosing which progress to use.</p><p>{conflictReview.snapshot.kind === 'valid' ? conflictReview.snapshot.text === null ? 'Saved progress was cleared in another tab.' : `${visibility(catalog, { ...conflictReview.snapshot.profile, showSpoilers: profile.showSpoilers }).owned} visible purchases are in the saved profile.` : conflictReview.snapshot.kind === 'invalid' ? 'Saved progress is not a valid profile. It cannot replace this session.' : 'Saved progress cannot be read. Retry recovery before replacing it.'}</p></div><div className="dialog-actions"><button onClick={backup}>Export this session</button><button disabled={conflictReview.snapshot.kind !== 'valid'} onClick={() => { const snapshot = conflictReview.snapshot; if (snapshot.kind !== 'valid') return; setConflictReview(null); setPreview({ operation: 'recovery', title: 'Use saved progress?', text: 'Replace this session with the reviewed saved progress. This change can be undone until another tab changes saved progress. Export a backup first if you want to keep both.', profile: snapshot.profile, resolution: 'saved', sessionVersion: conflictReview.version }) }}>Use saved progress…</button><button disabled={conflictReview.snapshot.kind === 'unavailable'} onClick={() => { setConflictReview(null); setPreview({ operation: 'recovery', title: 'Replace saved progress with this session?', text: 'Replace the reviewed saved profile with this session. Export a backup first if you want to keep both. This deliberately replaces the other tab’s saved progress.', profile, resolution: 'local', sessionVersion: conflictReview.version }) }}>Keep this session…</button><button onClick={() => { setConflictReview(null); profileSession.refreshExternal(); reviewConflict() }}>Refresh recovery</button><button onClick={() => setConflictReview(null)}>Cancel</button></div></Dialog>}
    {purchasePlan && purchaseTarget && <Dialog title={purchasePlan.kind === 'choice' ? 'Choose a prerequisite path' : purchasePlan.kind === 'blocked' ? 'Explicit progress required' : 'Record purchase?'} close={cancelPurchase}>{purchasePlan.kind === 'choice' ? <><p>This OR requirement has no satisfied path. Choose before any progress changes.</p>{purchasePlan.options.map((option, i) => <button className="full" key={i} onClick={() => { trackEvent('prerequisite_chosen', { position: i + 1, upgrade_id: purchaseTarget }); setChoices({ ...choices, [purchasePlan.key]: i }) }}>{label(option)}</button>)}</> : purchasePlan.kind === 'blocked' ? <><p>{label(purchasePlan.requirement)}</p><p>{purchasePlan.reason}</p><button onClick={cancelPurchase}>Close</button></> : <><p>Record {purchasePlan.added.length} purchase{purchasePlan.added.length === 1 ? '' : 's'}, including missing prerequisites.</p><ul>{purchasePlan.added.filter((id) => visible.ids.has(id)).map((id) => <li key={id}>{index.get(id)?.title}</li>)}</ul><button className="primary" disabled={saving} onClick={() => { if (!change(purchasePlan.profile, 'Purchase recorded.')) return; trackEvent('purchase_applied', { upgrade_id: purchaseTarget, source: purchaseSource.current }); if (purchaseSource.current === 'recommendation') trackEvent('recommendation_purchase_applied', { upgrade_id: purchaseTarget }); setPurchaseTarget(null) }}>Apply purchases</button><button onClick={cancelPurchase}>Cancel</button></>}</Dialog>}
    {preview && <Dialog title={preview.title} close={() => setPreview(null)}><p className={preview.operation === 'restore' || preview.operation === 'recovery' ? 'telemetry-private rr-block' : undefined}>{preview.text}</p>{preview.changes && <ul>{preview.changes.filter((id) => visible.ids.has(id)).map((id) => <li key={id}>{index.get(id)?.title}</li>)}</ul>}{preview.groups?.map((group) => <section key={group.label}><h3>{group.label} ({group.ids.length})</h3><ul>{group.ids.filter((id) => visible.ids.has(id)).map((id) => <li key={id}>{index.get(id)?.title}</li>)}</ul></section>)}<div className="dialog-actions"><button className="primary" disabled={saving} onClick={() => { void applyPreview() }}>Apply changes</button><button onClick={() => setPreview(null)}>Cancel</button></div></Dialog>}
  </main>
}

export default function MapApp({ catalog }: { catalog: Catalog }) {
  return <ReactFlowProvider><Atlas catalog={catalog} /></ReactFlowProvider>
}
