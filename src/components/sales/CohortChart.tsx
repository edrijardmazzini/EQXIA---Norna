'use client'

import { useMemo } from 'react'
import type { Project } from '@/types/sales'
import { STATUS_COLORS, fmtCurrency } from '@/types/sales'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface Props {
  projects: Project[]
}

interface CohortRow {
  month: string
  label: string
  [status: string]: string | number
}

interface TooltipPayload {
  name: string
  value: number
  color: string
}

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  const idx = parseInt(m, 10) - 1
  return `${MONTH_LABELS[idx] ?? m} ${y.slice(2)}`
}

function last12Months(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    months.push(`${y}-${m}`)
  }
  return months
}

function CohortTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 'var(--fs-sm)',
      color: 'var(--text-primary)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: entry.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--text-secondary)' }}>{entry.name}</span>
          <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export function CohortChart({ projects }: Props) {
  const { rows, statuses } = useMemo(() => {
    const months = last12Months()
    const monthSet = new Set(months)

    const grouped = new Map<string, Map<string, number>>()
    for (const m of months) grouped.set(m, new Map())

    for (const p of projects) {
      if (!p.created) continue
      const ym = p.created.slice(0, 7)
      if (!monthSet.has(ym)) continue
      const bucket = grouped.get(ym)!
      bucket.set(p.status, (bucket.get(p.status) ?? 0) + 1)
    }

    const statusSet = new Set<string>()
    for (const [, bucket] of grouped) {
      for (const [s] of bucket) statusSet.add(s)
    }
    const statusList = Array.from(statusSet)

    const rows: CohortRow[] = months.map((ym) => {
      const bucket = grouped.get(ym)!
      const row: CohortRow = { month: ym, label: formatMonthLabel(ym) }
      for (const s of statusList) row[s] = bucket.get(s) ?? 0
      return row
    })

    return { rows, statuses: statusList }
  }, [projects])

  const hasData = rows.some((r) => statuses.some((s) => (r[s] as number) > 0))

  if (!hasData) {
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
        Aucun deal créé sur les 12 derniers mois.
      </div>
    )
  }

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
        Cohortes de création — 12 derniers mois
      </div>
      <ResponsiveContainer width='100%' height={280}>
        <BarChart data={rows} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke='var(--border-subtle)' />
          <XAxis
            dataKey='label'
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CohortTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          {statuses.map((status, i) => (
            <Bar
              key={status}
              dataKey={status}
              stackId='cohort'
              fill={STATUS_COLORS[status] ?? '#6b7280'}
              maxBarSize={32}
              radius={i === statuses.length - 1 ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px 14px',
        marginTop: 12,
      }}>
        {statuses.map((s) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: STATUS_COLORS[s] ?? '#6b7280',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CohortChart
