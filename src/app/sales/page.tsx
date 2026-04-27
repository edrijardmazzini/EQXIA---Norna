'use client'

import { useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AppHeader } from '@/components/layout/AppHeader'
import { Spinner } from '@/components/ui/Spinner'
import { useProjectsData } from '@/hooks/useProjectsData'
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
import { useEffect } from 'react'

type Tab = 'pipeline' | 'forecast' | 'clients'

const SATISFACTION_SCORES: Record<string, number> = {
  'Very Satisfied': 4, Satisfied: 3, Neutral: 2, Dissatisfied: 1,
}

export default function SalesPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const { projects, clients, employees, loading, error, reload } = useProjectsData()
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

  useEffect(() => {
    setLocalProjects(projects)
  }, [projects])

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
    const recent = localProjects.filter(p => new Date(p.created) >= cutoff)
    const won = recent.filter(p => CLOSED_WON.has(p.status)).length
    const lost = recent.filter(p => CLOSED_LOST.has(p.status)).length
    return won + lost > 0 ? Math.round(won / (won + lost) * 100) : 0
  }, [localProjects])

  const ownerOptions = useMemo(() => {
    const s = new Set(localProjects.map(p => p.ownerName).filter(Boolean))
    return Array.from(s).sort()
  }, [localProjects])

  // ── Client data ───────────────────────────────────────────────────────────

  const allSectors = useMemo(() => {
    const s = new Set<string>()
    clients.forEach(c => c.sectors.forEach(sec => s.add(sec)))
    return Array.from(s).sort()
  }, [clients])

  const filteredClients = useMemo(() => {
    let list = [...clients]
    if (clientSectorFilter) list = list.filter(c => c.sectors.includes(clientSectorFilter))
    if (clientSatisfactionFilter) list = list.filter(c => c.satisfaction === clientSatisfactionFilter)
    if (clientHealthFilter) list = list.filter(c => c.health.includes(clientHealthFilter))
    if (clientUpsellFilter) list = list.filter(c => c.upXsellPotential === clientUpsellFilter)
    if (clientSort === 'ltv') list.sort((a, b) => b.lifetimeValue - a.lifetimeValue)
    if (clientSort === 'projects') {
      list.sort((a, b) => {
        const aCount = localProjects.filter(p => p.clientIds.some(id => id === a.id) && !CLOSED_WON.has(p.status) && !CLOSED_LOST.has(p.status)).length
        const bCount = localProjects.filter(p => p.clientIds.some(id => id === b.id) && !CLOSED_WON.has(p.status) && !CLOSED_LOST.has(p.status)).length
        return bCount - aCount
      })
    }
    return list
  }, [clients, clientSectorFilter, clientSatisfactionFilter, clientHealthFilter, clientUpsellFilter, clientSort, localProjects])

  function activeDealsForClient(clientId: string): number {
    return localProjects.filter(p => p.clientIds.includes(clientId) && !CLOSED_WON.has(p.status) && !CLOSED_LOST.has(p.status)).length
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border-input)',
    borderRadius: 'var(--radius-input)', padding: '5px 10px',
    fontSize: 'var(--fs-xs)', color: 'var(--text-primary)',
  }

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-secondary)', fontSize: 'var(--fs-base)' }}>
        <Spinner />
        Chargement du pipeline…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: 'var(--color-error)' }}>Erreur : {error}</div>
        <button onClick={reload} style={{ padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-btn)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Réessayer</button>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <AppHeader
        appName="Sales"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a href="/" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', textDecoration: 'none', padding: '4px 10px', borderRadius: 'var(--radius-btn)', border: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}>
              ← Finance
            </a>
          </div>
        }
      />

      {/* Tab bar */}
      <div style={{ padding: '0 24px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 0, alignItems: 'center' }}>
        {(['pipeline', 'forecast', 'clients'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '12px 20px', fontSize: 'var(--fs-sm)', background: 'none', border: 'none', cursor: 'pointer',
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'color 0.15s', fontFamily: 'inherit',
            }}
          >
            {{ pipeline: 'Pipeline', forecast: 'Prévisionnel', clients: 'Clients' }[t]}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingRight: 4 }}>
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} style={{ ...inputStyle }}>
            <option value="">Tous les owners</option>
            {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <div style={{ padding: 24 }}>

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', padding: 20 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 4 }}>Prévisionnel 6 mois</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: 16 }}>Basé sur Expected Close Date</div>
                <ForecastChart projects={localProjects} />
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', padding: 20 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 16 }}>Funnel de conversion</div>
                <FunnelChart projects={localProjects} />
              </div>
            </div>

            {/* Heatmap + Velocity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', padding: 20 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 4 }}>Deals stagnants</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: 16 }}>Par étape × ancienneté</div>
                <StaleHeatmap projects={localProjects} />
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', padding: 20 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 4 }}>Velocity par étape</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: 16 }}>Temps moyen en jours (deals Won)</div>
                <VelocityChart projects={localProjects} />
              </div>
            </div>

            {/* Analytics row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', padding: 20 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 16 }}>Win/Loss par type</div>
                <WinLossBySegment projects={localProjects} />
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', padding: 20 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 16 }}>Performance par owner</div>
                <OwnerPerformance projects={localProjects} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', padding: 20 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 4 }}>Priorité × Ancienneté</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: 16 }}>Taille = montant · Couleur = health</div>
                <ScatterRisk projects={localProjects} />
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', padding: 20 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 16 }}>Cohortes par mois de création</div>
                <CohortChart projects={localProjects} />
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', padding: 20 }}>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 16 }}>Source d&apos;acquisition</div>
              <SourceChart projects={localProjects} />
            </div>
          </div>
        )}

        {/* ── Tab Clients ──────────────────────────────────────────────────── */}
        {tab === 'clients' && (
          <div>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={clientSectorFilter} onChange={e => setClientSectorFilter(e.target.value)} style={{ ...inputStyle, padding: '6px 10px' }}>
                <option value="">Tous les secteurs</option>
                {allSectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={clientSatisfactionFilter} onChange={e => setClientSatisfactionFilter(e.target.value)} style={{ ...inputStyle, padding: '6px 10px' }}>
                <option value="">Satisfaction</option>
                {['Very Satisfied', 'Satisfied', 'Neutral', 'Dissatisfied'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={clientHealthFilter} onChange={e => setClientHealthFilter(e.target.value)} style={{ ...inputStyle, padding: '6px 10px' }}>
                <option value="">Health</option>
                <option value="OK">✅ OK</option>
                <option value="Warning">⚠️ Warning</option>
                <option value="Critical">❌ Critical</option>
              </select>
              <select value={clientUpsellFilter} onChange={e => setClientUpsellFilter(e.target.value)} style={{ ...inputStyle, padding: '6px 10px' }}>
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
                  activeDealsCount={activeDealsForClient(client.id)}
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
      </div>

      {/* Client detail panel */}
      {selectedClient && (
        <ClientDetail
          client={selectedClient}
          projects={localProjects}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </div>
  )
}
