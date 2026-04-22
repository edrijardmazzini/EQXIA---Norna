'use client'

import { useState, useEffect, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { AppHeader } from "@/components/layout/AppHeader"
import { Button } from "@/components/ui/Button"
import { Spinner } from "@/components/ui/Spinner"
import { ChartContainer, ChartTooltipContent, ChartLegendContent } from "@/components/ui/chart"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  PieChart, Pie, Cell, Legend,
  ScatterChart, Scatter, ZAxis,
} from "recharts"

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalesDeal {
  id: string
  name: string
  status: string
  type: string
  currency: string
  quotedAmount: number
  finalAmount: number
  winPercent: number
  winAuto: number
  riskLevel: string
  nextAction: string
  nextActionDate: string
  decisionDate: string
  lostReason: string
  budgetConfirmed: boolean
  internalChampion: string
  clientIds: string[]
  clientName: string
  ownerName: string
  ownerIds: string[]
  created: string
  netAmount: number
}

interface SalesClient {
  id: string
  name: string
  status: string
  satisfaction: string
  satisfactionScore: number
  upXsellPotential: string
  upXsellScore: number
  lifetimeValue: number
  lastTouchpointDate: string
  npsScore: number
  referralPotential: string
}

interface Employee { id: string; name: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const DEAL_TYPES = ["Workshop", "Audit", "Consulting", "Development", "Training", "Retainer", "Strategic Review", "Internal"]
const NEXT_ACTIONS = ["Send Proposal", "Follow Up", "Schedule Meeting", "Send Contract", "Awaiting Client", "Internal Review", "Close Deal"]
const CURRENCIES = ["MUR", "EUR", "USD", "GBP", "KES", "ZAR"]
const RISK_LEVELS = ["Low", "Medium", "High"]
const LOST_REASONS_OPTIONS = ["Price Too High", "Went with Competitor", "No Budget", "Timing Not Right", "No Decision Made", "Scope Mismatch", "Internal Restructuring", "Other"]
const ALL_STATUSES = ["Lead", "Qualified", "Scoping", "Proposal Sent", "Negotiation", "Verbal Commitment", "Won orally", "Won", "Active", "On Hold", "Completed", "Lost", "Cancelled", "Pending"]

const PIPELINE_COLS: { status: string; label: string; accent: string }[] = [
  { status: "Lead", label: "Lead", accent: "#6b7280" },
  { status: "Qualified", label: "Qualifié", accent: "#3b82f6" },
  { status: "Scoping", label: "Scoping", accent: "#8b5cf6" },
  { status: "Proposal Sent", label: "Proposition", accent: "#f97316" },
  { status: "Negotiation", label: "Négociation", accent: "#eab308" },
  { status: "Verbal Commitment", label: "Verbal", accent: "#06b6d4" },
  { status: "Won orally", label: "Won verbal", accent: "#4ade80" },
]

const CLOSED_WON = new Set(["Won", "Active"])
const CLOSED_LOST = new Set(["Lost", "Cancelled"])
const PIPELINE_STATUS_SET = new Set(PIPELINE_COLS.map(c => c.status).concat(["Identified", "Pending"]))

const TYPE_COLORS: Record<string, string> = {
  "Workshop": "#8b5cf6", "Audit": "#f97316", "Consulting": "#3b82f6",
  "Development": "#06b6d4", "Training": "#eab308", "Retainer": "#4ade80",
  "Strategic Review": "#ec4899", "Internal": "#6b7280",
}

const LOST_COLORS: Record<string, string> = {
  "Price Too High": "#ef4444", "Went with Competitor": "#f97316", "No Budget": "#eab308",
  "Timing Not Right": "#3b82f6", "No Decision Made": "#8b5cf6", "Scope Mismatch": "#ec4899",
  "Internal Restructuring": "#06b6d4", "Other": "#6b7280",
}

const MONTH_NAMES = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]
const CURRENCY_SYMBOLS: Record<string, string> = { MUR: "Rs ", EUR: "€", USD: "$", GBP: "£", KES: "KES ", ZAR: "R " }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(amount: number, currency = "MUR"): string {
  const sym = CURRENCY_SYMBOLS[currency] || `${currency} `
  if (amount >= 1_000_000) return `${sym}${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `${sym}${(amount / 1_000).toFixed(0)}k`
  return `${sym}${Math.round(amount).toLocaleString()}`
}

function fmtDate(d: string): string {
  if (!d) return "—"
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y.slice(2)}`
}

function winFactor(deal: SalesDeal): number {
  const auto = deal.winAuto > 1 ? deal.winAuto / 100 : deal.winAuto
  if (auto > 0) return Math.min(1, Math.max(0, auto))
  const gut = deal.winPercent > 1 ? deal.winPercent / 100 : deal.winPercent
  return Math.min(1, Math.max(0, gut))
}

function dealActionStatus(deal: SalesDeal): "late" | "warn" | "ok" | "none" {
  if (!deal.nextActionDate) return "none"
  const today = new Date()
  const due = new Date(deal.nextActionDate)
  const diff = (due.getTime() - today.getTime()) / 86400000
  if (diff < 0) return "late"
  if (diff <= 3) return "warn"
  return "ok"
}

function dealBorderColor(deal: SalesDeal): string {
  const s = dealActionStatus(deal)
  if (s === "late") return "#ef4444"
  if (s === "warn") return "#f97316"
  if (s === "ok") return "transparent"
  return "transparent"
}

// ─── Agent mock data ──────────────────────────────────────────────────────────

const AGENT_MOCK = {
  name: { value: "Projet RH DTOS", source: "Sujet email", confidence: "high" as const },
  clientName: { value: "DTOS", source: "Domaine: dtos.mu", confidence: "high" as const },
  type: { value: "Consulting", source: "Analyse body email", confidence: "medium" as const },
  quotedAmount: { value: "", source: "", confidence: "low" as const },
  currency: { value: "MUR", source: "Géographie: Maurice", confidence: "medium" as const },
  nextAction: { value: "Schedule Meeting", source: "Intent détecté", confidence: "high" as const },
  nextActionDate: { value: "", source: "", confidence: "low" as const },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SalesDashboardPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [projects, setProjects] = useState<SalesDeal[]>([])
  const [clients, setClients] = useState<SalesClient[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [tab, setTab] = useState<"pipeline" | "forecast" | "analyse" | "table">("pipeline")
  const [ownerFilter, setOwnerFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [sortCol, setSortCol] = useState<keyof SalesDeal>("created")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const [showQuickEntry, setShowQuickEntry] = useState(false)
  const [showAgentReview, setShowAgentReview] = useState(false)
  const [selectedDeal, setSelectedDeal] = useState<SalesDeal | null>(null)
  const [lostPrompt, setLostPrompt] = useState<{ dealId: string; targetStatus: string } | null>(null)

  const [form, setForm] = useState({
    name: "", clientId: "", type: "", quotedAmount: "", currency: "MUR",
    ownerId: "", nextAction: "", nextActionDate: "", winPercent: 20,
  })
  const [saving, setSaving] = useState(false)

  const [editState, setEditState] = useState<Partial<SalesDeal>>({})
  const [editSaving, setEditSaving] = useState(false)

  // Agent form
  const [agentFields, setAgentFields] = useState<Record<string, string>>({})
  const [agentSaving, setAgentSaving] = useState(false)

  useEffect(() => {
    if (session?.user?.email && !session.user.email.endsWith("@eqxia.com")) {
      router.push("/login")
    }
  }, [session, router])

  useEffect(() => {
    fetch("/api/sales")
      .then(r => r.json())
      .then(d => {
        setProjects(d.projects || [])
        setClients(d.clients || [])
        setEmployees(d.employees || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // ─── Derived data ──────────────────────────────────────────────────────────

  const pipelineDeals = useMemo(() =>
    projects.filter(p =>
      !CLOSED_WON.has(p.status) && !CLOSED_LOST.has(p.status) &&
      p.status !== "Completed" && p.status !== "On Hold"
    ),
    [projects],
  )

  const filteredPipeline = useMemo(() =>
    ownerFilter ? pipelineDeals.filter(d => d.ownerName === ownerFilter) : pipelineDeals,
    [pipelineDeals, ownerFilter],
  )

  const ownerOptions = useMemo(() => {
    const s = new Set(projects.map(p => p.ownerName).filter(Boolean))
    return Array.from(s).sort()
  }, [projects])

  const kpiWeightedPipeline = useMemo(() =>
    pipelineDeals.reduce((s, p) => s + p.quotedAmount * winFactor(p), 0),
    [pipelineDeals],
  )

  const kpiWonYTD = useMemo(() => {
    const year = new Date().getFullYear().toString()
    return projects
      .filter(p => CLOSED_WON.has(p.status) && (p.decisionDate || p.created).startsWith(year))
      .reduce((s, p) => s + (p.finalAmount || p.quotedAmount), 0)
  }, [projects])

  const kpiWinRate = useMemo(() => {
    const won = projects.filter(p => CLOSED_WON.has(p.status)).length
    const lost = projects.filter(p => CLOSED_LOST.has(p.status)).length
    return won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0
  }, [projects])

  const forecastData = useMemo(() => {
    const today = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const label = `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
      const wonDeals = projects.filter(p =>
        CLOSED_WON.has(p.status) && (p.decisionDate || p.created).startsWith(key),
      )
      const pipeDeals = projects.filter(p =>
        PIPELINE_STATUS_SET.has(p.status) && p.decisionDate?.startsWith(key),
      )
      return {
        month: label,
        wonRevenue: wonDeals.reduce((s, p) => s + (p.finalAmount || p.quotedAmount), 0),
        weighted: pipeDeals.reduce((s, p) => s + p.quotedAmount * winFactor(p), 0),
      }
    })
  }, [projects])

  const lostData = useMemo(() => {
    const grouped: Record<string, number> = {}
    for (const p of projects) {
      if (CLOSED_LOST.has(p.status) && p.lostReason) {
        grouped[p.lostReason] = (grouped[p.lostReason] || 0) + 1
      }
    }
    return Object.entries(grouped).map(([reason, count]) => ({ reason, count }))
  }, [projects])

  const lostDealsDetail = useMemo(() =>
    projects.filter(p => CLOSED_LOST.has(p.status)).sort((a, b) => b.created.localeCompare(a.created)),
    [projects],
  )

  const scatterRed = useMemo(() => clients.filter(c => {
    if (!c.satisfactionScore || !c.upXsellScore) return false
    const days = c.lastTouchpointDate ? Math.floor((Date.now() - new Date(c.lastTouchpointDate).getTime()) / 86400000) : 999
    return days > 30
  }).map(c => ({ x: c.satisfactionScore, y: c.upXsellScore, z: Math.max(Math.sqrt(Math.max(c.lifetimeValue, 0)) / 40 + 8, 8), name: c.name, ltv: c.lifetimeValue, lastTouchpoint: c.lastTouchpointDate })), [clients])

  const scatterOrange = useMemo(() => clients.filter(c => {
    if (!c.satisfactionScore || !c.upXsellScore) return false
    const days = c.lastTouchpointDate ? Math.floor((Date.now() - new Date(c.lastTouchpointDate).getTime()) / 86400000) : 999
    return days > 15 && days <= 30
  }).map(c => ({ x: c.satisfactionScore, y: c.upXsellScore, z: Math.max(Math.sqrt(Math.max(c.lifetimeValue, 0)) / 40 + 8, 8), name: c.name, ltv: c.lifetimeValue, lastTouchpoint: c.lastTouchpointDate })), [clients])

  const scatterGreen = useMemo(() => clients.filter(c => {
    if (!c.satisfactionScore || !c.upXsellScore) return false
    const days = c.lastTouchpointDate ? Math.floor((Date.now() - new Date(c.lastTouchpointDate).getTime()) / 86400000) : 999
    return days <= 15
  }).map(c => ({ x: c.satisfactionScore, y: c.upXsellScore, z: Math.max(Math.sqrt(Math.max(c.lifetimeValue, 0)) / 40 + 8, 8), name: c.name, ltv: c.lifetimeValue, lastTouchpoint: c.lastTouchpointDate })), [clients])

  const tableDeals = useMemo(() => {
    let filtered = projects
    if (ownerFilter) filtered = filtered.filter(d => d.ownerName === ownerFilter)
    if (statusFilter) filtered = filtered.filter(d => d.status === statusFilter)
    if (typeFilter) filtered = filtered.filter(d => d.type === typeFilter)
    return filtered.slice().sort((a, b) => {
      const av = String(a[sortCol] ?? "")
      const bv = String(b[sortCol] ?? "")
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [projects, ownerFilter, statusFilter, typeFilter, sortCol, sortDir])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function toggleSort(col: keyof SalesDeal) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortCol(col); setSortDir("desc") }
  }

  async function moveDeal(dealId: string, newStatus: string) {
    const deal = projects.find(p => p.id === dealId)
    if (!deal) return
    if (CLOSED_LOST.has(newStatus) && !deal.lostReason) {
      setLostPrompt({ dealId, targetStatus: newStatus })
      return
    }
    setProjects(ps => ps.map(p => p.id === dealId ? { ...p, status: newStatus } : p))
    await fetch(`/api/sales/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
  }

  async function confirmLostReason(reason: string) {
    if (!lostPrompt) return
    const { dealId, targetStatus } = lostPrompt
    setLostPrompt(null)
    setProjects(ps => ps.map(p => p.id === dealId ? { ...p, status: targetStatus, lostReason: reason } : p))
    await fetch(`/api/sales/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: targetStatus, lostReason: reason }),
    })
  }

  async function createDeal() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          clientIds: form.clientId ? [form.clientId] : [],
          type: form.type,
          quotedAmount: Number(form.quotedAmount) || 0,
          currency: form.currency,
          ownerIds: form.ownerId ? [form.ownerId] : [],
          nextAction: form.nextAction,
          nextActionDate: form.nextActionDate,
          winPercent: form.winPercent,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { id } = await res.json()
      const newDeal: SalesDeal = {
        id, name: form.name, status: "Lead", type: form.type, currency: form.currency,
        quotedAmount: Number(form.quotedAmount) || 0, finalAmount: 0,
        winPercent: form.winPercent, winAuto: 0, riskLevel: "",
        nextAction: form.nextAction, nextActionDate: form.nextActionDate,
        decisionDate: "", lostReason: "", budgetConfirmed: false, internalChampion: "",
        clientIds: form.clientId ? [form.clientId] : [],
        clientName: clients.find(c => c.id === form.clientId)?.name || "N/A",
        ownerName: employees.find(e => e.id === form.ownerId)?.name || "",
        ownerIds: form.ownerId ? [form.ownerId] : [],
        created: new Date().toISOString(), netAmount: 0,
      }
      setProjects(ps => [newDeal, ...ps])
      setShowQuickEntry(false)
      setForm({ name: "", clientId: "", type: "", quotedAmount: "", currency: "MUR", ownerId: "", nextAction: "", nextActionDate: "", winPercent: 20 })
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveDealEdit() {
    if (!selectedDeal) return
    setEditSaving(true)
    try {
      await fetch(`/api/sales/${selectedDeal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editState),
      })
      setProjects(ps => ps.map(p => p.id === selectedDeal.id ? { ...p, ...editState } : p))
      setSelectedDeal(null)
      setEditState({})
    } catch (e: any) {
      alert(e.message)
    } finally {
      setEditSaving(false)
    }
  }

  async function createAgentDeal() {
    setAgentSaving(true)
    try {
      const clientMatch = clients.find(c => c.name.toLowerCase().includes((agentFields.clientName || AGENT_MOCK.clientName.value).toLowerCase()))
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agentFields.name || AGENT_MOCK.name.value,
          clientIds: clientMatch ? [clientMatch.id] : [],
          type: agentFields.type || AGENT_MOCK.type.value,
          quotedAmount: Number(agentFields.quotedAmount) || 0,
          currency: agentFields.currency || AGENT_MOCK.currency.value,
          nextAction: agentFields.nextAction || AGENT_MOCK.nextAction.value,
          nextActionDate: agentFields.nextActionDate || "",
          winPercent: 20,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { id } = await res.json()
      const newDeal: SalesDeal = {
        id, name: agentFields.name || AGENT_MOCK.name.value, status: "Lead",
        type: agentFields.type || AGENT_MOCK.type.value,
        currency: agentFields.currency || AGENT_MOCK.currency.value,
        quotedAmount: Number(agentFields.quotedAmount) || 0, finalAmount: 0,
        winPercent: 20, winAuto: 0, riskLevel: "",
        nextAction: agentFields.nextAction || AGENT_MOCK.nextAction.value,
        nextActionDate: agentFields.nextActionDate || "",
        decisionDate: "", lostReason: "", budgetConfirmed: false, internalChampion: "",
        clientIds: clientMatch ? [clientMatch.id] : [],
        clientName: clientMatch?.name || agentFields.clientName || AGENT_MOCK.clientName.value,
        ownerName: "", ownerIds: [], created: new Date().toISOString(), netAmount: 0,
      }
      setProjects(ps => [newDeal, ...ps])
      setShowAgentReview(false)
      setAgentFields({})
    } catch (e: any) {
      alert(e.message)
    } finally {
      setAgentSaving(false)
    }
  }

  // ─── Shared styles ─────────────────────────────────────────────────────────

  const card = {
    background: "var(--bg-card)", border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-card)", padding: 20,
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-input)", border: "1px solid var(--border-input)",
    borderRadius: "var(--radius-input)", padding: "7px 10px",
    fontSize: "var(--fs-sm)", color: "var(--text-primary)", width: "100%",
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "var(--fs-xs)", color: "var(--text-muted)",
    display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em",
  }

  // ─── Loading / Error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-page)", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, color: "var(--text-secondary)", fontSize: "var(--fs-base)" }}>
        <Spinner />
        Chargement du pipeline…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-page)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <div style={{ color: "var(--color-error)" }}>Erreur : {error}</div>
        <Button onClick={() => location.reload()}>Réessayer</Button>
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)", color: "var(--text-primary)" }}>
      <AppHeader
        appName="Sales"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <a
              href="/"
              style={{ fontSize: "var(--fs-sm)", color: "var(--text-secondary)", textDecoration: "none", padding: "4px 10px", borderRadius: "var(--radius-btn)", border: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}
            >
              ← Finance
            </a>
            <Button variant="ghost" size="sm" onClick={() => setShowAgentReview(true)}>🤖 Agent</Button>
            <Button variant="primary" size="sm" onClick={() => setShowQuickEntry(true)}>+ Nouveau deal</Button>
          </div>
        }
      />

      {/* Tab bar */}
      <div style={{ padding: "0 24px", background: "var(--bg-card)", borderBottom: "1px solid var(--border-subtle)", display: "flex", gap: 0 }}>
        {(["pipeline", "forecast", "analyse", "table"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "12px 20px", fontSize: "var(--fs-sm)", background: "none", border: "none", cursor: "pointer",
              fontWeight: tab === t ? 600 : 400, color: tab === t ? "var(--accent)" : "var(--text-secondary)",
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "color 0.15s", fontFamily: "inherit",
            }}
          >
            {{ pipeline: "Pipeline", forecast: "Prévisionnel", analyse: "Analyse", table: "Table" }[t]}
          </button>
        ))}

        {/* Owner filter — shared across tabs */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, paddingRight: 4 }}>
          <select
            value={ownerFilter}
            onChange={e => setOwnerFilter(e.target.value)}
            style={{ ...inputStyle, width: "auto", padding: "4px 8px", fontSize: "var(--fs-xs)" }}
          >
            <option value="">Tous les owners</option>
            {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <div style={{ padding: 24 }}>

        {/* ── Pipeline Kanban ──────────────────────────────────────────────── */}
        {tab === "pipeline" && (
          <div>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginBottom: 16 }}>
              {filteredPipeline.length} deal{filteredPipeline.length !== 1 ? "s" : ""} actifs
            </div>
            <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
              {PIPELINE_COLS.map(col => {
                const colDeals = filteredPipeline.filter(d =>
                  d.status === col.status || (col.status === "Lead" && !PIPELINE_COLS.find(c => c.status === d.status)),
                )
                return (
                  <div
                    key={col.status}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault()
                      const dealId = e.dataTransfer.getData("dealId")
                      if (dealId) moveDeal(dealId, col.status)
                    }}
                    style={{
                      minWidth: 220, width: 220, flexShrink: 0,
                      background: "var(--bg-card)", borderRadius: "var(--radius-card)",
                      border: "1px solid var(--border-subtle)", overflow: "hidden",
                    }}
                  >
                    {/* Column header */}
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.accent, display: "inline-block", flexShrink: 0 }} />
                        <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {col.label}
                        </span>
                      </div>
                      <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", background: "var(--accent-soft)", borderRadius: 10, padding: "1px 7px" }}>
                        {colDeals.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div style={{ padding: "8px 8px", display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
                      {colDeals.map(deal => {
                        const borderColor = dealBorderColor(deal)
                        const actionStatus = dealActionStatus(deal)
                        return (
                          <div
                            key={deal.id}
                            draggable
                            onDragStart={e => e.dataTransfer.setData("dealId", deal.id)}
                            onClick={() => { setSelectedDeal(deal); setEditState({}) }}
                            style={{
                              background: "var(--bg-page)", borderRadius: 10, padding: "10px 12px", cursor: "pointer",
                              border: "1px solid var(--border-subtle)",
                              borderLeft: `3px solid ${borderColor || "var(--border-accent)"}`,
                              transition: "background 0.15s",
                            }}
                          >
                            <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, lineHeight: 1.3 }}>
                              {deal.name}
                            </div>
                            <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginBottom: 6 }}>
                              {deal.clientName}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                              {deal.type && (
                                <span style={{ fontSize: "var(--fs-2xs)", padding: "1px 6px", borderRadius: 6, background: `${TYPE_COLORS[deal.type] || "#6b7280"}22`, color: TYPE_COLORS[deal.type] || "#6b7280", fontWeight: 600 }}>
                                  {deal.type}
                                </span>
                              )}
                              <span style={{ fontSize: "var(--fs-xs)", color: "var(--accent)", fontWeight: 600, marginLeft: "auto" }}>
                                {fmtCurrency(deal.quotedAmount, deal.currency)}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                              <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>
                                Win {Math.round(winFactor(deal) * 100)}%
                              </span>
                              {deal.nextActionDate && (
                                <span style={{
                                  fontSize: "var(--fs-2xs)", fontWeight: 500,
                                  color: actionStatus === "late" ? "var(--color-error)" : actionStatus === "warn" ? "#f97316" : "var(--text-muted)",
                                }}>
                                  {actionStatus === "late" ? "⚠ " : ""}{fmtDate(deal.nextActionDate)}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      <button
                        onClick={() => setShowQuickEntry(true)}
                        style={{ padding: "6px", fontSize: "var(--fs-xs)", color: "var(--text-muted)", background: "none", border: "1px dashed var(--border-subtle)", borderRadius: 8, cursor: "pointer", textAlign: "center" }}
                      >
                        + Ajouter
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Forecast ─────────────────────────────────────────────────────── */}
        {tab === "forecast" && (
          <div>
            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
              {[
                { label: "Pipeline pondéré", value: fmtCurrency(kpiWeightedPipeline), sub: `${pipelineDeals.length} deals actifs` },
                { label: "Revenue réalisé YTD", value: fmtCurrency(kpiWonYTD), sub: "Deals Won / Active" },
                { label: "Win rate global", value: `${kpiWinRate}%`, sub: "Won / (Won + Lost)" },
              ].map(kpi => (
                <div key={kpi.label} style={{ ...card }}>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{kpi.label}</div>
                  <div style={{ fontSize: "var(--fs-2xl)", fontWeight: 700, color: "var(--accent)", lineHeight: 1 }}>{kpi.value}</div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: 4 }}>{kpi.sub}</div>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div style={{ ...card }}>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, marginBottom: 4 }}>Prévisionnel 6 mois glissants</div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginBottom: 16 }}>Montants bruts sans conversion — basé sur Decision Date</div>
              <ChartContainer>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={forecastData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="month" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                    <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} tickFormatter={v => fmtCurrency(v)} />
                    <Tooltip
                      content={<ChartTooltipContent formatter={(v: number) => fmtCurrency(v)} />}
                    />
                    <Legend content={<ChartLegendContent />} />
                    <ReferenceLine y={500000} stroke="var(--color-error)" strokeDasharray="6 3" label={{ value: "Objectif", fill: "var(--color-error)", fontSize: 11 }} />
                    <Bar dataKey="wonRevenue" name="Revenue confirmé" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="weighted" name="Pipeline pondéré" fill="var(--accent)" fillOpacity={0.6} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </div>
        )}

        {/* ── Analyse ──────────────────────────────────────────────────────── */}
        {tab === "analyse" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

            {/* Lost Deals */}
            <div style={{ ...card }}>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, marginBottom: 16 }}>Deals perdus — par raison</div>
              {lostData.length === 0 ? (
                <div style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)", textAlign: "center", padding: 40 }}>Aucun deal perdu enregistré</div>
              ) : (
                <ChartContainer>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={lostData} dataKey="count" nameKey="reason" cx="50%" cy="50%" outerRadius={100} label={({ percent }) => `${Math.round(((percent as number) || 0) * 100)}%`} labelLine={false}>
                        {lostData.map((entry, i) => (
                          <Cell key={i} fill={LOST_COLORS[entry.reason] || "#6b7280"} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend content={<ChartLegendContent />} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
              {lostDealsDetail.length > 0 && (
                <div style={{ marginTop: 16, borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Détail</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                    {lostDealsDetail.map(d => (
                      <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "var(--fs-xs)" }}>
                        <span style={{ color: "var(--text-secondary)" }}>{d.name}</span>
                        <span style={{ color: LOST_COLORS[d.lostReason] || "var(--text-muted)" }}>{d.lostReason || "—"}</span>
                        <span style={{ color: "var(--text-muted)" }}>{fmtCurrency(d.quotedAmount, d.currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Client Health Map */}
            <div style={{ ...card }}>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, marginBottom: 4 }}>Client Health Map</div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginBottom: 16 }}>
                X = Satisfaction · Y = Up/X-sell · Taille = LTV · Couleur = dernier contact
              </div>
              {(scatterRed.length + scatterOrange.length + scatterGreen.length) === 0 ? (
                <div style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)", textAlign: "center", padding: 40 }}>
                  Renseignez Satisfaction et Up/X-sell Potential dans les clients Notion
                </div>
              ) : (
                <ChartContainer>
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart margin={{ top: 4, right: 16, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis type="number" dataKey="x" domain={[0.5, 4.5]} ticks={[1, 2, 3, 4]} stroke="var(--text-muted)" tick={{ fontSize: 10 }} label={{ value: "Satisfaction", position: "bottom", fill: "var(--text-muted)", fontSize: 10 }} />
                      <YAxis type="number" dataKey="y" domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]} stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                      <ZAxis type="number" dataKey="z" range={[30, 300]} />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0]?.payload
                          return (
                            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-btn)", padding: "8px 12px", fontSize: "var(--fs-xs)" }}>
                              <div style={{ fontWeight: 600, marginBottom: 4 }}>{d?.name}</div>
                              <div style={{ color: "var(--text-muted)" }}>LTV: {fmtCurrency(d?.ltv || 0)}</div>
                              <div style={{ color: "var(--text-muted)" }}>Dernier contact: {fmtDate(d?.lastTouchpoint || "")}</div>
                            </div>
                          )
                        }}
                      />
                      <Legend content={() => (
                        <div style={{ display: "flex", gap: 16, justifyContent: "center", paddingTop: 8 }}>
                          {[["#ef4444", "> 30j"], ["#f97316", "15-30j"], ["#4ade80", "< 15j"]].map(([c, l]) => (
                            <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                              {l}
                            </div>
                          ))}
                        </div>
                      )} />
                      <Scatter data={scatterRed} fill="#ef4444" fillOpacity={0.7} name="> 30j" />
                      <Scatter data={scatterOrange} fill="#f97316" fillOpacity={0.7} name="15-30j" />
                      <Scatter data={scatterGreen} fill="#4ade80" fillOpacity={0.7} name="< 15j" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </div>
          </div>
        )}

        {/* ── Table ────────────────────────────────────────────────────────── */}
        {tab === "table" && (
          <div>
            {/* Filters */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                <option value="">Tous les statuts</option>
                {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                <option value="">Tous les types</option>
                {DEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <span style={{ marginLeft: "auto", fontSize: "var(--fs-xs)", color: "var(--text-muted)", alignSelf: "center" }}>
                {tableDeals.length} résultat{tableDeals.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Table */}
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-page)" }}>
                      {([
                        ["name", "Deal"], ["clientName", "Client"], ["type", "Type"],
                        ["quotedAmount", "Montant"], ["winPercent", "Win %"], ["status", "Statut"],
                        ["decisionDate", "Décision"], ["nextAction", "Prochaine action"], ["nextActionDate", "Due le"], ["ownerName", "Owner"],
                      ] as [keyof SalesDeal, string][]).map(([col, label]) => (
                        <th
                          key={col}
                          onClick={() => toggleSort(col)}
                          style={{ padding: "10px 12px", textAlign: "left", cursor: "pointer", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", userSelect: "none", whiteSpace: "nowrap" }}
                        >
                          {label} {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableDeals.map(deal => {
                      const late = deal.nextActionDate && new Date(deal.nextActionDate) < new Date()
                      return (
                        <tr
                          key={deal.id}
                          onClick={() => { setSelectedDeal(deal); setEditState({}) }}
                          style={{
                            borderBottom: "1px solid var(--border-subtle)", cursor: "pointer",
                            background: late ? "rgba(239,68,68,0.04)" : "transparent",
                          }}
                        >
                          <td style={{ padding: "9px 12px", color: "var(--text-primary)", fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deal.name}</td>
                          <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>{deal.clientName}</td>
                          <td style={{ padding: "9px 12px" }}>
                            {deal.type && <span style={{ padding: "1px 6px", borderRadius: 6, background: `${TYPE_COLORS[deal.type] || "#6b7280"}22`, color: TYPE_COLORS[deal.type] || "#6b7280", fontWeight: 600, fontSize: "var(--fs-2xs)" }}>{deal.type}</span>}
                          </td>
                          <td style={{ padding: "9px 12px", color: "var(--accent)", fontWeight: 600 }}>{fmtCurrency(deal.quotedAmount, deal.currency)}</td>
                          <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>{Math.round(winFactor(deal) * 100)}%</td>
                          <td style={{ padding: "9px 12px" }}>
                            <span style={{ padding: "2px 7px", borderRadius: 6, fontSize: "var(--fs-2xs)", background: CLOSED_WON.has(deal.status) ? "rgba(74,222,128,0.15)" : CLOSED_LOST.has(deal.status) ? "rgba(248,113,113,0.15)" : "var(--accent-soft)", color: CLOSED_WON.has(deal.status) ? "var(--color-success)" : CLOSED_LOST.has(deal.status) ? "var(--color-error)" : "var(--accent)" }}>
                              {deal.status}
                            </span>
                          </td>
                          <td style={{ padding: "9px 12px", color: "var(--text-muted)" }}>{fmtDate(deal.decisionDate)}</td>
                          <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>{deal.nextAction || "—"}</td>
                          <td style={{ padding: "9px 12px", color: late ? "var(--color-error)" : "var(--text-muted)", fontWeight: late ? 600 : 400 }}>{fmtDate(deal.nextActionDate)}</td>
                          <td style={{ padding: "9px 12px", color: "var(--text-muted)" }}>{deal.ownerName || "—"}</td>
                        </tr>
                      )
                    })}
                    {tableDeals.length === 0 && (
                      <tr><td colSpan={10} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>Aucun deal trouvé</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal backdrop ─────────────────────────────────────────────────── */}
      {(showQuickEntry || showAgentReview || selectedDeal || lostPrompt) && (
        <div
          onClick={() => { setShowQuickEntry(false); setShowAgentReview(false); setSelectedDeal(null); setLostPrompt(null) }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40, backdropFilter: "blur(4px)" }}
        />
      )}

      {/* ── Quick Deal Entry modal ──────────────────────────────────────────── */}
      {showQuickEntry && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 50, width: 480, background: "var(--bg-card)", border: "1px solid var(--border-accent)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-modal)", padding: 28 }}
        >
          <div style={{ fontSize: "var(--fs-lg)", fontWeight: 700, marginBottom: 4 }}>Nouveau deal</div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginBottom: 20 }}>Champs essentiels — 2 min max</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Nom du deal *</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Projet RH BDO" />
            </div>
            <div>
              <label style={labelStyle}>Client</label>
              <select style={inputStyle} value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select style={inputStyle} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {DEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Montant estimé</label>
              <input style={inputStyle} type="number" value={form.quotedAmount} onChange={e => setForm(f => ({ ...f, quotedAmount: e.target.value }))} placeholder="0" min={0} />
            </div>
            <div>
              <label style={labelStyle}>Devise</label>
              <select style={inputStyle} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Owner</label>
              <select style={inputStyle} value={form.ownerId} onChange={e => setForm(f => ({ ...f, ownerId: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Prochaine action</label>
              <select style={inputStyle} value={form.nextAction} onChange={e => setForm(f => ({ ...f, nextAction: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {NEXT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Date prochaine action</label>
              <input style={inputStyle} type="date" value={form.nextActionDate} onChange={e => setForm(f => ({ ...f, nextActionDate: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Win % — estimation ({form.winPercent}%)</label>
              <input type="range" min={0} max={100} step={5} value={form.winPercent} onChange={e => setForm(f => ({ ...f, winPercent: Number(e.target.value) }))} style={{ width: "100%", accentColor: "var(--accent)" }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowQuickEntry(false)}>Annuler</Button>
            <Button variant="primary" loading={saving} onClick={createDeal} disabled={!form.name.trim()}>Créer le deal</Button>
          </div>
        </div>
      )}

      {/* ── Agent Deal Review modal ─────────────────────────────────────────── */}
      {showAgentReview && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 50, width: 520, background: "var(--bg-card)", border: "1px solid var(--border-accent)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-modal)", padding: 28 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <div style={{ fontSize: "var(--fs-lg)", fontWeight: 700 }}>Deal détecté par l&apos;agent</div>
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginBottom: 20 }}>
            Vérifiez les champs pré-remplis — modifiez si besoin — puis validez.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {(Object.entries(AGENT_MOCK) as [string, { value: string; source: string; confidence: "high" | "medium" | "low" }][]).map(([key, field]) => {
              const isEditing = field.confidence !== "high"
              const currentVal = agentFields[key] ?? field.value
              const confColor = field.confidence === "high" ? "var(--color-success)" : field.confidence === "medium" ? "#f97316" : "var(--color-error)"
              return (
                <div key={key} style={{ gridColumn: key === "name" ? "1 / -1" : "auto" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>
                      {({ name: "Nom", clientName: "Client", type: "Type", quotedAmount: "Montant", currency: "Devise", nextAction: "Prochaine action", nextActionDate: "Date action" } as Record<string, string>)[key] || key}
                    </label>
                    <span style={{ fontSize: "var(--fs-2xs)", color: confColor, fontWeight: 600 }}>
                      {field.confidence === "high" ? "✓ Haut" : field.confidence === "medium" ? "~ Moyen" : "? Manquant"}
                    </span>
                  </div>
                  <input
                    style={{ ...inputStyle, borderColor: field.confidence === "medium" ? "#f97316" : field.confidence === "low" ? "var(--color-error)" : "var(--border-input)", opacity: isEditing ? 1 : 0.85 }}
                    value={currentVal}
                    readOnly={!isEditing && field.confidence === "high"}
                    onChange={e => setAgentFields(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={field.confidence === "low" ? "Requis" : field.value}
                  />
                  {field.source && (
                    <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 2 }}>
                      Source : {field.source}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => { setShowAgentReview(false); setAgentFields({}) }}>Ignorer</Button>
            <Button variant="primary" loading={agentSaving} onClick={createAgentDeal}>Valider et créer</Button>
          </div>
        </div>
      )}

      {/* ── Deal QuickView / Edit modal ─────────────────────────────────────── */}
      {selectedDeal && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 50, width: 540, maxHeight: "90vh", overflowY: "auto", background: "var(--bg-card)", border: "1px solid var(--border-accent)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-modal)", padding: 28 }}
        >
          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: "var(--fs-lg)", fontWeight: 700, lineHeight: 1.3, marginBottom: 4 }}>{selectedDeal.name}</div>
                <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>{selectedDeal.clientName}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: "var(--fs-xl)", fontWeight: 700, color: "var(--accent)" }}>{fmtCurrency(selectedDeal.quotedAmount, selectedDeal.currency)}</div>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>Win {Math.round(winFactor(selectedDeal) * 100)}%</div>
              </div>
            </div>
          </div>

          {/* Read-only info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[
              ["Type", selectedDeal.type || "—"], ["Owner", selectedDeal.ownerName || "—"],
              ["Created", fmtDate(selectedDeal.created.slice(0, 10))], ["Risk", selectedDeal.riskLevel || "—"],
            ].map(([l, v]) => (
              <div key={l} style={{ background: "var(--bg-page)", borderRadius: 8, padding: "8px 12px" }}>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
                <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-secondary)", marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Editable fields */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 16, marginBottom: 16 }}>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Mise à jour</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Statut</label>
                <select
                  style={inputStyle}
                  value={(editState.status ?? selectedDeal.status) as string}
                  onChange={e => setEditState(s => ({ ...s, status: e.target.value }))}
                >
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Prochaine action</label>
                <select
                  style={inputStyle}
                  value={(editState.nextAction ?? selectedDeal.nextAction) as string}
                  onChange={e => setEditState(s => ({ ...s, nextAction: e.target.value }))}
                >
                  <option value="">—</option>
                  {NEXT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Date prochaine action</label>
                <input
                  style={inputStyle} type="date"
                  value={(editState.nextActionDate ?? selectedDeal.nextActionDate) as string}
                  onChange={e => setEditState(s => ({ ...s, nextActionDate: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Date de décision</label>
                <input
                  style={inputStyle} type="date"
                  value={(editState.decisionDate ?? selectedDeal.decisionDate) as string}
                  onChange={e => setEditState(s => ({ ...s, decisionDate: e.target.value }))}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Champion interne</label>
                <input
                  style={inputStyle}
                  value={(editState.internalChampion ?? selectedDeal.internalChampion) as string}
                  onChange={e => setEditState(s => ({ ...s, internalChampion: e.target.value }))}
                  placeholder="Nom du sponsor chez le client"
                />
              </div>
              <div>
                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={(editState.budgetConfirmed ?? selectedDeal.budgetConfirmed) as boolean}
                    onChange={e => setEditState(s => ({ ...s, budgetConfirmed: e.target.checked }))}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  Budget confirmé
                </label>
              </div>
              {(CLOSED_LOST.has((editState.status ?? selectedDeal.status) as string)) && (
                <div>
                  <label style={labelStyle}>Raison de perte</label>
                  <select
                    style={inputStyle}
                    value={(editState.lostReason ?? selectedDeal.lostReason) as string}
                    onChange={e => setEditState(s => ({ ...s, lostReason: e.target.value }))}
                  >
                    <option value="">—</option>
                    {LOST_REASONS_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => { setSelectedDeal(null); setEditState({}) }}>Fermer</Button>
            <Button variant="primary" loading={editSaving} onClick={saveDealEdit} disabled={Object.keys(editState).length === 0}>Enregistrer</Button>
          </div>
        </div>
      )}

      {/* ── Lost Reason prompt ──────────────────────────────────────────────── */}
      {lostPrompt && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 51, width: 380, background: "var(--bg-card)", border: "1px solid var(--border-accent)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-modal)", padding: 24 }}
        >
          <div style={{ fontSize: "var(--fs-base)", fontWeight: 600, marginBottom: 4 }}>Raison de perte</div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginBottom: 16 }}>Obligatoire pour passer ce deal en Lost.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {LOST_REASONS_OPTIONS.map(r => (
              <button
                key={r}
                onClick={() => confirmLostReason(r)}
                style={{ padding: "8px 14px", borderRadius: "var(--radius-btn)", border: "1px solid var(--border-subtle)", background: "var(--bg-page)", color: "var(--text-secondary)", cursor: "pointer", textAlign: "left", fontSize: "var(--fs-sm)", fontFamily: "inherit" }}
              >
                {r}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" style={{ marginTop: 12 }} onClick={() => setLostPrompt(null)}>Annuler</Button>
        </div>
      )}
    </div>
  )
}
