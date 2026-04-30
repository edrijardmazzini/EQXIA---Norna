'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { AlertOctagon, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react'
import { useWorkplaceData } from '@/hooks/useWorkplaceData'
import { HOLIDAY_DATES_MU } from '@/lib/workplace/holidays'
import { generateGrid, coversCell, weekLabel, weekNumber, type GridCell } from '@/lib/workplace/grid'
import type { Allocation } from '@/types/workplace'
import { EqxiaLoadingScreen } from '@/components/eqxia'
import { RefreshButton } from '@/components/workplace/RefreshButton'

const WEEKS = 12

// ── Per-week load calculation ─────────────────────────────────────────────────
interface CellLoad {
  capacity: number   // half-days available (after holidays + approved leaves)
  booked: number     // confirmed project allocs (effort weighted)
  probable: number   // probable allocs
  leaves: number     // approved leave half-days
  holidays: number   // holiday half-days
}

function computeWeekLoad(personId: string, weekCells: GridCell[], allocations: Allocation[]): CellLoad {
  const personAllocs = allocations.filter(a => a.personIds.includes(personId))

  let capacity = weekCells.length
  let booked = 0
  let probable = 0
  let leaves = 0
  let holidays = 0

  for (const cell of weekCells) {
    if (HOLIDAY_DATES_MU.has(cell.date)) {
      holidays++
      capacity--
      continue
    }

    const allocsHere = personAllocs.filter(a => coversCell(a, cell))

    const approvedLeave = allocsHere.find(a => a.type === 'Leave' && a.approvalStatus === 'Approved')
    if (approvedLeave) {
      leaves++
      capacity--
      continue
    }

    for (const alloc of allocsHere) {
      if (alloc.type === 'Project') {
        const weight = (alloc.effortPct ?? 100) / 100
        if (alloc.status === 'Confirmed')      booked += weight
        else if (alloc.status === 'Probable')  probable += weight
      }
    }
  }

  return { capacity, booked, probable, leaves, holidays }
}

function utilization(load: CellLoad): number {
  if (load.capacity === 0) return 0
  return Math.round((load.booked / load.capacity) * 100)
}

function utilColor(util: number, hasCapacity: boolean): { bg: string; text: string } {
  if (!hasCapacity)  return { bg: 'rgba(120, 120, 120, 0.18)', text: 'var(--text-muted)' }
  if (util > 100)    return { bg: 'rgba(239, 68, 68, 0.85)',   text: '#ffffff' }
  if (util > 85)     return { bg: 'rgba(249, 115, 22, 0.7)',   text: '#ffffff' }
  if (util >= 60)    return { bg: 'rgba(34, 197, 94, 0.55)',   text: '#ffffff' }
  if (util >= 30)    return { bg: 'rgba(59, 130, 246, 0.45)',  text: '#ffffff' }
  return { bg: 'rgba(59, 130, 246, 0.20)', text: 'var(--text-secondary)' }
}

// ── Signal computation ────────────────────────────────────────────────────────
interface Signal {
  level: 'critical' | 'warning' | 'info'
  personName: string
  message: string
}

function computeSignals(loadMatrix: Map<string, CellLoad[]>, employees: { id: string; name: string }[]): Signal[] {
  const signals: Signal[] = []
  const horizon = 4

  for (const emp of employees) {
    const loads = loadMatrix.get(emp.id) || []
    const slice = loads.slice(0, horizon)
    if (slice.length === 0) continue

    const utils = slice.map(utilization)
    const maxUtil = Math.max(...utils)
    const avgUtil = utils.reduce((a, b) => a + b, 0) / utils.length

    if (maxUtil > 100) {
      signals.push({ level: 'critical', personName: emp.name, message: `Surbookée à ${maxUtil}% sur les ${horizon} prochaines semaines` })
    } else if (maxUtil > 85) {
      signals.push({ level: 'warning', personName: emp.name, message: `Charge ${maxUtil}% — proche de la saturation` })
    } else if (avgUtil < 30) {
      signals.push({ level: 'info', personName: emp.name, message: `Sous-utilisée (${Math.round(avgUtil)}% moyen)` })
    }
  }

  const order = { critical: 0, warning: 1, info: 2 }
  return signals.sort((a, b) => order[a.level] - order[b.level])
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CapacityPage() {
  const { employees, allocations, loading, refreshing, error, reload, lastFetchAt } = useWorkplaceData()

  const { cells, weekStarts } = useMemo(() => generateGrid(WEEKS), [])

  // Group cells by week index
  const cellsByWeek = useMemo(() => {
    const out: GridCell[][] = []
    for (let i = 0; i < weekStarts.length; i++) {
      out.push(cells.slice(i * 10, (i + 1) * 10))
    }
    return out
  }, [cells, weekStarts])

  // For each person, compute load per week
  const loadMatrix = useMemo(() => {
    const map = new Map<string, CellLoad[]>()
    for (const emp of employees) {
      const loads = cellsByWeek.map(weekCells => computeWeekLoad(emp.id, weekCells, allocations))
      map.set(emp.id, loads)
    }
    return map
  }, [employees, cellsByWeek, allocations])

  const signals = useMemo(() => computeSignals(loadMatrix, employees), [loadMatrix, employees])

  if (loading) return <EqxiaLoadingScreen appName="Norna" />
  if (error) return (
    <div style={{ padding: 40, color: 'var(--color-error)', fontSize: 'var(--fs-sm)' }}>
      Erreur : {error}{' '}
      <button onClick={reload} style={{ marginLeft: 8, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', fontSize: 'inherit' }}>
        Réessayer
      </button>
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

      {/* Left: heatmap */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
              Capacité équipe
            </div>
            <RefreshButton onRefresh={reload} refreshing={refreshing} lastFetchAt={lastFetchAt} />
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
            {employees.length} personnes · {WEEKS} semaines · charge basée sur Confirmed
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
          {[
            { label: '<30 %',   color: 'rgba(59, 130, 246, 0.20)' },
            { label: '30-60 %', color: 'rgba(59, 130, 246, 0.45)' },
            { label: '60-85 %', color: 'rgba(34, 197, 94, 0.55)' },
            { label: '85-100 %', color: 'rgba(249, 115, 22, 0.7)' },
            { label: '>100 %',  color: 'rgba(239, 68, 68, 0.85)' },
            { label: 'Indispo', color: 'rgba(120, 120, 120, 0.18)' },
          ].map(({ label, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 16, height: 12, background: color, borderRadius: 2 }} />
              {label}
            </div>
          ))}
        </div>

        {/* Heatmap */}
        {employees.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
            Aucun employé actif trouvé.
          </div>
        ) : (
          <div style={{
            overflowX: 'auto',
            background: 'var(--card-bg)',
            backdropFilter: 'var(--card-blur)',
            WebkitBackdropFilter: 'var(--card-blur)',
            border: 'var(--card-border)',
            borderRadius: 'var(--card-radius)',
            boxShadow: 'var(--card-shadow)',
          }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 2, minWidth: '100%' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--fs-2xs)', fontWeight: 500, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--bg-card)' }}>
                    Équipe
                  </th>
                  {weekStarts.map(ws => (
                    <th key={ws} style={{
                      padding: '6px 4px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                      fontSize: 'var(--fs-2xs)',
                      fontWeight: 600,
                      minWidth: 64,
                      whiteSpace: 'nowrap',
                    }}>
                      <div>S{weekNumber(ws)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{weekLabel(ws).split(' – ')[0]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, empIdx) => {
                  const loads = loadMatrix.get(emp.id) || []
                  return (
                    <tr key={emp.id}>
                      <td style={{
                        padding: '0 14px',
                        whiteSpace: 'nowrap',
                        position: 'sticky',
                        left: 0,
                        background: empIdx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-hover)',
                        zIndex: 1,
                      }}>
                        <Link href={`/people/${emp.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>{emp.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{emp.role}</div>
                        </Link>
                      </td>
                      {loads.map((load, wi) => {
                        const util = utilization(load)
                        const { bg, text } = utilColor(util, load.capacity > 0)
                        const tooltipParts = [
                          `Charge : ${load.booked.toFixed(1)} / ${load.capacity} demi-jours (${util}%)`,
                        ]
                        if (load.probable > 0)  tooltipParts.push(`Probable : +${load.probable.toFixed(1)}`)
                        if (load.leaves > 0)    tooltipParts.push(`Congés : ${load.leaves} demi-jours`)
                        if (load.holidays > 0)  tooltipParts.push(`Fériés : ${load.holidays} demi-jours`)
                        return (
                          <td
                            key={wi}
                            title={`${emp.name} · ${weekLabel(weekStarts[wi])}\n${tooltipParts.join('\n')}`}
                            style={{
                              padding: '12px 6px',
                              textAlign: 'center',
                              background: bg,
                              color: text,
                              borderRadius: 4,
                              fontSize: 'var(--fs-xs)',
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              minWidth: 64,
                              cursor: 'help',
                            }}
                          >
                            {load.capacity === 0 ? '—' : `${util}%`}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Right: signals rail */}
      <aside style={{
        width: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        position: 'sticky',
        top: 'calc(var(--header-height) + 16px)',
      }}>
        <div style={{
          background: 'var(--card-bg)',
          backdropFilter: 'var(--card-blur)',
          WebkitBackdropFilter: 'var(--card-blur)',
          border: 'var(--card-border)',
          borderRadius: 'var(--card-radius)',
          boxShadow: 'var(--card-shadow)',
          padding: 14,
        }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent)', flexShrink: 0 }} />
            Signaux (4 prochaines semaines)
          </div>
          {signals.length === 0 ? (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 4px' }}>
              Aucun signal — capacité saine.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {signals.map((sig, i) => {
                const Icon =
                  sig.level === 'critical' ? AlertOctagon :
                  sig.level === 'warning'  ? AlertTriangle :
                  sig.message.includes('Sous-utilisée') ? TrendingDown : TrendingUp
                const color =
                  sig.level === 'critical' ? '#ef4444' :
                  sig.level === 'warning'  ? '#facc15' : '#60a5fa'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Icon size={13} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sig.personName}</span>
                      <span style={{ display: 'block', color: 'var(--text-muted)', marginTop: 1 }}>{sig.message}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
