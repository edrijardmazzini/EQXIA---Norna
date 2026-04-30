import type { Allocation, WorkplaceEmployee, WorkplaceProject } from '@/types/workplace'
import { coversCell, generateGrid, getMondayOf, type GridCell } from './grid'
import { HOLIDAY_DATES_MU } from './holidays'

// Charge agrégée d'une personne sur une semaine
export interface CellLoad {
  capacity: number    // demi-jours dispo (10 - fériés - congés Approved)
  booked: number      // somme effort confirmed (en demi-jours)
  probable: number    // somme effort probable
  leaves: number      // demi-jours de congés Approved
  holidays: number    // demi-jours de fériés MU
}

export function computeWeekLoad(personId: string, weekCells: GridCell[], allocations: Allocation[]): CellLoad {
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

export function utilization(load: CellLoad): number {
  if (load.capacity === 0) return 0
  return Math.round((load.booked / load.capacity) * 100)
}

// Construit une matrice de loads sur N semaines à partir d'aujourd'hui
export function buildLoadMatrix(
  employees: WorkplaceEmployee[],
  allocations: Allocation[],
  weeks: number,
  startFrom: Date = new Date(),
): { weekStarts: string[]; loadsByPerson: Map<string, CellLoad[]> } {
  const monday = getMondayOf(startFrom)
  const { cells, weekStarts } = generateGrid(weeks, monday)

  const cellsByWeek: GridCell[][] = []
  for (let i = 0; i < weekStarts.length; i++) {
    cellsByWeek.push(cells.slice(i * 10, (i + 1) * 10))
  }

  const loadsByPerson = new Map<string, CellLoad[]>()
  for (const emp of employees) {
    loadsByPerson.set(emp.id, cellsByWeek.map(week => computeWeekLoad(emp.id, week, allocations)))
  }

  return { weekStarts, loadsByPerson }
}

// ── Signal types ──────────────────────────────────────────────────────────────
export type SignalLevel = 'critical' | 'warning' | 'info'

export interface PersonSignal {
  level: SignalLevel
  personId: string
  personName: string
  message: string
}

// Détecte sur/sous-utilisation par personne sur l'horizon donné
export function detectCapacitySignals(
  employees: WorkplaceEmployee[],
  loadsByPerson: Map<string, CellLoad[]>,
  horizon: number,
): PersonSignal[] {
  const signals: PersonSignal[] = []

  for (const emp of employees) {
    const loads = (loadsByPerson.get(emp.id) || []).slice(0, horizon)
    if (loads.length === 0) continue

    const utils = loads.map(utilization)
    const maxUtil = Math.max(...utils)
    const avgUtil = utils.reduce((a, b) => a + b, 0) / utils.length

    if (maxUtil > 100) {
      signals.push({
        level: 'critical', personId: emp.id, personName: emp.name,
        message: `Surbookée à ${maxUtil}% sur les ${horizon} prochaines semaines`,
      })
    } else if (maxUtil > 85) {
      signals.push({
        level: 'warning', personId: emp.id, personName: emp.name,
        message: `Charge ${maxUtil}% — proche de la saturation`,
      })
    } else if (avgUtil < 30) {
      signals.push({
        level: 'info', personId: emp.id, personName: emp.name,
        message: `Sous-utilisée (${Math.round(avgUtil)}% moyen)`,
      })
    }
  }

  const order: Record<SignalLevel, number> = { critical: 0, warning: 1, info: 2 }
  return signals.sort((a, b) => order[a.level] - order[b.level])
}

// Projets actifs sans aucune allocation Confirmed
export function detectUnstaffedProjects(
  projects: WorkplaceProject[],
  allocations: Allocation[],
): WorkplaceProject[] {
  const todayStr = new Date().toISOString().slice(0, 10)
  return projects.filter(p => {
    // Doit être en Active/Won (en cours de delivery)
    if (p.status !== 'Active' && p.status !== 'Won') return false
    // Doit avoir un endDate dans le futur (sinon il est terminé)
    if (p.endDate && p.endDate < todayStr) return false
    const hasConfirmed = allocations.some(a =>
      a.type === 'Project' &&
      a.status === 'Confirmed' &&
      a.projectIds.includes(p.id) &&
      a.endDate >= todayStr,
    )
    return !hasConfirmed
  })
}

// Conflits = 2+ allocations Confirmed simultanées sur une même personne
// chacune à 100% effort sur les mêmes demi-journées
export interface ConflictPair {
  personId: string
  personName: string
  a: Allocation
  b: Allocation
}

export function detectConfirmedConflicts(
  employees: WorkplaceEmployee[],
  allocations: Allocation[],
): ConflictPair[] {
  const out: ConflictPair[] = []
  const empById = new Map(employees.map(e => [e.id, e]))

  // Group by person
  const byPerson = new Map<string, Allocation[]>()
  for (const a of allocations) {
    if (a.type !== 'Project' || a.status !== 'Confirmed') continue
    if ((a.effortPct ?? 100) < 100) continue
    for (const pid of a.personIds) {
      if (!byPerson.has(pid)) byPerson.set(pid, [])
      byPerson.get(pid)!.push(a)
    }
  }

  for (const [personId, allocs] of byPerson) {
    if (allocs.length < 2) continue
    const emp = empById.get(personId)
    if (!emp) continue

    for (let i = 0; i < allocs.length; i++) {
      for (let j = i + 1; j < allocs.length; j++) {
        const a = allocs[i], b = allocs[j]
        // Overlap test in half-day resolution
        const aStartIdx = a.startHalf === 'Morning' ? 0 : 1
        const aEndIdx   = a.endHalf   === 'Morning' ? 0 : 1
        const bStartIdx = b.startHalf === 'Morning' ? 0 : 1
        const bEndIdx   = b.endHalf   === 'Morning' ? 0 : 1
        const aBeforeB = a.endDate < b.startDate || (a.endDate === b.startDate && aEndIdx   < bStartIdx)
        const bBeforeA = b.endDate < a.startDate || (b.endDate === a.startDate && bEndIdx   < aStartIdx)
        if (!aBeforeB && !bBeforeA) {
          out.push({ personId, personName: emp.name, a, b })
        }
      }
    }
  }

  return out
}

// Allocations Confirmed qui démarrent dans les N prochains jours
export function detectUpcomingStarts(allocations: Allocation[], daysAhead: number): Allocation[] {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const limit = new Date(today)
  limit.setDate(today.getDate() + daysAhead)
  const limitStr = limit.toISOString().slice(0, 10)

  return allocations
    .filter(a =>
      a.type === 'Project' &&
      a.status === 'Confirmed' &&
      a.startDate >= todayStr &&
      a.startDate <= limitStr,
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
}
