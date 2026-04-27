'use client'

import { useState, useEffect } from 'react'
import type { Project, Client, Employee } from '@/types/sales'

interface UseProjectsDataReturn {
  projects: Project[]
  clients: Client[]
  employees: Employee[]
  loading: boolean
  error: string
  reload: () => void
}

export function useProjectsData(): UseProjectsDataReturn {
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch('/api/sales')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ projects: Project[]; clients: Client[]; employees: Employee[] }>
      })
      .then(d => {
        setProjects(d.projects || [])
        setClients(d.clients || [])
        setEmployees(d.employees || [])
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [tick])

  return { projects, clients, employees, loading, error, reload: () => setTick(t => t + 1) }
}
