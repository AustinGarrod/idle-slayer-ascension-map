import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const catalogBytes = readFileSync('public/catalog.json')
const catalog = JSON.parse(catalogBytes)
const receipt = JSON.parse(readFileSync('data/catalog-receipt.json', 'utf8'))
const audit = JSON.parse(readFileSync('data/native-rule-validation.json', 'utf8'))
const failed = Object.entries(catalog.verification).filter(([key, value]) => key !== 'evidence' && value !== true)
if (failed.length || !receipt.visualReview.complete) throw new Error(`Release blocked by catalog verification: ${failed.map(([key]) => key).join(', ')}`)
if (createHash('sha256').update(catalogBytes).digest('hex') !== receipt.catalogSha256) throw new Error('Catalog does not match reviewed receipt.')
if (audit.catalogSha256 !== receipt.catalogSha256 || Object.values(audit.checks).includes(false)) throw new Error('Native rule audit is incomplete or stale.')
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (/^(?:\.local-game|Idle Slayer_Data|\.git|logic|extract)$/i.test(entry.name)) throw new Error(`Private source in deployment: ${path}`)
      inspect(path)
    } else if (/\.(?:dll|exe|acf|assets|resS|resource|dat|py|ps1)$/i.test(entry.name) || /(?:^\.env|appmanifest)/i.test(entry.name)) throw new Error(`Private input in deployment: ${path}`)
  }
}
inspect('dist')
console.log(`Release gate passed: ${receipt.nativeNodeCount} reviewed upgrades, ${receipt.nativeEdgeCount} native connections; static dist contains no private game inputs.`)
