'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, ChevronLeft, ChevronRight, CalendarDays, Filter } from 'lucide-react'
import { useWorkplaceData } from '@/hooks/useWorkplaceData'
import { HOLIDAY_DATES_MU } from '@/lib/workplace/holidays'
import { generateGrid, coversCell, weekLabel, getMondayOf, toYMD, DAY_LABELS, type GridCell } from '@/lib/workplace/grid'
import type { Allocation, AllocationStatus } from '@/types/workplace'
import { AllocationModal } from '@/components/workplace/AllocationModal'
import { RefreshButton } from '@/components/workplace/RefreshButton'

// ── Colour palette per project type ──────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  'Workshop':         '#A6C9CE',
  'Audit':            '#8b5cf6',
  'Consulting':       '#3b82f6',
  'Development':      '#22c55e',
  'Training':         '#f97316',
  'Retainer':         '#eab308',
  'Strategic Review': '#ec4899',
  'Internal':         '#6b7280',
  '_leave':           '#fb923c',
  '_holiday':         '#94a3b8',
}

const PROJECT_TYPES = Object.keys(TYPE_COLORS).filter(k => !k.startsWith('_'))
const ALL_STATUSES: AllocationStatus[] = ['Confirmed', 'Probable', 'Draft']

function typeColor(alloc: Allocation): string {
  if (alloc.type === 'Leave')          return TYPE_COLORS['_leave']
  if (alloc.type === 'Public Holiday') return TYPE_COLORS['_holiday']
  return TYPE_COLORS[alloc.projectType] || '#6b7280'
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

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
      {label}
    </div>
  )
}

function FilterChip({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        border: active ? `1px solid ${color || 'var(--accent)'}` : '1px solid var(--border-subtle)',
        background: active ? (color ? `${color}22` : 'var(--accent-soft)') : 'transparent',
        color: active ? (color || 'var(--accent)') : 'var(--text-muted)',
        fontSize: 'var(--fs-2xs)',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        opacity: active ? 1 : 0.6,
        transition: 'all 0.12s',
      }}
    >
      {color && <span style={{ width: 6, height: 6, borderRadius: 3, background: color }} />}
      {label}
    </button>
  )
}

export default function PlanningPage() {
  const { employees, projects, allocations, loading, refreshing, error, reload, lastFetchAt } = useWorkplaceData()

  // Navigation state
  const [weeksCount, setWeeksCount] = useState<4 | 8 | 12>(8)
  const [weekOffset, setWeekOffset] = useState(0) // 0 = current week, +1 = next week, -1 = prev

  // Filters
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set(PROJECT_TYPES))
  const [enabledStatuses, setEnabledStatuses] = useState<Set<AllocationStatus>>(new Set(ALL_STATUSES))
  const [showLeaves, setShowLeaves] = useState(true)
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)

  const [modalState, setModalState] = useState<
    | { mode: 'closed' }
    | { mode: 'create'; personId?: string; date?: string }
    | { mode: 'edit'; allocation: Allocation }
  >({ mode: 'closed' })

  // Compute grid based on offset + count
  const gridStart = useMemo(() => {
    const baseMonday = getMondayOf(new Date())
    const target = new Date(baseMonday)
    target.setDate(baseMonday.getDate() + weekOffset * 7)
    return target
  }, [weekOffset])

  const { cells, weekStarts } = useMemo(() => generateGrid(weeksCount, gridStart), [weeksCount, gridStart])

  // Today index for indicator (column position 0..cells.length-1, or -1 if outside grid)
  const todayCellIndex = useMemo(() => {
    const todayStr = toYMD(new Date())
    const idx = cells.findIndex(c => c.date === todayStr && c.half === 'Morning')
    return idx
  }, [cells])

  // Filter allocations
  const filteredAllocations = useMemo(() => {
    return allocations.filter(a => {
      if (a.type === 'Leave') return showLeaves
      if (a.type === 'Project') {
        if (!enabledTypes.has(a.projectType)) return false
        if (!enabledStatuses.has(a.status)) return false
        return true
      }
      return true
    })
  }, [allocations, enabledTypes, enabledStatuses, showLeaves])

  const cellMap = useMemo(() => buildCellMap(filteredAllocations, cells), [filteredAllocations, cells])

  const totalCapacity = employees.length * 10 * weeksCount
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

  const totalEnabledFilters = enabledTypes.size + enabledStatuses.size + (showLeaves ? 1 : 0)
  const totalPossibleFilters = PROJECT_TYPES.length + ALL_STATUSES.length + 1
  const filtersActive = totalEnabledFilters < totalPossibleFilters

  function toggleType(t: string) {
    setEnabledTypes(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t); else next.add(t)
      return next
    })
  }
  function toggleStatus(s: AllocationStatus) {
    setEnabledStatuses(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  }
  function resetFilters() {
    setEnabledTypes(new Set(PROJECT_TYPES))
    setEnabledStatuses(new Set(ALL_STATUSES))
    setShowLeaves(true)
  }

  if (error) return (
    <div style={{ padding: 40, color: 'var(--color-error)', fontSize: 'var(--fs-sm)' }}>
      Erreur : {error}{' '}
      <button onClick={reload} style={{ marginLeft: 8, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', fontSize: 'inherit' }}>
        Réessayer
      </button>
    </div>
  )

  const navBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '5px 10px',
    borderRadius: 'var(--radius-btn)',
    border: '1px solid var(--border-subtle)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 'var(--fs-xs)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>Planification équipe</div>
            <RefreshButton onRefresh={reload} refreshing={refreshing} lastFetchAt={lastFetchAt} />
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
            {employees.length} personnes · {weeksCount} semaines à partir du {weekLabel(weekStarts[0]).split(' – ')[0]}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
            Charge :{' '}
            <span style={{ fontWeight: 700, color: bookedPct > 85 ? 'var(--color-error)' : bookedPct > 60 ? 'var(--color-warning)' : 'var(--color-success)', fontFamily: 'monospace' }}>
              {bookedPct}%
            </span>
          </div>
        </div>
      </div>

      {/* Controls bar : navigation + filters trigger */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Navigation */}
        <button onClick={() => setWeekOffset(o => o - weeksCount)} style={navBtnStyle} title={`Reculer de ${weeksCount} semaines`}>
          <ChevronLeft size={12} />
        </button>
        <button
          onClick={() => setWeekOffset(0)}
          style={{
            ...navBtnStyle,
            background: weekOffset === 0 ? 'var(--accent-soft)' : 'transparent',
            color: weekOffset === 0 ? 'var(--accent)' : 'var(--text-secondary)',
            borderColor: weekOffset === 0 ? 'var(--accent)' : 'var(--border-subtle)',
          }}
          disabled={weekOffset === 0}
        >
          <CalendarDays size={11} /> Aujourd'hui
        </button>
        <button onClick={() => setWeekOffset(o => o + weeksCount)} style={navBtnStyle} title={`Avancer de ${weeksCount} semaines`}>
          <ChevronRight size={12} />
        </button>

        {/* Weeks count selector */}
        <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--bg-input)', borderRadius: 'var(--radius-btn)' }}>
          {([4, 8, 12] as const).map(n => (
            <button
              key={n}
              onClick={() => setWeeksCount(n)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-btn)',
                border: 'none',
                background: weeksCount === n ? 'var(--bg-card)' : 'transparent',
                color: weeksCount === n ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 'var(--fs-2xs)',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {n} sem
            </button>
          ))}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setFilterPanelOpen(o => !o)}
          style={{
            ...navBtnStyle,
            background: filtersActive ? 'var(--accent-soft)' : 'transparent',
            color: filtersActive ? 'var(--accent)' : 'var(--text-secondary)',
            borderColor: filtersActive ? 'var(--accent)' : 'var(--border-subtle)',
          }}
        >
          <Filter size={11} /> Filtres
          {filtersActive && (
            <span style={{ fontFamily: 'monospace', fontSize: 10 }}>
              ({totalEnabledFilters}/{totalPossibleFilters})
            </span>
          )}
        </button>
        {filtersActive && (
          <button onClick={resetFilters} style={{ ...navBtnStyle, color: 'var(--text-muted)', borderColor: 'transparent' }}>
            réinitialiser
          </button>
        )}
      </div>

      {/* Filter panel */}
      {filterPanelOpen && (
        <div style={{
          background: 'var(--card-bg)',
          backdropFilter: 'var(--card-blur)',
          WebkitBackdropFilter: 'var(--card-blur)',
          border: 'var(--card-border)',
          borderRadius: 'var(--card-radius)',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>
              Type de projet
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PROJECT_TYPES.map(t => (
                <FilterChip key={t} label={t} active={enabledTypes.has(t)} color={TYPE_COLORS[t]} onClick={() => toggleType(t)} />
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>
              Statut
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ALL_STATUSES.map(s => (
                <FilterChip key={s} label={s} active={enabledStatuses.has(s)} onClick={() => toggleStatus(s)} />
              ))}
              <FilterChip label="Congés" active={showLeaves} color={TYPE_COLORS['_leave']} onClick={() => setShowLeaves(s => !s)} />
            </div>
          </div>
        </div>
      )}

      {/* Status legend */}
      <div style={{ display: 'flex', gap: 14, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 16, height: 10, background: '#A6C9CE', borderRadius: 2, flexShrink: 0 }} />
          Confirmed
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 16, height: 10, borderRadius: 2, flexShrink: 0, backgroundImage: 'repeating-linear-gradient(45deg, #A6C9CE, #A6C9CE 2px, transparent 2px, transparent 5px)' }} />
          Probable
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 16, height: 10, borderRadius: 2, border: '1.5px solid #A6C9CE', flexShrink: 0 }} />
          Draft
        </div>
        <div style={{ width: 1, height: 12, background: 'var(--border-subtle)' }} />
        {Object.entries(TYPE_COLORS).filter(([k]) => !k.startsWith('_')).map(([type, color]) => (
          <LegendItem key={type} color={color} label={type} />
        ))}
        <LegendItem color={TYPE_COLORS['_leave']} label="Congé" />
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
          position: 'relative',
        }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 140 }} />
              {cells.map((_, i) => <col key={i} style={{ width: 18 }} />)}
            </colgroup>
            <thead>
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
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-input)' }}>
                <th />
                {weekStarts.flatMap((ws, wi) =>
                  DAY_LABELS.map((day, di) => {
                    const dayDate = new Date(ws + 'T00:00:00')
                    dayDate.setDate(dayDate.getDate() + di)
                    const isToday = toYMD(dayDate) === toYMD(new Date())
                    return (
                      <th
                        key={`${wi}-${di}`}
                        colSpan={2}
                        style={{
                          padding: '3px 0',
                          textAlign: 'center',
                          fontSize: 10,
                          fontWeight: isToday ? 700 : 500,
                          color: isToday ? 'var(--accent)' : 'var(--text-muted)',
                          borderLeft: di === 0 ? '1px solid var(--border-subtle)' : undefined,
                          background: isToday ? 'var(--accent-soft)' : undefined,
                        }}
                      >
                        {day}
                      </th>
                    )
                  })
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
                    <td style={{ padding: '0 14px', height: 36, whiteSpace: 'nowrap' }}>
                      <Link href={`/people/${emp.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {emp.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                          {emp.role}
                        </div>
                      </Link>
                    </td>

                    {cells.map((cell, ci) => {
                      const key = `${cell.date}:${cell.half[0]}`
                      const alloc = personMap?.get(key)
                      const isHoliday = HOLIDAY_DATES_MU.has(cell.date)
                      const todayStr = toYMD(new Date())
                      const isToday = cell.date === todayStr
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
                        if (alloc.status === 'Confirmed' || alloc.type === 'Leave') {
                          bg = color
                        } else if (alloc.status === 'Probable') {
                          bg = `repeating-linear-gradient(45deg, ${color}, ${color} 2px, transparent 2px, transparent 5px)`
                        } else {
                          bg = 'transparent'
                          border = `1.5px solid ${color}`
                        }
                      } else if (isHoliday) {
                        bg = 'repeating-linear-gradient(90deg, var(--border-subtle) 0px, var(--border-subtle) 1px, transparent 1px, transparent 4px)'
                      } else if (isToday) {
                        bg = 'rgba(166, 201, 206, 0.06)'
                      }

                      const borderLeftExtra = cell.half === 'Morning' && cell.dayOfWeek === 0
                        ? '1px solid var(--border-subtle)'
                        : isToday && cell.half === 'Morning'
                          ? '1px solid var(--accent)'
                          : undefined

                      return (
                        <td
                          key={key}
                          title={alloc
                            ? `${emp.name} — ${alloc.type === 'Leave' ? `Congé ${alloc.leaveType}` : alloc.projectName} (${alloc.status || alloc.approvalStatus})`
                            : isHoliday
                              ? 'Férié MU'
                              : 'Cliquer pour créer une allocation'}
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

          {/* Today vertical indicator overlay */}
          {todayCellIndex >= 0 && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `calc(140px + ${todayCellIndex} * 18px)`,
                width: 2,
                background: 'var(--accent)',
                opacity: 0.5,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          )}
        </div>
      )}

      {modalState.mode !== 'closed' && (
        <AllocationModal
          employees={employees}
          projects={projects}
          allocations={allocations}
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
