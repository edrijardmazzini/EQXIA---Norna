'use client'

import { useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  FunnelChart as RFunnelChart,
  Funnel,
  LabelList,
  Tooltip,
} from 'recharts'
import type { Project } from '@/types/sales'
import { PIPELINE_COLS, CLOSED_WON, fmtCurrency } from '@/types/sales'

interface FunnelChartProps { projects: Project[] }
type ViewMode = 'funnel' | 'bars'

// ── Data helpers ───────────────────────────────────────────────────────────

function gutFactor(p: Project): number {
  const v = p.winPercent > 1 ? p.winPercent / 100 : (p.winPercent || 0)
  return Math.min(1, Math.max(0, v))
}

// Non-cumulative snapshot: deals AT each stage, width = CA × gut%
function buildFunnelData(projects: Project[]) {
  const stages = PIPELINE_COLS.map(col => {
    const deals = projects.filter(p => p.status === col.status)
    const value = deals.reduce((s, d) => s + (d.quotedAmount || 0) * gutFactor(d), 0)
    return { name: col.label, status: col.status, value, count: deals.length, fill: col.accent }
  })
  const wonDeals = projects.filter(p => CLOSED_WON.has(p.status))
  const wonVal = wonDeals.reduce((s, d) => s + (d.finalAmount || d.quotedAmount || 0), 0)
  stages.push({ name: 'Won ✓', status: 'Won', value: wonVal, count: wonDeals.length, fill: '#4ade80' })
  return stages
}

// Cumulative: all deals that have reached at least each stage (bars view)
const STEP_LABELS: Record<string, string> = {
  Lead: 'Lead', Qualified: 'Qualifié', Scoping: 'Scoping',
  'Proposal Sent': 'Proposition', Negotiation: 'Négociation',
  'Verbal Commitment': 'Verbal', Won: 'Won',
}
const PIPELINE_ORDER: Record<string, number> = {
  Lead: 0, Qualified: 1, Scoping: 2, 'Proposal Sent': 3,
  Negotiation: 4, 'Verbal Commitment': 5, Won: 6, Active: 6, Completed: 6,
}
function interpolateColor(t: number) {
  return `rgb(${Math.round(0x53 + (0x1d - 0x53) * t)},${Math.round(0x4a + (0x9e - 0x4a) * t)},${Math.round(0xb7 + (0x75 - 0xb7) * t)})`
}
function buildBarsData(projects: Project[]) {
  const steps = [...PIPELINE_COLS.map(c => c.status), 'Won']
  return steps.map((step, i) => {
    const stepOrder = step === 'Won' ? 6 : (PIPELINE_ORDER[step] ?? 0)
    const count = projects.filter(p => {
      const pOrder = CLOSED_WON.has(p.status) ? 6 : (PIPELINE_ORDER[p.status] ?? -1)
      return pOrder >= stepOrder
    }).length
    return { status: step, label: STEP_LABELS[step] ?? step, count, color: interpolateColor(i / (steps.length - 1)) }
  })
}

// ── Toggle button ──────────────────────────────────────────────────────────

function Btn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 11px', fontSize: 12, fontWeight: active ? 600 : 400, borderRadius: 6,
      cursor: 'pointer', fontFamily: 'inherit',
      border: active ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
      background: active ? 'var(--accent-soft)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
      transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5,
    }}>
      {children}
    </button>
  )
}

// ── Bars view ──────────────────────────────────────────────────────────────

function StepBar({ step, maxCount, convRate, isLast }: {
  step: { label: string; count: number; color: string }
  maxCount: number; convRate: string | null; isLast: boolean
}) {
  const widthPct = maxCount > 0 ? Math.max(4, (step.count / maxCount) * 100) : 4
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 96, flexShrink: 0, textAlign: 'right' }}>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{step.label}</span>
        </div>
        <div style={{ flex: 1, height: 32 }}>
          <div style={{ width: `${widthPct}%`, height: '100%', background: step.color, borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 10, boxSizing: 'border-box', transition: 'width 0.4s ease' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>{step.count}</span>
          </div>
        </div>
      </div>
      {!isLast && convRate !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2, marginBottom: 2 }}>
          <div style={{ width: 96, flexShrink: 0 }} />
          <div style={{ flex: 1, paddingLeft: 10 }}>
            <span style={{ fontSize: 11, color: '#4b5563' }}>↓ {convRate}%</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

export function FunnelChart({ projects }: FunnelChartProps) {
  const [mode, setMode] = useState<ViewMode>('funnel')

  const funnelData = useMemo(() => buildFunnelData(projects), [projects])
  const barsData = useMemo(() => buildBarsData(projects), [projects])
  const maxCount = barsData.reduce((acc, s) => Math.max(acc, s.count), 0)

  if (projects.length === 0) {
    return <div style={{ width: '100%', height: 280, borderRadius: 12, background: 'var(--bg-page)', opacity: 0.5 }} />
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <Btn active={mode === 'funnel'} onClick={() => setMode('funnel')}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1 1.5h11L8.5 6v4.5L4.5 9V6L1 1.5z" fill="currentColor"/>
          </svg>
          Entonnoir
        </Btn>
        <Btn active={mode === 'bars'} onClick={() => setMode('bars')}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="2" width="9" height="2.5" rx="1" fill="currentColor"/>
            <rect x="1" y="6" width="6.5" height="2.5" rx="1" fill="currentColor"/>
            <rect x="1" y="10" width="4" height="2.5" rx="1" fill="currentColor"/>
          </svg>
          Histogramme
        </Btn>
      </div>

      {mode === 'funnel' ? (
        <ResponsiveContainer width="100%" height={320}>
          <RFunnelChart margin={{ top: 8, right: 175, left: 8, bottom: 8 }}>
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as (typeof funnelData)[0]
                return (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 12px', fontSize: 'var(--fs-xs)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>{d.name}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>{d.count} deal{d.count !== 1 ? 's' : ''}</div>
                    {d.value > 0 && <div style={{ color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>CA×gut {fmtCurrency(d.value)}</div>}
                  </div>
                )
              }}
            />
            <Funnel data={funnelData} dataKey="value" isAnimationActive lastShapeType="rectangle">
              <LabelList
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={(props: any) => {
                  const item = funnelData[props.index as number]
                  if (!item) return null
                  const lx = (props.x ?? 0) + (props.width ?? 0) + 8
                  const my = (props.y ?? 0) + (props.height ?? 0) / 2
                  return (
                    <g key={String(props.index)}>
                      <text x={lx} y={my - 5} fill="var(--text-secondary)" fontSize={11} fontWeight={600}>
                        {item.name}
                        <tspan fill="var(--text-muted)" fontWeight={400}> ({item.count})</tspan>
                      </text>
                      <text x={lx} y={my + 9} fill="var(--accent)" fontSize={10}>
                        {item.value > 0 ? fmtCurrency(item.value) : '—'}
                      </text>
                    </g>
                  )
                }}
              />
            </Funnel>
          </RFunnelChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {barsData.map((step, i) => {
            const prev = barsData[i - 1]
            const convRate = prev && prev.count > 0 ? ((step.count / prev.count) * 100).toFixed(0) : null
            return <StepBar key={step.status} step={step} maxCount={maxCount} convRate={convRate} isLast={i === barsData.length - 1} />
          })}
        </div>
      )}
    </div>
  )
}

export default FunnelChart
