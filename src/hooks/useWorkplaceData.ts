'use client'

import { useState, useEffect, useRef } from 'react'
import type { WorkplaceDashboard } from '@/types/workplace'

interface UseWorkplaceDataReturn extends WorkplaceDashboard {
  loading: boolean
  refreshing: boolean
  error: string
  lastFetchAt: number | null
  reload: () => void
}

const EMPTY: WorkplaceDashboard = { employees: [], projects: [], allocations: [] }

const AUTO_POLL_MS = 5 * 60 * 1000 // 5 minutes

export function useWorkplaceData(): UseWorkplaceDataReturn {
  const [data, setData] = useState<WorkplaceDashboard>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const isInitialFetch = useRef(true)

  useEffect(() => {
    const ctrl = new AbortController()
    if (isInitialFetch.current) setLoading(true)
    else                        setRefreshing(true)
    setError('')

    fetch('/api/workplace/dashboard', { signal: ctrl.signal, cache: 'no-store' })
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

  // Auto-poll (only when tab visible to avoid wasting Notion API quota)
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        setTick(t => t + 1)
      }
    }, AUTO_POLL_MS)
    return () => clearInterval(interval)
  }, [])

  return {
    ...data,
    loading,
    refreshing,
    error,
    lastFetchAt,
    reload: () => setTick(t => t + 1),
  }
}
