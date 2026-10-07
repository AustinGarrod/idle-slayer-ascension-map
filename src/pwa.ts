import { useSyncExternalStore } from 'react'

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
export interface PwaStatus {
  offline: 'loading' | 'ready' | 'unavailable' | 'unsupported'
  online: boolean
  installed: boolean
  canInstall: boolean
  update: boolean
  message: string
}
const listeners = new Set<() => void>()
let status: PwaStatus = { offline: 'loading', online: navigator.onLine, installed: false, canInstall: false, update: false, message: '' }
let registration: ServiceWorkerRegistration | undefined
let installPrompt: InstallPrompt | undefined
let started = false
let reloading = false
function publish(next: Partial<PwaStatus>) { status = { ...status, ...next }; listeners.forEach((listener) => listener()) }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const usePwaStatus = () => useSyncExternalStore(subscribe, () => status)
function installed() { return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true }
function request(worker: ServiceWorker, type: string): Promise<{ ready?: boolean; accepted?: boolean }> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const timer = window.setTimeout(() => { channel.port1.close(); reject(new Error('Worker unavailable')) }, 8000)
    channel.port1.onmessage = (event) => { window.clearTimeout(timer); channel.port1.close(); resolve(event.data) }
    worker.postMessage({ type }, [channel.port2])
  })
}
async function refresh() {
  if (!registration) return
  publish({ update: Boolean(registration.waiting) })
  if (!registration.active) return
  try { publish({ offline: (await request(registration.active, 'CHECK_READY')).ready ? 'ready' : 'unavailable' }) }
  catch { publish({ offline: 'unavailable' }) }
}
export function initializePwa() {
  if (started) return
  started = true
  publish({ installed: installed() })
  const display = matchMedia('(display-mode: standalone)')
  display.addEventListener('change', () => publish({ installed: installed() }))
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); installPrompt = event as InstallPrompt
    publish({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => { installPrompt = undefined; publish({ installed: true, canInstall: false, message: 'Installation completed in this browser.' }) })
  window.addEventListener('offline', () => publish({ online: false }))
  window.addEventListener('online', () => { publish({ online: true }); void checkForUpdate() })
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) { publish({ offline: 'unsupported' }); return }
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) window.location.reload(); else void refresh() })
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' }).then((result) => {
    registration = result
    const watch = () => {
      const worker = result.installing
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed' || worker.state === 'activated') void refresh(); if (worker.state === 'redundant') publish({ offline: result.active ? status.offline : 'unavailable', message: 'Offline download failed. Reconnect and check again; the current map remains usable.' }) })
    }
    result.addEventListener('updatefound', watch); watch(); void refresh()
  }).catch(() => publish({ offline: 'unavailable', message: 'Offline storage is unavailable. Keep using the online map and export progress backups.' }))
}
export async function promptInstall() {
  const prompt = installPrompt
  if (!prompt || status.installed) return
  installPrompt = undefined; publish({ canInstall: false, message: '' })
  try { await prompt.prompt(); const choice = await prompt.userChoice; publish({ message: choice.outcome === 'accepted' ? 'The browser accepted installation. Launch from its app icon when installation finishes.' : 'Installation dismissed. You can use the browser menu later.' }) }
  catch { publish({ message: 'The browser could not open installation. Use its menu or the instructions below.' }) }
}
export async function checkForUpdate() {
  if (!registration || !navigator.onLine) { publish({ message: 'Connect to the internet to check for an update or retry the offline download.' }); return }
  try { await registration.update(); await refresh(); publish({ message: registration.waiting ? 'An update is ready. Review your progress before reloading.' : registration.installing ? 'Downloading and verifying a complete offline release…' : 'Update check completed. No update is waiting.' }) }
  catch { publish({ message: 'Update check failed. The current cached map remains available if its files are saved.' }) }
}
export async function reloadForUpdate(): Promise<boolean> {
  if (!registration?.waiting) { publish({ message: 'The update is no longer waiting. Check again.' }); return false }
  reloading = true
  try {
    const response = await request(registration.waiting, 'ACTIVATE_UPDATE')
    if (!response.accepted) { reloading = false; publish({ message: 'Close other Ascension Map tabs and app windows, then try again. This keeps every window on one complete release.' }); return false }
    // controllerchange reloads only this deliberately consenting window.
    return true
  } catch { reloading = false; publish({ message: 'The update could not start. Your current session is still available; check again.' }); return false }
}
export async function repairOffline(): Promise<boolean> {
  if (!navigator.onLine) { publish({ message: 'Reconnect before repairing the offline download.' }); return false }
  if (registration?.active) {
    try {
      if (!(await request(registration.active, 'CHECK_WINDOWS')).accepted) { publish({ message: 'Close other Ascension Map tabs and app windows before repairing.' }); return false }
      if (!await registration.unregister()) throw new Error('Unavailable')
    } catch { publish({ message: 'Offline repair could not start. Close other map windows and try again.' }); return false }
  }
  window.location.reload()
  return true
}
