'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { BarChart2, LineChart as LineChartIcon } from 'lucide-react'
import type { Project } from '@/types/sales'
import { TYPE_COLORS, CLOSED_WON, fmtCurrency } from '@/types/sales'

interface ForecastChartProps {
  projects: Project[]
}

type WeightMode = 'gut' | 'auto'
type ChartType = 'line' | 'bar'
type Period = '3m' | '6m' | '12m' | 'fy'

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
const TOTAL_COLOR = '#e2e8f0'
const AXIS_TICK_STYLE = { fill: 'var(--text-muted)', fontSize: 11 }

function getWeight(p: Project, mode: WeightMode): number {
  const raw = mode === 'auto'
    ? (p.winAuto > 1 ? p.winAuto / 100 : p.winAuto)
    : (p.winPercent > 1 ? p.winPercent / 100 : p.winPercent)
  return Math.min(1, Math.max(0, raw))
}

function getPeriodMonths(period: Period): { ym: string; label: string }[] {
  const now = new Date()
  if (period === 'fy') {
    const y = now.getFullYear(), m = now.getMonth() + 1
    const fyStart = m >= 7 ? y : y - 1
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(fyStart, 6 + i, 1)
      return {
        ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: `${MOIS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      }
    })
  }
  const count = period === '3m' ? 3 : period === '6m' ? 6 : 12
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    return {
      ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${MOIS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
    }
  })
}

interface MonthDatum {
  label: string
  _total: number
  _deals: Record<string, Project[]>
  [type: string]: number | string | Record<string, Project[]>
}

interface BuildResult {
  months: MonthDatum[]
  types: string[]
  totalCAGut: number
  totalCAAuto: number
  totalRevGut: number
  totalRevAuto: number
}

function buildData(projects: Project[], mode: WeightMode, period: Period): BuildResult {
  const ymLabels = getPeriodMonths(period)
  const ymSet = new Set(ymLabels.map(m => m.ym))
  const fallbackYM = ymLabels[Math.min(2, ymLabels.length - 1)].ym
  const typesSet = new Set<string>()

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
    if (ymSet.has(resolveYM(p))) typesSet.add(p.type)
  }

  const types = Array.from(typesSet).sort()

  // Compute summary totals in one pass — always both modes
  let totalCAGut = 0, totalCAAuto = 0, totalRevGut = 0, totalRevAuto = 0
  for (const p of projects) {
    if (!p.type || !typesSet.has(p.type)) continue
    if (!ymSet.has(resolveYM(p))) continue
    const caBase = p.quotedAmount || 0
    const revBase = p.finalAmount || p.quotedAmount || 0
    const wGut = CLOSED_WON.has(p.status) ? 1 : getWeight(p, 'gut')
    const wAuto = CLOSED_WON.has(p.status) ? 1 : getWeight(p, 'auto')
    totalCAGut += caBase * wGut
    totalCAAuto += caBase * wAuto
    totalRevGut += revBase * wGut
    totalRevAuto += revBase * wAuto
  }

  const months: MonthDatum[] = ymLabels.map(({ ym, label }) => {
    const datum: MonthDatum = { label, _total: 0, _deals: Object.fromEntries(types.map(t => [t, []])) }
    for (const t of types) datum[t] = 0

    for (const p of projects) {
      if (!p.type || !typesSet.has(p.type)) continue
      if (resolveYM(p) !== ym) continue
      const weight = CLOSED_WON.has(p.status) ? 1 : getWeight(p, mode)
      const amount = (p.quotedAmount || p.finalAmount || 0) * weight
      ;(datum[p.type] as number) += amount
      datum._total += amount
      ;(datum._deals as Record<string, Project[]>)[p.type].push(p)
    }

    return datum
  })

  return { months, types, totalCAGut, totalCAAuto, totalRevGut, totalRevAuto }
}

// ── Btn ──────────────────────────────────────────────────────────────────────

function Btn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', fontSize: 12, fontWeight: active ? 600 : 400, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
      border: active ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
      background: active ? 'var(--accent-soft)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
      transition: 'all 0.15s',
    }}>
      {children}
    </button>
  )
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipEntry { name: string; value: number; color: string }

function ForecastTooltip({ active, payload, label, allData }: {
  active?: boolean; payload?: TooltipEntry[]; label?: string; allData: MonthDatum[]
}) {
  if (!active || !payload?.length) return null
  const monthData = allData.find(d => d.label === label)

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
      borderRadius: 8, padding: '10px 14px', minWidth: 200, maxWidth: 320, fontSize: 'var(--fs-xs)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>{label}</div>
      {payload.filter(e => e.value > 0 && e.name !== '_total').map(entry => {
        const deals = monthData ? (monthData._deals as Record<string, Project[]>)[entry.name] || [] : []
        return (
          <div key={entry.name} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, color: entry.color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
              {entry.name} — {fmtCurrency(entry.value)}
            </div>
            {deals.map(d => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, paddingLeft: 8, color: 'var(--text-secondary)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{d.name}</span>
                <span style={{ flexShrink: 0, color: 'var(--text-muted)' }}>{fmtCurrency(d.quotedAmount || d.finalAmount, d.currency)}</span>
              </div>
            ))}
          </div>
        )
      })}
      {payload.find(e => e.name === '_total') && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 6, marginTop: 4 }}>
          <div style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: TOTAL_COLOR }}>
            Total — {fmtCurrency(payload.find(e => e.name === '_total')!.value)}
          </div>
        </div>
      )}
    </div>
  )
}

function legendFormatter(v: string) {
  if (v === '_total') return <span style={{ color: TOTAL_COLOR, fontWeight: 600 }}>Total</span>
  return <span style={{ color: 'var(--text-secondary)' }}>{v}</span>
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function ForecastChart({ projects }: ForecastChartProps) {
  const [weightMode, setWeightMode] = useState<WeightMode>('gut')
  const [chartType, setChartType] = useState<ChartType>('line')
  const [period, setPeriod] = useState<Period>('6m')
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const { months, types, totalCAGut, totalCAAuto, totalRevGut, totalRevAuto } = useMemo(
    () => buildData(projects, weightMode, period),
    [projects, weightMode, period],
  )

  const tooltipContent = useCallback(
    (p: { active?: boolean; payload?: unknown; label?: unknown }) => (
      <ForecastTooltip
        active={p.active}
        payload={p.payload as TooltipEntry[]}
        label={p.label as string}
        allData={months}
      />
    ),
    [months],
  )

  if (projects.length === 0) {
    return <div style={{ width: '100%', height: 320, borderRadius: 8, background: 'var(--bg-page)', opacity: 0.5 }} />
  }

  const fyLabel = (() => {
    const now = new Date(); const y = now.getFullYear(), m = now.getMonth() + 1
    const s = m >= 7 ? y : y - 1; return `${s}-${String(s + 1).slice(-2)}`
  })()

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Header (Finance Dashboard style) ──────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Forecast pondéré — {period === 'fy' ? `FY ${fyLabel}` : period}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 'var(--fs-2xs)', fontFamily: 'monospace' }}>
            <span>
              <span style={{ color: '#A6C9CE', fontWeight: 700 }}>CA gut </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmtCurrency(totalCAGut)}</span>
            </span>
            <span>
              <span style={{ color: '#7BB3BE', fontWeight: 700 }}>CA auto </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmtCurrency(totalCAAuto)}</span>
            </span>
            <span>
              <span style={{ color: '#A6C9CE', fontWeight: 600 }}>Rev gut </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmtCurrency(totalRevGut)}</span>
            </span>
            <span>
              <span style={{ color: '#7BB3BE', fontWeight: 600 }}>Rev auto </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmtCurrency(totalRevAuto)}</span>
            </span>
          </div>
        </div>
        <button
          onClick={() => setChartType(t => t === 'line' ? 'bar' : 'line')}
          title={chartType === 'line' ? 'Vue histogramme' : 'Vue courbes'}
          style={{
            background: chartType === 'bar' ? 'var(--accent-soft)' : 'none',
            border: `1px solid ${chartType === 'bar' ? 'var(--accent)' : 'var(--border-subtle)'}`,
            borderRadius: 6, color: chartType === 'bar' ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer', width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          {chartType === 'line' ? <BarChart2 size={14} /> : <LineChartIcon size={14} />}
        </button>
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['3m', '6m', '12m', 'fy'] as Period[]).map(p => (
            <Btn key={p} active={period === p} onClick={() => setPeriod(p)}>
              {p === 'fy' ? `FY ${fyLabel}` : p}
            </Btn>
          ))}
        </div>
        <div style={{ width: 1, height: 18, background: 'var(--border-subtle)', margin: '0 4px' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn active={weightMode === 'gut'} onClick={() => setWeightMode('gut')}>% gut feeling</Btn>
          <Btn active={weightMode === 'auto'} onClick={() => setWeightMode('auto')}>% auto</Btn>
        </div>
      </div>

      {/* ── Chart ─────────────────────────────────────────────────────────── */}
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={months} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} tickFormatter={v => fmtCurrency(v as number)} width={72} />
          <Tooltip content={tooltipContent} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
            formatter={legendFormatter}
            onMouseEnter={e => setHoveredKey((e as { dataKey?: string }).dataKey ?? null)}
            onMouseLeave={() => setHoveredKey(null)}
          />

          {chartType === 'bar'
            ? types.map((t, i) => (
              <Bar key={t} dataKey={t} stackId="a" fill={TYPE_COLORS[t] || '#6b7280'} name={t}
                opacity={hoveredKey && hoveredKey !== t ? 0.2 : 1}
                radius={i === types.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            ))
            : types.map(t => (
              <Line key={t} type="monotone" dataKey={t} stroke={TYPE_COLORS[t] || '#6b7280'}
                strokeWidth={2} dot={{ r: 3, fill: TYPE_COLORS[t] || '#6b7280', strokeWidth: 0 }}
                activeDot={{ r: 5 }} name={t}
                strokeOpacity={hoveredKey && hoveredKey !== t ? 0.2 : 1} />
            ))
          }

          {/* Total line — always a Line regardless of chart type */}
          <Line
            type="monotone"
            dataKey="_total"
            stroke={TOTAL_COLOR}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 4, fill: TOTAL_COLOR, strokeWidth: 0 }}
            name="_total"
            strokeOpacity={hoveredKey && hoveredKey !== '_total' ? 0.2 : 1}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export default ForecastChart
