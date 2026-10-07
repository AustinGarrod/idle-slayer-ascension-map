import { captureProgressTransfer, TRANSFER_FRAGMENT, type TransferCapture } from './domain/progress-transfer'

export interface ProgressTransferInbox {
  readonly trackingSafe: boolean
  take: () => { capture: TransferCapture } | null
  subscribe: (listener: () => void) => () => void
  dispose: () => void
}

/** Start before analytics: the catalog and saved profile may take time to load. */
export function createProgressTransferInbox(win: Window): ProgressTransferInbox {
  const capture = captureProgressTransfer(win)
  let pending: { capture: TransferCapture } | null = capture ? { capture } : null
  const trackingSafe = capture?.cleaned !== false
  const listeners = new Set<() => void>()
  const listenerOptions = { capture: true }
  const discard = () => { if (pending?.capture) delete pending.capture.token; pending = null }
  const notify = () => { for (const listener of listeners) listener() }
  const changed = (event: Event) => {
    if (win.location.hash.startsWith(TRANSFER_FRAGMENT)) {
      discard()
      pending = { capture: captureProgressTransfer(win) }
    } else {
      // Cleanup uses replaceState, so queued hash events may describe an address
      // already captured/removed. Ignore those; an actual later navigation wins.
      if (event.type === 'hashchange' && !win.location.hash && (event as HashChangeEvent).newURL !== win.location.href) return
      discard()
      pending = { capture: null }
    }
    notify()
  }
  win.addEventListener('hashchange', changed, listenerOptions)
  win.addEventListener('popstate', changed, listenerOptions)
  return {
    trackingSafe,
    take: () => { const arrival = pending; pending = null; return arrival },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose: () => {
      win.removeEventListener('hashchange', changed, listenerOptions)
      win.removeEventListener('popstate', changed, listenerOptions)
      discard(); listeners.clear()
    },
  }
}
