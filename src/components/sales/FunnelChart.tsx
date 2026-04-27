'use client'

import { useState, useMemo } from 'react'
import type { Project } from '@/types/sales'
import { PIPELINE_COLS, CLOSED_WON } from '@/types/sales'

interface FunnelChartProps {
  projects: Project[]
}

type ViewMode = 'bars' | 'funnel'

// ── Data ──────────────────────────────────────────────────────────────────

const FUNNEL_STEPS = [...PIPELINE_COLS.map(c => c.status), 'Won']

const STEP_LABELS: Record<string, string> = {
  Lead: 'Lead', Qualified: 'Qualifié', Scoping: 'Scoping',
  'Proposal Sent': 'Proposition', Negotiation: 'Négociation',
  'Verbal Commitment': 'Verbal', Won: 'Won',
}

const PIPELINE_ORDER: Record<string, number> = {
  Lead: 0, Qualified: 1, Scoping: 2, 'Proposal Sent': 3,
  Negotiation: 4, 'Verbal Commitment': 5, Won: 6, Active: 6, Completed: 6,
}

function interpolateColor(t: number): string {
  const r = Math.round(0x53 + (0x1d - 0x53) * t)
  const g = Math.round(0x4a + (0x9e - 0x4a) * t)
  const b = Math.round(0xb7 + (0x75 - 0xb7) * t)
  return `rgb(${r},${g},${b})`
}

interface StepData { status: string; label: string; count: number; color: string }

function buildFunnelData(projects: Project[]): StepData[] {
  return FUNNEL_STEPS.map((step, i) => {
    const stepOrder = step === 'Won' ? 6 : (PIPELINE_ORDER[step] ?? 0)
    const count = projects.filter(p => {
      const pOrder = CLOSED_WON.has(p.status) ? 6 : (PIPELINE_ORDER[p.status] ?? -1)
      return pOrder >= stepOrder
    }).length
    return { status: step, label: STEP_LABELS[step] ?? step, count, color: interpolateColor(i / (FUNNEL_STEPS.length - 1)) }
  })
}

// ── Toggle button ─────────────────────────────────────────────────────────

function Btn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 11px', fontSize: 12, fontWeight: active ? 600 : 400,
      borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
      border: active ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
      background: active ? 'var(--accent-soft)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
      transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5,
    }}>
      {children}
    </button>
  )
}

// ── Bars view (original) ──────────────────────────────────────────────────

function StepBar({ step, maxCount, convRate, isLast }: { step: StepData; maxCount: number; convRate: string | null; isLast: boolean }) {
  const widthPct = maxCount > 0 ? Math.max(4, (step.count / maxCount) * 100) : 4
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 96, flexShrink: 0, textAlign: 'right' }}>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{step.label}</span>
        </div>
        <div style={{ flex: 1, position: 'relative', height: 32 }}>
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

// ── Funnel (trapezoid SVG) view ───────────────────────────────────────────

function TrapezoidFunnel({ steps, maxCount }: { steps: StepData[]; maxCount: number }) {
  const W = 280
  const ROW_H = 40
  const CONV_H = 18
  const STEP_H = ROW_H + CONV_H
  const svgH = steps.length * STEP_H - CONV_H + 4
  const LABEL_W = 80
  const TOTAL_W = LABEL_W + W + 4

  return (
    <svg
      viewBox={`0 0 ${TOTAL_W} ${svgH}`}
      style={{ width: '100%', display: 'block' }}
    >
      {steps.map((step, i) => {
        const pTop = maxCount > 0 ? Math.max(0.1, step.count / maxCount) : 0.1
        const nextStep = steps[i + 1]
        const pBot = nextStep
          ? (maxCount > 0 ? Math.max(0.1, nextStep.count / maxCount) : 0.1)
          : Math.max(0.08, pTop - 0.04)

        const topW = pTop * W
        const botW = pBot * W
        const cx = LABEL_W + W / 2
        const x0 = cx - topW / 2
        const x1 = cx + topW / 2
        const x2 = cx + botW / 2
        const x3 = cx - botW / 2
        const y = i * STEP_H + 2

        const convRate = i > 0 && steps[i - 1].count > 0
          ? Math.round((step.count / steps[i - 1].count) * 100)
          : null

        return (
          <g key={step.status}>
            {/* Conversion rate above */}
            {convRate !== null && (
              <text x={cx} y={y - 4} textAnchor="middle" fontSize={10} fill="#4b5563">
                ↓ {convRate}%
              </text>
            )}

            {/* Trapezoid */}
            <path
              d={`M ${x0},${y} L ${x1},${y} L ${x2},${y + ROW_H} L ${x3},${y + ROW_H} Z`}
              fill={step.color}
              opacity={0.88}
            />

            {/* Label inside */}
            <text x={cx} y={y + ROW_H / 2 + 5} textAnchor="middle" fontSize={12} fontWeight={600} fill="white">
              {step.count}
            </text>

            {/* Step name on left */}
            <text x={LABEL_W - 8} y={y + ROW_H / 2 + 5} textAnchor="end" fontSize={11} fill="#94a3b8" fontWeight={500}>
              {step.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────

export function FunnelChart({ projects }: FunnelChartProps) {
  const [mode, setMode] = useState<ViewMode>('bars')
  const steps = useMemo(() => buildFunnelData(projects), [projects])
  const maxCount = steps.reduce((acc, s) => Math.max(acc, s.count), 0)

  if (projects.length === 0) {
    return <div style={{ width: '100%', height: 280, borderRadius: 12, background: 'var(--bg-page)', opacity: 0.5 }} />
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <Btn active={mode === 'bars'} onClick={() => setMode('bars')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="3" width="10" height="2.5" rx="1" fill="currentColor"/>
            <rect x="1" y="7" width="7" height="2.5" rx="1" fill="currentColor"/>
            <rect x="1" y="11" width="4" height="2.5" rx="1" fill="currentColor"/>
          </svg>
          Histogramme
        </Btn>
        <Btn active={mode === 'funnel'} onClick={() => setMode('funnel')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 2h12L9 7v4l-4-2V7L1 2z" fill="currentColor" opacity="0.9"/>
          </svg>
          Entonnoir
        </Btn>
      </div>

      {mode === 'bars' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {steps.map((step, i) => {
            const prev = steps[i - 1]
            const convRate = prev && prev.count > 0 ? ((step.count / prev.count) * 100).toFixed(0) : null
            return <StepBar key={step.status} step={step} maxCount={maxCount} convRate={convRate} isLast={i === steps.length - 1} />
          })}
        </div>
      ) : (
        <TrapezoidFunnel steps={steps} maxCount={maxCount} />
      )}
    </div>
  )
}

export default FunnelChart
