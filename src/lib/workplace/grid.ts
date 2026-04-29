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
