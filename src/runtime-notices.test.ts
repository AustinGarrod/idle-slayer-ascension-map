import { afterEach, describe, expect, it } from 'vitest'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { noticeHash, readNoticeManifest, renderNoticeIndex, validateBundleCoverage, validateNoticeDistribution, validateNoticeSources } from '../scripts/runtime-notices'

const root = process.cwd()
const manifest = readNoticeManifest(root)
const scratch: string[] = []
function temporary() {
  const directory = mkdtempSync(join(tmpdir(), 'idle-slayer-notices-'))
  scratch.push(directory)
  return directory
}
afterEach(() => {
  for (const directory of scratch.splice(0)) {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep + 'idle-slayer-notices-')) throw new Error('Refusing cleanup outside the notice fixture directory.')
    rmSync(directory, { recursive: true, force: true })
  }
})
const modules = [
  ...manifest.packages.filter((item) => item.inclusion === 'module').map((item) => ({ id: '/fixture/node_modules/' + item.name + '/index.js', renderedLength: 1 })),
  { id: '\0vite/modulepreload-polyfill.js', renderedLength: 1 },
  { id: '\0rolldown/runtime.js', renderedLength: 1 },
]

describe('complete bundled runtime notices', () => {
  it('preserves every complete installed upstream notice and generates an index without local paths', () => {
    expect(() => validateNoticeSources(root, manifest)).not.toThrow()
    expect(manifest.packages).toHaveLength(23)
    expect(manifest.packages.reduce((count, item) => count + item.notices.length, 0)).toBe(24)
    expect(renderNoticeIndex(manifest)).toBe(readFileSync('public/licenses/index.html', 'utf8'))
    expect(JSON.stringify(manifest)).not.toMatch(/node_modules|[A-Z]:\\|\/Users\/|\/home\//)
    expect(manifest.packages.find((item) => item.name === 'rolldown')?.notices.map((notice) => notice.source)).toContain('THIRD-PARTY-LICENSE')
    expect(manifest.packages.find((item) => item.name === 'qrcode-generator')).toMatchObject({
      version: '2.0.4', license: 'MIT', inclusion: 'module',
      notices: [{ source: 'LICENSE', file: 'qrcode-generator-MIT.txt', sha256: '3a850fa5f08101db6f40676c2786e10bd2cd5fff7b12ffdf1e0c434d4e49d90c' }],
    })
    // The package patch supplies the omitted license; its published JavaScript
    // must stay identical to the reviewed js2.0.4 release commit.
    expect(noticeHash(readFileSync('node_modules/qrcode-generator/dist/qrcode.mjs')))
      .toBe('ea91d7118a5395289170da848b7c6758b996163bfbccf312591ab65a4911b7c0')
  })
  it('rejects stale installed versions and notice hashes', () => {
    const staleVersion = structuredClone(manifest)
    staleVersion.packages[0].version = '0.0.0'
    expect(() => validateNoticeSources(root, staleVersion)).toThrow('Stale notice version')
    const staleNotice = structuredClone(manifest)
    staleNotice.packages[0].notices[0].sha256 = '0'.repeat(64)
    expect(() => validateNoticeSources(root, staleNotice)).toThrow('complete upstream bytes')
  })
  it('covers CSS/font identities, generated helpers and version-proven embedded Graphlib', () => {
    expect(validateBundleCoverage(root, manifest, modules)).toEqual(manifest.packages)
    const wrongEmbeddedVersion = structuredClone(manifest)
    wrongEmbeddedVersion.packages.find((item) => item.name === '@dagrejs/graphlib')!.version = '0.0.0'
    expect(() => validateBundleCoverage(root, wrongEmbeddedVersion, modules)).toThrow('Embedded Graphlib version')
  })
  it('rejects missing, unreviewed and newly generated runtime identities', () => {
    expect(() => validateBundleCoverage(root, manifest, modules.filter((module) => !module.id.includes('/react/')))).toThrow('coverage differs')
    expect(() => validateBundleCoverage(root, manifest, [...modules, { id: '/fixture/node_modules/unreviewed-runtime/index.js', renderedLength: 1 }])).toThrow('coverage differs')
    expect(() => validateBundleCoverage(root, manifest, [...modules, { id: '\0new-runtime-helper.js', renderedLength: 1 }])).toThrow('Unreviewed generated')
  })
  it('rejects an omitted or changed notice in the distributable', () => {
    const directory = temporary()
    cpSync('public/licenses', join(directory, 'licenses'), { recursive: true })
    const notice = manifest.packages[0].notices[0].file
    rmSync(join(directory, 'licenses', notice))
    expect(() => validateNoticeDistribution(root, directory)).toThrow()
    writeFileSync(join(directory, 'licenses', notice), 'Incomplete upstream notice')
    expect(() => validateNoticeDistribution(root, directory)).toThrow('Distributed notice')
  })
  it('binds distributed runtime coverage to the reviewed manifest and actual code bytes', () => {
    const directory = temporary()
    cpSync('public/licenses', join(directory, 'licenses'), { recursive: true })
    mkdirSync(join(directory, 'assets'))
    const code = 'export const noticeFixture = true\n'
    writeFileSync(join(directory, 'assets/index-fixture.js'), code)
    const receipt = {
      schemaVersion: 1, manifestSha256: noticeHash(readFileSync('public/licenses/notices.json')),
      packages: manifest.packages.map(({ name, version, inclusion }) => ({ name, version, inclusion })),
      chunks: [{ file: 'assets/index-fixture.js', sha256: noticeHash(code) }],
    }
    const saveReceipt = () => writeFileSync(join(directory, 'licenses/bundle-notices.json'), JSON.stringify(receipt))
    saveReceipt()
    expect(() => validateNoticeDistribution(root, directory)).not.toThrow()
    writeFileSync(join(directory, 'assets/index-fixture.js'), code + 'extraRuntime()\n')
    expect(() => validateNoticeDistribution(root, directory)).toThrow('code differs')
    writeFileSync(join(directory, 'assets/index-fixture.js'), code)
    receipt.manifestSha256 = '0'.repeat(64)
    saveReceipt()
    expect(() => validateNoticeDistribution(root, directory)).toThrow('coverage receipt')
    receipt.manifestSha256 = noticeHash(readFileSync('public/licenses/notices.json'))
    receipt.chunks[0].file = '../private.js'
    saveReceipt()
    expect(() => validateNoticeDistribution(root, directory)).toThrow('code differs')
  })
})
