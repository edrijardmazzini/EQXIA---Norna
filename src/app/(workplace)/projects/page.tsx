'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Search } from 'lucide-react'
import { useWorkplaceData } from '@/hooks/useWorkplaceData'
import { RefreshButton } from '@/components/workplace/RefreshButton'
import type { WorkplaceProject } from '@/types/workplace'

const STATUS_BADGE: Record<string, { color: string; bg: string }> = {
  Lead:                { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' },
  Qualified:           { color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.12)' },
  Scoping:             { color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.18)' },
  'Proposal Sent':     { color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.15)' },
  Negotiation:         { color: '#facc15', bg: 'rgba(250, 204, 21, 0.15)' },
  'Verbal Commitment': { color: '#fb923c', bg: 'rgba(251, 146, 60, 0.18)' },
  Won:                 { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
  Active:              { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.20)' },
  'On Hold':           { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' },
  Identified:          { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.10)' },
}

const PIPELINE_STATUSES = new Set(['Lead', 'Qualified', 'Scoping', 'Proposal Sent', 'Negotiation', 'Verbal Commitment', 'Identified'])
const DELIVERY_STATUSES = new Set(['Won', 'Active'])

function fmtDate(s: string): string {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })
}

function ProjectRow({ project, allocCount, peopleCount }: { project: WorkplaceProject; allocCount: number; peopleCount: number }) {
  const badge = STATUS_BADGE[project.status] || { color: 'var(--text-muted)', bg: 'var(--bg-input)' }
  return (
    <Link
      href={`/projects/${project.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 18px',
        borderTop: '1px solid var(--border-subtle)',
        textDecoration: 'none',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {/* Health indicator */}
      <div style={{
        width: 6, height: 6, borderRadius: 3,
        background: project.health.includes('Critical') ? '#ef4444'
                  : project.health.includes('Warning')  ? '#facc15'
                  : project.health.includes('OK')       ? '#22c55e'
                  : 'var(--text-muted)',
        flexShrink: 0,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {project.name}
        </div>
        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
          {project.clientName || '—'} · {project.type || '—'} {project.phase && `· ${project.phase}`}
        </div>
      </div>

      <span style={{
        padding: '3px 9px',
        borderRadius: 'var(--radius-badge)',
        background: badge.bg,
        color: badge.color,
        fontSize: 'var(--fs-2xs)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}>
        {project.status}
      </span>

      <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0, minWidth: 110 }}>
        <div style={{ fontFamily: 'monospace' }}>{fmtDate(project.startDate)} → {fmtDate(project.endDate)}</div>
        <div style={{ marginTop: 2 }}>
          {peopleCount} {peopleCount > 1 ? 'personnes' : 'personne'} · {allocCount} alloc.
        </div>
      </div>

      <ChevronRight size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
    </Link>
  )
}

export default function ProjectsListPage() {
  const { projects, allocations, loading, refreshing, error, reload, lastFetchAt } = useWorkplaceData()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'pipeline' | 'delivery' | 'all'>('delivery')

  const projectStats = useMemo(() => {
    const map = new Map<string, { allocCount: number; peopleSet: Set<string> }>()
    for (const a of allocations) {
      if (a.type !== 'Project') continue
      for (const pid of a.projectIds) {
        if (!map.has(pid)) map.set(pid, { allocCount: 0, peopleSet: new Set() })
        const stat = map.get(pid)!
        stat.allocCount++
        for (const personId of a.personIds) stat.peopleSet.add(personId)
      }
    }
    return map
  }, [allocations])

  const filtered = useMemo(() => {
    return projects
      .filter(p => {
        if (tab === 'pipeline' && !PIPELINE_STATUSES.has(p.status)) return false
        if (tab === 'delivery' && !DELIVERY_STATUSES.has(p.status)) return false
        if (search) {
          const q = search.toLowerCase()
          return p.name.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q)
        }
        return true
      })
      .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
  }, [projects, search, tab])

  if (error) return <div style={{ padding: 40, color: 'var(--color-error)' }}>Erreur : {error}</div>

  const counts = {
    pipeline: projects.filter(p => PIPELINE_STATUSES.has(p.status)).length,
    delivery: projects.filter(p => DELIVERY_STATUSES.has(p.status)).length,
    all:      projects.length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700 }}>Projets</div>
          <RefreshButton onRefresh={reload} refreshing={refreshing} lastFetchAt={lastFetchAt} />
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
          Pilotage staffing par projet · cliquez pour ouvrir le forecast
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--bg-input)', borderRadius: 'var(--radius-btn)' }}>
          {([
            { id: 'delivery' as const, label: 'En cours', count: counts.delivery },
            { id: 'pipeline' as const, label: 'Pipeline', count: counts.pipeline },
            { id: 'all'      as const, label: 'Tous',     count: counts.all },
          ]).map(({ id, label, count }) => {
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-btn)',
                  border: 'none',
                  background: active ? 'var(--bg-card)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 'var(--fs-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: active ? 'var(--shadow-card)' : 'none',
                }}
              >
                {label} <span style={{ fontFamily: 'monospace', opacity: 0.7, marginLeft: 3 }}>{count}</span>
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 'var(--radius-input)' }}>
          <Search size={12} color="var(--text-muted)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un projet ou client…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: 'var(--fs-xs)', color: 'var(--text-primary)', fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      <div style={{
        background: 'var(--card-bg)',
        backdropFilter: 'var(--card-blur)',
        WebkitBackdropFilter: 'var(--card-blur)',
        border: 'var(--card-border)',
        borderRadius: 'var(--card-radius)',
        boxShadow: 'var(--card-shadow)',
        overflow: 'hidden',
      }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', fontStyle: 'italic' }}>
            Aucun projet ne correspond.
          </div>
        ) : (
          filtered.map(p => {
            const stat = projectStats.get(p.id)
            return (
              <ProjectRow
                key={p.id}
                project={p}
                allocCount={stat?.allocCount || 0}
                peopleCount={stat?.peopleSet.size || 0}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
