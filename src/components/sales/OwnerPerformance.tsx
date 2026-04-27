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
  Legend,
} from 'recharts'

interface Props {
  projects: Project[]
}

interface OwnerData {
  owner: string
  won: number
  active: number
  lost: number
  winRate: number
}

interface TooltipPayload {
  payload?: OwnerData
}

function OwnerTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
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
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.owner}</div>
      <div style={{ color: '#4ade80' }}>Won : {d.won}</div>
      <div style={{ color: '#8b5cf6' }}>Active / Pipeline : {d.active}</div>
      <div style={{ color: '#ef4444' }}>Lost : {d.lost}</div>
      <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Win rate : {d.winRate}%</div>
    </div>
  )
}

export function OwnerPerformance({ projects }: Props) {
  const data = useMemo<OwnerData[]>(() => {
    const map = new Map<string, { won: number; active: number; lost: number }>()

    for (const p of projects) {
      if (!p.ownerName) continue
      const entry = map.get(p.ownerName) ?? { won: 0, active: 0, lost: 0 }
      if (CLOSED_WON.has(p.status)) entry.won += 1
      else if (CLOSED_LOST.has(p.status)) entry.lost += 1
      else entry.active += 1
      map.set(p.ownerName, entry)
    }

    return Array.from(map.entries())
      .map(([owner, { won, active, lost }]) => {
        const closed = won + lost
        return {
          owner,
          won,
          active,
          lost,
          winRate: closed > 0 ? Math.round((won / closed) * 100) : 0,
        }
      })
      .sort((a, b) => b.won - a.won)
  }, [projects])

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
        Aucune donnée owner disponible.
      </div>
    )
  }

  const barHeight = 40
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
        Performance par owner
      </div>
      <ResponsiveContainer width='100%' height={chartHeight}>
        <BarChart
          data={data}
          layout='vertical'
          margin={{ top: 0, right: 16, bottom: 0, left: 100 }}
        >
          <CartesianGrid horizontal={false} stroke='var(--border-subtle)' />
          <XAxis
            type='number'
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type='category'
            dataKey='owner'
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={96}
          />
          <Tooltip content={<OwnerTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Legend
            wrapperStyle={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}
          />
          <Bar dataKey='won' name='Won' stackId='a' fill='#4ade80' maxBarSize={22} />
          <Bar dataKey='active' name='Active' stackId='a' fill='#8b5cf6' maxBarSize={22} />
          <Bar dataKey='lost' name='Lost' stackId='a' fill='#ef4444' maxBarSize={22} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default OwnerPerformance
