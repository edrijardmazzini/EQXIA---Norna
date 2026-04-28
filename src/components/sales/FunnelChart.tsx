'use client'

import { useState, useMemo } from 'react'
import {
  FunnelChart as RechartsFunnel, Funnel, LabelList, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { Project } from '@/types/sales'
import { PIPELINE_COLS, CLOSED_WON, fmtCurrency } from '@/types/sales'

interface FunnelChartProps { projects: Project[] }
type ViewMode = 'funnel' | 'bars' | 'recharts' | 'bar-v' | 'curved' | 'smooth' | 'rounded' | 'tube'

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

// ── Vue entonnoir SVG coins arrondis (arc SVG) ────────────────────────────
// Chaque segment = trapèze aux 4 coins arrondis via arcs SVG
// Look "pill stack" — different de bezier car les bords sont droits avec coins en arc

function RoundedFunnelView({ funnelData }: { funnelData: ReturnType<typeof buildFunnelData> }) {
  const [tooltip, setTooltip] = useState<{ entry: ReturnType<typeof buildFunnelData>[0]; x: number; y: number } | null>(null)
  const data = funnelData.filter(d => d.value > 0 || d.count > 0)
  if (data.length === 0) return null

  const W = 480
  const H = 320
  const GAP = 5
  const LABEL_W = 150
  const USABLE_W = W - LABEL_W
  const rowH = (H - GAP * (data.length - 1)) / data.length
  const maxVal = Math.max(...data.map(d => d.value), 1)
  const cx = USABLE_W / 2

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        <defs>
          {data.map((d, i) => (
            <linearGradient key={i} id={`rg${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={d.fill} stopOpacity="1" />
              <stop offset="100%" stopColor={d.fill} stopOpacity="0.7" />
            </linearGradient>
          ))}
        </defs>

        {data.map((entry, i) => {
          const w = Math.max(0.1, entry.value / maxVal) * (USABLE_W * 0.9)
          const y0 = i * (rowH + GAP)
          const y1 = y0 + rowH
          const midY = (y0 + y1) / 2
          const r = Math.min(rowH / 2, w / 2, 14)   // corner radius

          const lx = cx - w / 2
          const rx = cx + w / 2

          // Rounded trapezoid: straight vertical sides, curved corners
          const path = [
            `M ${lx + r} ${y0}`,
            `L ${rx - r} ${y0}`,
            `Q ${rx} ${y0} ${rx} ${y0 + r}`,
            `L ${rx} ${y1 - r}`,
            `Q ${rx} ${y1} ${rx - r} ${y1}`,
            `L ${lx + r} ${y1}`,
            `Q ${lx} ${y1} ${lx} ${y1 - r}`,
            `L ${lx} ${y0 + r}`,
            `Q ${lx} ${y0} ${lx + r} ${y0}`,
            'Z',
          ].join(' ')

          return (
            <g key={i}
              onMouseEnter={e => setTooltip({ entry, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'default' }}
            >
              <path d={path} fill={`url(#rg${i})`} />
              {/* Conversion arrow between segments */}
              {i > 0 && data[i - 1].count > 0 && (
                <text x={cx} y={y0 - 2} textAnchor="middle"
                  fill="var(--text-muted)" fontSize="9" fontWeight="500">
                  ↓ {Math.round((entry.count / data[i - 1].count) * 100)} %
                </text>
              )}
              {entry.count > 0 && (
                <text x={cx} y={midY + 5} textAnchor="middle"
                  fill="white" fontSize="13" fontWeight="800">
                  {entry.count}
                </text>
              )}
              {/* Right labels */}
              <text x={USABLE_W + 10} y={midY - 4}
                fill="var(--text-secondary)" fontSize="11" fontWeight="600">
                {entry.name}
              </text>
              {entry.value > 0 && (
                <text x={USABLE_W + 10} y={midY + 10}
                  fill={entry.fill} fontSize="10">
                  {fmtCurrency(entry.value)}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 8, zIndex: 100,
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 8, padding: '7px 11px', fontSize: 12, pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{tooltip.entry.name}</div>
          <div style={{ color: 'var(--text-secondary)' }}>{tooltip.entry.count} deal{tooltip.entry.count !== 1 ? 's' : ''}</div>
          {tooltip.entry.value > 0 && (
            <div style={{ color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>CA×gut {fmtCurrency(tooltip.entry.value)}</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Vue entonnoir 3D tube (ellipse + gradient ombre) ───────────────────────
// Chaque segment est un trapèze + ellipse en "bouche" → illusion 3D cylindrique

function TubeFunnelView({ funnelData }: { funnelData: ReturnType<typeof buildFunnelData> }) {
  const [tooltip, setTooltip] = useState<{ entry: ReturnType<typeof buildFunnelData>[0]; x: number; y: number } | null>(null)
  const data = funnelData.filter(d => d.value > 0 || d.count > 0)
  if (data.length === 0) return null

  const W = 480
  const H = 300
  const LABEL_W = 150
  const USABLE_W = W - LABEL_W
  const cx = USABLE_W / 2
  const rowH = H / data.length
  const ELLIPSE_RY = 7  // vertical radius of top/bottom ellipses (foreshortening)
  const maxVal = Math.max(...data.map(d => d.value), 1)

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        <defs>
          {data.map((d, i) => {
            const w = Math.max(0.1, d.value / maxVal) * (USABLE_W * 0.88)
            return (
              <linearGradient key={i} id={`tg${i}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={d.fill} stopOpacity="0.55" />
                <stop offset="35%" stopColor={d.fill} stopOpacity="0.95" />
                <stop offset="65%" stopColor={d.fill} stopOpacity="0.95" />
                <stop offset="100%" stopColor={d.fill} stopOpacity="0.55" />
              </linearGradient>
            )
          })}
        </defs>

        {/* Draw from bottom to top so bottom segments are behind top ones */}
        {[...data].reverse().map((entry, ri) => {
          const i = data.length - 1 - ri
          const w = Math.max(0.1, entry.value / maxVal) * (USABLE_W * 0.88)
          const wNext = i + 1 < data.length ? Math.max(0.1, data[i + 1].value / maxVal) * (USABLE_W * 0.88) : w * 0.55
          const y0 = i * rowH
          const y1 = (i + 1) * rowH
          const midY = (y0 + y1) / 2

          const lx0 = cx - w / 2;  const rx0 = cx + w / 2
          const lx1 = cx - wNext / 2; const rx1 = cx + wNext / 2

          return (
            <g key={i}
              onMouseEnter={e => setTooltip({ entry, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'default' }}
            >
              {/* Trapezoid body */}
              <path
                d={`M ${lx0} ${y0} L ${rx0} ${y0} L ${rx1} ${y1} L ${lx1} ${y1} Z`}
                fill={`url(#tg${i})`}
              />
              {/* Bottom rim (ellipse) — dark to suggest depth */}
              <ellipse cx={cx} cy={y1} rx={wNext / 2} ry={ELLIPSE_RY}
                fill={entry.fill} opacity="0.45"
              />
              {/* Top rim (ellipse) — bright highlight */}
              <ellipse cx={cx} cy={y0} rx={w / 2} ry={ELLIPSE_RY}
                fill="white" opacity="0.18"
              />
              {/* Count */}
              {entry.count > 0 && (
                <text x={cx} y={midY + 5} textAnchor="middle"
                  fill="white" fontSize="13" fontWeight="800">
                  {entry.count}
                </text>
              )}
              {/* Right labels */}
              <text x={USABLE_W + 10} y={midY - 4}
                fill="var(--text-secondary)" fontSize="11" fontWeight="600">
                {entry.name}
              </text>
              {entry.value > 0 && (
                <text x={USABLE_W + 10} y={midY + 10}
                  fill={entry.fill} fontSize="10">
                  {fmtCurrency(entry.value)}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 8, zIndex: 100,
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 8, padding: '7px 11px', fontSize: 12, pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{tooltip.entry.name}</div>
          <div style={{ color: 'var(--text-secondary)' }}>{tooltip.entry.count} deal{tooltip.entry.count !== 1 ? 's' : ''}</div>
          {tooltip.entry.value > 0 && (
            <div style={{ color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>CA×gut {fmtCurrency(tooltip.entry.value)}</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Vue entonnoir SVG S-curve (cubic bezier continu) ──────────────────────
// Différence vs curved : bords cubiques avec tangente verticale en entrée/sortie
// → chaque segment coule naturellement dans le suivant (style "nivo-like")

function SmoothFunnelView({ funnelData }: { funnelData: ReturnType<typeof buildFunnelData> }) {
  const [tooltip, setTooltip] = useState<{ entry: ReturnType<typeof buildFunnelData>[0]; x: number; y: number } | null>(null)
  const data = funnelData.filter(d => d.value > 0 || d.count > 0)
  if (data.length === 0) return null

  const W = 480
  const H = 320
  const PAD_H = 10  // vertical padding between segments
  const LABEL_W = 155
  const USABLE_W = W - LABEL_W
  const maxVal = Math.max(...data.map(d => d.value), 1)
  const rowH = H / data.length

  // Width proportional to value, min 10%
  const widths = data.map((d, i) =>
    Math.max(0.1, d.value / maxVal) * (USABLE_W * 0.92)
  )
  const cx = USABLE_W / 2

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        <defs>
          {data.map((d, i) => (
            <linearGradient key={i} id={`sg${i}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={d.fill} stopOpacity="0.55" />
              <stop offset="50%" stopColor={d.fill} stopOpacity="1" />
              <stop offset="100%" stopColor={d.fill} stopOpacity="0.55" />
            </linearGradient>
          ))}
          <filter id="sf-shadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.18" />
          </filter>
        </defs>

        {data.map((entry, i) => {
          const y0 = i * rowH + PAD_H / 2
          const y1 = (i + 1) * rowH - PAD_H / 2
          const h = y1 - y0
          const midY = (y0 + y1) / 2

          const wTop = widths[i]
          const wBot = i + 1 < data.length ? widths[i + 1] : widths[i] * 0.55

          const lx0 = cx - wTop / 2
          const rx0 = cx + wTop / 2
          const lx1 = cx - wBot / 2
          const rx1 = cx + wBot / 2

          // Cubic bezier S-curve: control points keep tangent vertical → smooth junction
          const cp = h * 0.48
          const path = [
            `M ${lx0} ${y0}`,
            `C ${lx0} ${y0 + cp}, ${lx1} ${y1 - cp}, ${lx1} ${y1}`,
            `L ${rx1} ${y1}`,
            `C ${rx1} ${y1 - cp}, ${rx0} ${y0 + cp}, ${rx0} ${y0}`,
            'Z',
          ].join(' ')

          return (
            <g key={i}
              onMouseEnter={e => setTooltip({ entry, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'default' }}
              filter="url(#sf-shadow)"
            >
              <path d={path} fill={`url(#sg${i})`} />

              {/* Count badge */}
              {entry.count > 0 && (
                <text x={cx} y={midY + 5} textAnchor="middle"
                  fill="white" fontSize="13" fontWeight="800"
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                  {entry.count}
                </text>
              )}

              {/* Right label block */}
              <text x={USABLE_W + 12} y={midY - 5}
                fill="var(--text-secondary)" fontSize="11" fontWeight="600">
                {entry.name}
              </text>
              {entry.value > 0 && (
                <text x={USABLE_W + 12} y={midY + 10}
                  fill={entry.fill} fontSize="10" fontWeight="500">
                  {fmtCurrency(entry.value)}
                </text>
              )}
              {/* Percentage of top */}
              {i > 0 && widths[0] > 0 && (
                <text x={USABLE_W + 12} y={midY + 22}
                  fill="var(--text-muted)" fontSize="9">
                  {Math.round((wTop / widths[0]) * 100)} %
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 8, zIndex: 100,
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 8, padding: '7px 11px', fontSize: 12, pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{tooltip.entry.name}</div>
          <div style={{ color: 'var(--text-secondary)' }}>{tooltip.entry.count} deal{tooltip.entry.count !== 1 ? 's' : ''}</div>
          {tooltip.entry.value > 0 && (
            <div style={{ color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>CA×gut {fmtCurrency(tooltip.entry.value)}</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Vue entonnoir SVG courbe (bezier) ──────────────────────────────────────

function CurvedFunnelView({ funnelData }: { funnelData: ReturnType<typeof buildFunnelData> }) {
  const [tooltip, setTooltip] = useState<{ entry: ReturnType<typeof buildFunnelData>[0]; x: number; y: number } | null>(null)
  const data = funnelData.filter(d => d.value > 0 || d.count > 0)
  if (data.length === 0) return null

  const W = 460
  const H = 300
  const PAD_LEFT = 10
  const PAD_RIGHT = 160  // labels on right
  const usableW = W - PAD_LEFT - PAD_RIGHT
  const rowH = H / data.length
  const maxVal = Math.max(...data.map(d => d.value), 1)

  // Width of each stage proportional to value, minimum 8%
  const widths = data.map(d => Math.max(0.08, d.value / maxVal) * usableW)

  // Build a single continuous bezier polygon for the funnel silhouette
  // Left edge goes top-wide → bottom-narrow; right edge mirrors
  const segments: { path: string; fill: string; midY: number; w: number; entry: ReturnType<typeof buildFunnelData>[0] }[] = []

  for (let i = 0; i < data.length; i++) {
    const y0 = i * rowH
    const y1 = (i + 1) * rowH
    const midY = (y0 + y1) / 2
    const w0 = widths[i]
    const w1 = i + 1 < data.length ? widths[i + 1] : widths[i] * 0.6
    const cx = PAD_LEFT + usableW / 2

    // Top edge of this segment
    const lx0 = cx - w0 / 2
    const rx0 = cx + w0 / 2
    // Bottom edge
    const lx1 = cx - w1 / 2
    const rx1 = cx + w1 / 2

    // Bezier control points: pull them inward at midpoint for a concave pinch
    const cpY = (y0 + y1) / 2
    const tension = 0.35
    const lCpX = lx0 + (lx1 - lx0) * tension
    const rCpX = rx0 + (rx1 - rx0) * tension

    const path = [
      `M ${lx0} ${y0}`,
      `Q ${lCpX} ${cpY} ${lx1} ${y1}`,
      `L ${rx1} ${y1}`,
      `Q ${rCpX} ${cpY} ${rx0} ${y0}`,
      'Z',
    ].join(' ')

    segments.push({ path, fill: data[i].fill, midY, w: w0, entry: data[i] })
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        <defs>
          {segments.map((s, i) => (
            <linearGradient key={i} id={`cg${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.fill} stopOpacity="0.95" />
              <stop offset="100%" stopColor={s.fill} stopOpacity="0.6" />
            </linearGradient>
          ))}
        </defs>
        {segments.map((s, i) => (
          <g key={i}
            onMouseEnter={e => setTooltip({ entry: s.entry, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setTooltip(null)}
            style={{ cursor: 'default' }}
          >
            <path d={s.path} fill={`url(#cg${i})`} />
            {/* Thin separator line */}
            {i > 0 && (
              <line
                x1={PAD_LEFT + usableW / 2 - s.w / 2}
                y1={i * rowH}
                x2={PAD_LEFT + usableW / 2 + s.w / 2}
                y2={i * rowH}
                stroke="rgba(0,0,0,0.15)" strokeWidth="1"
              />
            )}
            {/* Count badge in center */}
            {s.entry.count > 0 && (
              <text
                x={PAD_LEFT + usableW / 2}
                y={s.midY + 4}
                textAnchor="middle"
                fill="white"
                fontSize="12"
                fontWeight="700"
              >
                {s.entry.count}
              </text>
            )}
            {/* Label on right */}
            <text
              x={PAD_LEFT + usableW / 2 + s.w / 2 + 10}
              y={s.midY - 5}
              fill="var(--text-secondary)"
              fontSize="11"
              fontWeight="600"
            >
              {s.entry.name}
            </text>
            {s.entry.value > 0 && (
              <text
                x={PAD_LEFT + usableW / 2 + s.w / 2 + 10}
                y={s.midY + 9}
                fill="var(--accent)"
                fontSize="10"
              >
                {fmtCurrency(s.entry.value)}
              </text>
            )}
          </g>
        ))}
      </svg>
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 8, zIndex: 100,
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 8, padding: '7px 11px', fontSize: 12, pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{tooltip.entry.name}</div>
          <div style={{ color: 'var(--text-secondary)' }}>{tooltip.entry.count} deal{tooltip.entry.count !== 1 ? 's' : ''}</div>
          {tooltip.entry.value > 0 && (
            <div style={{ color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>CA×gut {fmtCurrency(tooltip.entry.value)}</div>
          )}
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
        <Btn active={mode === 'curved'} onClick={() => setMode('curved')}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 1.5 Q6.5 4 11 1.5 L9 7 Q6.5 8.5 4 7 Z" fill="currentColor" opacity="0.7"/>
            <path d="M4 7 Q6.5 8.5 9 7 L8 11 Q6.5 12 5 11 Z" fill="currentColor"/>
          </svg>
          Courbe
        </Btn>
        <Btn active={mode === 'smooth'} onClick={() => setMode('smooth')}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1.5 1.5 C1.5 4, 11.5 4, 11.5 6.5 C11.5 9, 1.5 9, 1.5 11.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          </svg>
          S-Curve
        </Btn>
        <Btn active={mode === 'rounded'} onClick={() => setMode('rounded')}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="1.5" width="11" height="3" rx="1.5" fill="currentColor" opacity="0.9"/>
            <rect x="2.5" y="5.5" width="8" height="3" rx="1.5" fill="currentColor" opacity="0.75"/>
            <rect x="4" y="9.5" width="5" height="2.5" rx="1.25" fill="currentColor" opacity="0.6"/>
          </svg>
          Pills
        </Btn>
        <Btn active={mode === 'tube'} onClick={() => setMode('tube')}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <ellipse cx="6.5" cy="3" rx="5" ry="1.5" fill="currentColor" opacity="0.5"/>
            <path d="M1.5 3 L2.5 11 H10.5 L11.5 3" fill="currentColor" opacity="0.8"/>
            <ellipse cx="6.5" cy="11" rx="4" ry="1.2" fill="currentColor" opacity="0.4"/>
          </svg>
          3D
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
      {mode === 'curved' && <CurvedFunnelView funnelData={funnelData} />}
      {mode === 'smooth' && <SmoothFunnelView funnelData={funnelData} />}
      {mode === 'rounded' && <RoundedFunnelView funnelData={funnelData} />}
      {mode === 'tube' && <TubeFunnelView funnelData={funnelData} />}
    </div>
  )
}

export default FunnelChart
