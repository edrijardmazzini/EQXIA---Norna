'use client'

import { useMemo, use, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Briefcase, Umbrella, MapPin, Mail, ExternalLink, Plus } from 'lucide-react'
import { useWorkplaceData } from '@/hooks/useWorkplaceData'
import { generateGrid, coversCell, leaveDurationDays, weekLabel, weekNumber, getMondayOf, toYMD, type GridCell } from '@/lib/workplace/grid'
import { HOLIDAY_DATES_MU } from '@/lib/workplace/holidays'
import { AllocationModal } from '@/components/workplace/AllocationModal'
import { RefreshButton } from '@/components/workplace/RefreshButton'
import { EqxiaLoadingScreen } from '@/components/eqxia'
import type { Allocation, WorkplaceEmployee } from '@/types/workplace'

const WEEKS = 12

const TYPE_COLORS: Record<string, string> = {
  Workshop:           '#A6C9CE',
  Audit:              '#8b5cf6',
  Consulting:         '#3b82f6',
  Development:        '#22c55e',
  Training:           '#f97316',
  Retainer:           '#eab308',
  'Strategic Review': '#ec4899',
  Internal:           '#6b7280',
  _leave:             '#fb923c',
}

function typeColor(alloc: Allocation): string {
  if (alloc.type === 'Leave') return TYPE_COLORS._leave
  return TYPE_COLORS[alloc.projectType] || '#6b7280'
}

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--card-bg)',
  backdropFilter: 'var(--card-blur)',
  WebkitBackdropFilter: 'var(--card-blur)',
  border: 'var(--card-border)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
}

function fmtDate(s: string): string {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function notionUrl(id: string): string {
  return `https://notion.so/${id.replace(/-/g, '')}`
}

interface CellLoad {
  capacity: number
  booked: number
  probable: number
  leaves: number
  holidays: number
}

function computeWeekLoad(personId: string, weekCells: GridCell[], allocations: Allocation[]): CellLoad {
  const personAllocs = allocations.filter(a => a.personIds.includes(personId))
  let capacity = weekCells.length, booked = 0, probable = 0, leaves = 0, holidays = 0
  for (const cell of weekCells) {
    if (HOLIDAY_DATES_MU.has(cell.date)) { holidays++; capacity--; continue }
    const allocsHere = personAllocs.filter(a => coversCell(a, cell))
    const approvedLeave = allocsHere.find(a => a.type === 'Leave' && a.approvalStatus === 'Approved')
    if (approvedLeave) { leaves++; capacity--; continue }
    for (const a of allocsHere) {
      if (a.type === 'Project') {
        const w = (a.effortPct ?? 100) / 100
        if (a.status === 'Confirmed') booked += w
        else if (a.status === 'Probable') probable += w
      }
    }
  }
  return { capacity, booked, probable, leaves, holidays }
}

export default function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: personId } = use(params)
  const { employees, projects, allocations, loading, refreshing, error, reload, lastFetchAt } = useWorkplaceData()
  const [modalState, setModalState] = useState<
    | { mode: 'closed' }
    | { mode: 'create' }
    | { mode: 'edit'; allocation: Allocation }
  >({ mode: 'closed' })

  const person = useMemo(() => employees.find(e => e.id === personId), [employees, personId])

  const myAllocations = useMemo(
    () => allocations.filter(a => a.personIds.includes(personId)),
    [allocations, personId],
  )

  const todayStr = toYMD(new Date())

  // Upcoming
  const upcoming = useMemo(() =>
    myAllocations
      .filter(a => a.endDate >= todayStr)
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [myAllocations, todayStr],
  )

  // Past (last 5)
  const past = useMemo(() =>
    myAllocations
      .filter(a => a.endDate < todayStr)
      .sort((a, b) => b.endDate.localeCompare(a.endDate))
      .slice(0, 5),
    [myAllocations, todayStr],
  )

  // Leave balance
  const balance = useMemo(() => {
    if (!person) return null
    const currentYear = new Date().getFullYear()
    const annual = myAllocations.filter(a =>
      a.type === 'Leave' && a.leaveType === 'Annual' && a.startDate.startsWith(String(currentYear))
    )
    const sick = myAllocations.filter(a =>
      a.type === 'Leave' && a.leaveType === 'Sick' && a.startDate.startsWith(String(currentYear))
    )
    const taken    = annual.filter(a => a.approvalStatus === 'Approved').reduce((s, a) => s + leaveDurationDays(a), 0)
    const pending  = annual.filter(a => a.approvalStatus === 'Pending').reduce((s, a) => s + leaveDurationDays(a), 0)
    const sickTaken = sick.filter(a => a.approvalStatus === 'Approved').reduce((s, a) => s + leaveDurationDays(a), 0)
    return {
      quota: person.leaveQuotaAnnual || 0,
      taken,
      pending,
      remaining: (person.leaveQuotaAnnual || 0) - taken - pending,
      medQuota: person.leaveMedQuota || 0,
      sickTaken,
    }
  }, [person, myAllocations])

  // Mini planning: 12-week capacity per week
  const monday = useMemo(() => getMondayOf(new Date()), [])
  const { cells, weekStarts } = useMemo(() => generateGrid(WEEKS, monday), [monday])
  const cellsByWeek = useMemo(() => {
    const out: GridCell[][] = []
    for (let i = 0; i < weekStarts.length; i++) out.push(cells.slice(i * 10, (i + 1) * 10))
    return out
  }, [cells, weekStarts])
  const weeklyLoads = useMemo(
    () => cellsByWeek.map(week => computeWeekLoad(personId, week, allocations)),
    [cellsByWeek, allocations, personId],
  )

  if (loading) return <EqxiaLoadingScreen appName="Norna" />
  if (error)   return <div style={{ padding: 40, color: 'var(--color-error)' }}>Erreur : {error}</div>
  if (!person) return (
    <div style={{ ...CARD_STYLE, padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
      Personne introuvable. <Link href="/workplace" style={{ color: 'var(--accent)' }}>Retour au planning</Link>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Link href="/workplace" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 'var(--fs-xs)', color: 'var(--text-muted)',
          textDecoration: 'none',
        }}>
          <ArrowLeft size={12} /> Retour au planning
        </Link>
        <RefreshButton onRefresh={reload} refreshing={refreshing} lastFetchAt={lastFetchAt} />
      </div>

      {/* Profile header */}
      <div style={{ ...CARD_STYLE, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              {person.role || 'Membre équipe'} · {person.department}
            </div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
              {person.name}
              <a href={notionUrl(person.id)} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, color: 'var(--text-muted)', display: 'inline-flex', verticalAlign: 'middle' }} title="Ouvrir dans Notion">
                <ExternalLink size={14} />
              </a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12, fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
              {person.pays && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={11} color="var(--text-muted)" /> {person.pays}
                </span>
              )}
              {person.email && (
                <a href={`mailto:${person.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)', textDecoration: 'none' }}>
                  <Mail size={11} color="var(--text-muted)" /> {person.email}
                </a>
              )}
              {person.availability && (
                <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-badge)', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 'var(--fs-2xs)', fontWeight: 600 }}>
                  {person.availability}
                </span>
              )}
            </div>
            {person.specializations.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>
                  Spécialisations
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {person.specializations.map(s => (
                    <span key={s} style={{
                      padding: '3px 9px',
                      borderRadius: 'var(--radius-badge)',
                      background: 'var(--bg-input)',
                      color: 'var(--text-secondary)',
                      fontSize: 'var(--fs-2xs)',
                      fontWeight: 600,
                    }}>{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setModalState({ mode: 'create' })}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 14px',
              borderRadius: 'var(--radius-btn)',
              border: '1px solid var(--btn-add-border)',
              background: 'var(--btn-add-bg)',
              color: 'var(--btn-add-color)',
              fontSize: 'var(--fs-xs)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            <Plus size={13} /> Allocation
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>

        <div style={{ ...CARD_STYLE, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            <Briefcase size={11} /> Allocations à venir
          </div>
          <div style={{ fontSize: 'var(--fs-kpi)', fontWeight: 'var(--fw-kpi)' as React.CSSProperties['fontWeight'], letterSpacing: 'var(--ls-kpi)', color: 'var(--accent)', marginTop: 6, fontFamily: 'monospace' }}>
            {upcoming.filter(a => a.type === 'Project').length}
          </div>
          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
            sur {projects.length} projets actifs
          </div>
        </div>

        {balance && (
          <div style={{ ...CARD_STYLE, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              <Umbrella size={11} /> Solde congé annuel
            </div>
            <div style={{ fontSize: 'var(--fs-kpi)', fontWeight: 'var(--fw-kpi)' as React.CSSProperties['fontWeight'], letterSpacing: 'var(--ls-kpi)', color: balance.remaining < 0 ? 'var(--color-error)' : balance.remaining < 5 ? 'var(--color-warning)' : 'var(--color-success)', marginTop: 6, fontFamily: 'monospace' }}>
              {balance.remaining.toFixed(1)}
            </div>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
              sur {balance.quota} · {balance.taken} pris{balance.pending > 0 ? ` · ${balance.pending} en attente` : ''}
            </div>
          </div>
        )}

        {balance && balance.medQuota > 0 && (
          <div style={{ ...CARD_STYLE, padding: 18 }}>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Médical pris
            </div>
            <div style={{ fontSize: 'var(--fs-kpi)', fontWeight: 'var(--fw-kpi)' as React.CSSProperties['fontWeight'], letterSpacing: 'var(--ls-kpi)', color: 'var(--text-secondary)', marginTop: 6, fontFamily: 'monospace' }}>
              {balance.sickTaken.toFixed(1)}
            </div>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
              sur {balance.medQuota} jours/an
            </div>
          </div>
        )}
      </div>

      {/* Mini-planning 12 weeks */}
      <div style={{ ...CARD_STYLE, padding: 0 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Charge prévisionnelle</div>
          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
            {WEEKS} prochaines semaines · capacité = jours ouvrés − fériés MU − congés Approved
          </div>
        </div>
        <div style={{ overflowX: 'auto', padding: '12px 18px' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 2, width: '100%' }}>
            <thead>
              <tr>
                {weekStarts.map(ws => (
                  <th key={ws} style={{ padding: '4px 2px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 10, fontWeight: 500, minWidth: 50 }}>
                    S{weekNumber(ws)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {weeklyLoads.map((load, wi) => {
                  const util = load.capacity > 0 ? Math.round((load.booked / load.capacity) * 100) : 0
                  const color =
                    load.capacity === 0 ? 'rgba(120, 120, 120, 0.18)' :
                    util > 100         ? 'rgba(239, 68, 68, 0.85)' :
                    util > 85          ? 'rgba(249, 115, 22, 0.7)' :
                    util >= 60         ? 'rgba(34, 197, 94, 0.55)' :
                    util >= 30         ? 'rgba(59, 130, 246, 0.45)' :
                                         'rgba(59, 130, 246, 0.20)'
                  return (
                    <td
                      key={wi}
                      title={`${weekLabel(weekStarts[wi])} · ${load.booked.toFixed(1)}/${load.capacity} demi-jours (${util}%)${load.leaves > 0 ? ` · ${load.leaves} congé` : ''}${load.holidays > 0 ? ` · ${load.holidays} férié` : ''}`}
                      style={{
                        padding: '12px 4px',
                        textAlign: 'center',
                        background: color,
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        color: util >= 60 || load.capacity === 0 ? '#ffffff' : 'var(--text-secondary)',
                        minWidth: 50,
                      }}
                    >
                      {load.capacity === 0 ? '—' : `${util}%`}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Upcoming allocations */}
      <div style={{ ...CARD_STYLE, padding: 0 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Allocations à venir</div>
          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
            {upcoming.length === 0 ? 'Rien de prévu' : `${upcoming.length} allocation${upcoming.length > 1 ? 's' : ''}`}
          </div>
        </div>
        {upcoming.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', fontStyle: 'italic' }}>
            Aucune allocation à venir.
          </div>
        ) : (
          upcoming.slice(0, 12).map(alloc => (
            <AllocationRow key={alloc.id} alloc={alloc} onEdit={() => setModalState({ mode: 'edit', allocation: alloc })} />
          ))
        )}
      </div>

      {/* Past allocations (last 5) */}
      {past.length > 0 && (
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>Récentes (terminées)</div>
          </div>
          {past.map(alloc => (
            <AllocationRow key={alloc.id} alloc={alloc} dimmed onEdit={() => setModalState({ mode: 'edit', allocation: alloc })} />
          ))}
        </div>
      )}

      {modalState.mode !== 'closed' && (
        <AllocationModal
          employees={employees}
          projects={projects}
          allocations={allocations}
          existing={modalState.mode === 'edit' ? modalState.allocation : undefined}
          defaultPersonId={modalState.mode === 'create' ? personId : undefined}
          onClose={() => setModalState({ mode: 'closed' })}
          onSaved={() => { setModalState({ mode: 'closed' }); reload() }}
        />
      )}
    </div>
  )
}

function AllocationRow({ alloc, dimmed = false, onEdit }: { alloc: Allocation; dimmed?: boolean; onEdit: () => void }) {
  const isLeave = alloc.type === 'Leave'
  const tag = isLeave ? `Congé ${alloc.leaveType}` : alloc.projectType || 'Projet'
  const title = isLeave ? `Congé ${alloc.leaveType}` : alloc.projectName
  const color = typeColor(alloc)
  const statusLabel = isLeave ? alloc.approvalStatus : alloc.status

  return (
    <button
      onClick={onEdit}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        width: '100%',
        padding: '11px 18px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'transparent',
        color: dimmed ? 'var(--text-muted)' : 'var(--text-primary)',
        border: 'none',
        borderTopWidth: 1,
        borderTopStyle: 'solid',
        borderTopColor: 'var(--border-subtle)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        opacity: dimmed ? 0.7 : 1,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        <span style={{ width: 6, height: 24, borderRadius: 3, background: color, flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
            <span style={{ marginLeft: 8, padding: '2px 7px', borderRadius: 'var(--radius-badge)', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 10, fontWeight: 600 }}>
              {tag}
            </span>
          </div>
          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
            {fmtDate(alloc.startDate)} → {fmtDate(alloc.endDate)} · {alloc.effortPct}%
          </div>
        </div>
      </div>
      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>{statusLabel}</span>
    </button>
  )
}
