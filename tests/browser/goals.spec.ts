import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { emptyProfile, type Catalog } from '../../src/domain/types'
import { GOALS_STORAGE_KEY } from '../../src/domain/goals'
import { PROFILE_STORAGE_KEY } from '../../src/domain/storage'
import { visibility } from '../../src/domain/rules'
const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Catalog
const initial = emptyProfile(catalog.revision)
const node = (title: string) => catalog.upgrades.find((upgrade) => upgrade.title === title)!

test.beforeEach(async ({ page }, info) => {
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 })
  await page.addInitScript(() => localStorage.setItem('idle-slayer-ascension-map.analytics.v1', 'disabled'))
  await page.route('https://analytics.garrod.house/**', (route) => route.abort())
})
async function choose(page: Page, title: string, mode = 'acquire') {
  await page.getByRole('searchbox').fill(title)
  await page.locator('.search-result').filter({ has: page.locator('.discovery-title', { hasText: new RegExp('^' + title + '$') }) }).first().click()
  const toggle = page.getByRole('button', { name: 'Show details', exact: true })
  if (await toggle.isVisible()) await toggle.click()
  await page.getByRole('button', { name: 'Set progression goal…', exact: true }).click()
  await page.getByRole('combobox', { name: 'Goal completion', exact: true }).selectOption(mode)
  await page.getByRole('button', { name: 'Save goal', exact: true }).click()
  await expect(page.locator('.goals-panel')).toContainText('Intention recorded')
}
async function progress(page: Page) {
  const action = page.getByRole('button', { name: 'Progress', exact: true })
  if (!await action.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await action.click()
}
const saved = (page: Page) => page.evaluate((key) => localStorage.getItem(key), PROFILE_STORAGE_KEY)

test('intentions persist independently, reorder and retire without recording purchases or entering progress backups', async ({ page }) => {
  await page.goto('./')
  await choose(page, 'Minions')
  await expect(page.locator('.goal-list')).toContainText('Blocked by native requirements')
  expect(await saved(page)).toBeNull()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await choose(page, 'Permanent Slayer', 'rebuild')
  const goals = page.locator('.goal-list li')
  await expect(goals).toHaveCount(2)
  await goals.nth(1).getByRole('button', { name: 'Higher priority', exact: true }).click()
  await expect(goals.first()).toHaveAttribute('data-goal-id', catalog.startId)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON backup', exact: true }).click()
  const path = await (await download).path()
  expect(JSON.parse(readFileSync(path!, 'utf8'))).toEqual(initial)
  expect(await saved(page)).toBeNull()
  await page.reload(); await progress(page)
  await expect(page.locator('.goal-list li')).toHaveCount(2)
  await page.locator('.goal-list li').last().getByRole('button', { name: 'Retire goal', exact: true }).click()
  await expect(page.locator('.goal-list li')).toHaveCount(1)
  await expect(page.locator('.goals-panel')).toHaveClass(/rr-block/)
})

test('intentions stay usable across dialog lifetimes when saving fails', async ({ page }) => {
  await page.addInitScript((key) => {
    const native = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) { if (name === key) throw new Error('synthetic storage failure'); native.call(this, name, value) }
  }, GOALS_STORAGE_KEY)
  await page.goto('./'); await choose(page, 'Permanent Slayer', 'rebuild')
  await expect(page.locator('.goals-panel')).toContainText('Goals could not be saved')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await progress(page)
  await expect(page.locator('.goal-list li')).toHaveCount(1)
  await expect(page.locator('.goal-list')).toContainText('Eligible to purchase')
  expect(await saved(page)).toBeNull()
})

test('hidden and unknown saved goals remain retained without contributing identities or counts', async ({ page }) => {
  const hidden = catalog.upgrades.find((upgrade) => !visibility(catalog, initial).ids.has(upgrade.id))!
  const intentions = { version: 1, targets: [{ id: hidden.id, mode: 'activate' }, { id: 'future-unknown-private', mode: 'rebuild' }, { id: catalog.startId, mode: 'acquire' }] }
  await page.addInitScript(({ key, intentions }) => localStorage.setItem(key, JSON.stringify(intentions)), { key: GOALS_STORAGE_KEY, intentions })
  await page.goto('./'); await progress(page)
  await expect(page.locator('.goal-list li')).toHaveCount(1)
  await expect(page.locator('.goals-panel')).toContainText('1 visible goal · 0 achieved')
  await expect(page.locator('.goals-panel')).not.toContainText(hidden.title)
  expect(await page.locator('.goals-panel').innerHTML()).not.toContain('future-unknown-private')
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), GOALS_STORAGE_KEY)).toEqual(intentions)
})

test('pending acquisition and activation goals use actual ownership and cross-tab progress', async ({ page, context }) => {
  const scales = node('Astral Scales')
  await page.addInitScript(({ key, profile, goalsKey, id }) => {
    localStorage.setItem(key, JSON.stringify(profile))
    localStorage.setItem(goalsKey, JSON.stringify({ version: 1, targets: [{ id, mode: 'activate' }] }))
  }, { key: PROFILE_STORAGE_KEY, profile: { ...initial, showSpoilers: true, purchases: { [scales.id]: { epoch: 0, active: false } } }, goalsKey: GOALS_STORAGE_KEY, id: scales.id })
  await page.goto('./'); await progress(page)
  await expect(page.locator('.goal-list')).toContainText('Owned, awaiting activation')
  await expect(page.locator('.goals-panel')).toContainText('0 achieved')
  const other = await context.newPage(); await other.goto(page.url())
  await other.evaluate(({ key, profile }) => localStorage.setItem(key, JSON.stringify(profile)), { key: PROFILE_STORAGE_KEY, profile: { ...initial, showSpoilers: true, purchases: { [scales.id]: { epoch: 0, active: true } } } })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await progress(page)
  await expect(page.locator('.goals-panel')).toContainText('1 achieved')
  await expect(page.locator('.goal-list')).toContainText('Achieved')
})

test('unreadable saved goals are preserved until deliberate confirmed recovery', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, '{invalid-private-fixture'), GOALS_STORAGE_KEY)
  await page.goto('./'); await choose(page, 'Permanent Slayer')
  expect(await page.evaluate((key) => localStorage.getItem(key), GOALS_STORAGE_KEY)).toBe('{invalid-private-fixture')
  await page.getByRole('button', { name: "Save this visit's goals…", exact: true }).click()
  await page.getByRole('button', { name: 'Cancel goal recovery', exact: true }).click()
  expect(await page.evaluate((key) => localStorage.getItem(key), GOALS_STORAGE_KEY)).toBe('{invalid-private-fixture')
  await page.getByRole('button', { name: "Save this visit's goals…", exact: true }).click()
  await page.getByRole('button', { name: 'Confirm goal recovery', exact: true }).click()
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), GOALS_STORAGE_KEY)).toEqual({ version: 1, targets: [{ id: catalog.startId, mode: 'acquire' }] })
  expect(await saved(page)).toBeNull()
})
