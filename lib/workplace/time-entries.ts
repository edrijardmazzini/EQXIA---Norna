import type { Allocation, TimeEntry } from '@/types/workplace'

// Convention Eqxia : 220 jours ouvrés / an, ~8h / jour standard
export const HOURS_PER_DAY = 8

// Pour chaque time entry qui couvre une plage (date != endDate),
// on attribue toutes les heures au début de la période. C'est suffisant
// pour les vues mensuelles / projets — on ne split pas les heures
// jour par jour.
export function isInRange(entry: TimeEntry, fromYMD: string, toYMD: string): boolean {
  return entry.date >= fromYMD && entry.date <= toYMD
}

export function isInProject(entry: TimeEntry, projectId: string): boolean {
  return entry.projectIds.includes(projectId)
}

export function isForPerson(entry: TimeEntry, personId: string): boolean {
  return entry.personIds.includes(personId)
}

// Somme les heures pour un sous-ensemble de time entries
export function sumHours(entries: TimeEntry[]): number {
  return entries.reduce((s, e) => s + (e.hours || 0), 0)
}

// Convertit des heures en jours (1 jour = 8h)
export function hoursToDays(hours: number): number {
  return hours / HOURS_PER_DAY
}

// Calcule le total planifié (en demi-jours) pour une personne sur un projet
// à partir des allocations Confirmed. Multi-projet split au prorata si effort < 100.
export function plannedHalfDaysForProject(allocations: Allocation[], personId: string, projectId: string): number {
  let halfDays = 0
  for (const a of allocations) {
    if (a.type !== 'Project') continue
    if (a.status !== 'Confirmed') continue
    if (!a.personIds.includes(personId)) continue
    if (!a.projectIds.includes(projectId)) continue

    // Compte les demi-jours ouvrés dans la plage [start, end]
    const start = new Date(a.startDate + 'T00:00:00')
    const end = new Date(a.endDate + 'T00:00:00')
    const cur = new Date(start)
    while (cur <= end) {
      const day = cur.getDay()
      if (day >= 1 && day <= 5) {
        const dateStr = cur.toISOString().slice(0, 10)
        const isStartDay = dateStr === a.startDate
        const isEndDay   = dateStr === a.endDate
        const morningCounts   = !isStartDay || a.startHalf === 'Morning'
        const afternoonCounts = !isEndDay   || a.endHalf   === 'Afternoon'
        if (morningCounts)   halfDays++
        if (afternoonCounts) halfDays++
      }
      cur.setDate(cur.getDate() + 1)
    }
  }
  // Pondère par effort (un alloc à 50% sur 4 demi-jours = 2 demi-jours équivalent plein temps)
  return halfDays
}

export function plannedHoursForProject(allocations: Allocation[], personId: string, projectId: string): number {
  // Somme pondérée par effort (en heures)
  let hours = 0
  for (const a of allocations) {
    if (a.type !== 'Project') continue
    if (a.status !== 'Confirmed') continue
    if (!a.personIds.includes(personId)) continue
    if (!a.projectIds.includes(projectId)) continue

    const start = new Date(a.startDate + 'T00:00:00')
    const end = new Date(a.endDate + 'T00:00:00')
    const cur = new Date(start)
    let halfDays = 0
    while (cur <= end) {
      const day = cur.getDay()
      if (day >= 1 && day <= 5) {
        const dateStr = cur.toISOString().slice(0, 10)
        const isStartDay = dateStr === a.startDate
        const isEndDay   = dateStr === a.endDate
        const morningCounts   = !isStartDay || a.startHalf === 'Morning'
        const afternoonCounts = !isEndDay   || a.endHalf   === 'Afternoon'
        if (morningCounts)   halfDays++
        if (afternoonCounts) halfDays++
      }
      cur.setDate(cur.getDate() + 1)
    }
    const effortRatio = (a.effortPct ?? 100) / 100
    hours += (halfDays / 2) * HOURS_PER_DAY * effortRatio
  }
  return hours
}

// Variance signal : positive = sous-livré (planifié > réalisé), negative = sur-livré
export function varianceSignal(plannedHours: number, actualHours: number): {
  ratio: number     // 0..∞ — 1 = pile, < 1 = sous-livraison, > 1 = sur-livraison
  delta: number     // actualHours - plannedHours (en heures)
  state: 'on-track' | 'under' | 'over' | 'no-plan' | 'no-actual'
} {
  if (plannedHours === 0 && actualHours === 0) {
    return { ratio: 0, delta: 0, state: 'no-plan' }
  }
  if (plannedHours === 0) {
    return { ratio: Infinity, delta: actualHours, state: 'over' }
  }
  if (actualHours === 0) {
    return { ratio: 0, delta: -plannedHours, state: 'no-actual' }
  }
  const ratio = actualHours / plannedHours
  const delta = actualHours - plannedHours
  if (ratio < 0.7)  return { ratio, delta, state: 'under' }
  if (ratio > 1.15) return { ratio, delta, state: 'over' }
  return { ratio, delta, state: 'on-track' }
}

// Formate des heures avec décimale (ex: 12.5h)
export function fmtHours(h: number): string {
  return `${h.toFixed(1)}h`
}
