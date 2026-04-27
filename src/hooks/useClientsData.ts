'use client'

import { useState, useEffect } from 'react'
import type { Client } from '@/types/sales'

interface UseClientsDataReturn {
  clients: Client[]
  loading: boolean
  error: string
  reload: () => void
}

export function useClientsData(): UseClientsDataReturn {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setLoading(true)
    fetch('/api/sales')
      .then(r => r.json() as Promise<{ clients: Client[] }>)
      .then(d => setClients(d.clients || []))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [tick])

  return { clients, loading, error, reload: () => setTick(t => t + 1) }
}
