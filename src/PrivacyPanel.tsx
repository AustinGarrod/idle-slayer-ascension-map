import type { getTrackingStatus } from './analytics'

export const trackingDisclosure = 'Your progress is saved on this device. This site uses self-hosted Umami for usage analytics and session recordings, which may include visible map progress. Save files and backup contents are never uploaded. You can disable tracking in Privacy & tracking.'

export function PrivacyPanel({ status, onChange }: {
  status: ReturnType<typeof getTrackingStatus>
  onChange: (enabled: boolean) => void
}) {
  const preferenceEnabled = status.preference === 'enabled' && status.reason !== 'opt-out'
  const urlOnlyOptOut = status.reason === 'opt-out' && status.preference !== 'disabled'
  const explanation = ['development', 'unsupported-origin'].includes(status.reason) ? 'Tracking is off in this local preview.'
    : status.reason === 'embedded' ? 'Embedded previews are not tracked.'
      : ['global-privacy-control', 'do-not-track', 'umami-disabled'].includes(status.reason) ? 'Your browser privacy setting prevents tracking.'
        : status.reason === 'storage-unavailable' ? 'Your tracking preference could not be read. Tracking is off for this visit.'
          : urlOnlyOptOut ? 'Tracking is off for this visit. The disabled preference was not saved in this browser; keep this page URL to retain the choice.'
            : status.reason === 'script-unavailable' ? 'Tracking could not load. Your map remains usable.'
            : status.enabled ? 'Usage analytics and recording are enabled for this visit.' : 'Usage analytics and recording are disabled.'
  return <div className="privacy-panel">
    <p>{trackingDisclosure}</p>
    <p className="tracking-status" role="status">{explanation}</p>
    <h3>What is collected</h3>
    <p>Page visits, referral and campaign information, browser/device information, approximate location when available, performance measurements and interactions with map features. Recordings can show clicks, navigation and your visible upgrade and milestone states.</p>
    <h3>What stays private</h3>
    <p>Selected files, backup contents, import comparisons and notes, typed searches and history inputs are excluded from recordings. Unrelated game preferences are discarded locally. Events contain bounded feature information rather than your full profile or file contents.</p>
    <p>Heatmaps record click positions and scrolling, including positions over excluded controls, without their input contents. Recordings are sampled at 100% of eligible sessions and stop after 20 minutes.</p>
    <h3>Your choice</h3>
    <p>Changing tracking reloads the page to stop or start recording. Saved progress is kept; session-only undo is cleared. If progress cannot be saved, you can export a backup before reloading. Browser privacy settings continue to apply.</p>
    <div className="dialog-actions"><button className={preferenceEnabled ? '' : 'primary'} onClick={() => onChange(!preferenceEnabled)}>{preferenceEnabled ? 'Disable tracking and reload' : 'Enable tracking and reload'}</button></div>
  </div>
}
