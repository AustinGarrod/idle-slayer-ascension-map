import { afterEach, describe, expect, it } from 'vitest'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { validateReleaseArtifact } from '../scripts/release-artifact'

const root = process.cwd()
const base = '/idle-slayer-ascension-map/'
const catalog = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as { upgrades: { icon: string }[] }
const scratch: string[] = []
const html = '<!doctype html><html><head><script type="module" src="' + base + 'assets/index-fixture.js"></script>'
  + '<link rel="stylesheet" href="' + base + 'assets/index-fixture.css"></head><body><div id="root"></div></body></html>'
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'idle-slayer-artifact-'))
  scratch.push(directory)
  const dist = join(directory, 'dist')
  mkdirSync(join(dist, 'licenses'), { recursive: true })
  cpSync('public/assets/upgrades', join(dist, 'assets/upgrades'), { recursive: true })
  cpSync('public/catalog.json', join(dist, 'catalog.json'))
  writeFileSync(join(dist, 'index.html'), html)
  writeFileSync(join(dist, 'assets/index-fixture.js'), 'export const fixture = true\n')
  writeFileSync(join(dist, 'assets/index-fixture.css'), '@import "./extra.css";@font-face{src:url("' + base + 'assets/font.woff2")}body{background-image:url("data:image/svg+xml,%3Csvg/%3E")}')
  writeFileSync(join(dist, 'assets/extra.css'), 'body{color:gold}')
  writeFileSync(join(dist, 'assets/font.woff2'), 'Synthetic bundled font bytes')
  writeFileSync(join(dist, 'licenses/bundle-notices.json'), JSON.stringify({ chunks: [{ file: 'assets/index-fixture.js' }] }))
  return dist
}
afterEach(() => {
  for (const directory of scratch.splice(0)) {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep + 'idle-slayer-artifact-')) throw new Error('Refusing cleanup outside artifact fixture directories.')
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('actual deployment artifact release gate', () => {
  it('accepts local built entries, CSS imports/fonts, and all 288 receipt-matched public icons', () => {
    expect(catalog.upgrades).toHaveLength(288)
    expect(() => validateReleaseArtifact(root, fixture())).not.toThrow()
  })
  it('rejects an empty artifact and remaining runtime files without application HTML, catalog or icons', () => {
    const dist = fixture()
    for (const file of ['index.html', 'catalog.json', 'assets/upgrades']) rmSync(join(dist, file), { recursive: true })
    expect(() => validateReleaseArtifact(root, dist)).toThrow()
    for (const file of ['licenses', 'assets']) rmSync(join(dist, file), { recursive: true })
    expect(() => validateReleaseArtifact(root, dist)).toThrow()
  })
  it.each(['index.html', 'catalog.json', 'assets/index-fixture.js', 'assets/index-fixture.css', 'assets/extra.css', 'assets/font.woff2', catalog.upgrades[0].icon])('rejects a missing required asset: %s', (file) => {
    const dist = fixture()
    rmSync(join(dist, file))
    expect(() => validateReleaseArtifact(root, dist)).toThrow()
  })
  it.each(['index.html', 'assets/index-fixture.js', 'assets/index-fixture.css', 'assets/font.woff2', catalog.upgrades[0].icon])('rejects an empty required asset: %s', (file) => {
    const dist = fixture()
    writeFileSync(join(dist, file), '')
    expect(() => validateReleaseArtifact(root, dist)).toThrow('nonempty')
  })
  it('rejects stale distributed catalog and icon bytes against the reviewed receipt', () => {
    const dist = fixture()
    writeFileSync(join(dist, 'catalog.json'), readFileSync('public/catalog.json', 'utf8') + '\n')
    expect(() => validateReleaseArtifact(root, dist)).toThrow('Distributed catalog')
    cpSync('public/catalog.json', join(dist, 'catalog.json'))
    writeFileSync(join(dist, catalog.upgrades.at(-1)!.icon), 'Synthetic changed icon bytes')
    expect(() => validateReleaseArtifact(root, dist)).toThrow('Distributed icon')
  })
  it('rejects unreviewed extra sprites and receipt coverage that differs from the catalog', () => {
    const dist = fixture()
    writeFileSync(join(dist, 'assets/upgrades/unreviewed.png'), 'Synthetic unreviewed sprite')
    expect(() => validateReleaseArtifact(root, dist)).toThrow('sprite inventory')
    rmSync(join(dist, 'assets/upgrades/unreviewed.png'))
    const source = join(dist, '..', 'source')
    mkdirSync(join(source, 'public'), { recursive: true })
    mkdirSync(join(source, 'data'))
    cpSync('public/catalog.json', join(source, 'public/catalog.json'))
    const receipt = JSON.parse(readFileSync('data/catalog-receipt.json', 'utf8'))
    writeFileSync(join(source, 'data/catalog-receipt.json'), JSON.stringify({ ...receipt, nativeEdgeCount: receipt.nativeEdgeCount - 1 }))
    expect(() => validateReleaseArtifact(source, dist)).toThrow('catalog coverage')
  })
  it('rejects a missing root, absent built entries, source TypeScript and an unreceipted module', () => {
    const dist = fixture()
    writeFileSync(join(dist, 'index.html'), html.replace('id="root"', 'id="other"'))
    expect(() => validateReleaseArtifact(root, dist)).toThrow('root mount')
    writeFileSync(join(dist, 'index.html'), '<div id="root"></div>')
    expect(() => validateReleaseArtifact(root, dist)).toThrow('built module and stylesheet')
    writeFileSync(join(dist, 'assets/source.tsx'), 'export const source = true')
    writeFileSync(join(dist, 'index.html'), html.replace('index-fixture.js', 'source.tsx'))
    expect(() => validateReleaseArtifact(root, dist)).toThrow('built runtime receipt')
    writeFileSync(join(dist, 'assets/other.js'), 'export const unreceipted = true')
    writeFileSync(join(dist, 'index.html'), html.replace('index-fixture.js', 'other.js'))
    expect(() => validateReleaseArtifact(root, dist)).toThrow('built runtime receipt')
  })
  it.each(['../../outside.woff2', '/outside.woff2', base + 'assets/%2e%2e/outside.woff2', 'C:\\private\\font.woff2', 'https://example.invalid/font.woff2', '//example.invalid/font.woff2'])('rejects unsafe or external CSS asset reference: %s', (reference) => {
    const dist = fixture()
    writeFileSync(join(dist, 'assets/index-fixture.css'), '@font-face{src:url("' + reference + '")}')
    expect(() => validateReleaseArtifact(root, dist)).toThrow(/Unsafe deployment|outside the Pages base/)
  })
  it('checks url-form CSS imports as stylesheets rather than accepting another asset type', () => {
    const dist = fixture()
    writeFileSync(join(dist, 'assets/index-fixture.css'), '@import url("./extra.css");')
    expect(() => validateReleaseArtifact(root, dist)).not.toThrow()
    writeFileSync(join(dist, 'assets/index-fixture.css'), '@import url("./font.woff2");')
    expect(() => validateReleaseArtifact(root, dist)).toThrow('built CSS')
  })
  it('rejects a wrong Pages base in HTML and private files or directories anywhere in the artifact', () => {
    const dist = fixture()
    writeFileSync(join(dist, 'index.html'), html.replaceAll(base, '/wrong-map/'))
    expect(() => validateReleaseArtifact(root, dist)).toThrow('Pages base')
    writeFileSync(join(dist, 'index.html'), html)
    writeFileSync(join(dist, 'assets/synthetic.sav'), 'Synthetic private input')
    expect(() => validateReleaseArtifact(root, dist)).toThrow('Private input')
    rmSync(join(dist, 'assets/synthetic.sav'))
    mkdirSync(join(dist, '.local-game'))
    expect(() => validateReleaseArtifact(root, dist)).toThrow('Private source')
  })
  it('rejects linked directories instead of reading files outside the distributable', () => {
    const dist = fixture()
    const outside = join(dist, '..', 'outside')
    mkdirSync(outside)
    writeFileSync(join(outside, 'synthetic.sav'), 'Synthetic private input')
    symlinkSync(outside, join(dist, 'assets/linked-input'), 'junction')
    expect(() => validateReleaseArtifact(root, dist)).toThrow('Linked file or directory')
  })
})
