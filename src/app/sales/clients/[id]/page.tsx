'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppHeader } from '@/components/layout/AppHeader'
import { Spinner } from '@/components/ui/Spinner'
import { ClientDetail } from '@/components/sales/ClientDetail'
import { useProjectsData } from '@/hooks/useProjectsData'
import type { Client } from '@/types/sales'

export default function ClientPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { projects, clients, loading, error } = useProjectsData()

  const client = useMemo(() => clients.find(c => c.id === id) ?? null, [clients, id])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-secondary)' }}>
        <Spinner />
        Chargement du client…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-error)' }}>
        Erreur : {error}
      </div>
    )
  }

  if (!client) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: 'var(--text-muted)' }}>Client introuvable</div>
        <button onClick={() => router.push('/sales')} style={{ padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-btn)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          ← Retour
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <AppHeader
        appName="Sales — Client"
        right={
          <button onClick={() => router.push('/sales?tab=clients')} style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: 'var(--radius-btn)', border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', cursor: 'pointer' }}>
            ← Clients
          </button>
        }
      />
      <div style={{ padding: 24 }}>
        <ClientDetail
          client={client}
          projects={projects}
          onClose={() => router.push('/sales?tab=clients')}
          inline
        />
      </div>
    </div>
  )
}
