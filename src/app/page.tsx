"use client"
import { useState, useEffect, useMemo, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { AppHeader } from "@/components/layout/AppHeader"
import { Button } from "@/components/ui/Button"
import { Spinner } from "@/components/ui/Spinner"
import { useTheme } from "@/hooks/useTheme"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, ScatterChart, Scatter, ZAxis, ReferenceLine,
} from "recharts"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  name: string; status: string; type: string; methodology: string
  currency: string; quotedAmount: number; finalAmount: number
  winPercent: number; riskLevel: string; startDate: string; endDate: string
  rentabilite: number | null; netAmount: number | null; humanCost: number | null
  clientName: string
}

interface Depense {
  description: string; date: string; fournisseur: string
  categorie: string; sousCategorie: string; montant: number
  montantMUR: number; devise: string; dossier: string; payePar: string
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { status } = useSession()
  const { mode, setTheme } = useTheme()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [themeOpen, setThemeOpen] = useState(false)
  const [bgImage, setBgImage] = useState(BG_IMAGES[0])
  const [timeRange, setTimeRange] = useState<"all" | "12m" | "6m" | "3m">("all")
  const [depPeriod, setDepPeriod] = useState<"year" | "quarter" | "month">("year")
  const [topMode, setTopMode] = useState<"clients" | "fournisseurs">("clients")
  const [tableMode, setTableMode] = useState<"ventes" | "depenses">("ventes")

  useEffect(() => { setBgImage(BG_IMAGES[Math.floor(Math.random() * BG_IMAGES.length)]) }, [])
  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(data => {
      if (data.error) throw new Error(data.error)
      setProjects(data.projects || []); setDepenses(data.depenses || [])
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  // ─── Computed ───────────────────────────────────────────────────────────────

  const now = new Date()
  const currentDossier = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`
  const currentYear = String(now.getFullYear()).slice(2)
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3)
  const quarterStart = `${currentYear}${String((currentQuarter - 1) * 3 + 1).padStart(2, "0")}`

  const depFiltered = useMemo(() => {
    if (depPeriod === "month") return depenses.filter(d => d.dossier === currentDossier)
    if (depPeriod === "quarter") return depenses.filter(d => d.dossier >= quarterStart && d.dossier <= currentDossier)
    return depenses.filter(d => d.dossier.startsWith(currentYear))
  }, [depenses, depPeriod, currentDossier, currentYear, quarterStart])

  const depTotal = useMemo(() => depFiltered.reduce((s, d) => s + d.montantMUR, 0), [depFiltered])
  const revTotal = useMemo(() => projects.filter(p => ["Won", "Active", "Completed", "Won orally"].includes(p.status)).reduce((s, p) => s + (p.finalAmount || 0), 0), [projects])
  const totalProfit = revTotal - depTotal
  const avgMargin = revTotal > 0 ? ((totalProfit / revTotal) * 100) : 0
  const projetsActifs = useMemo(() => projects.filter(p => p.status === "Active").length, [projects])
  const projetsTotal = useMemo(() => projects.filter(p => !["Lost", "Cancelled"].includes(p.status)).length, [projects])
  const depPeriodLabel = depPeriod === "year" ? `20${currentYear}` : depPeriod === "quarter" ? `T${currentQuarter} 20${currentYear}` : fmtDossier(currentDossier)

  // Charts data
  const depParMois = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    depenses.forEach(d => { if (!d.dossier) return; if (!m[d.dossier]) m[d.dossier] = {}; m[d.dossier][d.categorie] = (m[d.dossier][d.categorie] || 0) + d.montantMUR })
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([dossier, cats]) => ({ dossier, label: fmtDossier(dossier), ...cats }))
  }, [depenses])
  const allCats = useMemo(() => [...new Set(depenses.map(d => d.categorie).filter(Boolean))], [depenses])

  const depParCat = useMemo(() => {
    const m: Record<string, number> = {}
    depFiltered.forEach(d => { if (d.categorie) m[d.categorie] = (m[d.categorie] || 0) + d.montantMUR })
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [depFiltered])

  const revParMois = useMemo(() => {
    const revMap: Record<string, number> = {}
    projects.filter(p => ["Won", "Active", "Completed", "Won orally"].includes(p.status)).forEach(p => {
      if (!p.startDate) return; const d = new Date(p.startDate); const k = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`; revMap[k] = (revMap[k] || 0) + (p.finalAmount || 0)
    })
    const depMap: Record<string, number> = {}
    depenses.forEach(d => { if (d.dossier) depMap[d.dossier] = (depMap[d.dossier] || 0) + d.montantMUR })
    const allKeys = new Set([...Object.keys(revMap), ...Object.keys(depMap)])
    return [...allKeys].sort().map(k => ({ mois: k, label: fmtDossier(k), revenus: revMap[k] || 0, depenses: depMap[k] || 0 }))
  }, [projects, depenses])

  const depListByDossier = useMemo(() => {
    const m: Record<string, Depense[]> = {}
    depenses.forEach(d => { if (!d.dossier) return; if (!m[d.dossier]) m[d.dossier] = []; m[d.dossier].push(d) })
    return m
  }, [depenses])

  const projParTypeFiltered = useMemo(() => {
    const m: Record<string, { count: number; amount: number }> = {}
    projects.filter(p => !["Lost", "Cancelled"].includes(p.status)).forEach(p => {
      const t = p.type || "N/A"; if (!m[t]) m[t] = { count: 0, amount: 0 }; m[t].count++; m[t].amount += p.finalAmount || 0
    })
    return Object.entries(m).filter(([n]) => n !== "Internal" && n !== "N/A").map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount)
  }, [projects])

  // Top fournisseurs / clients
  const topFourn = useMemo(() => {
    const m: Record<string, number> = {}
    depenses.forEach(d => { if (d.fournisseur) m[d.fournisseur] = (m[d.fournisseur] || 0) + d.montantMUR })
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [depenses])

  const topClients = useMemo(() => {
    const m: Record<string, number> = {}
    projects.filter(p => !["Lost", "Cancelled"].includes(p.status) && p.clientName && p.clientName !== "N/A").forEach(p => {
      m[p.clientName] = (m[p.clientName] || 0) + (p.finalAmount || 0)
    })
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [projects])

  const topData = topMode === "clients" ? topClients : topFourn

  const rentaData = useMemo(() =>
    projects.filter(p => p.finalAmount > 0 && p.rentabilite != null).map(p => ({
      name: p.name, x: p.finalAmount, y: (p.rentabilite ?? 0) * 100, risk: p.riskLevel || "Null",
    }))
  , [projects])

  // Hero
  const heroData = useMemo(() => {
    const allM = new Set<string>()
    const dM: Record<string, number> = {}; depenses.forEach(d => { if (!d.dossier) return; dM[d.dossier] = (dM[d.dossier] || 0) + d.montantMUR; allM.add(d.dossier) })
    const rM: Record<string, number> = {}; projects.filter(p => ["Won", "Active", "Completed", "Won orally"].includes(p.status)).forEach(p => { if (!p.startDate) return; const d = new Date(p.startDate); const k = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`; rM[k] = (rM[k] || 0) + (p.finalAmount || 0); allM.add(k) })
    let s = [...allM].sort(); if (timeRange !== "all") { const n = timeRange === "12m" ? 12 : timeRange === "6m" ? 6 : 3; s = s.slice(-n) }
    return s.map(m => ({ mois: m, label: fmtDossier(m), depenses: dM[m] || 0, revenus: rM[m] || 0, net: (rM[m] || 0) - (dM[m] || 0) }))
  }, [depenses, projects, timeRange])
  const heroTotalDep = useMemo(() => heroData.reduce((s, d) => s + d.depenses, 0), [heroData])
  const heroTotalRev = useMemo(() => heroData.reduce((s, d) => s + d.revenus, 0), [heroData])
  const heroNet = heroTotalRev - heroTotalDep

  // Table data
  const dernieresDep = useMemo(() => [...depenses].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 8), [depenses])
  const dernieresVentes = useMemo(() =>
    projects.filter(p => ["Won", "Active", "Completed", "Won orally"].includes(p.status) && p.finalAmount > 0)
      .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || "")).slice(0, 8)
  , [projects])

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (status === "loading" || loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }} />
      <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}><Spinner size={40} /><div style={{ color: "var(--text-accent)", fontSize: "var(--fs-sm)", marginTop: 12 }}>Chargement du dashboard…</div></div>
    </div>
  )

  const fmt = (v: any) => `${Math.round(Number(v)).toLocaleString("fr-FR")} MUR`
  const fmtK = (v: any) => `${(Number(v) / 1000).toFixed(0)}k`

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }}>
      <div style={{ position: "fixed", inset: 0, background: "var(--bg-overlay)", zIndex: 0 }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

        <AppHeader appName="Plutus" right={<div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ color: "var(--accent)", fontSize: "var(--fs-xs)", fontWeight: 600, letterSpacing: "0.08em" }}>DASHBOARD</span><Button variant="ghost" size="sm" onClick={() => router.push("/shadcn")}>Shadcn</Button></div>} />

        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px", width: "100%" }}>

          {error && <div style={{ ...card, background: "var(--btn-danger-bg)", border: "1px solid rgba(248,113,113,0.3)", color: "var(--color-error)", fontSize: "var(--fs-sm)", marginBottom: 16 }}>Erreur: {error}</div>}

          {/* ── KPIs ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            <KpiCard icon="💰" iconBg="rgba(166,201,206,0.15)" iconBorder="rgba(166,201,206,0.3)" label="Total Profit" value={`${Math.round(totalProfit).toLocaleString("fr-FR")}`} unit="MUR" sub={depPeriodLabel} valueColor={totalProfit >= 0 ? "var(--accent)" : "var(--color-error)"} />
            <KpiCard icon="📉" iconBg="rgba(166,201,206,0.15)" iconBorder="rgba(166,201,206,0.3)" label="Average Margin" value={`${avgMargin.toFixed(1)}%`} unit="" sub={depPeriodLabel} valueColor={avgMargin >= 0 ? "var(--accent)" : "var(--color-error)"} />

            {/* Dépenses card with toggle */}
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>Dépenses</div>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>💸</div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1 }}>{Math.round(depTotal).toLocaleString("fr-FR")}</span>
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>MUR</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>{depPeriodLabel}</div>
                <Seg value={depPeriod} onChange={v => setDepPeriod(v as any)} options={[["year", "A"], ["quarter", "T"], ["month", "M"]]} />
              </div>
            </div>

            <KpiCard icon="⚡" iconBg="rgba(20,184,166,0.15)" iconBorder="rgba(20,184,166,0.3)" label="Projets actifs" value={`${projetsActifs}`} unit={`/ ${projetsTotal}`} sub="Status = Active" />
          </div>

          {/* ── HERO ── */}
          <div style={{ ...card, padding: 0, marginBottom: 24, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(166,201,206,0.08)", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: "var(--fs-md)", fontWeight: 600, color: "var(--text-primary)" }}>Dépenses vs Revenus</div>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: 2 }}>Vue mensuelle — net = revenus - dépenses</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ display: "flex", gap: 12, fontSize: "var(--fs-xs)" }}>
                  <Badge c="#A6C9CE" l="Revenus" v={Math.round(heroTotalRev).toLocaleString("fr-FR")} />
                  <Badge c="#ef4444" l="Dépenses" v={Math.round(heroTotalDep).toLocaleString("fr-FR")} />
                  <Badge c={heroNet >= 0 ? "#22c55e" : "#ef4444"} l="Net" v={`${heroNet >= 0 ? "+" : ""}${Math.round(heroNet).toLocaleString("fr-FR")}`} />
                </div>
                <Seg value={timeRange} onChange={v => setTimeRange(v as any)} options={[["all", "Tout"], ["12m", "12m"], ["6m", "6m"], ["3m", "3m"]]} />
              </div>
            </div>
            <div style={{ padding: "16px 16px 8px" }}>
              <ResponsiveContainer width="100%" height={340}>
                <AreaChart data={heroData} margin={{ left: 10, right: 10 }}>
                  <defs>
                    <linearGradient id="gDep" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#A6C9CE" stopOpacity={0.35} /><stop offset="95%" stopColor="#A6C9CE" stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.06)" />
                  <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                  <ReferenceLine y={0} stroke="rgba(166,201,206,0.15)" strokeDasharray="3 3" />
                  <Tooltip content={<HeroTooltip />} />
                  <Area type="monotone" dataKey="revenus" stroke="#A6C9CE" strokeWidth={2} fill="url(#gRev)" dot={false} activeDot={{ r: 4, fill: "#A6C9CE", strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="depenses" stroke="#ef4444" strokeWidth={2} fill="url(#gDep)" dot={false} activeDot={{ r: 4, fill: "#ef4444", strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Row 1: Dépenses mensuelles + Par catégorie ── */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
            <ChartCard title="Dépenses mensuelles" value={`${Math.round(depTotal).toLocaleString("fr-FR")} MUR`} expandable>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={depParMois}>
                  <defs>
                    {allCats.map((cat, i) => {
                      const color = PIE_CAT[i % PIE_CAT.length]
                      return <linearGradient key={cat} id={`gCat${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.5} /><stop offset="100%" stopColor={color} stopOpacity={0.05} /></linearGradient>
                    })}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.08)" />
                  <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                  <Tooltip content={<CTooltip formatter={fmt} />} />
                  {allCats.map((cat, i) => (
                    <Area key={cat} type="monotone" dataKey={cat} stackId="1" stroke={PIE_CAT[i % PIE_CAT.length]} strokeWidth={0.5} fill={`url(#gCat${i})`} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Par catégorie" expandable expandMode="tall">
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={depParCat} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2} strokeWidth={0}
                    label={({ cx, cy, midAngle, outerRadius: or, name, value }: any) => {
                      const pct = depTotal > 0 ? ((value / depTotal) * 100).toFixed(0) : "0"
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

          {/* ── Row 2: Revenus mensuels + Par type double donut ── */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
            <ChartCard title="Revenus mensuels" value={`${Math.round(revTotal).toLocaleString("fr-FR")} MUR`} expandable>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={revParMois}>
                  <defs><linearGradient id="gRev2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A6C9CE" stopOpacity={0.4} /><stop offset="100%" stopColor="#A6C9CE" stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.08)" />
                  <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                  <Tooltip content={<RevenueTooltip depListByDossier={depListByDossier} />} />
                  <Area type="monotone" dataKey="revenus" stroke="#A6C9CE" strokeWidth={2} fill="url(#gRev2)" dot={{ r: 3, fill: "#A6C9CE", strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Par type de projet" expandable expandMode="tall">
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

          {/* ── Row 3: Top fournisseurs/clients + Rentabilité ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <ChartCard title={topMode === "clients" ? "Top Clients" : "Top Fournisseurs"} right={<Seg value={topMode} onChange={v => setTopMode(v as any)} options={[["clients", "Clients"], ["fournisseurs", "Fournisseurs"]]} />}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.08)" />
                  <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} width={130} axisLine={false} tickLine={false} />
                  <Tooltip content={<CTooltip formatter={fmt} />} />
                  <Bar dataKey="value" fill="#A6C9CE" radius={[0, 6, 6, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
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
          <ChartCard title={tableMode === "ventes" ? "Dernières ventes" : "Dernières dépenses"} expandable right={
            <Seg value={tableMode} onChange={v => setTableMode(v as any)} options={[["ventes", "Ventes"], ["depenses", "Dépenses"]]} />
          }>
            {tableMode === "depenses" ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
                <thead><tr style={{ borderBottom: "1px solid rgba(166,201,206,0.08)" }}>
                  {["Date", "Description", "Fournisseur", "Montant", "Catégorie"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr></thead>
                <tbody>{dernieresDep.map((d, i) => (
                  <tr key={i} style={{ borderBottom: i < 7 ? "1px solid rgba(166,201,206,0.05)" : undefined }}>
                    <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--text-muted)" }}>{d.date || "—"}</td>
                    <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.description}</td>
                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{d.fournisseur}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, fontFamily: "monospace" }}>{d.montant.toLocaleString("fr-FR")} {d.devise}</td>
                    <td style={tdStyle}><span style={{ background: `${CAT_COLORS[d.categorie] || "#6b7280"}22`, color: CAT_COLORS[d.categorie] || "#6b7280", padding: "2px 8px", borderRadius: 4, fontSize: "var(--fs-2xs)", fontWeight: 600 }}>{d.categorie}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
                <thead><tr style={{ borderBottom: "1px solid rgba(166,201,206,0.08)" }}>
                  {["Date", "Projet", "Client", "Montant", "Type", "Status"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr></thead>
                <tbody>{dernieresVentes.map((p, i) => (
                  <tr key={i} style={{ borderBottom: i < 7 ? "1px solid rgba(166,201,206,0.05)" : undefined }}>
                    <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--text-muted)" }}>{p.startDate || "—"}</td>
                    <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</td>
                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{p.clientName}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, fontFamily: "monospace" }}>{Math.round(p.finalAmount).toLocaleString("fr-FR")} {p.currency}</td>
                    <td style={tdStyle}><span style={{ background: "var(--accent-soft)", color: "var(--accent)", padding: "2px 8px", borderRadius: 4, fontSize: "var(--fs-2xs)", fontWeight: 600 }}>{p.type}</span></td>
                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{p.status}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </ChartCard>

          <div style={{ textAlign: "center", padding: "12px 0 24px", color: "var(--text-muted)", fontSize: "var(--fs-2xs)" }}>{projects.length} projets · {depenses.length} dépenses · Données Notion en temps réel</div>
        </main>
      </div>

      {/* Theme toggle */}
      <div style={{ position: "fixed", bottom: 20, left: 20, zIndex: 100, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", background: "var(--bg-panel)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid var(--border-panel)", borderRadius: 10, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
          <button onClick={() => setThemeOpen(!themeOpen)} style={{ width: 36, height: 36, background: "var(--accent-soft)", border: "none", borderLeft: "2px solid var(--accent)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-base)" }}>{{ auto: "\u{1F310}", dark: "\u{1F319}", light: "\u{2600}\u{FE0F}" }[mode]}</button>
          {themeOpen && (["auto", "dark", "light"] as const).filter(m => m !== mode).map(m => (
            <button key={m} onClick={() => { setTheme(m); setThemeOpen(false) }} style={{ width: 36, height: 36, background: "none", border: "none", borderLeft: "2px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-base)", opacity: 0.5, animation: "fade-in 0.15s ease" }}>{{ auto: "\u{1F310}", dark: "\u{1F319}", light: "\u{2600}\u{FE0F}" }[m]}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const card: React.CSSProperties = { background: "var(--bg-panel)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(166,201,206,0.10)", borderRadius: 14, padding: "20px" }
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 16px", color: "var(--text-muted)", fontWeight: 500, fontSize: "var(--fs-2xs)", textTransform: "uppercase", letterSpacing: "0.05em" }
const tdStyle: React.CSSProperties = { padding: "10px 16px", color: "var(--text-primary)" }

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

function ChartCard({ title, value, sub, right, children, expandable, expandMode = "wide" }: { title: string; value?: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; expandable?: boolean; expandMode?: "wide" | "tall" }) {
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
            width: isWide ? "95vw" : "80vw",
            height: isWide ? "auto" : "92vh",
            maxWidth: isWide ? undefined : 900,
            maxHeight: isWide ? "auto" : "92vh",
            overflow: "hidden",
            padding: "28px 32px",
            boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          }} onClick={e => e.stopPropagation()}>
            {header}
            <div className="chart-expanded" style={{ height: isWide ? "min(500px, calc(90vh - 140px))" : "calc(92vh - 130px)" }}>
              {children}
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
  const dep = payload.find((p: any) => p.dataKey === "depenses")?.value ?? 0
  const rev = payload.find((p: any) => p.dataKey === "revenus")?.value ?? 0
  const net = rev - dep
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "14px 18px", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", fontSize: "var(--fs-xs)", minWidth: 200 }}>
      <div style={{ fontWeight: 700, marginBottom: 10, color: "var(--text-secondary)", fontSize: "var(--fs-sm)" }}>{label}</div>
      <TRow c="#A6C9CE" l="Revenus" v={Math.round(rev).toLocaleString("fr-FR")} vc="#A6C9CE" />
      <TRow c="#ef4444" l="Dépenses" v={Math.round(dep).toLocaleString("fr-FR")} vc="#ef4444" />
      <div style={{ borderTop: "1px solid rgba(166,201,206,0.10)", paddingTop: 6, marginTop: 6 }}>
        <TRow c={net >= 0 ? "#22c55e" : "#ef4444"} l="Net" v={`${net >= 0 ? "+" : ""}${Math.round(net).toLocaleString("fr-FR")}`} vc={net >= 0 ? "#22c55e" : "#ef4444"} bold />
      </div>
    </div>
  )
}

function RevenueTooltip({ active, payload, label, depListByDossier }: any) {
  if (!active || !payload?.length) return null
  const rev = payload.find((p: any) => p.dataKey === "revenus")?.value ?? 0
  const point = payload[0]?.payload; const moisCode = point?.mois || ""
  const depList = (depListByDossier?.[moisCode] || []).slice(0, 5) as Depense[]
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "14px 18px", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", fontSize: "var(--fs-xs)", minWidth: 240, maxWidth: 320 }}>
      <div style={{ fontWeight: 700, marginBottom: 10, color: "var(--text-secondary)", fontSize: "var(--fs-sm)" }}>{label}</div>
      <TRow c="#A6C9CE" l="Revenus" v={Math.round(rev).toLocaleString("fr-FR")} vc="#A6C9CE" />
      {depList.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(166,201,206,0.10)", paddingTop: 8, marginTop: 8 }}>
          <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginBottom: 4, fontWeight: 600 }}>Dépenses du mois :</div>
          {depList.map((d, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "2px 0", fontSize: "var(--fs-2xs)" }}>
              <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{d.fournisseur || d.description}</span>
              <span style={{ fontFamily: "monospace", fontWeight: 600, flexShrink: 0 }}>{d.montant.toLocaleString("fr-FR")} {d.devise}</span>
            </div>
          ))}
          {(depListByDossier?.[moisCode]?.length || 0) > 5 && <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 2 }}>+ {depListByDossier[moisCode].length - 5} autres</div>}
        </div>
      )}
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
