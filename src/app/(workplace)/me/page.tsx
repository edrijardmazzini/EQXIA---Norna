'use client'

import { useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { Calendar, Briefcase, Umbrella, AlertCircle } from 'lucide-react'
import { useWorkplaceData } from '@/hooks/useWorkplaceData'
import { generateGrid, coversCell, leaveDurationDays, weekLabel, getMondayOf, toYMD } from '@/lib/workplace/grid'
import { HOLIDAY_DATES_MU, HOLIDAYS_MU_2026 } from '@/lib/workplace/holidays'
import { EqxiaLoadingScreen } from '@/components/eqxia'
import { RefreshButton } from '@/components/workplace/RefreshButton'
import type { Allocation } from '@/types/workplace'

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--card-bg)',
  backdropFilter: 'var(--card-blur)',
  WebkitBackdropFilter: 'var(--card-blur)',
  border: 'var(--card-border)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
  padding: 18,
}

function fmtDate(s: string): string {
  if (!s) return ''
  return new Date(s + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function fmtDateLong(s: string): string {
  if (!s) return ''
  return new Date(s + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

const STATUS_COLOR: Record<string, string> = {
  Confirmed: '#22c55e',
  Probable:  '#facc15',
  Draft:     '#6b7280',
}

export default function MePage() {
  const { data: session } = useSession()
  const { employees, allocations, loading, refreshing, error, reload, lastFetchAt } = useWorkplaceData()

  const me = useMemo(
    () => employees.find(e => e.email && session?.user?.email && e.email.toLowerCase() === session.user.email.toLowerCase()),
    [employees, session],
  )

  const myAllocations = useMemo(
    () => me ? allocations.filter(a => a.personIds.includes(me.id)) : [],
    [allocations, me],
  )

  // This week + next week allocations
  const todayStr = toYMD(new Date())
  const monday = getMondayOf(new Date())
  const inTwoWeeks = new Date(monday)
  inTwoWeeks.setDate(monday.getDate() + 14)
  const inTwoWeeksStr = toYMD(inTwoWeeks)

  const upcoming = useMemo(() =>
    myAllocations
      .filter(a => a.endDate >= todayStr)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 12),
    [myAllocations, todayStr],
  )

  const thisWeekAllocs = useMemo(() => {
    const { cells } = generateGrid(2)
    const weekCells = cells.slice(0, 10)
    const set = new Set<string>()
    const result: Allocation[] = []
    for (const cell of weekCells) {
      for (const alloc of myAllocations) {
        if (coversCell(alloc, cell) && !set.has(alloc.id)) {
          set.add(alloc.id)
          result.push(alloc)
        }
      }
    }
    return result
  }, [myAllocations])

  // Leave balance current year
  const balance = useMemo(() => {
    if (!me) return null
    const currentYear = new Date().getFullYear()
    const annual = myAllocations.filter(a =>
      a.type === 'Leave' && a.leaveType === 'Annual' && a.startDate.startsWith(String(currentYear)),
    )
    const taken   = annual.filter(a => a.approvalStatus === 'Approved').reduce((s, a) => s + leaveDurationDays(a), 0)
    const pending = annual.filter(a => a.approvalStatus === 'Pending').reduce((s, a) => s + leaveDurationDays(a), 0)
    const quota = me.leaveQuotaAnnual || 0
    return { quota, taken, pending, remaining: quota - taken - pending }
  }, [me, myAllocations])

  // Next holiday
  const nextHoliday = useMemo(() => {
    return HOLIDAYS_MU_2026.find(h => h.date >= todayStr)
  }, [todayStr])

  if (loading) return <EqxiaLoadingScreen appName="Norna" />
  if (error) return <div style={{ padding: 40, color: 'var(--color-error)' }}>Erreur : {error}</div>

  if (!me) return (
    <div style={{ ...CARD_STYLE, textAlign: 'center', color: 'var(--text-muted)' }}>
      <AlertCircle size={20} style={{ marginBottom: 8 }} />
      <div>Aucun employé associé à votre email <code>{session?.user?.email}</code>.</div>
      <div style={{ marginTop: 6, fontSize: 'var(--fs-xs)' }}>Demandez à un Co-founder de lier votre profil dans Notion.</div>
    </div>
  )

  const firstName = me.name.split(' ')[0]
  const today = new Date()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Greeting */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
            Bonjour, {firstName}
          </div>
          <RefreshButton onRefresh={reload} refreshing={refreshing} lastFetchAt={lastFetchAt} />
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 4, textTransform: 'capitalize' }}>
          {today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} · {me.role} · {me.pays}
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>

        <div style={CARD_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            <Briefcase size={11} /> Cette semaine
          </div>
          <div style={{ fontSize: 'var(--fs-kpi)', fontWeight: 'var(--fw-kpi)' as React.CSSProperties['fontWeight'], letterSpacing: 'var(--ls-kpi)', color: 'var(--accent)', marginTop: 6, fontFamily: 'monospace' }}>
            {thisWeekAllocs.length}
          </div>
          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
            allocation{thisWeekAllocs.length > 1 ? 's' : ''} active{thisWeekAllocs.length > 1 ? 's' : ''}
          </div>
        </div>

        {balance && (
          <div style={CARD_STYLE}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              <Umbrella size={11} /> Solde congé annuel
            </div>
            <div style={{ fontSize: 'var(--fs-kpi)', fontWeight: 'var(--fw-kpi)' as React.CSSProperties['fontWeight'], letterSpacing: 'var(--ls-kpi)', color: balance.remaining < 5 ? 'var(--color-warning)' : 'var(--color-success)', marginTop: 6, fontFamily: 'monospace' }}>
              {balance.remaining.toFixed(1)}
            </div>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
              sur {balance.quota} · {balance.taken} pris{balance.pending > 0 ? ` · ${balance.pending} en attente` : ''}
            </div>
          </div>
        )}

        {nextHoliday && (
          <div style={CARD_STYLE}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              <Calendar size={11} /> Prochain férié MU
            </div>
            <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-primary)', marginTop: 8 }}>
              {nextHoliday.name}
            </div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 2, textTransform: 'capitalize' }}>
              {fmtDateLong(nextHoliday.date)}
            </div>
          </div>
        )}
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
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', fontStyle: 'italic' }}>
            Aucune allocation à venir.
          </div>
        ) : (
          <div>
            {upcoming.map(alloc => {
              const isLeave = alloc.type === 'Leave'
              const tag = isLeave ? `Congé ${alloc.leaveType}` : alloc.projectType || 'Projet'
              const title = isLeave ? `Congé — ${alloc.approvalStatus || 'Pending'}` : alloc.projectName
              const statusColor = isLeave
                ? (alloc.approvalStatus === 'Approved' ? '#22c55e' : alloc.approvalStatus === 'Rejected' ? '#ef4444' : '#facc15')
                : (STATUS_COLOR[alloc.status] || '#6b7280')
              return (
                <div key={alloc.id} style={{ padding: '11px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {title}
                      <span style={{ marginLeft: 8, padding: '2px 7px', borderRadius: 'var(--radius-badge)', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 10, fontWeight: 600 }}>
                        {tag}
                      </span>
                    </div>
                    <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                      {fmtDate(alloc.startDate)} → {fmtDate(alloc.endDate)} · {alloc.effortPct}%
                    </div>
                  </div>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: statusColor, flexShrink: 0 }} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
