import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('idle-slayer-ascension-map.analytics.v1', 'disabled'))
  await page.route('https://analytics.garrod.house/**', (route) => route.abort())
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

for (const title of ['Soul Reaper III', 'Advanced Divinities']) {
  test(`${title} keeps its OR reveal alternatives grouped before the shared milestone`, async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('.toolbar')).toBeVisible()
    const spoilers = page.getByRole('checkbox', { name: 'Show spoilers', exact: true })
    if (!await spoilers.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
    await spoilers.check()
    const options = page.getByRole('dialog', { name: 'Map options', exact: true })
    if (await options.isVisible()) await options.getByRole('button', { name: 'Close dialog', exact: true }).click()
    await page.getByRole('searchbox').fill(title)
    await page.locator('.search-result').filter({ hasText: title }).click()
    const expand = page.getByRole('button', { name: 'Show details', exact: true })
    if (await expand.isVisible()) await expand.click()
    const reveal = page.locator('.details dt').filter({ hasText: 'Reveal requirements' }).locator('+ dd')
    await expect(reveal).toHaveText(`(Astral Slayer OR ${title}) AND Victor's Soul`)
  })
}
