import { afterEach, describe, expect, it, vi } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash, webcrypto } from 'node:crypto'
import { resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { runInNewContext } from 'node:vm'
import { offlineRelease, PWA_BASE, renderWorker, validatePwaDistribution } from '../scripts/pwa'

const scratch: string[] = []
function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), 'ascension-pwa-release-')); scratch.push(directory)
  cpSync('public', directory, { recursive: true })
  writeFileSync(resolve(directory, 'index.html'), `<link rel="manifest" href="${PWA_BASE}manifest.webmanifest"><link rel="apple-touch-icon" href="${PWA_BASE}pwa/apple-touch-icon.png">`)
  const release = offlineRelease(process.cwd(), directory)
  writeFileSync(resolve(directory, 'offline-assets.json'), JSON.stringify(release))
  writeFileSync(resolve(directory, 'sw.js'), renderWorker(process.cwd(), release))
  return directory
}
afterEach(() => {
  for (const directory of scratch.splice(0)) {
    if (!directory.startsWith(resolve(tmpdir()) + sep + 'ascension-pwa-release-')) throw new Error('Unsafe cleanup')
    rmSync(directory, { recursive: true, force: true })
  }
})
describe('offline release verification', () => {
  it('covers every public catalog/icon/license and the reviewed normal/maskable install assets', () => {
    const directory = fixture()
    expect(() => validatePwaDistribution(process.cwd(), directory)).not.toThrow()
    const release = offlineRelease(process.cwd(), directory)
    expect(release.assets.filter((asset) => asset.file.startsWith('assets/upgrades/'))).toHaveLength(288)
    expect(release.assets.some((asset) => asset.file === 'licenses/index.html')).toBe(true)
    expect(release.assets.some((asset) => asset.file === 'pwa/maskable-512.png')).toBe(true)
  })
  it('rejects stale cached catalog bytes, worker code, scope and icon assets', () => {
    for (const file of ['catalog.json', 'sw.js', 'manifest.webmanifest', 'pwa/icon-192.png']) {
      const directory = fixture()
      writeFileSync(resolve(directory, file), readFileSync(resolve(directory, file)).toString() + '\n')
      expect(() => validatePwaDistribution(process.cwd(), directory)).toThrow()
    }
  })
  it.each(['backup.json', 'assets/private.json', 'native.sav', 'licenses/transfer.bin', 'licenses/backup.json'])('refuses unreviewed cache input %s', (file) => {
    const directory = fixture(); writeFileSync(resolve(directory, file), 'synthetic private input')
    expect(() => offlineRelease(process.cwd(), directory)).toThrow('Unreviewed offline asset')
  })
})

function workerFixture(fail = false) {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>()
  const entries = new Map<string, Response>()
  const deleted = vi.fn(async () => true)
  const skipWaiting = vi.fn(async () => {})
  const clients = [{ id: 'current', url: 'https://app.test' + PWA_BASE }]
  const matchAll = vi.fn(async () => [...clients])
  const assets = ['index.html', 'catalog.json'].map((file) => ({ file, sha256: createHash('sha256').update(file).digest('hex') }))
  const caches = { open: async () => ({ put: async (url: string, response: Response) => { entries.set(url, response) }, match: async (url: string) => entries.get(url), keys: async () => [...entries.keys()].map((url) => ({ url })) }), delete: deleted, keys: async () => ['ascension-map-public-old'] }
  runInNewContext('const RELEASE=' + JSON.stringify({ version: 'test', assets }) + ';' + readFileSync('scripts/pwa-worker.js', 'utf8'), {
    self: { addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) => handlers.set(name, handler), location: new URL('https://app.test' + PWA_BASE + 'sw.js'), registration: { scope: 'https://app.test' + PWA_BASE }, clients: { matchAll }, skipWaiting },
    caches, crypto: webcrypto, URL, Uint8Array, Response,
    fetch: async (url: string) => new Response(fail && url.endsWith('catalog.json') ? 'unverified newer bytes' : url.split('/').at(-1)),
  })
  const dispatch = async (name: string, event: Record<string, unknown>) => {
    let task: Promise<unknown> | undefined
    handlers.get(name)!({ ...event, waitUntil: (promise: Promise<unknown>) => { task = promise } })
    await task
  }
  return { dispatch, entries, deleted, skipWaiting, clients, matchAll }
}
describe('strict service-worker boundary', () => {
  it('verifies the complete release before installation and deletes a partial cache on mismatch', async () => {
    const good = workerFixture(); await good.dispatch('install', {}); expect(good.entries.size).toBe(2)
    const failed = workerFixture(true); await expect(failed.dispatch('install', {})).rejects.toThrow('Incomplete release'); expect(failed.deleted).toHaveBeenCalledWith('ascension-map-public-test')
  })
  it('handles root navigation without caching its query, and ignores analytics/private/POST requests', async () => {
    const worker = workerFixture(); await worker.dispatch('install', {})
    const respondWith = vi.fn()
    for (const request of [
      { method: 'GET', mode: 'cors', url: 'https://analytics.test/api/send' },
      { method: 'GET', mode: 'cors', url: 'https://app.test' + PWA_BASE + 'catalog.json?transfer=synthetic' },
      { method: 'GET', mode: 'navigate', url: 'https://app.test' + PWA_BASE + 'backup.json' },
      { method: 'POST', mode: 'cors', url: 'https://app.test' + PWA_BASE + 'catalog.json' },
    ]) await worker.dispatch('fetch', { request, respondWith })
    expect(respondWith).not.toHaveBeenCalled()
    await worker.dispatch('fetch', { request: { method: 'GET', mode: 'navigate', url: 'https://app.test' + PWA_BASE + '?transfer=synthetic' }, respondWith })
    expect(await (await respondWith.mock.calls[0][0]).text()).toBe('index.html')
    expect([...worker.entries.keys()].every((url) => !url.includes('?'))).toBe(true)
  })
  it('rejects repair with another open app window and permits its check for the sole requesting client', async () => {
    const worker = workerFixture(); const postMessage = vi.fn()
    worker.clients.push({ id: 'other', url: 'https://app.test' + PWA_BASE })
    await worker.dispatch('message', { data: { type: 'CHECK_WINDOWS' }, source: { id: 'current' }, ports: [{ postMessage }] })
    expect(postMessage).toHaveBeenLastCalledWith({ accepted: false }); expect(worker.skipWaiting).not.toHaveBeenCalled()
    worker.clients.pop()
    await worker.dispatch('message', { data: { type: 'CHECK_WINDOWS' }, source: { id: 'current' }, ports: [{ postMessage }] })
    expect(postMessage).toHaveBeenLastCalledWith({ accepted: true }); expect(worker.skipWaiting).not.toHaveBeenCalled()
  })
  it('never activates or removes old assets from a window snapshot when another window joins late', async () => {
    const worker = workerFixture(); const postMessage = vi.fn()
    worker.matchAll.mockImplementationOnce(async () => {
      const snapshot = [...worker.clients]
      queueMicrotask(() => worker.clients.push({ id: 'joined-after-snapshot', url: 'https://app.test' + PWA_BASE }))
      return snapshot
    })
    await worker.dispatch('message', { data: { type: 'CHECK_WINDOWS' }, source: { id: 'current' }, ports: [{ postMessage }] })
    expect(postMessage).toHaveBeenCalledWith({ accepted: true })
    expect(worker.clients).toHaveLength(2)
    // Even a stale client asking for the former update protocol cannot force it.
    await worker.dispatch('message', { data: { type: 'ACTIVATE_UPDATE' }, source: { id: 'current' }, ports: [{ postMessage }] })
    expect(worker.skipWaiting).not.toHaveBeenCalled(); expect(worker.deleted).not.toHaveBeenCalled()
    // Cache cleanup is reserved for the browser's eventual lifecycle activation.
    await worker.dispatch('activate', {})
    expect(worker.deleted).toHaveBeenCalledWith('ascension-map-public-old')
  })
})
