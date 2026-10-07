import { describe, expect, it, vi } from 'vitest'
import { createProfileSession, PROFILE_WRITE_LOCK, type ProfileLocks } from './profile-session'
import { emptyProfile, type Profile } from './types'
import { exportProfileBackup, PROFILE_STORAGE_KEY } from './storage'

const profile = (id: string): Profile => ({ ...emptyProfile('fixture'), purchases: { [id]: { epoch: 0, active: true } } })
function fixture(initial: string | null = null, locks?: ProfileLocks | false) {
  let stored = initial
  let unavailable = false
  let denyWrites = false
  const storage = {
    getItem: vi.fn(() => { if (unavailable) throw new Error('Synthetic read failure'); return stored }),
    setItem: vi.fn((key: string, text: string) => { if (denyWrites) throw new Error('Synthetic quota failure'); expect(key).toBe(PROFILE_STORAGE_KEY); stored = text }),
  }
  const coordination: ProfileLocks = { request: vi.fn(async (_name, _options, callback) => callback({})) }
  const session = createProfileSession({ revision: 'fixture', storage: () => storage, locks: () => locks === false ? undefined : locks ?? coordination })
  session.initialize()
  return { session, storage, coordination, stored: () => stored, external: (text: string | null) => { stored = text }, failReads: (failed = true) => { unavailable = failed }, failWrites: (failed = true) => { denyWrites = failed } }
}
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
function delayedLocks() {
  const callbacks: (() => void)[] = []
  const locks: ProfileLocks = { request: <T>(_name: string, _options: { mode: 'exclusive'; ifAvailable: true }, callback: (lock: unknown | null) => T) => new Promise<T>((resolve) => callbacks.push(() => resolve(callback({})))) }
  return { locks, release: () => callbacks.shift()!() }
}

describe('coordinated profile persistence', () => {
  it('persists only inside the named exclusive lock and preserves the portable schema', async () => {
    let held = false
    const locks: ProfileLocks = { request: async (name, options, callback) => {
      expect(name).toBe(PROFILE_WRITE_LOCK)
      expect(options).toEqual({ mode: 'exclusive', ifAvailable: true })
      held = true
      try { return callback({}) } finally { held = false }
    } }
    const f = fixture(null, locks)
    const setItem = f.storage.setItem.getMockImplementation()!
    f.storage.setItem.mockImplementation((key, text) => { expect(held).toBe(true); setItem(key, text) })
    const next = profile('unknown-future-id')
    expect(f.session.apply(next)).toBe(true)
    await settled()
    expect(JSON.parse(f.stored()!)).toEqual(next)
    expect(f.session.getState()).toMatchObject({ dirty: false, pending: false, conflict: null })
  })

  it('follows valid external state when clean and invalidates former undo/history', async () => {
    const f = fixture()
    f.session.apply(profile('first')); await settled()
    expect(f.session.getState().history).toHaveLength(1)
    const incoming = { ...profile('other-tab'), purchases: { ...profile('other-tab').purchases, unknown: { epoch: 0, active: false } }, milestones: { unknown: true as const } }
    f.external(JSON.stringify(incoming))
    expect(f.session.refreshExternal()).toBe(true)
    expect(f.session.getState()).toMatchObject({ profile: incoming, history: [], dirty: false, conflict: null, externalVersion: 1 })
    expect(f.session.undo()).toBe(false)
    expect(f.session.refreshExternal()).toBe(false)
  })

  it('refuses stale read/compare/write even before a storage event is delivered', async () => {
    const delayed = delayedLocks()
    const f = fixture(null, delayed.locks)
    f.session.apply(profile('local'))
    f.external(JSON.stringify(profile('other-tab')))
    delayed.release(); await settled()
    expect(f.storage.setItem).not.toHaveBeenCalled()
    expect(f.session.getState()).toMatchObject({ profile: profile('local'), dirty: true, pending: false, conflict: { kind: 'valid', profile: profile('other-tab') } })
  })

  it('does not allow a superseded pending callback to write after external conflict', async () => {
    const delayed = delayedLocks()
    const f = fixture(null, delayed.locks)
    f.session.apply(profile('local'))
    f.external(JSON.stringify(profile('other-tab')))
    f.session.refreshExternal()
    const version = f.session.getState().version
    delayed.release(); await settled()
    expect(f.storage.setItem).not.toHaveBeenCalled()
    expect(f.session.getState()).toMatchObject({ version, pending: false, dirty: true, profile: profile('local') })
    expect(f.stored()).toBe(JSON.stringify(profile('other-tab')))
  })

  it('accepts one pending local operation and safely cancels it for reload', async () => {
    const delayed = delayedLocks()
    const f = fixture(null, delayed.locks)
    expect(f.session.apply(profile('local'))).toBe(true)
    expect(f.session.apply(profile('later'))).toBe(false)
    expect(await f.session.save()).toBe(false)
    expect(exportProfileBackup(f.session.getState().profile).ok).toBe(true)
    f.session.cancelPending()
    delayed.release(); await settled()
    expect(f.storage.setItem).not.toHaveBeenCalled()
    expect(f.session.getState()).toMatchObject({ profile: profile('local'), pending: false, dirty: true })
  })

  it.each(['missing', 'held', 'rejected'] as const)('keeps an exportable memory session when coordination is %s', async (condition) => {
    const locks: ProfileLocks = { request: async (_name, _options, callback) => {
      if (condition === 'rejected') throw new Error('Synthetic coordination failure')
      return callback(null)
    } }
    const f = fixture(null, condition === 'missing' ? false : locks)
    f.session.apply(profile('local')); await settled()
    expect(f.storage.setItem).not.toHaveBeenCalled()
    expect(f.session.getState()).toMatchObject({ profile: profile('local'), pending: false, dirty: true, errorKind: 'unavailable' })
    expect(exportProfileBackup(f.session.getState().profile).ok).toBe(true)
  })

  it('retains unsaved edits on write failure, retries the current snapshot, and guards undo writes', async () => {
    const f = fixture()
    f.failWrites()
    f.session.apply(profile('local')); await settled()
    expect(f.session.getState()).toMatchObject({ dirty: true, errorKind: 'storage-write' })
    f.failWrites(false)
    f.session.retry(); await settled()
    expect(f.session.getState()).toMatchObject({ dirty: false, error: '' })
    expect(JSON.parse(f.stored()!)).toEqual(profile('local'))
    expect(f.session.undo()).toBe(true); await settled()
    expect(JSON.parse(f.stored()!)).toEqual(emptyProfile('fixture'))
  })

  it.each([null, '{corrupt}'])('preserves dirty state when external storage becomes %s', async (external) => {
    const f = fixture(JSON.stringify(profile('previous')))
    f.failWrites(); f.session.apply(profile('local')); await settled()
    f.external(external); f.session.refreshExternal()
    expect(f.session.getState()).toMatchObject({ profile: profile('local'), dirty: true, history: [], conflict: { kind: external === null ? 'valid' : 'invalid', text: external } })
    f.failWrites(false)
    expect(await f.session.save()).toBe(false)
    expect(f.stored()).toBe(external)
    expect(await f.session.save(true, f.session.getState().version)).toBe(true)
    expect(JSON.parse(f.stored()!)).toEqual(profile('local'))
  })

  it('follows deleted storage while clean without recreating it', () => {
    const f = fixture(JSON.stringify(profile('previous')))
    f.external(null); f.session.refreshExternal()
    expect(f.session.getState()).toMatchObject({ profile: emptyProfile('fixture'), dirty: false, history: [], conflict: null })
    expect(f.storage.setItem).not.toHaveBeenCalled()
  })

  it('never overwrites unreadable storage through ordinary or explicit replacement', async () => {
    const f = fixture(JSON.stringify(profile('previous')))
    f.failReads(); f.session.refreshExternal()
    const version = f.session.getState().version
    expect(await f.session.save(true, version)).toBe(false)
    expect(f.storage.setItem).not.toHaveBeenCalled()
    expect(f.session.getState().profile).toEqual(profile('previous'))
    f.failReads(false); f.session.refreshExternal()
    expect(f.session.getState().conflict?.kind).toBe('valid')
  })

  it('requires the reviewed version for conflict choices and rechecks external text before replacement', async () => {
    const f = fixture()
    f.failWrites(); f.session.apply(profile('local')); await settled()
    f.external(JSON.stringify(profile('other-tab'))); f.session.refreshExternal(); f.failWrites(false)
    const reviewed = f.session.getState().version
    f.external(JSON.stringify(profile('newer-tab')))
    expect(await f.session.save(true, reviewed)).toBe(false)
    expect(f.stored()).toBe(JSON.stringify(profile('newer-tab')))
    expect(f.session.useSaved(reviewed)).toBe(false)
    expect(f.session.getState().profile).toEqual(profile('local'))
    expect(f.session.useSaved(f.session.getState().version)).toBe(true)
    expect(f.session.getState().profile).toEqual(profile('newer-tab'))
    expect(f.session.undo()).toBe(true); await settled()
    expect(JSON.parse(f.stored()!)).toEqual(profile('local'))
  })

  it('does not bypass a known conflict when applying restore/import/clear replacement state', async () => {
    const f = fixture()
    f.failWrites(); f.session.apply(profile('local')); await settled()
    f.external(JSON.stringify(profile('other-tab'))); f.session.refreshExternal(); f.failWrites(false)
    f.session.apply(profile('restored'), true); await settled()
    expect(f.stored()).toBe(JSON.stringify(profile('other-tab')))
    expect(f.session.getState()).toMatchObject({ profile: profile('restored'), dirty: true, conflict: { kind: 'valid' } })
  })

  it('allows a reviewed restore to replace unchanged corrupt startup storage, with undo still safe', async () => {
    const f = fixture('{corrupt}')
    f.session.apply(profile('restored'), true); await settled()
    expect(JSON.parse(f.stored()!)).toEqual(profile('restored'))
    expect(f.session.getState()).toMatchObject({ dirty: false, writable: true })
    f.session.undo(); await settled()
    expect(JSON.parse(f.stored()!)).toEqual(emptyProfile('fixture'))
  })
})
