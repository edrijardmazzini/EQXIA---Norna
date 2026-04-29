'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useWorkplaceData } from '@/hooks/useWorkplaceData'
import { HOLIDAY_DATES_MU } from '@/lib/workplace/holidays'
import type { Allocation, HalfDay } from '@/types/workplace'
import { EqxiaLoadingScreen } from '@/components/eqxia'
import { AllocationModal } from '@/components/workplace/AllocationModal'

// ── Colour palette per project type ──────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  'Workshop':        '#A6C9CE',
  'Audit':           '#8b5cf6',
  'Consulting':      '#3b82f6',
  'Development':     '#22c55e',
  'Training':        '#f97316',
  'Retainer':        '#eab308',
  'Strategic Review':'#ec4899',
  'Internal':        '#6b7280',
  '_leave':          '#fb923c',
  '_holiday':        '#94a3b8',
}

function typeColor(alloc: Allocation): string {
  if (alloc.type === 'Leave')          return TYPE_COLORS['_leave']
  if (alloc.type === 'Public Holiday') return TYPE_COLORS['_holiday']
  return TYPE_COLORS[alloc.projectType] || '#6b7280'
}

// ── Grid generation ───────────────────────────────────────────────────────────
interface GridCell { date: string; half: HalfDay; dayOfWeek: number }

function getMondayOf(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function generateGrid(weeks = 8): { cells: GridCell[]; weekStarts: string[] } {
  const monday = getMondayOf(new Date())
  const cells: GridCell[] = []
  const weekStarts: string[] = []

  for (let w = 0; w < weeks; w++) {
    const weekStart = new Date(monday)
    weekStart.setDate(monday.getDate() + w * 7)
    weekStarts.push(toYMD(weekStart))

    for (let d = 0; d < 5; d++) {
      const day = new Date(weekStart)
      day.setDate(weekStart.getDate() + d)
      const date = toYMD(day)
      cells.push({ date, half: 'Morning',   dayOfWeek: d })
      cells.push({ date, half: 'Afternoon', dayOfWeek: d })
    }
  }

  return { cells, weekStarts }
}

// ── Allocation cell coverage ──────────────────────────────────────────────────
function coversCell(alloc: Allocation, cell: GridCell): boolean {
  if (!alloc.startDate || !alloc.endDate) return false
  const cIdx = cell.half === 'Morning' ? 0 : 1
  const afterStart =
    cell.date > alloc.startDate ||
    (cell.date === alloc.startDate && cIdx >= (alloc.startHalf === 'Morning' ? 0 : 1))
  const beforeEnd =
    cell.date < alloc.endDate ||
    (cell.date === alloc.endDate && cIdx <= (alloc.endHalf === 'Morning' ? 0 : 1))
  return afterStart && beforeEnd
}

type CellMap = Map<string, Map<string, Allocation>>

function buildCellMap(allocations: Allocation[], cells: GridCell[]): CellMap {
  const map: CellMap = new Map()
  for (const alloc of allocations) {
    for (const personId of alloc.personIds) {
      if (!map.has(personId)) map.set(personId, new Map())
      const personMap = map.get(personId)!
      for (const cell of cells) {
        if (coversCell(alloc, cell)) {
          personMap.set(`${cell.date}:${cell.half[0]}`, alloc)
        }
      }
    }
  }
  return map
}

// ── Week label ────────────────────────────────────────────────────────────────
const DAY_LABELS = ['Lu', 'Ma', 'Me', 'Je', 'Ve']

function weekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const end = new Date(d)
  end.setDate(d.getDate() + 4)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${d.toLocaleDateString('fr-FR', opts)} – ${end.toLocaleDateString('fr-FR', opts)}`
}

// ── Legend entry ──────────────────────────────────────────────────────────────
function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
      {label}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PlanningPage() {
  const { employees, projects, allocations, loading, error, reload } = useWorkplaceData()
  const [modalState, setModalState] = useState<
    | { mode: 'closed' }
    | { mode: 'create'; personId?: string; date?: string }
    | { mode: 'edit'; allocation: Allocation }
  >({ mode: 'closed' })

  const { cells, weekStarts } = useMemo(() => generateGrid(8), [])

  const cellMap = useMemo(() => buildCellMap(allocations, cells), [allocations, cells])

  const totalCapacity = employees.length * 10 * 8
  const totalBooked = useMemo(() => {
    let count = 0
    for (const [, personMap] of cellMap) {
      for (const [, alloc] of personMap) {
        if (alloc.type === 'Project' && alloc.status === 'Confirmed') count++
      }
    }
    return count
  }, [cellMap])
  const bookedPct = totalCapacity > 0 ? Math.round(totalBooked / totalCapacity * 100) : 0

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>Planification équipe</div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
            {employees.length} personnes · 8 semaines
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => setModalState({ mode: 'create' })}
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
            <Plus size={13} /> Allocation
          </button>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
            Charge Confirmed :{' '}
            <span style={{ fontWeight: 700, color: bookedPct > 85 ? 'var(--color-error)' : bookedPct > 60 ? 'var(--color-warning)' : 'var(--color-success)', fontFamily: 'monospace' }}>
              {bookedPct}%
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(TYPE_COLORS).filter(([k]) => !k.startsWith('_')).map(([type, color]) => (
              <LegendItem key={type} color={color} label={type} />
            ))}
            <LegendItem color={TYPE_COLORS['_leave']} label="Congé" />
          </div>
        </div>
      </div>

      {/* Status legend */}
      <div style={{ display: 'flex', gap: 14, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 16, height: 10, background: '#A6C9CE', borderRadius: 2, flexShrink: 0 }} />
          Confirmed (plein)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 16, height: 10, borderRadius: 2, flexShrink: 0, backgroundImage: 'repeating-linear-gradient(45deg, #A6C9CE, #A6C9CE 2px, transparent 2px, transparent 5px)' }} />
          Probable (hachuré)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 16, height: 10, borderRadius: 2, border: '1.5px solid #A6C9CE', flexShrink: 0 }} />
          Draft (contour)
        </div>
      </div>

      {/* Grid */}
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
          <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 140 }} />
              {cells.map((_, i) => <col key={i} style={{ width: 18 }} />)}
            </colgroup>
            <thead>
              {/* Week row */}
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--fs-2xs)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  Équipe
                </th>
                {weekStarts.map(ws => (
                  <th key={ws} colSpan={10} style={{
                    padding: '6px 4px',
                    textAlign: 'left',
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--fs-2xs)',
                    fontWeight: 600,
                    borderLeft: '1px solid var(--border-subtle)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}>
                    {weekLabel(ws)}
                  </th>
                ))}
              </tr>
              {/* Day row */}
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-input)' }}>
                <th />
                {weekStarts.flatMap((ws, wi) =>
                  DAY_LABELS.map((day, di) => (
                    <th
                      key={`${wi}-${di}`}
                      colSpan={2}
                      style={{
                        padding: '3px 0',
                        textAlign: 'center',
                        fontSize: 10,
                        fontWeight: 500,
                        color: 'var(--text-muted)',
                        borderLeft: di === 0 ? '1px solid var(--border-subtle)' : undefined,
                      }}
                    >
                      {day}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp, empIdx) => {
                const personMap = cellMap.get(emp.id)
                return (
                  <tr
                    key={emp.id}
                    style={{
                      borderTop: '1px solid var(--border-subtle)',
                      background: empIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    }}
                  >
                    {/* Name cell */}
                    <td style={{ padding: '0 14px', height: 36, whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {emp.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                        {emp.role}
                      </div>
                    </td>

                    {/* Half-day cells */}
                    {cells.map((cell, ci) => {
                      const key = `${cell.date}:${cell.half[0]}`
                      const alloc = personMap?.get(key)
                      const isHoliday = HOLIDAY_DATES_MU.has(cell.date)
                      const prevKey = ci > 0 ? `${cells[ci - 1].date}:${cells[ci - 1].half[0]}` : null
                      const nextKey = ci < cells.length - 1 ? `${cells[ci + 1].date}:${cells[ci + 1].half[0]}` : null
                      const prevAlloc = prevKey ? personMap?.get(prevKey) : undefined
                      const nextAlloc = nextKey ? personMap?.get(nextKey) : undefined
                      const isStart = !!(alloc && alloc !== prevAlloc)
                      const isEnd   = !!(alloc && alloc !== nextAlloc)

                      const color = alloc ? typeColor(alloc) : undefined
                      let bg: string | undefined
                      let border: string | undefined

                      if (alloc) {
                        if (alloc.status === 'Confirmed') {
                          bg = color
                        } else if (alloc.status === 'Probable') {
                          bg = `repeating-linear-gradient(45deg, ${color}, ${color} 2px, transparent 2px, transparent 5px)`
                        } else {
                          bg = 'transparent'
                          border = `1.5px solid ${color}`
                        }
                      } else if (isHoliday) {
                        bg = 'repeating-linear-gradient(90deg, var(--border-subtle) 0px, var(--border-subtle) 1px, transparent 1px, transparent 4px)'
                      }

                      const borderLeftExtra = cell.half === 'Morning' && cell.dayOfWeek === 0
                        ? '1px solid var(--border-subtle)'
                        : undefined

                      return (
                        <td
                          key={key}
                          title={alloc ? `${emp.name} — ${alloc.type === 'Leave' ? 'Congé' : alloc.projectName} (${alloc.status})` : isHoliday ? 'Férié MU' : 'Cliquer pour créer une allocation'}
                          onClick={() => {
                            if (alloc) {
                              setModalState({ mode: 'edit', allocation: alloc })
                            } else {
                              setModalState({ mode: 'create', personId: emp.id, date: cell.date })
                            }
                          }}
                          style={{
                            height: 36,
                            width: 18,
                            padding: 0,
                            background: bg,
                            border: border || undefined,
                            borderRadius: isStart && isEnd ? 3 : isStart ? '3px 0 0 3px' : isEnd ? '0 3px 3px 0' : 0,
                            borderLeft: borderLeftExtra,
                            cursor: 'pointer',
                          }}
                        />
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalState.mode !== 'closed' && (
        <AllocationModal
          employees={employees}
          projects={projects}
          existing={modalState.mode === 'edit' ? modalState.allocation : undefined}
          defaultPersonId={modalState.mode === 'create' ? modalState.personId : undefined}
          defaultDate={modalState.mode === 'create' ? modalState.date : undefined}
          onClose={() => setModalState({ mode: 'closed' })}
          onSaved={() => { setModalState({ mode: 'closed' }); reload() }}
        />
      )}
    </div>
  )
}
