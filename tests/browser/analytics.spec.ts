import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib'
import { build as buildVite } from 'vite'
import react from '@vitejs/plugin-react'
import type { Catalog } from '../../src/domain/types'
import { emptyProfile } from '../../src/domain/types'
import { visibility } from '../../src/domain/rules'
import { encodeGameSaveFixture, nativeSaveFixture } from '../fixtures/game-save'

const fixtureRoot = 'tests/fixtures/umami-3.4.0'
const provenance = JSON.parse(readFileSync(`${fixtureRoot}/provenance.json`, 'utf8')) as { artifacts: Record<string, string> }
const officialScripts = Object.fromEntries(['script.js', 'recorder.js'].map((name) => {
  const bytes = readFileSync(`${fixtureRoot}/${name}`)
  if (createHash('sha256').update(bytes).digest('hex') !== provenance.artifacts[name]) throw new Error(`Unreviewed Umami fixture: ${name}`)
  return [name, bytes.toString('utf8')]
}))
const websiteId = '11111111-2222-4333-8444-555555555555'
const preferenceKey = 'idle-slayer-ascension-map.analytics.v1'
const profileKey = 'idle-slayer-ascension-map.profile.v1'
const fixturePath = '/__analytics-fixture/'
const appFixturePath = '/__analytics-app/'
const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Catalog
const initial = emptyProfile(catalog.revision)
const visible = visibility(catalog, initial)
const firstUpgrade = catalog.upgrades.find((upgrade) => upgrade.id === catalog.startId)!
const secrets = {
  query: 'SENTINEL-private-search-20498',
  url: 'SENTINEL-private-url-86572',
  file: 'SENTINEL-private-filename-31094.sav',
  native: 'SENTINEL-native-account-48027@example.invalid',
  unknown: 'SENTINEL-unknown-profile-id-58162',
  blocked: 'SENTINEL-blocked-widget-69317',
  error: 'SENTINEL-runtime-error-73421',
}
const publicMarker = 'PUBLIC-replay-proof-42816'
let harnessPromise: Promise<string> | undefined
let applicationPromise: Promise<Map<string, { body: Buffer | string; contentType: string }>> | undefined

function applicationAssets() {
  applicationPromise ??= (async () => {
    const adapter = resolve('tests/fixtures/analytics-app-adapter.ts')
    const actualAnalytics = resolve('src/analytics.ts')
    const result = await buildVite({
      configFile: false, base: appFixturePath, publicDir: false, logLevel: 'silent',
      plugins: [{
        name: 'isolated-test-analytics-imports', enforce: 'pre',
        resolveId(source, importer) {
          if (!importer || resolve(importer) === adapter || !source.startsWith('.')) return null
          const path = resolve(dirname(importer), source)
          return [actualAnalytics, actualAnalytics.slice(0, -3)].includes(path) ? adapter : null
        },
      }, react()],
      build: { write: false, minify: false },
    })
    const output = Array.isArray(result) ? result[0] : result
    if (!('output' in output)) throw new Error('Isolated application produced no bundle')
    return new Map(output.output.map((item) => [item.fileName, {
      body: item.type === 'chunk' ? item.code : typeof item.source === 'string' ? item.source : Buffer.from(item.source),
      contentType: item.fileName.endsWith('.html') ? 'text/html' : item.fileName.endsWith('.css') ? 'text/css' : item.fileName.endsWith('.js') ? 'application/javascript' : 'application/octet-stream',
    }]))
  })()
  return applicationPromise
}

async function serveIsolatedApplication(context: BrowserContext, origin: string) {
  const assets = await applicationAssets()
  const publicDirectory = resolve('public')
  await context.route(`${origin}${appFixturePath}**`, async (route) => {
    const path = new URL(route.request().url()).pathname.slice(appFixturePath.length) || 'index.html'
    const asset = assets.get(path)
    if (asset) { await route.fulfill(asset); return }
    const file = resolve(publicDirectory, path)
    if (!file.startsWith(`${publicDirectory}${sep}`) || !existsSync(file) || !/\.(?:json|png)$/.test(file)) throw new Error(`Unexpected isolated app asset: ${path}`)
    await route.fulfill({ body: readFileSync(file), contentType: file.endsWith('.json') ? 'application/json' : 'image/png' })
  })
}

function harnessSource() {
  harnessPromise ??= (async () => {
    const result = await buildVite({
      configFile: false,
      logLevel: 'silent',
      build: { write: false, minify: false, target: 'es2022', lib: { entry: resolve('tests/fixtures/analytics-harness.ts'), name: 'AnalyticsFixture', formats: ['iife'] } },
    })
    const output = Array.isArray(result) ? result[0] : result
    if (!('output' in output)) throw new Error('Analytics harness produced no browser bundle')
    const chunks = output.output.filter((item) => item.type === 'chunk')
    if (chunks.length !== 1) throw new Error('Analytics harness must remain one isolated browser bundle')
    return chunks[0].code
  })()
  return harnessPromise
}

type Submission = { type: string; payload: Record<string, unknown> }
type ReplayEvent = { type: number | string; timestamp?: number; data?: Record<string, unknown> }
type Capture = { submissions: Submission[]; scriptRequests: string[]; unexpected: string[] }

function parseSubmission(request: Request): Submission {
  let bytes = request.postDataBuffer()
  if (!bytes) throw new Error('Telemetry request did not contain an inspectable body')
  const encoding = request.headers()['content-encoding']
  if (encoding === 'gzip' || (bytes[0] === 0x1f && bytes[1] === 0x8b)) bytes = gunzipSync(bytes)
  else if (encoding === 'deflate') bytes = inflateSync(bytes)
  else if (encoding === 'br') bytes = brotliDecompressSync(bytes)
  else if (encoding && encoding !== 'identity') throw new Error(`Uninspected telemetry encoding: ${encoding}`)
  const value = JSON.parse(bytes.toString('utf8')) as Submission
  if (!value || typeof value.type !== 'string' || !value.payload || typeof value.payload !== 'object') throw new Error('Uninspected telemetry payload shape')
  return value
}

class IncompleteReplayError extends Error {}

function replayEvents(capture: Capture): ReplayEvent[] {
  const events: ReplayEvent[] = []
  const fragments = new Map<string, { total: number; parts: Map<number, string> }>()
  for (const submission of capture.submissions.filter((item) => item.type === 'record')) {
    if (!Array.isArray(submission.payload.events)) throw new Error('Uninspected recorder event encoding')
    for (const event of submission.payload.events as ReplayEvent[]) {
      if (event.type !== 'umami:rrweb-event-fragment') { events.push(event); continue }
      const fragment = event.data
      if (!fragment || typeof fragment.id !== 'string' || !Number.isInteger(fragment.index) || !Number.isInteger(fragment.total) || typeof fragment.value !== 'string') throw new Error('Uninspected recorder fragment')
      const group = fragments.get(fragment.id) ?? { total: fragment.total as number, parts: new Map<number, string>() }
      if (group.total !== fragment.total) throw new Error('Recorder fragment count changed')
      group.parts.set(fragment.index as number, fragment.value)
      fragments.set(fragment.id, group)
    }
  }
  for (const group of fragments.values()) {
    if (group.parts.size !== group.total) throw new IncompleteReplayError('Incomplete recorder event; privacy assertion would be inconclusive')
    const parts = Array.from({ length: group.total }, (_, index) => {
      const part = group.parts.get(index)
      if (part === undefined) throw new Error('Missing recorder event fragment')
      return part
    })
    events.push(JSON.parse(parts.join('')) as ReplayEvent)
  }
  return events
}

async function waitForReplayEvents(capture: Capture, ready: (events: ReplayEvent[]) => boolean): Promise<ReplayEvent[]> {
  let completed: ReplayEvent[] = []
  await expect.poll(() => {
    try {
      const events = replayEvents(capture)
      if (!ready(events)) return false
      completed = events
      return true
    } catch (error) {
      // One rrweb event can span sequential HTTP submissions. Await the rest
      // before reconstruction; malformed or inconsistent evidence still fails.
      if (error instanceof IncompleteReplayError) return false
      throw error
    }
  }, { timeout: 15_000, message: 'Recorder evidence must arrive with every fragment before privacy assertions' }).toBe(true)
  return completed
}

function blockedReplayNodes(value: unknown): { tagName: string; attributes: Record<string, string>; childNodes?: unknown[] }[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(blockedReplayNodes)
  const record = value as { tagName?: string; attributes?: Record<string, string>; childNodes?: unknown[] }
  const here = record.tagName && record.attributes?.class?.includes('telemetry-private') ? [record as { tagName: string; attributes: Record<string, string>; childNodes?: unknown[] }] : []
  return [...here, ...Object.values(value).flatMap(blockedReplayNodes)]
}

async function installLocalRoutes(context: BrowserContext, origin: string, options: { trackerFailure?: boolean; trackerBody?: string; recorderBody?: string; recorderReady?: Promise<void> } = {}): Promise<Capture> {
  const capture: Capture = { submissions: [], scriptRequests: [], unexpected: [] }
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== origin) { capture.unexpected.push(request.url()); await route.abort(); return }
    if (url.pathname === '/script.js' || url.pathname === '/recorder.js') {
      capture.scriptRequests.push(url.pathname)
      if (url.pathname === '/script.js' && options.trackerFailure) { await route.abort(); return }
      await route.fulfill({ contentType: 'application/javascript', body: url.pathname === '/script.js' ? options.trackerBody ?? officialScripts['script.js'] : options.recorderBody ?? officialScripts['recorder.js'] })
      return
    }
    if (url.pathname === `/api/websites/${websiteId}/recorder`) {
      if (options.recorderReady) await options.recorderReady
      await route.fulfill({ json: { enabled: true, replayEnabled: true, heatmapEnabled: true, sampleRate: 1, heatmapSampleRate: 1, maskLevel: 'moderate', maxDuration: 1_200_000, blockSelector: '.telemetry-private' } })
      return
    }
    if (url.pathname === '/api/send' || url.pathname === '/api/record') {
      if (request.method() !== 'POST') { capture.unexpected.push(request.url()); await route.abort(); return }
      capture.submissions.push(parseSubmission(request))
      await route.fulfill({ json: { cache: 'synthetic-local-session-cache' } })
      return
    }
    if (url.pathname.startsWith('/api/')) { capture.unexpected.push(request.url()); await route.abort(); return }
    if (url.pathname === fixturePath || url.pathname === `${fixturePath}index.html`) {
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><title>Local analytics proof</title></head><body><button id="public-action">Local public action</button><input id="private-input" aria-label="Masked fixture input"><div class="telemetry-private rr-block">Private fixture region</div></body></html>' })
      return
    }
    await route.continue()
  })
  return capture
}

async function injectHarness(page: Page, options?: Record<string, unknown>) {
  if (options) await page.evaluate((value) => Object.assign(window, { analyticsTestOptions: value }), options)
  await page.addScriptTag({ content: await harnessSource() })
}

async function initializeHarness(page: Page) {
  await page.evaluate(({ version, revision, upgradeIds, milestoneIds }) => {
    const controller = (window as unknown as { analyticsHarness: {
      updateAnalyticsContext: (context: unknown) => void; initializeAnalytics: () => void; trackEvent: (name: string, data?: Record<string, unknown>) => void
    } }).analyticsHarness
    controller.updateAnalyticsContext({ catalog_version: version, catalog_revision: revision, layout: 'web', spoilers: false, visibleUpgradeIds: new Set(upgradeIds), visibleMilestoneIds: new Set(milestoneIds) })
    controller.initializeAnalytics()
    controller.initializeAnalytics()
    controller.trackEvent('app_ready')
  }, { version: catalog.gameVersion, revision: catalog.revision, upgradeIds: [...visible.ids], milestoneIds: visible.milestones.map((item) => item.id) })
}

async function waitForActive(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { analyticsHarness: { getTrackingStatus: () => { active: boolean } } }).analyticsHarness.getTrackingStatus().active)).toBe(true)
}

async function openProgress(page: Page) {
  const button = page.getByRole('button', { name: 'Progress', exact: true })
  if (!await button.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await button.click()
}

test('local production preview stays untracked and has usable privacy controls', async ({ page, context, baseURL }) => {
  const capture = await installLocalRoutes(context, new URL(baseURL!).origin)
  await page.goto('./')
  await expect(page.locator('.toolbar')).toBeVisible()
  const action = page.getByRole('button', { name: 'Privacy & tracking', exact: true })
  if (!await action.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await action.click()
  await expect(page.getByRole('dialog', { name: 'Privacy & tracking', exact: true })).toBeVisible()
  expect(capture.scriptRequests).toEqual([])
  expect(capture.submissions).toEqual([])
  expect(capture.unexpected).toEqual([])
})

test('isolated loader loads each official script once and strips URL secrets before recording', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const capture = await installLocalRoutes(context, origin)
  await page.goto(`${origin}${fixturePath}?private=${secrets.url}&utm_source=local-proof#${secrets.url}`)
  await injectHarness(page)
  await initializeHarness(page)
  await waitForActive(page)
  await expect.poll(() => capture.submissions.some((item) => item.type === 'record')).toBe(true)
  expect(page.url()).toBe(`${origin}${fixturePath}`)
  expect(capture.scriptRequests.filter((path) => path === '/script.js')).toHaveLength(1)
  expect(capture.scriptRequests.filter((path) => path === '/recorder.js')).toHaveLength(1)
  const named = capture.submissions.filter((item) => item.type === 'event' && item.payload.name === 'app_ready')
  expect(named).toHaveLength(1)
  expect(named[0].payload.url).toBe(`${origin}${fixturePath}?utm_source=local-proof`)
  expect(capture.submissions.every((item) => item.payload.website === websiteId)).toBe(true)
  expect(JSON.stringify(capture.submissions)).not.toContain(secrets.url)
  expect(capture.unexpected).toEqual([])
})

test('initial opt-out, privacy signals, unreadable preference, and origin gates load no scripts', async ({ browser, baseURL }) => {
  const origin = new URL(baseURL!).origin
  for (const scenario of ['stored-off', 'url-off', 'storage-unavailable', 'dnt', 'gpc', 'development', 'wrong-host', 'wrong-path']) {
    const context = await browser.newContext()
    const capture = await installLocalRoutes(context, origin)
    const page = await context.newPage()
    await page.addInitScript(({ key, scenario }) => {
      if (scenario === 'stored-off') localStorage.setItem(key, 'disabled')
      if (scenario === 'storage-unavailable') Storage.prototype.getItem = () => { throw new Error('Synthetic inaccessible storage') }
      if (scenario === 'dnt') Object.defineProperty(navigator, 'doNotTrack', { value: '1' })
      if (scenario === 'gpc') Object.defineProperty(navigator, 'globalPrivacyControl', { value: true })
    }, { key: preferenceKey, scenario })
    await page.goto(`${origin}${fixturePath}${scenario === 'url-off' ? '#analytics=off' : ''}`)
    await injectHarness(page, scenario === 'development' ? { production: false } : scenario === 'wrong-host' ? { hostname: 'unsupported.invalid' } : scenario === 'wrong-path' ? { basePath: '/unsupported/' } : undefined)
    await initializeHarness(page)
    const status = await page.evaluate(() => (window as unknown as { analyticsHarness: { getTrackingStatus: () => { enabled: boolean } } }).analyticsHarness.getTrackingStatus())
    expect(status.enabled, scenario).toBe(false)
    expect(capture.scriptRequests, scenario).toEqual([])
    expect(capture.submissions, scenario).toEqual([])
    expect(capture.unexpected, scenario).toEqual([])
    await context.close()
  }
})

test('iframe gate blocks loader in an actual embedded document', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const capture = await installLocalRoutes(context, origin)
  await page.goto(`${origin}${fixturePath}`)
  await page.evaluate((src) => { const iframe = document.createElement('iframe'); iframe.src = src; document.body.appendChild(iframe) }, `${origin}${fixturePath}`)
  await expect.poll(() => page.frames().find((candidate) => candidate !== page.mainFrame() && candidate.url() === `${origin}${fixturePath}`)?.url()).toBe(`${origin}${fixturePath}`)
  const embedded = page.frames().find((candidate) => candidate !== page.mainFrame())!
  await embedded.addScriptTag({ content: await harnessSource() })
  const status = await embedded.evaluate(() => {
    const controller = (window as unknown as { analyticsHarness: { initializeAnalytics: () => void; getTrackingStatus: () => { reason: string } } }).analyticsHarness
    controller.initializeAnalytics()
    return controller.getTrackingStatus()
  })
  expect(status.reason).toBe('embedded')
  expect(capture.scriptRequests).toEqual([])
  expect(capture.submissions).toEqual([])
  expect(capture.unexpected).toEqual([])
})

test('opt-out stops recorder sends and reload never restarts scripts', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const capture = await installLocalRoutes(context, origin)
  await page.addInitScript(() => Object.assign(window, { analyticsDocumentInstance: Math.random().toString() }))
  await page.goto(`${origin}${fixturePath}`)
  const initialDocument = await page.evaluate(() => (window as unknown as { analyticsDocumentInstance: string }).analyticsDocumentInstance)
  await injectHarness(page)
  await initializeHarness(page)
  await waitForActive(page)
  await expect.poll(() => capture.submissions.some((item) => item.type === 'record')).toBe(true)
  const reloadURL = await page.evaluate(() => (window as unknown as { analyticsHarness: { setTrackingPreference: (enabled: boolean) => { reloadURL: string } } }).analyticsHarness.setTrackingPreference(false).reloadURL)
  await Promise.all([page.waitForEvent('load'), page.evaluate((url) => {
    history.replaceState(history.state, '', url)
    location.reload()
  }, reloadURL)])
  expect(await page.evaluate(() => (window as unknown as { analyticsDocumentInstance: string }).analyticsDocumentInstance)).not.toBe(initialDocument)
  capture.scriptRequests.length = 0
  const afterReload = capture.submissions.length
  await injectHarness(page)
  await initializeHarness(page)
  await page.locator('#public-action').click()
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe('disabled')
  expect(capture.scriptRequests).toEqual([])
  expect(capture.submissions).toHaveLength(afterReload)
  expect(capture.unexpected).toEqual([])
})

test('cross-tab opt-out never uploads disabled-period replay activity after another tab enables tracking', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const capture = await installLocalRoutes(context, origin)
  await page.addInitScript(() => Object.assign(window, { analyticsDocumentInstance: Math.random().toString() }))
  await page.goto(`${origin}${fixturePath}`)
  const originalDocument = await page.evaluate(() => (window as unknown as { analyticsDocumentInstance: string }).analyticsDocumentInstance)
  await injectHarness(page)
  await initializeHarness(page)
  await waitForActive(page)
  await expect.poll(() => capture.submissions.some((item) => item.type === 'record')).toBe(true)
  const otherTab = await context.newPage()
  await otherTab.goto(`${origin}${fixturePath}`)
  await otherTab.evaluate((key) => localStorage.setItem(key, 'disabled'), preferenceKey)
  const status = () => page.evaluate(() => (window as unknown as { analyticsHarness: { getTrackingStatus: () => { active: boolean; reason: string } } }).analyticsHarness.getTrackingStatus())
  await expect.poll(status).toMatchObject({ active: false, reason: 'opt-out' })
  const disabledMarker = 'SENTINEL-disabled-period-replay-51793'
  await page.evaluate((marker) => {
    const progress = document.createElement('p')
    progress.id = 'session-progress'
    progress.textContent = marker
    document.body.appendChild(progress)
  }, disabledMarker)
  await otherTab.evaluate((key) => localStorage.setItem(key, 'enabled'), preferenceKey)
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe('enabled')
  // A real rrweb upload after re-enabling used to contain the mutation above.
  // Wait through two recorder flush intervals and use a trusted click to also
  // exercise heatmap collection after the preference changed.
  await page.locator('#public-action').click()
  await page.waitForTimeout(6000)
  expect(JSON.stringify(replayEvents(capture))).not.toContain(disabledMarker)
  expect(await status()).toMatchObject({ active: false, reason: 'reload-required' })
  expect(await page.evaluate(() => (window as unknown as { analyticsDocumentInstance: string }).analyticsDocumentInstance)).toBe(originalDocument)
  await expect(page.locator('#session-progress')).toHaveText(disabledMarker)
  const beforeReload = capture.submissions.length
  await page.reload()
  await injectHarness(page)
  await initializeHarness(page)
  await waitForActive(page)
  await expect.poll(() => capture.submissions.slice(beforeReload).some((item) => item.type === 'record')).toBe(true)
  expect(await page.evaluate(() => (window as unknown as { analyticsDocumentInstance: string }).analyticsDocumentInstance)).not.toBe(originalDocument)
  expect(JSON.stringify(replayEvents(capture))).not.toContain(disabledMarker)
  expect(capture.unexpected).toEqual([])
})

test('cross-tab opt-out also suspends a recorder whose configuration finishes loading later', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin
  let releaseRecorder!: () => void
  const recorderReady = new Promise<void>((resolve) => { releaseRecorder = resolve })
  const capture = await installLocalRoutes(context, origin, { recorderReady })
  await page.goto(`${origin}${fixturePath}`)
  await injectHarness(page)
  await initializeHarness(page)
  await waitForActive(page)
  const otherTab = await context.newPage()
  await otherTab.goto(`${origin}${fixturePath}`)
  await otherTab.evaluate((key) => localStorage.setItem(key, 'disabled'), preferenceKey)
  await expect.poll(() => page.evaluate(() => (window as unknown as { analyticsHarness: { getTrackingStatus: () => { active: boolean } } }).analyticsHarness.getTrackingStatus().active)).toBe(false)
  releaseRecorder()
  const disabledMarker = 'SENTINEL-delayed-recorder-50826'
  await page.evaluate((marker) => { document.querySelector('#public-action')!.textContent = marker }, disabledMarker)
  await otherTab.evaluate((key) => localStorage.setItem(key, 'enabled'), preferenceKey)
  await page.waitForTimeout(6000)
  expect(JSON.stringify(replayEvents(capture))).not.toContain(disabledMarker)
  expect(await page.evaluate(() => (window as unknown as { analyticsHarness: { getTrackingStatus: () => { active: boolean; reason: string } } }).analyticsHarness.getTrackingStatus())).toMatchObject({ active: false, reason: 'reload-required' })
  expect(capture.unexpected).toEqual([])
})

test('failed preference writes provide a disabled reload URL without claiming persistence', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const capture = await installLocalRoutes(context, origin)
  await page.goto(`${origin}${fixturePath}`)
  await injectHarness(page)
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Synthetic quota failure') } })
  const result = await page.evaluate(() => (window as unknown as { analyticsHarness: { setTrackingPreference: (enabled: boolean) => { persisted: boolean; reloadURL: string } } }).analyticsHarness.setTrackingPreference(false))
  expect(result.persisted).toBe(false)
  expect(result.reloadURL).toBe(`${origin}${fixturePath}#analytics=off`)
  await page.goto(result.reloadURL)
  await injectHarness(page)
  await initializeHarness(page)
  expect(capture.scriptRequests).toEqual([])
  expect(capture.submissions).toEqual([])
  expect(capture.unexpected).toEqual([])
})

test('unavailable tracker is optional and leaves the isolated page usable', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const capture = await installLocalRoutes(context, origin, { trackerFailure: true, recorderBody: '' })
  await page.goto(`${origin}${fixturePath}`)
  await injectHarness(page)
  await initializeHarness(page)
  await expect.poll(() => page.evaluate(() => (window as unknown as { analyticsHarness: { getTrackingStatus: () => { reason: string } } }).analyticsHarness.getTrackingStatus().reason)).toBe('script-unavailable')
  await page.locator('#private-input').fill('Usable local input')
  await expect(page.locator('#private-input')).toHaveValue('Usable local input')
  expect(capture.submissions).toEqual([])
  expect(capture.unexpected).toEqual([])
})

test('catalog parsing errors show only fixed public wording in the actual recorded application', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const capture = await installLocalRoutes(context, origin)
  await serveIsolatedApplication(context, origin)
  const marker = 'CATALOG_SECRET'
  const safeError = 'The verified game catalog could not be loaded. Please try again.'
  let releaseCatalog!: () => void
  const catalogReady = new Promise<void>((resolve) => { releaseCatalog = resolve })
  await context.route(`${origin}${appFixturePath}catalog.json`, async (route) => {
    await catalogReady
    await route.fulfill({ contentType: 'application/json', body: marker })
  })
  await page.goto(`${origin}${appFixturePath}`)
  await waitForActive(page)
  await waitForReplayEvents(capture, (events) => events.some((event) => event.type === 2))
  releaseCatalog()
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  const displayedError = (await page.getByRole('status').textContent())!
  const encodedError = JSON.stringify(displayedError).slice(1, -1)
  const events = await waitForReplayEvents(capture, (events) => JSON.stringify(events).includes(encodedError))
  const evidence = JSON.stringify({ submissions: capture.submissions, replay: events })
  expect(evidence.includes(marker), 'Raw catalog parser detail leaked into telemetry').toBe(false)
  await expect(page.getByRole('status')).toHaveText(safeError)
  expect(JSON.stringify(events).includes(safeError), 'The fixed public error was absent from the real recording').toBe(true)
  await expect(page.locator('body')).not.toContainText(marker)
  const failures = capture.submissions.filter((item) => item.payload.name === 'catalog_error')
  expect(failures).toHaveLength(1)
  expect(failures[0].payload.data).toMatchObject({ reason: 'validation' })
  expect(capture.unexpected).toEqual([])
})

test('real recorder proves moderate input masking, blocking and safe application save import', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin
  let releaseRecorder!: () => void
  const recorderReady = new Promise<void>((resolve) => { releaseRecorder = resolve })
  const capture = await installLocalRoutes(context, origin, { recorderReady })
  await serveIsolatedApplication(context, origin)
  const hidden = catalog.upgrades.find((upgrade) => !visible.ids.has(upgrade.id) && upgrade.activation === 'after-ultra-ascension')!
  await page.addInitScript(({ key, profile }) => localStorage.setItem(key, JSON.stringify(profile)), {
    key: profileKey, profile: { ...initial, purchases: { [secrets.unknown]: { epoch: 0, active: false } } },
  })
  await page.goto(`${origin}${appFixturePath}?private=${secrets.url}#${secrets.url}`)
  await expect(page.locator('.toolbar')).toBeVisible()
  await page.evaluate(({ publicMarker, blocked }) => {
    const fixture = document.createElement('aside')
    fixture.style.cssText = 'position:fixed;top:120px;right:4px;z-index:100;background:#231e19;padding:4px'
    fixture.innerHTML = '<label>Masked replay proof<input id="replay-mask-proof" type="text"></label><p id="replay-public-proof"></p><p class="telemetry-private rr-block"></p>'
    fixture.querySelector('#replay-public-proof')!.textContent = publicMarker
    fixture.querySelector('.telemetry-private')!.textContent = blocked
    document.body.appendChild(fixture)
  }, { publicMarker, blocked: secrets.blocked })
  await waitForActive(page)
  releaseRecorder()
  await waitForReplayEvents(capture, (events) => events.some((event) => event.type === 2))
  await page.locator('#replay-mask-proof').fill(secrets.query)
  await page.locator('#replay-public-proof').click()
  await page.getByRole('searchbox').fill(secrets.query)
  await page.getByRole('searchbox').fill('')
  await page.keyboard.press('Escape')
  await openProgress(page)
  await page.locator('input[aria-label="Idle Slayer game save"]').setInputFiles({ name: secrets.file, mimeType: 'application/octet-stream', buffer: Buffer.from(encodeGameSaveFixture(nativeSaveFixture({ epoch: '1', integers: { [catalog.startId]: 1, [hidden.id]: 1 }, strings: { 'Fixture account preference': secrets.native } }))) })
  const preview = page.getByRole('dialog', { name: 'Import game progress', exact: true })
  await expect(preview.getByRole('button', { name: 'Apply import', exact: true })).toBeVisible()
  await expect(preview).not.toContainText(hidden.title)
  await preview.getByRole('button', { name: 'Apply import', exact: true }).click()
  await page.evaluate(({ secrets, visibleId }) => {
    const controller = (window as unknown as { analyticsHarness: { trackEvent: (name: string, data: Record<string, unknown>) => void } }).analyticsHarness
    controller.trackEvent('search_performed', { query_length: '31+', results: '0', query: secrets.query, file: secrets.file, native: secrets.native })
    controller.trackEvent('upgrade_selected', { upgrade_id: visibleId, source: 'map', unknown: secrets.unknown })
    controller.trackEvent('upgrade_selected', { upgrade_id: secrets.unknown, source: 'map' })
    controller.trackEvent('runtime_error', { reason: 'runtime', message: secrets.error })
  }, { secrets, visibleId: catalog.startId })
  const events = await waitForReplayEvents(capture, (events) =>
    events.some((event) => event.type === 3 && event.data?.source === 5)
    && capture.submissions.some((item) => item.type === 'heatmap' && Array.isArray(item.payload.events)
      && item.payload.events.some((event: { type: string }) => event.type === 'click')))
  expect(events.some((event) => event.type === 2 && JSON.stringify(event).includes(publicMarker))).toBe(true)
  expect(events.some((event) => event.type === 2 && JSON.stringify(event).includes(firstUpgrade.title))).toBe(true)
  expect(events.some((event) => event.type === 3 && event.data?.source === 5 && typeof event.data.text === 'string' && /^\*+$/.test(event.data.text))).toBe(true)
  const blocked = blockedReplayNodes(events)
  expect(blocked.some((node) => node.tagName === 'table' && node.attributes.class.includes('game-save-import-comparison'))).toBe(true)
  expect(blocked.length).toBeGreaterThan(0)
  expect(blocked.every((node) => node.childNodes?.length === 0)).toBe(true)
  const decoded = JSON.stringify({ submissions: capture.submissions, replay: events })
  // Report a bounded boolean on failure, not megabytes of replay data.
  for (const sentinel of Object.values(secrets)) expect(decoded.includes(sentinel), `Leaked synthetic marker: ${sentinel}`).toBe(false)
  const initialSnapshot = events.find((event) => event.type === 2)!
  expect(JSON.stringify(initialSnapshot).includes(hidden.id), 'Initially hidden upgrade appeared in the initial recording').toBe(false)
  // Owned imports can legitimately reveal a previously hidden upgrade. The
  // preview must exclude it; after applying, the ordinary map visibility wins.
  const imported = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), profileKey)
  expect(visibility(catalog, imported).ids.has(hidden.id)).toBe(true)
  expect(decoded.includes('Fixture account preference')).toBe(false)
  expect(capture.submissions.every((item) => item.payload.website === websiteId)).toBe(true)
  for (const submission of capture.submissions.filter((item) => item.type === 'heatmap')) {
    expect(Array.isArray(submission.payload.events)).toBe(true)
    for (const event of submission.payload.events as Record<string, unknown>[]) {
      expect(new URL(event.url as string).search).toBe('')
      expect(new URL(event.url as string).hash).toBe('')
      expect(Object.keys(event).every((key) => ['type', 'url', 'timestamp', 'x', 'y', 'pageX', 'pageY', 'pageW', 'pageH', 'viewportW', 'viewportH', 'scrollPct'].includes(key))).toBe(true)
    }
  }
  expect(capture.unexpected).toEqual([])
})

test('actual application handlers count confirmed purchase and recommendation once and exclude cancellations', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const capture = await installLocalRoutes(context, origin, { recorderBody: '' })
  await serveIsolatedApplication(context, origin)
  await page.goto(`${origin}${appFixturePath}`)
  await expect(page.locator('.toolbar')).toBeVisible()
  await waitForActive(page)
  const count = (name: string) => capture.submissions.filter((submission) => submission.type === 'event' && submission.payload.name === name).length
  await expect.poll(() => count('app_ready')).toBe(1)
  await page.locator(`.react-flow__node[data-id="${catalog.startId}"]`).click()
  await expect.poll(() => count('upgrade_selected')).toBe(1)
  const other = visible.upgrades.find((upgrade) => upgrade.id !== catalog.startId)!
  for (const upgrade of [other, firstUpgrade]) {
    await page.getByRole('searchbox').fill(upgrade.title)
    await page.locator('.search-result').filter({ hasText: upgrade.title }).first().click()
    await expect(page.locator('.details h2')).toHaveText(upgrade.title)
  }
  await expect.poll(() => count('upgrade_selected')).toBe(3)
  expect(capture.submissions.filter((submission) => submission.payload.name === 'upgrade_selected').slice(1).every((submission) => (submission.payload.data as Record<string, unknown>).source === 'search')).toBe(true)
  await page.locator(`.react-flow__node[data-id="${catalog.startId}"]`).click()
  expect(count('upgrade_selected')).toBe(3)
  await page.getByRole('button', { name: 'Record purchase…', exact: true }).click()
  const purchase = page.getByRole('dialog', { name: 'Record purchase?', exact: true })
  await expect(purchase).toBeVisible()
  await purchase.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect.poll(() => count('purchase_cancelled')).toBe(1)
  expect(count('purchase_applied')).toBe(0)
  await page.getByRole('button', { name: 'Record purchase…', exact: true }).click()
  await purchase.getByRole('button', { name: 'Apply purchases', exact: true }).click()
  await expect.poll(() => count('purchase_applied')).toBe(1)
  expect(count('purchase_started')).toBe(2)
  expect(count('purchase_previewed')).toBe(2)
  await page.getByRole('button', { name: 'Next upgrade', exact: true }).click()
  const recommendations = page.getByRole('dialog', { name: 'Suggested next upgrade', exact: true })
  await expect(recommendations.locator('.recommendation-main')).toBeVisible()
  await recommendations.getByRole('button', { name: 'Record purchase…', exact: true }).click()
  await purchase.getByRole('button', { name: 'Apply purchases', exact: true }).click()
  await expect.poll(() => count('recommendation_purchase_applied')).toBe(1)
  expect(count('recommendation_purchase_started')).toBe(1)
  expect(count('recommendations_viewed')).toBe(1)
  expect(count('purchase_applied')).toBe(2)
  const current = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), profileKey)
  const currentVisible = visibility(catalog, current)
  const hidden = catalog.upgrades.find((upgrade) => !currentVisible.ids.has(upgrade.id)
    && catalog.upgrades.every((other) => other.id === upgrade.id || !other.title.toLowerCase().includes(upgrade.title.toLowerCase())))!
  expect(hidden).toBeDefined()
  const hiddenSelections = () => capture.submissions.filter((submission) => submission.payload.name === 'upgrade_selected'
    && (submission.payload.data as Record<string, unknown>).upgrade_id === hidden.id).length
  const showSpoilers = async (enabled: boolean) => {
    const checkbox = page.getByRole('checkbox', { name: 'Show spoilers', exact: true })
    if (!await checkbox.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
    await checkbox.setChecked(enabled)
    const options = page.getByRole('dialog', { name: 'Map options', exact: true })
    if (await options.isVisible()) await options.getByRole('button', { name: 'Close dialog', exact: true }).click()
  }
  for (const expectedSelections of [1, 2]) {
    await showSpoilers(true)
    await page.getByRole('searchbox').fill(hidden.title)
    await page.locator('.search-result').filter({ hasText: hidden.title }).first().click()
    await expect(page.locator('.details h2')).toHaveText(hidden.title)
    await expect.poll(hiddenSelections).toBe(expectedSelections)
    if (expectedSelections === 1) {
      await showSpoilers(false)
      await expect(page.locator('.details')).toHaveCount(0)
      await expect(page.locator(`.react-flow__node[data-id="${hidden.id}"]`)).toHaveCount(0)
    }
  }
  expect(capture.unexpected).toEqual([])
})

test('renamed layout controls retain bounded game and web analytics values', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const capture = await installLocalRoutes(context, origin, { recorderBody: '' })
  await serveIsolatedApplication(context, origin)
  await page.goto(`${origin}${appFixturePath}`)
  await expect(page.locator('.toolbar')).toBeVisible()
  await waitForActive(page)
  const events = (name: string) => capture.submissions.filter((submission) => submission.type === 'event' && submission.payload.name === name)
  await expect.poll(() => events('app_ready').length).toBe(1)
  expect((events('app_ready')[0].payload.data as Record<string, unknown>).layout).toBe('game')
  const layout = page.getByRole('group', { name: 'Map layout', exact: true })
  await expect(layout.getByRole('button')).toHaveText(['Game Layout', 'Detailed Layout'])
  await layout.getByRole('button', { name: 'Detailed Layout', exact: true }).click()
  await expect.poll(() => events('map_layout_changed').map((event) => (event.payload.data as Record<string, unknown>).layout)).toEqual(['web'])
  await layout.getByRole('button', { name: 'Game Layout', exact: true }).click()
  await expect.poll(() => events('map_layout_changed').map((event) => (event.payload.data as Record<string, unknown>).layout)).toEqual(['web', 'game'])
  await layout.getByRole('button', { name: 'Game Layout', exact: true }).click()
  expect(events('map_layout_changed')).toHaveLength(2)
  expect(await page.evaluate(() => localStorage.getItem('idle-slayer-ascension-map.layout.v1'))).toBe('native')
  expect(await page.evaluate((key) => localStorage.getItem(key), profileKey)).toBeNull()
  expect(capture.unexpected).toEqual([])
})

test('actual import cancellation never applies and confirmation emits one applied event', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const capture = await installLocalRoutes(context, origin, { recorderBody: '' })
  await serveIsolatedApplication(context, origin)
  await page.goto(`${origin}${appFixturePath}`)
  await expect(page.locator('.toolbar')).toBeVisible()
  await waitForActive(page)
  const count = (name: string) => capture.submissions.filter((submission) => submission.type === 'event' && submission.payload.name === name).length
  await openProgress(page)
  const choose = async () => {
    const fileChooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import game save…', exact: true }).click()
    await (await fileChooser).setFiles({ name: secrets.file, mimeType: 'application/octet-stream', buffer: Buffer.from(encodeGameSaveFixture(nativeSaveFixture({ integers: { [catalog.startId]: 1 }, strings: { 'Unrelated fixture preference': secrets.native } }))) })
    const preview = page.getByRole('dialog', { name: 'Import game progress', exact: true })
    await expect(preview.getByRole('button', { name: 'Apply import', exact: true })).toBeVisible()
    return preview
  }
  const cancelled = await choose()
  await cancelled.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect.poll(() => count('game_import_cancelled')).toBe(1)
  expect(count('game_import_applied')).toBe(0)
  const confirmed = await choose()
  await confirmed.getByRole('button', { name: 'Apply import', exact: true }).click()
  await expect.poll(() => count('game_import_applied')).toBe(1)
  expect(count('game_import_started')).toBe(2)
  expect(count('game_import_previewed')).toBe(2)
  expect(JSON.stringify(capture.submissions)).not.toContain(secrets.file)
  expect(JSON.stringify(capture.submissions)).not.toContain(secrets.native)
  expect(capture.unexpected).toEqual([])
})

test('unsaved progress opt-out preserves cancellation and exports current memory before reload', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const capture = await installLocalRoutes(context, origin, { recorderBody: '' })
  await serveIsolatedApplication(context, origin)
  await page.addInitScript(({ key, original }) => {
    localStorage.setItem(key, JSON.stringify(original))
    const originalSet = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new Error('Synthetic profile-only write failure')
      return originalSet.call(this, name, value)
    }
  }, { key: profileKey, original: initial })
  await page.goto(`${origin}${appFixturePath}`)
  await expect(page.locator('.toolbar')).toBeVisible()
  await waitForActive(page)
  await page.locator(`.react-flow__node[data-id="${catalog.startId}"]`).click()
  await page.getByRole('button', { name: 'Record purchase…', exact: true }).click()
  await page.getByRole('dialog', { name: 'Record purchase?', exact: true }).getByRole('button', { name: 'Apply purchases', exact: true }).click()
  const purchased = page.locator(`.react-flow__node[data-id="${catalog.startId}"] .upgrade-node.purchased`)
  await expect(purchased).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Progress could not be saved')
  await expect.poll(() => capture.submissions.some((submission) => submission.payload.name === 'storage_error')).toBe(true)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), profileKey)).toEqual(initial)
  const action = page.getByRole('button', { name: 'Privacy & tracking', exact: true })
  if (!await action.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await action.click()
  const privacy = page.getByRole('dialog', { name: 'Privacy & tracking', exact: true })
  await privacy.getByRole('button', { name: 'Disable tracking and reload', exact: true }).click()
  const warning = page.getByRole('dialog', { name: 'Reload with unsaved progress?', exact: true })
  await expect(warning).toContainText('Reloading may lose these changes')
  await warning.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(privacy).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBeNull()
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), profileKey)).toEqual(initial)
  await privacy.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(purchased).toBeVisible()
  if (!await action.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await action.click()
  await privacy.getByRole('button', { name: 'Disable tracking and reload', exact: true }).click()
  await expect(warning).toBeVisible()
  capture.scriptRequests.length = 0
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.waitForEvent('load'),
    warning.getByRole('button', { name: 'Export backup and reload', exact: true }).click(),
  ])
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const backup = JSON.parse(readFileSync(downloadPath!, 'utf8'))
  expect(backup.purchases[catalog.startId]).toEqual({ epoch: 0, active: true })
  await expect(page.locator('.toolbar')).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe('disabled')
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), profileKey)).toEqual(initial)
  expect(capture.scriptRequests).toEqual([])
  expect(capture.unexpected).toEqual([])
})
