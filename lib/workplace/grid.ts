import type { Allocation, HalfDay } from '@/types/workplace'
import { HOLIDAY_DATES_MU } from './holidays'

export interface GridCell {
  date: string
  half: HalfDay
  dayOfWeek: number
}

export function getMondayOf(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function generateGrid(weeks: number, fromDate: Date = new Date()): { cells: GridCell[]; weekStarts: string[] } {
  const monday = getMondayOf(fromDate)
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

export function coversCell(alloc: Allocation, cell: GridCell): boolean {
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

export function weekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const end = new Date(d)
  end.setDate(d.getDate() + 4)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${d.toLocaleDateString('fr-FR', opts)} – ${end.toLocaleDateString('fr-FR', opts)}`
}

export function weekNumber(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = target.valueOf()
  target.setMonth(0, 1)
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7)
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
}

export const DAY_LABELS = ['Lu', 'Ma', 'Me', 'Je', 'Ve'] as const

// Range arithmetic -----------------------------------------------------------

function compareDateHalf(aDate: string, aHalf: HalfDay, bDate: string, bHalf: HalfDay): number {
  if (aDate !== bDate) return aDate < bDate ? -1 : 1
  const aIdx = aHalf === 'Morning' ? 0 : 1
  const bIdx = bHalf === 'Morning' ? 0 : 1
  return aIdx - bIdx
}

// Greedy interval scheduling : assigne à chaque allocation un track index
// (0, 1, 2…) tel que deux allocations du même track ne se chevauchent pas en
// demi-journées. Retourne la map allocId → trackIdx et le nombre de tracks.
export function computeTracks(allocations: Allocation[]): {
  allocToTrack: Map<string, number>
  numTracks: number
} {
  const sorted = [...allocations].sort((a, b) => {
    const startCmp = compareDateHalf(a.startDate, a.startHalf, b.startDate, b.startHalf)
    if (startCmp !== 0) return startCmp
    return compareDateHalf(a.endDate, a.endHalf, b.endDate, b.endHalf)
  })

  const trackEnds: { date: string; half: HalfDay }[] = []
  const allocToTrack = new Map<string, number>()

  for (const alloc of sorted) {
    if (!alloc.startDate || !alloc.endDate) continue
    let placed = false
    for (let i = 0; i < trackEnds.length; i++) {
      const lastEnd = trackEnds[i]
      // alloc démarre strictement APRÈS la fin du dernier alloc de ce track
      if (compareDateHalf(alloc.startDate, alloc.startHalf, lastEnd.date, lastEnd.half) > 0) {
        allocToTrack.set(alloc.id, i)
        trackEnds[i] = { date: alloc.endDate, half: alloc.endHalf }
        placed = true
        break
      }
    }
    if (!placed) {
      allocToTrack.set(alloc.id, trackEnds.length)
      trackEnds.push({ date: alloc.endDate, half: alloc.endHalf })
    }
  }

  return { allocToTrack, numTracks: Math.max(1, trackEnds.length) }
}

// Counts leave duration in days (excludes weekends + MU holidays)
export function leaveDurationDays(alloc: Allocation): number {
  if (!alloc.startDate || !alloc.endDate) return 0
  const start = new Date(alloc.startDate + 'T00:00:00')
  const end = new Date(alloc.endDate + 'T00:00:00')
  let halfDays = 0
  const cur = new Date(start)
  while (cur <= end) {
    const day = cur.getDay()
    if (day >= 1 && day <= 5) {
      const dateStr = toYMD(cur)
      if (!HOLIDAY_DATES_MU.has(dateStr)) {
        const isStartDay = dateStr === alloc.startDate
        const isEndDay   = dateStr === alloc.endDate
        const morningCounts   = !isStartDay || alloc.startHalf === 'Morning'
        const afternoonCounts = !isEndDay   || alloc.endHalf   === 'Afternoon'
        if (morningCounts)   halfDays++
        if (afternoonCounts) halfDays++
      }
    }
    cur.setDate(cur.getDate() + 1)
  }
  return halfDays / 2
}
