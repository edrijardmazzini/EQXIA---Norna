'use client'

import { useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'
import type { Project } from '@/types/sales'
import { CLOSED_WON, STATUS_COLORS, winFactor, fmtCurrency } from '@/types/sales'

interface ForecastChartProps {
  projects: Project[]
}

type Mode = 'best' | 'weighted'

const MOIS_NOMS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

const PIPELINE_STATUSES = ['Lead', 'Qualified', 'Scoping', 'Proposal Sent', 'Negotiation', 'Verbal Commitment'] as const

type PipelineStatus = typeof PIPELINE_STATUSES[number]

interface MonthDatum {
  label: string
  yearMonth: string
  Lead: number
  Qualified: number
  Scoping: number
  'Proposal Sent': number
  Negotiation: number
  'Verbal Commitment': number
  Won: number
  deals: Record<string, Project[]>
}

interface TooltipPayload {
  name: string
  value: number
  fill: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
  allData: MonthDatum[]
}

interface ToggleBtnProps {
  m: Mode
  label: string
  current: Mode
  onClick: (m: Mode) => void
}

function ToggleBtn({ m, label, current, onClick }: ToggleBtnProps) {
  const active = current === m
  return (
    <button
      onClick={() => onClick(m)}
      style={{
        padding: '4px 12px',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        borderRadius: 6,
        border: active ? '1px solid #A6C9CE' : '1px solid #2a2a3e',
        background: active ? '#A6C9CE22' : 'transparent',
        color: active ? '#A6C9CE' : '#64748b',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}

function buildForecastData(projects: Project[], mode: Mode): MonthDatum[] {
  const now = new Date()
  const months: MonthDatum[] = []

  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const year = d.getFullYear()
    const month = d.getMonth()
    const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`
    const label = `${MOIS_NOMS[month]} ${String(year).slice(2)}`

    const datum: MonthDatum = {
      label,
      yearMonth,
      Lead: 0,
      Qualified: 0,
      Scoping: 0,
      'Proposal Sent': 0,
      Negotiation: 0,
      'Verbal Commitment': 0,
      Won: 0,
      deals: {
        Lead: [],
        Qualified: [],
        Scoping: [],
        'Proposal Sent': [],
        Negotiation: [],
        'Verbal Commitment': [],
        Won: [],
      },
    }

    for (const p of projects) {
      const closeDate = p.expectedCloseDate || p.decisionDate
      if (!closeDate) continue
      const [cy, cm] = closeDate.split('-')
      if (!cy || !cm) continue
      const dealYM = `${cy}-${cm.padStart(2, '0')}`
      if (dealYM !== yearMonth) continue

      const amount = mode === 'weighted'
        ? (p.quotedAmount || p.finalAmount) * winFactor(p)
        : (p.quotedAmount || p.finalAmount)

      if (CLOSED_WON.has(p.status)) {
        datum.Won += amount
        datum.deals['Won'].push(p)
      } else if ((PIPELINE_STATUSES as readonly string[]).includes(p.status)) {
        const s = p.status as PipelineStatus
        datum[s] += amount
        datum.deals[s].push(p)
      }
    }

    months.push(datum)
  }

  return months
}

function CustomTooltip({ active, payload, label, allData }: CustomTooltipProps) {
  if (!active || !payload?.length) return null

  const monthData = allData.find(d => d.label === label)
  if (!monthData) return null

  const activeStatuses = payload
    .filter(p => p.value > 0)
    .map(p => p.name)

  return (
    <div style={{
      background: '#1a1a2e',
      border: '1px solid #2a2a3e',
      borderRadius: 8,
      padding: '10px 14px',
      minWidth: 200,
      maxWidth: 280,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#e2e8f0' }}>{label}</div>
      {activeStatuses.map(status => {
        const deals = monthData.deals[status] || []
        if (!deals.length) return null
        return (
          <div key={status} style={{ marginBottom: 8 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: STATUS_COLORS[status] || '#94a3b8',
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {status}
            </div>
            {deals.map(d => (
              <div key={d.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                fontSize: 12,
                color: '#cbd5e1',
                paddingLeft: 8,
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                  {d.name}
                </span>
                <span style={{ flexShrink: 0, color: '#94a3b8' }}>
                  {fmtCurrency(d.quotedAmount || d.finalAmount, d.currency)}
                </span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export default function ForecastChart({ projects }: ForecastChartProps) {
  const [mode, setMode] = useState<Mode>('weighted')

  const data = useMemo(
    () => buildForecastData(projects, mode),
    [projects, mode],
  )

  if (projects.length === 0) {
    return (
      <div style={{
        width: '100%',
        height: 320,
        borderRadius: 12,
        background: '#1e1e2e',
        animation: 'pulse 2s infinite',
      }} />
    )
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <ToggleBtn m='best' label='Best Case' current={mode} onClick={setMode} />
        <ToggleBtn m='weighted' label='Pondéré' current={mode} onClick={setMode} />
      </div>
      <ResponsiveContainer width='100%' height={320}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <XAxis
            dataKey='label'
            tick={{ fill: '#64748b', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => fmtCurrency(v as number)}
            width={64}
          />
          <Tooltip
            content={(props) => (
              <CustomTooltip
                active={props.active}
                payload={props.payload as unknown as TooltipPayload[] | undefined}
                label={props.label as string | undefined}
                allData={data}
              />
            )}
            cursor={{ fill: '#ffffff08' }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
            formatter={(value) => (
              <span style={{ color: '#94a3b8' }}>{value}</span>
            )}
          />
          <Bar dataKey='Won' stackId='a' fill='#4ade80' name='Won' radius={[0, 0, 0, 0]} />
          {PIPELINE_STATUSES.map((s, i) => (
            <Bar
              key={s}
              dataKey={s}
              stackId='a'
              fill={STATUS_COLORS[s]}
              name={s}
              radius={i === PIPELINE_STATUSES.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export { ForecastChart }
