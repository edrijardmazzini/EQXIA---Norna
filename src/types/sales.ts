export type Currency = 'MUR' | 'EUR' | 'USD' | 'GBP'

export type DealStatus =
  | 'Lead' | 'Qualified' | 'Scoping' | 'Proposal Sent'
  | 'Negotiation' | 'Verbal Commitment' | 'Won' | 'Active'
  | 'On Hold' | 'Completed' | 'Lost' | 'Cancelled'

export type DealType =
  | 'Workshop' | 'Audit' | 'Consulting' | 'Development'
  | 'Training' | 'Retainer' | 'Strategic Review' | 'Internal'

export type SourceLead =
  | 'Referral' | 'Inbound' | 'Outbound' | 'Événement' | 'Réseau perso' | 'Partenaire'

export interface Project {
  id: string
  name: string
  status: string
  type: string
  currency: string
  quotedAmount: number
  finalAmount: number
  winPercent: number
  winAuto: number
  health: string
  daysInCurrentStage: number
  sourceLead: string
  nextAction: string
  nextActionDate: string
  expectedCloseDate: string
  lostReason: string
  clientIds: string[]
  clientName: string
  ownerName: string
  ownerIds: string[]
  created: string
  startDate: string
  endDate: string
  dateQualified: string
  dateScoping: string
  dateProposalSent: string
  dateNegotiation: string
  dateVerbalCommitment: string
  dateClosed: string
  dateOnHold: string
  // Legacy compat
  decisionDate: string
  riskLevel: string
  budgetConfirmed: boolean
  internalChampion: string
  netAmount: number
}

export interface Client {
  id: string
  name: string
  health: string
  lifetimeValue: number
  satisfaction: string
  satisfactionScore: number
  sectors: string[]
  upXsellPotential: string
  upXsellScore: number
  relationshipOwner: string
  lastQualityReview: string
  lastTouchpointDate: string
  projectIds: string[]
  npsScore: number
  referralPotential: string
}

export interface Employee {
  id: string
  name: string
}

export interface SalesData {
  projects: Project[]
  clients: Client[]
  employees: Employee[]
}

export const PIPELINE_STATUSES = [
  'Lead', 'Qualified', 'Scoping', 'Proposal Sent',
  'Negotiation', 'Verbal Commitment',
] as const

export const CLOSED_WON = new Set(['Won', 'Active', 'Completed'])
export const CLOSED_LOST = new Set(['Lost', 'Cancelled'])

export const PIPELINE_COLS: { status: string; label: string; accent: string }[] = [
  { status: 'Lead', label: 'Lead', accent: '#6b7280' },
  { status: 'Qualified', label: 'Qualifié', accent: '#3b82f6' },
  { status: 'Scoping', label: 'Scoping', accent: '#8b5cf6' },
  { status: 'Proposal Sent', label: 'Proposition', accent: '#f59e0b' },
  { status: 'Negotiation', label: 'Négociation', accent: '#ef4444' },
  { status: 'Verbal Commitment', label: 'Verbal', accent: '#10b981' },
]

export const TYPE_COLORS: Record<string, string> = {
  Workshop: '#8b5cf6',
  Audit: '#f97316',
  Consulting: '#3b82f6',
  Development: '#06b6d4',
  Training: '#eab308',
  Retainer: '#4ade80',
  'Strategic Review': '#ec4899',
  Internal: '#6b7280',
}

export const STATUS_COLORS: Record<string, string> = {
  Lead: '#6b7280',
  Qualified: '#3b82f6',
  Scoping: '#8b5cf6',
  'Proposal Sent': '#f59e0b',
  Negotiation: '#ef4444',
  'Verbal Commitment': '#10b981',
  Won: '#4ade80',
  Active: '#4ade80',
  Completed: '#4ade80',
  Lost: '#f87171',
  Cancelled: '#f87171',
  'On Hold': '#9ca3af',
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  MUR: 'Rs ', EUR: '€', USD: '$', GBP: '£',
}

export function winFactor(deal: Project): number {
  const auto = deal.winAuto > 1 ? deal.winAuto / 100 : deal.winAuto
  if (auto > 0) return Math.min(1, Math.max(0, auto))
  const gut = deal.winPercent > 1 ? deal.winPercent / 100 : deal.winPercent
  return Math.min(1, Math.max(0, gut))
}

export function fmtCurrency(amount: number, currency = 'MUR'): string {
  const sym = CURRENCY_SYMBOLS[currency] || `${currency} `
  if (amount >= 1_000_000) return `${sym}${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `${sym}${(amount / 1_000).toFixed(0)}k`
  return `${sym}${Math.round(amount).toLocaleString()}`
}

export function fmtDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y.slice(2)}`
}
