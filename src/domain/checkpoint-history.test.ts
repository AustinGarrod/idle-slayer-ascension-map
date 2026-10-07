import { describe, expect, it } from 'vitest'
import catalogData from '../../public/catalog.json'
import type { Catalog, Profile } from './types'
import { emptyProfile } from './types'
import { checkpointHistory } from './checkpoint-history'
import { planUltraAscension, visibility } from './rules'
import { planPriorAscensions } from './prior-ascensions'
import { compareProgress } from './progress-comparison'
import { sameRecordedProfile } from './checkpoints'

const catalog = catalogData as Catalog
const id = (title: string) => catalog.upgrades.find((node) => node.title === title)!.id
const land = catalog.upgrades.find((node) => /land.?lord/i.test(node.title))!
const before: Profile = { ...emptyProfile(catalog.revision), epoch: 1, showSpoilers: true, purchases: {
  [id('Ultra Ascension')]: { epoch: 1, active: true }, [id('Permanent Slayer')]: { epoch: 1, active: true },
  [land.id]: { epoch: 1, active: false }, [id('Village Key')]: { epoch: 1, active: true }, 'future-unknown': { epoch: 0, active: false },
}, milestones: { 'future-milestone': true } }
const reset = planUltraAscension(catalog, before)!

describe('verified checkpoint operation context', () => {
  it('matches the exact native reset, distinguishes cleared repeats, retained ownership and activation', () => {
    const result = checkpointHistory(catalog, before, reset.profile, reset.profile, [{ profile: before, action: 'ultra_ascension' }], [])!
    expect(result.steps).toEqual(['ultra_ascension'])
    expect(result.cleared).toEqual(reset.cleared)
    expect(result.activated).toContain(land.id)
    expect(result.cleared).not.toContain(id('Village Key'))
    expect(reset.profile.purchases[land.id].active).toBe(true)
    expect(reset.profile.purchases['future-unknown']).toEqual(before.purchases['future-unknown'])
  })
  it('never turns a higher counter or a claimed reset label into native reset evidence', () => {
    const after = { ...structuredClone(before), epoch: 2 }
    expect(checkpointHistory(catalog, before, after, after, [], [])).toBeNull()
    expect(checkpointHistory(catalog, before, after, after, [{ profile: before, action: 'ultra_ascension' }], [])).toBeNull()
    const history = planPriorAscensions(catalog, before, '2')
    if (history.kind !== 'ready') throw new Error('Fixture history unavailable')
    const result = checkpointHistory(catalog, before, history.profile, history.profile, [{ profile: before, action: 'prior_ascensions' }], [])!
    expect(result.steps).toEqual(['prior_ascensions']); expect(result.cleared).toEqual([]); expect(result.activated).toEqual([])
  })
  it('explains an app import or restore while leaving underlying gameplay causes unknown', () => {
    for (const action of ['game_import', 'restore'] as const) {
      const result = checkpointHistory(catalog, before, reset.profile, reset.profile, [{ profile: before, action }], [])!
      expect(result.steps).toEqual([action]); expect(result.cleared).toEqual([])
    }
    expect(checkpointHistory(catalog, before, reset.profile, reset.profile, [], [])).toBeNull()
  })
  it('supports the actual Redo stack and explicitly reverses comparison direction', () => {
    const forward = checkpointHistory(catalog, before, reset.profile, before, [], [{ profile: reset.profile, action: 'ultra_ascension' }])!
    expect(forward.reversed).toBe(false); expect(forward.activated).toContain(land.id)
    const reverse = checkpointHistory(catalog, reset.profile, before, before, [], [{ profile: reset.profile, action: 'ultra_ascension' }])!
    expect(reverse.reversed).toBe(true); expect(reverse.cleared).toEqual([]); expect(reverse.activated).toEqual([])
  })
  it('refuses ambiguous repeated-state paths and catalog revision alone changes no recorded state', () => {
    const other = { ...before, showSpoilers: false }
    expect(checkpointHistory(catalog, before, reset.profile, reset.profile, [{ profile: before, action: 'spoilers' }, { profile: other, action: 'spoilers' }, { profile: before, action: 'ultra_ascension' }], [])).toBeNull()
    expect(sameRecordedProfile(before, { ...before, catalogRevision: 'later' })).toBe(true)
  })
  it('uses one current-visible universe even when historical snapshots showed spoilers', () => {
    const viewer = emptyProfile(catalog.revision)
    const hidden = catalog.upgrades.find((node) => !visibility(catalog, viewer).ids.has(node.id))!
    const old = { ...emptyProfile('older'), showSpoilers: true, purchases: { [hidden.id]: { epoch: 0, active: false }, 'future-hidden': { epoch: 0, active: true } } }
    const changes = compareProgress(catalog, old, viewer, viewer)
    expect(changes.upgrades.some((change) => change.upgrade.id === hidden.id)).toBe(false)
    expect(changes.upgrades.some((change) => change.upgrade.id === 'future-hidden')).toBe(false)
    expect(old.purchases['future-hidden']).toBeDefined()
  })
})
