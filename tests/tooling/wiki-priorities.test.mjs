// Entirely invented wiki/API and catalog fixture; never downloads source text.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const script = fileURLToPath(new URL('../../scripts/extract/wiki-priorities.mjs', import.meta.url))
const apiPage = (text, revid = 7187) => ({ query: { pages: { synthetic: { revisions: [
  { revid, timestamp: '2000-01-01T00:00:00Z', slots: { main: { '*': text } } },
] } } } })
const row = (title, cost, effect = 'Synthetic effect', image = '[[File:Synthetic.png]]') =>
  `|${image}\n|${title}\n|${cost}\n|${effect}`
const table = (rows) => `{| class="wikitable"\n${rows.join('\n|-\n')}\n|}`
function fixture() {
  const upgrades = [
    { id: 'exact', title: 'Synthetic & precise', cost: '9007199254740993123456789' },
    { id: 'fractional', title: 'Synthetic fraction', cost: '123' },
    { id: 'duplicate-a', title: 'Synthetic duplicate', cost: '10' },
    { id: 'duplicate-b', title: 'Synthetic duplicate', cost: '20' },
    { id: 'cyclone', title: 'Soul Cyclone', cost: '300', description: 'Synthetic cyclone effect' },
  ].map((node) => ({ description: 'Synthetic effect', activation: 'immediate', purchase: { kind: 'always' }, ...node }))
  const witnesses = []
  for (let index = 0; index < 11; index++) {
    upgrades.push({ id: `parent-${index}`, title: `Synthetic parent ${index}`, description: 'Synthetic effect',
      cost: '1', activation: 'immediate', purchase: { kind: 'always' } })
    upgrades.push({ id: `key-${index}`, title: 'Astral Key', description: 'Synthetic key effect',
      cost: (10n ** BigInt(index + 3)).toString(), activation: 'immediate',
      purchase: { kind: 'all', requirements: [{ kind: 'ultra-ascended' },
        { kind: 'any', requirements: [{ kind: 'active', id: `parent-${index}` }] }] } })
    witnesses.push(row(`Astral Key (+${index + 1})`, `1e${index + 3}`, `Synthetic parent ${index}`))
  }
  return { catalog: { revision: 'synthetic-v1', gameVersion: 'synthetic', upgrades }, witnesses,
    mainRows: [row("<b>[[Synthetic|Synthetic &amp; precise]]</b><ref>Ignore reference</ref>", '9.007199254740993123456789e24', 'Synthetic effect', '|[[File:Synthetic.png]]'),
      '|colspan="4"|Narrative row is not an upgrade', row('Synthetic fraction', '1.23e2'),
      row('Synthetic duplicate', '10'), row('Unmapped synthetic name', '7'),
      row('Astral Key', '1e3'), row('Cyclone Soul', '300', 'Synthetic cyclone effect')],
    laterRows: [row('Synthetic &amp; precise', '9007199254740993123456789')],
    sections: [{ level: '3', line: 'Synthetic early', anchor: 'Synthetic_early' },
      { level: '3', line: 'Synthetic later', anchor: 'Synthetic_later' },
      { level: '3', line: 'Quick Ultra Ascensions (Repeatable)', anchor: 'Quick_UA' }],
  }
}
function execute(data, alter = () => {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'synthetic-wiki-parser-'))
  try {
    const input = path.join(root, '.local-game', 'synthetic-wiki')
    mkdirSync(input, { recursive: true })
    mkdirSync(path.join(root, 'public'))
    const text = `Last updated: vSynthetic\n===Synthetic early===\n${table(data.mainRows)}\n===Synthetic later===\n${table(data.laterRows)}\n===Quick Ultra Ascensions (Repeatable)===\n${table(data.witnesses)}\n`
    const files = {
      'tier-list-api.json': apiPage(text), 'tier-sections.json': { parse: { revid: 7187, sections: data.sections } },
      'rightsinfo.json': { query: { rightsinfo: { text: 'CC-BY-SA', url: 'https://creativecommons.org/licenses/by-sa/3.0/' } } },
      'licensing-api.json': apiPage('all of the text on a wiki is licensed under the [https://creativecommons.org/licenses/by-sa/3.0/ synthetic license]', 1),
      'ascension-strategy-api.json': apiPage('Synthetic strategy context', 2),
      'fetch-receipt.json': { retrievedAt: '2000-01-01' },
    }
    alter(files)
    for (const [name, value] of Object.entries(files)) writeFileSync(path.join(input, name), JSON.stringify(value))
    writeFileSync(path.join(root, 'public/catalog.json'), JSON.stringify(data.catalog))
    const output = path.join(root, 'synthetic-priorities.json')
    // No --refresh: this executes the shipped offline entry point with only local inputs.
    const result = spawnSync(process.execPath, [script, `--input=${input}`, `--output=${output}`],
      { cwd: root, encoding: 'utf8', timeout: 10000 })
    return { ...result, data: result.status === 0 ? JSON.parse(readFileSync(output, 'utf8')) : null }
  } finally {
    // Only this known mkdtemp child under the OS temp root is removed.
    assert.equal(path.dirname(root), tmpdir())
    assert.match(path.basename(root), /^synthetic-wiki-parser-/)
    rmSync(root, { recursive: true, force: true })
  }
}

test('actual offline CLI maps exact large costs, rich text, alias and duplicate witnesses without invented priorities', () => {
  const result = execute(fixture())
  assert.equal(result.status, 0, result.stderr)
  const { rows, occurrences, coverage, stages } = result.data
  assert.deepEqual(rows.map(({ id, priority }) => ({ id, priority })), [
    { id: 'exact', priority: 1 }, { id: 'fractional', priority: 2 },
    { id: 'key-0', priority: 5 }, { id: 'cyclone', priority: 6 },
  ])
  assert.equal(occurrences.find((entry) => entry.id === 'exact').wikiCost, '9007199254740993123456789')
  assert.equal(occurrences.filter((entry) => entry.id === 'exact').length, 2)
  assert.equal(coverage.ambiguousRows[0].title, 'Synthetic duplicate')
  assert.deepEqual(coverage.ambiguousRows[0].candidateIds, ['duplicate-a', 'duplicate-b'])
  assert.equal(coverage.unmappedRows[0].title, 'Unmapped synthetic name')
  assert.deepEqual(coverage.costMismatches, [])
  assert.equal(coverage.syntaxCorrections.length, 1)
  assert.equal(coverage.reviewedAliases[0].id, 'cyclone')
  assert.equal(stages[0].rowCount, 6)
  for (let index = 0; index < 11; index++) {
    const witness = occurrences.find((entry) => entry.id === `key-${index}` && entry.supplementary)
    assert.equal(witness.mapping, 'duplicate-title-exact-cost-and-prerequisite')
    assert.equal(witness.prerequisiteWitness, `Synthetic parent ${index}`)
    if (index > 0) assert.ok(coverage.unrankedNativeIds.includes(`key-${index}`))
  }
})

test('exact integer parsing rejects fractional costs and reports drift instead of rounding', () => {
  const data = fixture()
  data.mainRows.unshift(row('Synthetic fraction', '1.235e2'))
  const result = execute(data)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.data.coverage.costMismatches, [
    { id: 'fractional', title: 'Synthetic fraction', tier: 'Synthetic early', wikiCost: null, nativeCost: '123' },
  ])
})

test('duplicate Astral Key cost alone cannot map a wrong prerequisite', () => {
  const data = fixture()
  data.witnesses[0] = row('Astral Key (+1)', '1e3', 'Unrelated synthetic prerequisite')
  const result = execute(data)
  assert.equal(result.status, 0, result.stderr)
  assert.ok(result.data.coverage.ambiguousRows.some((entry) => entry.title === 'Astral Key'))
  assert.ok(!result.data.rows.some((entry) => entry.id === 'key-0'))
})

test('actual CLI fails closed on revision, section, license, witness count and reviewed alias drift', () => {
  const cases = [
    ['requested revision', (files) => { files['tier-list-api.json'].query.pages.synthetic.revisions[0].revid = 1 }],
    ['Section anchors', (files) => { files['tier-sections.json'].parse.revid = 1 }],
    ['Missing exact section anchor', (files) => { files['tier-sections.json'].parse.sections[0].line = 'Changed section' }],
    ['Wiki license changed', (files) => { files['rightsinfo.json'].query.rightsinfo.text = 'Changed license' }],
    ['license version', (files) => { files['licensing-api.json'] = apiPage('Changed license') }],
    ['witness table changed', (files) => { const revision = files['tier-list-api.json'].query.pages.synthetic.revisions[0]; revision.slots.main['*'] = revision.slots.main['*'].replace('Astral Key (+11)', 'Changed witness') }],
    ['alias no longer matches', (files) => { const revision = files['tier-list-api.json'].query.pages.synthetic.revisions[0]; revision.slots.main['*'] = revision.slots.main['*'].replace('Synthetic cyclone effect', 'Changed effect') }],
  ]
  for (const [message, alter] of cases) {
    const result = execute(fixture(), alter)
    assert.notEqual(result.status, 0, message)
    assert.ok(result.stderr.includes(message), result.stderr)
    assert.equal(result.data, null)
  }
})
