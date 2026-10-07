import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { emptyProfile, type Catalog } from '../../src/domain/types'
import { encodeProgressTransfer, progressTransferLink } from '../../src/domain/progress-transfer'
import { PROFILE_STORAGE_KEY } from '../../src/domain/storage'
import { PROFILE_WRITE_LOCK } from '../../src/domain/profile-session'
import { LAYOUT_PREFERENCE_KEY } from '../../src/domain/layout-preference'
import { ANALYTICS_PREFERENCE_KEY } from '../../src/analytics'
import { planPurchase } from '../../src/domain/rules'
import { encodeGameSaveFixture, nativeSaveFixture } from '../fixtures/game-save'

const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Catalog
const initial = { ...emptyProfile(catalog.revision), epoch: 2, showSpoilers: true,
  purchases: { [catalog.startId]: { epoch: 2, active: true }, 'synthetic-destination': { epoch: 1, active: false } },
}
const incoming = { ...emptyProfile(catalog.revision), epoch: 7,
  purchases: { [catalog.startId]: { epoch: 7, active: true }, 'synthetic-source': { epoch: 3, active: false } },
}
type DeferredWindow = Window & { releaseRead?: () => void; readFinished?: boolean; releaseWrite?: () => void; writeFinished?: boolean }
async function saved(page: Page) { return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), PROFILE_STORAGE_KEY) }
async function openAction(page: Page, name: string) {
  await expect(page.locator('.toolbar')).toBeVisible()
  const action = page.getByRole('button', { name, exact: true })
  if (!await action.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await action.click()
}
async function seed(page: Page) {
  await page.addInitScript(({ key, layout, initial }) => {
    localStorage.setItem(key, JSON.stringify(initial)); localStorage.setItem(layout, 'native')
  }, { key: PROFILE_STORAGE_KEY, layout: LAYOUT_PREFERENCE_KEY, initial })
}
async function link(baseURL: string) {
  const encoded = await encodeProgressTransfer(catalog, incoming, 'web')
  if (!encoded.ok) throw new Error(encoded.error)
  const base = new URL(baseURL)
  return progressTransferLink(encoded.token, base.origin, base.pathname)
}
async function arrive(page: Page, transfer: string, valid: boolean) {
  await page.evaluate((hash) => { location.hash = hash }, valid ? new URL(transfer).hash : '#transfer=v1.invalid')
  const dialog = page.getByRole('dialog', { name: 'Transfer map progress', exact: true })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.locator('dialog[open]')).toHaveCount(1)
  await expect(dialog.getByRole('heading', { name: 'Transfer map progress', exact: true })).toBeVisible()
  expect(await dialog.evaluate((element) => {
    const id = element.getAttribute('aria-labelledby')!
    return [...document.querySelectorAll('[id]')].filter((node) => node.id === id).length === 1
      && element.querySelector('[id]')?.id === id
  })).toBe(true)
  if (valid) await expect(dialog.getByRole('heading', { name: 'Review transfer', exact: true })).toBeFocused()
  else {
    await expect(dialog.locator('.dialog-feedback[role="status"]')).toContainText('incomplete, corrupt or unsupported')
    await expect(dialog.getByRole('button', { name: 'Apply transfer', exact: true })).toHaveCount(0)
  }
  expect(new URL(page.url()).hash).toBe('')
  return dialog
}
async function selectUpgrade(page: Page, id: string) {
  const upgrade = catalog.upgrades.find((node) => node.id === id)!
  await page.getByRole('searchbox').fill(upgrade.title)
  await page.locator('.search-result').filter({ has: page.getByText(`${BigInt(upgrade.cost).toLocaleString('en')} SP`, { exact: true }) }).first().click()
  await page.getByRole('button', { name: 'Record purchase…', exact: true }).click()
}
async function prepareConfirmation(page: Page, state: string) {
  if (state === 'purchase' || state === 'OR path') {
    const target = catalog.upgrades.find((node) => {
      if (initial.purchases[node.id as keyof typeof initial.purchases]) return false
      const plan = planPurchase(catalog, initial, node.id)
      return state === 'OR path' ? plan.kind === 'choice' : plan.kind === 'ready'
    })!
    expect(target).toBeDefined()
    await selectUpgrade(page, target.id)
    await expect(page.getByRole('dialog', { name: state === 'OR path' ? 'Choose a prerequisite path' : 'Record purchase?', exact: true })).toBeVisible()
    return
  }
  await openAction(page, 'Progress')
  if (state === 'clear') await page.getByRole('button', { name: 'Clear all progress…', exact: true }).click()
  else if (state === 'history') {
    await page.getByRole('spinbutton', { name: 'Previous Ultra Ascensions', exact: true }).fill('5')
    await page.getByRole('button', { name: 'Review history…', exact: true }).click()
  } else if (state === 'restore') {
    await page.getByLabel('Map progress JSON backup', { exact: true }).setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...initial, epoch: 4 })) })
    await expect(page.getByRole('dialog', { name: 'Restore progress?', exact: true })).toBeVisible()
  } else {
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import game save…', exact: true }).click()
    await (await chooser).setFiles({ name: 'synthetic.sav', mimeType: 'application/octet-stream', buffer: Buffer.from(encodeGameSaveFixture(nativeSaveFixture({ epoch: '4' }))) })
    await expect(page.getByRole('button', { name: 'Apply import', exact: true })).toBeVisible()
  }
  await expect(page.getByRole('dialog')).toHaveCount(1)
}

for (const state of ['clear', 'purchase', 'OR path', 'history', 'restore', 'game import']) {
  test(`valid and malformed arrivals supersede ${state} confirmation without applying it`, async ({ page, baseURL }) => {
    await seed(page); await page.goto('./')
    const transfer = await link(baseURL!)
    for (const valid of [false, true]) {
      await prepareConfirmation(page, state)
      const receiver = await arrive(page, transfer, valid)
      expect(await saved(page)).toEqual(initial)
      await receiver.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      expect(await saved(page)).toEqual(initial)
      await expect(page.getByRole('button', { name: 'Game Layout', exact: true })).toHaveAttribute('aria-pressed', 'true')
    }
    const receiver = await arrive(page, transfer, true)
    await receiver.getByRole('button', { name: 'Apply transfer', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect.poll(() => saved(page)).toEqual(incoming)
    await openAction(page, 'Undo')
    const options = page.getByRole('dialog', { name: 'Map options', exact: true })
    if (await options.isVisible()) await options.getByRole('button', { name: 'Close dialog', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect.poll(() => saved(page)).toEqual(initial)
    await expect(page.getByRole('button', { name: 'Game Layout', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })
}

for (const kind of ['backup', 'game save'] as const) {
  for (const outcome of ['success', 'failure'] as const) {
    test(`transfer arrivals invalidate pending ${kind} ${outcome} even after cancelling the receiver`, async ({ page, baseURL }) => {
      await seed(page)
      await page.addInitScript(({ kind, outcome }) => {
        const win = window as DeferredWindow
        const wait = () => new Promise<void>((resolve) => { win.releaseRead = resolve })
        if (kind === 'backup') {
          const native = File.prototype.text
          File.prototype.text = async function () {
            await wait()
            try { if (outcome === 'failure') throw new Error('Synthetic read refusal'); return await native.call(this) }
            finally { win.readFinished = true }
          }
        } else {
          const native = File.prototype.arrayBuffer
          File.prototype.arrayBuffer = async function () {
            await wait()
            try { if (outcome === 'failure') throw new Error('Synthetic read refusal'); return await native.call(this) }
            finally { win.readFinished = true }
          }
        }
      }, { kind, outcome })
      await page.goto('./'); await openAction(page, 'Progress')
      if (kind === 'backup') await page.getByLabel('Map progress JSON backup', { exact: true }).setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...initial, epoch: 4 })) })
      else {
        const chooser = page.waitForEvent('filechooser')
        await page.getByRole('button', { name: 'Import game save…', exact: true }).click()
        await (await chooser).setFiles({ name: 'synthetic.sav', mimeType: 'application/octet-stream', buffer: Buffer.from(encodeGameSaveFixture(nativeSaveFixture({ epoch: '4' }))) })
      }
      await expect.poll(() => page.evaluate(() => typeof (window as DeferredWindow).releaseRead)).toBe('function')
      const transfer = await link(baseURL!)
      await arrive(page, transfer, false)
      const receiver = await arrive(page, transfer, true)
      expect(await saved(page)).toEqual(initial)
      await receiver.getByRole('button', { name: 'Cancel', exact: true }).click()
      // Reopening the original panel must not revive the superseded file read.
      await openAction(page, 'Progress')
      await page.evaluate(() => (window as DeferredWindow).releaseRead?.())
      await expect.poll(() => page.evaluate(() => (window as DeferredWindow).readFinished)).toBe(true)
      await expect(page.getByRole('dialog')).toHaveCount(1)
      await expect(page.getByRole('dialog', { name: 'Your progress', exact: true })).toBeVisible()
      await expect(page.getByRole('dialog').locator('.dialog-feedback')).toHaveText('')
      expect(await saved(page)).toEqual(initial)
    })
  }
}

test('an arrival invalidates pending privacy saving before it can reload or change tracking', async ({ page, baseURL }) => {
  await seed(page)
  await page.addInitScript((name) => {
    const win = window as DeferredWindow
    const native = navigator.locks.request.bind(navigator.locks)
    navigator.locks.request = ((requested: string, options: LockOptions, callback: (lock: unknown) => unknown) => requested === name
      ? new Promise<unknown>((resolve) => { win.releaseWrite = () => { resolve(callback({})); win.writeFinished = true } })
      : native(requested, options, callback)) as typeof native
  }, PROFILE_WRITE_LOCK)
  await page.goto('./')
  await expect(page.locator('.toolbar')).toBeVisible()
  const checkbox = page.getByRole('checkbox', { name: 'Show spoilers', exact: true })
  if (!await checkbox.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await checkbox.uncheck()
  const options = page.getByRole('dialog', { name: 'Map options', exact: true })
  if (await options.isVisible()) await options.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await openAction(page, 'Privacy & tracking')
  await page.getByRole('button', { name: 'Disable tracking and reload', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Reload with unsaved progress?', exact: true })).toBeVisible()
  // A second privacy attempt starts its own pending save of the retained dirty session.
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Disable tracking and reload', exact: true }).click()
  await expect(page.locator('.atlas')).toHaveAttribute('aria-busy', 'true')
  const receiver = await arrive(page, await link(baseURL!), true)
  await page.evaluate(() => (window as DeferredWindow).releaseWrite?.())
  await expect.poll(() => page.evaluate(() => (window as DeferredWindow).writeFinished)).toBe(true)
  await expect(receiver).toBeVisible()
  await expect(page.locator('.atlas')).toHaveAttribute('aria-busy', 'false')
  expect(await saved(page)).toEqual(initial)
  expect(await page.evaluate((key) => localStorage.getItem(key), ANALYTICS_PREFERENCE_KEY)).toBeNull()
  await receiver.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.map-summary')).toContainText('Epoch 2')
  if (!await checkbox.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await expect(checkbox).not.toBeChecked()
  const reopenedOptions = page.getByRole('dialog', { name: 'Map options', exact: true })
  if (await reopenedOptions.isVisible()) await reopenedOptions.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await openAction(page, 'Undo')
  await expect(page.locator('.atlas')).toHaveAttribute('aria-busy', 'true')
  await page.evaluate(() => (window as DeferredWindow).releaseWrite?.())
  await expect(page.locator('.atlas')).toHaveAttribute('aria-busy', 'false')
  expect(await saved(page)).toEqual(initial)
})

for (const state of ['conflict', 'tracking reload'] as const) {
  test(`arrivals supersede ${state} review and retain the unsaved session`, async ({ page, context, baseURL }) => {
    await seed(page)
    await page.addInitScript((key) => {
      const native = Storage.prototype.setItem
      Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException('Synthetic write refusal', 'QuotaExceededError'); native.call(this, name, value) }
    }, PROFILE_STORAGE_KEY)
    await page.goto('./')
    await expect(page.locator('.toolbar')).toBeVisible()
    const spoilers = page.getByRole('checkbox', { name: 'Show spoilers', exact: true })
    if (!await spoilers.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
    await spoilers.uncheck()
    const options = page.getByRole('dialog', { name: 'Map options', exact: true })
    if (await options.isVisible()) await options.getByRole('button', { name: 'Close dialog', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('could not be saved')
    if (state === 'conflict') {
      const other = await context.newPage(); await other.goto(page.url())
      await other.evaluate(({ key, initial }) => Storage.prototype.setItem.call(localStorage, key, JSON.stringify(initial)), { key: PROFILE_STORAGE_KEY, initial: { ...initial, epoch: 3 } })
      await page.getByRole('button', { name: 'Review progress conflict', exact: true }).click()
    } else {
      await openAction(page, 'Privacy & tracking')
      await page.getByRole('button', { name: 'Disable tracking and reload', exact: true }).click()
    }
    await expect(page.getByRole('dialog', { name: state === 'conflict' ? 'Review progress conflict' : 'Reload with unsaved progress?', exact: true })).toBeVisible()
    const transfer = await link(baseURL!)
    await arrive(page, transfer, false)
    const receiver = await arrive(page, transfer, true)
    await receiver.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.map-summary')).toContainText('Epoch 2')
    await openAction(page, 'Progress')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export JSON backup', exact: true }).click()
    expect(JSON.parse(readFileSync((await (await download).path())!, 'utf8'))).toEqual({ ...initial, showSpoilers: false })
    expect(await page.evaluate((key) => localStorage.getItem(key), ANALYTICS_PREFERENCE_KEY)).toBeNull()
  })
}

test('a game file selected after arrival cannot replace the receiver', async ({ page, baseURL }) => {
  await seed(page); await page.goto('./'); await openAction(page, 'Progress')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import game save…', exact: true }).click()
  const selection = await chooser
  const receiver = await arrive(page, await link(baseURL!), true)
  await selection.setFiles({ name: 'synthetic.sav', mimeType: 'application/octet-stream', buffer: Buffer.from(encodeGameSaveFixture(nativeSaveFixture({ epoch: '4' }))) })
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(receiver).toBeVisible()
  expect(await saved(page)).toEqual(initial)
})

test('an arrival cancels a pending confirmed conflict write without reviving recovery', async ({ page, context, baseURL }) => {
  await seed(page)
  await page.addInitScript((key) => {
    const native = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException('Synthetic write refusal', 'QuotaExceededError'); native.call(this, name, value) }
  }, PROFILE_STORAGE_KEY)
  await page.goto('./'); await expect(page.locator('.toolbar')).toBeVisible()
  const checkbox = page.getByRole('checkbox', { name: 'Show spoilers', exact: true })
  if (!await checkbox.isVisible()) await page.getByRole('button', { name: 'Map options', exact: true }).click()
  await checkbox.uncheck()
  const options = page.getByRole('dialog', { name: 'Map options', exact: true })
  if (await options.isVisible()) await options.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('could not be saved')
  const external = { ...initial, epoch: 3 }
  const other = await context.newPage(); await other.goto(page.url())
  await other.evaluate(({ key, external }) => localStorage.setItem(key, JSON.stringify(external)), { key: PROFILE_STORAGE_KEY, external })
  await page.getByRole('button', { name: 'Review progress conflict', exact: true }).click()
  await page.getByRole('button', { name: 'Keep this session…', exact: true }).click()
  await page.evaluate((name) => {
    const win = window as DeferredWindow
    const native = navigator.locks.request.bind(navigator.locks)
    navigator.locks.request = ((requested: string, options: LockOptions, callback: (lock: unknown) => unknown) => requested === name
      ? new Promise<unknown>((resolve) => { win.releaseWrite = () => { resolve(callback({})); win.writeFinished = true } })
      : native(requested, options, callback)) as typeof native
  }, PROFILE_WRITE_LOCK)
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await expect(page.locator('.atlas')).toHaveAttribute('aria-busy', 'true')
  const transfer = await link(baseURL!)
  await arrive(page, transfer, false)
  const receiver = await arrive(page, transfer, true)
  await page.evaluate(() => (window as DeferredWindow).releaseWrite?.())
  await expect.poll(() => page.evaluate(() => (window as DeferredWindow).writeFinished)).toBe(true)
  await expect(receiver).toBeVisible()
  expect(await saved(page)).toEqual(external)
  await receiver.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await openAction(page, 'Progress')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON backup', exact: true }).click()
  expect(JSON.parse(readFileSync((await (await download).path())!, 'utf8'))).toEqual({ ...initial, showSpoilers: false })
})
