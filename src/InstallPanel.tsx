import { checkForUpdate, promptInstall, usePwaStatus } from './pwa'

export function InstallPanel({ onReload, onRepair, progressStatus }: { onReload?: () => void; onRepair: () => void; progressStatus?: string }) {
  const status = usePwaStatus()
  return <div className="install-panel">
    <p>{status.installed ? 'Running as an installed app.' : 'Add the map to your home screen or desktop, then open it in its own window.'}</p>
    {!status.installed && status.canInstall && <button className="primary" onClick={() => { void promptInstall() }}>Install Ascension Map</button>}
    {!status.installed && !status.canInstall && <p>This browser has not offered an install prompt. Its menu may still support installation:</p>}
    {!status.installed && <ul className="install-guidance">
      <li><b>Android:</b> In Chrome or another supporting browser, open its menu and choose Install app or Add to Home screen. Menu wording varies.</li>
      <li><b>iPhone / iPad:</b> Open in Safari, tap Share (on iPad this may be in the toolbar), then Add to Home Screen. Enable Open as Web App if offered.</li>
      <li><b>Desktop:</b> Supporting Chrome/Edge browsers offer an install icon in the address bar or an Install app menu action. On supported macOS Safari versions, use File → Add to Dock. Other browsers may offer only a bookmark.</li>
    </ul>}
    <p className="offline-status" role="status">{status.offline === 'ready' ? 'Public app files are saved for offline reopening.' : status.offline === 'loading' ? 'Downloading and verifying offline app files… Keep this window online until ready.' : status.offline === 'unsupported' ? 'Offline installation is unavailable in this browser or development preview. Use a supported browser over HTTPS.' : 'Offline app files are not ready. Reconnect and retry; browser storage may be blocked or full.'} {status.online ? '' : 'You are offline.'}</p>
    <p>Once ready, reopen offline with the map and local progress actions. A first visit and external sources need internet.</p>
    {progressStatus && <p className="progress-save-status">{progressStatus}</p>}
    <p>Updates wait until you choose to reload. Finish previews and close other map windows first, exporting their unsaved progress if needed. Reload ends session-only Undo.</p>
    {status.message && <p role="status">{status.message}</p>}
    <div className="dialog-actions">
      <button onClick={() => { void checkForUpdate() }}>Check update / retry download</button>
      {status.update && onReload && <button className="primary" onClick={onReload}>Update app and reload…</button>}
      <button onClick={onRepair}>Repair offline files and reload…</button>
    </div>
    <details><summary>Storage, privacy and recovery</summary>
      <p>Progress is stored by this browser on this device. Installed apps may use separate storage, especially on Apple devices; check your progress after installing and use a JSON backup to move it if needed. Export regular backups. Browser cleanup, storage eviction or uninstalling may remove app files or progress.</p>
      <p>Offline app files include the catalog, icons, fonts and bundled software licenses. The browser may show its own offline error before the first download completes. Repair downloads the app again after reconnecting and keeps profile storage; it does not clear browser data.</p>
      <p>Updates keep saved purchases, Astrals, milestones, unknown entries, layout and tracking preferences. Only public app files are cached; saves, backups, transfers and analytics are excluded. Offline usage is never queued for later tracking.</p>
    </details>
  </div>
}
