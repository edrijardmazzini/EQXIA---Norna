'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Monitor, Moon, Sun, Settings, AlertTriangle, AlertOctagon, Info, CheckCircle2, ExternalLink, Database } from 'lucide-react'
import { GenericEditModal } from '@/components/sales/GenericEditModal'
import { AppHeader } from '@/components/layout/AppHeader'
import { useTheme } from '@/hooks/useTheme'
import { useProjectsData } from '@/hooks/useProjectsData'
import { EqxiaLoadingScreen } from '@/components/eqxia'
import { KPICard } from '@/components/sales/KPICard'
import { KanbanBoard } from '@/components/sales/KanbanBoard'
import { ForecastChart } from '@/components/sales/ForecastChart'
import { FunnelChart } from '@/components/sales/FunnelChart'
import { StaleHeatmap } from '@/components/sales/StaleHeatmap'
import { VelocityChart } from '@/components/sales/VelocityChart'
import { WinLossBySegment } from '@/components/sales/WinLossBySegment'
import { OwnerPerformance } from '@/components/sales/OwnerPerformance'
import { ScatterRisk } from '@/components/sales/ScatterRisk'
import { CohortChart } from '@/components/sales/CohortChart'
import { SourceChart } from '@/components/sales/SourceChart'
import { ClientCard } from '@/components/sales/ClientCard'
import { ClientDetail } from '@/components/sales/ClientDetail'
import type { Project, Client } from '@/types/sales'
import { CLOSED_WON, CLOSED_LOST, fmtCurrency, winFactor } from '@/types/sales'

type Tab = 'pipeline' | 'forecast' | 'clients' | 'settings'
type IssueLevel = 'critical' | 'warning' | 'info'
interface SalesIssue { level: IssueLevel; source: 'projects' | 'clients'; entity: string; field: string; message: string }

const THEME_ICONS = { auto: Monitor, dark: Moon, light: Sun } as const
const LEVEL_ORDER: Record<IssueLevel, number> = { critical: 0, warning: 1, info: 2 }

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border-input)',
  borderRadius: 'var(--radius-input)', padding: '5px 10px',
  fontSize: 'var(--fs-xs)', color: 'var(--text-primary)',
}

const BG_IMAGES = [
  '/assets/backgrounds/bg-ice-surface-light.jpg',
  '/assets/backgrounds/bg-sediment-blue-white.jpg',
  '/assets/backgrounds/bg-ink-teal-copper.jpg',
  '/assets/backgrounds/bg-glacial-river-teal.jpg',
  '/assets/backgrounds/bg-confluence-streams.jpg',
  '/assets/backgrounds/bg-glacial-teal-copper.jpg',
]

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--card-bg)',
      backdropFilter: 'var(--card-blur)',
      WebkitBackdropFilter: 'var(--card-blur)',
      border: 'var(--card-border)',
      borderRadius: 'var(--card-radius)',
      boxShadow: 'var(--card-shadow)',
      padding: 'var(--card-padding)',
    }}>
      <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: sub ? 4 : 16, color: 'var(--text-primary)' }}>{title}</div>
      {sub && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: 16 }}>{sub}</div>}
      {children}
    </div>
  )
}

function KpiStat({ value, label, color, icon: Icon }: { value: number; label: string; color: string; icon: React.ElementType }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: 'var(--fs-kpi)',
        fontWeight: 'var(--fw-kpi)' as React.CSSProperties['fontWeight'],
        letterSpacing: 'var(--ls-kpi)',
        lineHeight: 1,
        color,
        fontFamily: 'monospace',
      }}>{value}</div>
      <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 4 }}>
        <Icon size={10} color={color} /> {label}
      </div>
    </div>
  )
}

export default function SalesPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const { mode, setTheme } = useTheme()
  const { projects, clients, employees, loading, error, reload } = useProjectsData()
  const [bgImage, setBgImage] = useState(BG_IMAGES[0])
  const [themeOpen, setThemeOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('pipeline')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [localProjects, setLocalProjects] = useState<Project[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  // Client tab filters
  const [clientSectorFilter, setClientSectorFilter] = useState('')
  const [clientSatisfactionFilter, setClientSatisfactionFilter] = useState('')
  const [clientHealthFilter, setClientHealthFilter] = useState('')
  const [clientUpsellFilter, setClientUpsellFilter] = useState('')
  const [clientSort, setClientSort] = useState<'ltv' | 'projects'>('ltv')

  useEffect(() => {
    if (session?.user?.email && !session.user.email.endsWith('@eqxia.com')) {
      router.push('/login')
    }
  }, [session, router])

  useEffect(() => { setBgImage(BG_IMAGES[Math.floor(Math.random() * BG_IMAGES.length)]) }, [])

  useEffect(() => {
    setLocalProjects(projects)
  }, [projects])

  const now = new Date()

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const pipelineDeals = useMemo(() =>
    localProjects.filter(p => !CLOSED_WON.has(p.status) && !CLOSED_LOST.has(p.status) && p.status !== 'On Hold'),
    [localProjects],
  )

  const kpiPipelineTotal = useMemo(() =>
    pipelineDeals.reduce((s, p) => s + p.quotedAmount, 0),
    [pipelineDeals],
  )

  const kpiWeighted = useMemo(() =>
    pipelineDeals.reduce((s, p) => s + p.quotedAmount * winFactor(p), 0),
    [pipelineDeals],
  )

  const kpiWinRate = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const { won, lost } = localProjects.reduce(
      (acc, p) => {
        if (new Date(p.created) < cutoff) return acc
        if (CLOSED_WON.has(p.status)) acc.won++
        else if (CLOSED_LOST.has(p.status)) acc.lost++
        return acc
      },
      { won: 0, lost: 0 },
    )
    return won + lost > 0 ? Math.round(won / (won + lost) * 100) : 0
  }, [localProjects])

  const ownerOptions = useMemo(() => {
    const s = new Set(localProjects.map(p => p.ownerName).filter(Boolean))
    return Array.from(s).sort()
  }, [localProjects])

  const activeDealsMap = useMemo(() => {
    const map = new Map<string, number>()
    localProjects.forEach(p => {
      if (CLOSED_WON.has(p.status) || CLOSED_LOST.has(p.status)) return
      p.clientIds.forEach(id => map.set(id, (map.get(id) || 0) + 1))
    })
    return map
  }, [localProjects])

  // ── Client data ───────────────────────────────────────────────────────────

  const allSectors = useMemo(() => {
    const s = new Set<string>()
    clients.forEach(c => c.sectors.forEach(sec => s.add(sec)))
    return Array.from(s).sort()
  }, [clients])

  const filteredClients = useMemo(() => {
    const list = clients.filter(c => {
      if (clientSectorFilter && !c.sectors.includes(clientSectorFilter)) return false
      if (clientSatisfactionFilter && c.satisfaction !== clientSatisfactionFilter) return false
      if (clientHealthFilter && !c.health.includes(clientHealthFilter)) return false
      if (clientUpsellFilter && c.upXsellPotential !== clientUpsellFilter) return false
      return true
    })
    if (clientSort === 'ltv') return [...list].sort((a, b) => b.lifetimeValue - a.lifetimeValue)
    if (clientSort === 'projects') return [...list].sort((a, b) => (activeDealsMap.get(b.id) || 0) - (activeDealsMap.get(a.id) || 0))
    return list
  }, [clients, clientSectorFilter, clientSatisfactionFilter, clientHealthFilter, clientUpsellFilter, clientSort, activeDealsMap])

  // ── Loading / Error ────────────────────────────────────────────────────────

  const ActiveThemeIcon = THEME_ICONS[mode]

  if (loading) return <EqxiaLoadingScreen appName="Sales" bgImage={bgImage} />

  if (error) {
    return (
      <div style={{ minHeight: '100vh', backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)' }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: 'var(--color-error)' }}>Erreur : {error}</div>
          <button onClick={reload} style={{ padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-btn)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Réessayer</button>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }}>
      <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', zIndex: 0 }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', color: 'var(--text-primary)' }}>
      <AppHeader
        appName="Sales"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ textAlign: 'right', lineHeight: 1.1 }}>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                {now.toLocaleDateString('fr-FR', { weekday: 'long' })}
              </div>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace' }}>
                {now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
            <a
              href="/"
              style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', textDecoration: 'none', padding: '4px 10px', borderRadius: 'var(--radius-btn)', border: '1px solid var(--border-subtle)', background: 'var(--accent-soft)', whiteSpace: 'nowrap' }}
            >
              ← Finance
            </a>
            <button
              onClick={() => setTab('settings')}
              style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', textDecoration: 'none', padding: '4px 10px', borderRadius: 'var(--radius-btn)', border: '1px solid var(--border-subtle)', background: 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', whiteSpace: 'nowrap' }}
            >
              <Settings size={13} /> Réglages
            </button>
          </div>
        }
      />

      <main style={{ maxWidth: 'var(--content-max)', margin: '0 auto', padding: 'var(--content-py) var(--content-px)', width: '100%' }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 'var(--tab-gap)', marginBottom: 20, borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}>
          {(['pipeline', 'forecast', 'clients', 'settings'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: 'var(--tab-py) var(--tab-px)',
                fontSize: 'var(--tab-fs)',
                fontWeight: 'var(--tab-fw)' as React.CSSProperties['fontWeight'],
                background: 'none', border: 'none', cursor: 'pointer',
                color: tab === t ? 'var(--tab-color-active)' : 'var(--tab-color)',
                borderBottom: `var(--tab-indicator) solid ${tab === t ? 'var(--tab-color-active)' : 'transparent'}`,
                marginBottom: -1,
                transition: 'all 0.15s', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {t === 'settings' && <Settings size={13} />}
              {{ pipeline: 'Pipeline', forecast: 'Prévisionnel', clients: 'Clients', settings: 'Réglages' }[t]}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} style={{ ...INPUT_STYLE, marginBottom: 8 }}>
            <option value="">Tous les owners</option>
            {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {/* ── Tab Pipeline ─────────────────────────────────────────────────── */}
        {tab === 'pipeline' && (
          <KanbanBoard
            projects={localProjects}
            clients={clients}
            employees={employees}
            onProjectsChange={setLocalProjects}
            ownerFilter={ownerFilter}
            onClientClick={(clientId) => {
              const client = clients.find(c => c.id === clientId)
              if (client) {
                setTab('clients')
                setSelectedClient(client)
              }
            }}
          />
        )}

        {/* ── Tab Prévisionnel ─────────────────────────────────────────────── */}
        {tab === 'forecast' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-grid)' }}>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gap-grid)' }}>
              <KPICard
                label="Pipeline total"
                value={fmtCurrency(kpiPipelineTotal)}
                sub={`${pipelineDeals.length} deals actifs`}
                accent
              />
              <KPICard
                label="Forecast pondéré"
                value={fmtCurrency(kpiWeighted)}
                sub="Montants × % win auto"
              />
              <KPICard
                label="Deals actifs"
                value={String(pipelineDeals.length)}
                sub="Lead → Verbal Commitment"
              />
              <KPICard
                label="Win rate 90j"
                value={`${kpiWinRate}%`}
                sub="Won / (Won + Lost)"
                accent={kpiWinRate >= 50}
              />
            </div>

            {/* Forecast + Funnel */}
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 'var(--gap-grid)' }}>
              <ChartCard title="Prévisionnel" sub="Basé sur Expected Close Date">
                <ForecastChart projects={localProjects} />
              </ChartCard>
              <ChartCard title="Funnel de conversion">
                <FunnelChart projects={localProjects} />
              </ChartCard>
            </div>

            {/* Heatmap + Velocity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap-grid)' }}>
              <ChartCard title="Deals stagnants" sub="Par étape × ancienneté">
                <StaleHeatmap projects={localProjects} />
              </ChartCard>
              <ChartCard title="Velocity par étape" sub="Temps moyen en jours (deals Won)">
                <VelocityChart projects={localProjects} />
              </ChartCard>
            </div>

            {/* Analytics row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap-grid)' }}>
              <ChartCard title="Win/Loss par type">
                <WinLossBySegment projects={localProjects} />
              </ChartCard>
              <ChartCard title="Performance par owner">
                <OwnerPerformance projects={localProjects} />
              </ChartCard>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap-grid)' }}>
              <ChartCard title="Priorité × Ancienneté" sub="Taille = montant · Couleur = health">
                <ScatterRisk projects={localProjects} />
              </ChartCard>
              <ChartCard title="Cohortes par mois de création">
                <CohortChart projects={localProjects} />
              </ChartCard>
            </div>

            <ChartCard title="Source d'acquisition">
              <SourceChart projects={localProjects} />
            </ChartCard>
          </div>
        )}

        {/* ── Tab Clients ──────────────────────────────────────────────────── */}
        {tab === 'clients' && (
          <div>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={clientSectorFilter} onChange={e => setClientSectorFilter(e.target.value)} style={{ ...INPUT_STYLE, padding: '6px 10px' }}>
                <option value="">Tous les secteurs</option>
                {allSectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={clientSatisfactionFilter} onChange={e => setClientSatisfactionFilter(e.target.value)} style={{ ...INPUT_STYLE, padding: '6px 10px' }}>
                <option value="">Satisfaction</option>
                {['Very Satisfied', 'Satisfied', 'Neutral', 'Dissatisfied'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={clientHealthFilter} onChange={e => setClientHealthFilter(e.target.value)} style={{ ...INPUT_STYLE, padding: '6px 10px' }}>
                <option value="">Health</option>
                <option value="OK">✅ OK</option>
                <option value="Warning">⚠️ Warning</option>
                <option value="Critical">❌ Critical</option>
              </select>
              <select value={clientUpsellFilter} onChange={e => setClientUpsellFilter(e.target.value)} style={{ ...INPUT_STYLE, padding: '6px 10px' }}>
                <option value="">Up-sell</option>
                {['High', 'Medium', 'Low'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {(['ltv', 'projects'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setClientSort(s)}
                    style={{ padding: '5px 12px', fontSize: 'var(--fs-xs)', borderRadius: 'var(--radius-btn)', border: '1px solid var(--border-subtle)', background: clientSort === s ? 'var(--accent-soft)' : 'var(--bg-card)', color: clientSort === s ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {{ ltv: 'Lifetime Value', projects: 'Projets actifs' }[s]}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {filteredClients.map(client => (
                <ClientCard
                  key={client.id}
                  client={client}
                  activeDealsCount={activeDealsMap.get(client.id) || 0}
                  onClick={() => setSelectedClient(client)}
                />
              ))}
              {filteredClients.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
                  Aucun client trouvé
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab Réglages ──────────────────────────────────────────────── */}
        {tab === 'settings' && (
          <SalesSettings projects={localProjects} clients={clients} />
        )}
      </main>

      {/* Client detail panel */}
      {selectedClient && (
        <ClientDetail
          client={selectedClient}
          projects={localProjects}
          onClose={() => setSelectedClient(null)}
        />
      )}
      </div>{/* /relative zIndex:1 */}

      {/* Theme toggle — identique au dashboard */}
      <div style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 100 }}>
        <div style={{ position: 'relative' }}>
          {themeOpen && (
            <>
              <div onClick={() => setThemeOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
              <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: 4, zIndex: 99, background: 'var(--bg-panel)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid var(--border-panel)', borderRadius: 10, padding: 4, boxShadow: 'var(--shadow-card)' }}>
                {(['auto', 'dark', 'light'] as const).map(m => {
                  const Icon = THEME_ICONS[m]
                  const active = mode === m
                  return (
                    <button key={m} onClick={() => { setTheme(m); setThemeOpen(false) }} style={{ width: 36, height: 36, background: active ? 'var(--accent-soft)' : 'none', border: 'none', borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s', opacity: active ? 1 : 0.5, color: 'var(--text-primary)' }}>
                      <Icon size={15} />
                    </button>
                  )
                })}
              </div>
            </>
          )}
          <button onClick={() => setThemeOpen(t => !t)} title="Thème" style={{ width: 36, height: 36, background: 'var(--bg-panel)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid var(--border-panel)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-card)', color: 'var(--text-primary)' }}>
            <ActiveThemeIcon size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── SalesSettings ─────────────────────────────────────────────────────────

const NOTION_BASES: { label: string; env: string; id?: string; color: string }[] = [
  { label: 'Projects', env: 'NOTION_PROJECTS_DB_ID', id: 'c0167047-f3c2-45c3-99bd-6c170d207a96', color: '#3b82f6' },
  { label: 'Clients', env: 'NOTION_CLIENTS_DB_ID', id: '942e7bc6-f656-43c8-9af2-71a1365a060e', color: '#10b981' },
  { label: 'Contacts', env: 'NOTION_CONTACTS_DB_ID', id: 'f8488151-3f9f-4a1e-87c8-8e068a5eb4a8', color: '#8b5cf6' },
  { label: 'Tasks', env: 'NOTION_TASKS_DB_ID', id: '0360d820-7e6b-4379-9d87-9f38afa64e85', color: '#f59e0b' },
]

function notionUrl(id: string) { return `https://notion.so/${id.replace(/-/g, '')}` }

function validateProject(p: Project): SalesIssue[] {
  const out: SalesIssue[] = []
  const name = p.name || p.id
  if (!p.type) out.push({ level: 'critical', source: 'projects', entity: name, field: 'Type', message: 'Type de projet non renseigné' })
  if (!p.quotedAmount || p.quotedAmount === 0) out.push({ level: 'critical', source: 'projects', entity: name, field: 'Quoted Amount', message: 'Montant devisé absent — deal non valorisé dans le forecast' })
  if (!p.expectedCloseDate && !p.endDate) out.push({ level: 'warning', source: 'projects', entity: name, field: 'Expected Close Date', message: 'Pas de date de clôture — classé en fallback +3 mois dans le forecast' })
  if ((!p.winPercent || p.winPercent === 0) && (!p.winAuto || p.winAuto === 0)) out.push({ level: 'critical', source: 'projects', entity: name, field: 'Win %', message: 'Aucun win % (ni gut feeling ni auto) — forecast pondéré = 0' })
  if (!p.ownerName) out.push({ level: 'warning', source: 'projects', entity: name, field: 'Owner', message: 'Responsable non renseigné' })
  if (!p.clientName || p.clientName === 'N/A') out.push({ level: 'warning', source: 'projects', entity: name, field: 'Client', message: 'Aucun client lié au deal' })
  return out
}

function validateClient(c: Client): SalesIssue[] {
  const out: SalesIssue[] = []
  const name = c.name || c.id
  if (!c.satisfaction) out.push({ level: 'warning', source: 'clients', entity: name, field: 'Satisfaction', message: 'Score de satisfaction absent' })
  if (!c.relationshipOwner) out.push({ level: 'warning', source: 'clients', entity: name, field: 'Relationship Owner', message: 'Responsable relation absent' })
  if (!c.health) out.push({ level: 'info', source: 'clients', entity: name, field: 'Health', message: 'Indicateur santé non calculé' })
  return out
}

function IssueIcon({ level }: { level: IssueLevel }) {
  if (level === 'critical') return <AlertOctagon size={13} color="#ef4444" style={{ flexShrink: 0 }} />
  if (level === 'warning') return <AlertTriangle size={13} color="#facc15" style={{ flexShrink: 0 }} />
  return <Info size={13} color="#60a5fa" style={{ flexShrink: 0 }} />
}

function SalesSettings({ projects, clients }: { projects: Project[]; clients: Client[] }) {
  const [levelFilter, setLevelFilter] = useState<'all' | 'critical' | 'warning'>('critical')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'projects' | 'clients'>('all')
  const [genericEdit, setGenericEdit] = useState<{ entity: 'project'; data: Record<string, unknown> } | null>(null)

  const activeProjects = projects.filter(p => !['Lost', 'Cancelled'].includes(p.status))

  const issues = useMemo<SalesIssue[]>(() => {
    const active = projects.filter(p => !['Lost', 'Cancelled'].includes(p.status))
    const out = [...active.flatMap(validateProject), ...clients.flatMap(validateClient)]
    return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
  }, [projects, clients])

  const filtered = issues.filter(i => {
    if (levelFilter !== 'all' && i.level !== levelFilter) return false
    if (sourceFilter !== 'all' && i.source !== sourceFilter) return false
    return true
  })

  const counts = {
    critical: issues.filter(i => i.level === 'critical').length,
    warning: issues.filter(i => i.level === 'warning').length,
  }
  const countOk = Math.max(0, activeProjects.length + clients.length - counts.critical - counts.warning)

  const cardStyle: React.CSSProperties = {
    background: 'var(--card-bg)',
    backdropFilter: 'var(--card-blur)',
    WebkitBackdropFilter: 'var(--card-blur)',
    border: 'var(--card-border)',
    borderRadius: 'var(--card-radius)',
    boxShadow: 'var(--card-shadow)',
    overflow: 'hidden',
  }
  const segBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px', fontSize: 'var(--fs-xs)', borderRadius: 'var(--radius-chip)', cursor: 'pointer', fontFamily: 'inherit',
    border: active ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
    background: active ? 'var(--accent-soft)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-grid-lg)' }}>

      {/* Documentation des méthodes de calcul */}
      <div style={cardStyle}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Info size={15} color="var(--accent)" />
          <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Méthodes de calcul & fonctionnement</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {[
            {
              title: 'CA (Chiffre d\'affaires)',
              body: 'Montant devisé (Quoted Amount) converti en MUR au taux en vigueur à la date choisie (End Date par défaut, configurable dans /réglages). Si non renseigné, le projet est exclu du CA.',
            },
            {
              title: 'Revenu net',
              body: 'Final Amount si renseigné, sinon Quoted Amount. On soustrait ensuite la commission éventuelle (commission % × CA). Résultat = revenu réellement encaissé par Eqxia.',
            },
            {
              title: 'Win % gut feeling',
              body: 'Valeur saisie manuellement dans Notion (0–100 %). Reflète l\'intuition commerciale. Utilisé par défaut pour pondérer les projections prévisionnelles.',
            },
            {
              title: 'Win % auto',
              body: 'Score calculé par une formule Notion combinant : statut (Scoping +15, Proposal +20, Verbal +30…), budget confirmé (+10), date clôture renseignée (+5), etc. Fallback quand gut feeling = 0.',
            },
            {
              title: 'Prévisionnel (forecast)',
              body: 'Les projets non terminés (hors Won/Lost/Cancelled) sont placés sur leur Expected Close Date. Si absente, ils tombent à currentMonth +3. Le montant est pondéré par le win % sélectionné.',
            },
            {
              title: 'Health & Kanban',
              body: 'Health = formule Notion (❌ Critical, ⚠️ Warning, ✅ OK) basée sur les jours dans l\'étape et les champs manquants. Le Kanban groupe par statut et permet de déplacer un deal d\'une colonne à l\'autre (PATCH Notion).',
            },
          ].map((item, i) => (
            <div key={item.title} style={{ padding: '14px 20px', borderRight: i % 2 === 0 ? '1px solid var(--border-subtle)' : undefined, borderTop: i >= 2 ? '1px solid var(--border-subtle)' : undefined }}>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.55 }}>{item.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bases Notion */}
      <div style={cardStyle}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Database size={15} color="var(--accent)" />
          <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Bases Notion</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
          {NOTION_BASES.map((db, i) => (
            <div key={db.label} style={{ padding: '16px 20px', borderRight: i < NOTION_BASES.length - 1 ? '1px solid var(--border-subtle)' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: db.color, flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-secondary)' }}>{db.label}</span>
              </div>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 6, wordBreak: 'break-all' }}>
                {db.id ? db.id.slice(0, 8) + '…' : <span style={{ fontStyle: 'italic' }}>via env</span>}
              </div>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginBottom: 8 }}>
                <code style={{ background: 'var(--bg-input)', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>{db.env}</code>
              </div>
              {db.id && (
                <a href={notionUrl(db.id)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-2xs)', color: 'var(--accent)', textDecoration: 'none' }}>
                  Ouvrir <ExternalLink size={10} />
                </a>
              )}
              {!db.id && (
                <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}>ID via variable Vercel</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* DB Review */}
      <div style={cardStyle}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 2 }}>🩺 DB Review</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                Qualité des données Notion · {activeProjects.length} projets actifs · {clients.length} clients
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
              <KpiStat value={counts.critical} label="Critical" color="#ef4444" icon={AlertOctagon} />
              <KpiStat value={counts.warning} label="Warning" color="#facc15" icon={AlertTriangle} />
              <KpiStat value={countOk} label="OK" color="#4ade80" icon={CheckCircle2} />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['critical', 'warning', 'all'] as const).map(l => (
              <button key={l} onClick={() => setLevelFilter(l)} style={segBtnStyle(levelFilter === l)}>
                {{ critical: 'Critical', warning: 'Warning', all: 'Tous' }[l]}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 18, background: 'var(--border-subtle)', margin: '0 4px' }} />
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'projects', 'clients'] as const).map(s => (
              <button key={s} onClick={() => setSourceFilter(s)} style={segBtnStyle(sourceFilter === s)}>
                {{ all: 'Tout', projects: 'Projects', clients: 'Clients' }[s]}
              </button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{filtered.length} issue{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Issues table */}
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', fontStyle: 'italic' }}>
            🎉 Aucun problème dans cette catégorie
          </div>
        ) : (
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-xs)' }}>
              <thead>
                <tr style={{ background: 'var(--bg-input)' }}>
                  <th style={{ padding: '8px 20px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--fs-2xs)', textTransform: 'uppercase', letterSpacing: '0.06em', width: 80 }}>Niveau</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--fs-2xs)', textTransform: 'uppercase', letterSpacing: '0.06em', width: 80 }}>Source</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--fs-2xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Entité</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--fs-2xs)', textTransform: 'uppercase', letterSpacing: '0.06em', width: 120 }}>Champ</th>
                  <th style={{ padding: '8px 20px 8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--fs-2xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Message</th>
                  <th style={{ padding: '8px 12px', width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((issue, idx) => {
                  const projectData = issue.source === 'projects'
                    ? projects.find(p => p.name === issue.entity || p.id === issue.entity) as unknown as Record<string, unknown> | undefined
                    : undefined
                  return (
                    <tr key={idx} style={{ borderTop: '1px solid var(--border-subtle)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <td style={{ padding: '8px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <IssueIcon level={issue.level} />
                          <span style={{ fontSize: 'var(--fs-2xs)', color: issue.level === 'critical' ? '#ef4444' : issue.level === 'warning' ? '#facc15' : '#60a5fa', fontWeight: 600, textTransform: 'capitalize' }}>
                            {issue.level}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{issue.source}</span>
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-primary)', maxWidth: 200 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.entity}</span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <code style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', background: 'var(--bg-input)', padding: '1px 5px', borderRadius: 3 }}>{issue.field}</code>
                      </td>
                      <td style={{ padding: '8px 20px 8px 12px', color: 'var(--text-muted)' }}>{issue.message}</td>
                      <td style={{ padding: '6px 12px' }}>
                        {projectData && (
                          <button
                            onClick={() => setGenericEdit({ entity: 'project', data: projectData })}
                            style={{ background: 'rgba(166,201,206,0.08)', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, padding: '2px 7px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                          >Edit+</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {genericEdit && (
        <GenericEditModal
          entity={genericEdit.entity}
          data={genericEdit.data}
          onSave={() => setGenericEdit(null)}
          onClose={() => setGenericEdit(null)}
        />
      )}

    </div>
  )
}
