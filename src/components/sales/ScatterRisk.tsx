'use client'

import { useMemo, useCallback } from 'react'
import type { Project } from '@/types/sales'
import { PIPELINE_COLS, fmtCurrency, winFactor } from '@/types/sales'

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type ScatterShapeProps,
} from 'recharts'

interface Props {
  projects: Project[]
  onDealClick?: (deal: Project) => void
}

interface ScatterPoint {
  x: number
  y: number
  z: number
  deal: Project
}

const PIPELINE_STATUSES = new Set(PIPELINE_COLS.map((c) => c.status))

function healthColor(health: string): string {
  if (health.includes('✅')) return '#4ade80'
  if (health.includes('⚠️')) return '#f97316'
  if (health.includes('❌')) return '#ef4444'
  return '#6b7280'
}

interface TooltipPayload {
  payload?: ScatterPoint
}

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  if (!d) return null
  const { deal } = d
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 'var(--fs-sm)',
      color: 'var(--text-primary)',
      maxWidth: 220,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{deal.name}</div>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 2 }}>{deal.clientName || '—'}</div>
      <div>{fmtCurrency(deal.quotedAmount, deal.currency)}</div>
      <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
        {d.x} jour{d.x !== 1 ? 's' : ''} dans l'étape
      </div>
      <div style={{ color: healthColor(deal.health) }}>Win : {d.y}%</div>
    </div>
  )
}

export function ScatterRisk({ projects, onDealClick }: Props) {
  const points = useMemo<ScatterPoint[]>(() =>
    projects
      .filter((p) => PIPELINE_STATUSES.has(p.status))
      .map((deal) => ({
        x: Math.min(deal.daysInCurrentStage ?? 0, 60),
        y: Math.round(winFactor(deal) * 100),
        z: deal.quotedAmount > 0 ? deal.quotedAmount : 1,
        deal,
      })),
    [projects],
  )

  const handleClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (entry: any) => {
      const point = entry as ScatterPoint
      if (onDealClick && point?.deal) onDealClick(point.deal)
    },
    [onDealClick],
  )

  if (points.length === 0) {
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
        Aucun deal pipeline actif.
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
        marginBottom: 4,
      }}>
        Carte de risque — ancienneté × probabilité
      </div>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: 16 }}>
        Taille = montant · Couleur = health
      </div>
      <ResponsiveContainer width='100%' height={320}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid stroke='var(--border-subtle)' />
          <XAxis
            type='number'
            dataKey='x'
            name='Jours'
            domain={[0, 60]}
            label={{ value: 'Jours dans l\'étape', position: 'insideBottom', offset: -12, fill: 'var(--text-muted)', fontSize: 11 }}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type='number'
            dataKey='y'
            name='Win %'
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <ZAxis type='number' dataKey='z' range={[30, 400]} />
          <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter
            data={points}
            onClick={handleClick}
            style={{ cursor: onDealClick ? 'pointer' : 'default' }}
            shape={(props: ScatterShapeProps) => {
              const { cx = 0, cy = 0, payload } = props
              const point = payload as unknown as ScatterPoint
              const z = (point?.z as number) ?? 30
              const r = Math.max(4, Math.sqrt(z / Math.PI) * 0.18)
              const color = healthColor(point?.deal?.health ?? '')
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={color}
                  fillOpacity={0.75}
                  stroke={color}
                  strokeWidth={1}
                />
              )
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

export default ScatterRisk
