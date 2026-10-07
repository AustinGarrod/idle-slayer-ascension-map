import { expect, test, type Page } from '@playwright/test'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve, sep } from 'node:path'
import { offlineRelease, renderWorker } from '../../scripts/pwa'
import { emptyProfile } from '../../src/domain/types'
import { PROFILE_STORAGE_KEY } from '../../src/domain/storage'
import { ANALYTICS_PREFERENCE_KEY } from '../../src/analytics'
import { LAYOUT_PREFERENCE_KEY } from '../../src/domain/layout-preference'

test.use({ serviceWorkers: 'allow' })
const base = '/idle-slayer-ascension-map/'
const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8'))
async function openInstall(page: Page) {
  await expect(page.locator('.toolbar')).toBeVisible()
  const button = page.getByRole('button', { name: 'Install & offline', exact: true }).first()
  if (!await button.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await page.getByRole('button', { name: 'Install & offline', exact: true }).first().click()
}
async function offlineReady(page: Page) {
  await openInstall(page)
  await expect(page.locator('.offline-status')).toContainText('saved for offline reopening', { timeout: 45000 })
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.reload()
  await expect(page.locator('.toolbar')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
}
async function purchase(page: Page) {
  await page.getByRole('button', { name: 'Return to start', exact: true }).click()
  await page.getByRole('button', { name: 'Record purchase…', exact: true }).click()
  await page.getByRole('button', { name: 'Apply purchases', exact: true }).click()
  await expect.poll(() => page.evaluate(({ key, id }) => Boolean(JSON.parse(localStorage.getItem(key) ?? '{}').purchases?.[id]), { key: PROFILE_STORAGE_KEY, id: catalog.startId })).toBe(true)
}

test('complete manifest, offline reopen and new-window purchases persist without caching private requests', async ({ page, context }) => {
  await page.goto('./')
  await offlineReady(page)
  const manifest = await page.evaluate(async () => await (await fetch(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href)).json())
  expect(manifest).toMatchObject({ id: base, start_url: base, scope: base, display: 'standalone' })
  expect(manifest.icons.map((icon: { purpose: string }) => icon.purpose)).toEqual(['any', 'any', 'maskable'])
  await page.evaluate(async () => {
    await fetch('catalog.json?transfer=synthetic-private-marker').catch(() => {})
    await fetch('synthetic-private-backup.json').catch(() => {})
    await fetch('https://analytics.invalid/api/send', { method: 'POST', body: 'synthetic-private-marker' }).catch(() => {})
  })
  const keys = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (name) => (await (await caches.open(name)).keys()).map((request) => request.url)))).flat())
  const inventory = JSON.parse(readFileSync('dist/offline-assets.json', 'utf8'))
  expect(keys).toHaveLength(inventory.assets.length)
  expect(keys.every((url) => url.startsWith(new URL(base, page.url()).href) && !url.includes('?') && !url.includes('#') && !url.includes('synthetic'))).toBe(true)
  expect(keys.filter((url) => url.includes('/assets/upgrades/'))).toHaveLength(288)
  expect(keys.some((url) => url.endsWith('.woff2'))).toBe(true)
  expect(keys.some((url) => url.endsWith('/licenses/index.html'))).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.toolbar')).toBeVisible()
  await purchase(page)
  const offlineWindow = await context.newPage()
  await offlineWindow.goto(page.url())
  await expect(offlineWindow.locator('.toolbar')).toBeVisible()
  await expect(offlineWindow.locator('.map-summary')).toContainText('1 /')
  expect(await offlineWindow.locator('.upgrade-icon').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  await offlineWindow.goto(new URL('licenses/index.html', page.url()).href)
  await expect(offlineWindow.getByRole('heading', { name: 'Bundled software licenses', exact: true })).toBeVisible()
})

test('unsupported prompts, supported prompt and standalone guidance stay truthful', async ({ page }) => {
  await page.goto('./'); await openInstall(page)
  await expect(page.getByRole('button', { name: 'Install Ascension Map', exact: true })).toHaveCount(0)
  await expect(page.locator('.install-guidance')).toContainText('iPhone / iPad')
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt')
    Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) })
    window.dispatchEvent(event)
  })
  await page.getByRole('button', { name: 'Install Ascension Map', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Installation dismissed')
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
  await expect(page.getByRole('dialog')).toContainText('Installed in this browser')
  await expect(page.locator('.install-guidance')).toHaveCount(0)
})

test('install guidance and recovery actions fit narrow portrait and short landscape windows', async ({ page }, testInfo) => {
  await page.goto('./')
  for (const [width, height] of [[320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height }); await openInstall(page)
    const dialog = page.getByRole('dialog', { name: 'Install & offline', exact: true })
    const box = await dialog.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    const repair = page.getByRole('button', { name: 'Repair offline files and reload…', exact: true })
    await repair.scrollIntoViewIfNeeded(); await expect(repair).toBeInViewport()
    await page.screenshot({ path: `C:/Users/Austin/.codex/issue-runs/1406017346/issue-56-install-${testInfo.project.name}-${width}x${height}.png` })
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  }
})

test('denied offline availability explains retry and keeps the online map usable', async ({ page }) => {
  await page.addInitScript(() => {
    const native = navigator.serviceWorker.register.bind(navigator.serviceWorker)
    navigator.serviceWorker.register = (...args) => native(...args).then(() => { throw new DOMException('Synthetic refusal', 'SecurityError') })
  })
  await page.goto('./'); await openInstall(page)
  await expect(page.locator('.offline-status')).toContainText('not ready')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await purchase(page)
})

test('evicted app files explain offline recovery and repairing keeps saved progress', async ({ page, context }) => {
  await page.goto('./'); await offlineReady(page); await purchase(page)
  await page.evaluate(async () => { for (const name of await caches.keys()) await (await caches.open(name)).delete(new URL('index.html', location.href).href) })
  await context.setOffline(true); await page.reload()
  await expect(page.getByRole('heading', { name: 'Reconnect to reopen the map', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Repair app files and reload', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Connect to the internet')
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Repair app files and reload', exact: true }).click()
  await expect(page.locator('.toolbar')).toBeVisible()
  await expect(page.locator('.map-summary')).toContainText('1 /')
  await openInstall(page)
  await expect(page.locator('.offline-status')).toContainText('saved for offline reopening', { timeout: 45000 })
})

test('controlled updates retain profile/preferences, wait through previews, reject other windows and recover unsaved progress', async ({ browser }, testInfo) => {
  const scratch = mkdtempSync(resolve(tmpdir(), 'ascension-pwa-update-'))
  const previous = resolve(scratch, 'previous'), next = resolve(scratch, 'next')
  cpSync('dist', previous, { recursive: true }); cpSync('dist', next, { recursive: true })
  const updatedCatalog = { ...catalog, revision: catalog.revision + '-update-fixture' }
  writeFileSync(resolve(next, 'catalog.json'), JSON.stringify(updatedCatalog))
  const release = offlineRelease(process.cwd(), next)
  writeFileSync(resolve(next, 'offline-assets.json'), JSON.stringify(release))
  writeFileSync(resolve(next, 'sw.js'), renderWorker(process.cwd(), release))
  let directory = previous
  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname
    const file = resolve(directory, path === base ? 'index.html' : path.slice(base.length))
    if (!path.startsWith(base) || !file.startsWith(directory + sep)) { response.writeHead(404).end(); return }
    try {
      const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.webmanifest') ? 'application/manifest+json' : file.endsWith('.json') ? 'application/json' : file.endsWith('.png') ? 'image/png' : 'text/plain'
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(readFileSync(file))
    } catch { response.writeHead(404).end() }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const context = await browser.newContext({ ...testInfo.project.use, serviceWorkers: 'allow' })
  try {
    const profile = emptyProfile(catalog.revision)
    profile.epoch = 3; profile.purchases['future-unknown'] = { epoch: 2, active: false }
    const astral = catalog.upgrades.find((upgrade: { activation: string }) => upgrade.activation === 'after-ultra-ascension')
    profile.purchases[astral.id] = { epoch: 3, active: false }
    profile.milestones['future-milestone'] = true
    const page = await context.newPage()
    await page.addInitScript(({ profile, profileKey, trackingKey, layoutKey }) => {
      if (!localStorage.getItem(profileKey)) {
        localStorage.setItem(profileKey, JSON.stringify(profile)); localStorage.setItem(trackingKey, 'disabled'); localStorage.setItem(layoutKey, 'web')
      }
      const native = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) { if ((window as Window & { denyWrites?: boolean }).denyWrites && key === profileKey) throw new DOMException('Synthetic quota refusal', 'QuotaExceededError'); native.call(this, key, value) }
    }, { profile, profileKey: PROFILE_STORAGE_KEY, trackingKey: ANALYTICS_PREFERENCE_KEY, layoutKey: LAYOUT_PREFERENCE_KEY })
    await page.goto(`http://127.0.0.1:${address.port}${base}#analytics=off`); await offlineReady(page)
    await page.getByRole('button', { name: 'Return to start', exact: true }).click()
    await page.getByRole('button', { name: 'Record purchase…', exact: true }).click()
    directory = next
    await page.evaluate(async () => await (await navigator.serviceWorker.getRegistration())!.update())
    await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())!.waiting)), { timeout: 45000 }).toBe(true)
    await expect(page.getByRole('dialog', { name: 'Record purchase?', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Apply purchases', exact: true }).click()
    await expect.poll(() => page.evaluate(({ key, id }) => Boolean(JSON.parse(localStorage.getItem(key)!).purchases[id]), { key: PROFILE_STORAGE_KEY, id: catalog.startId })).toBe(true)
    const other = await context.newPage(); await other.goto(page.url())
    await expect(other.locator('.toolbar')).toBeVisible()
    await openInstall(page); await page.getByRole('button', { name: 'Update app and reload…', exact: true }).click()
    await page.getByRole('button', { name: 'Reload with saved progress', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('Close other Ascension Map tabs')
    await other.close(); await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
    // Produce unsaved progress, then exercise cancel and backup before update.
    await page.evaluate(() => { (window as Window & { denyWrites?: boolean }).denyWrites = true })
    const spoilers = page.getByRole('checkbox', { name: 'Show spoilers', exact: true })
    if (!await spoilers.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
    await spoilers.check()
    if (await page.getByRole('dialog').count()) await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
    await openInstall(page); await page.getByRole('button', { name: 'Update app and reload…', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Reload the app?', exact: true })).toContainText('unsaved progress')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Install & offline', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Update app and reload…', exact: true }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export backup and reload', exact: true }).click()
    const backup = JSON.parse(readFileSync((await (await download).path())!, 'utf8'))
    expect(backup.showSpoilers).toBe(true)
    await expect(page.locator('.toolbar')).toBeVisible()
    await expect.poll(() => page.evaluate(async () => await caches.keys())).toContain('ascension-map-public-' + release.version)
    await openInstall(page)
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
    const about = page.getByRole('button', { name: 'About & sources', exact: true })
    if (!await about.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
    await about.click()
    await expect(page.getByRole('dialog')).toContainText(updatedCatalog.revision)
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), PROFILE_STORAGE_KEY)
    expect(saved.purchases['future-unknown']).toEqual({ epoch: 2, active: false })
    expect(saved.purchases[astral.id]).toEqual({ epoch: 3, active: false })
    expect(saved.milestones['future-milestone']).toBe(true)
    expect(saved.showSpoilers).toBe(false)
    expect(await page.evaluate((key) => localStorage.getItem(key), ANALYTICS_PREFERENCE_KEY)).toBe('disabled')
    expect(await page.evaluate((key) => localStorage.getItem(key), LAYOUT_PREFERENCE_KEY)).toBe('web')
    expect(new URL(page.url()).hash).toBe('#analytics=off')
  } finally {
    await context.close(); await new Promise<void>((resolve) => server.close(() => resolve()))
    if (!scratch.startsWith(resolve(tmpdir()) + sep + 'ascension-pwa-update-')) throw new Error('Unsafe test cleanup')
    rmSync(scratch, { recursive: true, force: true })
  }
})
