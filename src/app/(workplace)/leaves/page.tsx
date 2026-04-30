'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Plus, Check, X, Lock } from 'lucide-react'
import { useWorkplaceData } from '@/hooks/useWorkplaceData'
import { leaveDurationDays } from '@/lib/workplace/grid'
import { AllocationModal } from '@/components/workplace/AllocationModal'
import { useToast } from '@/components/workplace/ToastProvider'
import { RefreshButton } from '@/components/workplace/RefreshButton'
import type { Allocation, WorkplaceEmployee } from '@/types/workplace'

const LEAVE_TYPE_LABELS: Record<string, string> = {
  Annual:  'Annuel',
  Sick:    'Médical',
  Special: 'Spécial',
  Unpaid:  'Sans solde',
}

const APPROVAL_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  Pending:   { label: 'En attente', color: '#facc15', bg: 'rgba(250, 204, 21, 0.15)' },
  Approved:  { label: 'Approuvé',   color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
  Rejected:  { label: 'Rejeté',     color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  Cancelled: { label: 'Annulé',     color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' },
}

function fmtDate(s: string): string {
  if (!s) return ''
  return new Date(s + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

interface SoldeRow {
  emp: WorkplaceEmployee
  quotaAnnual: number
  takenAnnual: number
  pendingAnnual: number
  remainingAnnual: number
  quotaMed: number
  takenMed: number
}

function computeSoldes(employees: WorkplaceEmployee[], allocations: Allocation[]): SoldeRow[] {
  const currentYear = new Date().getFullYear()
  return employees.map(emp => {
    const personLeaves = allocations.filter(a =>
      a.type === 'Leave' &&
      a.personIds.includes(emp.id) &&
      a.startDate.startsWith(String(currentYear))
    )
    const annual  = personLeaves.filter(a => a.leaveType === 'Annual')
    const med     = personLeaves.filter(a => a.leaveType === 'Sick')
    const taken   = (filter: (a: Allocation) => boolean) =>
      annual.filter(filter).reduce((sum, a) => sum + leaveDurationDays(a), 0)
    const takenMed = med.filter(a => a.approvalStatus === 'Approved').reduce((sum, a) => sum + leaveDurationDays(a), 0)

    const takenAnnual   = taken(a => a.approvalStatus === 'Approved')
    const pendingAnnual = taken(a => a.approvalStatus === 'Pending')

    return {
      emp,
      quotaAnnual: emp.leaveQuotaAnnual || 0,
      takenAnnual,
      pendingAnnual,
      remainingAnnual: (emp.leaveQuotaAnnual || 0) - takenAnnual - pendingAnnual,
      quotaMed: emp.leaveMedQuota || 0,
      takenMed,
    }
  })
}

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--card-bg)',
  backdropFilter: 'var(--card-blur)',
  WebkitBackdropFilter: 'var(--card-blur)',
  border: 'var(--card-border)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
}

export default function LeavesPage() {
  const { data: session } = useSession()
  const toast = useToast()
  const { employees, projects, allocations, loading, refreshing, error, reload, lastFetchAt } = useWorkplaceData()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingAlloc, setEditingAlloc] = useState<Allocation | undefined>(undefined)
  const [actioning, setActioning] = useState<string>('')

  const employeesById = useMemo(() => {
    const m = new Map<string, WorkplaceEmployee>()
    for (const e of employees) m.set(e.id, e)
    return m
  }, [employees])

  const currentEmployee = useMemo(
    () => employees.find(e => e.email && session?.user?.email && e.email.toLowerCase() === session.user.email.toLowerCase()),
    [employees, session],
  )
  const isCofounder = currentEmployee?.role === 'Co-founder'

  const leaveAllocations = useMemo(
    () => allocations.filter(a => a.type === 'Leave'),
    [allocations],
  )

  const pending = useMemo(
    () => leaveAllocations.filter(a => a.approvalStatus === 'Pending').sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [leaveAllocations],
  )

  const recent = useMemo(
    () => leaveAllocations
      .filter(a => a.approvalStatus === 'Approved' || a.approvalStatus === 'Rejected')
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .slice(0, 20),
    [leaveAllocations],
  )

  const soldes = useMemo(() => computeSoldes(employees, allocations), [employees, allocations])

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

  if (error) return (
    <div style={{ padding: 40, color: 'var(--color-error)', fontSize: 'var(--fs-sm)' }}>
      Erreur : {error}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700 }}>Congés</div>
            <RefreshButton onRefresh={reload} refreshing={refreshing} lastFetchAt={lastFetchAt} />
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
            {pending.length} en attente · {employees.length} personnes
            {!isCofounder && <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={11} /> approbation réservée aux Co-founders</span>}
          </div>
        </div>
        <button
          onClick={() => { setEditingAlloc(undefined); setModalOpen(true) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px',
            borderRadius: 'var(--radius-btn)',
            border: '1px solid var(--btn-add-border)',
            background: 'var(--btn-add-bg)',
            color: 'var(--btn-add-color)',
            fontSize: 'var(--fs-xs)',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Plus size={13} /> Nouvelle demande
        </button>
      </div>

      {/* Pending requests */}
      <div style={CARD_STYLE}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Demandes en attente</div>
        </div>
        {pending.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', fontStyle: 'italic' }}>
            Aucune demande en attente.
          </div>
        ) : (
          <div>
            {pending.map(req => {
              const emp = employeesById.get(req.personIds[0])
              const days = leaveDurationDays(req)
              return (
                <div key={req.id} style={{ padding: '14px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {emp ? (
                        <Link href={`/people/${emp.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{emp.name}</Link>
                      ) : '?'}
                      <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 'var(--radius-badge)', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 'var(--fs-2xs)', fontWeight: 600 }}>
                        {LEAVE_TYPE_LABELS[req.leaveType] || req.leaveType}
                      </span>
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 3 }}>
                      {fmtDate(req.startDate)} {req.startHalf === 'Afternoon' && '(AM)'} → {fmtDate(req.endDate)} {req.endHalf === 'Morning' && '(PM)'}
                      {' · '}{days} jour{days > 1 ? 's' : ''}
                      {req.notes && <span style={{ marginLeft: 8, fontStyle: 'italic' }}>· {req.notes}</span>}
                    </div>
                  </div>
                  {isCofounder ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => handleApproval(req.id, 'Approved')}
                        disabled={actioning === req.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '6px 11px',
                          borderRadius: 'var(--radius-btn)',
                          border: '1px solid #22c55e',
                          background: 'rgba(34, 197, 94, 0.15)',
                          color: '#22c55e',
                          fontSize: 'var(--fs-xs)',
                          fontWeight: 600,
                          cursor: actioning === req.id ? 'wait' : 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <Check size={12} /> Approuver
                      </button>
                      <button
                        onClick={() => handleApproval(req.id, 'Rejected')}
                        disabled={actioning === req.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '6px 11px',
                          borderRadius: 'var(--radius-btn)',
                          border: '1px solid var(--btn-danger-bg)',
                          background: 'var(--btn-danger-bg)',
                          color: 'var(--btn-danger-text)',
                          fontSize: 'var(--fs-xs)',
                          fontWeight: 600,
                          cursor: actioning === req.id ? 'wait' : 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <X size={12} /> Rejeter
                      </button>
                      <button
                        onClick={() => { setEditingAlloc(req); setModalOpen(true) }}
                        style={{
                          padding: '6px 11px',
                          borderRadius: 'var(--radius-btn)',
                          border: '1px solid var(--border-subtle)',
                          background: 'transparent',
                          color: 'var(--text-secondary)',
                          fontSize: 'var(--fs-xs)',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Modifier
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      En attente d'un Co-founder
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Soldes */}
      <div style={CARD_STYLE}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Soldes {new Date().getFullYear()}</div>
          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
            Calculé depuis les allocations approuvées et en attente
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-xs)' }}>
            <thead>
              <tr style={{ background: 'var(--bg-input)' }}>
                {['Personne', 'Quota annuel', 'Pris', 'En attente', 'Reste', 'Quota méd.', 'Pris méd.'].map((h, i) => (
                  <th key={h} style={{
                    padding: '8px 14px',
                    textAlign: i === 0 ? 'left' : 'right',
                    color: 'var(--text-muted)',
                    fontWeight: 500,
                    fontSize: 'var(--fs-2xs)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {soldes.map((row, idx) => (
                <tr key={row.emp.id} style={{ borderTop: '1px solid var(--border-subtle)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '8px 14px', fontWeight: 600 }}>
                    <Link href={`/people/${row.emp.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{row.emp.name}</Link>
                  </td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace' }}>{row.quotaAnnual || '—'}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace' }}>{row.takenAnnual.toFixed(1)}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace', color: row.pendingAnnual > 0 ? 'var(--color-warning)' : 'inherit' }}>
                    {row.pendingAnnual > 0 ? row.pendingAnnual.toFixed(1) : '—'}
                  </td>
                  <td style={{
                    padding: '8px 14px',
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: row.remainingAnnual < 0 ? 'var(--color-error)' : row.remainingAnnual < 5 ? 'var(--color-warning)' : 'var(--color-success)',
                  }}>
                    {row.remainingAnnual.toFixed(1)}
                  </td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{row.quotaMed || '—'}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{row.takenMed.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent decisions */}
      {recent.length > 0 && (
        <div style={CARD_STYLE}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Décisions récentes</div>
          </div>
          {recent.map(req => {
            const emp = employeesById.get(req.personIds[0])
            const days = leaveDurationDays(req)
            const badge = APPROVAL_BADGE[req.approvalStatus] || APPROVAL_BADGE.Pending
            return (
              <div key={req.id} style={{ padding: '10px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 'var(--fs-xs)' }}>
                  {emp ? (
                    <Link href={`/people/${emp.id}`} style={{ fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}>{emp.name}</Link>
                  ) : <span style={{ fontWeight: 600 }}>?</span>}
                  <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
                    {LEAVE_TYPE_LABELS[req.leaveType] || req.leaveType} · {fmtDate(req.startDate)} → {fmtDate(req.endDate)} · {days}j
                  </span>
                </div>
                <span style={{ padding: '3px 9px', borderRadius: 'var(--radius-badge)', background: badge.bg, color: badge.color, fontSize: 'var(--fs-2xs)', fontWeight: 600 }}>
                  {badge.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <AllocationModal
          employees={employees}
          projects={projects}
          allocations={allocations}
          existing={editingAlloc}
          onClose={() => { setModalOpen(false); setEditingAlloc(undefined) }}
          onSaved={() => { setModalOpen(false); setEditingAlloc(undefined); reload() }}
        />
      )}
    </div>
  )
}
