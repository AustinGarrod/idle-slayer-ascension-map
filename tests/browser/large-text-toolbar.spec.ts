import { chromium, expect, test as base, type BrowserContext } from '@playwright/test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import type { Catalog } from '../../src/domain/types'
import { emptyProfile } from '../../src/domain/types'
import { visibility } from '../../src/domain/rules'
import { tabThroughDiscovery } from './helpers/discovery-focus'

const test = base.extend({
  page: async ({ baseURL }, use, info) => {
    const directory = info.outputPath('chromium-font-profile')
    await mkdir(join(directory, 'Default'), { recursive: true })
    await writeFile(join(directory, 'Default', 'Preferences'), JSON.stringify({ webkit: { webprefs: { default_font_size: 32 } } }))
    let context: BrowserContext | undefined
    try {
      context = await chromium.launchPersistentContext(directory, {
        channel: 'chromium', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'], baseURL, viewport: { width: 320, height: 568 },
        ...(info.project.name === 'mobile' ? { isMobile: true, hasTouch: true, userAgent: info.project.use.userAgent, deviceScaleFactor: info.project.use.deviceScaleFactor } : {}),
      })
      await context.addInitScript(() => localStorage.setItem('idle-slayer-ascension-map.analytics.v1', 'disabled'))
      await context.route('https://analytics.garrod.house/**', (route) => route.abort())
      const page = await context.newPage()
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await use(page)
    } finally {
      await context?.close()
      if (dirname(resolve(directory)) !== resolve(info.outputDir)) throw new Error('Refusing to remove a browser profile outside this test output directory')
      await rm(directory, { recursive: true, force: true })
    }
  },
})

test('optional map help remains readable and actionable at the actual 200% font', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('html')).toHaveCSS('font-size', '32px')
  await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await page.getByRole('dialog', { name: 'Map options', exact: true }).getByRole('button', { name: 'Map help…', exact: true }).click()
  const help = page.getByRole('dialog', { name: 'Map help', exact: true })
  await expect(help).toBeVisible()
  expect(await help.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await help.getByRole('button', { name: 'Review spoiler setting', exact: true }).click()
  const options = page.getByRole('dialog', { name: 'Map options', exact: true })
  await expect(options.getByRole('checkbox', { name: 'Show spoilers', exact: true })).not.toBeChecked()
  await options.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('complete discovery remains reachable with the actual browser default font at 200%', async ({ page }) => {
  const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Catalog
  const upgrades = visibility(catalog, emptyProfile(catalog.revision)).upgrades
  await page.goto('./')
  await expect(page.locator('html')).toHaveCSS('font-size', '32px')
  await page.getByRole('searchbox').focus()
  await expect(page.getByRole('combobox', { name: 'Progress state' })).toBeVisible()
  await expect(page.locator('.search-result')).toHaveCount(upgrades.length)
  const final = upgrades.at(-1)!
  const lastResult = page.locator(`.search-result[data-upgrade-id="${final.id}"]`)
  await lastResult.scrollIntoViewIfNeeded()
  await expect(lastResult).toBeInViewport()
  await page.screenshot({ path: test.info().outputPath('discovery-200-percent.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await lastResult.click()
  await expect(page.locator('.details h2')).toHaveText(final.title)
})

test('native Tab keeps every focused discovery title clear at the actual 200% browser font', async ({ page }) => {
  const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Catalog
  const upgrades = visibility(catalog, emptyProfile(catalog.revision)).upgrades
  await page.goto('./')
  await expect(page.locator('html')).toHaveCSS('font-size', '32px')
  await tabThroughDiscovery(page, upgrades.map((node) => node.id))
  await page.screenshot({ path: test.info().outputPath('discovery-tab-200-percent.png') })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('searchbox')).toBeFocused()
  await expect(page.getByRole('region', { name: 'Visible upgrade results' })).toHaveCount(0)
})

for (const layout of ['Game Layout', 'Detailed Layout']) test(`${layout} toolbar reflows with the actual browser default font at 200%`, async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.toolbar')).toBeVisible()
  await page.evaluate(async () => { await document.fonts.ready })
  await expect(page.locator('html')).toHaveCSS('font-size', '32px')
  await expect.poll(() => page.locator('.toolbar').evaluate((toolbar) => {
    const controls = [...toolbar.querySelectorAll<HTMLElement>('.brand h1, .layout-control button, .mobile-options, .search-box input, .next-upgrade')]
    const boxes = controls.map((element) => element.getBoundingClientRect())
    const overflow = controls.filter((element) => element.tagName !== 'INPUT' && (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)).map((element) => element.textContent?.trim())
    const overlaps = boxes.flatMap((first, index) => boxes.slice(index + 1).filter((second) => first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top))
    return { overflow, overlaps: overlaps.length, inside: boxes.every((box) => box.left >= 0 && box.right <= document.documentElement.clientWidth && box.top >= 0 && box.bottom <= innerHeight), horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }
  })).toEqual({ overflow: [], overlaps: 0, inside: true, horizontalOverflow: false })
  await page.screenshot({ path: test.info().outputPath('toolbar-200-percent.png') })

  await page.getByRole('group', { name: 'Map layout', exact: true }).getByRole('button', { name: layout, exact: true }).click()
  await expect(page.getByRole('button', { name: layout, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('searchbox').fill('Permanent Slayer')
  await page.locator('.search-result').filter({ hasText: 'Permanent Slayer' }).click()
  await expect(page.locator('.details h2')).toHaveText('Permanent Slayer')
  await expect.poll(() => page.locator('.react-flow__node.selected').evaluate((element) => {
    const rect = element.getBoundingClientRect(), map = element.closest('.map')!.getBoundingClientRect()
    const overlaps = [...document.querySelectorAll('.camera-controls, .react-flow__attribution')].filter((control) => {
      const box = control.getBoundingClientRect()
      return rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top
    }).map((control) => control.className)
    return { overlaps, usable: rect.width >= 44 && rect.height >= 44 && rect.left >= map.left && rect.right <= map.right && rect.top >= map.top && rect.bottom <= map.bottom }
  })).toEqual({ overlaps: [], usable: true })
  await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Map options', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Next upgrade', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Suggested next upgrade', exact: true })).toBeVisible()
})

test('overview fits visible frames and keeps its return label readable at the actual 200% font', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('html')).toHaveCSS('font-size', '32px')
  const settle = () => page.evaluate(async () => { await document.fonts.ready; for (let i = 0; i < 8; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())) })
  await page.getByRole('searchbox').fill('Permanent Slayer')
  await page.getByRole('searchbox').press('Enter')
  const original = await page.evaluate(() => localStorage.getItem('idle-slayer-ascension-map.profile.v1'))
  for (const layout of ['Game Layout', 'Detailed Layout']) {
    await page.getByRole('group', { name: 'Map layout', exact: true }).getByRole('button', { name: layout, exact: true }).click()
    await page.getByRole('button', { name: 'Map options', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Overview visible map', exact: true }).click()
    await settle()
    await expect(page.locator('.toast')).toHaveCount(0)
    const back = page.getByRole('button', { name: 'Return to inspection', exact: true })
    expect(await back.evaluate((button) => button.scrollWidth <= button.clientWidth + 1 && button.scrollHeight <= button.clientHeight + 1)).toBe(true)
    expect(await page.locator('.react-flow__node').evaluateAll((nodes) => {
      const map = document.querySelector('.map')!.getBoundingClientRect()
      const summary = document.querySelector('.map-summary')!.getBoundingClientRect()
      const controls = document.querySelector('.camera-controls')!.getBoundingClientRect()
      return nodes.every((node) => { const r = node.getBoundingClientRect(); return r.left >= map.left + 11 && r.right <= map.right - 11 && r.top >= summary.bottom + 11 && r.bottom <= controls.top - 11 })
    })).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`${layout}-overview-200-percent.png`) })
    await back.click(); await settle()
    await expect(page.locator('.details h2')).toHaveText('Permanent Slayer')
    expect(await page.locator('.react-flow__node.selected').evaluate((node) => { const r = node.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 })).toBe(true)
  }
  expect(await page.evaluate(() => localStorage.getItem('idle-slayer-ascension-map.profile.v1'))).toBe(original)
})

test('successive suggestion confirmation stays readable at the actual 200% browser font', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('html')).toHaveCSS('font-size', '32px')
  await page.getByRole('button', { name: 'Next upgrade', exact: true }).click()
  await page.getByRole('dialog', { name: 'Suggested next upgrade', exact: true }).getByRole('button', { name: 'Record purchase…', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Record purchase?', exact: true })
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  for (const name of ['Apply and continue suggestions', 'Apply purchases', 'Back to suggestions', 'Cancel']) {
    const button = dialog.getByRole('button', { name, exact: true })
    await button.scrollIntoViewIfNeeded()
    await expect(button).toBeInViewport()
    const box = await button.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(await button.evaluate((element) => element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1)).toBe(true)
  }
  await dialog.getByRole('button', { name: 'Apply and continue suggestions', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Suggested next upgrade', exact: true }).locator('.recommendation-main')).toContainText('Soul Gatherer Bundle')
})


test('prior ascension history keeps its input and actions inside a narrow large-text dialog', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('html')).toHaveCSS('font-size', '32px')
  await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await page.getByRole('dialog', { name: 'Map options', exact: true }).getByRole('button', { name: 'Progress', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Your progress', exact: true })
  const form = dialog.locator('.prior-ascensions')
  expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  const input = form.getByRole('spinbutton', { name: 'Previous Ultra Ascensions', exact: true })
  await input.scrollIntoViewIfNeeded()
  await expect(input).toBeInViewport()
  expect(await input.evaluate((element) => { const r = element.getBoundingClientRect(); const d = element.closest('dialog')!.getBoundingClientRect(); return r.left >= d.left && r.right <= d.right && r.height >= 44 })).toBe(true)
  await input.fill('3')
  const review = form.getByRole('button', { name: 'Review history…', exact: true })
  await review.scrollIntoViewIfNeeded()
  await expect(review).toBeInViewport()
  await review.click()
  await expect(page.getByRole('dialog', { name: 'Record prior Ultra Ascensions?', exact: true })).toContainText('from 0 to 3')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('idle-slayer-ascension-map.profile.v1'))).toBeNull()
})

test('long prerequisite return labels remain fully visible and clickable with large text', async ({ page }) => {
  const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Catalog
  const profile = { ...emptyProfile(catalog.revision), showSpoilers: true }
  await page.addInitScript((profile) => localStorage.setItem('idle-slayer-ascension-map.profile.v1', JSON.stringify(profile)), profile)
  await page.goto('./')
  await expect(page.locator('html')).toHaveCSS('font-size', '32px')
  await page.getByRole('searchbox').fill("Doesn't Matter to Me")
  await page.getByRole('searchbox').press('Enter')
  const expand = page.getByRole('button', { name: 'Show details', exact: true })
  if (await expand.isVisible()) await expand.click()
  const purchase = page.locator('.details dt').filter({ hasText: /^Purchase requirements$/ }).locator('+ dd')
  await purchase.getByRole('button').first().click()
  const back = page.locator('.details').getByRole('button', { name: "Return to Doesn't Matter to Me", exact: true })
  await back.scrollIntoViewIfNeeded()
  expect(await back.evaluate((element) => {
    const r = element.getBoundingClientRect()
    const details = element.closest('.details')!.getBoundingClientRect()
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let node: Node | null
    const text: DOMRect[] = []
    while ((node = walker.nextNode())) { const range = document.createRange(); range.selectNodeContents(node); text.push(...range.getClientRects()) }
    return r.width >= 44 && r.height >= 44 && r.left >= details.left && r.right <= details.right && text.length > 0 && text.every((line) => line.top >= details.top && line.bottom <= details.bottom && line.left >= details.left && line.right <= details.right && document.elementFromPoint(line.x + line.width / 2, line.y + line.height / 2)?.closest('button') === element)
  })).toBe(true)
  await page.screenshot({ path: test.info().outputPath('long-prerequisite-return-200-percent.png') })
  await back.click()
  await expect(page.locator('.details h2')).toHaveText("Doesn't Matter to Me")
  await expect(page.locator('.details h2')).toBeFocused()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('idle-slayer-ascension-map.profile.v1')!))).toEqual(profile)
})
