import { createContext, useContext, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export const DialogFeedbackContext = createContext<{ title: string | null; announcement: string; sequence: number; content: ReactNode; clear: () => void }>({ title: null, announcement: '', sequence: 0, content: null, clear: () => {} })

export function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const feedback = useContext(DialogFeedbackContext)
  const activeFeedback = feedback.title === title
  const dismiss = () => { feedback.clear(); close() }
  useEffect(() => {
    const previousFocus = document.activeElement
    const dialog = ref.current
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])
  useEffect(() => {
    if (activeFeedback && feedback.announcement) feedbackRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeFeedback, feedback.announcement, feedback.sequence])
  return <dialog ref={ref} onCancel={(event) => { event.preventDefault(); dismiss() }} aria-labelledby="dialog-title">
    <div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button aria-label="Close dialog" onClick={dismiss}>×</button></div>
    {activeFeedback && <div id="dialog-feedback" ref={feedbackRef} className="dialog-feedback telemetry-private rr-block" role="status" aria-live="polite" aria-atomic="true">{feedback.content}</div>}
    {children}
  </dialog>
}

