import { expect, test } from './fixtures'

const controls = ['Compare prerequisite routes…', 'Analyze forward impact…'] as const
for (const first of controls) test(`queued planning actions replace ${first} with one current private dialog`, async ({ page }, info) => {
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 })
  await page.addInitScript(() => { if (location.origin !== 'null') localStorage.setItem('idle-slayer-ascension-map.analytics.v1', 'disabled') })
  await page.route('https://analytics.garrod.house/**', (route) => route.abort())
  await page.goto('./')
  await expect(page.locator('.toolbar')).toBeVisible()
  await page.getByRole('searchbox').fill('Permanent Slayer')
  await page.getByRole('searchbox').press('Enter')
  const expand = page.getByRole('button', { name: 'Show details', exact: true })
  if (await expand.isVisible()) await expand.click()
  const stored = await page.evaluate(() => Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]))
  const second = controls.find((label) => label !== first)!
  const connected = await page.locator('.details').evaluate((element, labels) => {
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('.detail-secondary button')]
    const previous = buttons.find((button) => button.textContent === labels.first)
    const next = buttons.find((button) => button.textContent === labels.second)
    if (!previous || !next) throw new Error('Both planning actions must follow the native purchase controls')
    previous.click()
    const connected = next.isConnected
    next.click()
    return connected
  }, { first, second })
  expect(connected).toBe(true)
  const currentName = second === controls[0] ? 'Prerequisite routes' : 'Forward impact'
  const previousName = first === controls[0] ? 'Prerequisite routes' : 'Forward impact'
  const dialog = page.getByRole('dialog', { name: currentName, exact: true })
  await expect(page.locator('dialog[open]')).toHaveCount(1)
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('dialog', { name: previousName, exact: true })).toHaveCount(0)
  await expect(dialog.locator('.telemetry-private.rr-block').first()).toBeVisible()
  expect(await page.evaluate(() => Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]))).toEqual(stored)
  await page.keyboard.press('Escape')
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  await expect(page.locator('.details h2')).toHaveText('Permanent Slayer')
})
