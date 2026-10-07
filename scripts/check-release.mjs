import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { recommendationDataErrors } from '../src/domain/recommendation-data-validation.ts'
import { validateNoticeDistribution } from './runtime-notices.ts'
import { validateReleaseArtifact } from './release-artifact.ts'
import { validatePwaDistribution } from './pwa.ts'

const catalogBytes = readFileSync('public/catalog.json')
const catalog = JSON.parse(catalogBytes)
const receipt = JSON.parse(readFileSync('data/catalog-receipt.json', 'utf8'))
const audit = JSON.parse(readFileSync('data/native-rule-validation.json', 'utf8'))
const failed = Object.entries(catalog.verification).filter(([key, value]) => key !== 'evidence' && value !== true)
if (failed.length || !receipt.visualReview.complete) throw new Error(`Release blocked by catalog verification: ${failed.map(([key]) => key).join(', ')}`)
if (createHash('sha256').update(catalogBytes).digest('hex') !== receipt.catalogSha256) throw new Error('Catalog does not match reviewed receipt.')
if (audit.catalogSha256 !== receipt.catalogSha256 || Object.values(audit.checks).includes(false)) throw new Error('Native rule audit is incomplete or stale.')
const priorities = JSON.parse(readFileSync('src/data/wiki-priorities.json', 'utf8'))
const priorityErrors = recommendationDataErrors(priorities, catalog, receipt.catalogSha256)
if (priorityErrors.length) throw new Error(`Release blocked by recommendation data: ${priorityErrors.join('; ')}`)
const saveReceiptBytes = readFileSync('data/save-import-receipt.json')
const saveReceipt = JSON.parse(saveReceiptBytes)
if (createHash('sha256').update(saveReceiptBytes).digest('hex') !== 'd2746dfe356805cef33ccee155f732b3de5066faef11a1da58e3120102ded4ad'
  || saveReceipt.catalogSha256 !== receipt.catalogSha256 || saveReceipt.reviewedGameVersion !== catalog.gameVersion
  || saveReceipt.steamBuild !== catalog.steamBuild
  || JSON.stringify(saveReceipt.milestoneMappings.map((item) => item.id).sort()) !== JSON.stringify(catalog.milestones.map((item) => item.id).sort())) throw new Error('Steam import evidence does not match the reviewed catalog and receipt. Re-review native save semantics before supporting a changed game version.')
validateReleaseArtifact(process.cwd(), 'dist')
validateNoticeDistribution(process.cwd(), 'dist')
validatePwaDistribution(process.cwd(), 'dist')
console.log(`Release gate passed: built application entries and CSS assets, ${receipt.nativeNodeCount} reviewed upgrades, ${receipt.nativeEdgeCount} native connections, ${receipt.spriteCount} receipt-matched icons, ${priorities.rows.length} reviewed wiki priorities and complete runtime notices; static dist contains no private game inputs.`)
