'use client'

import { useMemo } from 'react'
import type { Project } from '@/types/sales'
import { CLOSED_WON, CLOSED_LOST } from '@/types/sales'
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

interface SegmentData {
  type: string
  won: number
  lost: number
  winRate: number
}

function buildData(projects: Project[]): SegmentData[] {
  const map = new Map<string, { won: number; lost: number }>()

  for (const p of projects) {
    if (!CLOSED_WON.has(p.status) && !CLOSED_LOST.has(p.status)) continue
    if (!p.type) continue
    const entry = map.get(p.type) ?? { won: 0, lost: 0 }
    if (CLOSED_WON.has(p.status)) entry.won += 1
    else entry.lost += 1
    map.set(p.type, entry)
  }

  return Array.from(map.entries())
    .map(([type, { won, lost }]) => ({
      type,
      won,
      lost,
      winRate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0,
    }))
    .sort((a, b) => b.winRate - a.winRate)
}

function barColor(rate: number): string {
  if (rate > 50) return '#4ade80'
  if (rate >= 30) return '#f97316'
  return '#ef4444'
}

interface TooltipPayload {
  payload?: SegmentData
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  if (!d) return null
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 'var(--fs-sm)',
      color: 'var(--text-primary)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.type}</div>
      <div style={{ color: '#4ade80' }}>Won : {d.won}</div>
      <div style={{ color: '#ef4444' }}>Lost : {d.lost}</div>
      <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Win rate : {d.winRate}%</div>
    </div>
  )
}

export function WinLossBySegment({ projects }: Props) {
  const data = useMemo(() => buildData(projects), [projects])

  if (data.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-card)',
        padding: 24,
        color: 'var(--text-muted)',
        fontSize: 'var(--fs-sm)',
        textAlign: 'center',
      }}>
        Aucune donnée Won / Lost disponible.
      </div>
    )
  }

  const barHeight = 36
  const chartHeight = data.length * barHeight + 40

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-card)',
      padding: 20,
    }}>
      <div style={{
        fontSize: 'var(--fs-sm)',
        fontWeight: 600,
        color: 'var(--text-primary)',
        marginBottom: 16,
      }}>
        Win rate par type de deal
      </div>
      <ResponsiveContainer width='100%' height={chartHeight}>
        <BarChart
          data={data}
          layout='vertical'
          margin={{ top: 0, right: 48, bottom: 0, left: 96 }}
        >
          <CartesianGrid horizontal={false} stroke='var(--border-subtle)' />
          <XAxis
            type='number'
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type='category'
            dataKey='type'
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={90}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey='winRate' radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((entry) => (
              <Cell key={entry.type} fill={barColor(entry.winRate)} />
            ))}
            <LabelList
              dataKey='winRate'
              position='right'
              formatter={(v: unknown) => `${v as number}%`}
              style={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default WinLossBySegment
