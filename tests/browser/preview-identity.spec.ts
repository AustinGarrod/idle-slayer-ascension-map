import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { Catalog } from '../../src/domain/types'
import { emptyProfile } from '../../src/domain/types'
import { planRemoval, planUltraAscension } from '../../src/domain/rules'
import { PROFILE_STORAGE_KEY } from '../../src/domain/storage'

const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Catalog
const keys = catalog.upgrades.filter((node) => node.title === 'Astral Key')
const selected = keys[0]!
const cost = (value: string) => BigInt(value).toLocaleString('en')
const label = (id: string) => {
  const node = catalog.upgrades.find((node) => node.id === id)!
  return `${node.title} · ${cost(node.cost)} SP`
}

for (const operation of ['purchase', 'removal', 'reset'] as const) {
  test(`${operation} previews distinguish duplicate upgrade titles with exact costs and wrap narrow rows`, async ({ page }) => {
    expect(keys).toHaveLength(11)
    expect(new Set(keys.map((node) => node.cost)).size).toBe(11)
    const profile = emptyProfile(catalog.revision)
    profile.epoch = 3; profile.showSpoilers = true
    for (const node of catalog.upgrades) profile.purchases[node.id] = { epoch: 3, active: true }
    for (const item of catalog.milestones) profile.milestones[item.id] = true
    if (operation === 'purchase') delete profile.purchases[selected.id]
    await page.addInitScript(({ key, profile }) => localStorage.setItem(key, JSON.stringify(profile)), { key: PROFILE_STORAGE_KEY, profile })
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('./')
    await expect(page.locator('.toolbar')).toBeVisible()
    let affected: string[]
    if (operation === 'reset') {
      await page.getByRole('button', { name: 'Map options', exact: true }).click()
      await page.getByRole('button', { name: 'Progress', exact: true }).click()
      await page.getByRole('button', { name: 'Ultra Ascend…', exact: true }).click()
      const reset = planUltraAscension(catalog, profile)!
      affected = [...reset.cleared, ...reset.activated, ...reset.granted].filter((id) => keys.some((node) => node.id === id))
      expect(affected).toHaveLength(11)
    } else {
      await page.getByRole('searchbox').fill('Astral Key')
      await page.locator('.search-result').filter({ has: page.getByText(`${cost(selected.cost)} SP`, { exact: true }) }).click()
      await page.getByRole('button', { name: operation === 'purchase' ? 'Record purchase…' : 'Remove purchase…', exact: true }).click()
      affected = operation === 'purchase' ? [selected.id] : planRemoval(catalog, profile, selected.id).removed.filter((id) => keys.some((node) => node.id === id))
    }
    const rows = page.getByRole('dialog').locator('li').filter({ hasText: 'Astral Key' })
    await expect(rows).toHaveCount(affected.length)
    expect(await rows.allTextContents()).toEqual(affected.map(label))
    expect(new Set(await rows.allTextContents()).size).toBe(affected.length)
    for (const row of await rows.all()) expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), PROFILE_STORAGE_KEY)).toEqual(profile)
  })
}
