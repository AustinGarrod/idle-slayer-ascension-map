import { useId } from 'react'
import type { GameSaveImportPreview } from './domain/game-save-import'
import { visibility } from './domain/rules'
import type { Catalog, Profile } from './domain/types'

interface GameSaveImportPanelProps {
  catalog: Catalog
  currentProfile: Profile
  preview: GameSaveImportPreview
  onApply: () => void
  onCancel: () => void
}

function visibleProgress(catalog: Catalog, profile: Profile) {
  const visible = visibility(catalog, profile)
  const ownedLocks = visible.upgrades.filter((upgrade) => upgrade.activation === 'after-ultra-ascension' && Object.hasOwn(profile.purchases, upgrade.id))
  return {
    owned: visible.owned,
    activeLocks: ownedLocks.filter((upgrade) => profile.purchases[upgrade.id].active).length,
    pendingLocks: ownedLocks.filter((upgrade) => !profile.purchases[upgrade.id].active).length,
    milestones: visible.milestones.filter((milestone) => profile.milestones[milestone.id] === true).length,
  }
}

export function GameSaveImportPanel({ catalog, currentProfile, preview, onApply, onCancel }: GameSaveImportPanelProps) {
  const scopeId = useId()
  const notesId = useId()
  const current = visibleProgress(catalog, currentProfile)
  const incoming = visibleProgress(catalog, preview.profile)
  const rows = [
    { label: 'Ultra Ascensions', current: currentProfile.epoch, incoming: preview.profile.epoch },
    { label: 'Owned upgrades', current: current.owned, incoming: incoming.owned },
    { label: 'Active Astral locks', current: current.activeLocks, incoming: incoming.activeLocks },
    { label: 'Pending Astral locks', current: current.pendingLocks, incoming: incoming.pendingLocks },
    { label: 'Map milestones', current: current.milestones, incoming: incoming.milestones },
  ]
  return <div className="game-save-import-panel">
    <p className="game-save-import-intro">Recorded map progress is replaced. Existing unrecognized entries and your spoiler setting are kept.</p>
    <p className="game-save-import-version">Save version {preview.sourceVersion} · Native catalog {catalog.gameVersion}</p>
    <table className="game-save-import-comparison" aria-describedby={scopeId}>
      <caption>Map progress preview</caption>
      <thead><tr><th scope="col">Progress</th><th scope="col">Current</th><th scope="col">After import</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.current.toLocaleString('en')}</td><td>{row.incoming.toLocaleString('en')}</td></tr>)}</tbody>
    </table>
    <p className="game-save-import-scope" id={scopeId}>Upgrade and milestone counts follow the map's current spoiler setting.</p>
    {preview.warnings.length > 0 && <section className="game-save-import-notes" aria-labelledby={notesId}>
      <h3 id={notesId}>Import notes</h3>
      <ul>{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
    </section>}

    <details className="game-save-import-method">
      <summary>File location and privacy</summary>
      <p>Choose <code>savedata.sav</code> from the Steam game's Windows save folder:</p>
      <code className="game-save-import-path">{'%USERPROFILE%\\AppData\\LocalLow\\Pablo Leban\\Idle Slayer\\savedata.sav'}</code>
      <p>This importer was reviewed against Idle Slayer 7.2.0, Steam build 25551532.</p>
      <p>Exact per-upgrade purchase epochs cannot be reconstructed by this import. Current ownership and activation use a conservative mapping.</p>
      <p>Save contents are processed locally in this browser and are never uploaded. Applying updates only this map's profile; the game save is unchanged.</p>
      <p>Only reviewed map purchases, activation and required milestones are imported. Other game progress stays outside this map.</p>
    </details>
    <div className="game-save-import-actions">
      <button className="primary" onClick={onApply}>Apply import</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  </div>
}

export default GameSaveImportPanel
