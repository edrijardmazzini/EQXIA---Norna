'use client'

import { useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import type { Project } from '@/types/sales'
import { TYPE_COLORS, CLOSED_WON, fmtCurrency } from '@/types/sales'

interface ForecastChartProps {
  projects: Project[]
}

type WeightMode = 'auto' | 'gut'
type ChartType = 'line' | 'bar'

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

function getWeight(p: Project, mode: WeightMode): number {
  if (mode === 'auto') {
    const v = p.winAuto > 1 ? p.winAuto / 100 : p.winAuto
    return Math.min(1, Math.max(0, v))
  }
  const v = p.winPercent > 1 ? p.winPercent / 100 : p.winPercent
  return Math.min(1, Math.max(0, v))
}

interface MonthDatum {
  label: string
  [type: string]: number | string | Record<string, Project[]>
  _deals: Record<string, Project[]>
}

function buildData(projects: Project[], mode: WeightMode): { months: MonthDatum[]; types: string[] } {
  const now = new Date()
  const typesSet = new Set<string>()

  const ymLabels: { ym: string; label: string }[] = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    ymLabels.push({
      ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${MOIS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
    })
  }

  const fallbackD = new Date(now.getFullYear(), now.getMonth() + 3, 1)
  const fallbackYM = `${fallbackD.getFullYear()}-${String(fallbackD.getMonth() + 1).padStart(2, '0')}`

  function resolveYM(p: Project): string {
    const raw = p.expectedCloseDate || p.endDate
    if (raw) {
      const [cy, cm] = raw.split('-')
      if (cy && cm) return `${cy}-${cm.padStart(2, '0')}`
    }
    return fallbackYM
  }

  for (const p of projects) {
    if (!p.type) continue
    const ym = resolveYM(p)
    if (ymLabels.some(m => m.ym === ym)) typesSet.add(p.type)
  }

  const types = Array.from(typesSet).sort()

  const months: MonthDatum[] = ymLabels.map(({ ym, label }) => {
    const datum: MonthDatum = { label, _deals: Object.fromEntries(types.map(t => [t, []])) }
    for (const t of types) datum[t] = 0

    for (const p of projects) {
      if (!p.type || !typesSet.has(p.type)) continue
      if (resolveYM(p) !== ym) continue

      const weight = CLOSED_WON.has(p.status) ? 1 : getWeight(p, mode)
      const amount = (p.quotedAmount || p.finalAmount) * weight
      ;(datum[p.type] as number) += amount
      ;(datum._deals as Record<string, Project[]>)[p.type].push(p)
    }

    return datum
  })

  return { months, types }
}

// ── Ctrl button ─────────────────────────────────────────────────────────────

function Btn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 11px', fontSize: 12, fontWeight: active ? 600 : 400,
        borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
        border: active ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        transition: 'all 0.15s',
        display: 'flex', alignItems: 'center', gap: 5,
      }}
    >
      {children}
    </button>
  )
}

// ── Tooltip ─────────────────────────────────────────────────────────────────

interface TooltipEntry {
  name: string
  value: number
  color: string
}

function ForecastTooltip({
  active, payload, label, allData,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
  allData: MonthDatum[]
}) {
  if (!active || !payload?.length) return null
  const monthData = allData.find(d => d.label === label)

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
      borderRadius: 8, padding: '10px 14px', minWidth: 200, maxWidth: 300,
      fontSize: 'var(--fs-xs)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>{label}</div>
      {payload.filter(e => e.value > 0).map(entry => {
        const deals = monthData ? (monthData._deals as Record<string, Project[]>)[entry.name] || [] : []
        return (
          <div key={entry.name} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, color: entry.color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
              {entry.name} — {fmtCurrency(entry.value)}
            </div>
            {deals.map(d => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, paddingLeft: 8, color: 'var(--text-secondary)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{d.name}</span>
                <span style={{ flexShrink: 0, color: 'var(--text-muted)' }}>{fmtCurrency(d.quotedAmount || d.finalAmount, d.currency)}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function ForecastChart({ projects }: ForecastChartProps) {
  const [weightMode, setWeightMode] = useState<WeightMode>('auto')
  const [chartType, setChartType] = useState<ChartType>('line')

  const { months, types } = useMemo(
    () => buildData(projects, weightMode),
    [projects, weightMode],
  )

  if (projects.length === 0) {
    return <div style={{ width: '100%', height: 320, borderRadius: 8, background: 'var(--bg-page)', opacity: 0.5 }} />
  }

  const tooltipContent = (p: { active?: boolean; payload?: unknown; label?: unknown }) => (
    <ForecastTooltip
      active={p.active}
      payload={p.payload as TooltipEntry[]}
      label={p.label as string}
      allData={months}
    />
  )

  const sharedAxisStyle = { fill: 'var(--text-muted)', fontSize: 11 }
  const legendFormatter = (v: string) => <span style={{ color: 'var(--text-secondary)' }}>{v}</span>

  return (
    <div style={{ width: '100%' }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn active={weightMode === 'auto'} onClick={() => setWeightMode('auto')}>% auto</Btn>
          <Btn active={weightMode === 'gut'} onClick={() => setWeightMode('gut')}>% gut feeling</Btn>
        </div>
        <div style={{ width: 1, height: 18, background: 'var(--border-subtle)', margin: '0 4px' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn active={chartType === 'line'} onClick={() => setChartType('line')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <polyline points="1,12 5,5 8,8 13,2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" fill="none"/>
            </svg>
            Courbes
          </Btn>
          <Btn active={chartType === 'bar'} onClick={() => setChartType('bar')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="6" width="3" height="7" rx="1" fill="currentColor"/>
              <rect x="5.5" y="3" width="3" height="10" rx="1" fill="currentColor"/>
              <rect x="10" y="1" width="3" height="12" rx="1" fill="currentColor"/>
            </svg>
            Histogramme
          </Btn>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        {chartType === 'line' ? (
          <LineChart data={months} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="label" tick={sharedAxisStyle} axisLine={false} tickLine={false} />
            <YAxis tick={sharedAxisStyle} axisLine={false} tickLine={false} tickFormatter={v => fmtCurrency(v as number)} width={68} />
            <Tooltip content={tooltipContent} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} formatter={legendFormatter} />
            {types.map(t => (
              <Line
                key={t}
                type="monotone"
                dataKey={t}
                stroke={TYPE_COLORS[t] || '#6b7280'}
                strokeWidth={2}
                dot={{ r: 3, fill: TYPE_COLORS[t] || '#6b7280', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                name={t}
              />
            ))}
          </LineChart>
        ) : (
          <BarChart data={months} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="label" tick={sharedAxisStyle} axisLine={false} tickLine={false} />
            <YAxis tick={sharedAxisStyle} axisLine={false} tickLine={false} tickFormatter={v => fmtCurrency(v as number)} width={68} />
            <Tooltip content={tooltipContent} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} formatter={legendFormatter} />
            {types.map((t, i) => (
              <Bar
                key={t}
                dataKey={t}
                stackId="a"
                fill={TYPE_COLORS[t] || '#6b7280'}
                name={t}
                radius={i === types.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

export default ForecastChart
