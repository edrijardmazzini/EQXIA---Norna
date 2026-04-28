"use client"
import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { AppHeader } from "@/components/layout/AppHeader"
import { useTheme } from "@/hooks/useTheme"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, ScatterChart, Scatter, ZAxis, ReferenceLine, Legend, Line,
} from "recharts"
import {
  BarChart3, Telescope, Settings, TrendingUp, Percent, Wallet, Zap,
  CheckCircle2, AlertTriangle, XCircle, Monitor, Moon, Sun, BarChart2, LineChart,
  Database, AlertOctagon, AlertCircle, Users, DollarSign, RefreshCw,
  Briefcase, UserCheck, CalendarX, ShieldAlert, Info, ExternalLink,
} from "lucide-react"
import { EqxiaLoadingScreen } from "@/components/eqxia"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string; name: string; status: string; type: string; methodology: string
  currency: string; quotedAmount: number; quotedAmountIsEmpty?: boolean; finalAmount: number
  winPercent: number
  /** Formule Notion "% win (auto)" — fallback quand winPercent = 0. */
  winAuto?: number
  riskLevel: string; startDate: string; endDate: string
  rentabilite: number | null; netAmount: number | null; humanCost: number | null
  clientName: string; clientSatisfaction?: string
  clientIds?: string[]
  ownerIds?: string[]; ownerName?: string
  phase?: string
  teamMemberIds?: string[]; teamMemberNames?: string
  commissionPercent?: number; commissionTo?: string
  health?: string // "❌ Critical" | "⚠️ Warning" | "✅ OK" — calculé par la formule Notion
}

interface Client { id: string; name: string }

interface Employee {
  id: string; name: string; cje: number; startDate: string; endDate: string; role: string
  /** Pays Notion (Select : France / Maurice / Autre). Pilote la règle 13e mois Maurice. */
  country?: string
  /** Date Premier Salaire — date à partir de laquelle l'employé est rémunéré (YYYY-MM-DD).
   *  Vide ⇒ employé non comptabilisé dans les salaires. */
  dateFirstSalary?: string
}

interface Depense {
  id: string; description: string; date: string; fournisseur: string
  categorie: string; sousCategorie: string; montant: number
  montantMUR: number; devise: string; dossier: string; payePar: string
  recurringCritical?: boolean
  /** Notion Select : nom canonique de l'abonnement (Netflix, OVH, Notion Team, etc).
   *  Permet de dédupliquer les dépenses récurrentes par abonnement plutôt que par fournisseur. */
  abonnement?: string
  /** Notion Select : "Mensuel" | "Annuel". Détermine si le coût récurrent est appliqué × 1
   *  par mois (Mensuel) ou × 1/12 par mois (Annuel). */
  recurrence?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"]
function fmtDossier(c: string): string { if (c.length !== 4) return c; const mm = parseInt(c.slice(2), 10); return (mm >= 1 && mm <= 12) ? `${MONTHS[mm - 1]} 20${c.slice(0, 2)}` : c }

const BG_IMAGES = ['/assets/backgrounds/bg-ice-surface-light.jpg', '/assets/backgrounds/bg-sediment-blue-white.jpg', '/assets/backgrounds/bg-ink-teal-copper.jpg', '/assets/backgrounds/bg-glacial-river-teal.jpg', '/assets/backgrounds/bg-confluence-streams.jpg', '/assets/backgrounds/bg-glacial-teal-copper.jpg']

// ─── Colors ───────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = { "Frais de personnel": "#ef4444", "Locaux & immobilier": "#f97316", "Matériel & équipement": "#eab308", "Fournitures": "#22c55e", "Transport & déplacements": "#3b82f6", "Prestations externes": "#8b5cf6", "Marketing & communication": "#ec4899", "Assurances": "#a3674e", "Frais bancaires & financiers": "#6b7280", "Formation & développement": "#14b8a6", "Cloud & informatique": "#06b6d4", "Entretien & réparations": "#84cc16" }
const PIE_CAT = ["#A6C9CE", "#7BB3BE", "#5A9DAE", "#3D8899", "#1E7085", "#2196A8", "#4DB6C4", "#78D0DA", "#9FE0E8", "#C5EFF4"]
const PIE_TYPE = ["#A6C9CE", "#7EC8A4", "#5BBFA0", "#3BAF8A", "#28A07A", "#1A9070", "#4CB896", "#7AD4B2", "#A3E5CD", "#C8F0E0"]
const RISK_COLORS: Record<string, string> = { Low: "#22c55e", Medium: "#f97316", High: "#ef4444", Null: "#6b7280" }

const STATUS_OPTIONS = ["Won", "Won orally", "Active", "Completed", "Lost", "Cancelled", "Pending", "Proposal"]
const TYPE_OPTIONS = ["Consulting", "Training", "Internal", "Workshop", "Product", "Advisory"]
const METHODOLOGY_OPTIONS = ["Agile", "Waterfall", "Hybrid", "Ad-hoc"]
// Taux de conversion vers MUR — fallback statique (utilisé avant le fetch live)
const CURRENCY_RATES_FALLBACK: Record<string, number> = { MUR: 1, EUR: 49, USD: 46, GBP: 57, KES: 0.35, ZAR: 2.5 }
// Les taux sont injectés via le contexte React → toMUR lit depuis un global runtime
let __LIVE_RATES__: Record<string, number> = { ...CURRENCY_RATES_FALLBACK }
// Conversion en MUR. Si dateISO fourni ET un historique existe pour la devise,
// on utilise le taux historique à cette date (le plus proche ≤ dateISO).
// Sinon fallback sur le taux live (__LIVE_RATES__).
const toMUR = (amount: number, currency: string | undefined | null, dateISO?: string): number => {
  const cur = currency || "MUR"
  if (cur === "MUR") return amount || 0
  if (dateISO) {
    const histRate = rateAtDate(cur, dateISO)
    if (histRate) return (amount || 0) * histRate
  }
  const rate = __LIVE_RATES__[cur] ?? 1
  return (amount || 0) * rate
}

// ─── Settings dynamiques (pilotés par /reglages, persistés localStorage) ─────
type SettingsDateField = "endDate" | "startDate" | "decisionDate"
type SettingsWinPref = "gut-then-auto" | "auto-then-gut" | "gut-only" | "auto-only"

interface RuntimeSettings {
  dateField: SettingsDateField
  winPref: SettingsWinPref
  /** Champ utilisé pour récupérer le taux historique de conversion. */
  conversionDateField: SettingsDateField
}

let __SETTINGS__: RuntimeSettings = {
  dateField: "endDate",
  winPref: "gut-then-auto",
  conversionDateField: "endDate",
}

function applySettings(s: Partial<RuntimeSettings>): void {
  __SETTINGS__ = { ...__SETTINGS__, ...s }
}

function loadSettingsFromStorage(): RuntimeSettings {
  if (typeof window === "undefined") return __SETTINGS__
  try {
    const raw = window.localStorage.getItem("plutus-reglages-v1")
    if (!raw) return __SETTINGS__
    const parsed = JSON.parse(raw)
    return {
      dateField: parsed.dateField ?? "endDate",
      winPref: parsed.winPref ?? "gut-then-auto",
      conversionDateField: parsed.conversionDateField ?? "endDate",
    }
  } catch {
    return __SETTINGS__
  }
}

// Toggle UI win rate pour vues prévisionnelles (gut feeling par défaut)
let __WIN_UI__: 'gut' | 'auto' = 'gut'

// Taux par étape pipeline utilisés en mode "auto" quand winAuto n'est pas renseigné dans Notion
const STAGE_WIN_RATES: Record<string, number> = {
  Lead: 0.10, Qualified: 0.25, Scoping: 0.40,
  'Proposal Sent': 0.60, Negotiation: 0.70,
  'Verbal Commitment': 0.85, 'Won orally': 0.90,
  Won: 1.0, Active: 1.0, Completed: 1.0,
}

// ─── Taux historiques (chargés au mount, par /api/rates/history) ──────────────
// Format : { "EUR": [{ date: "2026-04-15", rate: 49.2 }, ...], ... }
// Trié ascendant par date côté API. Lookup binaire par scan linéaire.
type RateHistoryPoint = { date: string; rate: number }
let __HISTORY__: Record<string, RateHistoryPoint[]> = {}

function applyHistory(h: Record<string, RateHistoryPoint[]>): void {
  __HISTORY__ = h
}

/** Trouve le taux le plus proche (≤ dateISO) dans la série de la devise. */
function rateAtDate(currency: string, dateISO: string): number | null {
  const series = __HISTORY__[currency]
  if (!series || series.length === 0) return null
  let best: RateHistoryPoint | null = null
  for (const p of series) {
    if (p.date <= dateISO) best = p
    else break
  }
  if (!best) best = series[0] // dateISO antérieur à toute la série → on prend le plus ancien
  return best.rate > 0 ? best.rate : null
}

// Helpers : Win % et Commission % normalisés (0-1)
// La stratégie suit __SETTINGS__.winPref (modifiable depuis /reglages).
function normalizeWin(value: number | undefined | null): number {
  const v = Number(value || 0)
  if (v <= 0) return 0
  return Math.min(1, v > 1 ? v / 100 : v)
}
function getWinRate(p: Project): number {
  const gut = normalizeWin(p.winPercent)
  const auto = normalizeWin(p.winAuto)
  if (__WIN_UI__ === 'auto') {
    // Formule Notion en priorité, sinon taux par étape pipeline
    return auto > 0 ? auto : (STAGE_WIN_RATES[p.status] ?? 0)
  }
  return gut
}
function getCommissionRate(p: Project): number {
  const c = Number(p.commissionPercent || 0)
  if (c <= 0) return 0
  return c > 1 ? c / 100 : c
}

// ─── Calcul UNIQUE du revenu d'un projet (centralisé) ─────────────────
//
// Sépare en deux catégories selon endDate :
//   "actual"   → endDate ≤ mois courant   (revenu réalisé / passé)
//   "forecast" → endDate > mois courant   (revenu prévisionnel)
//
// Cas particulier — endDate absente ou invalide :
//   Si quotedAmount × winRate > 0 → traité comme un forecast en attente
//   d'avoir une endDate précise. Le dossier est défaulté à mois courant
//   + FORECAST_FALLBACK_MONTHS. isDatePlaceholder=true permet à l'UI de
//   signaler ce placeholder.
//   Si quotedAmount × winRate ≤ 0 → null (aucun revenu calculable).
//
// Montants — règle DIFFÉRENTE selon kind :
//   ACTUAL  : CA = finalAmount si > 0, sinon quotedAmount        (pas de pondération)
//   FORECAST: CA = finalAmount si > 0, sinon quotedAmount × winRate
//             où winRate = winPercent (gut feeling) || winAuto (formule Notion)
//   Commission = CA × commissionRate (si bénéficiaire défini & taux > 0, sinon 0)
//   Net        = CA − Commission
//
// Le forecast est pondéré par la proba de gain — l'actual reste brut.

const FORECAST_FALLBACK_MONTHS = 3

function hasRealCommission(p: Project): boolean {
  const beneficiaire = (p.commissionTo || "").trim()
  return !!beneficiaire && getCommissionRate(p) > 0
}

type RevenueKind = "actual" | "forecast"

interface ProjectRevenue {
  kind: RevenueKind
  /** CA brut dans la devise du projet (avant commission). */
  caRaw: number
  /** Montant commission dans la devise du projet (0 si pas de commission réelle). */
  commissionRaw: number
  /** Revenu net dans la devise du projet (= caRaw − commissionRaw). */
  netRaw: number
  /** Conversion MUR du CA brut. */
  caMUR: number
  /** Conversion MUR de la commission. */
  commissionMUR: number
  /** Conversion MUR du revenu net. */
  netMUR: number
  /** Code dossier YYMM associé (vrai endDate, ou current+3 si placeholder). */
  dossier: string
  /** True si dossier a été dérivé d'un fallback (endDate absente). */
  isDatePlaceholder: boolean
}

function dossierCode(year: number, month1to12: number): string {
  return `${String(year).slice(-2)}${String(month1to12).padStart(2, "0")}`
}

function computeProjectRevenue(p: Project, now: Date = new Date()): ProjectRevenue | null {
  // Projet Lost / Cancelled → ne génère aucun revenu (ni actuel ni forecast)
  if (p.status === "Lost" || p.status === "Cancelled") return null
  const todayCode = dossierCode(now.getFullYear(), now.getMonth() + 1)
  const winRate = getWinRate(p)
  const quoted = p.quotedAmount || 0
  const final = p.finalAmount || 0

  // Date de référence : pilotée par __SETTINGS__.dateField (modifiable via /reglages)
  // Fallback sur endDate si le champ choisi est vide pour ce projet.
  const projectAny = p as Project & { decisionDate?: string }
  const dateValue =
    (__SETTINGS__.dateField === "startDate" ? p.startDate : null) ??
    (__SETTINGS__.dateField === "decisionDate" ? projectAny.decisionDate : null) ??
    p.endDate ??
    ""

  let dossier: string
  let kind: RevenueKind
  let isDatePlaceholder = false

  // 1) Date de référence présente et valide → split actual/forecast
  if (dateValue) {
    const d = new Date(dateValue)
    if (!isNaN(d.getTime())) {
      dossier = dossierCode(d.getFullYear(), d.getMonth() + 1)
      kind = dossier <= todayCode ? "actual" : "forecast"
    } else {
      // date invalide → cas placeholder ci-dessous
      dossier = ""
      kind = "forecast"
    }
  } else {
    dossier = ""
    kind = "forecast"
  }

  // 2) Pas de dossier réel → c'est un forecast en attente d'endDate.
  //    Critère de détection : quoted × winRate > 0 (revenu prévisionnel attendu).
  if (!dossier) {
    if (quoted <= 0 || winRate <= 0) return null
    const future = new Date(now.getFullYear(), now.getMonth() + FORECAST_FALLBACK_MONTHS, 1)
    dossier = dossierCode(future.getFullYear(), future.getMonth() + 1)
    isDatePlaceholder = true
  }

  // 3) Calcul des montants — winRate appliqué uniquement aux forecasts sans finalAmount
  const caRaw = final > 0
    ? final
    : (kind === "actual" ? quoted : quoted * winRate)
  if (caRaw <= 0) return null
  const commissionRaw = hasRealCommission(p) ? caRaw * getCommissionRate(p) : 0
  const netRaw = caRaw - commissionRaw

  // Date utilisée pour le taux de conversion historique (cf __SETTINGS__.conversionDateField).
  // Fallback sur endDate si le champ choisi est vide pour ce projet.
  const conversionDate =
    (__SETTINGS__.conversionDateField === "startDate" ? p.startDate : null) ||
    (__SETTINGS__.conversionDateField === "decisionDate" ? projectAny.decisionDate : null) ||
    p.endDate ||
    ""

  return {
    kind,
    caRaw, commissionRaw, netRaw,
    caMUR: toMUR(caRaw, p.currency, conversionDate),
    commissionMUR: toMUR(commissionRaw, p.currency, conversionDate),
    netMUR: toMUR(netRaw, p.currency, conversionDate),
    dossier,
    isDatePlaceholder,
  }
}

// ─── Helpers backward-compat (délèguent à computeProjectRevenue) ──────────
const getRevenueRaw    = (p: Project): number => computeProjectRevenue(p)?.netRaw        ?? 0
const getCARaw         = (p: Project): number => computeProjectRevenue(p)?.caRaw         ?? 0
const getCommissionRaw = (p: Project): number => computeProjectRevenue(p)?.commissionRaw ?? 0
const getRevenueMUR    = (p: Project): number => computeProjectRevenue(p)?.netMUR        ?? 0
const getCAMUR         = (p: Project): number => computeProjectRevenue(p)?.caMUR         ?? 0
const getCommissionMUR = (p: Project): number => computeProjectRevenue(p)?.commissionMUR ?? 0

/**
 * Code dossier YYMM associé au revenu du projet.
 * Vraie endDate si présente, sinon current+FORECAST_FALLBACK_MONTHS pour les forecasts sans date.
 * Retourne "" si le projet n'a aucun revenu calculable.
 */
function getProjectDossier(p: Project, now: Date = new Date()): string {
  return computeProjectRevenue(p, now)?.dossier ?? ""
}

/**
 * @deprecated — utiliser getProjectDossier(p) ou computeProjectRevenue(p).dossier directement.
 * Conservé pour rétrocompat des call-sites qui veulent une chaîne ISO.
 */
function getRevenueDateISO(p: Project): string {
  return p.endDate || p.startDate || ""
}

// Année fiscale : juillet → juin
// Ex: 2026-04-20 → FY 2025-2026 (juillet 2025 à juin 2026)
function getFiscalYear(d: Date): { start: Date; end: Date; label: string } {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const fyStartYear = m >= 7 ? y : y - 1
  const start = new Date(fyStartYear, 6, 1) // 1er juillet
  const end = new Date(fyStartYear + 1, 5, 30) // 30 juin suivant
  return { start, end, label: `${fyStartYear}-${fyStartYear + 1}` }
}
// Retourne true si le code YYMM est dans l'année fiscale donnée
function dossierInFiscalYear(code: string, fyStartYear: number): boolean {
  if (!code || code.length !== 4) return false
  const y = 2000 + parseInt(code.slice(0, 2), 10)
  const m = parseInt(code.slice(2), 10)
  // FY = juillet YYYY → juin YYYY+1
  if (y === fyStartYear && m >= 7) return true
  if (y === fyStartYear + 1 && m <= 6) return true
  return false
}
// Début/fin du trimestre fiscal courant (Q1 = jul-sep, Q2 = oct-dec, Q3 = jan-mar, Q4 = apr-jun)
function getFiscalQuarter(d: Date): { q: number; startCode: string; endCode: string; label: string } {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  let q: number, qStartM: number, qStartY: number
  if (m >= 7 && m <= 9) { q = 1; qStartM = 7; qStartY = y }
  else if (m >= 10 && m <= 12) { q = 2; qStartM = 10; qStartY = y }
  else if (m >= 1 && m <= 3) { q = 3; qStartM = 1; qStartY = y }
  else { q = 4; qStartM = 4; qStartY = y }
  const startCode = `${String(qStartY).slice(2)}${String(qStartM).padStart(2, "0")}`
  const endM = qStartM + 2
  const endCode = `${String(qStartY).slice(2)}${String(endM).padStart(2, "0")}`
  // FY au format court : "2025-26"
  const { start: fyStart } = getFiscalYear(d)
  const fyStartYear = fyStart.getFullYear()
  const shortFy = `${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`
  return { q, startCode, endCode, label: `Q${q} FY ${shortFy}` }
}

const CURRENCY_OPTIONS = ["MUR", "EUR", "USD", "GBP"]
const RISK_OPTIONS = ["Low", "Medium", "High"]
const SATISFACTION_OPTIONS = ["Very Satisfied", "Satisfied", "Neutral", "Unsatisfied"]
const CATEGORIE_OPTIONS = Object.keys(CAT_COLORS)
const DEVISE_OPTIONS = ["MUR", "EUR", "USD", "GBP"]

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const { mode, setTheme } = useTheme()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [themeOpen, setThemeOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"dashboard" | "previsionnel">("dashboard")
  const [bgImage, setBgImage] = useState(BG_IMAGES[0])
  const [timeRange, setTimeRange] = useState<"all" | "12m" | "6m" | "3m">("all")
  // Hero chart mode : Past (historique), Future (projection), Custom (plage libre)
  const [heroMode, setHeroMode] = useState<"past" | "future" | "custom">("past")
  const [heroPast, setHeroPast] = useState<"all" | "12m" | "6m" | "3m">("all")
  const [heroFuture, setHeroFuture] = useState<"12m" | "6m" | "3m">("12m")
  const [heroCustomStart, setHeroCustomStart] = useState<string>("") // format YYYY-MM
  const [heroCustomEnd, setHeroCustomEnd] = useState<string>("")
  const [kpiPeriod, setKpiPeriod] = useState<"all" | "year" | "quarter" | "month">("year")
  const depPeriod = kpiPeriod
  const revPeriod = kpiPeriod
  const [revMode, setRevMode] = useState<"total" | "types">("total")
  const [revKpiMode, setRevKpiMode] = useState<"rev" | "ca">("rev")
  const [rentaMode, setRentaMode] = useState<"projects" | "types">("projects")
  const [chargesMode, setChargesMode] = useState<"all" | "depenses" | "salaires">("all")
  // Toggles Past/Future/Custom pour chart Revenus mensuels
  const [revViewMode, setRevViewMode] = useState<"past" | "future" | "custom">("past")
  const [revViewPast, setRevViewPast] = useState<"all" | "12m" | "6m" | "3m">("all")
  const [revViewFuture, setRevViewFuture] = useState<"12m" | "6m" | "3m">("3m")
  const [revViewCustomStart, setRevViewCustomStart] = useState<string>("")
  const [revViewCustomEnd, setRevViewCustomEnd] = useState<string>("")
  // Toggles Past/Future/Custom pour chart Charges mensuelles
  // Win rate toggle pour vues prévisionnelles (gut feeling par défaut)
  const [forecastWinMode, setForecastWinModeRaw] = useState<'gut' | 'auto'>('gut')
  const setForecastWinMode = (m: 'gut' | 'auto') => {
    __WIN_UI__ = m
    setForecastWinModeRaw(m)
    setProjects(prev => [...prev])
  }

  const [depViewMode, setDepViewMode] = useState<"past" | "future" | "custom">("past")
  const [depViewPast, setDepViewPast] = useState<"all" | "12m" | "6m" | "3m">("all")
  const [depViewFuture, setDepViewFuture] = useState<"12m" | "6m" | "3m">("3m")
  const [depViewCustomStart, setDepViewCustomStart] = useState<string>("")
  const [depViewCustomEnd, setDepViewCustomEnd] = useState<string>("")
  // Toggles pour le bloc Cash & PNL
  const [cashViewMode, setCashViewMode] = useState<"past" | "future" | "custom">("past")
  const [cashViewPast, setCashViewPast] = useState<"all" | "12m" | "6m" | "3m">("all")
  const [cashViewFuture, setCashViewFuture] = useState<"12m" | "6m" | "3m">("3m")
  const [cashViewCustomStart, setCashViewCustomStart] = useState<string>("")
  const [cashViewCustomEnd, setCashViewCustomEnd] = useState<string>("")
  const [topMode, setTopMode] = useState<"clients" | "fournisseurs">("clients")
  const [tableMode, setTableMode] = useState<"ventes" | "depenses">("ventes")

  // Modal states
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [editProjectMissing, setEditProjectMissing] = useState<string[] | undefined>(undefined)
  const [commissionnaireDetail, setCommissionnaireDetail] = useState<string | null>(null)
  const [editDepense, setEditDepense] = useState<Depense | null>(null)
  const [showAddVente, setShowAddVente] = useState(false)
  const [saving, setSaving] = useState(false)
  // Hover states pour les charts mensuels
  const [hoverRevMois, setHoverRevMois] = useState<string | null>(null)
  const [hoverDepMois, setHoverDepMois] = useState<string | null>(null)
  const hoverRevRef = useRef<string | null>(null)
  const hoverDepRef = useRef<string | null>(null)
  const revChartRef = useRef<HTMLDivElement | null>(null)
  const depChartRef = useRef<HTMLDivElement | null>(null)
  // Filtres de mois pour listes fullscreen ("" = tous les mois)
  const [revFsFilterMois, setRevFsFilterMois] = useState<string>("")
  const [depFsFilterMois, setDepFsFilterMois] = useState<string>("")
  const [topDetailItem, setTopDetailItem] = useState<{ mode: "clients" | "fournisseurs"; name: string } | null>(null)

  const currentRevMois = hoverRevMois
  const currentDepMois = hoverDepMois

  // Filter states
  const [venteFilters, setVenteFilters] = useState<Record<string, string>>({})
  const [depenseFilters, setDepenseFilters] = useState<Record<string, string>>({})

  useEffect(() => { setBgImage(BG_IMAGES[Math.floor(Math.random() * BG_IMAGES.length)]) }, [])

  const fetchData = useCallback(() => {
    fetch("/api/dashboard").then(r => r.json()).then(data => {
      if (data.error) throw new Error(data.error)
      setProjects(data.projects || []); setDepenses(data.depenses || []); setEmployees(data.employees || []); setClients(data.clients || [])
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Synchronise les settings runtime (/reglages) avec le module-level __SETTINGS__.
  // Re-lecture au mount + sur événement 'storage' (autres onglets).
  // Force un re-render des memos finance via setProjects(prev => [...prev]).
  const [, forceFinanceRecompute] = useState(0)
  useEffect(() => {
    const sync = () => {
      applySettings(loadSettingsFromStorage())
      forceFinanceRecompute(n => n + 1)
      setProjects(prev => [...prev])
      setDepenses(prev => [...prev])
    }
    sync()
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [])

  // Précharge l'historique des taux pour les 5 devises étrangères (1 an).
  // Utilisé par toMUR() pour convertir chaque projet à son taux à la date du
  // champ conversionDateField (paramétrable depuis /reglages).
  // Cache /api/rates/history côté serveur (1h) — les hits suivants sont gratuits.
  useEffect(() => {
    const currencies = ["EUR", "USD", "GBP", "KES", "ZAR"] as const
    let cancelled = false
    Promise.all(
      currencies.map(c =>
        fetch(`/api/rates/history?currency=${c}&days=365`)
          .then(r => r.json())
          .then((d: { points?: RateHistoryPoint[] }) => ({ c, points: d.points ?? [] }))
          .catch(() => ({ c, points: [] as RateHistoryPoint[] }))
      ),
    ).then(entries => {
      if (cancelled) return
      const map: Record<string, RateHistoryPoint[]> = {}
      for (const e of entries) map[e.c] = e.points
      applyHistory(map)
      // Force recompute des memos finance — caMUR/netMUR/commissionMUR utilisent maintenant les rates historiques
      forceFinanceRecompute(n => n + 1)
      setProjects(prev => [...prev])
    })
    return () => { cancelled = true }
  }, [])

  // Fetch taux de conversion live → MUR (EUR, USD, GBP, KES, ZAR)
  const [rates, setRates] = useState<Record<string, number>>(CURRENCY_RATES_FALLBACK)
  const [ratesUpdated, setRatesUpdated] = useState<string>("")
  useEffect(() => {
    fetch("/api/rates").then(r => r.json()).then(data => {
      if (data?.rates) {
        setRates(data.rates)
        __LIVE_RATES__ = data.rates // injection globale pour toMUR()
        setRatesUpdated(data.updated || "")
        // Force recomputation des memos qui utilisent toMUR (projects / depenses déjà chargés avec fallback)
        setProjects(prev => [...prev])
        setDepenses(prev => [...prev])
      }
    }).catch(() => {})
  }, [])

  // ─── Computed ───────────────────────────────────────────────────────────────

  const now = new Date()
  const currentDossier = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`
  // Année fiscale (juillet → juin)
  const fy = useMemo(() => getFiscalYear(now), [now.getFullYear(), now.getMonth()])
  const fyStartYear = fy.start.getFullYear() // ex: 2025 pour FY 2025-2026
  // Trimestre fiscal
  const fq = useMemo(() => getFiscalQuarter(now), [now.getFullYear(), now.getMonth()])

  // Helper: dossier-YYMM depuis une date startDate (string ISO)
  const dossierFromDate = (iso: string): string => {
    if (!iso) return ""
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ""
    return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`
  }

  const depFiltered = useMemo(() => {
    if (depPeriod === "all") return depenses
    if (depPeriod === "month") return depenses.filter(d => d.dossier === currentDossier)
    if (depPeriod === "quarter") return depenses.filter(d => d.dossier >= fq.startCode && d.dossier <= fq.endCode)
    // year = année fiscale
    return depenses.filter(d => dossierInFiscalYear(d.dossier, fyStartYear))
  }, [depenses, depPeriod, currentDossier, fq, fyStartYear])

  // Les KPIs en haut concernent UNIQUEMENT les revenus actuels (kind === "actual",
  // c-a-d projets dont la date de référence ≤ mois courant). Les forecasts ne sont
  // pas dans ces KPIs.
  const revFilteredProjects = useMemo(() => {
    const actualProjects = projects.filter(p => {
      const r = computeProjectRevenue(p)
      return r?.kind === "actual"
    })
    if (revPeriod === "all") return actualProjects
    if (revPeriod === "month") return actualProjects.filter(p => dossierFromDate(getRevenueDateISO(p)) === currentDossier)
    if (revPeriod === "quarter") return actualProjects.filter(p => { const k = dossierFromDate(getRevenueDateISO(p)); return k >= fq.startCode && k <= fq.endCode })
    return actualProjects.filter(p => dossierInFiscalYear(dossierFromDate(getRevenueDateISO(p)), fyStartYear))
  }, [projects, revPeriod, currentDossier, fq, fyStartYear])

  const depTotal = useMemo(() => depFiltered.reduce((s, d) => s + d.montantMUR, 0), [depFiltered])
  const depTotalAll = useMemo(() => depenses.reduce((s, d) => s + d.montantMUR, 0), [depenses])
  const revTotalAll = useMemo(() => {
    return projects.filter(p => computeProjectRevenue(p)?.kind === "actual").reduce((s, p) => s + getRevenueMUR(p), 0)
  }, [projects])
  const revTotal = useMemo(() => revFilteredProjects.reduce((s, p) => s + getRevenueMUR(p), 0), [revFilteredProjects])
  const caTotal = useMemo(() => revFilteredProjects.reduce((s, p) => s + getCAMUR(p), 0), [revFilteredProjects])
  const totalProfit = revTotal - depTotal
  const avgMargin = revTotal > 0 ? ((totalProfit / revTotal) * 100) : 0
  const projetsActifs = useMemo(() => projects.filter(p => p.status === "Active").length, [projects])
  const projetsTotal = useMemo(() => projects.filter(p => !["Lost", "Cancelled"].includes(p.status)).length, [projects])
  // Label court "A. fiscale 2025-26"
  const shortFyLabel = `A. fiscale ${fy.label.slice(0, 4)}-${fy.label.slice(-2)}`
  const periodLabel = (p: "all" | "year" | "quarter" | "month") =>
    p === "all" ? "Depuis toujours"
    : p === "year" ? shortFyLabel
    : p === "quarter" ? fq.label
    : fmtDossier(currentDossier)
  const depPeriodLabel = periodLabel(depPeriod)
  const revPeriodLabel = periodLabel(revPeriod)

  // ─── Salaires per-employee per-mois ─────────────────────────────────────────
  //
  // Règles :
  //   - Pas de "Date Premier Salaire" → employé ignoré (cas data quality).
  //   - Mois < dossier(dateFirstSalary) → 0 (pas encore actif).
  //   - Mois > dossier(endDate) → 0 (parti).
  //   - role === "Intern" / "Stagiaire" → 0 (coût passé via dépenses factures).
  //   - Pays Maurice → 13e mois en décembre (×2 sur le mois "12").
  //   - Coût mensuel = CJE × 220/12 (220 jours ouvrés/an).
  const SALAIRE_DAYS_PER_YEAR = 220
  const dossierFromDateLocal = (iso: string): string => {
    if (!iso) return ""
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ""
    return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`
  }
  const salaireForMonth = useCallback((yymm: string): number => {
    if (!yymm || yymm.length !== 4) return 0
    const is13thMonth = yymm.endsWith("12")
    return employees.reduce((sum, e) => {
      // Stagiaires exclus
      if (e.role === "Intern" || e.role === "Stagiaire") return sum
      // Sans Date Premier Salaire → pas comptabilisé
      if (!e.dateFirstSalary) return sum
      const startCode = dossierFromDateLocal(e.dateFirstSalary)
      if (!startCode) return sum
      if (yymm < startCode) return sum
      // Sortie passée
      if (e.endDate) {
        const endCode = dossierFromDateLocal(e.endDate)
        if (endCode && yymm > endCode) return sum
      }
      const base = (e.cje || 0) * SALAIRE_DAYS_PER_YEAR / 12
      const bonus = is13thMonth && e.country === "Maurice" ? base : 0
      return sum + base + bonus
    }, 0)
  }, [employees])

  // Salaire "headline" du mois courant — préservé pour PrevisionnelView et displays.
  const salaireMensuel = useMemo(() => salaireForMonth(currentDossier), [salaireForMonth, currentDossier])

  // ─── Dépenses récurrentes critiques (mensuel) ───────────────────────────────
  //
  // Dédup par (priorité abonnement, fallback fournisseur+description+catégorie).
  // Recurrence "Annuel" → coût ÷ 12 par mois ; "Mensuel" ou vide → ×1.
  // On prend la valeur la plus récente par clé canonique.
  const recurringCriticalMensuel = useMemo(() => {
    interface RcEntry { key: string; date: string; monthlyMUR: number }
    const uniq: Record<string, RcEntry> = {}
    depenses.filter(d => d.recurringCritical).forEach(d => {
      const canonicalKey = (d.abonnement && d.abonnement.trim())
        || [d.fournisseur || "", d.description || "", d.categorie || ""].map(s => s.trim().toLowerCase()).join("|")
      const factor = (d.recurrence === "Annuel") ? (1 / 12) : 1
      const monthlyMUR = (d.montantMUR || 0) * factor
      const cur = uniq[canonicalKey]
      if (!cur || (d.date || "") > cur.date) {
        uniq[canonicalKey] = { key: canonicalKey, date: d.date || "", monthlyMUR }
      }
    })
    return Object.values(uniq).reduce((s, v) => s + v.monthlyMUR, 0)
  }, [depenses])

  // ─── Codes mois salariés et totaux par période ──────────────────────────────
  const codesForSalaryPeriod = useCallback((period: "all" | "year" | "quarter" | "month"): string[] => {
    const curCode = currentDossier
    if (period === "month") return [curCode]
    const codes: string[] = []
    const pushRange = (fromY: number, fromM: number, toY: number, toM: number) => {
      let y = fromY, m = fromM
      while (y < toY || (y === toY && m <= toM)) {
        codes.push(`${String(y).padStart(2, "0")}${String(m).padStart(2, "0")}`)
        m++; if (m > 12) { m = 1; y++ }
      }
    }
    if (period === "all") {
      // Le plus ancien code possible — on filtrera par dateFirstSalary employé.
      pushRange(20, 1, parseInt(curCode.slice(0, 2), 10), parseInt(curCode.slice(2), 10))
    } else if (period === "year") {
      const fyStartYY = fyStartYear % 100
      pushRange(fyStartYY, 7, fyStartYY + 1, 6)
    } else if (period === "quarter") {
      const fromY = parseInt(fq.startCode.slice(0, 2), 10)
      const fromM = parseInt(fq.startCode.slice(2), 10)
      const toY = parseInt(fq.endCode.slice(0, 2), 10)
      const toM = parseInt(fq.endCode.slice(2), 10)
      pushRange(fromY, fromM, toY, toM)
    }
    return codes.filter(c => c <= curCode)
  }, [currentDossier, fyStartYear, fq])

  // Backward-compat : nombre de mois salariés (utilisé ailleurs)
  const computeSalariedMonths = useCallback((period: "all" | "year" | "quarter" | "month"): number =>
    codesForSalaryPeriod(period).length,
  [codesForSalaryPeriod])

  // Total salaire pour une période — somme par-mois (respecte les règles per-employee)
  const salaireTotalForPeriod = useCallback((period: "all" | "year" | "quarter" | "month"): number =>
    codesForSalaryPeriod(period).reduce((s, c) => s + salaireForMonth(c), 0),
  [codesForSalaryPeriod, salaireForMonth])

  const salairesForDepPeriod = useMemo(() => salaireTotalForPeriod(depPeriod), [salaireTotalForPeriod, depPeriod])
  const salairesForRevPeriod = useMemo(() => salaireTotalForPeriod(revPeriod), [salaireTotalForPeriod, revPeriod])
  const chargesTotal = depTotal + salairesForDepPeriod
  const avgMarginWithSalaries = revTotal > 0 ? ((revTotal - chargesTotal) / revTotal) * 100 : 0

  // Helper factorisé : construit la liste de codes de mois selon le mode (Past/Future/Custom)
  const buildMonthCodes = useCallback((
    mode: "past" | "future" | "custom",
    past: "all" | "12m" | "6m" | "3m",
    future: "12m" | "6m" | "3m",
    customStart: string,
    customEnd: string,
    existingMonths: string[],
  ): string[] => {
    const curY = parseInt(currentDossier.slice(0, 2), 10)
    const curM = parseInt(currentDossier.slice(2), 10)
    const addRange = (fromY: number, fromM: number, toY: number, toM: number): string[] => {
      const out: string[] = []
      let y = fromY, m = fromM
      while (y < toY || (y === toY && m <= toM)) {
        out.push(`${String(y).padStart(2, "0")}${String(m).padStart(2, "0")}`)
        m++; if (m > 12) { m = 1; y++ }
      }
      return out
    }
    if (mode === "past") {
      let sorted = [...new Set(existingMonths)].sort().filter(c => c <= currentDossier)
      if (past !== "all") {
        const n = past === "12m" ? 12 : past === "6m" ? 6 : 3
        sorted = sorted.slice(-n)
      }
      if (sorted.length < 2) return sorted
      const y1 = parseInt(sorted[0].slice(0, 2), 10), m1 = parseInt(sorted[0].slice(2), 10)
      const y2 = parseInt(sorted[sorted.length - 1].slice(0, 2), 10), m2 = parseInt(sorted[sorted.length - 1].slice(2), 10)
      return addRange(y1, m1, y2, m2)
    }
    if (mode === "future") {
      const n = future === "12m" ? 12 : future === "6m" ? 6 : 3
      let toY = curY, toM = curM + n
      while (toM > 12) { toM -= 12; toY += 1 }
      return addRange(curY, curM, toY, toM)
    }
    // custom
    const parse = (s: string): [number, number] | null => {
      if (!s || s.length < 7) return null
      const [y, m] = s.split("-")
      return [parseInt(y, 10) % 100, parseInt(m, 10)]
    }
    const s = parse(customStart), e = parse(customEnd)
    if (s && e) return addRange(s[0], s[1], e[0], e[1])
    const fyY = fyStartYear % 100
    return addRange(fyY, 7, fyY + 1, 6)
  }, [currentDossier, fyStartYear])

  // Charts data — inclut salaires (colonne "Salaires") pour stacker comme la chart principale
  // Accepte les modes Past/Future/Custom via depView*
  const depParMois = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    depenses.forEach(d => { if (!d.dossier) return; if (!m[d.dossier]) m[d.dossier] = {}; m[d.dossier][d.categorie] = (m[d.dossier][d.categorie] || 0) + d.montantMUR })
    const existing = Object.keys(m)
    const codes = buildMonthCodes(depViewMode, depViewPast, depViewFuture, depViewCustomStart, depViewCustomEnd, existing)
    return codes.map(dossier => {
      const isFuture = dossier > currentDossier
      const cats = m[dossier] || {}
      if (isFuture) {
        return {
          dossier,
          label: fmtDossier(dossier),
          Salaires: salaireForMonth(dossier),
          "Récurrent critique": recurringCriticalMensuel,
          isFuture: true,
        }
      }
      return {
        dossier,
        label: fmtDossier(dossier),
        Salaires: salaireForMonth(dossier),
        isFuture: false,
        ...cats,
      }
    })
  }, [depenses, salaireMensuel, recurringCriticalMensuel, depViewMode, depViewPast, depViewFuture, depViewCustomStart, depViewCustomEnd, currentDossier, buildMonthCodes])
  // Ordonné selon l'importance (même ordre que le pie "Dépenses par catégorie")
  const allCats = useMemo(() => {
    const m: Record<string, number> = {}
    depenses.forEach(d => { if (d.categorie) m[d.categorie] = (m[d.categorie] || 0) + d.montantMUR })
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name]) => name)
  }, [depenses])

  // Sync avec la range du chart "Charges mensuelles" (depView)
  // En passé → somme réels dans la plage. En futur → somme projetées (recurring critical × nb mois).
  // En mélange (ex: custom couvrant past + future) → somme des deux avec détail.
  const depParCat = useMemo(() => {
    const m: Record<string, number> = {}
    let projectedAmount = 0
    let monthsPast = 0, monthsFuture = 0
    const existing = [...new Set(depenses.map(d => d.dossier).filter(Boolean))]
    const codes = buildMonthCodes(depViewMode, depViewPast, depViewFuture, depViewCustomStart, depViewCustomEnd, existing)
    for (const code of codes) {
      if (code > currentDossier) {
        // Futur : on injecte les dépenses récurrentes critiques comme une pseudo-catégorie "Récurrent critique"
        monthsFuture++
        projectedAmount += recurringCriticalMensuel
      } else {
        monthsPast++
        depenses.filter(d => d.dossier === code).forEach(d => {
          if (d.categorie) m[d.categorie] = (m[d.categorie] || 0) + d.montantMUR
        })
      }
    }
    const out = Object.entries(m).map(([name, value]) => ({ name, value, projected: 0 }))
    if (projectedAmount > 0) {
      out.push({ name: "Récurrent critique (projeté)", value: projectedAmount, projected: 1 })
    }
    return out.sort((a, b) => b.value - a.value)
  }, [depenses, depViewMode, depViewPast, depViewFuture, depViewCustomStart, depViewCustomEnd, currentDossier, recurringCriticalMensuel, buildMonthCodes])
  // Méta : indique si la plage couvre du futur, pour afficher une note dans le pie
  const depParCatMeta = useMemo(() => {
    const existing = [...new Set(depenses.map(d => d.dossier).filter(Boolean))]
    const codes = buildMonthCodes(depViewMode, depViewPast, depViewFuture, depViewCustomStart, depViewCustomEnd, existing)
    const nbFuture = codes.filter(c => c > currentDossier).length
    const nbPast = codes.filter(c => c <= currentDossier).length
    return { nbFuture, nbPast, total: codes.length }
  }, [depenses, depViewMode, depViewPast, depViewFuture, depViewCustomStart, depViewCustomEnd, currentDossier, buildMonthCodes])

  // Couleur par catégorie — mapping stable basé sur le pie "Dépenses par catégorie"
  // Tons de bleu/teal (PIE_CAT), dans l'ordre décroissant des montants
  const depCategoryColors = useMemo(() => {
    const m: Record<string, string> = {}
    depParCat.forEach((d, i) => { m[d.name] = PIE_CAT[i % PIE_CAT.length] })
    return m
  }, [depParCat])

  // Plage de mois Revenus mensuels (Total + Par types) — dépend du revView*
  // Utilise computeProjectRevenue : projets sans endDate apparaissent à current+3.
  const revChartRange = useMemo(() => {
    const revMap: Record<string, number> = {}
    projects.forEach(p => {
      const r = computeProjectRevenue(p)
      if (!r) return
      revMap[r.dossier] = (revMap[r.dossier] || 0) + r.netMUR
    })
    const depMap: Record<string, number> = {}
    depenses.forEach(d => { if (d.dossier) depMap[d.dossier] = (depMap[d.dossier] || 0) + d.montantMUR })
    const existing = [...new Set([...Object.keys(revMap), ...Object.keys(depMap)])]
    const filled = buildMonthCodes(revViewMode, revViewPast, revViewFuture, revViewCustomStart, revViewCustomEnd, existing)
    return { filled, revMap, depMap }
  }, [projects, depenses, revViewMode, revViewPast, revViewFuture, revViewCustomStart, revViewCustomEnd, buildMonthCodes])

  const revParMois = useMemo(() => {
    const { filled, revMap, depMap } = revChartRange
    return filled.map(k => {
      const isFuture = k > currentDossier
      const inPast = k <= currentDossier
      const inFuture = k >= currentDossier
      const rev = revMap[k] || 0
      return {
        mois: k,
        label: fmtDossier(k),
        isFuture,
        revenus: rev,
        depenses: depMap[k] || 0,
        // Split past/future pour rendu traits pleins/pointillés
        revenusPast: inPast ? rev : null,
        revenusFuture: inFuture ? rev : null,
      }
    })
  }, [revChartRange, currentDossier])

  // Revenus par mois ventilés par type de projet (hors Internal pour cohérence)
  // Couvre tous les mois de la série (revenus + dépenses) pour que l'axe soit continu
  const revParMoisParType = useMemo(() => {
    const byMois: Record<string, Record<string, number>> = {}
    const typesSet = new Set<string>()
    // Tous les projets (pas seulement Won) — pondérés par win rate
    projects.forEach(p => {
      const type = p.type || "N/A"
      if (type === "Internal" || type === "N/A") return
      const r = computeProjectRevenue(p)
      if (!r) return
      const k = r.dossier
      if (!byMois[k]) byMois[k] = {}
      byMois[k][type] = (byMois[k][type] || 0) + r.netMUR
      typesSet.add(type)
    })
    const types = [...typesSet]

    // Utilise exactement le même range que revParMois pour cohérence visuelle
    const { filled } = revChartRange

    return {
      types,
      data: filled.map(k => {
        const isFuture = k > currentDossier
        const inPast = k <= currentDossier
        const inFuture = k >= currentDossier
        // Agrégé pour tooltip : somme de tous les types du mois
        const rowTotal = Object.values(byMois[k] || {}).reduce((s, v) => s + v, 0)
        const row: Record<string, number | string | boolean | null> = {
          mois: k,
          label: fmtDossier(k),
          isFuture,
          revenus: rowTotal, // ← permet au tooltip de retrouver la valeur
        }
        types.forEach(t => {
          const v = byMois[k]?.[t] || 0
          row[t] = v
          row[`${t}__past`] = inPast ? v : null
          row[`${t}__future`] = inFuture ? v : null
        })
        return row
      }),
    }
  }, [projects, revChartRange, currentDossier])

  const depListByDossier = useMemo(() => {
    const m: Record<string, Depense[]> = {}
    depenses.forEach(d => { if (!d.dossier) return; if (!m[d.dossier]) m[d.dossier] = []; m[d.dossier].push(d) })
    return m
  }, [depenses])

  // Liste des ventes/projets par mois (clé = dossier-style "YYMM") — pour tooltip "Revenus mensuels"
  // Inclut TOUS les projets avec revenu calculable, sans filtrer sur Status — permet d'afficher les projections
  // Source canonique du dossier : computeProjectRevenue (current+3 pour forecasts sans endDate).
  const ventesListByMois = useMemo(() => {
    const m: Record<string, Project[]> = {}
    projects.forEach(p => {
      const r = computeProjectRevenue(p)
      if (!r) return
      if (!m[r.dossier]) m[r.dossier] = []
      m[r.dossier].push(p)
    })
    Object.keys(m).forEach(k => m[k].sort((a, b) => getRevenueMUR(b) - getRevenueMUR(a)))
    return m
  }, [projects])

  // Sync avec la range du chart "Revenus mensuels" (revView)
  const projParTypeFiltered = useMemo(() => {
    const m: Record<string, { count: number; amount: number; amountProjected: number; countProjected: number }> = {}
    // On ne filtre plus Lost/Cancelled pour le pie car le user pilote par plage (même Lost peut compter si demandé)
    // Mais on garde l'exclusion Internal / N/A
    type RangedEntry = { p: Project; r: ProjectRevenue }
    const ranged: RangedEntry[] = []
    projects.forEach(p => {
      const t = p.type || "N/A"
      if (t === "Internal" || t === "N/A") return
      const r = computeProjectRevenue(p)
      if (!r) return
      if (!revChartRange.filled.includes(r.dossier)) return
      ranged.push({ p, r })
    })
    ranged.forEach(({ p, r }) => {
      const t = p.type || "N/A"
      if (!m[t]) m[t] = { count: 0, amount: 0, amountProjected: 0, countProjected: 0 }
      const isFuture = r.dossier > currentDossier
      const amt = r.netMUR
      if (isFuture) {
        m[t].amountProjected += amt
        m[t].countProjected++
      } else {
        m[t].amount += amt
        m[t].count++
      }
    })
    return Object.entries(m).map(([name, v]) => ({
      name,
      count: v.count + v.countProjected,
      amount: v.amount + v.amountProjected,
      realAmount: v.amount,
      projectedAmount: v.amountProjected,
      realCount: v.count,
      projectedCount: v.countProjected,
    })).sort((a, b) => b.amount - a.amount)
  }, [projects, revChartRange, currentDossier])
  const projParTypeMeta = useMemo(() => {
    const nbFuture = revChartRange.filled.filter(c => c > currentDossier).length
    const nbPast = revChartRange.filled.filter(c => c <= currentDossier).length
    return { nbFuture, nbPast, total: revChartRange.filled.length }
  }, [revChartRange, currentDossier])

  // ISO YYYY-MM-DD du jour — borne pour les Tops "passé uniquement".
  const todayISO = new Date().toISOString().slice(0, 10)

  const allFourn = useMemo(() => {
    // Top fournisseurs : uniquement dépenses déjà passées (d.date <= todayISO).
    const m: Record<string, { value: number; catTotals: Record<string, number>; count: number }> = {}
    depenses.filter(d => d.date && d.date <= todayISO).forEach(d => {
      if (!d.fournisseur) return
      if (!m[d.fournisseur]) m[d.fournisseur] = { value: 0, catTotals: {}, count: 0 }
      m[d.fournisseur].value += d.montantMUR
      m[d.fournisseur].count += 1
      if (d.categorie) m[d.fournisseur].catTotals[d.categorie] = (m[d.fournisseur].catTotals[d.categorie] || 0) + d.montantMUR
    })
    return Object.entries(m).map(([name, v]) => {
      const topCat = Object.entries(v.catTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || ""
      return { name, value: v.value, categorie: topCat, count: v.count, color: depCategoryColors[topCat] || "#6b7280" }
    }).sort((a, b) => b.value - a.value)
  }, [depenses, depCategoryColors])

  const topFourn = useMemo(() => allFourn.slice(0, 25), [allFourn])

  // Types de projets utilisés (hors Internal / N/A) — mêmes couleurs que pie "Revenus par type"
  const allProjectTypes = useMemo(() => {
    const s = new Set<string>()
    projects.filter(p => !["Lost", "Cancelled"].includes(p.status)).forEach(p => {
      const t = p.type || "N/A"
      if (t !== "Internal" && t !== "N/A") s.add(t)
    })
    return [...s].sort()
  }, [projects])

  // Mapping type de projet → couleur (mêmes couleurs que le pie "Revenus par type de projet")
  const projectTypeColors = useMemo(() => {
    const m: Record<string, string> = {}
    allProjectTypes.forEach((t, i) => { m[t] = PIE_TYPE[i % PIE_TYPE.length] })
    return m
  }, [allProjectTypes])

  const allClients = useMemo(() => {
    // Top clients : uniquement projets actuels (kind === "actual" via computeProjectRevenue).
    // Lost/Cancelled exclus naturellement (computeProjectRevenue retourne null).
    const m: Record<string, { value: number; count: number; projects: Project[]; byType: Record<string, number> }> = {}
    projects.filter(p => p.clientName && p.clientName !== "N/A").forEach(p => {
      const r = computeProjectRevenue(p)
      if (!r || r.kind !== "actual") return
      if (!m[p.clientName]) m[p.clientName] = { value: 0, count: 0, projects: [], byType: {} }
      m[p.clientName].value += r.netMUR
      m[p.clientName].count += 1
      m[p.clientName].projects.push(p)
      const type = p.type || "N/A"
      m[p.clientName].byType[type] = (m[p.clientName].byType[type] || 0) + r.netMUR
    })
    return Object.entries(m).map(([name, v]) => {
      // Spread byType directement sur l'objet pour que Recharts puisse stacker
      const row: any = { name, value: v.value, count: v.count, projects: v.projects }
      allProjectTypes.forEach(t => { row[t] = v.byType[t] || 0 })
      return row
    }).sort((a, b) => b.value - a.value)
  }, [projects, allProjectTypes])

  const topClients = useMemo(() => allClients.slice(0, 25), [allClients])

  const topData = topMode === "clients" ? topClients : topFourn

  // Rentabilité: filter out Internal projects — couleur par type de projet
  const rentaData = useMemo(() =>
    projects
      .filter(p => getRevenueRaw(p) > 0 && p.rentabilite != null && p.type !== "Internal")
      .map(p => ({
        name: p.name,
        x: getRevenueMUR(p),
        y: (p.rentabilite ?? 0) * 100,
        risk: p.riskLevel || "Null",
        type: p.type || "N/A",
        clientName: p.clientName,
        status: p.status,
        finalAmount: p.finalAmount,
        currency: p.currency,
      }))
  , [projects])

  // Rentabilité agrégée par type — gros points pour la moyenne, taille = nb projets
  const rentaByType = useMemo(() => {
    const groups: Record<string, { xs: number[]; ys: number[]; count: number }> = {}
    rentaData.forEach(p => {
      if (!groups[p.type]) groups[p.type] = { xs: [], ys: [], count: 0 }
      groups[p.type].xs.push(p.x)
      groups[p.type].ys.push(p.y)
      groups[p.type].count++
    })
    return Object.entries(groups).map(([type, g]) => ({
      name: `${type} (${g.count} projet${g.count > 1 ? "s" : ""})`,
      type,
      x: g.xs.reduce((s, v) => s + v, 0) / g.count,
      y: g.ys.reduce((s, v) => s + v, 0) / g.count,
      z: g.count,
    }))
  }, [rentaData])

  // Hero
  const heroData = useMemo(() => {
    const dM: Record<string, number> = {}
    depenses.forEach(d => { if (d.dossier) dM[d.dossier] = (dM[d.dossier] || 0) + d.montantMUR })
    // Maps séparés pour CA (= Final ou Quoted×Win) et Revenu net (= CA × (1 - commission))
    const rMNet: Record<string, number> = {}
    const rMCa: Record<string, number> = {}
    // Inclut TOUS les projets (pas seulement Won) pour que le futur / pipeline apparaisse
    // Utilise getProjectDossier (= computeProjectRevenue) pour cohérence avec revParMois et KPI
    projects.forEach(p => {
      const k = getProjectDossier(p)
      if (!k) return
      rMNet[k] = (rMNet[k] || 0) + getRevenueMUR(p)
      rMCa[k] = (rMCa[k] || 0) + getCAMUR(p)
    })

    const curCode = currentDossier // ex "2604"
    const curY = parseInt(curCode.slice(0, 2), 10)
    const curM = parseInt(curCode.slice(2), 10)

    // Construire la liste de codes YYMM selon heroMode
    const codes: string[] = []
    const addRange = (fromY: number, fromM: number, toY: number, toM: number) => {
      let y = fromY, m = fromM
      while (y < toY || (y === toY && m <= toM)) {
        codes.push(`${String(y).padStart(2, "0")}${String(m).padStart(2, "0")}`)
        m++; if (m > 12) { m = 1; y++ }
      }
    }

    if (heroMode === "past") {
      // Historique : tous les mois existants (rev ou dep), puis slice selon heroPast
      const allPast = new Set<string>([...Object.keys(dM), ...Object.keys(rMNet), ...Object.keys(rMCa)])
      let sorted = [...allPast].sort()
      // S'assurer qu'on ne dépasse pas current
      sorted = sorted.filter(c => c <= curCode)
      if (heroPast !== "all") {
        const n = heroPast === "12m" ? 12 : heroPast === "6m" ? 6 : 3
        sorted = sorted.slice(-n)
      }
      codes.push(...sorted)
    } else if (heroMode === "future") {
      // Du mois courant à +N mois
      const n = heroFuture === "12m" ? 12 : heroFuture === "6m" ? 6 : 3
      // start = mois courant, end = current + n
      let toY = curY, toM = curM + n
      while (toM > 12) { toM -= 12; toY += 1 }
      addRange(curY, curM, toY, toM)
    } else {
      // custom : heroCustomStart/end format YYYY-MM ; fallback = FY complète
      const parse = (s: string): [number, number] | null => {
        if (!s || s.length < 7) return null
        const [y, m] = s.split("-")
        return [parseInt(y, 10) % 100, parseInt(m, 10)]
      }
      const s = parse(heroCustomStart)
      const e = parse(heroCustomEnd)
      if (s && e) {
        addRange(s[0], s[1], e[0], e[1])
      } else {
        // FY par défaut : juillet fyStartYear → juin fyStartYear+1
        const fyY = fyStartYear % 100
        addRange(fyY, 7, fyY + 1, 6)
      }
    }

    return codes.map(m => {
      const isFuture = m > curCode
      const isCurrent = m === curCode
      const revNet = rMNet[m] || 0
      const ca = rMCa[m] || 0
      const commission = Math.max(0, ca - revNet)
      const dep = dM[m] || 0
      const sal = salaireForMonth(m)
      const depVal = isFuture ? recurringCriticalMensuel : dep
      const ebitda = revNet - depVal - sal
      // Passé inclut le mois courant ; Futur inclut aussi le mois courant → point partagé pour lisser la transition
      const inPast = !isFuture
      const inFuture = isFuture || isCurrent
      return {
        mois: m,
        label: fmtDossier(m),
        isFuture,
        isCurrent,
        ca, revenus: revNet, commission, depenses: depVal, salaires: sal, ebitda,
        // ── Passé (séries pleines) — jusqu'au mois courant inclus ──
        caPast: inPast ? ca : null,
        revenuPast: inPast ? revNet : null,
        commissionPast: inPast ? commission : null,
        depensesPast: inPast ? depVal : null,
        salairesPast: inPast ? sal : null,
        ebitdaPast: inPast ? ebitda : null,
        // ── Futur / projeté — depuis le mois courant (point partagé) ──
        caProjected: inFuture ? ca : null,
        revenuProjected: inFuture ? revNet : null,
        commissionProjected: inFuture ? commission : null,
        depensesProjected: inFuture ? depVal : null,
        salairesProjected: inFuture ? sal : null,
        ebitdaProjected: inFuture ? ebitda : null,
      } as any
    })
  }, [depenses, projects, heroMode, heroPast, heroFuture, heroCustomStart, heroCustomEnd, currentDossier, fyStartYear, salaireMensuel, recurringCriticalMensuel])
  const heroTotalDep = useMemo(() => heroData.filter(d => !d.isFuture).reduce((s, d) => s + (d.depenses || 0), 0), [heroData])
  const heroTotalRev = useMemo(() => heroData.filter(d => !d.isFuture).reduce((s, d) => s + (d.revenus || 0), 0), [heroData])
  const heroTotalCA = useMemo(() => heroData.filter(d => !d.isFuture).reduce((s, d) => s + (d.ca || 0), 0), [heroData])
  const heroTotalSal = useMemo(() => heroData.filter(d => !d.isFuture).reduce((s, d) => s + (d.salaires || 0), 0), [heroData])
  const heroTotalEbitda = heroTotalRev - heroTotalDep - heroTotalSal
  const heroProjectedDep = useMemo(() => heroData.filter(d => d.isFuture).reduce((s, d) => s + (d.depenses || 0), 0), [heroData])
  const heroProjectedRev = useMemo(() => heroData.filter(d => d.isFuture).reduce((s, d) => s + (d.revenus || 0), 0), [heroData])
  const heroProjectedCA = useMemo(() => heroData.filter(d => d.isFuture).reduce((s, d) => s + (d.ca || 0), 0), [heroData])
  const heroProjectedSal = useMemo(() => heroData.filter(d => d.isFuture).reduce((s, d) => s + (d.salaires || 0), 0), [heroData])
  const heroProjectedEbitda = heroProjectedRev - heroProjectedDep - heroProjectedSal

  const heroProjectedBothModes = useMemo(() => {
    const compute = (mode: 'gut' | 'auto') => {
      const save = __WIN_UI__; __WIN_UI__ = mode
      const totals = projects.reduce((acc, p) => {
        const r = computeProjectRevenue(p)
        if (!r || r.kind !== 'forecast') return acc
        return { ca: acc.ca + r.caMUR, rev: acc.rev + r.netMUR }
      }, { ca: 0, rev: 0 })
      __WIN_UI__ = save
      return totals
    }
    return { gut: compute('gut'), auto: compute('auto') }
  }, [projects, currentDossier])

  // Hide/show state pour le Finance Dashboard
  const [heroHidden, setHeroHidden] = useState<Set<string>>(new Set())
  const toggleHero = (key: string) => setHeroHidden(prev => {
    const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n
  })
  const [heroFullscreen, setHeroFullscreen] = useState(false)

  // Table data — all items (no limit), with filters
  // Tri basé sur End Date (mois du revenu)
  const allVentes = useMemo(() =>
    projects.filter(p => ["Won", "Active", "Completed", "Won orally"].includes(p.status) && getRevenueRaw(p) > 0)
      .sort((a, b) => (getRevenueDateISO(b) || "").localeCompare(getRevenueDateISO(a) || ""))
  , [projects])

  // ── Database Review Critical — santé des fiches projets ─────────
  // La valeur Health est calculée par une formule Notion (champ "Health").
  // Valeurs possibles : "❌ Critical" / "⚠️ Warning" / "✅ OK" (ou vide)
  // Le site se contente d'AFFICHER cette valeur + liste les champs manquants pour aide.
  //
  // Pour chaque projet, on détermine aussi les champs potentiellement manquants (affichage uniquement).
  const PROJECT_REQUIRED_INTERNAL_LABELS: Array<{ label: string; check: (p: Project) => boolean }> = [
    { label: "Owner", check: p => !!p.ownerName || !!p.ownerIds?.length },
    { label: "Client", check: p => !!p.clientName && p.clientName !== "N/A" && !!p.clientIds?.length },
    { label: "Phase", check: p => !!p.phase },
    { label: "Methodology", check: p => !!p.methodology },
    { label: "Status", check: p => !!p.status },
    { label: "Start Date", check: p => !!p.startDate },
    { label: "Team Members", check: p => !!p.teamMemberNames || !!p.teamMemberIds?.length },
  ]
  const PROJECT_REQUIRED_STANDARD_LABELS: Array<{ label: string; check: (p: Project) => boolean }> = [
    { label: "Name", check: p => !!p.name },
    { label: "Status", check: p => !!p.status },
    { label: "Type", check: p => !!p.type },
    { label: "Currency", check: p => !!p.currency },
    { label: "Quoted Amount", check: p => p.quotedAmount > 0 },
    { label: "Win %", check: p => p.winPercent > 0 },
    { label: "Risk Level", check: p => !!p.riskLevel },
    { label: "Client", check: p => !!p.clientName && p.clientName !== "N/A" && !!p.clientIds?.length },
    { label: "Start Date", check: p => !!p.startDate },
    { label: "End Date", check: p => !!p.endDate },
    { label: "Methodology", check: p => !!p.methodology },
  ]

  const projectsHealth = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return projects.map(p => {
      const isInternal = p.type === "Internal"
      const healthLabel = p.health || ""
      const isCritical = healthLabel.includes("Critical")
      const isWarning = healthLabel.includes("Warning")
      const isOK = healthLabel.includes("OK")
      const labels = isInternal ? PROJECT_REQUIRED_INTERNAL_LABELS : PROJECT_REQUIRED_STANDARD_LABELS
      const missing: string[] = []
      for (const f of labels) {
        if (!f.check(p)) missing.push(f.label)
      }
      // Alertes financières (projets non-Internal uniquement)
      if (!isInternal) {
        const r = computeProjectRevenue(p, today)
        // a) Revenu actuel (projet passé) sans Final Amount → erreur DB
        if (r?.kind === "actual" && !(p.finalAmount && p.finalAmount > 0)) {
          missing.push("Final Amount")
        }
        // b) Net Amount Notion incohérent vs Final Amount × (1 − commission %)
        //    Tolérance 1 unité (devise du projet) pour absorber arrondis Notion.
        if (p.finalAmount && p.finalAmount > 0 && p.netAmount != null) {
          const commRate = hasRealCommission(p) ? getCommissionRate(p) : 0
          const expectedNet = p.finalAmount * (1 - commRate)
          if (Math.abs(expectedNet - p.netAmount) > 1) {
            missing.push("Net amount incohérent")
          }
        }
        // c) Projet futur (quotedAmount renseigné) sans Win % gut feeling
        //    → forecast non pondérable manuellement, on retombe sur winAuto si dispo.
        if (r?.kind === "forecast" && p.quotedAmount > 0 && !(p.winPercent > 0)) {
          missing.push("Win % (gut feeling)")
        }
      }
      return { project: p, healthLabel, isCritical, isWarning, isOK, missing, isInternal }
    })
  }, [projects])

  const healthStats = useMemo(() => {
    const total = projectsHealth.length
    const critical = projectsHealth.filter(h => h.isCritical).length
    const warning = projectsHealth.filter(h => h.isWarning).length
    const ok = projectsHealth.filter(h => h.isOK).length
    const unclassified = total - critical - warning - ok
    const missingFieldCounts: Record<string, number> = {}
    projectsHealth.filter(h => h.isCritical).forEach(h => h.missing.forEach(f => { missingFieldCounts[f] = (missingFieldCounts[f] || 0) + 1 }))
    const topMissing = Object.entries(missingFieldCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    return { total, ok, warning, critical, unclassified, topMissing }
  }, [projectsHealth])

  const [healthFilter, setHealthFilter] = useState<"all" | "warning" | "critical">("critical")
  const filteredHealth = useMemo(() => {
    const list = healthFilter === "all"
      ? projectsHealth
      : healthFilter === "warning"
        ? projectsHealth.filter(h => h.isWarning)
        : projectsHealth.filter(h => h.isCritical)
    // Tri : Critical en premier, puis Warning, puis OK
    return [...list].sort((a, b) => {
      const score = (h: typeof a) => h.isCritical ? 0 : h.isWarning ? 1 : h.isOK ? 2 : 3
      return score(a) - score(b)
    })
  }, [projectsHealth, healthFilter])

  // ── PNL / Cash — métriques standard pour service company ─────────────
  // CA (Chiffre d'Affaires) = Final Amount MUR (ou Quoted×Win% si non réalisé)
  // Commissions = % of commissions × Final Amount → versées à des tiers
  // Revenu net = CA − Commissions (ce qu'Eqxia conserve)
  // Dépenses = totalité des dépenses opérationnelles
  // Salaires = Σ(CJE × 220/12) × nb mois salariés
  // Charges = Dépenses + Salaires
  // Marge brute = Revenu net − Dépenses directes (on simplifie : − dépenses, hors salaires)
  // EBITDA = Revenu net − Charges (dépenses + salaires opérationnels)
  // Marge EBITDA % = EBITDA / CA × 100
  const cashData = useMemo(() => {
    // Construire la plage de mois selon cashView*
    const existingMonths = [
      ...new Set([
        ...depenses.map(d => d.dossier).filter(Boolean),
        ...projects.map(p => {
          const iso = getRevenueDateISO(p); if (!iso) return ""
          const d = new Date(iso)
          return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`
        }).filter(Boolean),
      ]),
    ]
    const codes = buildMonthCodes(cashViewMode, cashViewPast, cashViewFuture, cashViewCustomStart, cashViewCustomEnd, existingMonths)
    const codeSet = new Set(codes)
    const inRange = (code: string) => codeSet.has(code)

    const wonProjects = projects.filter(p => {
      if (!["Won", "Active", "Completed", "Won orally"].includes(p.status)) return false
      const iso = getRevenueDateISO(p); if (!iso) return false
      const d = new Date(iso)
      const code = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`
      return inRange(code)
    })
    let caTotal = 0
    let revenuNet = 0
    let commissionsTotal = 0
    const byBeneficiaire: Record<string, { total: number; percent: number; projectCount: number; projects: { name: string; amount: number; pct: number }[] }> = {}

    for (const p of wonProjects) {
      const caMUR = getCAMUR(p)
      if (!caMUR) continue
      caTotal += caMUR

      const beneficiaire = (p.commissionTo || "").trim()
      const normalizedPct = getCommissionRate(p)

      if (beneficiaire && normalizedPct > 0 && p.finalAmount > 0) {
        const commissionMUR = toMUR(p.finalAmount * normalizedPct, p.currency)
        commissionsTotal += commissionMUR
        revenuNet += caMUR - commissionMUR
        const percentLabel = normalizedPct * 100
        if (!byBeneficiaire[beneficiaire]) byBeneficiaire[beneficiaire] = { total: 0, percent: percentLabel, projectCount: 0, projects: [] }
        byBeneficiaire[beneficiaire].total += commissionMUR
        byBeneficiaire[beneficiaire].projectCount += 1
        byBeneficiaire[beneficiaire].projects.push({ name: p.name, amount: commissionMUR, pct: percentLabel })
      } else {
        revenuNet += caMUR
      }
    }
    const beneficiaires = Object.entries(byBeneficiaire)
      .map(([name, v]) => ({
        name,
        ...v,
        percent: v.projects.length > 0 ? (v.projects.reduce((s, pr) => s + pr.pct * pr.amount, 0) / (v.total || 1)) : v.percent,
      }))
      .sort((a, b) => b.total - a.total)

    // Charges dans la plage
    const depPast = depenses.filter(d => d.dossier && inRange(d.dossier) && d.dossier <= currentDossier).reduce((s, d) => s + d.montantMUR, 0)
    const nbFutureInRange = codes.filter(c => c > currentDossier).length
    const depFuture = nbFutureInRange * recurringCriticalMensuel
    const depTotalRange = depPast + depFuture
    // Salaires : nb mois dans la plage qui sont >= 2603
    // Salaire total sur la plage : somme per-mois (respecte per-employee dateFirstSalary + Maurice 13e).
    const salTotalRange = codes.reduce((s, c) => s + salaireForMonth(c), 0)
    const chargesRange = depTotalRange + salTotalRange

    // Indicateurs PNL
    const margeBrute = revenuNet - depTotalRange
    const ebitda = revenuNet - chargesRange
    const margeEbitdaPct = caTotal > 0 ? (ebitda / caTotal) * 100 : 0
    const margeNettePct = caTotal > 0 ? (revenuNet / caTotal) * 100 : 0

    const rangeInfo = {
      nbPast: codes.filter(c => c <= currentDossier).length,
      nbFuture: nbFutureInRange,
      total: codes.length,
    }

    return { caTotal, revenuNet, commissionsTotal, beneficiaires, depAll: depTotalRange, salAll: salTotalRange, chargesAll: chargesRange, margeBrute, ebitda, margeEbitdaPct, margeNettePct, rangeInfo }
  }, [projects, depenses, salaireMensuel, recurringCriticalMensuel, currentDossier, cashViewMode, cashViewPast, cashViewFuture, cashViewCustomStart, cashViewCustomEnd, buildMonthCodes])

  // Mois disponibles (décroissant) pour le filtre Date des Dernières ventes — format "YYYY-MM"
  // Basé sur End Date (= mois du revenu)
  const ventesMonthOptions = useMemo(() => {
    const s = new Set<string>()
    allVentes.forEach(p => {
      const iso = getRevenueDateISO(p)
      if (iso && iso.length >= 7) s.add(iso.slice(0, 7))
    })
    return [...s].sort().reverse()
  }, [allVentes])
  const depensesMonthOptions = useMemo(() => {
    const s = new Set<string>()
    depenses.forEach(d => {
      if (d.date && d.date.length >= 7) s.add(d.date.slice(0, 7))
    })
    return [...s].sort().reverse()
  }, [depenses])

  // Formatage "YYYY-MM" → "Avr 2026"
  const fmtMonthLabel = (ym: string): string => {
    if (!ym || ym.length < 7) return ym
    const [y, m] = ym.split("-")
    const mi = parseInt(m, 10)
    return `${MONTHS[mi - 1]} ${y}`
  }

  const filteredVentes = useMemo(() => {
    return allVentes.filter(p => {
      if (venteFilters.date && !getRevenueDateISO(p).includes(venteFilters.date)) return false
      if (venteFilters.projet && !p.name.toLowerCase().includes(venteFilters.projet.toLowerCase())) return false
      if (venteFilters.client && !p.clientName.toLowerCase().includes(venteFilters.client.toLowerCase())) return false
      if (venteFilters.type && p.type !== venteFilters.type) return false
      if (venteFilters.status && p.status !== venteFilters.status) return false
      return true
    })
  }, [allVentes, venteFilters])

  const allDep = useMemo(() =>
    [...depenses].sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  , [depenses])

  const filteredDep = useMemo(() => {
    return allDep.filter(d => {
      if (depenseFilters.date && !d.date?.includes(depenseFilters.date)) return false
      if (depenseFilters.description && !d.description.toLowerCase().includes(depenseFilters.description.toLowerCase())) return false
      if (depenseFilters.fournisseur && !d.fournisseur.toLowerCase().includes(depenseFilters.fournisseur.toLowerCase())) return false
      if (depenseFilters.categorie && d.categorie !== depenseFilters.categorie) return false
      return true
    })
  }, [allDep, depenseFilters])

  // ─── Save handlers ──────────────────────────────────────────────────────────

  const handleSaveProject = useCallback(async (data: Partial<Project> & { id?: string }) => {
    setSaving(true)
    try {
      const isNew = !data.id
      const url = isNew ? "/api/projects" : `/api/projects/${data.id}`
      const method = isNew ? "POST" : "PATCH"
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      if (!res.ok) throw new Error("Erreur lors de la sauvegarde")
      setEditProject(null)
      setShowAddVente(false)
      setLoading(true)
      fetchData()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }, [fetchData])

  const handleSaveDepense = useCallback(async (data: Partial<Depense>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/depenses/${data.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      if (!res.ok) throw new Error("Erreur lors de la sauvegarde")
      setEditDepense(null)
      setLoading(true)
      fetchData()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }, [fetchData])

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (status === "loading" || loading) return <EqxiaLoadingScreen appName="Plutus" bgImage={bgImage} />

  const fmt = (v: any) => `${Math.round(Number(v)).toLocaleString("fr-FR")} MUR`
  const fmtK = (v: any) => `${(Number(v) / 1000).toFixed(0)}k`

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }}>
      <div style={{ position: "fixed", inset: 0, background: "var(--bg-overlay)", zIndex: 0 }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

        <AppHeader
          appName="Plutus"
          right={
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ textAlign: "right", lineHeight: 1.1 }}>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                  {now.toLocaleDateString("fr-FR", { weekday: "long" })}
                </div>
                <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-primary)", fontWeight: 600, fontFamily: "monospace" }}>
                  {now.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                </div>
              </div>
              <a
                href="/sales"
                style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", textDecoration: "none", padding: "4px 10px", borderRadius: "var(--radius-btn)", border: "1px solid var(--border-subtle)", background: "var(--accent-soft)", whiteSpace: "nowrap" }}
              >
                Sales →
              </a>
              {(() => {
                const adminEmails = new Set(["emile.drijardmazzini@eqxia.com", "alexandre.govin@eqxia.com"])
                const email = session?.user?.email?.toLowerCase()
                if (!email || !adminEmails.has(email)) return null
                return (
                  <a
                    href="/reglages"
                    style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", textDecoration: "none", padding: "4px 10px", borderRadius: "var(--radius-btn)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", whiteSpace: "nowrap" }}
                    title="Page admin — règles de calcul + taux de conversion"
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Settings size={13} />Réglages</span>
                  </a>
                )
              })()}
              <SignOutButton />
            </div>
          }
        />

        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px", width: "100%" }}>

          {error && <div style={{ ...card, background: "var(--btn-danger-bg)", border: "1px solid rgba(248,113,113,0.3)", color: "var(--color-error)", fontSize: "var(--fs-sm)", marginBottom: 16 }}>Erreur: {error}</div>}

          {/* ── Tabs navigation ── */}
          <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border-subtle)" }}>
            {([["dashboard", <><BarChart3 size={13} style={{ marginRight: 5, flexShrink: 0 }} />Dashboard</>], ["previsionnel", <><Telescope size={13} style={{ marginRight: 5, flexShrink: 0 }} />Prévisionnel</>]] as [string, React.ReactNode][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as any)}
                style={{
                  padding: "10px 20px",
                  fontSize: "var(--fs-sm)",
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  border: "none",
                  borderBottom: `2px solid ${activeTab === key ? "var(--accent)" : "transparent"}`,
                  color: activeTab === key ? "var(--accent)" : "var(--text-secondary)",
                  background: "none",
                  marginBottom: -1,
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            {ratesUpdated && (
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", alignSelf: "center", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 4 }} title={`Taux mis à jour : ${ratesUpdated}`}>
                <RefreshCw size={10} /> Taux live · USD {Math.round(rates.USD || 0)} · EUR {Math.round(rates.EUR || 0)} · GBP {Math.round(rates.GBP || 0)} MUR
              </div>
            )}
          </div>

          {activeTab === "previsionnel" ? (
            <PrevisionnelView
              projects={projects}
              employees={employees}
              depenses={depenses}
              recurringCriticalMensuel={recurringCriticalMensuel}
              salaireMensuel={salaireMensuel}
              salaireForMonth={salaireForMonth}
              onEditProject={(p: Project) => setEditProject(p)}
              onEditProjectHighlight={(p: Project, missing: string[]) => { setEditProjectMissing(missing); setEditProject(p) }}
              onEditDepense={(d: Depense) => setEditDepense(d)}
              currentDossier={currentDossier}
              fyStartYear={fyStartYear}
              forecastWinMode={forecastWinMode}
              setForecastWinMode={setForecastWinMode}
            />
          ) : (
          <>

          {/* ── KPIs ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            {/* Revenus card avec toggle CA/Revenu (revenus actuels uniquement, projets passés) */}
            <div style={{ ...card, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>{revKpiMode === "rev" ? "Revenu" : "CA"}</div>
                  <Seg value={revKpiMode} onChange={v => setRevKpiMode(v as any)} options={[["rev", "Revenu"], ["ca", "CA"]]} />
                </div>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(166,201,206,0.15)", border: "1px solid rgba(166,201,206,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}><TrendingUp size={16} color="var(--accent)" /></div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)", letterSpacing: "-0.03em", lineHeight: 1 }}>{Math.round(revKpiMode === "rev" ? revTotal : caTotal).toLocaleString("fr-FR")}</span>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>MUR</span>
              </div>
              <div style={{ marginTop: "auto", paddingTop: 8 }}>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>{revPeriodLabel} · projets passés</div>
                <div style={{ marginTop: 6 }}>
                  <Seg value={kpiPeriod} onChange={v => setKpiPeriod(v as any)} options={[["all", "All"], ["year", "A"], ["quarter", "T"], ["month", "M"]]} />
                </div>
              </div>
            </div>

            {/* Average Margin card — inlined pour ajouter le Seg en bas, aligné avec les 2 autres */}
            <div style={{ ...card, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>Average Margin</div>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(166,201,206,0.15)", border: "1px solid rgba(166,201,206,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}><Percent size={16} color="var(--accent)" /></div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: avgMarginWithSalaries >= 0 ? "var(--accent)" : "var(--color-error)", letterSpacing: "-0.03em", lineHeight: 1 }}>{avgMarginWithSalaries.toFixed(1)}</span>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>%</span>
              </div>
              <div style={{ marginTop: "auto", paddingTop: 8 }}>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>Rev − Charges · {periodLabel(kpiPeriod)}</div>
                <div style={{ marginTop: 6 }}>
                  <Seg value={kpiPeriod} onChange={v => setKpiPeriod(v as any)} options={[["all", "All"], ["year", "A"], ["quarter", "T"], ["month", "M"]]} />
                </div>
              </div>
            </div>

            {/* Charges (Dépenses + Salaires) card — Seg sur ligne dédiée en bas */}
            <div style={{ ...card, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>Charges (Dépenses &amp; Salaires)</div>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}><Wallet size={16} color="#ef4444" /></div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1 }}>{Math.round(chargesTotal).toLocaleString("fr-FR")}</span>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>MUR</span>
              </div>
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontFamily: "monospace", marginTop: 6 }}>
                {Math.round(salairesForDepPeriod).toLocaleString("fr-FR")} <span style={{ color: "#f97316" }}>sal</span> + {Math.round(depTotal).toLocaleString("fr-FR")} <span style={{ color: "#ef4444" }}>dép</span>
              </div>
              <div style={{ marginTop: "auto", paddingTop: 8 }}>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>{depPeriodLabel}</div>
                <div style={{ marginTop: 6 }}>
                  <Seg value={kpiPeriod} onChange={v => setKpiPeriod(v as any)} options={[["all", "All"], ["year", "A"], ["quarter", "T"], ["month", "M"]]} />
                </div>
              </div>
            </div>

            <KpiCard icon={<Zap size={16} color="rgb(20,184,166)" />} iconBg="rgba(20,184,166,0.15)" iconBorder="rgba(20,184,166,0.3)" label="Projets actifs" value={`${projetsActifs}`} unit={`/ ${projetsTotal}`} sub="Status = Active" />
          </div>

          {/* ── Finance Dashboard ── */}
          <FinanceDashboard
            heroData={heroData}
            heroMode={heroMode} setHeroMode={setHeroMode}
            heroPast={heroPast} setHeroPast={setHeroPast}
            heroFuture={heroFuture} setHeroFuture={setHeroFuture}
            heroCustomStart={heroCustomStart} setHeroCustomStart={setHeroCustomStart}
            heroCustomEnd={heroCustomEnd} setHeroCustomEnd={setHeroCustomEnd}
            hidden={heroHidden} toggleHidden={toggleHero}
            fullscreen={heroFullscreen} setFullscreen={setHeroFullscreen}
            totals={{ ca: heroTotalCA, rev: heroTotalRev, dep: heroTotalDep, sal: heroTotalSal, ebitda: heroTotalEbitda }}
            projected={{ ca: heroProjectedCA, rev: heroProjectedRev, dep: heroProjectedDep, sal: heroProjectedSal, ebitda: heroProjectedEbitda, caGut: heroProjectedBothModes.gut.ca, cAAuto: heroProjectedBothModes.auto.ca, revGut: heroProjectedBothModes.gut.rev, revAuto: heroProjectedBothModes.auto.rev }}
            fyLabel={fy.label}
            forecastWinMode={forecastWinMode} setForecastWinMode={setForecastWinMode}
          />

          {/* ── Rows Revenus + Dépenses (ordre vertical : Revenus au-dessus) ── */}
          <div style={{ display: "flex", flexDirection: "column" }}>

          {/* ── Row Dépenses: mensuelles + par catégorie ── */}
          <div data-row="depenses" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16, order: 2 }}>
            <ChartCard
              title="Charges mensuelles"
              sub="Salaires + Dépenses"
              right={
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Seg value={chargesMode} onChange={v => setChargesMode(v as any)} options={[["all", "Total"], ["depenses", "Dépenses"], ["salaires", "Salaires"]]} />
                  <ViewRangeToggle
                    mode={depViewMode} setMode={setDepViewMode}
                    past={depViewPast} setPast={setDepViewPast}
                    future={depViewFuture} setFuture={setDepViewFuture}
                    customStart={depViewCustomStart} setCustomStart={setDepViewCustomStart}
                    customEnd={depViewCustomEnd} setCustomEnd={setDepViewCustomEnd}
                    fyLabel={fy.label}
                  />
                </div>
              }
              value={
                <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                  <span>{`${Math.round(depTotalAll + salaireTotalForPeriod("all")).toLocaleString("fr-FR")} MUR`}</span>
                  <span style={{ display: "inline-flex", gap: 10, fontSize: "var(--fs-2xs)", fontWeight: 500, fontFamily: "inherit" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#ef4444" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                      <span style={{ fontFamily: "monospace" }}>{Math.round(depTotalAll).toLocaleString("fr-FR")}</span>
                      <span style={{ color: "var(--text-muted)" }}>dép</span>
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#f97316" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f97316", display: "inline-block" }} />
                      <span style={{ fontFamily: "monospace" }}>{Math.round(salaireTotalForPeriod("all")).toLocaleString("fr-FR")}</span>
                      <span style={{ color: "var(--text-muted)" }}>sal</span>
                    </span>
                  </span>
                </span> as any
              }
              expandable
              renderExpanded={() => {
                const filterMois = depFsFilterMois
                const allMonthCodes = [...new Set(depenses.map(d => d.dossier).filter(Boolean))].sort().reverse()
                const listItems = (filterMois ? depenses.filter(d => d.dossier === filterMois) : depenses)
                  .slice()
                  .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                const listTotal = listItems.reduce((s, d) => s + d.montantMUR, 0)
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", width: "100%", minHeight: 0 }}>
                    {/* Chart + légende en haut */}
                    <div
                      ref={depChartRef}
                      style={{ flexShrink: 0, cursor: "pointer" }}
                    >
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart
                          data={depParMois}
                          onMouseMove={(e: any) => {
                            const code = e?.activePayload?.[0]?.payload?.dossier
                            if (code) {
                              hoverDepRef.current = code
                              if (code !== hoverDepMois) setHoverDepMois(code)
                            }
                          }}
                          onMouseLeave={() => { hoverDepRef.current = null; setHoverDepMois(null) }}
                          style={{ cursor: "pointer" }}
                        >
                          <defs>
                            <linearGradient id="gSalFs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f97316" stopOpacity={0.5} /><stop offset="100%" stopColor="#f97316" stopOpacity={0.05} /></linearGradient>
                            {allCats.map((cat, i) => {
                              const color = PIE_CAT[i % PIE_CAT.length]
                              return <linearGradient key={cat} id={`gCatFs${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.5} /><stop offset="100%" stopColor={color} stopOpacity={0.05} /></linearGradient>
                            })}
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.08)" />
                          <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                          <Tooltip content={<CTooltip formatter={fmt} />} />
                          {/* Salaires en base (hors mode depenses) */}
                          {chargesMode !== "depenses" && (
                            <Area type="monotone" dataKey="Salaires" stackId="1" stroke="#f97316" strokeWidth={0.5} fill="url(#gSalFs)" />
                          )}
                          {chargesMode !== "salaires" && allCats.map((cat, i) => (
                            <Area key={cat} type="monotone" dataKey={cat} stackId="1" stroke={PIE_CAT[i % PIE_CAT.length]} strokeWidth={0.5} fill={`url(#gCatFs${i})`} />
                          ))}
                          {chargesMode !== "salaires" && (
                            <Area type="monotone" dataKey="Récurrent critique" stackId="1" stroke="#ef4444" strokeWidth={0.5} strokeDasharray="4 3" fill="#ef4444" fillOpacity={0.35} />
                          )}
                          {currentDepMois && <ReferenceLine x={fmtDossier(currentDepMois)} stroke="rgba(166,201,206,0.4)" strokeWidth={1} strokeDasharray="3 3" />}
                        </AreaChart>
                      </ResponsiveContainer>
                      {/* Légende sous le chart */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "10px 0 0", borderTop: "1px solid rgba(166,201,206,0.08)", marginTop: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-2xs)" }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#f97316" }} />
                          <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Salaires</span>
                        </div>
                        {allCats.map((cat, i) => (
                          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-2xs)" }}>
                            <span style={{ width: 10, height: 10, borderRadius: 2, background: PIE_CAT[i % PIE_CAT.length] }} />
                            <span style={{ color: "var(--text-secondary)" }}>{cat}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Liste en bas avec filtre mois */}
                    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg-card)", border: "1px solid rgba(166,201,206,0.12)", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 16px", borderBottom: "1px solid rgba(166,201,206,0.12)", flexShrink: 0, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
                            {listItems.length} dépense{listItems.length > 1 ? "s" : ""}
                          </div>
                          <div style={{ fontSize: "var(--fs-xs)", color: "#ef4444", fontFamily: "monospace", fontWeight: 700 }}>
                            {Math.round(listTotal).toLocaleString("fr-FR")} MUR
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontWeight: 500 }}>Filtrer par mois :</label>
                          <select
                            value={depFsFilterMois}
                            onChange={e => setDepFsFilterMois(e.target.value)}
                            style={{ padding: "4px 8px", fontSize: "var(--fs-2xs)", background: "rgba(166,201,206,0.06)", border: "1px solid rgba(166,201,206,0.12)", borderRadius: 4, color: "var(--text-primary)", fontFamily: "inherit", outline: "none" }}
                          >
                            <option value="">Tous les mois</option>
                            {allMonthCodes.map(c => <option key={c} value={c}>{fmtDossier(c)}</option>)}
                          </select>
                          {depFsFilterMois && (
                            <button
                              onClick={() => setDepFsFilterMois("")}
                              style={{ background: "none", border: "1px solid var(--border-subtle)", color: "var(--text-muted)", cursor: "pointer", fontSize: "var(--fs-2xs)", padding: "4px 8px", borderRadius: 4, fontFamily: "inherit" }}
                            >
                              Réinitialiser
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
                          <thead style={{ position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 2 }}>
                            <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.15)" }}>
                              {["Date", "Description", "Fournisseur", "Catégorie", "Montant", "MUR"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {listItems.length === 0 ? (
                              <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontStyle: "italic" }}>Aucune dépense pour ce filtre</td></tr>
                            ) : listItems.map((d, i) => {
                              const c = (d.categorie && depCategoryColors[d.categorie]) || "#6b7280"
                              return (
                                <tr key={d.id || i} onClick={() => setEditDepense(d)} style={{ borderBottom: "1px solid rgba(166,201,206,0.05)", cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                  <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--text-muted)" }}>{d.date || "—"}</td>
                                  <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.description}</td>
                                  <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{d.fournisseur}</td>
                                  <td style={tdStyle}>
                                    {d.categorie ? (
                                      <span style={{ background: `${c}22`, color: c, padding: "2px 8px", borderRadius: 4, fontSize: "var(--fs-2xs)", fontWeight: 600 }}>{d.categorie}</span>
                                    ) : "—"}
                                  </td>
                                  <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 600 }}>{d.montant.toLocaleString("fr-FR")} {d.devise}</td>
                                  <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 700, color: "#ef4444" }}>{Math.round(d.montantMUR).toLocaleString("fr-FR")}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              }}
            >
              <div
                ref={depChartRef}
                style={{ position: "relative" }}
              >
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart
                    data={depParMois}
                    onMouseMove={(e: any) => {
                      const code = e?.activePayload?.[0]?.payload?.dossier
                      if (code) {
                        hoverDepRef.current = code
                        if (code !== hoverDepMois) setHoverDepMois(code)
                      }
                    }}
                    onMouseLeave={() => { hoverDepRef.current = null; setHoverDepMois(null) }}
                  >
                    <defs>
                      <linearGradient id="gSal2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f97316" stopOpacity={0.5} /><stop offset="100%" stopColor="#f97316" stopOpacity={0.05} /></linearGradient>
                      {allCats.map((cat, i) => {
                        const color = PIE_CAT[i % PIE_CAT.length]
                        return <linearGradient key={cat} id={`gCat${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.5} /><stop offset="100%" stopColor={color} stopOpacity={0.05} /></linearGradient>
                      })}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.08)" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                    <Tooltip content={<CTooltip formatter={fmt} />} />
                    {/* Salaires en base (hors mode depenses) */}
                    {chargesMode !== "depenses" && (
                      <Area type="monotone" dataKey="Salaires" stackId="1" stroke="#f97316" strokeWidth={0.5} fill="url(#gSal2)" />
                    )}
                    {/* Catégories de dépenses (hors mode salaires) */}
                    {chargesMode !== "salaires" && allCats.map((cat, i) => (
                      <Area key={cat} type="monotone" dataKey={cat} stackId="1" stroke={PIE_CAT[i % PIE_CAT.length]} strokeWidth={0.5} fill={`url(#gCat${i})`} />
                    ))}
                    {chargesMode !== "salaires" && (
                      <Area type="monotone" dataKey="Récurrent critique" stackId="1" stroke="#ef4444" strokeWidth={0.5} strokeDasharray="4 3" fill="#ef4444" fillOpacity={0.35} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title="Dépenses par catégorie"
              sub={(() => {
                // "mois" est invariable au pluriel — ne pas ajouter le 's' final
                const pluralize = (n: number, s: string) => {
                  const invariables = new Set(["mois", "fois", "pas"])
                  const suffix = invariables.has(s) || n <= 1 ? "" : "s"
                  return `${n} ${s}${suffix}`
                }
                if (depParCatMeta.nbFuture > 0 && depParCatMeta.nbPast > 0) return `Plage : ${pluralize(depParCatMeta.nbPast, "passé")} + ${pluralize(depParCatMeta.nbFuture, "projeté")}`
                if (depParCatMeta.nbFuture > 0) return `Plage : ${pluralize(depParCatMeta.nbFuture, "mois projeté")}`
                return `Plage : ${pluralize(depParCatMeta.nbPast, "mois")}`
              })()}
              expandable
              expandMode="tall"
              renderExpanded={() => {
                const realT = depParCat.filter((d: any) => !d.projected).reduce((s, d) => s + d.value, 0)
                const projT = depParCat.filter((d: any) => d.projected).reduce((s, d) => s + d.value, 0)
                return (
                  <BigPie
                    data={depParCat}
                    colors={depParCat.map((d: any, i) => d.projected ? "#ef4444" : PIE_CAT[i % PIE_CAT.length])}
                    total={realT + projT}
                    totalLabel="Dépenses totales"
                    formatter={v => `${Math.round(v).toLocaleString("fr-FR")} MUR`}
                    realTotal={realT}
                    projectedTotal={projT}
                  />
                )
              }}
            >
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={depParCat} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2} strokeWidth={0}
                    label={({ cx, cy, midAngle, outerRadius: or, name, value }: any) => {
                      const pct = depTotalAll > 0 ? ((value / depTotalAll) * 100).toFixed(0) : "0"
                      if (Number(pct) < 3) return null
                      const R = Math.PI / 180; const cos = Math.cos(-midAngle * R); const sin = Math.sin(-midAngle * R)
                      const mx = cx + (or + 12) * cos; const my = cy + (or + 12) * sin
                      const ex = cx + (or + 35) * cos; const ey = cy + (or + 35) * sin
                      const tx = ex + (cos >= 0 ? 4 : -4); const a = cos >= 0 ? "start" : "end"
                      const sn = name.length > 16 ? name.slice(0, 14) + "…" : name
                      return (<g><line x1={mx} y1={my} x2={ex} y2={ey} stroke="var(--text-muted)" strokeWidth={1} opacity={0.4} /><text x={tx} y={ey - 2} textAnchor={a} fill="var(--text-muted)" fontSize={9}>{sn}</text><text x={tx} y={ey + 10} textAnchor={a} fill="var(--text-primary)" fontSize={10} fontWeight={700} fontFamily="monospace">{pct}%</text></g>)
                    }} labelLine={false}>
                    {depParCat.map((_, i) => <Cell key={i} fill={PIE_CAT[i % PIE_CAT.length]} />)}
                  </Pie>
                  <Tooltip content={<CTooltip formatter={fmt} />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ── Row Revenus: mensuels + par type ── */}
          <div data-row="revenus" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16, order: 1 }}>
            <ChartCard
              title="Revenus mensuels"
              sub="Revenu net = Final Amount − Commission"
              value={`${Math.round(revTotalAll).toLocaleString("fr-FR")} MUR`}
              expandable
              right={
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Seg value={revMode} onChange={v => setRevMode(v as any)} options={[["total", "Total"], ["types", "Par types"]]} />
                  <ViewRangeToggle
                    mode={revViewMode} setMode={setRevViewMode}
                    past={revViewPast} setPast={setRevViewPast}
                    future={revViewFuture} setFuture={setRevViewFuture}
                    customStart={revViewCustomStart} setCustomStart={setRevViewCustomStart}
                    customEnd={revViewCustomEnd} setCustomEnd={setRevViewCustomEnd}
                    fyLabel={fy.label}
                  />
                  {(revViewMode === "future" || revViewMode === "custom") && (
                    <WinRateToggle mode={forecastWinMode} onChange={setForecastWinMode} />
                  )}
                </div>
              }
              renderExpanded={() => {
                const filterMois = revFsFilterMois
                const wonProjects = projects.filter(p => ["Won", "Active", "Completed", "Won orally"].includes(p.status) && getRevenueRaw(p) > 0)
                const allVentesMonths = [...new Set(wonProjects.map(p => dossierFromDate(getRevenueDateISO(p))).filter(Boolean))].sort().reverse()
                const listItems = (filterMois ? wonProjects.filter(p => dossierFromDate(getRevenueDateISO(p)) === filterMois) : wonProjects)
                  .slice()
                  .sort((a, b) => (getRevenueDateISO(b) || "").localeCompare(getRevenueDateISO(a) || ""))
                const listTotal = listItems.reduce((s, p) => s + getRevenueMUR(p), 0)
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", width: "100%", minHeight: 0 }}>
                    {/* Chart + légende en haut */}
                    <div
                      ref={revChartRef}
                      style={{ flexShrink: 0, cursor: "pointer" }}
                    >
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart
                          data={revMode === "types" ? revParMoisParType.data : revParMois}
                          onMouseMove={(e: any) => {
                            const code = e?.activePayload?.[0]?.payload?.mois
                            if (code) {
                              hoverRevRef.current = code
                              if (code !== hoverRevMois) setHoverRevMois(code)
                            }
                          }}
                          onMouseLeave={() => { hoverRevRef.current = null; setHoverRevMois(null) }}
                          style={{ cursor: "pointer" }}
                        >
                          <defs>
                            <linearGradient id="gRev2Fs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A6C9CE" stopOpacity={0.4} /><stop offset="100%" stopColor="#A6C9CE" stopOpacity={0.02} /></linearGradient>
                            {revParMoisParType.types.map((t, i) => {
                              const color = PIE_TYPE[i % PIE_TYPE.length]
                              return <linearGradient key={t} id={`gRevTypeFs${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.5} /><stop offset="100%" stopColor={color} stopOpacity={0.05} /></linearGradient>
                            })}
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.08)" />
                          <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                          <Tooltip content={<RevenueTooltip ventesListByMois={{ ...ventesListByMois, __showAll: true } as any} />} />
                          {revMode === "total" ? (
                            <>
                              <Area type="monotone" dataKey="revenusPast" stroke="#A6C9CE" strokeWidth={2} fill="url(#gRev2Fs)" dot={{ r: 3, fill: "#A6C9CE", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#A6C9CE", strokeWidth: 0 }} connectNulls={false} />
                              <Area type="monotone" dataKey="revenusFuture" stroke="#A6C9CE" strokeWidth={2} strokeDasharray="5 4" fill="url(#gRev2Fs)" fillOpacity={0.4} dot={{ r: 3, fill: "#A6C9CE", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#A6C9CE", strokeWidth: 0 }} connectNulls={false} />
                            </>
                          ) : (
                            <>
                              {revParMoisParType.types.map((t, i) => (
                                <Area key={`${t}-p`} type="monotone" dataKey={`${t}__past`} stackId="revtypesfsPast" stroke={PIE_TYPE[i % PIE_TYPE.length]} strokeWidth={1} fill={`url(#gRevTypeFs${i})`} connectNulls={false} />
                              ))}
                              {revParMoisParType.types.map((t, i) => (
                                <Area key={`${t}-f`} type="monotone" dataKey={`${t}__future`} stackId="revtypesfsFuture" stroke={PIE_TYPE[i % PIE_TYPE.length]} strokeWidth={1} strokeDasharray="5 4" fill={`url(#gRevTypeFs${i})`} fillOpacity={0.4} connectNulls={false} />
                              ))}
                            </>
                          )}
                          {currentRevMois && <ReferenceLine x={fmtDossier(currentRevMois)} stroke="rgba(166,201,206,0.4)" strokeWidth={1} strokeDasharray="3 3" />}
                        </AreaChart>
                      </ResponsiveContainer>
                      {/* Légende sous le chart */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "10px 0 0", borderTop: "1px solid rgba(166,201,206,0.08)", marginTop: 8 }}>
                        {revMode === "types" ? (
                          revParMoisParType.types.map((t, i) => (
                            <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-2xs)" }}>
                              <span style={{ width: 10, height: 10, borderRadius: 2, background: PIE_TYPE[i % PIE_TYPE.length] }} />
                              <span style={{ color: "var(--text-secondary)" }}>{t}</span>
                            </div>
                          ))
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-2xs)" }}>
                            <span style={{ width: 10, height: 10, borderRadius: 2, background: "#A6C9CE" }} />
                            <span style={{ color: "var(--text-secondary)" }}>Revenus totaux</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Liste en bas avec filtre mois */}
                    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg-card)", border: "1px solid rgba(166,201,206,0.12)", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 16px", borderBottom: "1px solid rgba(166,201,206,0.12)", flexShrink: 0, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
                            {listItems.length} vente{listItems.length > 1 ? "s" : ""}
                          </div>
                          <div style={{ fontSize: "var(--fs-xs)", color: "var(--accent)", fontFamily: "monospace", fontWeight: 700 }}>
                            {Math.round(listTotal).toLocaleString("fr-FR")} MUR
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontWeight: 500 }}>Filtrer par mois :</label>
                          <select
                            value={revFsFilterMois}
                            onChange={e => setRevFsFilterMois(e.target.value)}
                            style={{ padding: "4px 8px", fontSize: "var(--fs-2xs)", background: "rgba(166,201,206,0.06)", border: "1px solid rgba(166,201,206,0.12)", borderRadius: 4, color: "var(--text-primary)", fontFamily: "inherit", outline: "none" }}
                          >
                            <option value="">Tous les mois</option>
                            {allVentesMonths.map(c => <option key={c} value={c}>{fmtDossier(c)}</option>)}
                          </select>
                          {revFsFilterMois && (
                            <button
                              onClick={() => setRevFsFilterMois("")}
                              style={{ background: "none", border: "1px solid var(--border-subtle)", color: "var(--text-muted)", cursor: "pointer", fontSize: "var(--fs-2xs)", padding: "4px 8px", borderRadius: 4, fontFamily: "inherit" }}
                            >
                              Réinitialiser
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
                          <thead style={{ position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 2 }}>
                            <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.15)" }}>
                              {["Date", "Projet", "Client", "Type", "Status", "Montant", "MUR"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {listItems.length === 0 ? (
                              <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontStyle: "italic" }}>Aucune vente pour ce filtre</td></tr>
                            ) : listItems.map((p, i) => {
                              const c = (p.type && projectTypeColors[p.type]) || "#A6C9CE"
                              return (
                                <tr key={p.id || i} onClick={() => setEditProject(p)} style={{ borderBottom: "1px solid rgba(166,201,206,0.05)", cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                  <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--text-muted)" }}>{getRevenueDateISO(p) || "—"}</td>
                                  <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</td>
                                  <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{p.clientName}</td>
                                  <td style={tdStyle}>
                                    {p.type ? (
                                      <span style={{ background: `${c}22`, color: c, padding: "2px 8px", borderRadius: 4, fontSize: "var(--fs-2xs)", fontWeight: 600 }}>{p.type}</span>
                                    ) : "—"}
                                  </td>
                                  <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{p.status}</td>
                                  <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 600 }}>{Math.round(getRevenueRaw(p)).toLocaleString("fr-FR")} {p.currency}</td>
                                  <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 700, color: "var(--accent)" }}>{Math.round(getRevenueMUR(p)).toLocaleString("fr-FR")}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              }}
            >
              <div
                ref={revChartRef}
                style={{ position: "relative" }}
              >
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart
                    data={revMode === "types" ? revParMoisParType.data : revParMois}
                    onMouseMove={(e: any) => {
                      const code = e?.activePayload?.[0]?.payload?.mois
                      if (code) {
                        hoverRevRef.current = code
                        if (code !== hoverRevMois) setHoverRevMois(code)
                      }
                    }}
                    onMouseLeave={() => { hoverRevRef.current = null; setHoverRevMois(null) }}
                  >
                    <defs>
                      <linearGradient id="gRev2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A6C9CE" stopOpacity={0.4} /><stop offset="100%" stopColor="#A6C9CE" stopOpacity={0.02} /></linearGradient>
                      {revParMoisParType.types.map((t, i) => {
                        const color = PIE_TYPE[i % PIE_TYPE.length]
                        return <linearGradient key={t} id={`gRevType${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.5} /><stop offset="100%" stopColor={color} stopOpacity={0.05} /></linearGradient>
                      })}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.08)" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                    <Tooltip content={<RevenueTooltip ventesListByMois={ventesListByMois} />} />
                    {revMode === "total" ? (
                      <>
                        <Area type="monotone" dataKey="revenusPast" stroke="#A6C9CE" strokeWidth={2} fill="url(#gRev2)" dot={{ r: 3, fill: "#A6C9CE", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#A6C9CE", strokeWidth: 0 }} connectNulls={false} />
                        <Area type="monotone" dataKey="revenusFuture" stroke="#A6C9CE" strokeWidth={2} strokeDasharray="5 4" fill="url(#gRev2)" fillOpacity={0.4} dot={{ r: 3, fill: "#A6C9CE", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#A6C9CE", strokeWidth: 0 }} connectNulls={false} />
                      </>
                    ) : (
                      <>
                        {revParMoisParType.types.map((t, i) => (
                          <Area key={`${t}-p`} type="monotone" dataKey={`${t}__past`} stackId="revtypesPast" stroke={PIE_TYPE[i % PIE_TYPE.length]} strokeWidth={1} fill={`url(#gRevType${i})`} connectNulls={false} />
                        ))}
                        {revParMoisParType.types.map((t, i) => (
                          <Area key={`${t}-f`} type="monotone" dataKey={`${t}__future`} stackId="revtypesFuture" stroke={PIE_TYPE[i % PIE_TYPE.length]} strokeWidth={1} strokeDasharray="5 4" fill={`url(#gRevType${i})`} fillOpacity={0.4} connectNulls={false} />
                        ))}
                      </>
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title="Revenus par type de projet"
              sub={(() => {
                // "mois" est invariable au pluriel — ne pas ajouter le 's' final
                const pluralize = (n: number, s: string) => {
                  const invariables = new Set(["mois", "fois", "pas"])
                  const suffix = invariables.has(s) || n <= 1 ? "" : "s"
                  return `${n} ${s}${suffix}`
                }
                if (projParTypeMeta.nbFuture > 0 && projParTypeMeta.nbPast > 0) return `Plage : ${pluralize(projParTypeMeta.nbPast, "passé")} + ${pluralize(projParTypeMeta.nbFuture, "projeté")}`
                if (projParTypeMeta.nbFuture > 0) return `Plage : ${pluralize(projParTypeMeta.nbFuture, "mois projeté")}`
                return `Plage : ${pluralize(projParTypeMeta.nbPast, "mois")}`
              })()}
              expandable
              expandMode="tall"
              renderExpanded={() => {
                const realT = projParTypeFiltered.reduce((s, e: any) => s + (e.realAmount || 0), 0)
                const projT = projParTypeFiltered.reduce((s, e: any) => s + (e.projectedAmount || 0), 0)
                const realC = projParTypeFiltered.reduce((s, e: any) => s + (e.realCount || 0), 0)
                const projC = projParTypeFiltered.reduce((s, e: any) => s + (e.projectedCount || 0), 0)
                return (
                  <BigPie
                    data={projParTypeFiltered}
                    colors={projParTypeFiltered.map((_, i) => PIE_TYPE[i % PIE_TYPE.length])}
                    total={realT + projT}
                    totalLabel="Revenus totaux"
                    formatter={v => `${Math.round(v).toLocaleString("fr-FR")} MUR`}
                    double
                    realTotal={realT}
                    projectedTotal={projT}
                    realCount={realC}
                    projectedCount={projC}
                  />
                )
              }}
            >
              <div style={{ position: "relative" }}>
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={projParTypeFiltered} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={72} outerRadius={100} paddingAngle={2} strokeWidth={0}
                      label={({ cx, cy, midAngle, outerRadius: or, name, value }: any) => {
                        const total = projParTypeFiltered.reduce((s: number, e: any) => s + e.amount, 0)
                        const pct = total > 0 ? ((value / total) * 100).toFixed(0) : "0"
                        if (Number(pct) < 4) return null
                        const R = Math.PI / 180; const cos = Math.cos(-midAngle * R); const sin = Math.sin(-midAngle * R)
                        const mx = cx + (or + 10) * cos; const my = cy + (or + 10) * sin
                        const ex = cx + (or + 30) * cos; const ey = cy + (or + 30) * sin
                        const tx = ex + (cos >= 0 ? 4 : -4); const a = cos >= 0 ? "start" : "end"
                        return (<g><line x1={mx} y1={my} x2={ex} y2={ey} stroke="var(--text-muted)" strokeWidth={1} opacity={0.4} /><text x={tx} y={ey - 2} textAnchor={a} fill="var(--text-muted)" fontSize={9}>{name}</text><text x={tx} y={ey + 10} textAnchor={a} fill="var(--text-primary)" fontSize={10} fontWeight={700} fontFamily="monospace">{pct}%</text></g>)
                      }} labelLine={false}>
                      {projParTypeFiltered.map((_, i) => <Cell key={i} fill={PIE_TYPE[i % PIE_TYPE.length]} />)}
                    </Pie>
                    <Pie data={projParTypeFiltered} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={2} strokeWidth={0}>
                      {projParTypeFiltered.map((_, i) => <Cell key={i} fill={PIE_TYPE[i % PIE_TYPE.length]} opacity={0.5} />)}
                    </Pie>
                    <Tooltip content={<CTooltip formatter={(v: any) => Number(v) > 100 ? `${Math.round(Number(v)).toLocaleString("fr-FR")} MUR` : `${v} projets`} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>{projParTypeFiltered.reduce((s, e) => s + e.count, 0)}</div>
                  <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 2 }}>projets</div>
                </div>
              </div>
            </ChartCard>
          </div>

          </div>
          {/* ── Fin wrapper flex Revenus/Dépenses ── */}

          {/* ── Row 3: Top fournisseurs/clients + Rentabilité ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <ChartCard
              title={topMode === "clients" ? "Top Clients" : "Top Fournisseurs"}
              expandable
              expandMode="tall"
              right={<Seg value={topMode} onChange={v => setTopMode(v as any)} options={[["clients", "Clients"], ["fournisseurs", "Fournisseurs"]]} />}
              renderExpanded={() => (
                <TopDetailView
                  mode={topMode}
                  clients={allClients}
                  fournisseurs={allFourn}
                  onSelectItem={(name) => setTopDetailItem({ mode: topMode, name })}
                />
              )}
            >
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                <ResponsiveContainer width="100%" height={Math.max(260, topData.length * 32)}>
                  <BarChart data={topData as any[]} layout="vertical" margin={{ left: 20 }} style={{ cursor: "pointer" }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.08)" />
                    <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "var(--text-secondary)", fontSize: 12 }} width={130} axisLine={false} tickLine={false} />
                    <Tooltip content={<TopBarTooltip mode={topMode} types={allProjectTypes} typeColors={allProjectTypes.map((_, i) => PIE_TYPE[i % PIE_TYPE.length])} />} />
                    {topMode === "clients" ? (
                      allProjectTypes.map((t, i) => (
                        <Bar
                          key={t}
                          dataKey={t}
                          stackId="clients"
                          fill={PIE_TYPE[i % PIE_TYPE.length]}
                          barSize={16}
                          radius={i === allProjectTypes.length - 1 ? [0, 6, 6, 0] : 0}
                          onClick={(d: any) => { if (d?.name) setTopDetailItem({ mode: "clients", name: d.name }) }}
                          style={{ cursor: "pointer" }}
                        />
                      ))
                    ) : (
                      <Bar
                        dataKey="value"
                        radius={[0, 6, 6, 0]}
                        barSize={16}
                        onClick={(d: any) => { if (d?.name) setTopDetailItem({ mode: "fournisseurs", name: d.name }) }}
                        style={{ cursor: "pointer" }}
                      >
                        {topData.map((d: any, i: number) => (
                          <Cell key={i} fill={d.color || "#A6C9CE"} />
                        ))}
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title="Rentabilité projets"
              sub={rentaMode === "projects" ? "Montant vs marge — couleur = type" : "Moyenne par type — taille = nb projets"}
              right={<Seg value={rentaMode} onChange={v => setRentaMode(v as any)} options={[["projects", "Par projet"], ["types", "Par type"]]} />}
            >
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.08)" />
                  <XAxis type="number" dataKey="x" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                  <YAxis type="number" dataKey="y" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} unit="%" />
                  <ZAxis type="number" dataKey="z" range={rentaMode === "types" ? [200, 900] : [60, 200]} />
                  <Tooltip content={<RentaTooltip />} />
                  {rentaMode === "projects" ? (
                    <Scatter data={rentaData} fill="#A6C9CE">{rentaData.map((e, i) => <Cell key={i} fill={projectTypeColors[e.type] || "#A6C9CE"} />)}</Scatter>
                  ) : (
                    <Scatter data={rentaByType} fill="#A6C9CE">{rentaByType.map((e, i) => <Cell key={i} fill={projectTypeColors[e.type] || "#A6C9CE"} />)}</Scatter>
                  )}
                </ScatterChart>
              </ResponsiveContainer>
              {/* Légende types */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "10px 0 0", marginTop: 8, borderTop: "1px solid rgba(166,201,206,0.08)" }}>
                {allProjectTypes.map(t => (
                  <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-2xs)" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: projectTypeColors[t] }} />
                    <span style={{ color: "var(--text-secondary)" }}>{t}</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          {/* ── Table: Ventes / Dépenses ── */}
          <ChartCard
            title={tableMode === "ventes" ? "Dernières ventes" : "Dernières dépenses"}
            expandable
            right={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {tableMode === "ventes" && (
                  <button
                    onClick={() => setShowAddVente(true)}
                    style={{
                      background: "var(--btn-add-bg)", color: "var(--btn-add-color)", border: `1px solid var(--btn-add-border)`,
                      borderRadius: 6, padding: "4px 12px", fontSize: "var(--fs-2xs)", fontWeight: 600,
                      cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    + Ajouter une vente
                  </button>
                )}
                <Seg value={tableMode} onChange={v => setTableMode(v as any)} options={[["ventes", "Ventes"], ["depenses", "Dépenses"]]} />
              </div>
            }
          >
            <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto" }}>
              {tableMode === "depenses" ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg-panel)" }}>
                    <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.08)" }}>
                      {["Date", "Description", "Fournisseur", "Montant", "Catégorie"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                    </tr>
                    <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.12)" }}>
                      <th style={filterCellStyle}>
                        <select value={depenseFilters.date || ""} onChange={e => setDepenseFilters(f => ({ ...f, date: e.target.value }))} style={filterInputStyle}>
                          <option value="">Tous les mois</option>
                          {depensesMonthOptions.map(m => <option key={m} value={m}>{fmtMonthLabel(m)}</option>)}
                        </select>
                      </th>
                      <th style={filterCellStyle}><input placeholder="Rechercher..." value={depenseFilters.description || ""} onChange={e => setDepenseFilters(f => ({ ...f, description: e.target.value }))} style={filterInputStyle} /></th>
                      <th style={filterCellStyle}><input placeholder="Rechercher..." value={depenseFilters.fournisseur || ""} onChange={e => setDepenseFilters(f => ({ ...f, fournisseur: e.target.value }))} style={filterInputStyle} /></th>
                      <th style={filterCellStyle} />
                      <th style={filterCellStyle}>
                        <select value={depenseFilters.categorie || ""} onChange={e => setDepenseFilters(f => ({ ...f, categorie: e.target.value }))} style={filterInputStyle}>
                          <option value="">Toutes</option>
                          {CATEGORIE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </th>
                    </tr>
                  </thead>
                  <tbody>{filteredDep.map((d, i) => (
                    <tr key={d.id || i} onClick={() => setEditDepense(d)} style={{ borderBottom: "1px solid rgba(166,201,206,0.05)", cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--text-muted)" }}>{d.date || "—"}</td>
                      <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.description}</td>
                      <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{d.fournisseur}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, fontFamily: "monospace" }}>{d.montant.toLocaleString("fr-FR")} {d.devise}</td>
                      <td style={tdStyle}>{d.categorie ? (() => { const c = depCategoryColors[d.categorie] || "#6b7280"; return <span style={{ background: `${c}22`, color: c, padding: "2px 8px", borderRadius: 4, fontSize: "var(--fs-2xs)", fontWeight: 600 }}>{d.categorie}</span> })() : "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg-panel)" }}>
                    <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.08)" }}>
                      {["Date", "Projet", "Client", "Montant", "Type", "Status"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                    </tr>
                    <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.12)" }}>
                      <th style={filterCellStyle}>
                        <select value={venteFilters.date || ""} onChange={e => setVenteFilters(f => ({ ...f, date: e.target.value }))} style={filterInputStyle}>
                          <option value="">Tous les mois</option>
                          {ventesMonthOptions.map(m => <option key={m} value={m}>{fmtMonthLabel(m)}</option>)}
                        </select>
                      </th>
                      <th style={filterCellStyle}><input placeholder="Rechercher..." value={venteFilters.projet || ""} onChange={e => setVenteFilters(f => ({ ...f, projet: e.target.value }))} style={filterInputStyle} /></th>
                      <th style={filterCellStyle}><input placeholder="Rechercher..." value={venteFilters.client || ""} onChange={e => setVenteFilters(f => ({ ...f, client: e.target.value }))} style={filterInputStyle} /></th>
                      <th style={filterCellStyle} />
                      <th style={filterCellStyle}>
                        <select value={venteFilters.type || ""} onChange={e => setVenteFilters(f => ({ ...f, type: e.target.value }))} style={filterInputStyle}>
                          <option value="">Tous</option>
                          {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </th>
                      <th style={filterCellStyle}>
                        <select value={venteFilters.status || ""} onChange={e => setVenteFilters(f => ({ ...f, status: e.target.value }))} style={filterInputStyle}>
                          <option value="">Tous</option>
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </th>
                    </tr>
                  </thead>
                  <tbody>{filteredVentes.map((p, i) => (
                    <tr key={p.id || i} onClick={() => setEditProject(p)} style={{ borderBottom: "1px solid rgba(166,201,206,0.05)", cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--text-muted)" }}>{getRevenueDateISO(p) || "—"}</td>
                      <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</td>
                      <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{p.clientName}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, fontFamily: "monospace" }}>{Math.round(getRevenueRaw(p)).toLocaleString("fr-FR")} {p.currency}</td>
                      <td style={tdStyle}>{p.type ? (() => { const c = projectTypeColors[p.type] || "#A6C9CE"; return <span style={{ background: `${c}22`, color: c, padding: "2px 8px", borderRadius: 4, fontSize: "var(--fs-2xs)", fontWeight: 600 }}>{p.type}</span> })() : "—"}</td>
                      <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{p.status}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", padding: "8px 16px", borderTop: "1px solid rgba(166,201,206,0.08)" }}>
              {tableMode === "ventes" ? `${filteredVentes.length} vente(s)` : `${filteredDep.length} dépense(s)`}
            </div>
          </ChartCard>

          {/* ── Cash / PNL ── */}
          <div style={{ ...card, marginTop: 24, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid rgba(166,201,206,0.08)", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: "var(--fs-md)", fontWeight: 600, color: "var(--text-primary)" }}>💵 Cash &amp; PNL</div>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                  CA → Revenu net → Marge brute → EBITDA
                  {cashData.rangeInfo.nbFuture > 0 && cashData.rangeInfo.nbPast > 0 && ` · ${cashData.rangeInfo.nbPast} passé${cashData.rangeInfo.nbPast > 1 ? "s" : ""} + ${cashData.rangeInfo.nbFuture} projeté${cashData.rangeInfo.nbFuture > 1 ? "s" : ""}`}
                  {cashData.rangeInfo.nbFuture > 0 && cashData.rangeInfo.nbPast === 0 && ` · ${cashData.rangeInfo.nbFuture} mois projeté${cashData.rangeInfo.nbFuture > 1 ? "s" : ""}`}
                  {cashData.rangeInfo.nbFuture === 0 && ` · ${cashData.rangeInfo.nbPast} mois`}
                </div>
              </div>
              <ViewRangeToggle
                mode={cashViewMode} setMode={setCashViewMode}
                past={cashViewPast} setPast={setCashViewPast}
                future={cashViewFuture} setFuture={setCashViewFuture}
                customStart={cashViewCustomStart} setCustomStart={setCashViewCustomStart}
                customEnd={cashViewCustomEnd} setCustomEnd={setCashViewCustomEnd}
                fyLabel={fy.label}
              />
            </div>

            {/* Ligne 1 : Revenus */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, borderBottom: "1px solid rgba(166,201,206,0.08)" }}>
              <div style={{ padding: "18px 24px", borderRight: "1px solid rgba(166,201,206,0.08)" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>CA (Chiffre d'Affaires)</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", fontFamily: "monospace" }}>{Math.round(cashData.caTotal).toLocaleString("fr-FR")}</span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>MUR</span>
                </div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>Σ Final Amount (= 100 %)</div>
              </div>
              <div style={{ padding: "18px 24px", borderRight: "1px solid rgba(166,201,206,0.08)" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>− Commissions versées</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: "#f97316", fontFamily: "monospace" }}>−{Math.round(cashData.commissionsTotal).toLocaleString("fr-FR")}</span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>MUR</span>
                </div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>{cashData.caTotal > 0 ? ((cashData.commissionsTotal / cashData.caTotal) * 100).toFixed(1) : "0"} % · {cashData.beneficiaires.length} bénéficiaire(s)</div>
              </div>
              <div style={{ padding: "18px 24px" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>= Revenu net</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)", fontFamily: "monospace" }}>{Math.round(cashData.revenuNet).toLocaleString("fr-FR")}</span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>MUR</span>
                </div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>Ce qu'Eqxia conserve · {cashData.margeNettePct.toFixed(1)} % du CA</div>
              </div>
            </div>

            {/* Ligne 2 : Charges & Marges */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
              <div style={{ padding: "18px 24px", borderRight: "1px solid rgba(166,201,206,0.08)" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>− Dépenses</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: "#ef4444", fontFamily: "monospace" }}>−{Math.round(cashData.depAll).toLocaleString("fr-FR")}</span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>MUR</span>
                </div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>Tous postes · {depenses.length} dépense(s)</div>
              </div>
              <div style={{ padding: "18px 24px", borderRight: "1px solid rgba(166,201,206,0.08)" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>= Marge brute</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: cashData.margeBrute >= 0 ? "#22c55e" : "#ef4444", fontFamily: "monospace" }}>{Math.round(cashData.margeBrute).toLocaleString("fr-FR")}</span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>MUR</span>
                </div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>Revenu net − Dépenses</div>
              </div>
              <div style={{ padding: "18px 24px", borderRight: "1px solid rgba(166,201,206,0.08)" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>− Salaires</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: "#f97316", fontFamily: "monospace" }}>−{Math.round(cashData.salAll).toLocaleString("fr-FR")}</span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>MUR</span>
                </div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>Σ(CJE × 220/12) × mois</div>
              </div>
              <div style={{ padding: "18px 24px" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>= EBITDA</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: cashData.ebitda >= 0 ? "#22c55e" : "#ef4444", fontFamily: "monospace" }}>{Math.round(cashData.ebitda).toLocaleString("fr-FR")}</span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>MUR</span>
                </div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>Marge EBITDA : <span style={{ fontWeight: 700, color: cashData.margeEbitdaPct >= 0 ? "#22c55e" : "#ef4444", fontFamily: "monospace" }}>{cashData.margeEbitdaPct.toFixed(1)} %</span></div>
              </div>
            </div>

            {cashData.beneficiaires.length > 0 ? (
              <div style={{ borderTop: "1px solid rgba(166,201,206,0.12)" }}>
                <div style={{ padding: "12px 24px 8px", fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Détails commissions par bénéficiaire</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.08)" }}>
                      <th style={thStyle}>Bénéficiaire</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Projets</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Taux</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Montant (MUR)</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>% du CA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashData.beneficiaires.map((b, i) => (
                      <tr
                        key={b.name}
                        onClick={() => setCommissionnaireDetail(b.name)}
                        style={{ borderBottom: i < cashData.beneficiaires.length - 1 ? "1px solid rgba(166,201,206,0.05)" : undefined, cursor: "pointer", transition: "background 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <td style={{ ...tdStyle, fontWeight: 500 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f97316" }} />
                            {b.name}
                          </div>
                          {b.projects.length > 0 && (
                            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 3, marginLeft: 16 }}>
                              {b.projects.slice(0, 3).map(p => p.name).join(" · ")}{b.projects.length > 3 ? ` · +${b.projects.length - 3}` : ""}
                            </div>
                          )}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "var(--text-secondary)" }}>{b.projectCount}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "var(--text-secondary)" }}>{b.percent.toFixed(1)} %</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#f97316" }}>{Math.round(b.total).toLocaleString("fr-FR")}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "var(--text-muted)" }}>{cashData.caTotal > 0 ? ((b.total / cashData.caTotal) * 100).toFixed(2) : "0"} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: "16px 24px", fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontStyle: "italic", borderTop: "1px solid rgba(166,201,206,0.08)" }}>
                Aucune commission enregistrée sur les projets. Les champs `Commission %` et `Commissionnaire` de la DB Projects sont lus automatiquement s'ils existent.
              </div>
            )}
          </div>

          {/* ── Database Review Critical ── */}
          <div style={{ ...card, marginTop: 24, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid rgba(166,201,206,0.08)" }}>
              <div>
                <div style={{ fontSize: "var(--fs-md)", fontWeight: 600, color: "var(--text-primary)" }}>🩺 Database Review Critical</div>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: 2 }}>Santé des fiches projets dans Notion · clic pour compléter</div>
              </div>
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>{healthStats.total} projet(s) analysé(s)</div>
            </div>

            {/* KPIs Health — lu depuis la formule Notion */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
              <div style={{ padding: "18px 20px", borderRight: "1px solid rgba(166,201,206,0.08)" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total projets</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", fontFamily: "monospace", marginTop: 6 }}>{healthStats.total}</div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>Valeurs Notion (Health)</div>
              </div>
              <div style={{ padding: "18px 20px", borderRight: "1px solid rgba(166,201,206,0.08)" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={12} color="#22c55e" /> OK</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#22c55e", fontFamily: "monospace", marginTop: 6 }}>{healthStats.ok}</div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>
                  {healthStats.total > 0 ? Math.round((healthStats.ok / healthStats.total) * 100) : 0} % des projets
                </div>
              </div>
              <div style={{ padding: "18px 20px", borderRight: "1px solid rgba(166,201,206,0.08)" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 4 }}><AlertTriangle size={12} color="#facc15" /> Warning</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#facc15", fontFamily: "monospace", marginTop: 6 }}>{healthStats.warning}</div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>
                  {healthStats.total > 0 ? Math.round((healthStats.warning / healthStats.total) * 100) : 0} % des projets
                </div>
              </div>
              <div style={{ padding: "18px 20px" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 4 }}><XCircle size={12} color="#ef4444" /> Critical</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#ef4444", fontFamily: "monospace", marginTop: 6 }}>{healthStats.critical}</div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>
                  {healthStats.total > 0 ? Math.round((healthStats.critical / healthStats.total) * 100) : 0} % des projets
                </div>
              </div>
            </div>

            {/* Top champs manquants (parmi les Critical) */}
            {healthStats.topMissing.length > 0 && (
              <div style={{ padding: "12px 24px", borderTop: "1px solid rgba(166,201,206,0.08)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Top champs manquants (Critical) :</div>
                {healthStats.topMissing.map(([field, count]) => (
                  <span key={field} style={{ fontSize: "var(--fs-2xs)", color: "var(--text-primary)", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                    {field} <span style={{ color: "var(--text-muted)", fontFamily: "monospace", marginLeft: 4 }}>× {count}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Filtre + listing */}
            <div style={{ borderTop: "1px solid rgba(166,201,206,0.12)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px", flexWrap: "wrap", gap: 12 }}>
                <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
                  {filteredHealth.length} projet(s) à compléter
                </div>
                <Seg
                  value={healthFilter}
                  onChange={v => setHealthFilter(v as any)}
                  options={[["critical", "Critical"], ["warning", "Warning"], ["all", "Tous"]]}
                />
              </div>
              {filteredHealth.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: "var(--fs-sm)", fontStyle: "italic" }}>
                  🎉 Aucun projet dans cette catégorie
                </div>
              ) : (
                <div style={{ maxHeight: 500, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
                    <thead style={{ position: "sticky", top: 0, background: "var(--bg-panel)", zIndex: 2 }}>
                      <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.15)" }}>
                        <th style={{ ...thStyle, width: 120 }}>Santé (Notion)</th>
                        <th style={{ ...thStyle, width: 80 }}>Type</th>
                        <th style={thStyle}>Projet</th>
                        <th style={thStyle}>Client</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Champs manquants</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHealth.map(({ project: p, healthLabel, isCritical, isWarning, isOK, missing, isInternal }, i) => {
                        const color = isCritical ? "#ef4444" : isWarning ? "#facc15" : isOK ? "#22c55e" : "var(--text-muted)"
                        return (
                          <tr
                            key={p.id || i}
                            onClick={() => { setEditProjectMissing(missing); setEditProject(p) }}
                            style={{ borderBottom: "1px solid rgba(166,201,206,0.05)", cursor: "pointer", transition: "background 0.15s" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          >
                            <td style={tdStyle}>
                              <span style={{ fontSize: "var(--fs-2xs)", fontWeight: 700, color, background: `${color === "var(--text-muted)" ? "rgba(166,201,206,0.1)" : color + "22"}`, padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>
                                {healthLabel || "—"}
                              </span>
                            </td>
                            <td style={tdStyle}>
                              {isInternal && <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", background: "rgba(166,201,206,0.1)", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>Internal</span>}
                              {!isInternal && p.type && <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-secondary)" }}>{p.type}</span>}
                            </td>
                            <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name || <em style={{ color: "var(--color-error)" }}>(sans nom)</em>}</td>
                            <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{p.clientName || "—"}</td>
                            <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{p.status || "—"}</td>
                            <td style={tdStyle}>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {missing.map(f => (
                                  <span key={f} style={{ fontSize: "var(--fs-2xs)", background: "rgba(239,68,68,0.15)", color: "#ef4444", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>{f}</span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div style={{ textAlign: "center", padding: "12px 0 24px", color: "var(--text-muted)", fontSize: "var(--fs-2xs)" }}>{projects.length} projets · {depenses.length} dépenses · {employees.length} employés · Données Notion en temps réel</div>
          </>
          )}
        </main>
      </div>

      {/* Theme toggle — style Themis */}
      <div style={{ position: "fixed", bottom: 20, left: 20, zIndex: 100, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ position: "relative" }}>
          {themeOpen && (
            <>
              <div onClick={() => setThemeOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 98 }} />
              <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 4, zIndex: 99, background: "var(--bg-panel)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid var(--border-panel)", borderRadius: 10, padding: 4, boxShadow: "var(--shadow-card)" }}>
                {(["auto", "dark", "light"] as const).map(m => {
                  const ThemeIcon = { auto: Monitor, dark: Moon, light: Sun }[m]
                  const active = mode === m
                  return (
                    <button key={m} onClick={() => { setTheme(m); setThemeOpen(false) }} style={{ width: 36, height: 36, background: active ? "var(--accent-soft)" : "none", border: "none", borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s", opacity: active ? 1 : 0.5 }}>
                      <ThemeIcon size={15} />
                    </button>
                  )
                })}
              </div>
            </>
          )}
          <button onClick={() => setThemeOpen(!themeOpen)} title="Thème" style={{ width: 36, height: 36, background: "var(--bg-panel)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid var(--border-panel)", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-card)", transition: "opacity 0.2s" }}>
            {{ auto: <Monitor size={15} />, dark: <Moon size={15} />, light: <Sun size={15} /> }[mode]}
          </button>
        </div>
      </div>

      {/* ── Modals ── */}
      {editProject && (
        <ProjectModal
          project={editProject}
          clients={clients}
          employees={employees}
          missing={editProjectMissing}
          onClose={() => { setEditProject(null); setEditProjectMissing(undefined) }}
          onSave={handleSaveProject}
          saving={saving}
        />
      )}

      {showAddVente && (
        <ProjectModal
          project={null}
          clients={clients}
          employees={employees}
          onClose={() => setShowAddVente(false)}
          onSave={handleSaveProject}
          saving={saving}
        />
      )}

      {editDepense && (
        <DepenseModal
          depense={editDepense}
          onClose={() => setEditDepense(null)}
          onSave={handleSaveDepense}
          saving={saving}
        />
      )}

      {topDetailItem && (
        <TopItemDetailModal
          mode={topDetailItem.mode}
          name={topDetailItem.name}
          projects={topDetailItem.mode === "clients" ? (allClients.find(c => c.name === topDetailItem.name)?.projects ?? []) : []}
          depenses={topDetailItem.mode === "fournisseurs" ? depenses.filter(d => d.fournisseur === topDetailItem.name) : []}
          depCategoryColors={depCategoryColors}
          projectTypeColors={projectTypeColors}
          onClose={() => setTopDetailItem(null)}
          onSelectProject={(p) => { setTopDetailItem(null); setEditProject(p) }}
          onSelectDepense={(d) => { setTopDetailItem(null); setEditDepense(d) }}
        />
      )}

      {commissionnaireDetail && (() => {
        const list = projects.filter(p => (p.commissionTo || "").trim() === commissionnaireDetail)
        const totalCA = list.reduce((s, p) => s + getCAMUR(p), 0)
        const totalCom = list.reduce((s, p) => s + getCommissionMUR(p), 0)
        return (
          <div style={modalOverlay} onClick={() => setCommissionnaireDetail(null)}>
            <div style={{ ...modalBox, maxWidth: 760 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: "var(--fs-lg)", fontWeight: 700 }}>Commissions — {commissionnaireDetail}</div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: 4 }}>
                    {list.length} projet{list.length > 1 ? "s" : ""} · CA total {Math.round(totalCA).toLocaleString("fr-FR")} MUR · Commission totale {Math.round(totalCom).toLocaleString("fr-FR")} MUR
                  </div>
                </div>
                <button onClick={() => setCommissionnaireDetail(null)} style={{ background: "transparent", border: "1px solid var(--border-subtle)", color: "var(--text-muted)", cursor: "pointer", padding: "4px 10px", borderRadius: "var(--radius-btn)", fontSize: "var(--fs-xs)" }}>✕</button>
              </div>
              <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.15)" }}>
                      <th style={thStyle}>Projet</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>CA (MUR)</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Taux</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Commission (MUR)</th>
                      <th style={thStyle}>Date fin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.sort((a, b) => getCommissionMUR(b) - getCommissionMUR(a)).map(p => (
                      <tr key={p.id} onClick={() => { setCommissionnaireDetail(null); setEditProject(p) }} style={{ borderBottom: "1px solid rgba(166,201,206,0.06)", cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>{p.name}<div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>{p.clientName}</div></td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{Math.round(getCAMUR(p)).toLocaleString("fr-FR")}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "var(--text-muted)" }}>{(getCommissionRate(p) * 100).toFixed(1)} %</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#f97316" }}>{Math.round(getCommissionMUR(p)).toLocaleString("fr-FR")}</td>
                        <td style={{ ...tdStyle, color: "var(--text-muted)" }}>{p.endDate || p.startDate || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const card: React.CSSProperties = { background: "var(--bg-panel)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(166,201,206,0.10)", borderRadius: 14, padding: "20px" }
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 16px", color: "var(--text-muted)", fontWeight: 500, fontSize: "var(--fs-2xs)", textTransform: "uppercase", letterSpacing: "0.05em" }
const tdStyle: React.CSSProperties = { padding: "10px 16px", color: "var(--text-primary)" }
const filterCellStyle: React.CSSProperties = { padding: "4px 8px" }
const filterInputStyle: React.CSSProperties = {
  width: "100%", padding: "4px 8px", fontSize: "var(--fs-2xs)",
  background: "rgba(166,201,206,0.06)", border: "1px solid rgba(166,201,206,0.12)",
  borderRadius: 4, color: "var(--text-primary)", fontFamily: "inherit", outline: "none",
}
const modalOverlay: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 1100,
  background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 24, animation: "fade-in 0.2s ease",
}
const modalBox: React.CSSProperties = {
  ...card, width: "90vw", maxWidth: 640, maxHeight: "90vh", overflowY: "auto",
  padding: "28px 32px", boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
}
const fieldLabel: React.CSSProperties = { fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontWeight: 500, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }
const fieldInput: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: "var(--fs-sm)",
  background: "var(--bg-input)", border: "1px solid var(--border-input)",
  borderRadius: "var(--radius-input)", color: "var(--text-primary)", fontFamily: "inherit", outline: "none",
}

// Panel latéral / flottant avec les détails d'un mois (revenus ou dépenses)
function MonthDetailPanel({
  mode, moisCode, isPinned, onUnpin, total, items, projectTypeColors, depCategoryColors, onSelectProject, onSelectDepense, compact,
}: {
  mode: "revenus" | "depenses"
  moisCode: string | null
  isPinned: boolean
  onUnpin: () => void
  total: number
  items: (Project | Depense)[]
  projectTypeColors?: Record<string, string>
  depCategoryColors?: Record<string, string>
  onSelectProject?: (p: Project) => void
  onSelectDepense?: (d: Depense) => void
  compact?: boolean
}) {
  if (!moisCode) {
    return (
      <div style={{ padding: 20, color: "var(--text-muted)", fontSize: "var(--fs-sm)", textAlign: "center", fontStyle: "italic" }}>
        Survolez un mois pour voir les détails. Cliquez pour figer.
      </div>
    )
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: compact ? "10px 14px" : "14px 16px", borderBottom: "1px solid rgba(166,201,206,0.12)", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div>
            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              {mode === "revenus" ? "Ventes" : "Dépenses"} · {fmtDossier(moisCode)}
            </div>
            <div style={{ fontSize: compact ? "var(--fs-lg)" : "var(--fs-xl)", fontWeight: 800, color: mode === "revenus" ? "var(--accent)" : "#ef4444", marginTop: 4, fontFamily: "monospace" }}>
              {Math.round(total).toLocaleString("fr-FR")} <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, fontFamily: "inherit" }}>MUR</span>
            </div>
            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>
              {items.length} {mode === "revenus" ? "vente(s)" : "dépense(s)"}
            </div>
          </div>
          {isPinned && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "var(--fs-2xs)", color: "var(--accent)", fontWeight: 600, background: "var(--accent-soft)", padding: "2px 8px", borderRadius: 4 }}>Figé</span>
              <button onClick={onUnpin} title="Défiger (Échap)" style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, padding: 2 }}>✕</button>
            </div>
          )}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {items.length === 0 ? (
          <div style={{ padding: 20, color: "var(--text-muted)", fontSize: "var(--fs-xs)", textAlign: "center", fontStyle: "italic" }}>
            Aucune {mode === "revenus" ? "vente" : "dépense"}
          </div>
        ) : mode === "revenus" ? (
          (items as Project[]).map((p, i) => {
            const c = (p.type && projectTypeColors?.[p.type]) || "#A6C9CE"
            return (
              <div
                key={p.id || i}
                onClick={() => onSelectProject?.(p)}
                style={{ padding: "10px 14px", borderBottom: "1px solid rgba(166,201,206,0.05)", cursor: "pointer", transition: "background 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {p.clientName || p.name}
                  </span>
                  <span style={{ fontFamily: "monospace", fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>
                    {Math.round(getRevenueMUR(p)).toLocaleString("fr-FR")}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>
                  {p.type && (
                    <span style={{ background: `${c}22`, color: c, padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>{p.type}</span>
                  )}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                </div>
              </div>
            )
          })
        ) : (
          (items as Depense[]).map((d, i) => {
            const c = (d.categorie && depCategoryColors?.[d.categorie]) || "#6b7280"
            return (
              <div
                key={d.id || i}
                onClick={() => onSelectDepense?.(d)}
                style={{ padding: "10px 14px", borderBottom: "1px solid rgba(166,201,206,0.05)", cursor: "pointer", transition: "background 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {d.fournisseur || d.description}
                  </span>
                  <span style={{ fontFamily: "monospace", fontSize: "var(--fs-sm)", fontWeight: 700, color: "#ef4444", flexShrink: 0 }}>
                    {Math.round(d.montantMUR).toLocaleString("fr-FR")}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>
                  {d.categorie && (
                    <span style={{ background: `${c}22`, color: c, padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>{d.categorie}</span>
                  )}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.description}</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}


function TopBarTooltip({ active, payload, mode, types, typeColors }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "12px 14px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", fontSize: "var(--fs-xs)", minWidth: 220 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}>{d.name}</div>
      {mode === "fournisseurs" && d.categorie && (
        <div style={{ fontSize: "var(--fs-2xs)", color: d.color || "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>{d.categorie}</div>
      )}
      <div style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--accent)", marginBottom: mode === "clients" && types ? 8 : 2 }}>
        {Math.round(d.value).toLocaleString("fr-FR")} MUR
      </div>
      {mode === "clients" && types && (
        <div style={{ borderTop: "1px solid rgba(166,201,206,0.10)", paddingTop: 6, marginTop: 2 }}>
          {types.map((t: string, i: number) => {
            const v = d[t] || 0
            if (v === 0) return null
            return (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: "var(--fs-2xs)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: typeColors[i], flexShrink: 0 }} />
                <span style={{ color: "var(--text-muted)", flex: 1 }}>{t}</span>
                <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{Math.round(v).toLocaleString("fr-FR")}</span>
              </div>
            )
          })}
        </div>
      )}
      {d.count != null && (
        <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>
          {d.count} {mode === "fournisseurs" ? "dépense(s)" : "projet(s)"} · Clic pour détails
        </div>
      )}
    </div>
  )
}

function TopDetailView({ mode, clients, fournisseurs, onSelectItem }: {
  mode: "clients" | "fournisseurs"
  clients: any[]
  fournisseurs: { name: string; value: number; categorie: string; count: number; color: string }[]
  onSelectItem: (name: string) => void
}) {
  const data = mode === "clients" ? clients : fournisseurs
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginBottom: 12 }}>
        {data.length} {mode === "clients" ? "client(s)" : "fournisseur(s)"} · Total : {Math.round(total).toLocaleString("fr-FR")} MUR · Clic sur une ligne pour détails
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
        <thead style={{ position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 2 }}>
          <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.15)" }}>
            <th style={{ ...thStyle, width: 50 }}>#</th>
            <th style={thStyle}>{mode === "clients" ? "Client" : "Fournisseur"}</th>
            {mode === "fournisseurs" && <th style={thStyle}>Catégorie</th>}
            <th style={{ ...thStyle, textAlign: "right" }}>{mode === "clients" ? "Projets" : "Dépenses"}</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Total (MUR)</th>
            <th style={{ ...thStyle, textAlign: "right" }}>%</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => {
            const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : "0.0"
            const color = mode === "fournisseurs" ? (d as any).color : "var(--accent)"
            return (
              <tr
                key={i}
                onClick={() => onSelectItem(d.name)}
                style={{ borderBottom: "1px solid rgba(166,201,206,0.05)", cursor: "pointer", transition: "background 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ ...tdStyle, color: "var(--text-muted)", fontFamily: "monospace" }}>{i + 1}</td>
                <td style={{ ...tdStyle, fontWeight: 500 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                    {d.name}
                  </div>
                </td>
                {mode === "fournisseurs" && (
                  <td style={tdStyle}>
                    {(d as any).categorie ? (
                      <span style={{ background: `${(d as any).color}22`, color: (d as any).color, padding: "2px 8px", borderRadius: 4, fontSize: "var(--fs-2xs)", fontWeight: 600 }}>{(d as any).categorie}</span>
                    ) : "—"}
                  </td>
                )}
                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "var(--text-secondary)" }}>{(d as any).count ?? "—"}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>{Math.round(d.value).toLocaleString("fr-FR")}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "var(--accent)" }}>{pct}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function BigPie({ data, colors, total, totalLabel, formatter, double, realTotal, projectedTotal, realCount, projectedCount }: {
  data: { name: string; value?: number; amount?: number; count?: number; projected?: number }[]
  colors: string[]
  total?: number
  totalLabel?: string
  formatter: (v: number) => string
  double?: boolean
  realTotal?: number
  projectedTotal?: number
  realCount?: number
  projectedCount?: number
}) {
  const getValue = (d: any) => d.value ?? d.amount ?? 0
  const sum = total ?? data.reduce((s, d) => s + getValue(d), 0)
  const totalCount = double ? data.reduce((s, d: any) => s + (d.count || 0), 0) : 0
  const hasMix = (projectedTotal || 0) > 0 && (realTotal || 0) > 0
  const hasMixCount = (projectedCount || 0) > 0 && (realCount || 0) > 0

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 24, height: "100%", alignItems: "center" }}>
      <div style={{ position: "relative", height: "100%", minHeight: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {double ? (
              <>
                <Pie
                  data={data as any[]} dataKey="amount" nameKey="name" cx="50%" cy="50%"
                  innerRadius="48%" outerRadius="65%" paddingAngle={2} strokeWidth={0}
                  label={({ cx, cy, midAngle, outerRadius: or, name, value }: any) => {
                    const pct = sum > 0 ? ((value / sum) * 100).toFixed(0) : "0"
                    if (Number(pct) < 3) return null
                    const R = Math.PI / 180; const cos = Math.cos(-midAngle * R); const sin = Math.sin(-midAngle * R)
                    const mx = cx + (or + 12) * cos; const my = cy + (or + 12) * sin
                    const ex = cx + (or + 40) * cos; const ey = cy + (or + 40) * sin
                    const tx = ex + (cos >= 0 ? 6 : -6); const a = cos >= 0 ? "start" : "end"
                    const sn = String(name).length > 18 ? String(name).slice(0, 16) + "…" : name
                    return (<g><line x1={mx} y1={my} x2={ex} y2={ey} stroke="var(--text-muted)" strokeWidth={1} opacity={0.5} /><text x={tx} y={ey - 4} textAnchor={a} fill="var(--text-muted)" fontSize={11}>{sn}</text><text x={tx} y={ey + 12} textAnchor={a} fill="var(--text-primary)" fontSize={12} fontWeight={700} fontFamily="monospace">{pct}%</text></g>)
                  }} labelLine={false}
                >
                  {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Pie>
                <Pie data={data as any[]} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius="28%" outerRadius="42%" paddingAngle={2} strokeWidth={0}>
                  {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} opacity={0.5} />)}
                </Pie>
                <Tooltip content={<CTooltip formatter={(v: any) => Number(v) > 100 ? `${Math.round(Number(v)).toLocaleString("fr-FR")} MUR` : `${v} projets`} />} />
              </>
            ) : (
              <>
                <Pie
                  data={data as any[]} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius="48%" outerRadius="72%" paddingAngle={2} strokeWidth={0}
                  label={({ cx, cy, midAngle, outerRadius: or, name, value }: any) => {
                    const pct = sum > 0 ? ((value / sum) * 100).toFixed(0) : "0"
                    if (Number(pct) < 3) return null
                    const R = Math.PI / 180; const cos = Math.cos(-midAngle * R); const sin = Math.sin(-midAngle * R)
                    const mx = cx + (or + 12) * cos; const my = cy + (or + 12) * sin
                    const ex = cx + (or + 40) * cos; const ey = cy + (or + 40) * sin
                    const tx = ex + (cos >= 0 ? 6 : -6); const a = cos >= 0 ? "start" : "end"
                    const sn = String(name).length > 20 ? String(name).slice(0, 18) + "…" : name
                    return (<g><line x1={mx} y1={my} x2={ex} y2={ey} stroke="var(--text-muted)" strokeWidth={1} opacity={0.5} /><text x={tx} y={ey - 4} textAnchor={a} fill="var(--text-muted)" fontSize={11}>{sn}</text><text x={tx} y={ey + 12} textAnchor={a} fill="var(--text-primary)" fontSize={12} fontWeight={700} fontFamily="monospace">{pct}%</text></g>)
                  }} labelLine={false}
                >
                  {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Pie>
                <Tooltip content={<CTooltip formatter={(v: any) => formatter(Number(v))} />} />
              </>
            )}
          </PieChart>
        </ResponsiveContainer>
        {totalLabel && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>
              {double ? totalCount : formatter(sum)}
            </div>
            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>{totalLabel}</div>
          </div>
        )}
      </div>
      <div style={{ maxHeight: "100%", overflowY: "auto", paddingRight: 8 }}>
        {/* Ligne "Total" en tête */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "2px solid rgba(166,201,206,0.25)", marginBottom: 4 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "var(--accent)", flexShrink: 0, opacity: 0.9 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-primary)", fontWeight: 700 }}>
              {double ? "Tous les projets" : "Total"}
              {hasMix && <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontWeight: 500, marginLeft: 6 }}>(actuels + proj)</span>}
            </div>
            {double && (
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 2 }}>
                {totalCount} projets
                {hasMixCount && <span style={{ marginLeft: 4 }}>({realCount} A + {projectedCount} P)</span>}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: "var(--fs-sm)", fontWeight: 800, fontFamily: "monospace", color: "var(--accent)" }}>{formatter(sum)}</div>
            {hasMix && (
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontFamily: "monospace" }}>
                {formatter(realTotal || 0)} A + {formatter(projectedTotal || 0)} P
              </div>
            )}
            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontFamily: "monospace" }}>100%</div>
          </div>
        </div>
        {data.map((d, i) => {
          const v = getValue(d)
          const pct = sum > 0 ? ((v / sum) * 100).toFixed(1) : "0"
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: "1px solid rgba(166,201,206,0.06)" }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: colors[i % colors.length], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                {double && (
                  <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 2 }}>{d.count} projets</div>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: "var(--fs-sm)", fontWeight: 700, fontFamily: "monospace", color: "var(--text-primary)" }}>{formatter(v)}</div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontFamily: "monospace" }}>{pct}%</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SignOutButton() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const email = session?.user?.email ?? ""
  const image = session?.user?.image ?? ""
  const initial = (email || "?").slice(0, 1).toUpperCase()

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [open])

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={email || "Compte"}
        style={{
          width: 32, height: 32, borderRadius: "50%", overflow: "hidden",
          background: "var(--accent-soft)", border: "1px solid var(--border-accent)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0, fontFamily: "inherit",
        }}
      >
        {image ? (
          <img src={image} alt={email} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: "var(--fs-sm)" }}>{initial}</span>
        )}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 998 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 999,
            background: "var(--bg-panel)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            border: "1px solid var(--border-panel)", borderRadius: 10,
            padding: 8, minWidth: 220, boxShadow: "var(--shadow-card)",
          }}>
            <div style={{ padding: "8px 10px", fontSize: "var(--fs-2xs)", color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", marginBottom: 4 }}>
              {email || "Non connecté"}
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              style={{
                width: "100%", textAlign: "left", padding: "8px 10px", fontSize: "var(--fs-sm)",
                background: "none", border: "none", color: "var(--color-error)",
                cursor: "pointer", borderRadius: 6, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(248,113,113,0.10)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              Se déconnecter
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function KpiCard({ icon, iconBg, iconBorder, label, value, unit, sub, valueColor }: {
  icon: React.ReactNode; iconBg: string; iconBorder: string; label: string; value: string; unit: string; sub?: string; valueColor?: string
}) {
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>{label}</div>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: iconBg, border: `1px solid ${iconBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{icon}</div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: valueColor || "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 8 }}>{sub}</div>}
    </div>
  )
}

function ChartCard({ title, value, sub, right, children, renderExpanded, expandable, expandMode = "wide" }: { title: string; value?: React.ReactNode; sub?: string; right?: React.ReactNode; children: React.ReactNode; renderExpanded?: () => React.ReactNode; expandable?: boolean; expandMode?: "wide" | "tall" }) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) return
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false) }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [expanded])

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: expanded ? 20 : 16 }}>
      <div>
        <div style={{ fontSize: expanded ? "var(--fs-lg)" : "var(--fs-sm)", fontWeight: 600, color: "var(--text-primary)" }}>{title}</div>
        {sub && <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
        {value && <div style={{ fontSize: expanded ? "var(--fs-2xl)" : "var(--fs-xl)", fontWeight: 800, color: "var(--text-primary)", marginTop: 4 }}>{value}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {right}
        {expandable && (
          <button onClick={() => setExpanded(!expanded)} title={expanded ? "Réduire" : "Agrandir"} style={{
            background: "none", border: "1px solid var(--border-subtle)", borderRadius: 6,
            color: "var(--text-muted)", cursor: "pointer", width: 28, height: 28,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, transition: "all 0.15s",
          }}>{expanded ? "✕" : "⛶"}</button>
        )}
      </div>
    </div>
  )

  const isWide = expandMode === "wide"

  if (expanded) {
    return (
      <>
        <div style={{ ...card, opacity: 0.3, pointerEvents: "none", minHeight: 100 }}>{header}</div>
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: isWide ? "24px" : "16px", animation: "fade-in 0.2s ease",
        }} onClick={() => setExpanded(false)}>
          <div style={{
            ...card,
            width: isWide ? "95vw" : "90vw",
            height: isWide ? "auto" : "92vh",
            maxWidth: isWide ? undefined : 1200,
            maxHeight: isWide ? "auto" : "92vh",
            overflow: "hidden",
            padding: "28px 32px",
            boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          }} onClick={e => e.stopPropagation()}>
            {header}
            <div className="chart-expanded" style={{ height: isWide ? "calc(90vh - 140px)" : "calc(92vh - 130px)" }}>
              {renderExpanded ? renderExpanded() : children}
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div style={card}>
      {header}
      {children}
    </div>
  )
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function ProjectModal({ project, clients, employees, onClose, onSave, saving, missing }: {
  project: Project | null; clients: Client[]; employees: Employee[]; onClose: () => void; onSave: (data: any) => void; saving: boolean
  missing?: string[] // labels des champs Critical manquants — met un ring rouge dessus
}) {
  const isNew = !project
  const [showAll, setShowAll] = useState(!missing) // Si missing défini : démarre en "essentiels"
  const [form, setForm] = useState({
    name: project?.name || "",
    status: project?.status || "Pending",
    type: project?.type || "Consulting",
    methodology: project?.methodology || "",
    currency: project?.currency || "MUR",
    quotedAmount: project?.quotedAmount || 0,
    finalAmount: project?.finalAmount || 0,
    winPercent: project?.winPercent || 0,
    riskLevel: project?.riskLevel || "",
    clientSatisfaction: project?.clientSatisfaction || "",
    startDate: project?.startDate || "",
    endDate: project?.endDate || "",
    clientIds: project?.clientIds?.[0] || "",
    ownerIds: project?.ownerIds?.[0] || "",
    phase: project?.phase || "",
    teamMemberIds: project?.teamMemberIds || [] as string[],
    commissionPercent: project?.commissionPercent || 0,
    commissionTo: project?.commissionTo || "",
  })

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  // Helper : retourne le style d'input enrichi avec un ring rouge si le label est dans missing
  const inputStyleFor = (label: string): React.CSSProperties => {
    if (missing && missing.includes(label)) {
      return { ...fieldInput, borderColor: "#ef4444", boxShadow: "0 0 0 1px rgba(239,68,68,0.35)" }
    }
    return fieldInput
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [onClose])

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={{ ...modalBox, maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: "var(--fs-lg)", fontWeight: 700, color: "var(--text-primary)" }}>
              {isNew ? "Nouvelle vente" : "Modifier la vente"}
            </div>
            {missing && missing.length > 0 && (
              <div style={{ fontSize: "var(--fs-2xs)", color: "#ef4444", marginTop: 4, fontWeight: 600 }}>
                Champs Critical manquants : {missing.join(" · ")}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setShowAll(s => !s)}
              style={{ background: showAll ? "var(--accent-soft)" : "rgba(166,201,206,0.04)", border: `1px solid ${showAll ? "var(--accent)" : "var(--border-subtle)"}`, color: showAll ? "var(--accent)" : "var(--text-secondary)", cursor: "pointer", fontSize: "var(--fs-2xs)", padding: "4px 10px", borderRadius: 6, fontFamily: "inherit", fontWeight: 600 }}
            >
              {showAll ? "Tous les champs ✓" : "Afficher tous les champs"}
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18 }}>✕</button>
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--border-subtle)", marginBottom: 20 }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={fieldLabel}>Nom du projet</div>
            <input value={form.name} onChange={e => set("name", e.target.value)} style={inputStyleFor("Name")} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={fieldLabel}>Client</div>
            <select value={form.clientIds} onChange={e => set("clientIds", e.target.value)} style={inputStyleFor("Client")}>
              <option value="">— Aucun —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Owner</div>
            <select value={form.ownerIds} onChange={e => set("ownerIds", e.target.value)} style={inputStyleFor("Owner")}>
              <option value="">— Aucun —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Phase</div>
            <select value={form.phase} onChange={e => set("phase", e.target.value)} style={inputStyleFor("Phase")}>
              <option value="">— Aucune —</option>
              {["Scoping", "Delivery", "Review", "Closed"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={fieldLabel}>Team Members <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· à modifier directement dans Notion</span></div>
            <div style={{ padding: 8, background: "var(--bg-input)", border: "1px solid var(--border-input)", borderRadius: "var(--radius-input)", minHeight: 36, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", opacity: 0.75 }}>
              {project?.teamMemberNames ? (
                project.teamMemberNames.split(", ").filter(Boolean).map(n => (
                  <span key={n} style={{ fontSize: "var(--fs-2xs)", background: "var(--accent-soft)", color: "var(--accent)", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>{n}</span>
                ))
              ) : (
                <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontStyle: "italic" }}>Aucun membre — ouvrir dans Notion pour ajouter</span>
              )}
            </div>
          </div>
          <div>
            <div style={fieldLabel}>Status</div>
            <select value={form.status} onChange={e => set("status", e.target.value)} style={inputStyleFor("Status")}>
              {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Type</div>
            <select value={form.type} onChange={e => set("type", e.target.value)} style={inputStyleFor("Type")}>
              {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Méthodologie</div>
            <select value={form.methodology} onChange={e => set("methodology", e.target.value)} style={inputStyleFor("Methodology")}>
              <option value="">—</option>
              {METHODOLOGY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Devise</div>
            <select value={form.currency} onChange={e => set("currency", e.target.value)} style={inputStyleFor("Currency")}>
              {CURRENCY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Montant devisé</div>
            <input type="number" value={form.quotedAmount} onChange={e => set("quotedAmount", e.target.value)} style={inputStyleFor("Quoted Amount")} />
          </div>
          <div>
            <div style={fieldLabel}>Montant final</div>
            <input type="number" value={form.finalAmount} onChange={e => set("finalAmount", e.target.value)} style={inputStyleFor("Final Amount")} />
          </div>
          <div>
            <div style={fieldLabel}>Win % (gut feeling)</div>
            <input type="number" value={form.winPercent} onChange={e => set("winPercent", e.target.value)} style={inputStyleFor("Win %")} min={0} max={100} />
          </div>
          <div>
            <div style={fieldLabel}>Niveau de risque</div>
            <select value={form.riskLevel} onChange={e => set("riskLevel", e.target.value)} style={inputStyleFor("Risk Level")}>
              <option value="">—</option>
              {RISK_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Date de début</div>
            <input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} style={inputStyleFor("Start Date")} />
          </div>
          <div>
            <div style={fieldLabel}>Date de fin</div>
            <input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)} style={inputStyleFor("End Date")} />
          </div>

          {/* ── Champs additionnels (visible seulement en mode "tous les champs") ── */}
          {showAll && <>
            <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border-subtle)", paddingTop: 8, marginTop: 4 }}>
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Champs additionnels</div>
            </div>
            <div>
              <div style={fieldLabel}>Satisfaction client</div>
              <select value={form.clientSatisfaction} onChange={e => set("clientSatisfaction", e.target.value)} style={fieldInput}>
                <option value="">—</option>
                {SATISFACTION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </>}
          <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border-subtle)", paddingTop: 12, marginTop: 4 }}>
            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Commission</div>
          </div>
          <div>
            <div style={fieldLabel}>% of commissions (0-100)</div>
            <input type="number" value={form.commissionPercent} onChange={e => set("commissionPercent", e.target.value)} style={fieldInput} min={0} max={100} step={0.1} />
          </div>
          <div>
            <div style={fieldLabel}>Bénéficiaire (Ad-hoc commissions 1)</div>
            <input value={form.commissionTo} onChange={e => set("commissionTo", e.target.value)} placeholder="nom du bénéficiaire" style={fieldInput} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: "var(--radius-btn)", background: "var(--btn-secondary-bg)", color: "var(--btn-secondary-text)", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "var(--fs-sm)", fontWeight: 500 }}>Annuler</button>
          <button
            onClick={() => onSave({ ...form, id: project?.id })}
            disabled={saving || !form.name}
            style={{
              padding: "8px 20px", borderRadius: "var(--radius-btn)",
              background: saving ? "var(--text-muted)" : "var(--btn-add-bg)",
              color: "var(--btn-add-color)", border: "none", cursor: saving ? "wait" : "pointer",
              fontFamily: "inherit", fontSize: "var(--fs-sm)", fontWeight: 600,
            }}
          >
            {saving ? "Sauvegarde…" : isNew ? "Créer" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  )
}

function DepenseModal({ depense, onClose, onSave, saving }: {
  depense: Depense; onClose: () => void; onSave: (data: any) => void; saving: boolean
}) {
  const [form, setForm] = useState({
    description: depense.description,
    date: depense.date,
    fournisseur: depense.fournisseur,
    categorie: depense.categorie,
    sousCategorie: depense.sousCategorie,
    montant: depense.montant,
    devise: depense.devise,
    dossier: depense.dossier,
  })

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [onClose])

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ fontSize: "var(--fs-lg)", fontWeight: 700, color: "var(--text-primary)" }}>Modifier la dépense</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={fieldLabel}>Description</div>
            <input value={form.description} onChange={e => set("description", e.target.value)} style={fieldInput} />
          </div>
          <div>
            <div style={fieldLabel}>Date</div>
            <input type="date" value={form.date} onChange={e => set("date", e.target.value)} style={fieldInput} />
          </div>
          <div>
            <div style={fieldLabel}>Fournisseur</div>
            <input value={form.fournisseur} onChange={e => set("fournisseur", e.target.value)} style={fieldInput} />
          </div>
          <div>
            <div style={fieldLabel}>Catégorie</div>
            <select value={form.categorie} onChange={e => set("categorie", e.target.value)} style={fieldInput}>
              <option value="">—</option>
              {CATEGORIE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Sous-catégorie</div>
            <input value={form.sousCategorie} onChange={e => set("sousCategorie", e.target.value)} style={fieldInput} />
          </div>
          <div>
            <div style={fieldLabel}>Montant</div>
            <input type="number" value={form.montant} onChange={e => set("montant", e.target.value)} style={fieldInput} />
          </div>
          <div>
            <div style={fieldLabel}>Devise</div>
            <select value={form.devise} onChange={e => set("devise", e.target.value)} style={fieldInput}>
              {DEVISE_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Dossier</div>
            <input value={form.dossier} onChange={e => set("dossier", e.target.value)} style={fieldInput} />
          </div>
          <div>
            <div style={fieldLabel}>Payé par</div>
            <input value={depense.payePar} disabled style={{ ...fieldInput, opacity: 0.5 }} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: "var(--radius-btn)", background: "var(--btn-secondary-bg)", color: "var(--btn-secondary-text)", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "var(--fs-sm)", fontWeight: 500 }}>Annuler</button>
          <button
            onClick={() => onSave({ ...form, id: depense.id })}
            disabled={saving}
            style={{
              padding: "8px 20px", borderRadius: "var(--radius-btn)",
              background: saving ? "var(--text-muted)" : "var(--btn-add-bg)",
              color: "var(--btn-add-color)", border: "none", cursor: saving ? "wait" : "pointer",
              fontFamily: "inherit", fontSize: "var(--fs-sm)", fontWeight: 600,
            }}
          >
            {saving ? "Sauvegarde…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  )
}

function TopItemDetailModal({ mode, name, projects, depenses, depCategoryColors, projectTypeColors, onClose, onSelectProject, onSelectDepense }: {
  mode: "clients" | "fournisseurs"
  name: string
  projects: Project[]
  depenses: Depense[]
  depCategoryColors: Record<string, string>
  projectTypeColors: Record<string, string>
  onClose: () => void
  onSelectProject: (p: Project) => void
  onSelectDepense: (d: Depense) => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [onClose])

  const sortedP = [...projects].sort((a, b) => toMUR(b.finalAmount, b.currency) - toMUR(a.finalAmount, a.currency))
  const sortedD = [...depenses].sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  const totalP = sortedP.reduce((s, p) => s + getRevenueMUR(p), 0)
  const totalD = sortedD.reduce((s, d) => s + d.montantMUR, 0)

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={{ ...modalBox, maxWidth: 880, width: "90vw" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              {mode === "clients" ? "Client" : "Fournisseur"}
            </div>
            <div style={{ fontSize: "var(--fs-xl)", fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{name}</div>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: 4 }}>
              {mode === "clients"
                ? `${sortedP.length} projet(s) · ${Math.round(totalP).toLocaleString("fr-FR")} MUR`
                : `${sortedD.length} dépense(s) · ${Math.round(totalD).toLocaleString("fr-FR")} MUR`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {mode === "clients" ? (
          sortedP.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>Aucun projet</div>
          ) : (
            <div style={{ maxHeight: "70vh", overflowY: "auto", border: "1px solid rgba(166,201,206,0.10)", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg-card)" }}>
                  <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.15)" }}>
                    {["Date", "Projet", "Type", "Status", "Montant", "MUR"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {sortedP.map((p, i) => (
                    <tr key={p.id || i} onClick={() => onSelectProject(p)} style={{ borderBottom: "1px solid rgba(166,201,206,0.05)", cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--text-muted)" }}>{getRevenueDateISO(p) || "—"}</td>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{p.name}</td>
                      <td style={tdStyle}>{p.type ? (() => { const c = projectTypeColors[p.type] || "#A6C9CE"; return <span style={{ background: `${c}22`, color: c, padding: "2px 8px", borderRadius: 4, fontSize: "var(--fs-2xs)", fontWeight: 600 }}>{p.type}</span> })() : "—"}</td>
                      <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{p.status}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 600 }}>{Math.round(getRevenueRaw(p)).toLocaleString("fr-FR")} {p.currency}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 700, color: "var(--accent)" }}>{Math.round(getRevenueMUR(p)).toLocaleString("fr-FR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          sortedD.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>Aucune dépense</div>
          ) : (
            <div style={{ maxHeight: "70vh", overflowY: "auto", border: "1px solid rgba(166,201,206,0.10)", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg-card)" }}>
                  <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.15)" }}>
                    {["Date", "Description", "Catégorie", "Montant", "MUR"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {sortedD.map((d, i) => (
                    <tr key={d.id || i} onClick={() => onSelectDepense(d)} style={{ borderBottom: "1px solid rgba(166,201,206,0.05)", cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--text-muted)" }}>{d.date || "—"}</td>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{d.description}</td>
                      <td style={tdStyle}>
                        {d.categorie ? (() => { const c = depCategoryColors[d.categorie] || "#6b7280"; return <span style={{ background: `${c}22`, color: c, padding: "2px 8px", borderRadius: 4, fontSize: "var(--fs-2xs)", fontWeight: 600 }}>{d.categorie}</span> })() : "—"}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 600 }}>{d.montant.toLocaleString("fr-FR")} {d.devise}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 700, color: "var(--accent)" }}>{Math.round(d.montantMUR).toLocaleString("fr-FR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  )
}

function RevenueDetailModal({ moisCode, ventes, projectTypeColors, onClose, onSelectProject }: {
  moisCode: string; ventes: Project[]; projectTypeColors: Record<string, string>; onClose: () => void; onSelectProject: (p: Project) => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [onClose])

  const totalMUR = ventes.reduce((s, p) => s + getRevenueMUR(p), 0)
  const sorted = [...ventes].sort((a, b) => toMUR(b.finalAmount, b.currency) - toMUR(a.finalAmount, a.currency))

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={{ ...modalBox, maxWidth: 820, width: "90vw" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: "var(--fs-lg)", fontWeight: 700, color: "var(--text-primary)" }}>Ventes — {fmtDossier(moisCode)}</div>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: 2 }}>
              {ventes.length} vente{ventes.length > 1 ? "s" : ""} · Total : {Math.round(totalMUR).toLocaleString("fr-FR")} MUR
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>Aucune vente ce mois</div>
        ) : (
          <div style={{ maxHeight: "70vh", overflowY: "auto", border: "1px solid rgba(166,201,206,0.10)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg-card)" }}>
                <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.15)" }}>
                  {["Date", "Projet", "Client", "Type", "Status", "Montant", "MUR"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => (
                  <tr key={p.id || i} onClick={() => onSelectProject(p)} style={{ borderBottom: "1px solid rgba(166,201,206,0.05)", cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--text-muted)" }}>{getRevenueDateISO(p) || "—"}</td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{p.name}</td>
                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{p.clientName}</td>
                    <td style={tdStyle}>{p.type ? (() => { const c = projectTypeColors[p.type] || "#A6C9CE"; return <span style={{ background: `${c}22`, color: c, padding: "2px 8px", borderRadius: 4, fontSize: "var(--fs-2xs)", fontWeight: 600 }}>{p.type}</span> })() : "—"}</td>
                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{p.status}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 600 }}>{Math.round(getRevenueRaw(p)).toLocaleString("fr-FR")} {p.currency}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 700, color: "var(--accent)" }}>{Math.round(getRevenueMUR(p)).toLocaleString("fr-FR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Chart sub-components ─────────────────────────────────────────────────────

function Badge({ c, l, v }: { c: string; l: string; v: string }) {
  return <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} /><span style={{ color: "var(--text-muted)" }}>{l}</span><span style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" }}>{v}</span></span>
}

// ───────── Onglet Prévisionnel : charts futurs + listings modifiables ─────────
function PrevisionnelView({ projects, employees, depenses, recurringCriticalMensuel, salaireMensuel, salaireForMonth, onEditProject, onEditProjectHighlight, onEditDepense, currentDossier, fyStartYear, forecastWinMode, setForecastWinMode }: any) {
  type FutureRange = "1m" | "3m" | "6m" | "12m" | "fy"
  const [futureRange, setFutureRange] = useState<FutureRange>("fy")

  // Codes YYMM couverts par la plage future, mois courant inclus
  const codes = useMemo(() => {
    if (!currentDossier || currentDossier.length !== 4) return [] as string[]
    const curY = parseInt(currentDossier.slice(0, 2), 10)
    const curM = parseInt(currentDossier.slice(2), 10)
    const list: string[] = []
    const push = (y: number, m: number) => list.push(`${String(y).padStart(2, "0")}${String(m).padStart(2, "0")}`)
    let endY = curY, endM = curM
    if (futureRange === "fy") {
      // FY Eqxia : juillet → juin. fyStartYear est le millésime de juillet (ex: 2025 → FY 2025-2026)
      const fyEndY = (fyStartYear + 1) % 100
      endY = fyEndY
      endM = 6
      // Si on est déjà après juin de la FY (ne devrait pas arriver), on force currentDossier
      if (endY < curY || (endY === curY && endM < curM)) { endY = curY; endM = curM }
    } else {
      const n = futureRange === "1m" ? 1 : futureRange === "3m" ? 3 : futureRange === "6m" ? 6 : 12
      endM = curM + n
      while (endM > 12) { endM -= 12; endY += 1 }
    }
    let y = curY, m = curM
    while (y < endY || (y === endY && m <= endM)) {
      push(y, m)
      m++
      if (m > 12) { m = 1; y++ }
    }
    return list
  }, [currentDossier, futureRange, fyStartYear])

  // Build heroData (subset futur) à partir des projets / dépenses
  const heroData = useMemo(() => {
    const rMNet: Record<string, number> = {}
    const rMCa: Record<string, number> = {}
    projects.forEach((p: Project) => {
      const k = getProjectDossier(p)
      if (!k) return
      rMNet[k] = (rMNet[k] || 0) + getRevenueMUR(p)
      rMCa[k] = (rMCa[k] || 0) + getCAMUR(p)
    })
    return codes.map(m => {
      const isCurrent = m === currentDossier
      const isFuture = m > currentDossier
      const ca = rMCa[m] || 0
      const revNet = rMNet[m] || 0
      const commission = Math.max(0, ca - revNet)
      const dep = isFuture ? recurringCriticalMensuel : 0
      const sal = typeof salaireForMonth === "function" ? salaireForMonth(m) : 0
      const ebitda = revNet - dep - sal
      return {
        mois: m,
        label: fmtDossier(m),
        isFuture,
        isCurrent,
        ca, revenus: revNet, commission, depenses: dep, salaires: sal, ebitda,
        caProjected: ca,
        revenuProjected: revNet,
        commissionProjected: commission,
        depensesProjected: dep,
        salairesProjected: sal,
        ebitdaProjected: ebitda,
      } as any
    })
  }, [codes, currentDossier, projects, recurringCriticalMensuel, salaireForMonth])

  // Bornes de la plage pour filtrer les projets et la table
  const rangeStartCode = codes[0] || currentDossier
  const rangeEndCode = codes[codes.length - 1] || currentDossier

  const futureProjects = projects.filter((p: Project) => {
    const iso = p.endDate || p.startDate
    if (!iso) return false
    const d = new Date(iso)
    const code = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`
    return code > currentDossier && code <= rangeEndCode && getRevenueRaw(p) > 0
  }).sort((a: Project, b: Project) => (a.endDate || a.startDate).localeCompare(b.endDate || b.startDate))
  const recurringList = depenses.filter((d: Depense) => d.recurringCritical)
  const salaryLines = employees.filter((e: Employee) => e.cje > 0)

  // Abonnements : dépenses recurringCritical avec champ Abonnement, dédupliquées (dernière entrée par abonnement),
  // coût mensuel effectif respectant la périodicité (Annuel ÷ 12, Mensuel/vide ×1).
  const abonnements = useMemo(() => {
    interface AbItem { abonnement: string; depense: Depense; monthlyMUR: number }
    const map: Record<string, AbItem> = {}
    depenses.filter((d: Depense) => d.recurringCritical && !!d.abonnement && !!d.abonnement.trim()).forEach((d: Depense) => {
      const key = (d.abonnement || "").trim()
      const factor = d.recurrence === "Annuel" ? (1 / 12) : 1
      const monthlyMUR = (d.montantMUR || 0) * factor
      const cur = map[key]
      if (!cur || (d.date || "") > (cur.depense.date || "")) {
        map[key] = { abonnement: key, depense: d, monthlyMUR }
      }
    })
    return Object.values(map).sort((a, b) => b.monthlyMUR - a.monthlyMUR)
  }, [depenses])
  const abonnementsTotal = abonnements.reduce((s, a) => s + a.monthlyMUR, 0)

  const totalCA = heroData.reduce((s, d) => s + (d.ca || 0), 0)
  const totalRev = heroData.reduce((s, d) => s + (d.revenus || 0), 0)
  const totalDep = heroData.reduce((s, d) => s + (d.depenses || 0), 0)
  const totalSal = heroData.reduce((s, d) => s + (d.salaires || 0), 0)
  const totalEbitda = totalRev - totalDep - totalSal

  const rangeLabels: Record<FutureRange, string> = { "1m": "1 mois", "3m": "3 mois", "6m": "6 mois", "12m": "12 mois", "fy": "Année fiscale" }

  return (
    <div>
      {/* Header explicatif + sélecteur de plage */}
      <div style={{ ...card, marginBottom: 16, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "var(--fs-md)", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}><Telescope size={16} color="var(--accent)" /> Prévisionnel · {rangeLabels[futureRange]}</div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: 4 }}>
            Projections basées sur les projets futurs (pondérés Win %), salaires constants et dépenses récurrentes critiques.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {forecastWinMode !== undefined && <WinRateToggle mode={forecastWinMode} onChange={setForecastWinMode} />}
          <div style={{ display: "flex", gap: 4, background: "var(--bg-input)", padding: 3, borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
          {(["1m", "3m", "6m", "12m", "fy"] as FutureRange[]).map(r => (
            <button
              key={r}
              onClick={() => setFutureRange(r)}
              style={{
                padding: "4px 10px",
                fontSize: "var(--fs-xs)",
                fontWeight: futureRange === r ? 600 : 500,
                background: futureRange === r ? "var(--accent)" : "transparent",
                color: futureRange === r ? "var(--bg-page)" : "var(--text-secondary)",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {r === "fy" ? "Y fiscal" : r}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* KPIs projetés */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "CA projeté", val: totalCA, color: "#3D8899", formula: "Σ Quoted × Win% OU Σ Final Amount" },
          { label: "Revenu projeté", val: totalRev, color: "#A6C9CE", formula: "CA × (1 − commission%)" },
          { label: "Dépenses proj.", val: totalDep, color: "#ef4444", formula: "Σ Recurring Critical × nb mois" },
          { label: "Salaires proj.", val: totalSal, color: "#f97316", formula: "Σ(CJE × 220/12) × nb mois" },
          { label: "EBITDA projeté", val: totalEbitda, color: totalEbitda >= 0 ? "#22c55e" : "#ef4444", formula: "Revenu − Dépenses − Salaires" },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: "14px 16px" }}>
            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, fontFamily: "monospace", marginTop: 6 }}>{Math.round(k.val).toLocaleString("fr-FR")}</div>
            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>{k.formula}</div>
          </div>
        ))}
      </div>

      {/* Chart futur — stacked areas */}
      <div style={{ ...card, marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(166,201,206,0.08)", fontSize: "var(--fs-md)", fontWeight: 600 }}>Évolution mensuelle projetée</div>
        <div style={{ padding: 16 }}>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={heroData}>
              <defs>
                <linearGradient id="gRevPv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#A6C9CE" stopOpacity={0.4} /><stop offset="95%" stopColor="#A6C9CE" stopOpacity={0.02} /></linearGradient>
                <linearGradient id="gSalPv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.4} /><stop offset="95%" stopColor="#f97316" stopOpacity={0.02} /></linearGradient>
                <linearGradient id="gDepPv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.08)" />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" strokeWidth={1} ifOverflow="extendDomain" {...({ isFront: false } as any)} />
              <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: any) => `${(Number(v) / 1000).toFixed(0)}k`} />
              <Tooltip content={<HeroTooltip />} />
              <Area type="monotone" dataKey="salairesProjected" stackId="c" stroke="#f97316" strokeWidth={2} fill="url(#gSalPv)" connectNulls />
              <Area type="monotone" dataKey="depensesProjected" stackId="c" stroke="#ef4444" strokeWidth={2} fill="url(#gDepPv)" connectNulls />
              <Area type="monotone" dataKey="revenuProjected" stroke="#A6C9CE" strokeWidth={2} fill="url(#gRevPv)" connectNulls />
              <Line type="monotone" dataKey="caProjected" stroke="#3D8899" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="ebitdaProjected" stroke="#22c55e" strokeWidth={2} dot={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Ventes futures */}
      <div style={{ ...card, marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(166,201,206,0.08)", fontSize: "var(--fs-md)", fontWeight: 600 }}>
          Ventes futures (pondérées Win%) <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "var(--fs-xs)", marginLeft: 6 }}>{futureProjects.length} projet(s)</span>
        </div>
        {futureProjects.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: "var(--fs-sm)", fontStyle: "italic" }}>Aucune vente future</div>
        ) : (
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
              <thead style={{ position: "sticky", top: 0, background: "var(--bg-panel)", zIndex: 2 }}>
                <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.15)" }}>
                  {["End Date", "Projet", "Client", "Type", "Status", "Quoted", "Win%", "Commission%", "CA proj.", "Revenu proj."].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {futureProjects.map((p: Project, i: number) => {
                  const win = p.winPercent && p.winPercent > 1 ? p.winPercent / 100 : (p.winPercent || 0)
                  const com = p.commissionPercent && p.commissionPercent > 1 ? p.commissionPercent / 100 : (p.commissionPercent || 0)
                  const ca = getCAMUR(p)
                  const rev = getRevenueMUR(p)
                  return (
                    <tr key={p.id || i} onClick={() => onEditProject(p)} style={{ borderBottom: "1px solid rgba(166,201,206,0.05)", cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--text-muted)" }}>{p.endDate || p.startDate || "—"}</td>
                      <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</td>
                      <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{p.clientName || "—"}</td>
                      <td style={tdStyle}>{p.type || "—"}</td>
                      <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{p.status || "—"}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace" }}>{Math.round(p.quotedAmount).toLocaleString("fr-FR")} {p.currency}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--accent)" }}>{(win * 100).toFixed(0)}%</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "#f97316" }}>{(com * 100).toFixed(0)}%</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 700, color: "#3D8899" }}>{Math.round(ca).toLocaleString("fr-FR")}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 700, color: "#A6C9CE" }}>{Math.round(rev).toLocaleString("fr-FR")}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Salaires */}
      <div style={{ ...card, marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(166,201,206,0.08)", fontSize: "var(--fs-md)", fontWeight: 600 }}>
          Salaires mensuels <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "var(--fs-xs)", marginLeft: 6 }}>{salaryLines.length} employé(s) · total/mois : {Math.round(salaireMensuel).toLocaleString("fr-FR")} MUR</span>
        </div>
        {salaryLines.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: "var(--fs-sm)", fontStyle: "italic" }}>Aucun salaire configuré</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.15)" }}>
                {["Employé", "Rôle", "CJE", "Mensuel (× 220/12)"].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {salaryLines.map((e: Employee) => (
                <tr key={e.id} style={{ borderBottom: "1px solid rgba(166,201,206,0.05)" }}>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{e.name}</td>
                  <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{e.role || "—"}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace" }}>{Math.round(e.cje).toLocaleString("fr-FR")} MUR/j</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 700, color: "#f97316" }}>{Math.round(e.cje * 220 / 12).toLocaleString("fr-FR")} MUR</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Abonnements (dédupliqués, coût mensuel effectif) */}
      <div style={{ ...card, marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(166,201,206,0.08)", fontSize: "var(--fs-md)", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            Abonnements <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "var(--fs-xs)", marginLeft: 6 }}>{abonnements.length} abonnement(s) · total/mois : {Math.round(abonnementsTotal).toLocaleString("fr-FR")} MUR</span>
          </div>
          <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontStyle: "italic" }}>Cliquer pour modifier · dernière entrée par abonnement</div>
        </div>
        {abonnements.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: "var(--fs-sm)", fontStyle: "italic" }}>Aucun abonnement renseigné (champ « Abonnement » vide sur les dépenses récurrentes critiques)</div>
        ) : (
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
              <thead style={{ position: "sticky", top: 0, background: "var(--bg-panel)", zIndex: 2 }}>
                <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.15)" }}>
                  {["Abonnement", "Fournisseur", "Récurrence", "Dernière date", "Montant brut", "Mensuel effectif (MUR)"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {abonnements.map(a => {
                  const d = a.depense
                  return (
                    <tr key={a.abonnement} onClick={() => onEditDepense(d)} style={{ borderBottom: "1px solid rgba(166,201,206,0.05)", cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: "var(--accent)" }}>{a.abonnement}</td>
                      <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{d.fournisseur || "—"}</td>
                      <td style={tdStyle}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, background: d.recurrence === "Annuel" ? "rgba(166, 201, 206, 0.15)" : "rgba(34, 197, 94, 0.15)", color: d.recurrence === "Annuel" ? "var(--accent)" : "#22c55e", fontSize: "var(--fs-2xs)", fontWeight: 600 }}>
                          {d.recurrence || "Mensuel"}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--text-muted)" }}>{d.date || "—"}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace" }}>{Math.round(d.montant || d.montantMUR).toLocaleString("fr-FR")} {d.devise || "MUR"}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 700, color: "#ef4444" }}>{Math.round(a.monthlyMUR).toLocaleString("fr-FR")}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "1px solid rgba(166,201,206,0.20)", background: "rgba(166,201,206,0.04)" }}>
                  <td colSpan={5} style={{ ...tdStyle, fontWeight: 600, color: "var(--text-secondary)", textAlign: "right" }}>Total mensuel</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 800, color: "#ef4444", fontSize: "var(--fs-sm)" }}>{Math.round(abonnementsTotal).toLocaleString("fr-FR")} MUR</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Dépenses récurrentes critiques */}
      <div style={{ ...card, marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(166,201,206,0.08)", fontSize: "var(--fs-md)", fontWeight: 600 }}>
          Dépenses récurrentes critiques <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "var(--fs-xs)", marginLeft: 6 }}>{recurringList.length} dépense(s) · projection/mois : {Math.round(recurringCriticalMensuel).toLocaleString("fr-FR")} MUR</span>
        </div>
        {recurringList.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: "var(--fs-sm)", fontStyle: "italic" }}>Aucune dépense flaguée "Recurring Critical"</div>
        ) : (
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
              <thead style={{ position: "sticky", top: 0, background: "var(--bg-panel)", zIndex: 2 }}>
                <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.15)" }}>
                  {["Dernière date", "Description", "Fournisseur", "Catégorie", "Montant (MUR)"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {recurringList.map((d: Depense, i: number) => (
                  <tr key={d.id || i} onClick={() => onEditDepense(d)} style={{ borderBottom: "1px solid rgba(166,201,206,0.05)", cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--text-muted)" }}>{d.date || "—"}</td>
                    <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.description}</td>
                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{d.fournisseur || "—"}</td>
                    <td style={tdStyle}>{d.categorie || "—"}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 700, color: "#ef4444" }}>{Math.round(d.montantMUR).toLocaleString("fr-FR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Database Review — en bas du Prévisionnel */}
      <DBReviewPanel
        projects={projects}
        employees={employees}
        depenses={depenses}
        onEditProject={(p: Project, missing?: string[]) => {
          if (missing?.length) onEditProjectHighlight?.(p, missing)
          else onEditProject?.(p)
        }}
        onEditDepense={onEditDepense}
      />
    </div>
  )
}

// ───────── Database Review Panel ─────────
type IssueLevel = "critical" | "warning" | "info"
interface DBIssue { level: IssueLevel; source: "projects" | "employees" | "depenses"; entity: string; entityId: string; field: string; message: string }

function DBReviewPanel({ projects, employees, depenses, onEditProject, onEditDepense }: {
  projects: Project[]; employees: Employee[]; depenses: Depense[]
  onEditProject?: (p: Project, missing?: string[]) => void
  onEditDepense?: (d: Depense) => void
}) {
  const [filter, setFilter] = useState<"all" | "critical" | "warning">("critical")
  const [section, setSection] = useState<"all" | "projects" | "employees" | "depenses">("all")

  const issues = useMemo<DBIssue[]>(() => {
    const out: DBIssue[] = []
    const addP = (level: IssueLevel, entity: string, entityId: string, field: string, message: string) =>
      out.push({ level, source: "projects", entity, entityId, field, message })
    const addE = (level: IssueLevel, entity: string, entityId: string, field: string, message: string) =>
      out.push({ level, source: "employees", entity, entityId, field, message })
    const addD = (level: IssueLevel, entity: string, entityId: string, field: string, message: string) =>
      out.push({ level, source: "depenses", entity, entityId, field, message })

    // ── Projets ──────────────────────────────────────────────────────────
    const SKIP_STATUSES = new Set(["Lost", "Cancelled"])
    projects.filter(p => !SKIP_STATUSES.has(p.status)).forEach(p => {
      const isInternal = p.type === "Internal"
      const label = p.name || p.id

      // Date de fin manquante — critique pour tout projet
      if (!p.endDate) addP("critical", label, p.id, "End Date", "Pas de date de fin — impossible de calculer le mois de revenu")

      // Phase manquante
      if (!p.phase) addP("warning", label, p.id, "Phase", "Phase non renseignée")

      if (isInternal) {
        // Projets internes : le client == Eqxia, pas de vrai revenu externe
        if (!p.humanCost && !p.netAmount) addP("warning", label, p.id, "Human Cost / Net Amount", "Coût humain et net amount non renseignés pour un projet interne")
      } else {
        // Projets externes
        if (p.quotedAmountIsEmpty) addP("critical", label, p.id, "Quoted Amount", "Quoted Amount vide (non renseigné) — le projet ne sera pas valorisé")

        const noWinGut = !p.winPercent || p.winPercent === 0
        const noWinAuto = !p.winAuto || p.winAuto === 0
        if (noWinGut && noWinAuto) {
          addP("critical", label, p.id, "Win Rate", "Aucun win rate (ni gut feeling ni auto) — CA prévisionnel = 0")
        } else if (noWinGut && !noWinAuto) {
          addP("warning", label, p.id, "Win % (gut feeling)", "Win % gut feeling absent — fallback sur la formule auto Notion")
        }

        // Commission sans bénéficiaire
        if ((p.commissionPercent || 0) > 0 && !p.commissionTo) addP("warning", label, p.id, "Commission To", "Commission % renseigné mais bénéficiaire absent")

        // Client manquant (non Internal)
        if (!p.clientName || p.clientName === "N/A") addP("warning", label, p.id, "Client", "Aucun client lié — relations non renseignées dans Notion")
      }

      // Owner / responsable manquant
      if (!p.ownerName) addP("warning", label, p.id, "Owner", "Responsable projet non renseigné")
    })

    // ── Employees ────────────────────────────────────────────────────────
    employees.forEach(e => {
      const label = e.name || e.id
      if (e.role === "Intern" || e.role === "Stagiaire") return // exclus volontairement

      if (e.cje > 0 && !e.dateFirstSalary) {
        addE("critical", label, e.id, "Date Premier Salaire", "CJE renseigné mais Date Premier Salaire vide → employé exclu des calculs de salaires")
      }
      if (!e.role) {
        addE("warning", label, e.id, "Rôle", "Rôle vide — impossible de distinguer stagiaire / employé pour l'exclusion automatique")
      }
      if (!e.country) {
        addE("warning", label, e.id, "Pays", "Pays vide — règle 13e mois Maurice non applicable si non renseigné")
      }
      if ((!e.cje || e.cje === 0) && !e.endDate) {
        addE("warning", label, e.id, "CJE", "CJE = 0 sur un employé actif (sans date de sortie)")
      }
    })

    // ── Dépenses ─────────────────────────────────────────────────────────
    const rc = depenses.filter(d => d.recurringCritical)
    rc.forEach(d => {
      const label = d.description || d.fournisseur || d.id
      if (!d.abonnement || !d.abonnement.trim()) {
        addD("critical", label, d.id, "Abonnement", "Recurring Critical sans champ Abonnement → déduplication par fournisseur/description/catégorie (fragile)")
      }
      if (!d.recurrence) {
        addD("warning", label, d.id, "Récurrence", "Récurrence non renseignée → supposé Mensuel (si Annuel non détecté, coût sur-estimé × 12)")
      }
      if (!d.date) {
        addD("critical", label, d.id, "Date", "Date vide sur une dépense Recurring Critical → impossible de prendre la valeur la plus récente pour la déduplication")
      }
      if (d.montantMUR === 0 && (d.montant || 0) > 0) {
        addD("warning", label, d.id, "Montant MUR", `Montant MUR = 0 mais Montant brut = ${d.montant} ${d.devise} → conversion manquante, non comptée dans le prévisionnel`)
      }
    })

    return out.sort((a, b) => {
      const order: Record<IssueLevel, number> = { critical: 0, warning: 1, info: 2 }
      return order[a.level] - order[b.level]
    })
  }, [projects, employees, depenses])

  const filtered = issues.filter(i => {
    if (filter !== "all" && i.level !== filter) return false
    if (section !== "all" && i.source !== section) return false
    return true
  })
  const counts = { critical: issues.filter(i => i.level === "critical").length, warning: issues.filter(i => i.level === "warning").length }

  const IssueIcon = ({ level }: { level: IssueLevel }) =>
    level === "critical" ? <AlertOctagon size={13} color="#ef4444" style={{ flexShrink: 0 }} />
    : level === "warning" ? <AlertTriangle size={13} color="#facc15" style={{ flexShrink: 0 }} />
    : <Info size={13} color="#60a5fa" style={{ flexShrink: 0 }} />

  return (
    <div style={{ ...card, marginBottom: 16, padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(166,201,206,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Database size={15} color="var(--accent)" />
          <span style={{ fontSize: "var(--fs-md)", fontWeight: 600 }}>Database Review</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 6 }}>
            {counts.critical > 0 && <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(239,68,68,0.15)", color: "#ef4444", fontSize: "var(--fs-2xs)", fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}><AlertOctagon size={10} /> {counts.critical} Critical</span>}
            {counts.warning > 0 && <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(250,204,21,0.12)", color: "#facc15", fontSize: "var(--fs-2xs)", fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}><AlertTriangle size={10} /> {counts.warning} Warning</span>}
            {counts.critical === 0 && counts.warning === 0 && <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(34,197,94,0.12)", color: "#22c55e", fontSize: "var(--fs-2xs)", fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}><CheckCircle2 size={10} /> Tout OK</span>}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Seg value={section} onChange={v => setSection(v as any)} options={[["all", "Tous"], ["projects", "Projets"], ["employees", "Employés"], ["depenses", "Dépenses"]]} />
          <Seg value={filter} onChange={v => setFilter(v as any)} options={[["critical", "Critical"], ["warning", "Warning"], ["all", "Tous"]]} />
        </div>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div style={{ padding: 28, textAlign: "center", color: "var(--text-muted)", fontSize: "var(--fs-sm)", fontStyle: "italic", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <CheckCircle2 size={14} color="#22c55e" /> Aucune anomalie dans cette catégorie
        </div>
      ) : (
        <div style={{ maxHeight: 380, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
            <thead style={{ position: "sticky", top: 0, background: "var(--bg-panel)", zIndex: 2 }}>
              <tr style={{ borderBottom: "1px solid rgba(166,201,206,0.15)" }}>
                <th style={{ ...thStyle, width: 90 }}>Niveau</th>
                <th style={thStyle}>Entité</th>
                <th style={{ ...thStyle, width: 160 }}>Champ</th>
                <th style={thStyle}>Message</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((issue, i) => {
                const handleClick = () => {
                  if (issue.source === "projects") {
                    const p = projects.find((x: Project) => x.id === issue.entityId)
                    if (p) onEditProject?.(p, [issue.field])
                  } else if (issue.source === "depenses") {
                    const d = depenses.find((x: Depense) => x.id === issue.entityId)
                    if (d) onEditDepense?.(d)
                  } else if (issue.source === "employees") {
                    const notionId = issue.entityId.replace(/-/g, "")
                    window.open(`https://www.notion.so/${notionId}`, "_blank", "noopener")
                  }
                }
                const isClickable = issue.source === "projects" ? !!onEditProject : issue.source === "depenses" ? !!onEditDepense : true
                return (
                  <tr
                    key={i}
                    onClick={handleClick}
                    style={{ borderBottom: "1px solid rgba(166,201,206,0.05)", background: issue.level === "critical" ? "rgba(239,68,68,0.03)" : "transparent", cursor: isClickable ? "pointer" : "default", transition: "background 0.12s" }}
                    onMouseEnter={e => { if (isClickable) e.currentTarget.style.background = "rgba(166,201,206,0.07)" }}
                    onMouseLeave={e => { e.currentTarget.style.background = issue.level === "critical" ? "rgba(239,68,68,0.03)" : "transparent" }}
                  >
                    <td style={{ ...tdStyle }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 4, background: issue.level === "critical" ? "rgba(239,68,68,0.12)" : "rgba(250,204,21,0.10)", color: issue.level === "critical" ? "#ef4444" : "#facc15", fontWeight: 700, fontSize: "var(--fs-2xs)", width: "fit-content" }}>
                        <IssueIcon level={issue.level} />
                        {issue.level === "critical" ? "Critical" : "Warning"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        {issue.source === "employees" && <ExternalLink size={10} color="var(--text-muted)" style={{ flexShrink: 0 }} />}
                        {issue.entity}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: "var(--accent)", fontFamily: "monospace", fontSize: "var(--fs-2xs)" }}>{issue.field}</td>
                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{issue.message}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ───────── Finance Dashboard (hero) ─────────
// Séries rendues (identifiants = clés de toggle dans hidden) :
//  Actuels (pleins) : CA (line), Revenu (area), Dépenses (area stack), Salaires (area stack base), EBITDA (line)
//  Projetés (pointillés) : identiques mais suffixés "-projected"
// Ordre légende : CA, Revenu, EBITDA, Dépenses, Salaires
const HERO_SERIES_ACTUAL = [
  { key: "ca", label: "CA", color: "#3D8899", type: "line" },
  { key: "revenu", label: "Revenu", color: "#A6C9CE", type: "area" },
  { key: "ebitda", label: "EBITDA", color: "#22c55e", type: "line" },
  { key: "depenses", label: "Dépenses", color: "#ef4444", type: "area" },
  { key: "salaires", label: "Salaires", color: "#f97316", type: "area" },
] as const
const HERO_SERIES_PROJECTED = [
  { key: "ca-p", label: "CA proj.", color: "#3D8899", type: "line" },
  { key: "revenu-p", label: "Revenu proj.", color: "#A6C9CE", type: "area" },
  { key: "ebitda-p", label: "EBITDA proj.", color: "#22c55e", type: "line" },
  { key: "depenses-p", label: "Dépenses proj.", color: "#ef4444", type: "area" },
  { key: "salaires-p", label: "Salaires proj.", color: "#f97316", type: "area" },
] as const

function FinanceDashboard({ heroData, heroMode, setHeroMode, heroPast, setHeroPast, heroFuture, setHeroFuture, heroCustomStart, setHeroCustomStart, heroCustomEnd, setHeroCustomEnd, hidden, toggleHidden, fullscreen, setFullscreen, totals, projected, fyLabel, forecastWinMode, setForecastWinMode }: any) {
  const showSeries = (key: string) => !hidden.has(key)
  const [chartType, setChartType] = useState<"area" | "bar">("area")

  const renderChart = (height: number | string) => {
    if (chartType === "bar") {
      // Mode histogramme : barres groupées pour chaque métrique visible
      return (
        <ResponsiveContainer width="100%" height={height as any}>
          <BarChart data={heroData} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.06)" />
            <ReferenceLine y={0} stroke="var(--text-secondary)" strokeWidth={1.5} ifOverflow="extendDomain" />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" strokeWidth={1} ifOverflow="extendDomain" {...({ isFront: false } as any)} />
            <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: any) => `${(Number(v) / 1000).toFixed(0)}k`} />
            <Tooltip content={<HeroTooltip />} />
            {/* Actuels (solides) */}
            {showSeries("ca") && <Bar dataKey="caPast" fill="#3D8899" />}
            {showSeries("revenu") && <Bar dataKey="revenuPast" fill="#A6C9CE" />}
            {showSeries("ebitda") && <Bar dataKey="ebitdaPast" fill="#22c55e" />}
            {showSeries("depenses") && <Bar dataKey="depensesPast" fill="#ef4444" />}
            {showSeries("salaires") && <Bar dataKey="salairesPast" fill="#f97316" />}
            {/* Projetés (opacité réduite) */}
            {showSeries("ca-p") && <Bar dataKey="caProjected" fill="#3D8899" fillOpacity={0.4} />}
            {showSeries("revenu-p") && <Bar dataKey="revenuProjected" fill="#A6C9CE" fillOpacity={0.4} />}
            {showSeries("ebitda-p") && <Bar dataKey="ebitdaProjected" fill="#22c55e" fillOpacity={0.4} />}
            {showSeries("depenses-p") && <Bar dataKey="depensesProjected" fill="#ef4444" fillOpacity={0.4} />}
            {showSeries("salaires-p") && <Bar dataKey="salairesProjected" fill="#f97316" fillOpacity={0.4} />}
          </BarChart>
        </ResponsiveContainer>
      )
    }
    return (
    <ResponsiveContainer width="100%" height={height as any}>
      <AreaChart data={heroData} margin={{ left: 10, right: 10 }}>
        <defs>
          <linearGradient id="gDep" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.30} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} /></linearGradient>
          <linearGradient id="gSal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.35} /><stop offset="95%" stopColor="#f97316" stopOpacity={0.02} /></linearGradient>
          <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#A6C9CE" stopOpacity={0.35} /><stop offset="95%" stopColor="#A6C9CE" stopOpacity={0.02} /></linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.06)" />
            <ReferenceLine y={0} stroke="var(--text-secondary)" strokeWidth={1.5} ifOverflow="extendDomain" />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" strokeWidth={1} ifOverflow="extendDomain" {...({ isFront: false } as any)} />
        <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: any) => `${(Number(v) / 1000).toFixed(0)}k`} />
        <Tooltip content={<HeroTooltip />} />
        {/* ── PASSÉ (pleines) ── */}
        {showSeries("salaires") && <Area type="monotone" dataKey="salairesPast" stackId="chargesPast" stroke="#f97316" strokeWidth={2} fill="url(#gSal)" dot={false} activeDot={{ r: 4, fill: "#f97316", strokeWidth: 0 }} connectNulls={false} />}
        {showSeries("depenses") && <Area type="monotone" dataKey="depensesPast" stackId="chargesPast" stroke="#ef4444" strokeWidth={2} fill="url(#gDep)" dot={false} activeDot={{ r: 4, fill: "#ef4444", strokeWidth: 0 }} connectNulls={false} />}
        {showSeries("revenu") && <Area type="monotone" dataKey="revenuPast" stroke="#A6C9CE" strokeWidth={2} fill="url(#gRev)" dot={false} activeDot={{ r: 4, fill: "#A6C9CE", strokeWidth: 0 }} connectNulls={false} />}
        {showSeries("ca") && <Line type="monotone" dataKey="caPast" stroke="#3D8899" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#3D8899", strokeWidth: 0 }} connectNulls={false} />}
        {showSeries("ebitda") && <Line type="monotone" dataKey="ebitdaPast" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#22c55e", strokeWidth: 0 }} connectNulls={false} />}
        {/* ── FUTUR / PROJETÉS (pointillés) ── */}
        {showSeries("salaires-p") && <Area type="monotone" dataKey="salairesProjected" stackId="chargesFuture" stroke="#f97316" strokeWidth={2} strokeDasharray="5 4" fill="url(#gSal)" fillOpacity={0.4} dot={false} activeDot={{ r: 4, fill: "#f97316", strokeWidth: 0 }} connectNulls={false} />}
        {showSeries("depenses-p") && <Area type="monotone" dataKey="depensesProjected" stackId="chargesFuture" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 4" fill="url(#gDep)" fillOpacity={0.4} dot={false} activeDot={{ r: 4, fill: "#ef4444", strokeWidth: 0 }} connectNulls={false} />}
        {showSeries("revenu-p") && <Area type="monotone" dataKey="revenuProjected" stroke="#A6C9CE" strokeWidth={2} strokeDasharray="5 4" fill="url(#gRev)" fillOpacity={0.4} dot={false} activeDot={{ r: 4, fill: "#A6C9CE", strokeWidth: 0 }} connectNulls={false} />}
        {showSeries("ca-p") && <Line type="monotone" dataKey="caProjected" stroke="#3D8899" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, fill: "#3D8899", strokeWidth: 0 }} connectNulls={false} />}
        {showSeries("ebitda-p") && <Line type="monotone" dataKey="ebitdaProjected" stroke="#22c55e" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, fill: "#22c55e", strokeWidth: 0 }} connectNulls={false} />}
      </AreaChart>
    </ResponsiveContainer>
    )
  }

  const renderLegend = () => (
    <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(166,201,206,0.08)" }}>
      <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Actuels · clic pour masquer</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        {HERO_SERIES_ACTUAL.map(s => {
          const hid = hidden.has(s.key)
          const total = s.key === "ca" ? totals.ca : s.key === "revenu" ? totals.rev : s.key === "depenses" ? totals.dep : s.key === "salaires" ? totals.sal : totals.ebitda
          return (
            <button key={s.key} onClick={() => toggleHidden(s.key)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: hid ? "rgba(166,201,206,0.04)" : `${s.color}15`, border: `1px solid ${hid ? "var(--border-subtle)" : s.color}55`, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: "var(--fs-2xs)", opacity: hid ? 0.4 : 1, textDecoration: hid ? "line-through" : "none" }}>
              {s.type === "line"
                ? <span style={{ width: 14, height: 2, background: s.color }} />
                : <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />}
              <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{s.label}</span>
              <span style={{ fontFamily: "monospace", color: "var(--text-primary)", fontWeight: 700 }}>{Math.round(total).toLocaleString("fr-FR")}</span>
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Projetés (pointillés) · ne s'ajoutent pas aux actuels</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {HERO_SERIES_PROJECTED.map(s => {
          const hid = hidden.has(s.key)
          const total = s.key === "ca-p" ? projected.ca : s.key === "revenu-p" ? projected.rev : s.key === "depenses-p" ? projected.dep : s.key === "salaires-p" ? projected.sal : projected.ebitda
          return (
            <button key={s.key} onClick={() => toggleHidden(s.key)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: hid ? "rgba(166,201,206,0.04)" : `${s.color}10`, border: `1px dashed ${hid ? "var(--border-subtle)" : s.color}55`, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: "var(--fs-2xs)", opacity: hid ? 0.4 : 0.85, textDecoration: hid ? "line-through" : "none" }}>
              {s.type === "line"
                ? <span style={{ width: 14, height: 2, background: s.color, opacity: 0.7 }} />
                : <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, opacity: 0.5 }} />}
              <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{s.label}</span>
              <span style={{ fontFamily: "monospace", color: "var(--text-primary)", fontWeight: 600 }}>{Math.round(total).toLocaleString("fr-FR")}</span>
            </button>
          )
        })}
      </div>
    </div>
  )

  const renderControls = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 24px", borderBottom: "1px solid rgba(166,201,206,0.06)", flexWrap: "wrap" }}>
      <Seg value={heroMode} onChange={(v: string) => setHeroMode(v as any)} options={[["past", "Past"], ["future", "Future"], ["custom", "Custom"]]} />
      {heroMode === "past" && (
        <Seg value={heroPast} onChange={(v: string) => setHeroPast(v as any)} options={[["all", "All"], ["12m", "12m"], ["6m", "6m"], ["3m", "3m"]]} />
      )}
      {heroMode === "future" && (
        <Seg value={heroFuture} onChange={(v: string) => setHeroFuture(v as any)} options={[["12m", "12m"], ["6m", "6m"], ["3m", "3m"]]} />
      )}
      {heroMode === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-2xs)" }}>
          <label style={{ color: "var(--text-muted)" }}>Du</label>
          <input type="month" value={heroCustomStart} onChange={(e: any) => setHeroCustomStart(e.target.value)} style={{ padding: "3px 6px", fontSize: "var(--fs-2xs)", background: "rgba(166,201,206,0.06)", border: "1px solid rgba(166,201,206,0.12)", borderRadius: 4, color: "var(--text-primary)", fontFamily: "inherit" }} />
          <label style={{ color: "var(--text-muted)" }}>au</label>
          <input type="month" value={heroCustomEnd} onChange={(e: any) => setHeroCustomEnd(e.target.value)} style={{ padding: "3px 6px", fontSize: "var(--fs-2xs)", background: "rgba(166,201,206,0.06)", border: "1px solid rgba(166,201,206,0.12)", borderRadius: 4, color: "var(--text-primary)", fontFamily: "inherit" }} />
          {(heroCustomStart || heroCustomEnd) && (
            <button onClick={() => { setHeroCustomStart(""); setHeroCustomEnd("") }} style={{ background: "none", border: "1px solid var(--border-subtle)", color: "var(--text-muted)", cursor: "pointer", fontSize: "var(--fs-2xs)", padding: "3px 6px", borderRadius: 4, fontFamily: "inherit" }}>FY {fyLabel}</button>
          )}
        </div>
      )}
      {(heroMode === "future" || heroMode === "custom") && forecastWinMode !== undefined && (
        <WinRateToggle mode={forecastWinMode} onChange={setForecastWinMode} />
      )}
    </div>
  )

  const body = (
    <>
      {renderControls()}
      <div style={{ padding: "16px 16px 8px", flex: 1, minHeight: 0 }}>
        {renderChart(fullscreen ? "calc(90vh - 280px)" : 340)}
      </div>
      {renderLegend()}
    </>
  )

  if (fullscreen) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "fade-in 0.2s ease" }} onClick={() => setFullscreen(false)}>
        <div style={{ background: "var(--bg-panel)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(166,201,206,0.10)", borderRadius: 14, width: "95vw", height: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid rgba(166,201,206,0.08)" }}>
            <div style={{ fontSize: "var(--fs-lg)", fontWeight: 700, color: "var(--text-primary)" }}>Finance Dashboard</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setChartType(t => t === "area" ? "bar" : "area")} title={chartType === "area" ? "Vue histogramme" : "Vue courbes"} style={{ background: chartType === "bar" ? "var(--accent-soft)" : "none", border: `1px solid ${chartType === "bar" ? "var(--accent)" : "var(--border-subtle)"}`, borderRadius: 6, color: chartType === "bar" ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {chartType === "area" ? <BarChart2 size={14} /> : <LineChart size={14} />}
              </button>
              <button onClick={() => setFullscreen(false)} title="Réduire" style={{ background: "none", border: "1px solid var(--border-subtle)", borderRadius: 6, color: "var(--text-muted)", cursor: "pointer", width: 28, height: 28, fontSize: 14 }}>✕</button>
            </div>
          </div>
          {body}
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: "var(--bg-panel)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(166,201,206,0.10)", borderRadius: 14, padding: 0, marginBottom: 24, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(166,201,206,0.08)", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: "var(--fs-md)", fontWeight: 600, color: "var(--text-primary)" }}>Finance Dashboard</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4, fontFamily: "monospace" }}>
            <span><span style={{ color: "#A6C9CE", fontWeight: 700 }}>CA gut </span><span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{Math.round(totals.ca + (projected.caGut ?? projected.ca)).toLocaleString("fr-FR")}</span></span>
            <span><span style={{ color: "#7BB3BE", fontWeight: 700 }}>CA auto </span><span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{Math.round(totals.ca + (projected.cAAuto ?? projected.ca)).toLocaleString("fr-FR")}</span></span>
            <span><span style={{ color: "#A6C9CE", fontWeight: 600 }}>Rev gut </span><span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{Math.round(totals.rev + (projected.revGut ?? projected.rev)).toLocaleString("fr-FR")}</span></span>
            <span><span style={{ color: "#7BB3BE", fontWeight: 600 }}>Rev auto </span><span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{Math.round(totals.rev + (projected.revAuto ?? projected.rev)).toLocaleString("fr-FR")}</span></span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setChartType(t => t === "area" ? "bar" : "area")} title={chartType === "area" ? "Vue histogramme" : "Vue courbes"} style={{ background: chartType === "bar" ? "var(--accent-soft)" : "none", border: `1px solid ${chartType === "bar" ? "var(--accent)" : "var(--border-subtle)"}`, borderRadius: 6, color: chartType === "bar" ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {chartType === "area" ? <BarChart2 size={14} /> : <LineChart size={14} />}
          </button>
          <button onClick={() => setFullscreen(true)} title="Agrandir" style={{ background: "none", border: "1px solid var(--border-subtle)", borderRadius: 6, color: "var(--text-muted)", cursor: "pointer", width: 28, height: 28, fontSize: 14 }}>⛶</button>
        </div>
      </div>
      {body}
    </div>
  )
}

// Bloc de contrôles Past/Future/Custom (utilisé par hero, revenus, charges)
function ViewRangeToggle({ mode, setMode, past, setPast, future, setFuture, customStart, setCustomStart, customEnd, setCustomEnd, fyLabel }: {
  mode: "past" | "future" | "custom"; setMode: (v: "past" | "future" | "custom") => void
  past: "all" | "12m" | "6m" | "3m"; setPast: (v: "all" | "12m" | "6m" | "3m") => void
  future: "12m" | "6m" | "3m"; setFuture: (v: "12m" | "6m" | "3m") => void
  customStart: string; setCustomStart: (v: string) => void
  customEnd: string; setCustomEnd: (v: string) => void
  fyLabel?: string
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Seg value={mode} onChange={v => setMode(v as any)} options={[["past", "Past"], ["future", "Future"], ["custom", "Custom"]]} />
      {mode === "past" && (
        <Seg value={past} onChange={v => setPast(v as any)} options={[["all", "All"], ["12m", "12m"], ["6m", "6m"], ["3m", "3m"]]} />
      )}
      {mode === "future" && (
        <Seg value={future} onChange={v => setFuture(v as any)} options={[["12m", "12m"], ["6m", "6m"], ["3m", "3m"]]} />
      )}
      {mode === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--fs-2xs)" }}>
          <input type="month" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ padding: "3px 6px", fontSize: "var(--fs-2xs)", background: "rgba(166,201,206,0.06)", border: "1px solid rgba(166,201,206,0.12)", borderRadius: 4, color: "var(--text-primary)", fontFamily: "inherit" }} />
          <span style={{ color: "var(--text-muted)" }}>→</span>
          <input type="month" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ padding: "3px 6px", fontSize: "var(--fs-2xs)", background: "rgba(166,201,206,0.06)", border: "1px solid rgba(166,201,206,0.12)", borderRadius: 4, color: "var(--text-primary)", fontFamily: "inherit" }} />
          {(customStart || customEnd) && (
            <button onClick={() => { setCustomStart(""); setCustomEnd("") }} style={{ background: "none", border: "1px solid var(--border-subtle)", color: "var(--text-muted)", cursor: "pointer", fontSize: "var(--fs-2xs)", padding: "3px 6px", borderRadius: 4, fontFamily: "inherit" }}>
              {fyLabel ? `FY ${fyLabel}` : "Reset"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function WinRateToggle({ mode, onChange }: { mode: 'gut' | 'auto'; onChange: (m: 'gut' | 'auto') => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>Win rate</span>
      <Seg value={mode} onChange={v => onChange(v as 'gut' | 'auto')} options={[["gut", "Gut feeling"], ["auto", "Auto"]]} />
    </div>
  )
}

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: readonly (readonly [string, string])[] }) {
  return (
    <div style={{ display: "flex", background: "rgba(166,201,206,0.06)", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(166,201,206,0.10)" }}>
      {options.map(([val, label]) => (
        <button key={val} onClick={() => onChange(val)} style={{ padding: "3px 10px", fontSize: "var(--fs-2xs)", fontWeight: value === val ? 600 : 400, color: value === val ? "var(--text-primary)" : "var(--text-muted)", background: value === val ? "rgba(166,201,206,0.15)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>{label}</button>
      ))}
    </div>
  )
}

function RentaTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const typeColor = d.type ? undefined : "#A6C9CE"
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "12px 16px", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", fontSize: "var(--fs-xs)", minWidth: 240, maxWidth: 320 }}>
      <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "var(--fs-sm)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name || "—"}</div>
      {d.clientName && d.clientName !== "N/A" && (
        <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginBottom: 8 }}>{d.clientName}</div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {d.type && <span style={{ fontSize: "var(--fs-2xs)", padding: "2px 8px", borderRadius: 4, fontWeight: 600, background: `${typeColor || "var(--accent-soft)"}`, color: typeColor ? "#fff" : "var(--accent)" }}>{d.type}</span>}
        {d.status && <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontStyle: "italic" }}>{d.status}</span>}
        {d.risk && d.risk !== "Null" && <span style={{ fontSize: "var(--fs-2xs)", padding: "1px 6px", borderRadius: 3, fontWeight: 600, background: `${{ Low: "#22c55e", Medium: "#f97316", High: "#ef4444" }[d.risk as string] || "#6b7280"}22`, color: { Low: "#22c55e", Medium: "#f97316", High: "#ef4444" }[d.risk as string] || "#6b7280" }}>{d.risk}</span>}
      </div>
      <div style={{ borderTop: "1px solid rgba(166,201,206,0.10)", paddingTop: 6, marginTop: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
          <span style={{ color: "var(--text-muted)" }}>Montant</span>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--text-primary)" }}>{Math.round(d.x).toLocaleString("fr-FR")} MUR</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
          <span style={{ color: "var(--text-muted)" }}>Rentabilité</span>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: d.y >= 0 ? "#22c55e" : "#ef4444" }}>{d.y.toFixed(1)} %</span>
        </div>
        {d.finalAmount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>
            <span>Final Amount</span>
            <span style={{ fontFamily: "monospace" }}>{Math.round(d.finalAmount).toLocaleString("fr-FR")} {d.currency}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function HeroTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const datum = payload[0]?.payload
  if (!datum) return null
  const ca = datum.ca || 0
  const rev = datum.revenus || 0
  const commission = Math.max(0, ca - rev)
  const dep = datum.depenses || 0
  const sal = datum.salaires || 0
  const isFuture = !!datum.isFuture
  const ebitda = datum.ebitda ?? (rev - dep - sal)
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "14px 18px", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", fontSize: "var(--fs-xs)", minWidth: 240 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "var(--text-secondary)", fontSize: "var(--fs-sm)" }}>{label}</div>
        {isFuture && <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontStyle: "italic" }}>projection</span>}
      </div>
      <TRow c="#3D8899" l="CA" v={Math.round(ca).toLocaleString("fr-FR")} vc="#3D8899" bold />
      <TRow c="#A6C9CE" l="Revenu" v={Math.round(rev).toLocaleString("fr-FR")} vc="#A6C9CE" />
      {commission > 0 && <TRow c="var(--text-muted)" l="Commission" v={`−${Math.round(commission).toLocaleString("fr-FR")}`} vc="var(--text-muted)" />}
      <TRow c="#ef4444" l="Dépenses" v={Math.round(dep).toLocaleString("fr-FR")} vc="#ef4444" />
      <TRow c="#f97316" l="Salaires" v={Math.round(sal).toLocaleString("fr-FR")} vc="#f97316" />
      <div style={{ borderTop: "1px solid rgba(166,201,206,0.10)", paddingTop: 6, marginTop: 6 }}>
        <TRow c={ebitda >= 0 ? "#22c55e" : "#ef4444"} l="EBITDA" v={`${ebitda >= 0 ? "+" : ""}${Math.round(ebitda).toLocaleString("fr-FR")}`} vc={ebitda >= 0 ? "#22c55e" : "#ef4444"} bold />
      </div>
    </div>
  )
}

function RevenueTooltip({ active, payload, label, ventesListByMois }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  const moisCode = point?.mois || ""
  const isFuture = !!point?.isFuture
  // Lecture agrégée depuis le datum (fonctionne avec revenusPast/revenusFuture ou types par past/future)
  const rev = point?.revenus ?? ((point?.revenusPast || 0) + (point?.revenusFuture || 0))
  const allVentes = (ventesListByMois?.[moisCode] || []) as Project[]
  // En fullscreen : liste complète, sinon top 5
  const showAll = !!(ventesListByMois as any)?.__showAll
  const ventes = showAll ? allVentes : allVentes.slice(0, 5)
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "14px 18px", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", fontSize: "var(--fs-xs)", minWidth: 240, maxWidth: showAll ? 420 : 340, maxHeight: showAll ? "70vh" : undefined, overflowY: showAll ? "auto" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "var(--text-secondary)", fontSize: "var(--fs-sm)" }}>{label}</div>
        {isFuture && <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontStyle: "italic" }}>projection</span>}
      </div>
      <TRow c="#A6C9CE" l="Revenus" v={`${Math.round(rev).toLocaleString("fr-FR")} MUR`} vc="#A6C9CE" />
      {ventes.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(166,201,206,0.10)", paddingTop: 8, marginTop: 8 }}>
          <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginBottom: 4, fontWeight: 600 }}>Ventes du mois ({allVentes.length}) :</div>
          {ventes.map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "2px 0", fontSize: "var(--fs-2xs)" }}>
              <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.clientName || p.name}</span>
              <span style={{ fontFamily: "monospace", fontWeight: 600, flexShrink: 0 }}>{Math.round(getRevenueRaw(p)).toLocaleString("fr-FR")} {p.currency}</span>
            </div>
          ))}
          {!showAll && allVentes.length > 5 && <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>+ {allVentes.length - 5} autres</div>}
        </div>
      )}
      {ventes.length === 0 && <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 6, fontStyle: "italic" }}>Aucune vente ce mois</div>}
    </div>
  )
}

function TRow({ c, l, v, vc, bold }: { c: string; l: string; v: string; vc?: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} /><span style={{ color: "var(--text-muted)", fontWeight: bold ? 600 : undefined }}>{l}</span></div>
      <span style={{ fontWeight: bold ? 800 : 700, fontFamily: "monospace", color: vc || "var(--text-primary)" }}>{v}</span>
    </div>
  )
}

function CTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", fontSize: "var(--fs-xs)" }}>
      {label && <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--text-muted)", fontSize: "var(--fs-2xs)", letterSpacing: "0.04em" }}>{label}</div>}
      {payload.map((e: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "1px 0" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: e.color, flexShrink: 0 }} />
          <span style={{ color: "var(--text-muted)", flex: 1 }}>{e.name || e.dataKey}</span>
          <span style={{ fontWeight: 600, fontFamily: "monospace" }}>{formatter ? formatter(e.value, e.name || e.dataKey) : e.value}</span>
        </div>
      ))}
    </div>
  )
}
