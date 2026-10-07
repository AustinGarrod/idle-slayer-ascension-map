import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { Catalog } from '../../src/domain/types'
import { emptyProfile } from '../../src/domain/types'
import { PROFILE_STORAGE_KEY } from '../../src/domain/storage'
import { PROFILE_WRITE_LOCK } from '../../src/domain/profile-session'

const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Catalog
const savedText = 'Current progress is saved on this device.'
const failedText = 'Current progress is not saved on this device. Export a backup or retry recovery.'
type SaveWindow = Window & { denyProfileWrites?: boolean; denyProfileReads?: boolean; releaseProfileSave?: () => void }

async function openAction(page: Page, name: string) {
  await expect(page.locator('.toolbar')).toBeVisible()
  const action = page.getByRole('button', { name, exact: true })
  if (!await action.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await action.click()
}
async function purchaseStart(page: Page) {
  await expect(page.locator('.toolbar')).toBeVisible()
  await page.getByRole('button', { name: 'Return to start', exact: true }).click()
  await page.getByRole('button', { name: 'Record purchase…', exact: true }).click()
  await page.getByRole('button', { name: 'Apply purchases', exact: true }).click()
}
async function denyWrites(page: Page) {
  await page.addInitScript((key) => {
    const win = window as SaveWindow
    win.denyProfileWrites = true
    const native = Storage.prototype.setItem
    Storage.prototype.setItem = function (target, value) {
      if (target === key && win.denyProfileWrites) throw new DOMException('Synthetic quota refusal', 'QuotaExceededError')
      native.call(this, target, value)
    }
  }, PROFILE_STORAGE_KEY)
}

test('failed writes have truthful footer, options, About and Privacy messages and retry recovers', async ({ page }) => {
  await denyWrites(page)
  await page.goto('./'); await purchaseStart(page)
  await expect(page.getByRole('alert')).toContainText('could not be saved')
  await expect(page.locator('footer')).toContainText(failedText)
  expect(await page.evaluate((key) => localStorage.getItem(key), PROFILE_STORAGE_KEY)).toBeNull()
  await page.setViewportSize({ width: 320, height: 568 })
  await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await expect(page.getByRole('dialog').locator('small').last()).toContainText(failedText)
  await page.getByRole('button', { name: 'About & sources', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'About this map', exact: true })).toContainText(failedText)
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Bundled software licenses', exact: true })).toHaveAttribute('href', /\/licenses\/index\.html$/)
  await page.getByRole('button', { name: 'Privacy & tracking', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Privacy & tracking', exact: true })).toContainText(failedText)
  await expect(page.locator('.tracking-status')).toContainText('off in this local preview')
  await expect(page.getByRole('button', { name: 'Disable tracking and reload', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup', exact: true }).click()
  expect(JSON.parse(readFileSync((await (await download).path())!, 'utf8')).purchases[catalog.startId]).toBeDefined()
  await page.evaluate(() => { (window as SaveWindow).denyProfileWrites = false })
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click()
  await expect(page.locator('footer')).toContainText(savedText)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key)!).purchases[id], { key: PROFILE_STORAGE_KEY, id: catalog.startId })).toEqual({ epoch: 0, active: true })
  await openAction(page, 'Privacy & tracking')
  await expect(page.getByRole('dialog')).toContainText(savedText)
})

for (const existing of [false, true]) {
  test(`${existing ? 'loaded' : 'new'} progress reports whether a profile actually exists on this device`, async ({ page }) => {
    const profile = emptyProfile(catalog.revision)
    if (existing) await page.addInitScript(({ key, profile }) => localStorage.setItem(key, JSON.stringify(profile)), { key: PROFILE_STORAGE_KEY, profile })
    await page.goto('./')
    await expect(page.locator('.toolbar')).toBeVisible()
    await expect(page.locator('footer')).toContainText(existing ? savedText : 'No profile saved on this device yet.')
    expect(await page.evaluate((key) => localStorage.getItem(key) !== null, PROFILE_STORAGE_KEY)).toBe(existing)
    await openAction(page, 'Privacy & tracking')
    await expect(page.getByRole('dialog')).toContainText(existing ? savedText : 'No profile saved on this device yet.')
  })
}

test('an awaiting write says saving until its confirmed completion', async ({ page }) => {
  await page.addInitScript((name) => {
    const win = window as SaveWindow
    const native = navigator.locks.request.bind(navigator.locks)
    const delayed = (requested: string, options: LockOptions, callback: (lock: unknown) => unknown): Promise<unknown> => requested === name
      ? new Promise<unknown>((resolve) => { win.releaseProfileSave = () => resolve(callback({})) })
      : native(requested, options, callback)
    navigator.locks.request = delayed as typeof native
  }, PROFILE_WRITE_LOCK)
  await page.goto('./'); await purchaseStart(page)
  await expect(page.locator('footer')).toContainText('Saving current progress on this device…')
  await openAction(page, 'Privacy & tracking')
  await expect(page.getByRole('dialog')).toContainText('Saving current progress on this device…')
  expect(await page.evaluate((key) => localStorage.getItem(key), PROFILE_STORAGE_KEY)).toBeNull()
  await page.evaluate(() => (window as SaveWindow).releaseProfileSave?.())
  await expect(page.getByRole('dialog')).toContainText(savedText)
  expect(await page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key)!).purchases[id], { key: PROFILE_STORAGE_KEY, id: catalog.startId })).toBeDefined()
})

test('an external conflict never labels the kept dirty session saved, and reviewed adoption recovers', async ({ page, context }) => {
  await denyWrites(page)
  await page.goto('./'); await purchaseStart(page)
  await expect(page.getByRole('alert')).toContainText('could not be saved')
  const other = await context.newPage(); await other.goto(page.url())
  await expect(other.locator('.toolbar')).toBeVisible()
  const spoilers = other.getByRole('checkbox', { name: 'Show spoilers', exact: true })
  if (!await spoilers.isVisible()) await other.getByRole('button', { name: 'Map options', exact: true }).click()
  await spoilers.check()
  await expect(page.locator('footer')).toContainText('Progress conflict. Current session is not saved on this device.')
  await expect(page.locator('.map-summary')).toContainText('1 /')
  await page.getByRole('button', { name: 'Review progress conflict', exact: true }).click()
  await page.getByRole('button', { name: 'Use saved progress…', exact: true }).click()
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.locator('footer')).toContainText(savedText)
  await expect(page.locator('.map-summary')).toContainText('0 /')
})

for (const unavailable of ['storage-read', 'coordination'] as const) {
  test(`${unavailable} unavailable keeps the save claim off`, async ({ page }) => {
    if (unavailable === 'coordination') await page.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined }))
    else await page.addInitScript((key) => {
      const win = window as SaveWindow
      win.denyProfileReads = true
      const native = Storage.prototype.getItem
      Storage.prototype.getItem = function (target) {
        if (target === key && win.denyProfileReads) throw new DOMException('Synthetic read refusal', 'SecurityError')
        return native.call(this, target)
      }
    }, PROFILE_STORAGE_KEY)
    await page.goto('./'); await purchaseStart(page)
    await expect(page.getByRole('alert')).toContainText(unavailable === 'coordination' ? 'Safe saving is unavailable' : 'Changes stay in memory')
    await expect(page.locator('footer')).toContainText(failedText)
    await openAction(page, 'Privacy & tracking')
    await expect(page.getByRole('dialog')).toContainText(failedText)
    await page.evaluate(() => { (window as SaveWindow).denyProfileReads = false })
    expect(await page.evaluate((key) => localStorage.getItem(key), PROFILE_STORAGE_KEY)).toBeNull()
  })
}

test('startup disclosure avoids asserting a saved profile before progress has loaded', async ({ page }) => {
  let releaseCatalog: (() => void) | undefined
  await page.route('**/catalog.json', async (route) => {
    await new Promise<void>((resolve) => { releaseCatalog = resolve })
    await route.continue()
  })
  await page.goto('./', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.startup-disclosure')).not.toContainText('progress is saved')
  await page.locator('.startup-privacy > summary').click()
  await expect(page.locator('.privacy-panel')).toContainText('Progress saving is checked after the map loads.')
  await expect(page.getByRole('button', { name: 'Disable tracking and reload', exact: true })).toBeVisible()
  releaseCatalog?.()
  await expect(page.locator('.toolbar')).toBeVisible()
  await expect(page.locator('footer')).toContainText('No profile saved on this device yet.')
})
