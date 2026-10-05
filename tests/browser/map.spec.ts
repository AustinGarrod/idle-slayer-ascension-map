import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { Catalog } from '../../src/domain/types'
import { emptyProfile } from '../../src/domain/types'
import { visibility } from '../../src/domain/rules'

const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Catalog
const initial = emptyProfile(catalog.revision)
const initialVisibility = visibility(catalog, initial)
const start = catalog.upgrades.find((node) => node.id === catalog.startId)!
const hidden = catalog.upgrades.find((node) => !initialVisibility.ids.has(node.id))!
const runtimeErrors: Error[] = []
test.beforeEach(({ page }) => { runtimeErrors.length = 0; page.on('pageerror', (error) => runtimeErrors.push(error)) })
test.afterEach(() => expect(runtimeErrors).toEqual([]))

test('search centers the native node, purchase persists, and undo works', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Ascension Map', exact: true })).toBeVisible()
  await page.getByRole('searchbox').fill(start.title)
  await page.locator('.search-result').filter({ hasText: start.title }).first().click()
  await expect(page.getByRole('complementary', { name: 'Upgrade details' })).toBeVisible()
  const node = page.locator(`.react-flow__node[data-id="${start.id}"]`)
  await expect(node).toBeInViewport()
  await page.getByRole('button', { name: 'Record purchase…', exact: true }).click()
  await page.getByRole('button', { name: 'Apply purchases', exact: true }).click()
  await expect(page.locator('.state-label')).toHaveText('✓ Purchased and active')
  await page.reload()
  await page.getByRole('button', { name: 'Return to start', exact: true }).click()
  await expect(page.locator('.state-label')).toHaveText('✓ Purchased and active')
  await page.getByRole('button', { name: 'Remove purchase…' }).click()
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.state-label')).toHaveText('✓ Purchased and active')
})

test('spoilers share one boundary across nodes, search, details and totals', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.map-summary')).toContainText(`0 / ${initialVisibility.total}`)
  await expect(page.locator(`.react-flow__node[data-id="${hidden.id}"]`)).toHaveCount(0)
  await page.getByRole('searchbox').fill(hidden.title)
  await expect(page.locator('.search-result').filter({ hasText: hidden.title })).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Show spoilers' }).check()
  await expect(page.locator('.map-summary')).toContainText(`0 / ${catalog.upgrades.length}`)
  await page.locator('.search-result').filter({ hasText: hidden.title }).first().click()
  await expect(page.locator('.details h2')).toHaveText(hidden.title)
  await page.getByRole('checkbox', { name: 'Show spoilers' }).uncheck()
  await expect(page.getByRole('complementary', { name: 'Upgrade details' })).toHaveCount(0)
  await expect(page.locator(`.react-flow__node[data-id="${hidden.id}"]`)).toHaveCount(0)
})

test('backup restore is previewed and malformed input leaves current progress intact', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{broken') })
  await expect(page.getByRole('status')).toContainText('not valid JSON')
  const profile = { ...initial, purchases: { [start.id]: { epoch: 0, active: true }, 'unknown-future-id': { epoch: 0, active: true } } }
  await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(profile)) })
  await expect(page.getByRole('dialog')).toContainText('Restore progress?')
  await expect(page.locator('.map-summary')).toContainText('0 /')
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.locator('.map-summary')).toContainText('1 /')
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON backup', exact: true }).click()
  const download = await downloadPromise
  const backup = JSON.parse(readFileSync((await download.path())!, 'utf8'))
  expect(backup.purchases['unknown-future-id']).toEqual({ epoch: 0, active: true })
})

test('storage failures retain usable progress and export', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError') } })
  await page.goto('./')
  await page.getByRole('button', { name: 'Return to start', exact: true }).click()
  await page.getByRole('button', { name: 'Record purchase…', exact: true }).click()
  await page.getByRole('button', { name: 'Apply purchases', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Current progress remains available')
  await expect(page.locator('.state-label')).toHaveText('✓ Purchased and active')
  await expect(page.getByRole('button', { name: 'Export backup', exact: true })).toBeEnabled()
})

test('corrupt stored data cannot be overwritten by ordinary edits', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('idle-slayer-ascension-map.profile.v1', '{corrupt'))
  await page.goto('./')
  await expect(page.getByRole('alert')).toContainText('not valid JSON')
  await page.getByRole('checkbox', { name: 'Show spoilers' }).check()
  expect(await page.evaluate(() => localStorage.getItem('idle-slayer-ascension-map.profile.v1'))).toBe('{corrupt')
  await expect(page.getByRole('alert')).toContainText('Changes stay in memory')
})

test('entering history keeps repeat purchases current and removal still cascades', async ({ page }) => {
  const child = catalog.upgrades.find((node) => node.title === 'Reinvest')!
  const seed = { ...initial, purchases: { [start.id]: { epoch: 0, active: true }, [child.id]: { epoch: 0, active: true } } }
  await page.addInitScript((profile) => localStorage.setItem('idle-slayer-ascension-map.profile.v1', JSON.stringify(profile)), seed)
  await page.goto('./')
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Previous Ultra Ascensions' }).fill('1')
  await page.getByRole('spinbutton', { name: 'Previous Ultra Ascensions' }).press('Tab')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Return to start', exact: true }).click()
  await page.getByRole('button', { name: 'Remove purchase…', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(child.title)
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('idle-slayer-ascension-map.profile.v1')!))
  expect(saved.epoch).toBe(1)
  expect(saved.purchases[child.id]).toBeUndefined()
})

test('fixed map and responsive controls support keyboard details without overflow', async ({ page }) => {
  await page.goto('./')
  const node = page.locator(`.react-flow__node[data-id="${start.id}"]`)
  await expect(page.getByRole('complementary', { name: 'Upgrade details' })).toHaveCount(0)
  await node.focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('complementary', { name: 'Upgrade details' })).toBeVisible()
  const original = await node.getAttribute('style')
  await node.focus()
  await page.keyboard.press('ArrowRight')
  expect(await node.getAttribute('style')).toBe(original)
  await page.getByRole('button', { name: 'Close upgrade details' }).click()
  await node.focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('complementary', { name: 'Upgrade details' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close upgrade details' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect.poll(() => page.locator('.upgrade-icon').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
  await page.screenshot({ path: `test-results/atlas-${test.info().project.name}.png`, fullPage: true })
})
