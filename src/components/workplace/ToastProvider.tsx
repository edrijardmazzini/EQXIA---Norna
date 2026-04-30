'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

interface ToastApi {
  show: (message: string, kind?: ToastKind) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const STYLES: Record<ToastKind, { color: string; bg: string; border: string; icon: typeof CheckCircle2 }> = {
  success: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.10)',  border: 'rgba(34, 197, 94, 0.30)',  icon: CheckCircle2 },
  error:   { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.10)',  border: 'rgba(239, 68, 68, 0.30)',  icon: AlertCircle },
  info:    { color: '#A6C9CE', bg: 'rgba(166, 201, 206, 0.10)', border: 'rgba(166, 201, 206, 0.30)', icon: Info },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, message, kind }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }, [])

  const api: ToastApi = {
    show,
    success: (m: string) => show(m, 'success'),
    error:   (m: string) => show(m, 'error'),
    info:    (m: string) => show(m, 'info'),
  }

  function dismiss(id: number) {
    setToasts(t => t.filter(x => x.id !== id))
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 400,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => {
          const s = STYLES[t.kind]
          const Icon = s.icon
          return (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 9,
                padding: '11px 13px',
                background: 'var(--bg-card)',
                border: `1px solid ${s.border}`,
                borderLeft: `3px solid ${s.color}`,
                borderRadius: 'var(--radius-card)',
                boxShadow: 'var(--shadow-modal)',
                pointerEvents: 'auto',
                animation: 'slide-in-right 0.2s ease-out',
                minWidth: 240,
              }}
            >
              <Icon size={16} color={s.color} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, fontSize: 'var(--fs-xs)', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                {t.message}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', flexShrink: 0 }}
                aria-label="Fermer"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fallback no-op when used outside provider — safer than crashing
    return {
      show: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    }
  }
  return ctx
}
