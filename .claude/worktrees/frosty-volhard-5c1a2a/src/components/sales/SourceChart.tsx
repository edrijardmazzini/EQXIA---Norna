'use client'

import type { Project } from '@/types/sales'
import { CLOSED_WON, CLOSED_LOST, fmtCurrency, winFactor } from '@/types/sales'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts'

interface Props {
  projects: Project[]
}

interface SourceData {
  source: string
  count: number
  winRate: number
  pipeline: number
  weighted: number
  won: number
  lost: number
}

function winRateColor(rate: number): string {
  if (rate >= 50) return '#10b981'
  if (rate >= 30) return '#f59e0b'
  return '#ef4444'
}

function computeSourceData(projects: Project[]): SourceData[] {
  const map = new Map<string, SourceData>()

  for (const deal of projects) {
    const src = deal.sourceLead?.trim()
    if (!src) continue

    if (!map.has(src)) {
      map.set(src, { source: src, count: 0, winRate: 0, pipeline: 0, weighted: 0, won: 0, lost: 0 })
    }
    const entry = map.get(src)!
    entry.count++

    if (CLOSED_WON.has(deal.status)) {
      entry.won++
    } else if (CLOSED_LOST.has(deal.status)) {
      entry.lost++
    } else {
      entry.pipeline += deal.quotedAmount || 0
      entry.weighted += (deal.quotedAmount || 0) * winFactor(deal)
    }
  }

  for (const entry of map.values()) {
    const resolved = entry.won + entry.lost
    entry.winRate = resolved > 0 ? Math.round((entry.won / resolved) * 100) : 0
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

interface TooltipPayload {
  payload?: SourceData
}

function SourceTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  if (!d) return null

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 24,
    fontSize: 12,
    color: 'var(--color-text, #e5e7eb)',
    marginTop: 3,
  }
  const mutedStyle: React.CSSProperties = { color: 'var(--color-muted, #6b7280)' }

  return (
    <div style={{
      background: 'var(--color-surface, #1a1a2e)',
      border: '1px solid var(--color-border, #2d2d44)',
      borderRadius: 8,
      padding: '10px 14px',
      minWidth: 200,
    }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text, #e5e7eb)', marginBottom: 6 }}>
        {d.source}
      </div>
      <div style={rowStyle}>
        <span style={mutedStyle}>Deals</span>
        <span>{d.count}</span>
      </div>
      <div style={rowStyle}>
        <span style={mutedStyle}>Win rate</span>
        <span style={{ color: winRateColor(d.winRate), fontWeight: 600 }}>{d.winRate}%</span>
      </div>
      <div style={rowStyle}>
        <span style={mutedStyle}>Pipeline actif</span>
        <span>{fmtCurrency(d.pipeline)}</span>
      </div>
      <div style={rowStyle}>
        <span style={mutedStyle}>Forecast pondéré</span>
        <span>{fmtCurrency(d.weighted)}</span>
      </div>
      <div style={rowStyle}>
        <span style={mutedStyle}>Gagnés / Perdus</span>
        <span>{d.won} / {d.lost}</span>
      </div>
    </div>
  )
}

export function SourceChart({ projects }: Props) {
  const data = computeSourceData(projects)

  if (data.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 200,
        color: 'var(--color-muted, #6b7280)',
        fontSize: 14,
      }}>
        Aucune donnée
      </div>
    )
  }

  const barHeight = 36
  const chartHeight = Math.max(200, data.length * (barHeight + 16) + 40)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted, #6b7280)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Nombre de deals par source
        </div>
        <ResponsiveContainer width='100%' height={chartHeight}>
          <BarChart
            data={data}
            layout='vertical'
            margin={{ top: 4, right: 48, bottom: 4, left: 100 }}
          >
            <CartesianGrid strokeDasharray='3 3' stroke='#ffffff0f' horizontal={false} />
            <XAxis
              type='number'
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <YAxis
              type='category'
              dataKey='source'
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={96}
            />
            <Tooltip content={<SourceTooltip />} cursor={{ fill: '#ffffff06' }} />
            <Bar dataKey='count' radius={[0, 4, 4, 0]} maxBarSize={barHeight}>
              <LabelList
                dataKey='count'
                position='right'
                style={{ fill: '#9ca3af', fontSize: 11 }}
              />
              {data.map((entry, i) => (
                <Cell key={i} fill='#A6C9CE' fillOpacity={0.7} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted, #6b7280)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Win rate par source (%)
        </div>
        <ResponsiveContainer width='100%' height={chartHeight}>
          <BarChart
            data={data}
            layout='vertical'
            margin={{ top: 4, right: 48, bottom: 4, left: 100 }}
          >
            <CartesianGrid strokeDasharray='3 3' stroke='#ffffff0f' horizontal={false} />
            <XAxis
              type='number'
              domain={[0, 100]}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              unit='%'
            />
            <YAxis
              type='category'
              dataKey='source'
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={96}
            />
            <Tooltip content={<SourceTooltip />} cursor={{ fill: '#ffffff06' }} />
            <Bar dataKey='winRate' radius={[0, 4, 4, 0]} maxBarSize={barHeight}>
              <LabelList
                dataKey='winRate'
                position='right'
                formatter={(v: unknown) => `${v}%`}
                style={{ fill: '#9ca3af', fontSize: 11 }}
              />
              {data.map((entry, i) => (
                <Cell key={i} fill={winRateColor(entry.winRate)} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
