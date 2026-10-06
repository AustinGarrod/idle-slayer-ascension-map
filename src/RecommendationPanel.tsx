import { useId } from 'react'
import type { UpgradeRecommendation, UpgradeRecommendations } from './domain/recommendations'
import type { Catalog } from './domain/types'
import { source as wikiSource } from './data/wiki-priorities.json'
import { trackEvent } from './analytics'

interface RecommendationPanelProps {
  catalog: Catalog
  recommendations: UpgradeRecommendations
  onSelect: (id: string) => void
  onPurchase: (id: string) => void
}

function RecommendationCard({ suggestion, primary, onSelect, onPurchase }: {
  suggestion: UpgradeRecommendation
  primary: boolean
  onSelect: (id: string) => void
  onPurchase: (id: string) => void
}) {
  const { upgrade } = suggestion
  const title = primary ? <h3>{upgrade.title}</h3> : <h4>{upgrade.title}</h4>
  return <article className={`recommendation-card${primary ? ' recommendation-main' : ''}`} data-upgrade-id={upgrade.id}>
    <div className="recommendation-heading">
      <img className="upgrade-icon" src={`${import.meta.env.BASE_URL}${upgrade.icon}`} alt="" />
      <div>{title}<small className="recommendation-cost">{BigInt(upgrade.cost).toLocaleString('en')} SP</small></div>
    </div>
    <p className="recommendation-status">Prerequisites recorded</p>
    <small className="recommendation-basis">{suggestion.basis === 'wiki' ? `Wiki priority · ${suggestion.tier}` : 'Catalog fallback'}</small>
    {primary && <p className="recommendation-effect"><strong>Benefit:</strong> {upgrade.description}</p>}
    {suggestion.activationNote && <p className="recommendation-activation">{suggestion.activationNote}</p>}
    <div className="recommendation-actions">
      <button aria-label={primary ? 'Show on map' : `Show ${upgrade.title} on map`} onClick={() => onSelect(upgrade.id)}>Show on map</button>
      {primary && <button className="primary" onClick={() => onPurchase(upgrade.id)}>Record purchase…</button>}
    </div>
    <p className="recommendation-reason">{suggestion.reason}</p>
    {suggestion.source && <a className="recommendation-source" onClick={() => trackEvent('source_link_opened', { source: 'recommendation', action: 'wiki', upgrade_id: upgrade.id })} href={suggestion.source.url} target="_blank" rel="noreferrer">{suggestion.source.label}</a>}
  </article>
}

export function RecommendationPanel({ catalog, recommendations, onSelect, onPurchase }: RecommendationPanelProps) {
  const alternativesId = useId()
  const [primary, ...remaining] = recommendations.suggestions
  const alternatives = remaining.slice(0, 2)
  return <div className="recommendation-panel">
    <p className="recommendation-context">{recommendations.status === 'wiki' ? `Wiki guide ${wikiSource.gameVersion} priorities · ` : ''}Native costs and requirements: game {catalog.gameVersion}.</p>
    {primary ? <>
      <RecommendationCard suggestion={primary} primary onSelect={onSelect} onPurchase={onPurchase} />
      {alternatives.length > 0 && <section className="recommendation-alternatives" aria-labelledby={alternativesId}>
        <h3 id={alternativesId}>Other suggestions</h3>
        {alternatives.map((suggestion) => <RecommendationCard key={suggestion.upgrade.id} suggestion={suggestion} primary={false} onSelect={onSelect} onPurchase={onPurchase} />)}
      </section>}
    </> : <p className="recommendation-empty">{recommendations.status === 'all-owned' ? 'Every visible upgrade is already recorded as owned. There are no visible purchase suggestions.' : 'No visible upgrade meets its native reveal and purchase requirements in your recorded progress. Review your visible upgrade details and explicit milestones.'}</p>}
    <details className="recommendation-method">
      <summary>How suggestions work</summary>
      <p>Suggestions follow the reviewed wiki order among upgrades whose native reveal and purchase requirements are met in your recorded progress. If none of those upgrades appears in the guide, the fallback orders them by exact native cost. Showing a suggestion on the map does not change progress.</p>
      <p>{recommendations.caveat}</p>
      <p>Ordering adapted from Idle Slayer Wiki contributors ({wikiSource.license}); native effects, costs and requirements come from the game.</p>
      <dl>
        <dt>Wiki snapshot</dt><dd>Game {wikiSource.gameVersion} · revision {wikiSource.revision} · {wikiSource.revisionTimestamp.slice(0, 10)}</dd>
        <dt>Native catalog</dt><dd>Game {catalog.gameVersion} · {catalog.revision}</dd>
        <dt>Guide and attribution</dt><dd><a onClick={() => trackEvent('source_link_opened', { source: 'recommendation', action: 'wiki' })} href={wikiSource.revisionUrl} target="_blank" rel="noreferrer">Wiki strategy guide snapshot</a> · <a onClick={() => trackEvent('source_link_opened', { source: 'recommendation', action: 'license' })} href={wikiSource.licenseUrl} target="_blank" rel="noreferrer">{wikiSource.license}</a></dd>
      </dl>
    </details>
  </div>
}

export default RecommendationPanel
