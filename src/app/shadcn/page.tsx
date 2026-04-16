"use client"
import { useState, useEffect, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { AppHeader } from "@/components/layout/AppHeader"
import { Button } from "@/components/ui/Button"
import { Spinner } from "@/components/ui/Spinner"
import { ChartContainer, ChartTooltipContent, ChartLegendContent } from "@/components/ui/chart"
import { useTheme } from "@/hooks/useTheme"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, ScatterChart, Scatter, ZAxis,
} from "recharts"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  name: string; status: string; type: string; currency: string
  quotedAmount: number; finalAmount: number; winPercent: number
  riskLevel: string; startDate: string; rentabilite: number | null
}

interface Depense {
  description: string; date: string; fournisseur: string
  categorie: string; montant: number; montantMUR: number
  devise: string; dossier: string; payePar: string
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  "Frais de personnel": "#ef4444", "Locaux & immobilier": "#f97316",
  "Matériel & équipement": "#eab308", "Fournitures": "#22c55e",
  "Transport & déplacements": "#3b82f6", "Prestations externes": "#8b5cf6",
  "Marketing & communication": "#ec4899", "Assurances": "#a3674e",
  "Frais bancaires & financiers": "#6b7280", "Formation & développement": "#14b8a6",
  "Cloud & informatique": "#06b6d4", "Entretien & réparations": "#84cc16",
}
const PIE = ["#A6C9CE", "#3b82f6", "#f97316", "#22c55e", "#8b5cf6", "#ec4899", "#eab308", "#ef4444"]
const RISK = { Low: "#22c55e", Medium: "#f97316", High: "#ef4444", Null: "#6b7280" } as Record<string, string>

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShadcnDashboard() {
  const { status } = useSession()
  const { mode, setTheme } = useTheme()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [loading, setLoading] = useState(true)
  const [themeOpen, setThemeOpen] = useState(false)

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(data => {
      setProjects(data.projects || [])
      setDepenses(data.depenses || [])
    }).finally(() => setLoading(false))
  }, [])

  const now = new Date()
  const currentDossier = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`
  const currentYear = String(now.getFullYear()).slice(2)

  const kpis = useMemo(() => ({
    depMois: depenses.filter(d => d.dossier === currentDossier).reduce((s, d) => s + d.montantMUR, 0),
    depAnnee: depenses.filter(d => d.dossier.startsWith(currentYear)).reduce((s, d) => s + d.montantMUR, 0),
    pipeline: projects.filter(p => !["Lost", "Cancelled", "Completed"].includes(p.status)).reduce((s, p) => s + (p.finalAmount || p.quotedAmount || 0) * (p.winPercent || 0), 0),
    actifs: projects.filter(p => p.status === "Active").length,
  }), [projects, depenses, currentDossier, currentYear])

  const depParMois = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    depenses.forEach(d => { if (!d.dossier) return; if (!m[d.dossier]) m[d.dossier] = {}; m[d.dossier][d.categorie] = (m[d.dossier][d.categorie] || 0) + d.montantMUR })
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([dossier, cats]) => ({ dossier, ...cats }))
  }, [depenses])
  const allCats = useMemo(() => [...new Set(depenses.map(d => d.categorie).filter(Boolean))], [depenses])

  const depParCat = useMemo(() => {
    const m: Record<string, number> = {}
    depenses.forEach(d => { if (d.categorie) m[d.categorie] = (m[d.categorie] || 0) + d.montantMUR })
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [depenses])

  const topFourn = useMemo(() => {
    const m: Record<string, number> = {}
    depenses.forEach(d => { if (d.fournisseur) m[d.fournisseur] = (m[d.fournisseur] || 0) + d.montantMUR })
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10)
  }, [depenses])

  const depParPayeur = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    depenses.forEach(d => { if (!d.dossier) return; if (!m[d.dossier]) m[d.dossier] = {}; m[d.dossier][d.payePar] = (m[d.dossier][d.payePar] || 0) + d.montantMUR })
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([dossier, p]) => ({ dossier, ...p }))
  }, [depenses])
  const allPayeurs = useMemo(() => [...new Set(depenses.map(d => d.payePar).filter(Boolean))], [depenses])

  const depParDevise = useMemo(() => {
    const m: Record<string, number> = {}
    depenses.forEach(d => { if (d.devise && ["EUR", "USD", "MUR"].includes(d.devise)) m[d.devise] = (m[d.devise] || 0) + 1 })
    return Object.entries(m).map(([name, value]) => ({ name, value }))
  }, [depenses])

  const pipelineStatus = useMemo(() => {
    const order = ["Identified", "Proposal Sent", "Negotiation", "Won orally", "Won", "Active", "On Hold", "Completed", "Lost", "Cancelled"]
    const m: Record<string, { count: number; amount: number }> = {}
    projects.forEach(p => { if (!p.status) return; if (!m[p.status]) m[p.status] = { count: 0, amount: 0 }; m[p.status].count++; m[p.status].amount += p.finalAmount || p.quotedAmount || 0 })
    return order.filter(s => m[s]).map(s => ({ status: s, count: m[s].count, amount: m[s].amount }))
  }, [projects])

  const revParMois = useMemo(() => {
    const m: Record<string, number> = {}
    projects.filter(p => ["Won", "Active", "Completed", "Won orally"].includes(p.status)).forEach(p => {
      if (!p.startDate) return
      const d = new Date(p.startDate)
      const k = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`
      m[k] = (m[k] || 0) + (p.finalAmount || 0)
    })
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([mois, montant]) => ({ mois, montant }))
  }, [projects])

  const projParType = useMemo(() => {
    const m: Record<string, { count: number; amount: number }> = {}
    projects.forEach(p => { const t = p.type || "N/A"; if (!m[t]) m[t] = { count: 0, amount: 0 }; m[t].count++; m[t].amount += p.finalAmount || 0 })
    return Object.entries(m).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount)
  }, [projects])

  const rentaData = useMemo(() =>
    projects.filter(p => p.finalAmount > 0 && p.rentabilite != null).map(p => ({
      name: p.name, x: p.finalAmount, y: (p.rentabilite ?? 0) * 100, risk: p.riskLevel || "Null",
    }))
  , [projects])

  const fmt = (v: any) => `${Math.round(Number(v)).toLocaleString("fr-FR")} MUR`

  if (status === "loading" || loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-page)" }}>
      <Spinner size={40} />
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <AppHeader appName="Plutus" right={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Button variant="ghost" size="sm" onClick={() => router.push("/")}>Recharts</Button>
          <span style={{ color: "var(--accent)", fontSize: "var(--fs-xs)", fontWeight: 600 }}>SHADCN</span>
        </div>
      } />

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
          <ShadcnCard label="Dépenses ce mois" value={`${Math.round(kpis.depMois).toLocaleString("fr-FR")} MUR`} sub={currentDossier} />
          <ShadcnCard label="Dépenses année" value={`${Math.round(kpis.depAnnee).toLocaleString("fr-FR")} MUR`} sub={`20${currentYear}`} />
          <ShadcnCard label="Pipeline pondéré" value={`${Math.round(kpis.pipeline).toLocaleString("fr-FR")}`} sub="Final × Win%" />
          <ShadcnCard label="Projets actifs" value={String(kpis.actifs)} sub="Status = Active" accent />
        </div>

        <SectionTitle>Dépenses</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>

          <ShadcnChartCard title="Dépenses mensuelles (MUR)" description="Empilé par catégorie" span={2}>
            <ChartContainer style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={depParMois}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="dossier" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltipContent formatter={fmt} />} />
                  <Legend content={<ChartLegendContent />} />
                  {allCats.map(cat => <Bar key={cat} dataKey={cat} stackId="a" fill={CAT_COLORS[cat] || "#6b7280"} radius={[2, 2, 0, 0]} />)}
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </ShadcnChartCard>

          <ShadcnChartCard title="Répartition par catégorie" description="Total en MUR">
            <ChartContainer style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={depParCat} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={65} outerRadius={105} paddingAngle={2} strokeWidth={0}>
                    {depParCat.map((e, i) => <Cell key={i} fill={CAT_COLORS[e.name] || PIE[i % PIE.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltipContent formatter={fmt} />} />
                  <Legend content={<ChartLegendContent />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </ShadcnChartCard>

          <ShadcnChartCard title="Par devise" description="Nombre de factures">
            <ChartContainer style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={depParDevise} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={65} outerRadius={105} paddingAngle={3} strokeWidth={0}
                    label={({ name, value }: any) => `${name} (${value})`}>
                    {depParDevise.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </ShadcnChartCard>

          <ShadcnChartCard title="Top 10 fournisseurs" description="Montant MUR cumulé" span={2}>
            <ChartContainer style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topFourn} layout="vertical" margin={{ left: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} width={120} />
                  <Tooltip content={<ChartTooltipContent formatter={fmt} />} />
                  <Bar dataKey="value" fill="var(--accent)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </ShadcnChartCard>

          <ShadcnChartCard title="Dépenses par payeur / mois" description="Montant MUR" span={2}>
            <ChartContainer style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={depParPayeur}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="dossier" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltipContent formatter={fmt} />} />
                  <Legend content={<ChartLegendContent />} />
                  {allPayeurs.map((p, i) => <Bar key={p} dataKey={p} fill={PIE[i % PIE.length]} radius={[4, 4, 0, 0]} />)}
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </ShadcnChartCard>
        </div>

        <SectionTitle>Revenus & Pipeline</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>

          <ShadcnChartCard title="Pipeline par status" description="Nombre de projets + montant" span={2}>
            <ChartContainer style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineStatus} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <YAxis type="category" dataKey="status" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} width={100} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Legend content={<ChartLegendContent />} />
                  <Bar dataKey="count" fill="var(--accent)" name="Projets" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="amount" fill="#3b82f6" name="Montant" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </ShadcnChartCard>

          <ShadcnChartCard title="Revenus mensuels" description="Projets Won / Active">
            <ChartContainer style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revParMois}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="mois" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltipContent formatter={(v: any) => Math.round(Number(v)).toLocaleString("fr-FR")} />} />
                  <defs>
                    <linearGradient id="gradientArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="montant" stroke="var(--accent)" fill="url(#gradientArea)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </ShadcnChartCard>

          <ShadcnChartCard title="Projets par type" description="Par montant final">
            <ChartContainer style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={projParType} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={65} outerRadius={105} paddingAngle={2} strokeWidth={0}>
                    {projParType.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltipContent formatter={(v: any) => Math.round(Number(v)).toLocaleString("fr-FR")} />} />
                  <Legend content={<ChartLegendContent />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </ShadcnChartCard>

          <ShadcnChartCard title="Rentabilité projets" description="Montant vs % — couleur = risque" span={2}>
            <ChartContainer style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis type="number" dataKey="x" name="Final Amount" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="number" dataKey="y" name="Rentabilité %" tick={{ fill: "var(--text-muted)", fontSize: 11 }} unit="%" />
                  <ZAxis range={[80, 200]} />
                  <Tooltip content={<ChartTooltipContent formatter={(v: any, name: any) => name === "Final Amount" ? Math.round(Number(v)).toLocaleString("fr-FR") : `${Number(v).toFixed(1)}%`} />} />
                  <Scatter data={rentaData} fill="var(--accent)">
                    {rentaData.map((e, i) => <Cell key={i} fill={RISK[e.risk] || "#6b7280"} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </ChartContainer>
          </ShadcnChartCard>
        </div>

        <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: "var(--fs-xs)" }}>
          {projects.length} projets · {depenses.length} dépenses · Version shadcn
        </div>
      </main>

      {/* Theme toggle */}
      <div style={{ position: "fixed", bottom: 20, left: 20, zIndex: 100, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", background: "var(--bg-panel)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid var(--border-panel)", borderRadius: 10, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
          <button onClick={() => setThemeOpen(!themeOpen)} style={{ width: 36, height: 36, background: "var(--accent-soft)", border: "none", borderLeft: "2px solid var(--accent)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-base)" }}>
            {{ auto: "\u{1F310}", dark: "\u{1F319}", light: "\u{2600}\u{FE0F}" }[mode]}
          </button>
          {themeOpen && (["auto", "dark", "light"] as const).filter(m => m !== mode).map(m => (
            <button key={m} onClick={() => { setTheme(m); setThemeOpen(false) }} style={{ width: 36, height: 36, background: "none", border: "none", borderLeft: "2px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-base)", opacity: 0.5, animation: "fade-in 0.15s ease" }}>
              {{ auto: "\u{1F310}", dark: "\u{1F319}", light: "\u{2600}\u{FE0F}" }[m]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── shadcn-style sub-components ──────────────────────────────────────────────

function ShadcnCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div style={{
      background: "var(--bg-card)", borderRadius: "var(--radius-card)",
      border: "1px solid var(--border-subtle)", padding: "24px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
    }}>
      <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500, letterSpacing: "0.02em" }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: accent ? "var(--accent)" : "var(--text-primary)", letterSpacing: "-0.03em", marginTop: 4, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 6 }}>{sub}</div>
    </div>
  )
}

function ShadcnChartCard({ title, description, children, span }: { title: string; description?: string; children: React.ReactNode; span?: number }) {
  return (
    <div style={{
      gridColumn: span === 2 ? "1 / -1" : undefined,
      background: "var(--bg-card)", borderRadius: "var(--radius-card)",
      border: "1px solid var(--border-subtle)", padding: "24px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
    }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: "var(--fs-md)", fontWeight: 600, color: "var(--text-primary)" }}>{title}</div>
        {description && <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: 2 }}>{description}</div>}
      </div>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "var(--fs-xl)", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid var(--border-subtle)" }}>
      {children}
    </div>
  )
}
