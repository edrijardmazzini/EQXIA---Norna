'use client'

import { useState, useEffect } from 'react'
import type { WorkplaceDashboard } from '@/types/workplace'

interface UseWorkplaceDataReturn extends WorkplaceDashboard {
  loading: boolean
  error: string
  reload: () => void
}

const EMPTY: WorkplaceDashboard = { employees: [], projects: [], allocations: [] }

export function useWorkplaceData(): UseWorkplaceDataReturn {
  const [data, setData] = useState<WorkplaceDashboard>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setError('')
    fetch('/api/workplace/dashboard', { signal: ctrl.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<WorkplaceDashboard>
      })
      .then(d => setData(d))
      .catch(e => { if ((e as Error).name !== 'AbortError') setError((e as Error).message) })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [tick])

  return { ...data, loading, error, reload: () => setTick(t => t + 1) }
}
