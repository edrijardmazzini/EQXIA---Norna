'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { WorkplaceDashboard } from '@/types/workplace'
import { NornaLoadingScreen } from './NornaLoadingScreen'

interface WorkplaceDataContext extends WorkplaceDashboard {
  loading: boolean       // toujours false dans le context (le provider intercepte le loading initial)
  refreshing: boolean    // vrai pendant un refresh post-initial (auto-poll ou manuel)
  error: string
  lastFetchAt: number | null
  reload: () => void
}

const EMPTY: WorkplaceDashboard = { employees: [], projects: [], allocations: [], timeEntries: [] }
const AUTO_POLL_MS = 5 * 60 * 1000 // 5 minutes

const Ctx = createContext<WorkplaceDataContext | null>(null)

export function WorkplaceDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WorkplaceDashboard>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const isInitialFetch = useRef(true)

  // Fetch (initial + poll + manual reload)
  useEffect(() => {
    const ctrl = new AbortController()
    if (isInitialFetch.current) setLoading(true)
    else                        setRefreshing(true)
    setError('')

    fetch('/api/dashboard', { signal: ctrl.signal, cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<WorkplaceDashboard>
      })
      .then(d => {
        setData(d)
        setLastFetchAt(Date.now())
      })
      .catch(e => { if ((e as Error).name !== 'AbortError') setError((e as Error).message) })
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
        isInitialFetch.current = false
      })
    return () => ctrl.abort()
  }, [tick])

  // Auto-poll uniquement si l'onglet est visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        setTick(t => t + 1)
      }
    }, AUTO_POLL_MS)
    return () => clearInterval(interval)
  }, [])

  // Tant que le fetch initial n'a pas abouti, on affiche le loading plein écran.
  // Les enfants (et donc les pages) ne sont pas montés à ce moment.
  if (loading) {
    return <NornaLoadingScreen />
  }

  // Erreur initiale (pas de données du tout) → écran d'erreur dédié
  if (error && !lastFetchAt) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-page)', color: 'var(--text-primary)', flexDirection: 'column', gap: 12, padding: 32 }}>
        <div style={{ fontSize: 'var(--fs-md)', color: 'var(--color-error)', fontWeight: 600 }}>
          Impossible de charger les données
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {error}
        </div>
        <button
          onClick={() => setTick(t => t + 1)}
          style={{
            padding: '8px 16px',
            borderRadius: 'var(--radius-btn)',
            border: '1px solid var(--accent)',
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            fontSize: 'var(--fs-xs)',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Réessayer
        </button>
      </div>
    )
  }

  const value: WorkplaceDataContext = {
    ...data,
    loading: false,
    refreshing,
    error,
    lastFetchAt,
    reload: () => setTick(t => t + 1),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWorkplaceData(): WorkplaceDataContext {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error('useWorkplaceData must be used within a WorkplaceDataProvider')
  }
  return ctx
}
