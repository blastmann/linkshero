import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from './i18n-provider'

export type ToastKind = 'success' | 'error' | 'info'

export type Toast = {
  id: string
  kind: ToastKind
  text: string
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, number>>(new Map())

  const dismiss = useCallback((id: string) => {
    const handle = timersRef.current.get(id)
    if (handle) {
      window.clearTimeout(handle)
      timersRef.current.delete(id)
    }
    setToasts(prev => prev.filter(item => item.id !== id))
  }, [])

  const push = useCallback(
    (kind: ToastKind, text: string, durationMs?: number) => {
      const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
      const toast: Toast = { id, kind, text }
      setToasts(prev => [toast, ...prev].slice(0, 3))
      const duration =
        durationMs ?? (kind === 'error' ? 5200 : kind === 'info' ? 2600 : 2200)
      const handle = window.setTimeout(() => dismiss(id), duration)
      timersRef.current.set(id, handle)
      return id
    },
    [dismiss]
  )

  const api = useMemo(
    () => ({
      toasts,
      dismiss,
      success: (text: string) => push('success', text),
      error: (text: string) => push('error', text),
      info: (text: string) => push('info', text)
    }),
    [dismiss, push, toasts]
  )

  useEffect(() => {
    return () => {
      timersRef.current.forEach(handle => window.clearTimeout(handle))
      timersRef.current.clear()
    }
  }, [])

  return api
}

export function ToastViewport({
  toasts,
  onDismiss
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
}) {
  const { t } = useTranslation()

  if (!toasts.length) {
    return null
  }

  return (
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions removals">
      {toasts.map(item => (
        <div key={item.id} className={`toast ${item.kind}`} role="status">
          <div className="toast-dot" aria-hidden="true" />
          <div className="toast-text">{item.text}</div>
          <button className="toast-close" onClick={() => onDismiss(item.id)} aria-label={t('toastClose')}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

