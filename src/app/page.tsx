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

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string; name: string; status: string; type: string; methodology: string
  currency: string; quotedAmount: number; finalAmount: number
  winPercent: number; riskLevel: string; startDate: string; endDate: string
  rentabilite: number | null; netAmount: number | null; humanCost: number | null
  clientName: string; clientSatisfaction?: string
  clientIds?: string[]
  commissionPercent?: number; commissionTo?: string
}

interface Client { id: string; name: string }

interface Employee {
  id: string; name: string; cje: number; startDate: string; endDate: string; role: string
}

interface Depense {
  id: string; description: string; date: string; fournisseur: string
  categorie: string; sousCategorie: string; montant: number
  montantMUR: number; devise: string; dossier: string; payePar: string
  recurringCritical?: boolean
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
// Taux de conversion vers MUR (utilisés pour Final Amount si Currency != MUR)
const CURRENCY_RATES: Record<string, number> = { MUR: 1, EUR: 49, USD: 46, GBP: 57 }
const toMUR = (amount: number, currency: string | undefined | null): number => {
  const rate = CURRENCY_RATES[currency || "MUR"] ?? 1
  return (amount || 0) * rate
}

// Règle revenus : Quoted Amount × Win % (gut feeling), normalisé
// Permet de projeter le futur sans biaiser le passé (projets gagnés → win = 100%)
function getWinRate(p: Project): number {
  const w = Number(p.winPercent || 0)
  if (w <= 0) return 0
  return w > 1 ? w / 100 : w
}
function getRevenueRaw(p: Project): number {
  return (p.quotedAmount || 0) * getWinRate(p)
}
const getRevenueMUR = (p: Project): number => toMUR(getRevenueRaw(p), p.currency)

// Mois associé au revenu : End Date (fallback Start Date)
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
  const [chargesMode, setChargesMode] = useState<"all" | "depenses" | "salaires">("all")
  const [topMode, setTopMode] = useState<"clients" | "fournisseurs">("clients")
  const [tableMode, setTableMode] = useState<"ventes" | "depenses">("ventes")

  // Modal states
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [editDepense, setEditDepense] = useState<Depense | null>(null)
  const [showAddVente, setShowAddVente] = useState(false)
  const [saving, setSaving] = useState(false)
  // Freeze & hover states pour les charts mensuels
  const [pinnedRevMois, setPinnedRevMois] = useState<string | null>(null)
  const [hoverRevMois, setHoverRevMois] = useState<string | null>(null)
  const [pinnedDepMois, setPinnedDepMois] = useState<string | null>(null)
  const [hoverDepMois, setHoverDepMois] = useState<string | null>(null)
  const hoverRevRef = useRef<string | null>(null)
  const hoverDepRef = useRef<string | null>(null)
  const revChartRef = useRef<HTMLDivElement | null>(null)
  const depChartRef = useRef<HTMLDivElement | null>(null)
  // Filtres de mois pour listes fullscreen ("" = tous les mois)
  const [revFsFilterMois, setRevFsFilterMois] = useState<string>("")
  const [depFsFilterMois, setDepFsFilterMois] = useState<string>("")
  const [topDetailItem, setTopDetailItem] = useState<{ mode: "clients" | "fournisseurs"; name: string } | null>(null)

  // Escape pour défiger + clic en dehors des charts pour défiger
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPinnedRevMois(null); setPinnedDepMois(null) }
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (pinnedRevMois && revChartRef.current && !revChartRef.current.contains(target)) setPinnedRevMois(null)
      if (pinnedDepMois && depChartRef.current && !depChartRef.current.contains(target)) setPinnedDepMois(null)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDown)
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown) }
  }, [pinnedRevMois, pinnedDepMois])

  const currentRevMois = pinnedRevMois || hoverRevMois
  const currentDepMois = pinnedDepMois || hoverDepMois

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

  const revFilteredProjects = useMemo(() => {
    const wonProjects = projects.filter(p => ["Won", "Active", "Completed", "Won orally"].includes(p.status))
    if (revPeriod === "all") return wonProjects
    if (revPeriod === "month") return wonProjects.filter(p => dossierFromDate(getRevenueDateISO(p)) === currentDossier)
    if (revPeriod === "quarter") return wonProjects.filter(p => { const k = dossierFromDate(getRevenueDateISO(p)); return k >= fq.startCode && k <= fq.endCode })
    return wonProjects.filter(p => dossierInFiscalYear(dossierFromDate(getRevenueDateISO(p)), fyStartYear))
  }, [projects, revPeriod, currentDossier, fq, fyStartYear])

  const depTotal = useMemo(() => depFiltered.reduce((s, d) => s + d.montantMUR, 0), [depFiltered])
  const depTotalAll = useMemo(() => depenses.reduce((s, d) => s + d.montantMUR, 0), [depenses])
  const revTotalAll = useMemo(() => projects.filter(p => ["Won", "Active", "Completed", "Won orally"].includes(p.status)).reduce((s, p) => s + getRevenueMUR(p), 0), [projects])
  const revTotal = useMemo(() => revFilteredProjects.reduce((s, p) => s + getRevenueMUR(p), 0), [revFilteredProjects])
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

  // Salaires : début = mars 2026 ("2603")
  const SALAIRE_START_CODE = "2603"
  const salaireMensuel = useMemo(() => employees.reduce((s, e) => s + (e.cje || 0) * 220 / 12, 0), [employees])

  // Dépenses récurrentes critiques : montant mensuel à projeter dans le futur
  // Déduplication par (fournisseur + description + catégorie), on prend la dernière occurrence
  const recurringCriticalMensuel = useMemo(() => {
    const uniq: Record<string, { key: string; date: string; montantMUR: number }> = {}
    depenses.filter(d => d.recurringCritical).forEach(d => {
      const key = [d.fournisseur || "", d.description || "", d.categorie || ""].map(s => s.trim().toLowerCase()).join("|")
      const cur = uniq[key]
      // Garde la plus récente
      if (!cur || (d.date || "") > cur.date) {
        uniq[key] = { key, date: d.date || "", montantMUR: d.montantMUR || 0 }
      }
    })
    return Object.values(uniq).reduce((s, v) => s + v.montantMUR, 0)
  }, [depenses])

  // Nombre de mois "salariés" (>= 2603 et <= currentDossier) inclus dans une période
  const computeSalariedMonths = useCallback((period: "all" | "year" | "quarter" | "month"): number => {
    const curCode = currentDossier
    if (period === "month") return curCode >= SALAIRE_START_CODE ? 1 : 0
    // Construire la liste des codes YYMM couverts
    const codes: string[] = []
    const pushRange = (fromY: number, fromM: number, toY: number, toM: number) => {
      let y = fromY, m = fromM
      while (y < toY || (y === toY && m <= toM)) {
        codes.push(`${String(y).padStart(2, "0")}${String(m).padStart(2, "0")}`)
        m++; if (m > 12) { m = 1; y++ }
      }
    }
    if (period === "all") {
      // Du 2603 à current
      pushRange(26, 3, parseInt(curCode.slice(0, 2), 10), parseInt(curCode.slice(2), 10))
    } else if (period === "year") {
      // FY : juillet fyStartYear → juin fyStartYear+1, limité à current
      const fyStartYY = fyStartYear % 100
      pushRange(fyStartYY, 7, fyStartYY + 1, 6)
    } else if (period === "quarter") {
      const fromY = parseInt(fq.startCode.slice(0, 2), 10)
      const fromM = parseInt(fq.startCode.slice(2), 10)
      const toY = parseInt(fq.endCode.slice(0, 2), 10)
      const toM = parseInt(fq.endCode.slice(2), 10)
      pushRange(fromY, fromM, toY, toM)
    }
    return codes.filter(c => c >= SALAIRE_START_CODE && c <= curCode).length
  }, [currentDossier, fyStartYear, fq])

  const salairesForDepPeriod = useMemo(() => salaireMensuel * computeSalariedMonths(depPeriod), [salaireMensuel, computeSalariedMonths, depPeriod])
  const salairesForRevPeriod = useMemo(() => salaireMensuel * computeSalariedMonths(revPeriod), [salaireMensuel, computeSalariedMonths, revPeriod])
  const chargesTotal = depTotal + salairesForDepPeriod
  const avgMarginWithSalaries = revTotal > 0 ? ((revTotal - chargesTotal) / revTotal) * 100 : 0

  // Charts data — inclut salaires (colonne "Salaires") pour stacker comme la chart principale
  const depParMois = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    depenses.forEach(d => { if (!d.dossier) return; if (!m[d.dossier]) m[d.dossier] = {}; m[d.dossier][d.categorie] = (m[d.dossier][d.categorie] || 0) + d.montantMUR })
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([dossier, cats]) => ({
      dossier,
      label: fmtDossier(dossier),
      Salaires: dossier >= SALAIRE_START_CODE ? salaireMensuel : 0,
      ...cats,
    }))
  }, [depenses, salaireMensuel])
  // Ordonné selon l'importance (même ordre que le pie "Dépenses par catégorie")
  const allCats = useMemo(() => {
    const m: Record<string, number> = {}
    depenses.forEach(d => { if (d.categorie) m[d.categorie] = (m[d.categorie] || 0) + d.montantMUR })
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name]) => name)
  }, [depenses])

  // Toujours calculé sur TOUTES les dépenses (ne dépend PAS de kpiPeriod)
  const depParCat = useMemo(() => {
    const m: Record<string, number> = {}
    depenses.forEach(d => { if (d.categorie) m[d.categorie] = (m[d.categorie] || 0) + d.montantMUR })
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [depenses])

  // Couleur par catégorie — mapping stable basé sur le pie "Dépenses par catégorie"
  // Tons de bleu/teal (PIE_CAT), dans l'ordre décroissant des montants
  const depCategoryColors = useMemo(() => {
    const m: Record<string, string> = {}
    depParCat.forEach((d, i) => { m[d.name] = PIE_CAT[i % PIE_CAT.length] })
    return m
  }, [depParCat])

  // Plage de mois commune pour les charts Revenus mensuels (Total + Par types) : min existant → current+3
  const revChartRange = useMemo(() => {
    const revMap: Record<string, number> = {}
    projects.forEach(p => {
      const iso = getRevenueDateISO(p)
      if (!iso) return
      const d = new Date(iso)
      const k = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`
      revMap[k] = (revMap[k] || 0) + getRevenueMUR(p)
    })
    const depMap: Record<string, number> = {}
    depenses.forEach(d => { if (d.dossier) depMap[d.dossier] = (depMap[d.dossier] || 0) + d.montantMUR })
    const allKeys = new Set([...Object.keys(revMap), ...Object.keys(depMap)])
    const curY = parseInt(currentDossier.slice(0, 2), 10)
    const curM = parseInt(currentDossier.slice(2), 10)
    for (let i = 0; i <= 3; i++) {
      let y = curY, m = curM + i
      while (m > 12) { m -= 12; y += 1 }
      allKeys.add(`${String(y).padStart(2, "0")}${String(m).padStart(2, "0")}`)
    }
    const sorted = [...allKeys].sort()
    const filled: string[] = []
    if (sorted.length >= 2) {
      const [y1, m1] = [parseInt(sorted[0].slice(0, 2), 10), parseInt(sorted[0].slice(2), 10)]
      const [y2, m2] = [parseInt(sorted[sorted.length - 1].slice(0, 2), 10), parseInt(sorted[sorted.length - 1].slice(2), 10)]
      let y = y1, m = m1
      while (y < y2 || (y === y2 && m <= m2)) {
        filled.push(`${String(y).padStart(2, "0")}${String(m).padStart(2, "0")}`)
        m++; if (m > 12) { m = 1; y++ }
      }
    } else if (sorted.length === 1) {
      filled.push(sorted[0])
    }
    return { filled, revMap, depMap }
  }, [projects, depenses, currentDossier])

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
    projects.filter(p => getRevenueRaw(p) > 0).forEach(p => {
      const iso = getRevenueDateISO(p)
      if (!iso) return
      const d = new Date(iso)
      const k = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`
      const type = p.type || "N/A"
      if (type === "Internal" || type === "N/A") return
      if (!byMois[k]) byMois[k] = {}
      byMois[k][type] = (byMois[k][type] || 0) + getRevenueMUR(p)
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

  // Liste des ventes par mois (clé = dossier-style "YYMM") — pour tooltip "Revenus mensuels"
  const ventesListByMois = useMemo(() => {
    const m: Record<string, Project[]> = {}
    projects.filter(p => ["Won", "Active", "Completed", "Won orally"].includes(p.status) && getRevenueRaw(p) > 0).forEach(p => {
      const iso = getRevenueDateISO(p)
      if (!iso) return
      const d = new Date(iso)
      const k = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`
      if (!m[k]) m[k] = []
      m[k].push(p)
    })
    // Trier chaque mois par montant décroissant (en MUR)
    Object.keys(m).forEach(k => m[k].sort((a, b) => getRevenueMUR(b) - getRevenueMUR(a)))
    return m
  }, [projects])

  const projParTypeFiltered = useMemo(() => {
    const m: Record<string, { count: number; amount: number }> = {}
    projects.filter(p => !["Lost", "Cancelled"].includes(p.status)).forEach(p => {
      const t = p.type || "N/A"; if (!m[t]) m[t] = { count: 0, amount: 0 }; m[t].count++; m[t].amount += getRevenueMUR(p)
    })
    return Object.entries(m).filter(([n]) => n !== "Internal" && n !== "N/A").map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount)
  }, [projects])

  const allFourn = useMemo(() => {
    // Pour chaque fournisseur: total + catégorie dominante (max en MUR) + nb de dépenses
    const m: Record<string, { value: number; catTotals: Record<string, number>; count: number }> = {}
    depenses.forEach(d => {
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
    const m: Record<string, { value: number; count: number; projects: Project[]; byType: Record<string, number> }> = {}
    projects.filter(p => !["Lost", "Cancelled"].includes(p.status) && p.clientName && p.clientName !== "N/A").forEach(p => {
      if (!m[p.clientName]) m[p.clientName] = { value: 0, count: 0, projects: [], byType: {} }
      const amt = getRevenueMUR(p)
      m[p.clientName].value += amt
      m[p.clientName].count += 1
      m[p.clientName].projects.push(p)
      const type = p.type || "N/A"
      m[p.clientName].byType[type] = (m[p.clientName].byType[type] || 0) + amt
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

  // Rentabilité: filter out Internal projects
  const rentaData = useMemo(() =>
    projects
      .filter(p => getRevenueRaw(p) > 0 && p.rentabilite != null && p.type !== "Internal")
      .map(p => ({
        name: p.name, x: getRevenueMUR(p), y: (p.rentabilite ?? 0) * 100, risk: p.riskLevel || "Null",
      }))
  , [projects])

  // Hero
  const heroData = useMemo(() => {
    const dM: Record<string, number> = {}
    depenses.forEach(d => { if (d.dossier) dM[d.dossier] = (dM[d.dossier] || 0) + d.montantMUR })
    const rM: Record<string, number> = {}
    projects.filter(p => ["Won", "Active", "Completed", "Won orally"].includes(p.status)).forEach(p => {
      const iso = getRevenueDateISO(p)
      if (!iso) return
      const d = new Date(iso)
      const k = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`
      rM[k] = (rM[k] || 0) + getRevenueMUR(p)
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
      const allPast = new Set<string>([...Object.keys(dM), ...Object.keys(rM)])
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
      const rev = rM[m] || 0
      const dep = dM[m] || 0
      const sal = m >= SALAIRE_START_CODE ? salaireMensuel : 0
      const revVal = isFuture ? 0 : rev
      // Futur : dépenses = somme des Recurring Critical projetés (sans doublons)
      const depVal = isFuture ? recurringCriticalMensuel : dep
      // Past : valeurs pour m <= curCode (y compris le mois courant)
      // Future : valeurs pour m >= curCode (y compris le mois courant) → point partagé pour lisser la transition
      const inPast = m <= curCode
      const inFuture = m >= curCode
      return {
        mois: m,
        label: fmtDossier(m),
        isFuture,
        isCurrent,
        // Agrégés (pour tooltip + totaux)
        depenses: depVal,
        revenus: revVal,
        salaires: sal,
        // Net : seulement sur le passé
        net: isFuture ? null : (rev - dep - sal),
        // Split passé/futur — le mois courant appartient aux DEUX pour connecter visuellement
        depensesPast: inPast ? depVal : null,
        depensesFuture: inFuture ? depVal : null,
        revenusPast: inPast ? revVal : null,
        revenusFuture: inFuture ? revVal : null,
        salairesPast: inPast ? sal : null,
        salairesFuture: inFuture ? sal : null,
      } as any
    })
  }, [depenses, projects, heroMode, heroPast, heroFuture, heroCustomStart, heroCustomEnd, currentDossier, fyStartYear, salaireMensuel, recurringCriticalMensuel])
  const heroTotalDep = useMemo(() => heroData.filter(d => !d.isFuture).reduce((s, d) => s + (d.depenses || 0), 0), [heroData])
  const heroTotalRev = useMemo(() => heroData.filter(d => !d.isFuture).reduce((s, d) => s + (d.revenus || 0), 0), [heroData])
  const heroTotalSal = useMemo(() => heroData.filter(d => !d.isFuture).reduce((s, d) => s + (d.salaires || 0), 0), [heroData])
  const heroNet = heroTotalRev - heroTotalDep - heroTotalSal

  // Table data — all items (no limit), with filters
  // Tri basé sur End Date (mois du revenu)
  const allVentes = useMemo(() =>
    projects.filter(p => ["Won", "Active", "Completed", "Won orally"].includes(p.status) && getRevenueRaw(p) > 0)
      .sort((a, b) => (getRevenueDateISO(b) || "").localeCompare(getRevenueDateISO(a) || ""))
  , [projects])

  // ── Database Review Critical — santé des fiches projets ─────────
  // Règles :
  //   - Projets type "Internal" EXCLUS (pas critiqués)
  //   - Final Amount requis UNIQUEMENT pour projets passés (Start Date dans le passé)
  const PROJECT_REQUIRED_FIELDS: Array<{ key: string; label: string; check: (p: Project) => boolean }> = [
    { key: "name", label: "Name", check: p => !!p.name },
    { key: "status", label: "Status", check: p => !!p.status },
    { key: "type", label: "Type", check: p => !!p.type },
    { key: "currency", label: "Currency", check: p => !!p.currency },
    { key: "quotedAmount", label: "Quoted Amount", check: p => p.quotedAmount > 0 },
    { key: "winPercent", label: "Win %", check: p => p.winPercent > 0 },
    { key: "riskLevel", label: "Risk Level", check: p => !!p.riskLevel },
    { key: "clientName", label: "Client", check: p => !!p.clientName && p.clientName !== "N/A" && !!p.clientIds?.length },
    { key: "startDate", label: "Start Date", check: p => !!p.startDate },
    { key: "endDate", label: "End Date", check: p => !!p.endDate },
    { key: "methodology", label: "Methodology", check: p => !!p.methodology },
  ]
  const FINAL_AMOUNT_FIELD = { key: "finalAmount", label: "Final Amount", check: (p: Project) => p.finalAmount > 0 }

  const projectsHealth = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return projects
      .filter(p => p.type !== "Internal") // Internal exclus du critique
      .map(p => {
        const checks = [...PROJECT_REQUIRED_FIELDS]
        // Projet passé = startDate dans le passé (strictement)
        const isPast = p.startDate ? (new Date(p.startDate).getTime() < today.getTime()) : false
        if (isPast) checks.push(FINAL_AMOUNT_FIELD)
        const missing: string[] = []
        let ok = 0
        for (const f of checks) {
          if (f.check(p)) ok++
          else missing.push(f.label)
        }
        const total = checks.length
        const pct = total > 0 ? Math.round((ok / total) * 100) : 0
        return { project: p, health: pct, missing, total, ok, isPast }
      })
  }, [projects])

  const healthStats = useMemo(() => {
    const total = projectsHealth.length
    const healthy = projectsHealth.filter(h => h.health === 100).length
    const partial = projectsHealth.filter(h => h.health >= 60 && h.health < 100).length
    const critical = projectsHealth.filter(h => h.health < 60).length
    const avgHealth = total > 0 ? Math.round(projectsHealth.reduce((s, h) => s + h.health, 0) / total) : 0
    const missingFieldCounts: Record<string, number> = {}
    projectsHealth.forEach(h => h.missing.forEach(f => { missingFieldCounts[f] = (missingFieldCounts[f] || 0) + 1 }))
    const topMissing = Object.entries(missingFieldCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    return { total, healthy, partial, critical, avgHealth, topMissing }
  }, [projectsHealth])

  const [healthFilter, setHealthFilter] = useState<"all" | "partial" | "critical">("critical")
  const filteredHealth = useMemo(() => {
    const list = healthFilter === "all"
      ? projectsHealth
      : healthFilter === "partial"
        ? projectsHealth.filter(h => h.health >= 60 && h.health < 100)
        : projectsHealth.filter(h => h.health < 60)
    return [...list].sort((a, b) => a.health - b.health)
  }, [projectsHealth, healthFilter])

  // ── Cash / Commissions ────────────────────────────────────────
  // Règle : si "Ad-hoc commissions 1 ? (eg training services)" est rempli,
  // commission = "% of commissions" × "Final Amount" (dans la devise du projet, converti en MUR)
  const cashData = useMemo(() => {
    const wonProjects = projects.filter(p => ["Won", "Active", "Completed", "Won orally"].includes(p.status))
    let caTotal = 0
    let eqxiaTotal = 0
    let commissionsTotal = 0
    const byBeneficiaire: Record<string, { total: number; percent: number; projectCount: number; projects: { name: string; amount: number; pct: number }[] }> = {}

    for (const p of wonProjects) {
      const caMUR = getRevenueMUR(p)
      if (!caMUR) continue
      caTotal += caMUR

      const beneficiaire = (p.commissionTo || "").trim()
      const pct = Number(p.commissionPercent || 0)
      // Normalise : si > 1 → /100 (pourcentage stocké en number 0-100)
      const normalizedPct = pct > 1 ? pct / 100 : pct

      if (beneficiaire && normalizedPct > 0 && p.finalAmount > 0) {
        // Commission strictement = "% of commissions" * "Final Amount" (en devise du projet, converti MUR)
        const commissionMUR = toMUR(p.finalAmount * normalizedPct, p.currency)
        commissionsTotal += commissionMUR
        eqxiaTotal += caMUR - commissionMUR
        const percentLabel = normalizedPct * 100
        if (!byBeneficiaire[beneficiaire]) byBeneficiaire[beneficiaire] = { total: 0, percent: percentLabel, projectCount: 0, projects: [] }
        byBeneficiaire[beneficiaire].total += commissionMUR
        byBeneficiaire[beneficiaire].projectCount += 1
        byBeneficiaire[beneficiaire].projects.push({ name: p.name, amount: commissionMUR, pct: percentLabel })
      } else {
        eqxiaTotal += caMUR
      }
    }
    const beneficiaires = Object.entries(byBeneficiaire)
      .map(([name, v]) => ({
        name,
        ...v,
        // % affiché = moyenne pondérée par le montant
        percent: v.projects.length > 0 ? (v.projects.reduce((s, pr) => s + pr.pct * pr.amount, 0) / (v.total || 1)) : v.percent,
      }))
      .sort((a, b) => b.total - a.total)
    return { caTotal, eqxiaTotal, commissionsTotal, beneficiaires }
  }, [projects])

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

  if (status === "loading" || loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.32)" }} />
      <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
        <img src="/assets/logos/eqxia-logo-teal-transparent.png" alt="EQXIA" style={{ height: "var(--loading-logo-h)", marginBottom: 20 }} />
        <div style={{ color: "#A6C9CE", fontFamily: "'Inter', system-ui, sans-serif", fontSize: "var(--loading-app-fs)", fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 28 }}>Plutus</div>
        <div style={{ width: 36, height: 36, border: "3px solid var(--border-subtle)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <div style={{ color: "#A6C9CE", fontFamily: "'Inter', system-ui, sans-serif", fontSize: "var(--fs-sm)", fontWeight: 300, letterSpacing: "0.12em" }}>Chargement…</div>
      </div>
    </div>
  )

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
              <SignOutButton />
            </div>
          }
        />

        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px", width: "100%" }}>

          {error && <div style={{ ...card, background: "var(--btn-danger-bg)", border: "1px solid rgba(248,113,113,0.3)", color: "var(--color-error)", fontSize: "var(--fs-sm)", marginBottom: 16 }}>Erreur: {error}</div>}

          {/* ── KPIs ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            {/* Revenus card with toggle */}
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>Revenus</div>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(166,201,206,0.15)", border: "1px solid rgba(166,201,206,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>💰</div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)", letterSpacing: "-0.03em", lineHeight: 1 }}>{Math.round(revTotal).toLocaleString("fr-FR")}</span>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>MUR</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>{revPeriodLabel}</div>
                <Seg value={kpiPeriod} onChange={v => setKpiPeriod(v as any)} options={[["all", "All"], ["year", "A"], ["quarter", "T"], ["month", "M"]]} />
              </div>
            </div>

            <KpiCard
              icon="📉"
              iconBg="rgba(166,201,206,0.15)"
              iconBorder="rgba(166,201,206,0.3)"
              label="Average Margin"
              value={`${avgMarginWithSalaries.toFixed(1)}%`}
              unit=""
              sub={`Rev − Charges (${periodLabel(kpiPeriod)})`}
              valueColor={avgMarginWithSalaries >= 0 ? "var(--accent)" : "var(--color-error)"}
            />

            {/* Charges (Dépenses + Salaires) card with toggle — aligné avec les autres KpiCard */}
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>Charges (Dépenses &amp; Salaires)</div>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>💸</div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1 }}>{Math.round(chargesTotal).toLocaleString("fr-FR")}</span>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>MUR</span>
              </div>
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontFamily: "monospace", marginTop: 6 }}>
                {Math.round(salairesForDepPeriod).toLocaleString("fr-FR")} <span style={{ color: "#f97316" }}>sal</span> + {Math.round(depTotal).toLocaleString("fr-FR")} <span style={{ color: "#ef4444" }}>dép</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>{depPeriodLabel}</div>
                <Seg value={kpiPeriod} onChange={v => setKpiPeriod(v as any)} options={[["all", "All"], ["year", "A"], ["quarter", "T"], ["month", "M"]]} />
              </div>
            </div>

            <KpiCard icon="⚡" iconBg="rgba(20,184,166,0.15)" iconBorder="rgba(20,184,166,0.3)" label="Projets actifs" value={`${projetsActifs}`} unit={`/ ${projetsTotal}`} sub="Status = Active" />
          </div>

          {/* ── HERO ── */}
          <div style={{ ...card, padding: 0, marginBottom: 24, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(166,201,206,0.08)", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: "var(--fs-md)", fontWeight: 600, color: "var(--text-primary)" }}>Dépenses vs Revenus</div>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                  Dépenses empilées sur salaires · Net = Revenus - Dépenses - Salaires
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 10, fontSize: "var(--fs-xs)", flexWrap: "wrap" }}>
                  <Badge c="#A6C9CE" l="Revenus" v={Math.round(heroTotalRev).toLocaleString("fr-FR")} />
                  <Badge c="#ef4444" l="Dépenses" v={Math.round(heroTotalDep).toLocaleString("fr-FR")} />
                  <Badge c="#f97316" l="Salaires" v={Math.round(salaireMensuel).toLocaleString("fr-FR")} />
                  <Badge c={heroNet >= 0 ? "#22c55e" : "#ef4444"} l="Net" v={`${heroNet >= 0 ? "+" : ""}${Math.round(heroNet).toLocaleString("fr-FR")}`} />
                </div>
              </div>
            </div>

            {/* Ligne contrôles : Mode + sélecteur secondaire */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 24px", borderBottom: "1px solid rgba(166,201,206,0.06)", flexWrap: "wrap" }}>
              <Seg value={heroMode} onChange={v => setHeroMode(v as any)} options={[["past", "Past"], ["future", "Future"], ["custom", "Custom"]]} />
              {heroMode === "past" && (
                <Seg value={heroPast} onChange={v => setHeroPast(v as any)} options={[["all", "All"], ["12m", "12m"], ["6m", "6m"], ["3m", "3m"]]} />
              )}
              {heroMode === "future" && (
                <Seg value={heroFuture} onChange={v => setHeroFuture(v as any)} options={[["12m", "12m"], ["6m", "6m"], ["3m", "3m"]]} />
              )}
              {heroMode === "custom" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-2xs)" }}>
                  <label style={{ color: "var(--text-muted)" }}>Du</label>
                  <input type="month" value={heroCustomStart} onChange={e => setHeroCustomStart(e.target.value)} placeholder={`${fy.start.getFullYear()}-07`} style={{ padding: "3px 6px", fontSize: "var(--fs-2xs)", background: "rgba(166,201,206,0.06)", border: "1px solid rgba(166,201,206,0.12)", borderRadius: 4, color: "var(--text-primary)", fontFamily: "inherit" }} />
                  <label style={{ color: "var(--text-muted)" }}>au</label>
                  <input type="month" value={heroCustomEnd} onChange={e => setHeroCustomEnd(e.target.value)} placeholder={`${fy.end.getFullYear()}-06`} style={{ padding: "3px 6px", fontSize: "var(--fs-2xs)", background: "rgba(166,201,206,0.06)", border: "1px solid rgba(166,201,206,0.12)", borderRadius: 4, color: "var(--text-primary)", fontFamily: "inherit" }} />
                  {(heroCustomStart || heroCustomEnd) && (
                    <button onClick={() => { setHeroCustomStart(""); setHeroCustomEnd("") }} style={{ background: "none", border: "1px solid var(--border-subtle)", color: "var(--text-muted)", cursor: "pointer", fontSize: "var(--fs-2xs)", padding: "3px 6px", borderRadius: 4, fontFamily: "inherit" }}>
                      FY défaut
                    </button>
                  )}
                </div>
              )}
              {heroMode === "future" && (
                <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontStyle: "italic" }}>
                  Projection (pointillés) — les salaires sont supposés constants
                </span>
              )}
            </div>

            <div style={{ padding: "16px 16px 8px" }}>
              <ResponsiveContainer width="100%" height={340}>
                <AreaChart data={heroData} margin={{ left: 10, right: 10 }}>
                  <defs>
                    <linearGradient id="gDep" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.30} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="gSal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.35} /><stop offset="95%" stopColor="#f97316" stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#A6C9CE" stopOpacity={0.35} /><stop offset="95%" stopColor="#A6C9CE" stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.06)" />
                  {/* Trait y=0 plein blanc, derrière les séries */}
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" strokeWidth={1} ifOverflow="extendDomain" {...({ isFront: false } as any)} />
                  <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                  <Tooltip content={<HeroTooltip />} />
                  {/* ── PASSÉ : traits pleins, charges empilées (salaires base, dépenses dessus) ── */}
                  <Area type="monotone" dataKey="salairesPast" stackId="chargesPast" stroke="#f97316" strokeWidth={2} fill="url(#gSal)" dot={false} activeDot={{ r: 4, fill: "#f97316", strokeWidth: 0 }} connectNulls={false} />
                  <Area type="monotone" dataKey="depensesPast" stackId="chargesPast" stroke="#ef4444" strokeWidth={2} fill="url(#gDep)" dot={false} activeDot={{ r: 4, fill: "#ef4444", strokeWidth: 0 }} connectNulls={false} />
                  <Area type="monotone" dataKey="revenusPast" stroke="#A6C9CE" strokeWidth={2} fill="url(#gRev)" dot={false} activeDot={{ r: 4, fill: "#A6C9CE", strokeWidth: 0 }} connectNulls={false} />
                  {/* ── FUTUR : traits en pointillés ── */}
                  <Area type="monotone" dataKey="salairesFuture" stackId="chargesFuture" stroke="#f97316" strokeWidth={2} strokeDasharray="5 4" fill="url(#gSal)" fillOpacity={0.5} dot={false} activeDot={{ r: 4, fill: "#f97316", strokeWidth: 0 }} connectNulls={false} />
                  <Area type="monotone" dataKey="depensesFuture" stackId="chargesFuture" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 4" fill="url(#gDep)" fillOpacity={0.5} dot={false} activeDot={{ r: 4, fill: "#ef4444", strokeWidth: 0 }} connectNulls={false} />
                  <Area type="monotone" dataKey="revenusFuture" stroke="#A6C9CE" strokeWidth={2} strokeDasharray="5 4" fill="url(#gRev)" fillOpacity={0.5} dot={false} activeDot={{ r: 4, fill: "#A6C9CE", strokeWidth: 0 }} connectNulls={false} />
                  {/* ── Net : ligne verte pleine (pas de futur) ── */}
                  <Line type="monotone" dataKey="net" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#22c55e", strokeWidth: 0 }} connectNulls={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Rows Revenus + Dépenses (ordre vertical : Revenus au-dessus) ── */}
          <div style={{ display: "flex", flexDirection: "column" }}>

          {/* ── Row Dépenses: mensuelles + par catégorie ── */}
          <div data-row="depenses" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16, order: 2 }}>
            <ChartCard
              title="Charges mensuelles"
              sub="Salaires + Dépenses · survolez un mois · cliquez pour figer"
              right={<Seg value={chargesMode} onChange={v => setChargesMode(v as any)} options={[["all", "Total"], ["depenses", "Dépenses"], ["salaires", "Salaires"]]} />}
              value={
                <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                  <span>{`${Math.round(depTotalAll + salaireMensuel * computeSalariedMonths("all")).toLocaleString("fr-FR")} MUR`}</span>
                  <span style={{ display: "inline-flex", gap: 10, fontSize: "var(--fs-2xs)", fontWeight: 500, fontFamily: "inherit" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#ef4444" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                      <span style={{ fontFamily: "monospace" }}>{Math.round(depTotalAll).toLocaleString("fr-FR")}</span>
                      <span style={{ color: "var(--text-muted)" }}>dép</span>
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#f97316" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f97316", display: "inline-block" }} />
                      <span style={{ fontFamily: "monospace" }}>{Math.round(salaireMensuel * computeSalariedMonths("all")).toLocaleString("fr-FR")}</span>
                      <span style={{ color: "var(--text-muted)" }}>sal</span>
                    </span>
                  </span>
                </span> as any
              }
              expandable
              renderExpanded={() => {
                const filterMois = pinnedDepMois || depFsFilterMois
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
                      onClick={(e) => {
                        const target = e.target as HTMLElement
                        if (target.closest('button') || target.closest('select') || target.closest('input')) return
                        const code = hoverDepRef.current
                        if (code) setPinnedDepMois(prev => prev === code ? null : code)
                      }}
                    >
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart
                          data={depParMois}
                          onMouseMove={(e: any) => {
                            const code = e?.activePayload?.[0]?.payload?.dossier
                            if (code) {
                              hoverDepRef.current = code
                              if (!pinnedDepMois && code !== hoverDepMois) setHoverDepMois(code)
                            }
                          }}
                          onMouseLeave={() => { if (!pinnedDepMois) { hoverDepRef.current = null; setHoverDepMois(null) } }}
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
                          {currentDepMois && <ReferenceLine x={fmtDossier(currentDepMois)} stroke={pinnedDepMois ? "var(--accent)" : "rgba(166,201,206,0.4)"} strokeWidth={pinnedDepMois ? 2 : 1} strokeDasharray={pinnedDepMois ? "0" : "3 3"} />}
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
                          {pinnedDepMois && (
                            <span style={{ fontSize: "var(--fs-2xs)", color: "var(--accent)", fontWeight: 600, background: "var(--accent-soft)", padding: "2px 8px", borderRadius: 4 }}>
                              📌 Figé : {fmtDossier(pinnedDepMois)}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontWeight: 500 }}>Filtrer par mois :</label>
                          <select
                            value={depFsFilterMois}
                            onChange={e => { setDepFsFilterMois(e.target.value); setPinnedDepMois(null) }}
                            style={{ padding: "4px 8px", fontSize: "var(--fs-2xs)", background: "rgba(166,201,206,0.06)", border: "1px solid rgba(166,201,206,0.12)", borderRadius: 4, color: "var(--text-primary)", fontFamily: "inherit", outline: "none" }}
                          >
                            <option value="">Tous les mois</option>
                            {allMonthCodes.map(c => <option key={c} value={c}>{fmtDossier(c)}</option>)}
                          </select>
                          {(depFsFilterMois || pinnedDepMois) && (
                            <button
                              onClick={() => { setDepFsFilterMois(""); setPinnedDepMois(null) }}
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
                style={{ position: "relative", cursor: "pointer" }}
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  if (target.closest('button')) return
                  const code = hoverDepRef.current
                  if (code) setPinnedDepMois(prev => prev === code ? null : code)
                }}
              >
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart
                    data={depParMois}
                    onMouseMove={(e: any) => {
                      const code = e?.activePayload?.[0]?.payload?.dossier
                      if (code) {
                        hoverDepRef.current = code
                        if (!pinnedDepMois && code !== hoverDepMois) setHoverDepMois(code)
                      }
                    }}
                    onMouseLeave={() => { if (!pinnedDepMois) { hoverDepRef.current = null; setHoverDepMois(null) } }}
                    onClick={(e: any) => {
                      const code = e?.activePayload?.[0]?.payload?.dossier || hoverDepRef.current
                      if (code) setPinnedDepMois(prev => prev === code ? null : code)
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <defs>
                      <linearGradient id="gSal2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f97316" stopOpacity={0.5} /><stop offset="100%" stopColor="#f97316" stopOpacity={0.05} /></linearGradient>
                      {allCats.map((cat, i) => {
                        const color = PIE_CAT[i % PIE_CAT.length]
                        return <linearGradient key={cat} id={`gCat${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.5} /><stop offset="100%" stopColor={color} stopOpacity={0.05} /></linearGradient>
                      })}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.08)" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                    <Tooltip content={<CTooltip formatter={fmt} />} />
                    {/* Salaires en base (hors mode depenses) */}
                    {chargesMode !== "depenses" && (
                      <Area type="monotone" dataKey="Salaires" stackId="1" stroke="#f97316" strokeWidth={0.5} fill="url(#gSal2)" />
                    )}
                    {/* Catégories de dépenses (hors mode salaires) */}
                    {chargesMode !== "salaires" && allCats.map((cat, i) => (
                      <Area key={cat} type="monotone" dataKey={cat} stackId="1" stroke={PIE_CAT[i % PIE_CAT.length]} strokeWidth={0.5} fill={`url(#gCat${i})`} />
                    ))}
                    {pinnedDepMois && <ReferenceLine x={fmtDossier(pinnedDepMois)} stroke="var(--accent)" strokeWidth={2} />}
                  </AreaChart>
                </ResponsiveContainer>
                {pinnedDepMois && (
                  <FrozenBadge label={fmtDossier(pinnedDepMois)} onClear={() => setPinnedDepMois(null)} />
                )}
              </div>
            </ChartCard>

            <ChartCard
              title="Dépenses par catégorie"
              expandable
              expandMode="tall"
              renderExpanded={() => (
                <BigPie
                  data={depParCat}
                  colors={depParCat.map((_, i) => PIE_CAT[i % PIE_CAT.length])}
                  total={depTotalAll}
                  totalLabel="Dépenses totales"
                  formatter={v => `${Math.round(v).toLocaleString("fr-FR")} MUR`}
                />
              )}
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
              sub="Survolez un mois · cliquez pour figer"
              value={`${Math.round(revTotalAll).toLocaleString("fr-FR")} MUR`}
              expandable
              right={<Seg value={revMode} onChange={v => setRevMode(v as any)} options={[["total", "Total"], ["types", "Par types"]]} />}
              renderExpanded={() => {
                const filterMois = pinnedRevMois || revFsFilterMois
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
                      onClick={(e) => {
                        const target = e.target as HTMLElement
                        if (target.closest('button') || target.closest('select') || target.closest('input')) return
                        const code = hoverRevRef.current
                        if (code) setPinnedRevMois(prev => prev === code ? null : code)
                      }}
                    >
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart
                          data={revMode === "types" ? revParMoisParType.data : revParMois}
                          onMouseMove={(e: any) => {
                            const code = e?.activePayload?.[0]?.payload?.mois
                            if (code) {
                              hoverRevRef.current = code
                              if (!pinnedRevMois && code !== hoverRevMois) setHoverRevMois(code)
                            }
                          }}
                          onMouseLeave={() => { if (!pinnedRevMois) { hoverRevRef.current = null; setHoverRevMois(null) } }}
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
                          <Tooltip content={<RevenueTooltip ventesListByMois={ventesListByMois} />} />
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
                          {currentRevMois && <ReferenceLine x={fmtDossier(currentRevMois)} stroke={pinnedRevMois ? "var(--accent)" : "rgba(166,201,206,0.4)"} strokeWidth={pinnedRevMois ? 2 : 1} strokeDasharray={pinnedRevMois ? "0" : "3 3"} />}
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
                          {pinnedRevMois && (
                            <span style={{ fontSize: "var(--fs-2xs)", color: "var(--accent)", fontWeight: 600, background: "var(--accent-soft)", padding: "2px 8px", borderRadius: 4 }}>
                              📌 Figé : {fmtDossier(pinnedRevMois)}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontWeight: 500 }}>Filtrer par mois :</label>
                          <select
                            value={revFsFilterMois}
                            onChange={e => { setRevFsFilterMois(e.target.value); setPinnedRevMois(null) }}
                            style={{ padding: "4px 8px", fontSize: "var(--fs-2xs)", background: "rgba(166,201,206,0.06)", border: "1px solid rgba(166,201,206,0.12)", borderRadius: 4, color: "var(--text-primary)", fontFamily: "inherit", outline: "none" }}
                          >
                            <option value="">Tous les mois</option>
                            {allVentesMonths.map(c => <option key={c} value={c}>{fmtDossier(c)}</option>)}
                          </select>
                          {(revFsFilterMois || pinnedRevMois) && (
                            <button
                              onClick={() => { setRevFsFilterMois(""); setPinnedRevMois(null) }}
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
                style={{ position: "relative", cursor: "pointer" }}
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  if (target.closest('button')) return
                  const code = hoverRevRef.current
                  if (code) setPinnedRevMois(prev => prev === code ? null : code)
                }}
              >
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart
                    data={revMode === "types" ? revParMoisParType.data : revParMois}
                    onMouseMove={(e: any) => {
                      const code = e?.activePayload?.[0]?.payload?.mois
                      if (code) {
                        hoverRevRef.current = code
                        if (!pinnedRevMois && code !== hoverRevMois) setHoverRevMois(code)
                      }
                    }}
                    onMouseLeave={() => { if (!pinnedRevMois) { hoverRevRef.current = null; setHoverRevMois(null) } }}
                    onClick={(e: any) => {
                      const code = e?.activePayload?.[0]?.payload?.mois || hoverRevRef.current
                      if (code) setPinnedRevMois(prev => prev === code ? null : code)
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <defs>
                      <linearGradient id="gRev2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A6C9CE" stopOpacity={0.4} /><stop offset="100%" stopColor="#A6C9CE" stopOpacity={0.02} /></linearGradient>
                      {revParMoisParType.types.map((t, i) => {
                        const color = PIE_TYPE[i % PIE_TYPE.length]
                        return <linearGradient key={t} id={`gRevType${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.5} /><stop offset="100%" stopColor={color} stopOpacity={0.05} /></linearGradient>
                      })}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.08)" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
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
                    {pinnedRevMois && <ReferenceLine x={fmtDossier(pinnedRevMois)} stroke="var(--accent)" strokeWidth={2} />}
                  </AreaChart>
                </ResponsiveContainer>
                {pinnedRevMois && (
                  <FrozenBadge label={fmtDossier(pinnedRevMois)} onClear={() => setPinnedRevMois(null)} />
                )}
              </div>
            </ChartCard>

            <ChartCard
              title="Revenus par type de projet"
              expandable
              expandMode="tall"
              renderExpanded={() => (
                <BigPie
                  data={projParTypeFiltered}
                  colors={projParTypeFiltered.map((_, i) => PIE_TYPE[i % PIE_TYPE.length])}
                  total={projParTypeFiltered.reduce((s, e) => s + e.amount, 0)}
                  totalLabel="Revenus totaux"
                  formatter={v => `${Math.round(v).toLocaleString("fr-FR")} MUR`}
                  double
                />
              )}
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
                    <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} width={130} axisLine={false} tickLine={false} />
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

            <ChartCard title="Rentabilité projets" sub="Montant vs marge — couleur = risque">
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.08)" />
                  <XAxis type="number" dataKey="x" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                  <YAxis type="number" dataKey="y" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                  <ZAxis range={[60, 200]} />
                  <Tooltip content={<CTooltip formatter={(v: any, name: any) => name === "x" ? Math.round(Number(v)).toLocaleString("fr-FR") : `${Number(v).toFixed(1)}%`} />} />
                  <Scatter data={rentaData} fill="#A6C9CE">{rentaData.map((e, i) => <Cell key={i} fill={RISK_COLORS[e.risk] || "#6b7280"} />)}</Scatter>
                </ScatterChart>
              </ResponsiveContainer>
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

          {/* ── Cash : CA, Eqxia, Commissions ── */}
          <div style={{ ...card, marginTop: 24, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid rgba(166,201,206,0.08)" }}>
              <div>
                <div style={{ fontSize: "var(--fs-md)", fontWeight: 600, color: "var(--text-primary)" }}>💵 Cash</div>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: 2 }}>Chiffre d'affaires total · tout pour Eqxia sauf commissions versées</div>
              </div>
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>{projects.filter(p => ["Won", "Active", "Completed", "Won orally"].includes(p.status)).length} projet(s) Won/Active</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
              <div style={{ padding: "20px 24px", borderRight: "1px solid rgba(166,201,206,0.08)" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>CA Total</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", fontFamily: "monospace" }}>{Math.round(cashData.caTotal).toLocaleString("fr-FR")}</span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>MUR</span>
                </div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>100 %</div>
              </div>
              <div style={{ padding: "20px 24px", borderRight: "1px solid rgba(166,201,206,0.08)" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>Pour Eqxia</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)", letterSpacing: "-0.02em", fontFamily: "monospace" }}>{Math.round(cashData.eqxiaTotal).toLocaleString("fr-FR")}</span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>MUR</span>
                </div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>{cashData.caTotal > 0 ? ((cashData.eqxiaTotal / cashData.caTotal) * 100).toFixed(1) : "0"} %</div>
              </div>
              <div style={{ padding: "20px 24px" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>Commissions versées</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: "#f97316", letterSpacing: "-0.02em", fontFamily: "monospace" }}>{Math.round(cashData.commissionsTotal).toLocaleString("fr-FR")}</span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>MUR</span>
                </div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>{cashData.caTotal > 0 ? ((cashData.commissionsTotal / cashData.caTotal) * 100).toFixed(1) : "0"} % · {cashData.beneficiaires.length} bénéficiaire(s)</div>
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
                      <tr key={b.name} style={{ borderBottom: i < cashData.beneficiaires.length - 1 ? "1px solid rgba(166,201,206,0.05)" : undefined }}>
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

            {/* KPIs Health */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
              <div style={{ padding: "18px 20px", borderRight: "1px solid rgba(166,201,206,0.08)" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>Santé moyenne</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 6 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: healthStats.avgHealth >= 80 ? "#22c55e" : healthStats.avgHealth >= 60 ? "#facc15" : "#ef4444", fontFamily: "monospace" }}>{healthStats.avgHealth}</span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>%</span>
                </div>
                <div style={{ height: 6, background: "rgba(166,201,206,0.1)", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${healthStats.avgHealth}%`, background: healthStats.avgHealth >= 80 ? "#22c55e" : healthStats.avgHealth >= 60 ? "#facc15" : "#ef4444", transition: "width 0.3s" }} />
                </div>
              </div>
              <div style={{ padding: "18px 20px", borderRight: "1px solid rgba(166,201,206,0.08)" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>✓ Complets (100%)</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#22c55e", fontFamily: "monospace", marginTop: 6 }}>{healthStats.healthy}</div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>
                  {healthStats.total > 0 ? Math.round((healthStats.healthy / healthStats.total) * 100) : 0} % des projets
                </div>
              </div>
              <div style={{ padding: "18px 20px", borderRight: "1px solid rgba(166,201,206,0.08)" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>⚠ Partiels (60-99%)</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#facc15", fontFamily: "monospace", marginTop: 6 }}>{healthStats.partial}</div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>
                  {healthStats.total > 0 ? Math.round((healthStats.partial / healthStats.total) * 100) : 0} % des projets
                </div>
              </div>
              <div style={{ padding: "18px 20px" }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>✕ Critiques (&lt; 60%)</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#ef4444", fontFamily: "monospace", marginTop: 6 }}>{healthStats.critical}</div>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4 }}>
                  {healthStats.total > 0 ? Math.round((healthStats.critical / healthStats.total) * 100) : 0} % des projets
                </div>
              </div>
            </div>

            {/* Top champs manquants */}
            {healthStats.topMissing.length > 0 && (
              <div style={{ padding: "12px 24px", borderTop: "1px solid rgba(166,201,206,0.08)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Top champs manquants :</div>
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
                  options={[["critical", "Critiques < 60%"], ["partial", "Partiels"], ["all", "Tous"]]}
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
                        <th style={{ ...thStyle, width: 80 }}>Santé</th>
                        <th style={thStyle}>Projet</th>
                        <th style={thStyle}>Client</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Champs manquants</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHealth.map(({ project: p, health, missing }, i) => {
                        const color = health >= 80 ? "#22c55e" : health >= 60 ? "#facc15" : "#ef4444"
                        return (
                          <tr
                            key={p.id || i}
                            onClick={() => setEditProject(p)}
                            style={{ borderBottom: "1px solid rgba(166,201,206,0.05)", cursor: "pointer", transition: "background 0.15s" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "rgba(166,201,206,0.06)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          >
                            <td style={tdStyle}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontFamily: "monospace", fontWeight: 700, color, minWidth: 36 }}>{health}%</span>
                                <div style={{ flex: 1, height: 4, background: "rgba(166,201,206,0.1)", borderRadius: 2, overflow: "hidden", minWidth: 24 }}>
                                  <div style={{ height: "100%", width: `${health}%`, background: color }} />
                                </div>
                              </div>
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
                  const icons: Record<string, string> = { auto: "\u{1F310}", dark: "\u{1F319}", light: "\u{2600}\u{FE0F}" }
                  const active = mode === m
                  return (
                    <button key={m} onClick={() => { setTheme(m); setThemeOpen(false) }} style={{ width: 36, height: 36, background: active ? "var(--accent-soft)" : "none", border: "none", borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-base)", transition: "background 0.2s", opacity: active ? 1 : 0.5 }}>
                      {icons[m]}
                    </button>
                  )
                })}
              </div>
            </>
          )}
          <button onClick={() => setThemeOpen(!themeOpen)} title="Thème" style={{ width: 36, height: 36, background: "var(--bg-panel)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid var(--border-panel)", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-base)", boxShadow: "var(--shadow-card)", transition: "opacity 0.2s" }}>
            {({ auto: "\u{1F310}", dark: "\u{1F319}", light: "\u{2600}\u{FE0F}" } as Record<string, string>)[mode]}
          </button>
        </div>
      </div>

      {/* ── Modals ── */}
      {editProject && (
        <ProjectModal
          project={editProject}
          clients={clients}
          employees={employees}
          onClose={() => setEditProject(null)}
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

function FrozenBadge({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div style={{
      position: "absolute", top: 8, right: 8, zIndex: 4,
      display: "flex", alignItems: "center", gap: 6,
      background: "var(--accent-soft)", border: "1px solid var(--accent)",
      color: "var(--accent)", padding: "4px 8px", borderRadius: 6,
      fontSize: "var(--fs-2xs)", fontWeight: 600,
    }}>
      <span>📌 {label}</span>
      <button onClick={onClear} title="Défiger (Échap)" style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1 }}>✕</button>
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

function BigPie({ data, colors, total, totalLabel, formatter, double }: {
  data: { name: string; value?: number; amount?: number; count?: number }[]
  colors: string[]
  total?: number
  totalLabel?: string
  formatter: (v: number) => string
  double?: boolean
}) {
  const getValue = (d: any) => d.value ?? d.amount ?? 0
  const sum = total ?? data.reduce((s, d) => s + getValue(d), 0)
  const totalCount = double ? data.reduce((s, d: any) => s + (d.count || 0), 0) : 0

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
            </div>
            {double && (
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 2 }}>
                {totalCount} projets
              </div>
            )}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: "var(--fs-sm)", fontWeight: 800, fontFamily: "monospace", color: "var(--accent)" }}>{formatter(sum)}</div>
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
  icon: string; iconBg: string; iconBorder: string; label: string; value: string; unit: string; sub?: string; valueColor?: string
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

function ProjectModal({ project, clients, employees, onClose, onSave, saving }: {
  project: Project | null; clients: Client[]; employees: Employee[]; onClose: () => void; onSave: (data: any) => void; saving: boolean
}) {
  const isNew = !project
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
    commissionPercent: project?.commissionPercent || 0,
    commissionTo: project?.commissionTo || "",
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
          <div style={{ fontSize: "var(--fs-lg)", fontWeight: 700, color: "var(--text-primary)" }}>
            {isNew ? "Nouvelle vente" : "Modifier la vente"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={fieldLabel}>Nom du projet</div>
            <input value={form.name} onChange={e => set("name", e.target.value)} style={fieldInput} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={fieldLabel}>Client</div>
            <select value={form.clientIds} onChange={e => set("clientIds", e.target.value)} style={fieldInput}>
              <option value="">— Aucun —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Status</div>
            <select value={form.status} onChange={e => set("status", e.target.value)} style={fieldInput}>
              {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Type</div>
            <select value={form.type} onChange={e => set("type", e.target.value)} style={fieldInput}>
              {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Méthodologie</div>
            <select value={form.methodology} onChange={e => set("methodology", e.target.value)} style={fieldInput}>
              <option value="">—</option>
              {METHODOLOGY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Devise</div>
            <select value={form.currency} onChange={e => set("currency", e.target.value)} style={fieldInput}>
              {CURRENCY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Montant devisé</div>
            <input type="number" value={form.quotedAmount} onChange={e => set("quotedAmount", e.target.value)} style={fieldInput} />
          </div>
          <div>
            <div style={fieldLabel}>Montant final</div>
            <input type="number" value={form.finalAmount} onChange={e => set("finalAmount", e.target.value)} style={fieldInput} />
          </div>
          <div>
            <div style={fieldLabel}>Win % (gut feeling)</div>
            <input type="number" value={form.winPercent} onChange={e => set("winPercent", e.target.value)} style={fieldInput} min={0} max={100} />
          </div>
          <div>
            <div style={fieldLabel}>Niveau de risque</div>
            <select value={form.riskLevel} onChange={e => set("riskLevel", e.target.value)} style={fieldInput}>
              <option value="">—</option>
              {RISK_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Satisfaction client</div>
            <select value={form.clientSatisfaction} onChange={e => set("clientSatisfaction", e.target.value)} style={fieldInput}>
              <option value="">—</option>
              {SATISFACTION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>Date de début</div>
            <input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} style={fieldInput} />
          </div>
          <div>
            <div style={fieldLabel}>Date de fin</div>
            <input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)} style={fieldInput} />
          </div>
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

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: readonly (readonly [string, string])[] }) {
  return (
    <div style={{ display: "flex", background: "rgba(166,201,206,0.06)", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(166,201,206,0.10)" }}>
      {options.map(([val, label]) => (
        <button key={val} onClick={() => onChange(val)} style={{ padding: "3px 10px", fontSize: "var(--fs-2xs)", fontWeight: value === val ? 600 : 400, color: value === val ? "var(--text-primary)" : "var(--text-muted)", background: value === val ? "rgba(166,201,206,0.15)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>{label}</button>
      ))}
    </div>
  )
}

function HeroTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  // Lecture depuis le datum (agrégé) pour éviter les doublons past/future
  const datum = payload[0]?.payload
  if (!datum) return null
  const dep = datum.depenses || 0
  const rev = datum.revenus || 0
  const sal = datum.salaires || 0
  const isFuture = !!datum.isFuture
  const net = isFuture ? null : (rev - dep - sal)
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "14px 18px", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", fontSize: "var(--fs-xs)", minWidth: 220 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "var(--text-secondary)", fontSize: "var(--fs-sm)" }}>{label}</div>
        {isFuture && <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontStyle: "italic" }}>projection</span>}
      </div>
      <TRow c="#A6C9CE" l="Revenus" v={Math.round(rev).toLocaleString("fr-FR")} vc="#A6C9CE" />
      <TRow c="#ef4444" l="Dépenses" v={Math.round(dep).toLocaleString("fr-FR")} vc="#ef4444" />
      <TRow c="#f97316" l="Salaires" v={Math.round(sal).toLocaleString("fr-FR")} vc="#f97316" />
      {net != null && (
        <div style={{ borderTop: "1px solid rgba(166,201,206,0.10)", paddingTop: 6, marginTop: 6 }}>
          <TRow c={net >= 0 ? "#22c55e" : "#ef4444"} l="Net" v={`${net >= 0 ? "+" : ""}${Math.round(net).toLocaleString("fr-FR")}`} vc={net >= 0 ? "#22c55e" : "#ef4444"} bold />
        </div>
      )}
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
  const ventes = allVentes.slice(0, 5)
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "14px 18px", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", fontSize: "var(--fs-xs)", minWidth: 240, maxWidth: 340 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "var(--text-secondary)", fontSize: "var(--fs-sm)" }}>{label}</div>
        {isFuture && <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", fontStyle: "italic" }}>projection</span>}
      </div>
      <TRow c="#A6C9CE" l="Revenus" v={`${Math.round(rev).toLocaleString("fr-FR")} MUR`} vc="#A6C9CE" />
      {ventes.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(166,201,206,0.10)", paddingTop: 8, marginTop: 8 }}>
          <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginBottom: 4, fontWeight: 600 }}>Ventes du mois :</div>
          {ventes.map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "2px 0", fontSize: "var(--fs-2xs)" }}>
              <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.clientName || p.name}</span>
              <span style={{ fontFamily: "monospace", fontWeight: 600, flexShrink: 0 }}>{Math.round(getRevenueRaw(p)).toLocaleString("fr-FR")} {p.currency}</span>
            </div>
          ))}
          {allVentes.length > 5 && <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>+ {allVentes.length - 5} autres — cliquez pour voir toutes</div>}
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
