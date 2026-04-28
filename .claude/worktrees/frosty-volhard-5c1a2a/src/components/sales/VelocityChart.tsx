'use client'

import { useMemo } from 'react'
import type { Project } from '@/types/sales'
import { PIPELINE_COLS, CLOSED_WON } from '@/types/sales'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

interface Props {
  projects: Project[]
}

interface StageData {
  label: string
  avgDays: number
  count: number
  accent: string
}

const STAGE_TRANSITIONS: {
  label: string
  from: keyof Project
  to: keyof Project
  accent: string
}[] = [
  { label: 'Lead → Qualifié', from: 'created', to: 'dateQualified', accent: '#3b82f6' },
  { label: 'Qualifié → Scoping', from: 'dateQualified', to: 'dateScoping', accent: '#8b5cf6' },
  { label: 'Scoping → Proposition', from: 'dateScoping', to: 'dateProposalSent', accent: '#f59e0b' },
  { label: 'Proposition → Négo', from: 'dateProposalSent', to: 'dateNegotiation', accent: '#ef4444' },
  { label: 'Négo → Verbal', from: 'dateNegotiation', to: 'dateVerbalCommitment', accent: '#10b981' },
  { label: 'Verbal → Clôturé', from: 'dateVerbalCommitment', to: 'dateClosed', accent: '#6b7280' },
]

function daysBetween(a: string, b: string): number | null {
  if (!a || !b) return null
  const msA = new Date(a).getTime()
  const msB = new Date(b).getTime()
  if (isNaN(msA) || isNaN(msB)) return null
  const diff = msB - msA
  if (diff < 0) return null
  return Math.round(diff / 86_400_000)
}

function computeStageData(projects: Project[]): StageData[] {
  const wonDeals = projects.filter(d => CLOSED_WON.has(d.status))

  return STAGE_TRANSITIONS.map(t => {
    const durations: number[] = []
    for (const deal of wonDeals) {
      const d = daysBetween(deal[t.from] as string, deal[t.to] as string)
      if (d !== null) durations.push(d)
    }
    const avgDays =
      durations.length > 0
        ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
        : 0
    return { label: t.label, avgDays, count: durations.length, accent: t.accent }
  }).filter(s => s.count > 0)
}

interface TooltipPayload {
  payload?: StageData
}

function VelocityTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  if (!d) return null
  return (
    <div style={{
      background: 'var(--color-surface, #1a1a2e)',
      border: '1px solid var(--color-border, #2d2d44)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
      color: 'var(--color-text, #e5e7eb)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.label}</div>
      <div>{d.avgDays} jours en moyenne</div>
      <div style={{ color: 'var(--color-muted, #6b7280)', marginTop: 2 }}>
        {d.count} deal{d.count > 1 ? 's' : ''}
      </div>
    </div>
  )
}

export function VelocityChart({ projects }: Props) {
  const data = useMemo(() => computeStageData(projects), [projects])

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

  return (
    <ResponsiveContainer width='100%' height={Math.max(200, data.length * 52)}>
      <BarChart
        data={data}
        layout='vertical'
        margin={{ top: 4, right: 40, bottom: 4, left: 120 }}
      >
        <CartesianGrid
          strokeDasharray='3 3'
          stroke='#ffffff0f'
          horizontal={false}
        />
        <XAxis
          type='number'
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          unit='j'
        />
        <YAxis
          type='category'
          dataKey='label'
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={116}
        />
        <Tooltip content={<VelocityTooltip />} cursor={{ fill: '#ffffff06' }} />
        <Bar dataKey='avgDays' radius={[0, 4, 4, 0]} maxBarSize={32}>
          {data.map(entry => (
            <Cell key={entry.label} fill={entry.accent} fillOpacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
