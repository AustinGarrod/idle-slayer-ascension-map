import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { emptyProfile, MAX_PROFILE_EPOCH, type Catalog } from '../../src/domain/types'

const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Catalog
const ua = catalog.upgrades.find((node) => node.title === 'Ultra Ascension')!
const astral = catalog.upgrades.find((node) => node.title === 'Land Lord')!
const key = 'idle-slayer-ascension-map.profile.v1'

async function openProgress(page: Page) {
  await expect(page.locator('.toolbar')).toBeVisible()
  const action = page.getByRole('button', { name: 'Progress', exact: true })
  if (!await action.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await action.click()
}

test('maximum accepted epoch refuses Ultra Ascension and remains exportable without mutation', async ({ page }) => {
  const profile = { ...emptyProfile(catalog.revision), epoch: MAX_PROFILE_EPOCH, purchases: {
    [ua.id]: { epoch: MAX_PROFILE_EPOCH, active: true },
    [astral.id]: { epoch: MAX_PROFILE_EPOCH, active: false },
    'unknown-future': { epoch: 1, active: false },
  }, milestones: { 'unknown-milestone': true as const } }
  await page.addInitScript(({ key, profile }) => localStorage.setItem(key, JSON.stringify(profile)), { key, profile })
  await page.goto('./'); await openProgress(page)
  await page.getByRole('button', { name: 'Ultra Ascend…', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Ultra Ascend?', exact: true })).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('supported Ultra Ascension count limit')
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key)).toEqual(profile)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON backup', exact: true }).click()
  expect(JSON.parse(readFileSync((await (await download).path())!, 'utf8'))).toEqual(profile)
})

test('last safe Ultra Ascension saves, reloads and exports its reset without losing unknown progress', async ({ page }) => {
  const profile = { ...emptyProfile(catalog.revision), epoch: MAX_PROFILE_EPOCH - 1, purchases: {
    [ua.id]: { epoch: MAX_PROFILE_EPOCH - 1, active: true },
    [catalog.startId]: { epoch: MAX_PROFILE_EPOCH - 1, active: true },
    [astral.id]: { epoch: MAX_PROFILE_EPOCH - 1, active: false },
    'unknown-future': { epoch: 1, active: false },
  }, milestones: { 'unknown-milestone': true as const } }
  await page.addInitScript(({ key, profile }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(profile))
  }, { key, profile })
  await page.goto('./'); await openProgress(page)
  await page.getByRole('button', { name: 'Ultra Ascend…', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Ultra Ascend?', exact: true })).toContainText(`Start epoch ${MAX_PROFILE_EPOCH}`)
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  const expected = { ...profile, epoch: MAX_PROFILE_EPOCH, purchases: {
    [astral.id]: { epoch: MAX_PROFILE_EPOCH - 1, active: true },
    'unknown-future': { epoch: 1, active: false },
  } }
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key)).toEqual(expected)
  await page.reload(); await openProgress(page)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON backup', exact: true }).click()
  expect(JSON.parse(readFileSync((await (await download).path())!, 'utf8'))).toEqual(expected)
})
