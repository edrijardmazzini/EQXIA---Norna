'use client'

import { useState, useMemo } from 'react'
import {
  FunnelChart as RechartsFunnel, Funnel, LabelList, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { Project } from '@/types/sales'
import { PIPELINE_COLS, CLOSED_WON, fmtCurrency } from '@/types/sales'

interface FunnelChartProps { projects: Project[] }
type ViewMode = 'funnel' | 'bars' | 'recharts' | 'bar-v'

// ── Data helpers ───────────────────────────────────────────────────────────

function gutFactor(p: Project): number {
  const v = p.winPercent > 1 ? p.winPercent / 100 : (p.winPercent || 0)
  return Math.min(1, Math.max(0, v))
}

// Non-cumulative: deals AT each stage, value = CA × gut%
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

// Cumulative: all deals that have reached at least each stage
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

// ── Entonnoir (CSS centré, largeur ∝ CA×gut) ────────────────────────────────

function FunnelStage({ stage, maxValue, isLast }: {
  stage: ReturnType<typeof buildFunnelData>[0]
  maxValue: number
  isLast: boolean
}) {
  const pct = maxValue > 0 ? Math.max(6, (stage.value / maxValue) * 100) : 6
  const [hovered, setHovered] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: `${pct}%`,
          height: 30,
          background: stage.fill,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'width 0.45s ease, opacity 0.15s',
          opacity: hovered ? 0.85 : 1,
          cursor: 'default',
          position: 'relative',
        }}
      >
        {stage.count > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
            {stage.count}
          </span>
        )}
        {hovered && (
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            marginTop: 6, zIndex: 10,
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            borderRadius: 8, padding: '7px 11px', fontSize: 'var(--fs-xs)',
            whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{stage.name}</div>
            <div style={{ color: 'var(--text-secondary)' }}>{stage.count} deal{stage.count !== 1 ? 's' : ''}</div>
            {stage.value > 0 && (
              <div style={{ color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>
                CA×gut {fmtCurrency(stage.value)}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{
        width: `${pct}%`, display: 'flex', justifyContent: 'space-between',
        padding: '2px 4px', boxSizing: 'border-box',
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {stage.name}
        </span>
        {stage.value > 0 && (
          <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 4 }}>
            {fmtCurrency(stage.value)}
          </span>
        )}
      </div>

      {!isLast && (
        <div style={{ height: 4, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `${stage.fill}33` }} />
        </div>
      )}
    </div>
  )
}

// ── Histogramme (barres CSS cumulatives) ───────────────────────────────────

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

// ── Vue recharts FunnelChart natif ─────────────────────────────────────────

function RechartsView({ funnelData }: { funnelData: ReturnType<typeof buildFunnelData> }) {
  const data = funnelData.filter(d => d.value > 0 || d.count > 0)
  return (
    <ResponsiveContainer width="100%" height={280}>
      <RechartsFunnel>
        <Tooltip
          contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 6, fontSize: 12 }}
          formatter={(v: unknown) => [typeof v === 'number' ? fmtCurrency(v) : String(v), 'CA×gut'] as [string, string]}
        />
        <Funnel dataKey="value" data={data} isAnimationActive={false}>
          {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          <LabelList
            position="right"
            content={({ x, y, width, height, value, index }: any) => {
              const entry = data[index as number]
              if (!entry) return null
              return (
                <g>
                  <text x={(x as number) + (width as number) + 10} y={(y as number) + (height as number) / 2 - 6} fill="var(--text-secondary)" fontSize={11} fontWeight={600}>{entry.name}</text>
                  <text x={(x as number) + (width as number) + 10} y={(y as number) + (height as number) / 2 + 9} fill="var(--accent)" fontSize={10}>{entry.count} deal{entry.count !== 1 ? 's' : ''}</text>
                </g>
              )
            }}
          />
        </Funnel>
      </RechartsFunnel>
    </ResponsiveContainer>
  )
}

// ── Vue barres verticales recharts ─────────────────────────────────────────

function BarVView({ funnelData }: { funnelData: ReturnType<typeof buildFunnelData> }) {
  const data = funnelData.map(d => ({
    name: d.name.replace(' ✓', ''),
    Deals: d.count,
    'CA×gut (k)': Math.round(d.value / 1000),
    fill: d.fill,
  }))
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ left: 0, right: 20, top: 8, bottom: 24 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(166,201,206,0.07)" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={40} />
        <YAxis yAxisId="left" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}k`} />
        <Tooltip
          contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 6, fontSize: 12 }}
          formatter={(v: unknown, name: unknown) => [name === 'CA×gut (k)' ? `${v}k MUR` : String(v), name as string] as [string, string]}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 8 }} />
        <Bar yAxisId="left" dataKey="Deals" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
        </Bar>
        <Bar yAxisId="right" dataKey="CA×gut (k)" fill="#A6C9CE" opacity={0.55} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

export function FunnelChart({ projects }: FunnelChartProps) {
  const [mode, setMode] = useState<ViewMode>('funnel')

  const funnelData = useMemo(() => buildFunnelData(projects), [projects])
  const barsData = useMemo(() => buildBarsData(projects), [projects])
  const maxCount = barsData.reduce((acc, s) => Math.max(acc, s.count), 0)
  const maxValue = funnelData.reduce((acc, s) => Math.max(acc, s.value), 0)

  if (projects.length === 0) {
    return <div style={{ width: '100%', height: 280, borderRadius: 12, background: 'var(--bg-page)', opacity: 0.5 }} />
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
        <Btn active={mode === 'recharts'} onClick={() => setMode('recharts')}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1 2h11v2L7.5 7.5V12h-2V7.5L1 4V2z" fill="currentColor"/>
          </svg>
          Pyramide
        </Btn>
        <Btn active={mode === 'bar-v'} onClick={() => setMode('bar-v')}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="5" width="2.5" height="7" rx="1" fill="currentColor"/>
            <rect x="5" y="3" width="2.5" height="9" rx="1" fill="currentColor"/>
            <rect x="9" y="1" width="2.5" height="11" rx="1" fill="currentColor"/>
          </svg>
          Groupé
        </Btn>
      </div>

      {mode === 'funnel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0' }}>
          {funnelData.map((stage, i) => (
            <FunnelStage
              key={stage.status}
              stage={stage}
              maxValue={maxValue}
              isLast={i === funnelData.length - 1}
            />
          ))}
        </div>
      )}

      {mode === 'bars' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {barsData.map((step, i) => {
            const prev = barsData[i - 1]
            const convRate = prev && prev.count > 0 ? ((step.count / prev.count) * 100).toFixed(0) : null
            return <StepBar key={step.status} step={step} maxCount={maxCount} convRate={convRate} isLast={i === barsData.length - 1} />
          })}
        </div>
      )}

      {mode === 'recharts' && <RechartsView funnelData={funnelData} />}
      {mode === 'bar-v' && <BarVView funnelData={funnelData} />}
    </div>
  )
}

export default FunnelChart
