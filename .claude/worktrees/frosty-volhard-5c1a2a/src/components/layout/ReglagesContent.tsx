'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot,
} from 'recharts'
import { Database, ExternalLink } from 'lucide-react'
import { DEFAULT_LOADING_TEXTS, LOADING_WORDS_KEY } from '@/components/eqxia/EqxiaLoadingScreen'

// ─── Types ──────────────────────────────────────────────────────────────────

type DateFieldKey = 'endDate' | 'startDate' | 'decisionDate'
type WinPref = 'gut-then-auto' | 'auto-then-gut' | 'gut-only' | 'auto-only'

interface Settings {
  dateField: DateFieldKey
  conversionDateField: DateFieldKey
  winPref: WinPref
}

interface Project {
  id: string; name: string; currency: string; quotedAmount: number; finalAmount: number
  startDate: string; endDate: string; decisionDate?: string; clientName: string
}

interface RatePoint { date: string; rate: number }

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = { dateField: 'endDate', conversionDateField: 'endDate', winPref: 'gut-then-auto' }
const STORAGE_KEY = 'concordia-reglages-v1'

const DATE_FIELD_OPTIONS: { value: DateFieldKey; label: string; notionField: string }[] = [
  { value: 'endDate', label: 'End Date', notionField: 'End Date' },
  { value: 'startDate', label: 'Start Date', notionField: 'Start Date' },
  { value: 'decisionDate', label: 'Decision Date (sales)', notionField: 'Decision Date' },
]

const WIN_PREF_LABEL: Record<WinPref, string> = {
  'gut-then-auto': 'Gut feeling, fallback Auto',
  'auto-then-gut': 'Auto, fallback Gut feeling',
  'gut-only': 'Gut feeling uniquement',
  'auto-only': 'Auto uniquement',
}

const CURRENCY_OPTIONS = ['EUR', 'USD', 'GBP', 'KES', 'ZAR'] as const
type CurrencyCode = typeof CURRENCY_OPTIONS[number]

const TIMEFRAME_OPTIONS: { value: number; label: string }[] = [
  { value: 365, label: '1 an' }, { value: 180, label: '6 mois' }, { value: 90, label: '3 mois' },
  { value: 30, label: '1 mois' }, { value: 7, label: '1 semaine' }, { value: 1, label: '1 jour' },
]

const NOTION_BASES_PLUTUS: { label: string; env: string; id?: string; color: string }[] = [
  { label: 'Projects', env: 'NOTION_PROJECTS_DB_ID', id: '15933668-ad6e-49ea-902b-1c6bc2bce3dc', color: '#3b82f6' },
  { label: 'Dépenses', env: 'NOTION_DEPENSES_DB_ID', id: '5a6559c5-fb2e-4074-a9f3-046f1b563827', color: '#ef4444' },
  { label: 'Employees', env: 'NOTION_EMPLOYEES_DB_ID', id: '107cb251-a49b-45c3-806e-b0edf20f44ec', color: '#f59e0b' },
  { label: 'Clients', env: 'NOTION_CLIENTS_DB_ID', id: '1c4a4860-b36e-4ca2-a243-57446accbe53', color: '#10b981' },
]

function notionUrl(id: string) { return `https://notion.so/${id.replace(/-/g, '')}` }

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { return DEFAULT_SETTINGS }
}

function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(s) }))
  } catch { /* ignore */ }
}

// ─── UI helpers ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', padding: 20 }}>
      <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, margin: 0, marginBottom: 16, color: 'var(--text-primary)' }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </section>
  )
}

function SubBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingLeft: 12, borderLeft: '2px solid var(--border-subtle)' }}>
      <h3 style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, margin: 0, marginBottom: 6, color: 'var(--text-primary)' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
    </div>
  )
}

function Seg<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[]
}) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 'var(--radius-btn)', padding: 2 }}>
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '4px 10px', fontSize: 'var(--fs-2xs)', fontWeight: 600,
          background: value === v ? 'var(--accent-soft)' : 'transparent',
          color: value === v ? 'var(--accent)' : 'var(--text-secondary)',
          border: 'none', borderRadius: 'calc(var(--radius-btn) - 2px)', cursor: 'pointer', fontFamily: 'inherit',
        }}>{label}</button>
      ))}
    </div>
  )
}

const paragraphStyle: React.CSSProperties = { fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }
const listStyle: React.CSSProperties = { fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0, paddingLeft: 20, lineHeight: 1.6 }
const codeStyle: React.CSSProperties = { background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 4, fontSize: 'var(--fs-2xs)', fontFamily: 'monospace', color: 'var(--accent)' }
const selectStyle: React.CSSProperties = { width: '100%', maxWidth: 420, padding: '8px 12px', fontSize: 'var(--fs-sm)', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 'var(--radius-input)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }
const hintStyle: React.CSSProperties = { fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: '4px 0 0' }
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 16px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 'var(--fs-2xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }
const tdStyle: React.CSSProperties = { padding: '8px 16px', color: 'var(--text-primary)' }

// ─── Component ──────────────────────────────────────────────────────────────

export function ReglagesContent() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  useEffect(() => { setSettings(loadSettings()) }, [])

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => { const next = { ...prev, [key]: value }; saveSettings(next); return next })
  }, [])

  // ─── Mots de chargement ───────────────────────────────────────────────────
  const [loadingWords, setLoadingWords] = useState<string[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_LOADING_TEXTS
    try {
      const raw = localStorage.getItem(LOADING_WORDS_KEY)
      if (!raw) return [...DEFAULT_LOADING_TEXTS]
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) && parsed.length > 0 ? (parsed as string[]) : [...DEFAULT_LOADING_TEXTS]
    } catch { return [...DEFAULT_LOADING_TEXTS] }
  })
  const [newWord, setNewWord] = useState('')

  function saveWords(words: string[]) {
    setLoadingWords(words)
    try { localStorage.setItem(LOADING_WORDS_KEY, JSON.stringify(words)) } catch { /* ignore */ }
  }

  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => setProjects(d.projects || []))
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoading(false))
  }, [])

  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('EUR')
  const [selectedDays, setSelectedDays] = useState<number>(180)
  const [historyByCurrency, setHistoryByCurrency] = useState<Record<string, RatePoint[]>>({})
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    setHistoryLoading(true)
    let cancelled = false
    Promise.all(
      CURRENCY_OPTIONS.map(c =>
        fetch(`/api/rates/history?currency=${c}&days=${selectedDays}`)
          .then(r => r.json())
          .then((d: { points?: RatePoint[] }) => ({ currency: c, points: d.points ?? [] }))
          .catch(() => ({ currency: c, points: [] as RatePoint[] })),
      ),
    ).then(entries => {
      if (cancelled) return
      const map: Record<string, RatePoint[]> = {}
      for (const e of entries) map[e.currency] = e.points
      setHistoryByCurrency(map)
    }).finally(() => { if (!cancelled) setHistoryLoading(false) })
    return () => { cancelled = true }
  }, [selectedDays])

  const history = useMemo(() => historyByCurrency[selectedCurrency] || [], [historyByCurrency, selectedCurrency])

  const getProjectDate = useCallback((p: Project): string => {
    return p[settings.conversionDateField as keyof Project] as string || p.endDate || p.startDate || ''
  }, [settings.conversionDateField])

  function findRateInSeries(series: RatePoint[], iso: string): { rate: number; matched: string } | null {
    if (!iso || series.length === 0) return null
    let best: RatePoint | null = null
    for (const pt of series) { if (pt.date <= iso) best = pt; else break }
    if (!best) best = series[0]
    return { rate: best.rate, matched: best.date }
  }

  const convertedProjects = useMemo(() => {
    return projects
      .filter(p => p.currency && p.currency !== 'MUR')
      .map(p => {
        const date = getProjectDate(p)
        const amount = (p.finalAmount && p.finalAmount > 0) ? p.finalAmount : (p.quotedAmount || 0)
        const series = historyByCurrency[p.currency] || []
        const found = findRateInSeries(series, date)
        const rate = found?.rate ?? 0
        const matched = found?.matched ?? ''
        return { ...p, date, amount, rate, matched, converted: amount * rate, isMatchedExact: matched === date }
      })
      .filter(p => p.amount > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [projects, historyByCurrency, getProjectDate])

  const referenceDots = useMemo(() => {
    const inWindow = new Set(history.map(h => h.date))
    return convertedProjects
      .filter(p => p.currency === selectedCurrency && p.date && inWindow.has(p.matched))
      .map(p => ({ date: p.matched, rate: p.rate, name: p.name, amount: p.amount, currency: p.currency }))
      .slice(0, 200)
  }, [convertedProjects, history, selectedCurrency])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Bases Notion Concordia */}
      <Section title="🗄️ Bases Notion — Concordia">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, margin: '-14px -20px -20px', borderTop: '1px solid var(--border-subtle)' }}>
          {NOTION_BASES_PLUTUS.map((db, i) => (
            <div key={db.label} style={{ padding: '16px 20px', borderRight: i < NOTION_BASES_PLUTUS.length - 1 ? '1px solid var(--border-subtle)' : undefined }}>
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
            </div>
          ))}
        </div>
      </Section>

      {/* Règles de calcul */}
      <Section title="📐 Règles de calcul des revenus">
        <p style={paragraphStyle}>
          Le revenu d&apos;un projet est calculé par <code style={codeStyle}>computeProjectRevenue(p)</code> dans{' '}
          <code style={codeStyle}>src/app/page.tsx</code>. Source unique de vérité — tous les autres helpers en dérivent.
        </p>
        <SubBlock title="Catégorisation past / future">
          <p style={paragraphStyle}>
            La date de référence (champ Notion <strong>{DATE_FIELD_OPTIONS.find(o => o.value === settings.dateField)?.notionField}</strong>) sert à classer le projet :
          </p>
          <ul style={listStyle}>
            <li><strong>Actual</strong> (passé) — date ≤ mois courant. Revenu réalisé.</li>
            <li><strong>Forecast</strong> (futur) — date &gt; mois courant. Revenu prévisionnel.</li>
            <li><strong>Forecast sans date</strong> — si <code style={codeStyle}>quotedAmount × winRate &gt; 0</code>, dossier défaulté à <strong>mois courant + 3</strong>.</li>
          </ul>
        </SubBlock>
        <SubBlock title="Calcul du CA">
          <ul style={listStyle}>
            <li><strong>Actual</strong> : <code style={codeStyle}>finalAmount</code> si renseigné, sinon <code style={codeStyle}>quotedAmount</code>.</li>
            <li><strong>Forecast</strong> : <code style={codeStyle}>finalAmount</code> si renseigné, sinon <code style={codeStyle}>quotedAmount × winRate</code>.</li>
          </ul>
        </SubBlock>
        <SubBlock title="winRate — préférence actuelle">
          <p style={paragraphStyle}>Stratégie : <strong>{WIN_PREF_LABEL[settings.winPref]}</strong>.</p>
          <ul style={listStyle}>
            <li><code style={codeStyle}>gut-then-auto</code> : prend <code style={codeStyle}>winPercent</code> si &gt; 0, sinon <code style={codeStyle}>winAuto</code>.</li>
            <li><code style={codeStyle}>auto-then-gut</code> : prend <code style={codeStyle}>winAuto</code> si &gt; 0, sinon <code style={codeStyle}>winPercent</code>.</li>
            <li><code style={codeStyle}>gut-only</code> / <code style={codeStyle}>auto-only</code> : un seul des deux.</li>
          </ul>
        </SubBlock>
        <SubBlock title="Commission et revenu net">
          <p style={paragraphStyle}>
            Commission appliquée si <code style={codeStyle}>commissionTo</code> renseigné ET <code style={codeStyle}>commissionPercent &gt; 0</code> :{' '}
            <code style={codeStyle}>Net = CA − CA × commissionRate</code>.
          </p>
        </SubBlock>
      </Section>

      {/* Réglages dynamiques */}
      <Section title="⚙️ Réglages dynamiques">
        <p style={paragraphStyle}>Persisté en localStorage par utilisateur. Affecte la classification past/future et la conversion.</p>
        <Field label="Date de prise en compte (past/future)">
          <select value={settings.dateField} onChange={e => updateSetting('dateField', e.target.value as DateFieldKey)} style={selectStyle}>
            {DATE_FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} (Notion : {o.notionField})</option>)}
          </select>
          <p style={hintStyle}>Champ Notion utilisé pour décider si un projet est passé (actual) ou futur (forecast).</p>
        </Field>
        <Field label="Date du taux de conversion">
          <select value={settings.conversionDateField} onChange={e => updateSetting('conversionDateField', e.target.value as DateFieldKey)} style={selectStyle}>
            {DATE_FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p style={hintStyle}>Date à laquelle on prend le taux historique pour convertir un montant en MUR.</p>
        </Field>
        <Field label="Préférence de winRate">
          <select value={settings.winPref} onChange={e => updateSetting('winPref', e.target.value as WinPref)} style={selectStyle}>
            {(Object.entries(WIN_PREF_LABEL) as [WinPref, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <p style={hintStyle}>Quel champ utiliser pour pondérer les forecasts.</p>
        </Field>
      </Section>

      {/* Taux de conversion */}
      <Section title="💱 Taux de conversion">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>Devise :</span>
          <Seg value={selectedCurrency} onChange={v => setSelectedCurrency(v)} options={CURRENCY_OPTIONS.map(c => [c, c] as const)} />
          <span style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>Période :</span>
          <Seg value={String(selectedDays)} onChange={v => setSelectedDays(Number(v))} options={TIMEFRAME_OPTIONS.map(t => [String(t.value), t.label] as const)} />
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 4 }}>
            {selectedCurrency} → MUR · {TIMEFRAME_OPTIONS.find(t => t.value === selectedDays)?.label}
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: 12 }}>
            Source : Frankfurter (ECB) × open.er-api.com · Points = projets convertis dans la fenêtre
          </div>
          {historyLoading ? (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Chargement…</div>
          ) : history.length === 0 ? (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Aucune donnée historique</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={history} margin={{ left: 10, right: 10 }}>
                <defs>
                  <linearGradient id="gRate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#A6C9CE" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#A6C9CE" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.08)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(1)} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 6, fontSize: 'var(--fs-xs)' }}
                  formatter={(v) => [Number(v).toFixed(3), 'MUR']}
                />
                <Area type="monotone" dataKey="rate" stroke="#A6C9CE" strokeWidth={2} fill="url(#gRate)" dot={false} />
                {referenceDots.map((d, i) => (
                  <ReferenceDot key={`${d.date}-${i}`} x={d.date} y={d.rate} r={5} fill="#f97316" stroke="var(--bg-card)" strokeWidth={2} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Projets convertis</div>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
              {convertedProjects.length} projet{convertedProjects.length !== 1 ? 's' : ''} en devise étrangère · taux au champ <strong>{DATE_FIELD_OPTIONS.find(o => o.value === settings.conversionDateField)?.notionField}</strong>
            </div>
          </div>
          {projectsLoading ? (
            <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>Chargement projets…</div>
          ) : convertedProjects.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>Aucun projet en devise étrangère</div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-xs)' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', borderBottom: '1px solid var(--border-subtle)' } as React.CSSProperties}>
                    <th style={thStyle}>Projet</th>
                    <th style={thStyle}>Client</th>
                    <th style={thStyle}>Devise</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Montant</th>
                    <th style={thStyle}>Date prise</th>
                    <th style={thStyle}>Date taux</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Taux MUR</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Converti MUR</th>
                  </tr>
                </thead>
                <tbody>
                  {convertedProjects.map(p => {
                    const isHighlighted = p.currency === selectedCurrency
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid rgba(166,201,206,0.05)', background: isHighlighted ? 'rgba(166,201,206,0.04)' : 'transparent' }}>
                        <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                        <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{p.clientName || '—'}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', color: isHighlighted ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: isHighlighted ? 600 : 500 }}>{p.currency}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', textAlign: 'right' }}>{Math.round(p.amount).toLocaleString('fr-FR')}</td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.date || '—'}</td>
                        <td style={{ ...tdStyle, color: p.isMatchedExact ? 'var(--text-secondary)' : 'var(--color-warning)', fontFamily: 'monospace', fontSize: 'var(--fs-2xs)' }}>{p.matched || '—'}{!p.isMatchedExact && p.matched ? ' ≈' : ''}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', textAlign: 'right' }}>{p.rate > 0 ? p.rate.toFixed(3) : '—'}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}>{p.converted > 0 ? Math.round(p.converted).toLocaleString('fr-FR') : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      <details style={{ opacity: 0.5, marginTop: 8 }}>
        <summary style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9 }}>▸</span>
          mots de chargement
          <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>{loadingWords.length} mots</span>
        </summary>
        <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
          {/* Tags éditables */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 6px', marginBottom: 10 }}>
            {loadingWords.map((w, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                borderRadius: 4, padding: '2px 6px', fontSize: 'var(--fs-2xs)', fontFamily: 'monospace',
                color: 'var(--text-secondary)',
              }}>
                {w}…
                <button
                  onClick={() => saveWords(loadingWords.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 10, padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}
                  title="Supprimer"
                >×</button>
              </span>
            ))}
          </div>
          {/* Ajout */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={newWord}
              onChange={e => setNewWord(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newWord.trim()) {
                  saveWords([...loadingWords, newWord.trim()])
                  setNewWord('')
                }
              }}
              placeholder="Nouveau mot…"
              style={{ flex: 1, fontSize: 'var(--fs-2xs)', background: 'var(--bg-page)', border: '1px solid var(--border-input)', borderRadius: 4, color: 'var(--text-primary)', padding: '4px 8px', fontFamily: 'inherit', outline: 'none' }}
            />
            <button
              onClick={() => { if (newWord.trim()) { saveWords([...loadingWords, newWord.trim()]); setNewWord('') } }}
              style={{ fontSize: 'var(--fs-2xs)', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--accent)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
            >+ Ajouter</button>
            <button
              onClick={() => saveWords([...DEFAULT_LOADING_TEXTS])}
              style={{ fontSize: 'var(--fs-2xs)', background: 'none', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit' }}
              title="Réinitialiser aux mots par défaut"
            >Réinitialiser</button>
          </div>
        </div>
      </details>
    </div>
  )
}
