import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { emptyProfile, type Catalog } from '../../src/domain/types'
import { PROFILE_STORAGE_KEY } from '../../src/domain/storage'
import { visibility } from '../../src/domain/rules'

const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Catalog
const ua = catalog.upgrades.find((node) => node.title === 'Ultra Ascension')!
const cases = ['active', 'pending', 'absent-source', 'absent-target'] as const
const retainedText = 'Existing purchase · retained by Astral progress on reset'

async function openProgress(page: Page) {
  const action = page.getByRole('button', { name: 'Progress', exact: true })
  if (!await action.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await action.click()
}

for (const retention of catalog.grants) {
  if (retention.when.kind !== 'active') throw new Error('Expected reviewed active-source retention')
  const sourceId = retention.when.id
  const source = catalog.upgrades.find((node) => node.id === sourceId)!
  const target = catalog.upgrades.find((node) => node.id === retention.ids[0])!
  for (const condition of cases) {
    test(`${target.title} details match reset with ${condition} ${source.title}`, async ({ page }) => {
      const profile = { ...emptyProfile(catalog.revision), epoch: 1 }
      profile.purchases[ua.id] = { epoch: 1, active: true }
      if (condition !== 'absent-source') profile.purchases[source.id] = { epoch: 1, active: condition !== 'pending' }
      if (condition !== 'absent-target') profile.purchases[target.id] = { epoch: 1, active: true }
      const retained = condition === 'active' || condition === 'pending' && source.activation === 'after-ultra-ascension'
      const before = structuredClone(profile)
      await page.addInitScript(({ key, profile }) => localStorage.setItem(key, JSON.stringify(profile)), { key: PROFILE_STORAGE_KEY, profile })
      await page.goto('./')
      await page.getByRole('searchbox').fill(target.title)
      await page.locator('.search-result').filter({ hasText: target.title }).first().click()
      const explanation = page.locator('.details dl dd').last()
      await expect(explanation).toHaveText(retained ? retainedText : condition === 'absent-target' ? 'Repeat purchase · not currently owned' : 'Repeat purchase · clears on reset')
      await expect(page.locator('.details').getByRole('button', { name: condition === 'absent-target' ? 'Record purchase…' : 'Remove purchase…', exact: true })).toBeVisible()
      await expect(page.locator('.details').getByRole('button', { name: condition === 'absent-target' ? 'Remove purchase…' : 'Record purchase…', exact: true })).toHaveCount(0)
      if (!visibility(catalog, profile).ids.has(source.id)) await expect(page.locator('.details')).not.toContainText(source.title)
      expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), PROFILE_STORAGE_KEY)).toEqual(before)
      await openProgress(page)
      await page.getByRole('button', { name: 'Ultra Ascend…', exact: true }).click()
      const retainedGroup = page.getByRole('dialog').locator('section').filter({ has: page.getByRole('heading', { name: /Conditionally retained purchases/ }) })
      if (retained) await expect(retainedGroup).toContainText(target.title)
      else await expect(retainedGroup).not.toContainText(target.title)
      await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
      await expect.poll(() => page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key)!).purchases[id], { key: PROFILE_STORAGE_KEY, id: target.id })).toEqual(retained ? before.purchases[target.id] : undefined)
      expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).epoch, PROFILE_STORAGE_KEY)).toBe(2)
    })
  }
}
