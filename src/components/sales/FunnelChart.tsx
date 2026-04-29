'use client'

import { useState, useMemo } from 'react'
import type { Project } from '@/types/sales'
import { PIPELINE_COLS, CLOSED_WON, fmtCurrency, fmtDate, winFactor } from '@/types/sales'

const STAGES = [
  ...PIPELINE_COLS,
  { status: 'Won', label: 'Won ✓', accent: '#4ade80' },
]

// ── Deal card ──────────────────────────────────────────────────────────────

function DealCard({ deal, selected, onClick }: {
  deal: Project
  selected: boolean
  onClick: () => void
}) {
  const wf = winFactor(deal)
  const overdue = deal.daysInCurrentStage > 20

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 11px',
        background: 'var(--bg-card)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
        boxShadow: selected ? '0 0 0 2px var(--accent-soft)' : 'none',
        cursor: 'pointer',
        transition: 'border-color 0.12s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
          lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {deal.clientName || deal.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--accent)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {fmtCurrency(deal.quotedAmount, deal.currency)}
        </div>
      </div>
      <div style={{
        fontSize: 11, color: 'var(--text-muted)', marginBottom: 7,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {deal.name}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
          padding: '1px 5px', background: 'var(--accent-soft)', color: 'var(--accent)', flexShrink: 0,
        }}>{deal.type}</span>
        {deal.ownerName && (
          <span style={{
            fontSize: 10, color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {deal.ownerName.split(' ')[0]}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, flexShrink: 0, color: overdue ? '#f87171' : 'var(--text-muted)' }}>
          {deal.daysInCurrentStage}j
        </span>
      </div>
      <div style={{ height: 2, background: 'var(--border-subtle)', marginTop: 8 }}>
        <div style={{ height: '100%', width: `${Math.round(wf * 100)}%`, background: 'var(--accent)', opacity: 0.8 }} />
      </div>
    </div>
  )
}

// ── Stage column ───────────────────────────────────────────────────────────

function StageColumn({ stage, deals, selectedId, onSelect, totalValue }: {
  stage: typeof STAGES[0]
  deals: Project[]
  selectedId: string | null
  onSelect: (p: Project) => void
  totalValue: number
}) {
  const stageTotal = deals.reduce((s, d) => s + (d.quotedAmount || 0), 0)
  const pct = totalValue > 0 ? (stageTotal / totalValue) * 100 : 0

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      minWidth: 205, width: 205, flexShrink: 0,
      borderRight: '1px solid var(--border-subtle)',
      height: '100%',
    }}>
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: stage.accent }}>
            {stage.label}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{deals.length}</span>
        </div>
        <div style={{ height: 2, background: 'var(--border-subtle)' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: stage.accent, opacity: 0.7, transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 11, color: stage.accent, marginTop: 5, opacity: 0.9 }}>
          {fmtCurrency(stageTotal)}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {deals.length === 0 ? (
          <div style={{
            height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, color: 'var(--text-muted)', border: '1px dashed var(--border-subtle)',
          }}>—</div>
        ) : deals.map(d => (
          <DealCard key={d.id} deal={d} selected={selectedId === d.id} onClick={() => onSelect(d)} />
        ))}
      </div>
    </div>
  )
}

// ── Detail panel ───────────────────────────────────────────────────────────

function DetailPanel({ deal, onClose }: { deal: Project; onClose: () => void }) {
  const stageIdx = STAGES.findIndex(s =>
    s.status === 'Won' ? CLOSED_WON.has(deal.status) : s.status === deal.status
  )
  const wf = winFactor(deal)

  return (
    <div style={{
      width: 268, flexShrink: 0,
      borderLeft: '1px solid var(--border-subtle)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
            {deal.clientName}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{deal.name}</div>
        </div>
        <button onClick={onClose} style={{
          marginLeft: 8, flexShrink: 0, width: 24, height: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--border-subtle)', color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: 16, background: 'none', fontFamily: 'inherit', lineHeight: 1,
        }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Stage pills */}
        <div style={{ display: 'flex' }}>
          {STAGES.map((s, i) => (
            <div key={s.status} style={{
              flex: 1, padding: '3px 0', textAlign: 'center',
              fontSize: 7, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              background: i === stageIdx ? s.accent : i < stageIdx ? 'var(--accent-soft)' : 'transparent',
              color: i === stageIdx ? '#fff' : i < stageIdx ? 'var(--accent)' : 'var(--text-muted)',
              border: '1px solid var(--border-subtle)', marginRight: -1,
              overflow: 'hidden', textOverflow: 'clip', whiteSpace: 'nowrap',
            }}>{s.label.replace(' ✓', '')}</div>
          ))}
        </div>

        {/* Value */}
        <div>
          <div style={{ fontSize: 24, color: 'var(--accent)', lineHeight: 1.2 }}>
            {fmtCurrency(deal.quotedAmount, deal.currency)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
            Pondéré {fmtCurrency(deal.quotedAmount * wf, deal.currency)}
            <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--text-primary)' }}>
              ({Math.round(wf * 100)}%)
            </span>
          </div>
          <div style={{ height: 2, background: 'var(--border-subtle)', marginTop: 8 }}>
            <div style={{ height: '100%', width: `${Math.round(wf * 100)}%`, background: 'var(--accent)' }} />
          </div>
        </div>

        {/* Info rows */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {([
            ['Owner', deal.ownerName || '—'],
            ['Type', deal.type || '—'],
            ['Source', deal.sourceLead || '—'],
            ['Jours en cours', `${deal.daysInCurrentStage}j`],
            ['Close date', fmtDate(deal.expectedCloseDate)],
            ['Prochaine action', deal.nextAction || '—'],
            ['Date action', fmtDate(deal.nextActionDate)],
          ] as const).map(([label, value]) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '7px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 12,
            }}>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginRight: 8 }}>{label}</span>
              <span style={{
                fontWeight: 500, color: 'var(--text-primary)', textAlign: 'right',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150,
              }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────

export function FunnelChart({ projects }: { projects: Project[] }) {
  const [selected, setSelected] = useState<Project | null>(null)

  const active = useMemo(() =>
    projects.filter(p => !['Lost', 'Cancelled', 'On Hold'].includes(p.status)),
    [projects]
  )

  const totalValue = useMemo(() =>
    active.reduce((s, p) => s + (p.quotedAmount || 0), 0),
    [active]
  )

  const byStage = useMemo(() =>
    STAGES.map(col => ({
      ...col,
      deals: active.filter(p =>
        col.status === 'Won' ? CLOSED_WON.has(p.status) : p.status === col.status
      ),
    })),
    [active]
  )

  const handleSelect = (deal: Project) =>
    setSelected(prev => prev?.id === deal.id ? null : deal)

  if (projects.length === 0) {
    return (
      <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        Aucun projet
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', height: 420,
      margin: '0 -20px -20px',
      borderTop: '1px solid var(--border-subtle)',
      overflow: 'hidden',
    }}>
      <div style={{ flex: 1, display: 'flex', overflowX: 'auto', overflowY: 'hidden' }}>
        {byStage.map(stage => (
          <StageColumn
            key={stage.status}
            stage={stage}
            deals={stage.deals}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
            totalValue={totalValue}
          />
        ))}
      </div>
      {selected && <DetailPanel deal={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

export default FunnelChart
