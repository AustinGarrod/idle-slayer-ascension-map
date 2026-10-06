import { afterEach, describe, expect, it, vi } from 'vitest'
import { ANALYTICS_CALLBACK, ANALYTICS_PREFERENCE_KEY, createAnalyticsController, type AnalyticsContext, type AnalyticsEventName } from './analytics'

const hostname = 'example.test'
const basePath = '/map/'
const websiteId = '11111111-1111-4111-8111-111111111111'
const context: AnalyticsContext = {
  catalog_version: '7.2.0', catalog_revision: 'steam-25551532-v1', layout: 'web', spoilers: false,
  visibleUpgradeIds: new Set(['visible-upgrade']), visibleMilestoneIds: new Set(['visible-milestone']),
}
type TestWindow = Window & { umami?: ReturnType<typeof fakeTracker>; ascensionMapBeforeSend?: (type: string, payload: Record<string, unknown>) => Record<string, unknown> | null }
function fakeTracker() {
  return { track: vi.fn(), identify: vi.fn(), getSession: vi.fn(() => ({ cache: 'local-only-cache', website: websiteId })) }
}
function setup(options: { url?: string; production?: boolean; preference?: string; storageFails?: boolean; dnt?: string; gpc?: boolean; embedded?: boolean; nativeDisabled?: boolean } = {}) {
  let url = new URL(options.url || `https://${hostname}${basePath}`)
  const stored = new Map<string, string>()
  if (options.preference) stored.set(ANALYTICS_PREFERENCE_KEY, options.preference)
  if (options.nativeDisabled) stored.set('umami.disabled', '1')
  const scripts: HTMLScriptElement[] = []
  const listeners = new Map<string, ((event: unknown) => void)[]>()
  const storage = {
    getItem: vi.fn((key: string) => { if (options.storageFails) throw new Error('sensitive storage failure'); return stored.get(key) ?? null }),
    setItem: vi.fn((key: string, value: string) => { if (options.storageFails) throw new Error('sensitive write failure'); stored.set(key, value) }),
  }
  const win = {
    get location() { return url },
    localStorage: storage,
    navigator: { doNotTrack: options.dnt, globalPrivacyControl: options.gpc },
    innerWidth: 1280, innerHeight: 800,
    history: { state: { preserve: 'state' }, replaceState: vi.fn((_state: unknown, _title: string, next: string) => { url = new URL(next) }) },
    document: {
      createElement: vi.fn(() => ({ dataset: {}, onload: null, onerror: null })),
      head: { appendChild: vi.fn((script: HTMLScriptElement) => scripts.push(script)) },
    },
    addEventListener: vi.fn((name: string, handler: (event: unknown) => void) => listeners.set(name, [...(listeners.get(name) ?? []), handler])),
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  } as unknown as TestWindow
  Object.defineProperties(win, { self: { value: win }, top: { value: options.embedded ? {} : win } })
  const analytics = createAnalyticsController({ window: win, production: options.production ?? true, hostname, basePath, host: 'https://isolated.test', websiteId })
  const tracker = fakeTracker()
  const ready = () => {
    win.umami = tracker
    scripts[0].onload?.call(scripts[0], new Event('load'))
  }
  return { analytics, win, scripts, tracker, storage, stored, ready, listeners }
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('analytics activation and preference', () => {
  it.each([
    ['development', { production: false }],
    ['unsupported-origin', { url: 'https://other.test/map/' }],
    ['unsupported-origin', { url: 'https://example.test/private/' }],
    ['embedded', { embedded: true }],
    ['do-not-track', { dnt: '1' }],
    ['global-privacy-control', { gpc: true }],
    ['umami-disabled', { nativeDisabled: true }],
    ['opt-out', { preference: 'disabled' }],
    ['opt-out', { url: 'https://example.test/map/#analytics=off' }],
    ['storage-unavailable', { storageFails: true }],
    ['storage-unavailable', { preference: 'invalid' }],
  ])('loads no scripts for %s', (reason, options) => {
    const { analytics, scripts } = setup(options)
    analytics.initializeAnalytics()
    expect(analytics.getTrackingStatus()).toMatchObject({ enabled: false, active: false, reason })
    expect(scripts).toEqual([])
  })

  it('initializes once, honors the fixed script contract, and preserves history state', () => {
    const { analytics, scripts, win, ready } = setup()
    analytics.initializeAnalytics()
    analytics.initializeAnalytics()
    expect(scripts).toHaveLength(2)
    expect(scripts[0].dataset).toMatchObject({ websiteId, beforeSend: ANALYTICS_CALLBACK, performance: 'true', excludeSearch: 'true', excludeHash: 'true' })
    expect(scripts[1].dataset).toEqual({ websiteId, hostUrl: 'https://isolated.test' })
    expect(win.history.replaceState).toHaveBeenCalledWith({ preserve: 'state' }, '', 'https://example.test/map/')
    expect(analytics.getTrackingStatus().active).toBe(false)
    ready()
    expect(analytics.getTrackingStatus()).toMatchObject({ enabled: true, active: true })
  })

  it('opt-out clears pending events and immediately removes recorder cache access', () => {
    const { analytics, tracker, ready, stored } = setup()
    analytics.initializeAnalytics()
    analytics.trackEvent('app_ready')
    ready()
    expect(tracker.getSession()).toMatchObject({ cache: 'local-only-cache' })
    tracker.track.mockClear()
    expect(analytics.setTrackingPreference(false)).toEqual({ persisted: true, reloadURL: 'https://example.test/map/#analytics=off' })
    expect(stored.get(ANALYTICS_PREFERENCE_KEY)).toBe('disabled')
    expect(tracker.getSession()).toEqual({ cache: undefined, website: websiteId })
    analytics.trackEvent('app_ready')
    expect(tracker.track).not.toHaveBeenCalled()
  })

  it('fails closed on preference writes and supplies a reload marker without touching progress', () => {
    const { analytics, storage, stored } = setup({ storageFails: true })
    analytics.initializeAnalytics()
    expect(analytics.setTrackingPreference(false)).toEqual({ persisted: false, reloadURL: 'https://example.test/map/#analytics=off' })
    expect(analytics.setTrackingPreference(true)).toEqual({ persisted: false, reloadURL: 'https://example.test/map/#analytics=off' })
    expect(storage.setItem.mock.calls.every(([key]) => key === ANALYTICS_PREFERENCE_KEY)).toBe(true)
    expect(stored.size).toBe(0)
  })

  it('enabling is deferred until reload and removes the fallback marker from the reload URL', () => {
    const { analytics, scripts } = setup({ preference: 'disabled', url: 'https://example.test/map/#analytics=off' })
    analytics.initializeAnalytics()
    expect(analytics.setTrackingPreference(true)).toEqual({ persisted: true, reloadURL: 'https://example.test/map/' })
    expect(scripts).toHaveLength(0)
    expect(analytics.getTrackingStatus().active).toBe(false)
  })

  it('stops access when another tab disables tracking', () => {
    const { analytics, stored, listeners, tracker, ready } = setup()
    analytics.initializeAnalytics()
    ready()
    stored.set(ANALYTICS_PREFERENCE_KEY, 'disabled')
    listeners.get('storage')?.forEach((handler) => handler({ key: ANALYTICS_PREFERENCE_KEY }))
    expect(tracker.getSession().cache).toBeUndefined()
    expect(analytics.getTrackingStatus().enabled).toBe(false)
  })

  it('keeps the application usable when cleaning the recorder URL is prohibited', () => {
    const { analytics, win, scripts } = setup()
    vi.mocked(win.history.replaceState).mockImplementation(() => { throw new Error('PRIVATE') })
    expect(() => analytics.initializeAnalytics()).not.toThrow()
    expect(scripts).toHaveLength(0)
    expect(analytics.getTrackingStatus()).toMatchObject({ active: false, reason: 'script-unavailable' })
  })
})

describe('analytics payload privacy', () => {
  it('cleans the actual URL before recorder loading while retaining only valid native campaign tokens', () => {
    const { analytics, win } = setup({ url: 'https://example.test/map/?utm_source=github&utm_medium=referral&utm_campaign=autumn&utm_content=contains%40email&utm_term=map-tree&save=PRIVATE#secret' })
    analytics.initializeAnalytics()
    expect(win.location.href).toBe('https://example.test/map/')
    const payload = win.ascensionMapBeforeSend!('event', { url: 'https://private.test/secret', referrer: 'https://referrer.test/private-person?q=PRIVATE#hidden' })
    expect(payload).toMatchObject({ website: websiteId, hostname, title: 'Idle Slayer Ascension Map', referrer: 'https://referrer.test/' })
    expect(payload?.url).toBe('https://example.test/map/?utm_source=github&utm_medium=referral&utm_campaign=autumn&utm_term=map-tree')
    expect(JSON.stringify(payload)).not.toMatch(/PRIVATE|secret|private-person|email/)
  })

  it('allowlists event fields and only currently visible native identities', () => {
    const { analytics, tracker, ready } = setup()
    analytics.initializeAnalytics()
    analytics.updateAnalyticsContext(context)
    ready()
    analytics.trackEvent('upgrade_selected', { upgrade_id: 'visible-upgrade', milestone_id: 'hidden-milestone', source: 'search', query: 'PRIVATE', filename: 'PRIVATE.sav', epoch: 112, results: '1-5', query_length: '4-10', position: 4, reason: 'PRIVATE error' })
    expect(tracker.track).toHaveBeenCalledWith('upgrade_selected', { app_version: '0.1.0', screen_layout: 'wide', catalog_version: '7.2.0', catalog_revision: 'steam-25551532-v1', layout: 'web', spoilers: false, upgrade_id: 'visible-upgrade', source: 'search', results: '1-5', query_length: '4-10' })
    expect(tracker.identify).toHaveBeenCalledWith({ app_version: '0.1.0', screen_layout: 'wide', catalog_version: '7.2.0', catalog_revision: 'steam-25551532-v1', layout: 'web', spoilers: false })
  })

  it('revalidates queued upgrade identities after spoilers or progress change', () => {
    const { analytics, tracker, ready } = setup()
    analytics.initializeAnalytics()
    analytics.updateAnalyticsContext(context)
    analytics.trackEvent('upgrade_selected', { upgrade_id: 'visible-upgrade' })
    analytics.updateAnalyticsContext({ ...context, visibleUpgradeIds: new Set() })
    ready()
    expect(tracker.track.mock.calls[0][1]).not.toHaveProperty('upgrade_id')
  })

  it('sanitizes identify and performance through the same callback without forwarding a distinct ID or caller data', () => {
    const { analytics, win } = setup()
    analytics.initializeAnalytics()
    analytics.updateAnalyticsContext(context)
    const identify = win.ascensionMapBeforeSend!('identify', { id: 'PRIVATE', data: { email: 'PRIVATE', profile: 'PRIVATE' }, referrer: '/map/?save=PRIVATE', screen: '1920x1080', language: 'en-US' })
    expect(identify).not.toHaveProperty('id')
    expect(identify?.data).toEqual({ app_version: '0.1.0', screen_layout: 'wide', catalog_version: '7.2.0', catalog_revision: 'steam-25551532-v1', layout: 'web', spoilers: false })
    expect(identify?.referrer).toBe('/map/')
    const performance = win.ascensionMapBeforeSend!('performance', { data: 'PRIVATE', stack: 'PRIVATE', lcp: 2400, inp: -1, cls: 0.03, fcp: Number.NaN, ttfb: 90000 })
    expect(performance).toMatchObject({ lcp: 2400, cls: 0.03 })
    expect(performance).not.toHaveProperty('inp')
    expect(performance).not.toHaveProperty('ttfb')
    expect(JSON.stringify({ identify, performance })).not.toContain('PRIVATE')
  })

  it('rejects unknown event names and unsupported payload types', () => {
    const { analytics, win, ready, tracker } = setup()
    analytics.initializeAnalytics()
    ready()
    analytics.trackEvent('PRIVATE raw name' as AnalyticsEventName)
    expect(tracker.track).not.toHaveBeenCalled()
    expect(win.ascensionMapBeforeSend!('event', { name: 'PRIVATE' })).toBeNull()
    expect(win.ascensionMapBeforeSend!('record', {})).toBeNull()
    analytics.setTrackingPreference(false)
    expect(win.ascensionMapBeforeSend!('event', {})).toBeNull()
  })

  it('bounds generic runtime categories even when an error source loops', () => {
    vi.useFakeTimers()
    const { analytics, ready, listeners, tracker } = setup()
    analytics.initializeAnalytics()
    ready()
    for (let cycle = 0; cycle < 15; cycle++) {
      for (let repeat = 0; repeat < 20; repeat++) listeners.get('error')?.forEach((handler) => handler({ message: 'PRIVATE', stack: 'PRIVATE' }))
      vi.advanceTimersByTime(30_000)
    }
    expect(tracker.track).toHaveBeenCalledTimes(10)
    expect(tracker.track.mock.calls.every(([name, data]) => name === 'runtime_error' && data.reason === 'runtime')).toBe(true)
    expect(JSON.stringify(tracker.track.mock.calls)).not.toContain('PRIVATE')
  })

  it('cancels malformed payload getters without throwing into the tracker', () => {
    const { analytics, win } = setup()
    analytics.initializeAnalytics()
    const payload = Object.defineProperty({}, 'referrer', { get() { throw new Error('PRIVATE') } })
    expect(() => win.ascensionMapBeforeSend!('event', payload)).not.toThrow()
    expect(win.ascensionMapBeforeSend!('event', payload)).toBeNull()
  })
})

describe('optional tracker failures', () => {
  it('caps delayed events at 100 and expires events after 30 seconds', () => {
    vi.useFakeTimers()
    const first = setup()
    first.analytics.initializeAnalytics()
    for (let count = 0; count < 105; count++) first.analytics.trackEvent('app_ready')
    first.ready()
    expect(first.tracker.track).toHaveBeenCalledTimes(100)
    const second = setup()
    second.analytics.initializeAnalytics()
    second.analytics.trackEvent('app_ready')
    vi.advanceTimersByTime(30_000)
    second.ready()
    expect(second.tracker.track).not.toHaveBeenCalled()
  })

  it('discards failed loads and safely absorbs throwing or rejected tracker calls', async () => {
    const blocked = setup()
    blocked.analytics.initializeAnalytics()
    blocked.analytics.trackEvent('app_ready')
    blocked.scripts[0].onerror?.call(blocked.scripts[0], new Event('error'))
    blocked.ready()
    expect(blocked.tracker.track).not.toHaveBeenCalled()
    expect(blocked.analytics.getTrackingStatus()).toMatchObject({ active: false, reason: 'script-unavailable' })
    const rejecting = setup()
    rejecting.analytics.initializeAnalytics()
    rejecting.tracker.identify.mockImplementation(() => Promise.reject(new Error('PRIVATE')))
    rejecting.tracker.track.mockImplementation(() => { throw new Error('PRIVATE') })
    expect(() => { rejecting.analytics.updateAnalyticsContext(context); rejecting.ready(); rejecting.analytics.trackEvent('app_ready') }).not.toThrow()
    await Promise.resolve()
  })
})
