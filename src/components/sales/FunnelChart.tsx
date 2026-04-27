'use client'

import { useMemo } from 'react'
import type { Project } from '@/types/sales'
import { PIPELINE_COLS, CLOSED_WON } from '@/types/sales'

interface FunnelChartProps {
  projects: Project[]
}

const FUNNEL_STEPS = [
  ...PIPELINE_COLS.map(c => c.status),
  'Won',
]

const STEP_LABELS: Record<string, string> = {
  Lead: 'Lead',
  Qualified: 'Qualifié',
  Scoping: 'Scoping',
  'Proposal Sent': 'Proposition',
  Negotiation: 'Négociation',
  'Verbal Commitment': 'Verbal',
  Won: 'Won',
}

const PIPELINE_ORDER: Record<string, number> = {
  Lead: 0,
  Qualified: 1,
  Scoping: 2,
  'Proposal Sent': 3,
  Negotiation: 4,
  'Verbal Commitment': 5,
  Won: 6,
  Active: 6,
  Completed: 6,
}

function interpolateColor(t: number): string {
  const r0 = 0x53, g0 = 0x4a, b0 = 0xb7
  const r1 = 0x1d, g1 = 0x9e, b1 = 0x75
  const r = Math.round(r0 + (r1 - r0) * t)
  const g = Math.round(g0 + (g1 - g0) * t)
  const b = Math.round(b0 + (b1 - b0) * t)
  return `rgb(${r},${g},${b})`
}

interface StepData {
  status: string
  label: string
  count: number
  color: string
}

function buildFunnelData(projects: Project[]): StepData[] {
  return FUNNEL_STEPS.map((step, i) => {
    const stepOrder = step === 'Won' ? 6 : (PIPELINE_ORDER[step] ?? 0)
    const count = projects.filter(p => {
      const pOrder = CLOSED_WON.has(p.status)
        ? 6
        : (PIPELINE_ORDER[p.status] ?? -1)
      return pOrder >= stepOrder
    }).length

    return {
      status: step,
      label: STEP_LABELS[step] ?? step,
      count,
      color: interpolateColor(i / (FUNNEL_STEPS.length - 1)),
    }
  })
}

interface StepBarProps {
  step: StepData
  maxCount: number
  convRate: string | null
  isLast: boolean
}

function StepBar({ step, maxCount, convRate, isLast }: StepBarProps) {
  const widthPct = maxCount > 0 ? Math.max(4, (step.count / maxCount) * 100) : 4

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 96, flexShrink: 0, textAlign: 'right' }}>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>
            {step.label}
          </span>
        </div>
        <div style={{ flex: 1, position: 'relative', height: 32 }}>
          <div style={{
            width: `${widthPct}%`,
            height: '100%',
            background: step.color,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 10,
            boxSizing: 'border-box',
            transition: 'width 0.4s ease',
          }}>
            <span style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              whiteSpace: 'nowrap',
            }}>
              {step.count}
            </span>
          </div>
        </div>
      </div>
      {!isLast && convRate !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2, marginBottom: 2 }}>
          <div style={{ width: 96, flexShrink: 0 }} />
          <div style={{ flex: 1, paddingLeft: 10 }}>
            <span style={{ fontSize: 11, color: '#4b5563' }}>
              ↓ {convRate}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function FunnelChart({ projects }: FunnelChartProps) {
  const steps = useMemo(() => buildFunnelData(projects), [projects])
  const maxCount = steps.reduce((acc, s) => Math.max(acc, s.count), 0)

  if (projects.length === 0) {
    return (
      <div style={{
        width: '100%',
        height: 280,
        borderRadius: 12,
        background: '#1e1e2e',
        animation: 'pulse 2s infinite',
      }} />
    )
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {steps.map((step, i) => {
        const prev = steps[i - 1]
        const convRate = prev && prev.count > 0
          ? ((step.count / prev.count) * 100).toFixed(0)
          : null

        return (
          <StepBar
            key={step.status}
            step={step}
            maxCount={maxCount}
            convRate={convRate}
            isLast={i === steps.length - 1}
          />
        )
      })}
    </div>
  )
}

export { FunnelChart }
