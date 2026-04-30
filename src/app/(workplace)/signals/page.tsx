'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { AlertOctagon, AlertTriangle, TrendingDown, Umbrella, Briefcase, Calendar, Check, X, Lock, CheckCircle2, ZapOff } from 'lucide-react'
import { useWorkplaceData } from '@/hooks/useWorkplaceData'
import { useToast } from '@/components/workplace/ToastProvider'
import { RefreshButton } from '@/components/workplace/RefreshButton'
import {
  buildLoadMatrix,
  detectCapacitySignals,
  detectUnstaffedProjects,
  detectConfirmedConflicts,
  detectUpcomingStarts,
  type SignalLevel,
} from '@/lib/workplace/load'
import { leaveDurationDays } from '@/lib/workplace/grid'
import type { Allocation, WorkplaceEmployee } from '@/types/workplace'

const HORIZON_WEEKS = 4
const DAYS_AHEAD_HEADS_UP = 7

const LEAVE_TYPE_LABELS: Record<string, string> = {
  Annual: 'Annuel', Sick: 'Médical', Special: 'Spécial', Unpaid: 'Sans solde',
}

function fmtDate(s: string): string {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--card-bg)',
  backdropFilter: 'var(--card-blur)',
  WebkitBackdropFilter: 'var(--card-blur)',
  border: 'var(--card-border)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
}

function SignalSection({
  icon: Icon,
  iconColor,
  title,
  count,
  description,
  children,
  empty,
}: {
  icon: typeof AlertOctagon
  iconColor: string
  title: string
  count: number
  description?: string
  children: React.ReactNode
  empty: string
}) {
  return (
    <div style={CARD_STYLE}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <Icon size={15} color={iconColor} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{title}</div>
            {description && (
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                {description}
              </div>
            )}
          </div>
        </div>
        <div style={{
          padding: '2px 9px',
          borderRadius: 'var(--radius-pill)',
          background: count > 0 ? `${iconColor}22` : 'var(--bg-input)',
          color: count > 0 ? iconColor : 'var(--text-muted)',
          fontSize: 'var(--fs-2xs)',
          fontWeight: 700,
          fontFamily: 'monospace',
          flexShrink: 0,
        }}>
          {count}
        </div>
      </div>
      {count === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', fontStyle: 'italic' }}>
          {empty}
        </div>
      ) : children}
    </div>
  )
}

const LEVEL_ICON: Record<SignalLevel, typeof AlertOctagon> = {
  critical: AlertOctagon,
  warning:  AlertTriangle,
  info:     TrendingDown,
}

const LEVEL_COLOR: Record<SignalLevel, string> = {
  critical: '#ef4444',
  warning:  '#facc15',
  info:     '#60a5fa',
}

export default function SignalsPage() {
  const { data: session } = useSession()
  const toast = useToast()
  const { employees, projects, allocations, loading, refreshing, error, reload, lastFetchAt } = useWorkplaceData()
  const [actioning, setActioning] = useState<string>('')

  const currentEmployee = useMemo(
    () => employees.find(e => e.email && session?.user?.email && e.email.toLowerCase() === session.user.email.toLowerCase()),
    [employees, session],
  )
  const isCofounder = currentEmployee?.role === 'Co-founder'

  // Signals computation
  const { weekStarts: _weekStarts, loadsByPerson } = useMemo(
    () => buildLoadMatrix(employees, allocations, HORIZON_WEEKS),
    [employees, allocations],
  )

  const capacitySignals = useMemo(
    () => detectCapacitySignals(employees, loadsByPerson, HORIZON_WEEKS),
    [employees, loadsByPerson],
  )

  const unstaffedProjects = useMemo(
    () => detectUnstaffedProjects(projects, allocations),
    [projects, allocations],
  )

  const conflicts = useMemo(
    () => detectConfirmedConflicts(employees, allocations),
    [employees, allocations],
  )

  const upcomingStarts = useMemo(
    () => detectUpcomingStarts(allocations, DAYS_AHEAD_HEADS_UP),
    [allocations],
  )

  const employeesById = useMemo(() => {
    const m = new Map<string, WorkplaceEmployee>()
    for (const e of employees) m.set(e.id, e)
    return m
  }, [employees])

  const pendingLeaves = useMemo(() =>
    allocations
      .filter(a => a.type === 'Leave' && a.approvalStatus === 'Pending')
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [allocations],
  )

  async function handleApproval(allocId: string, decision: 'Approved' | 'Rejected') {
    if (!isCofounder) return
    setActioning(allocId)
    try {
      const res = await fetch(`/api/allocations/${allocId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvalStatus: decision,
          approverIds: currentEmployee ? [currentEmployee.id] : [],
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(`Erreur : ${data.error || res.status}`)
      } else {
        toast.success(decision === 'Approved' ? 'Demande approuvée' : 'Demande rejetée')
        reload()
      }
    } finally {
      setActioning('')
    }
  }

  if (error)   return <div style={{ padding: 40, color: 'var(--color-error)' }}>Erreur : {error}</div>

  const totalActionable =
    pendingLeaves.length +
    capacitySignals.filter(s => s.level === 'critical').length +
    conflicts.length +
    unstaffedProjects.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700 }}>Signaux</div>
          <RefreshButton onRefresh={reload} refreshing={refreshing} lastFetchAt={lastFetchAt} />
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
          Tableau de bord matinal — tout ce qui demande votre attention sur les {HORIZON_WEEKS} prochaines semaines
        </div>
      </div>

      {/* Summary banner */}
      <div style={{
        ...CARD_STYLE,
        padding: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {totalActionable === 0 ? (
            <CheckCircle2 size={24} color="var(--color-success)" />
          ) : (
            <AlertOctagon size={24} color={totalActionable > 5 ? '#ef4444' : '#facc15'} />
          )}
          <div>
            <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700 }}>
              {totalActionable === 0
                ? 'Tout est sous contrôle'
                : `${totalActionable} action${totalActionable > 1 ? 's' : ''} demandée${totalActionable > 1 ? 's' : ''}`}
            </div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
              {totalActionable === 0
                ? 'Aucun signal critique. Profitez-en pour avancer la roadmap.'
                : 'Parcourez les sections ci-dessous pour traiter chaque alerte.'}
            </div>
          </div>
        </div>
        {!isCofounder && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
            <Lock size={11} /> Approbation congés réservée aux Co-founders
          </span>
        )}
      </div>

      {/* Pending leaves */}
      <SignalSection
        icon={Umbrella}
        iconColor="#fb923c"
        title="Demandes de congé en attente"
        count={pendingLeaves.length}
        description="Doivent être approuvées par un Co-founder"
        empty="Aucune demande en attente."
      >
        {pendingLeaves.map(req => {
          const emp = employeesById.get(req.personIds[0])
          const days = leaveDurationDays(req)
          return (
            <div key={req.id} style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600 }}>
                  {emp ? <Link href={`/people/${emp.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{emp.name}</Link> : '?'}
                  <span style={{ marginLeft: 8, padding: '2px 7px', borderRadius: 'var(--radius-badge)', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 10, fontWeight: 600 }}>
                    {LEAVE_TYPE_LABELS[req.leaveType] || req.leaveType}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                  {fmtDate(req.startDate)} → {fmtDate(req.endDate)} · {days}j
                </div>
              </div>
              {isCofounder && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleApproval(req.id, 'Approved')}
                    disabled={actioning === req.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px',
                      borderRadius: 'var(--radius-btn)',
                      border: '1px solid #22c55e',
                      background: 'rgba(34, 197, 94, 0.15)',
                      color: '#22c55e',
                      fontSize: 'var(--fs-2xs)',
                      fontWeight: 600,
                      cursor: actioning === req.id ? 'wait' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <Check size={11} /> Approuver
                  </button>
                  <button
                    onClick={() => handleApproval(req.id, 'Rejected')}
                    disabled={actioning === req.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px',
                      borderRadius: 'var(--radius-btn)',
                      border: '1px solid var(--btn-danger-bg)',
                      background: 'var(--btn-danger-bg)',
                      color: 'var(--btn-danger-text)',
                      fontSize: 'var(--fs-2xs)',
                      fontWeight: 600,
                      cursor: actioning === req.id ? 'wait' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <X size={11} /> Rejeter
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </SignalSection>

      {/* Capacity signals */}
      <SignalSection
        icon={AlertTriangle}
        iconColor="#facc15"
        title="Charge équipe"
        count={capacitySignals.length}
        description={`Sur/sous-utilisation détectée sur les ${HORIZON_WEEKS} prochaines semaines`}
        empty="Charge équilibrée pour toute l'équipe."
      >
        {capacitySignals.map(sig => {
          const Icon = LEVEL_ICON[sig.level]
          const color = LEVEL_COLOR[sig.level]
          return (
            <div key={sig.personId} style={{ padding: '11px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon size={13} color={color} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600 }}>
                  <Link href={`/people/${sig.personId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {sig.personName}
                  </Link>
                </div>
                <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                  {sig.message}
                </div>
              </div>
            </div>
          )
        })}
      </SignalSection>

      {/* Confirmed conflicts */}
      <SignalSection
        icon={AlertOctagon}
        iconColor="#ef4444"
        title="Conflits Confirmed à 100%"
        count={conflicts.length}
        description="Deux allocations Confirmed à 100% qui se chevauchent — au moins une est mal renseignée"
        empty="Aucun conflit Confirmed sur l'équipe."
      >
        {conflicts.map((c, idx) => {
          const labelA = c.a.type === 'Leave' ? `Congé ${c.a.leaveType}` : c.a.projectName
          const labelB = c.b.type === 'Leave' ? `Congé ${c.b.leaveType}` : c.b.projectName
          return (
            <div key={idx} style={{ padding: '11px 18px', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, marginBottom: 4 }}>
                <Link href={`/people/${c.personId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {c.personName}
                </Link>
              </div>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-secondary)' }}>{labelA}</strong> ({fmtDate(c.a.startDate)} → {fmtDate(c.a.endDate)})
                {' ⇄ '}
                <strong style={{ color: 'var(--text-secondary)' }}>{labelB}</strong> ({fmtDate(c.b.startDate)} → {fmtDate(c.b.endDate)})
              </div>
            </div>
          )
        })}
      </SignalSection>

      {/* Unstaffed projects */}
      <SignalSection
        icon={ZapOff}
        iconColor="#a78bfa"
        title="Projets actifs sans staffing"
        count={unstaffedProjects.length}
        description="Projets en Active/Won mais sans aucune allocation Confirmed"
        empty="Tous les projets actifs ont au moins une personne staffée."
      >
        {unstaffedProjects.map(p => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            style={{
              padding: '11px 18px', borderTop: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              textDecoration: 'none', color: 'var(--text-primary)',
            }}
          >
            <div>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                {p.clientName || '—'} · {p.type} · {p.status}
              </div>
            </div>
            <span style={{
              padding: '3px 9px', borderRadius: 'var(--radius-badge)',
              background: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa',
              fontSize: 'var(--fs-2xs)', fontWeight: 600,
            }}>
              Staffer →
            </span>
          </Link>
        ))}
      </SignalSection>

      {/* Upcoming starts (heads-up info) */}
      <SignalSection
        icon={Calendar}
        iconColor="#60a5fa"
        title={`Démarrages dans les ${DAYS_AHEAD_HEADS_UP} prochains jours`}
        count={upcomingStarts.length}
        description="Heads-up : briefer ces missions avant qu'elles démarrent"
        empty="Aucune mission ne démarre cette semaine."
      >
        {upcomingStarts.slice(0, 12).map(alloc => {
          const emp = employeesById.get(alloc.personIds[0])
          return (
            <div key={alloc.id} style={{ padding: '11px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600 }}>
                  {alloc.projectName}
                  <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontWeight: 400 }}>
                    avec {emp ? (
                      <Link href={`/people/${emp.id}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{emp.name}</Link>
                    ) : '?'}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                  {fmtDate(alloc.startDate)} → {fmtDate(alloc.endDate)} · {alloc.effortPct}%
                </div>
              </div>
              {alloc.projectIds[0] && (
                <Link
                  href={`/projects/${alloc.projectIds[0]}`}
                  style={{ fontSize: 'var(--fs-2xs)', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}
                >
                  <Briefcase size={11} /> Projet
                </Link>
              )}
            </div>
          )
        })}
      </SignalSection>
    </div>
  )
}
