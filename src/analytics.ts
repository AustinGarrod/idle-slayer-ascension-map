/** Bounded, optional Umami integration. Progress persistence never depends on telemetry. */
export const ANALYTICS_PREFERENCE_KEY = 'idle-slayer-ascension-map.analytics.v1'
export const ANALYTICS_WEBSITE_ID = 'f5c9bfd4-7ab5-4f82-a543-9357dcea1566'
export const ANALYTICS_HOST = 'https://analytics.garrod.house'
export const ANALYTICS_CALLBACK = 'ascensionMapBeforeSend'
const APP_VERSION = '0.1.0'
const QUEUE_LIMIT = 100
const QUEUE_TTL = 30_000

export type AnalyticsOperation = 'purchase' | 'removal' | 'milestone_removal' | 'astral_activation' | 'ultra_ascension' | 'clear' | 'restore' | 'recovery'
type OperationPhase = 'previewed' | 'applied' | 'cancelled'
export type AnalyticsEventName =
  | `${AnalyticsOperation}_${OperationPhase}`
  | 'app_ready' | 'catalog_error' | 'runtime_error' | 'storage_error' | 'storage_recovered'
  | 'panel_opened' | 'panel_closed' | 'map_layout_changed' | 'spoilers_changed' | 'details_toggled' | 'map_camera_used'
  | 'search_performed' | 'upgrade_selected' | 'source_link_opened'
  | 'recommendations_viewed' | 'recommendation_selected' | 'recommendation_purchase_started' | 'recommendation_purchase_applied'
  | 'purchase_started' | 'purchase_blocked' | 'prerequisite_chosen' | 'milestone_changed' | 'prior_ascensions_recorded' | 'progress_undo'
  | 'backup_download_requested' | 'backup_error'
  | 'game_import_started' | 'game_import_previewed' | 'game_import_applied' | 'game_import_cancelled' | 'game_import_error'
export type AnalyticsProperties = Record<string, string | number | boolean | undefined>
export interface AnalyticsContext {
  catalog_version: string
  catalog_revision: string
  layout: 'web' | 'game'
  spoilers: boolean
  visibleUpgradeIds: ReadonlySet<string>
  visibleMilestoneIds: ReadonlySet<string>
}
export interface TrackingStatus {
  enabled: boolean
  reason: string
  active: boolean
  preference: 'enabled' | 'disabled' | 'unavailable'
}
type SafeData = Record<string, string | number | boolean>
type Payload = Record<string, unknown>
interface Umami {
  track: (name: string, data?: SafeData) => unknown
  identify: (data: SafeData) => unknown
  getSession?: () => { cache: string | undefined; website: string | null }
}
type AnalyticsWindow = Window & {
  umami?: Umami
  ascensionMapBeforeSend?: (type: string, payload: Payload) => Payload | null
}
/** Explicit dependency seam for isolated local tests; the app uses the fixed singleton below. */
export interface AnalyticsEnvironment {
  window: Window
  production: boolean
  hostname: string
  basePath: string
  host: string
  websiteId: string
}

const operations: AnalyticsOperation[] = ['purchase', 'removal', 'milestone_removal', 'astral_activation', 'ultra_ascension', 'clear', 'restore', 'recovery']
const eventNames = new Set<string>([
  ...operations.flatMap((operation) => ['previewed', 'applied', 'cancelled'].map((phase) => `${operation}_${phase}`)),
  'app_ready', 'catalog_error', 'runtime_error', 'storage_error', 'storage_recovered',
  'panel_opened', 'panel_closed', 'map_layout_changed', 'spoilers_changed', 'details_toggled', 'map_camera_used',
  'search_performed', 'upgrade_selected', 'source_link_opened', 'recommendations_viewed', 'recommendation_selected',
  'recommendation_purchase_started', 'recommendation_purchase_applied', 'purchase_started', 'purchase_blocked',
  'prerequisite_chosen', 'milestone_changed', 'prior_ascensions_recorded', 'progress_undo', 'backup_download_requested',
  'backup_error', 'game_import_started', 'game_import_previewed', 'game_import_applied', 'game_import_cancelled', 'game_import_error',
])
const enums: Record<string, readonly string[]> = {
  operation: operations,
  phase: ['previewed', 'applied', 'cancelled'],
  source: ['map', 'search', 'neighbor', 'recommendation', 'start', 'details', 'progress', 'milestones', 'keyboard', 'pointer', 'controls', 'about'],
  action: ['zoom_in', 'zoom_out', 'zoom', 'pan', 'pan_zoom', 'navigation_toggle', 'return_start', 'wiki', 'github', 'license', 'game', 'other', 'load', 'save', 'retry', 'confirm', 'cancel', 'open', 'close', 'purchase', 'show'],
  panel: ['options', 'progress', 'milestones', 'about', 'recommendations', 'game-import', 'privacy'],
  layout: ['web', 'game'],
  reason: ['network', 'validation', 'read', 'size', 'stale', 'milestone', 'pending', 'reveal', 'runtime', 'unhandled-rejection', 'unavailable', 'invalid-json', 'invalid-profile', 'too-large', 'storage-read', 'storage-write', 'wiki', 'catalog-fallback', 'all-owned', 'blocked'],
  query_length: ['1-3', '4-10', '11-30', '31+'],
  results: ['0', '1-5', '6-20', '21+'],
  basis: ['wiki', 'catalog-fallback'],
  direction: ['left', 'right', 'up', 'down'],
}
const booleanFields = new Set(['expanded', 'enabled', 'recorded', 'spoilers'])
const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
const metadataToken = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9._-]{1,128}$/.test(value)

export function createAnalyticsController(environment: AnalyticsEnvironment) {
  const win = environment.window as AnalyticsWindow
  let initialized = false
  let preference: TrackingStatus['preference'] = 'unavailable'
  let preferenceDisabled = false
  let sessionSuspended = false
  let trackerReady = false
  let scriptFailed = false
  let context: AnalyticsContext | undefined
  let lastSessionData = ''
  let queued: { name: AnalyticsEventName; data: SafeData; timestamp: number }[] = []
  let expiryTimer: number | undefined
  let pollTimer: number | undefined
  let trackerWaitStarted = 0
  let runtimeErrorsReported = 0
  const runtimeErrorTimes = new Map<string, number>()
  const campaigns = new URLSearchParams()
  const origin = win.location.origin
  const appURL = new URL(environment.basePath, origin)

  function storagePreference() {
    try {
      const value = win.localStorage.getItem(ANALYTICS_PREFERENCE_KEY)
      preference = value === null || value === 'enabled' ? 'enabled' : value === 'disabled' ? 'disabled' : 'unavailable'
    } catch { preference = 'unavailable' }
    preferenceDisabled = preference !== 'enabled'
  }
  function disabledReason(): string | undefined {
    if (!environment.production) return 'development'
    if (win.location.hostname.toLowerCase() !== environment.hostname.toLowerCase() ||
      ![environment.basePath, environment.basePath.replace(/\/$/, '')].includes(win.location.pathname)) return 'unsupported-origin'
    try { if (win.self !== win.top) return 'embedded' } catch { return 'embedded' }
    const signals = win.navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }
    if (signals.globalPrivacyControl === true) return 'global-privacy-control'
    const dnt = signals.doNotTrack || signals.msDoNotTrack || (win as Window & { doNotTrack?: string }).doNotTrack
    if (['1', 'yes'].includes(String(dnt))) return 'do-not-track'
    if (win.location.hash === '#analytics=off') return 'opt-out'
    if (preferenceDisabled) return preference === 'unavailable' ? 'storage-unavailable' : 'opt-out'
    try { if (win.localStorage.getItem('umami.disabled')) return 'umami-disabled' } catch {
      preference = 'unavailable'
      preferenceDisabled = true
      return 'storage-unavailable'
    }
    if (sessionSuspended) return 'reload-required'
    return undefined
  }
  function getTrackingStatus(): TrackingStatus {
    const reason = disabledReason()
    return { enabled: !reason, reason: reason || (scriptFailed ? 'script-unavailable' : 'enabled'), active: !reason && trackerReady && !scriptFailed, preference }
  }
  function commonData(): SafeData {
    const data: SafeData = { app_version: APP_VERSION, screen_layout: win.innerWidth <= 1100 || win.innerHeight <= 540 ? 'compact' : 'wide' }
    if (context) {
      if (metadataToken(context.catalog_version)) data.catalog_version = context.catalog_version
      if (metadataToken(context.catalog_revision)) data.catalog_revision = context.catalog_revision
      if (enums.layout.includes(context.layout)) data.layout = context.layout
      if (typeof context.spoilers === 'boolean') data.spoilers = context.spoilers
    }
    return data
  }
  function sanitizeData(properties: unknown): SafeData {
    const data: SafeData = {}
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return data
    for (const [key, value] of Object.entries(properties)) {
      if (enums[key] && typeof value === 'string' && enums[key].includes(value)) data[key] = value
      else if (booleanFields.has(key) && typeof value === 'boolean') data[key] = value
      else if (key === 'position' && Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 3) data[key] = Number(value)
      else if (key === 'upgrade_id' && typeof value === 'string' && context?.visibleUpgradeIds.has(value)) data[key] = value
      else if (key === 'milestone_id' && typeof value === 'string' && context?.visibleMilestoneIds.has(value)) data[key] = value
    }
    return data
  }
  function trackerURL() {
    const url = new URL(appURL)
    url.search = campaigns.toString()
    return url.toString()
  }
  function cleanReferrer(referrer: unknown) {
    if (typeof referrer !== 'string' || !referrer) return ''
    try {
      const url = new URL(referrer, origin)
      if (!['http:', 'https:'].includes(url.protocol)) return ''
      return url.origin === origin ? environment.basePath : `${url.origin}/`
    } catch { return '' }
  }
  function sanitizePayload(type: string, payload: Payload): Payload | null {
    if (disabledReason() || !payload || !['event', 'identify', 'performance'].includes(type)) return null
    const safe: Payload = {
      website: environment.websiteId, hostname: environment.hostname, url: trackerURL(),
      title: 'Idle Slayer Ascension Map', referrer: cleanReferrer(payload.referrer),
    }
    if (typeof payload.screen === 'string' && /^\d{1,5}x\d{1,5}$/.test(payload.screen)) safe.screen = payload.screen
    if (typeof payload.language === 'string' && /^[a-zA-Z0-9-]{1,35}$/.test(payload.language)) safe.language = payload.language
    if (type === 'event') {
      if (payload.name !== undefined) {
        if (typeof payload.name !== 'string' || !eventNames.has(payload.name)) return null
        safe.name = payload.name
        safe.data = { ...commonData(), ...sanitizeData(payload.data) }
      }
    } else if (type === 'identify') {
      // Never forward a distinct ID, caller data or a stored profile.
      safe.data = commonData()
    } else {
      for (const key of ['lcp', 'inp', 'cls', 'fcp', 'ttfb']) {
        const value = payload[key]
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= (key === 'cls' ? 100 : 60_000)) safe[key] = value
      }
    }
    return safe
  }
  function beforeSend(type: string, payload: Payload): Payload | null {
    try { return sanitizePayload(type, payload) } catch { return null }
  }
  function discardQueue() {
    queued = []
    if (expiryTimer !== undefined) win.clearTimeout(expiryTimer)
    if (pollTimer !== undefined) win.clearTimeout(pollTimer)
    expiryTimer = pollTimer = undefined
  }
  function ignoreFailure(action: () => unknown) {
    try { void Promise.resolve(action()).catch(() => undefined) } catch { /* Optional telemetry cannot break an action. */ }
  }
  function identifyContext() {
    if (!context || !trackerReady || !win.umami || disabledReason()) return
    const data = commonData()
    const encoded = JSON.stringify(data)
    if (encoded === lastSessionData) return
    lastSessionData = encoded
    ignoreFailure(() => win.umami!.identify(data))
  }
  function flushQueue() {
    if (disabledReason()) { discardQueue(); return }
    if (!trackerReady || !win.umami) return
    const events = queued
    discardQueue()
    for (const event of events) {
      if (Date.now() - event.timestamp < QUEUE_TTL) {
        // Validate IDs again after visibility changes while scripts were loading.
        const data = { ...commonData(), ...sanitizeData(event.data) }
        ignoreFailure(() => win.umami!.track(event.name, data))
      }
    }
  }
  function waitForTracker() {
    if (win.umami) {
      const originalGetSession = win.umami.getSession?.bind(win.umami)
      if (originalGetSession) {
        // Umami 3.4 rereads this public accessor before every recorder flush.
        // Guard even a tracker that finishes loading after opt-out. Once this
        // document is suspended, its buffered replay can never resume sending.
        win.umami.getSession = () => disabledReason()
          ? { cache: undefined, website: environment.websiteId }
          : originalGetSession()
      }
      if (disabledReason() || scriptFailed) { discardQueue(); return }
      trackerReady = true
      identifyContext()
      flushQueue()
      return
    }
    if (disabledReason() || scriptFailed) { discardQueue(); return }
    if (Date.now() - trackerWaitStarted >= QUEUE_TTL) { scriptFailed = true; discardQueue(); return }
    pollTimer = win.setTimeout(waitForTracker, 100)
  }
  function initializeAnalytics() {
    if (initialized) return
    initialized = true
    storagePreference()
    if (disabledReason()) return
    // Replay and heatmaps use the actual URL, outside the tracker callback.
    const currentURL = new URL(win.location.href)
    for (const key of campaignKeys) {
      const value = currentURL.searchParams.get(key)
      if (value && /^[a-zA-Z0-9._~-]{1,64}$/.test(value)) campaigns.set(key, value)
    }
    try { win.history.replaceState(win.history.state, '', appURL.toString()) } catch {
      // Without a clean address, recorder URLs cannot satisfy the privacy contract.
      scriptFailed = true
      return
    }
    win.ascensionMapBeforeSend = beforeSend
    const tracker = win.document.createElement('script')
    tracker.id = 'ascension-map-tracker'
    tracker.defer = true
    tracker.async = false
    tracker.src = `${environment.host}/script.js`
    tracker.dataset.websiteId = environment.websiteId
    tracker.dataset.hostUrl = environment.host
    tracker.dataset.domains = environment.hostname
    tracker.dataset.excludeSearch = 'true'
    tracker.dataset.excludeHash = 'true'
    tracker.dataset.doNotTrack = 'true'
    tracker.dataset.performance = 'true'
    tracker.dataset.beforeSend = ANALYTICS_CALLBACK
    tracker.onload = () => { trackerWaitStarted = Date.now(); waitForTracker() }
    tracker.onerror = () => { scriptFailed = true; discardQueue() }
    win.document.head.appendChild(tracker)
    const recorder = win.document.createElement('script')
    recorder.id = 'ascension-map-recorder'
    recorder.defer = true
    recorder.async = false
    recorder.src = `${environment.host}/recorder.js`
    recorder.dataset.websiteId = environment.websiteId
    recorder.dataset.hostUrl = environment.host
    win.document.head.appendChild(recorder)
    // Bound error loops to one per category / 30 seconds and ten per page session.
    // Never serialize errors, URLs or stacks.
    const reportError = (reason: string) => {
      const previous = runtimeErrorTimes.get(reason)
      if (runtimeErrorsReported >= 10 || (previous !== undefined && Date.now() - previous < 30_000)) return
      runtimeErrorTimes.set(reason, Date.now())
      runtimeErrorsReported++
      trackEvent('runtime_error', { reason })
    }
    win.addEventListener('error', () => reportError('runtime'))
    win.addEventListener('unhandledrejection', () => reportError('unhandled-rejection'))
    win.addEventListener('resize', identifyContext)
    win.addEventListener('storage', (event) => {
      if (event.key === null || event.key === ANALYTICS_PREFERENCE_KEY || event.key === 'umami.disabled') {
        // Read the event as well as current storage: another tab can disable
        // and enable before this document receives the queued disabling event.
        const disabledByEvent = event.key === null
          || (event.key === ANALYTICS_PREFERENCE_KEY && event.newValue !== null && event.newValue !== 'enabled')
          || (event.key === 'umami.disabled' && Boolean(event.newValue))
        storagePreference()
        if (disabledByEvent || disabledReason()) {
          sessionSuspended = true
          trackerReady = false
          discardQueue()
        }
      }
    })
  }
  function updateAnalyticsContext(next: AnalyticsContext) {
    context = { ...next, visibleUpgradeIds: new Set(next.visibleUpgradeIds), visibleMilestoneIds: new Set(next.visibleMilestoneIds) }
    identifyContext()
  }
  function trackEvent(name: AnalyticsEventName, properties?: AnalyticsProperties) {
    if (!initialized || !eventNames.has(name) || disabledReason() || scriptFailed) return
    const data = sanitizeData(properties)
    if (trackerReady && win.umami) ignoreFailure(() => win.umami!.track(name, { ...commonData(), ...data }))
    else {
      queued = queued.filter((event) => Date.now() - event.timestamp < QUEUE_TTL)
      if (queued.length >= QUEUE_LIMIT) queued.shift()
      queued.push({ name, data, timestamp: Date.now() })
      if (expiryTimer !== undefined) win.clearTimeout(expiryTimer)
      expiryTimer = win.setTimeout(() => { discardQueue() }, QUEUE_TTL)
    }
  }
  function setTrackingPreference(enabled: boolean) {
    discardQueue()
    let persisted = false
    try {
      win.localStorage.setItem(ANALYTICS_PREFERENCE_KEY, enabled ? 'enabled' : 'disabled')
      preference = enabled ? 'enabled' : 'disabled'
      persisted = true
    } catch { preference = 'unavailable' }
    // Enabling takes effect only after a clean reload, never mid-session.
    sessionSuspended = true
    preferenceDisabled = true
    trackerReady = false
    const url = new URL(win.location.href)
    url.search = ''
    url.hash = enabled && persisted ? '' : 'analytics=off'
    return { persisted, reloadURL: url.toString() }
  }
  return { initializeAnalytics, updateAnalyticsContext, trackEvent, getTrackingStatus, setTrackingPreference }
}

let singleton: ReturnType<typeof createAnalyticsController> | undefined
function controller() {
  singleton ??= createAnalyticsController({ window, production: import.meta.env.PROD, hostname: 'austingarrod.github.io',
    basePath: '/idle-slayer-ascension-map/', host: ANALYTICS_HOST, websiteId: ANALYTICS_WEBSITE_ID })
  return singleton
}
export const initializeAnalytics = () => controller().initializeAnalytics()
export const updateAnalyticsContext = (context: AnalyticsContext) => controller().updateAnalyticsContext(context)
export const trackEvent = (name: AnalyticsEventName, properties?: AnalyticsProperties) => controller().trackEvent(name, properties)
export const getTrackingStatus = () => controller().getTrackingStatus()
export const setTrackingPreference = (enabled: boolean) => controller().setTrackingPreference(enabled)
