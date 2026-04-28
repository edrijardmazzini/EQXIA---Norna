'use client'

import { useState, useMemo } from 'react'
import type { Project } from '@/types/sales'
import { PIPELINE_COLS } from '@/types/sales'

interface Props {
  projects: Project[]
  onDealClick?: (deal: Project) => void
}

const PIPELINE_STATUSES = PIPELINE_COLS.map(c => c.status)

const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '0–7j', min: 0, max: 7 },
  { label: '7–14j', min: 7, max: 14 },
  { label: '14–30j', min: 14, max: 30 },
  { label: '30j+', min: 30, max: Infinity },
]

function cellColor(count: number): string {
  if (count === 0) return 'transparent'
  if (count === 1) return '#3b82f620'
  if (count === 2) return '#f59e0b40'
  return '#ef444440'
}

function cellBorder(count: number): string {
  if (count === 0) return '1px solid #ffffff0a'
  if (count === 1) return '1px solid #3b82f640'
  if (count === 2) return '1px solid #f59e0b60'
  return '1px solid #ef444460'
}

export function StaleHeatmap({ projects, onDealClick }: Props) {
  const [popover, setPopover] = useState<{ status: string; bucketIdx: number } | null>(null)

  const pipelineDeals = useMemo(
    () => projects.filter(d => PIPELINE_STATUSES.includes(d.status)),
    [projects],
  )

  const grid = useMemo(
    () => PIPELINE_COLS.map(col => ({
      col,
      buckets: BUCKETS.map((b, bi) => ({
        bi,
        deals: pipelineDeals.filter(d =>
          d.status === col.status &&
          d.daysInCurrentStage >= b.min &&
          d.daysInCurrentStage < b.max
        ),
      })),
    })),
    [pipelineDeals],
  )

  if (pipelineDeals.length === 0) {
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

  function handleCellClick(deals: Project[], status: string, bucketIdx: number) {
    if (deals.length === 0) return
    if (deals.length === 1) {
      onDealClick?.(deals[0])
      setPopover(null)
      return
    }
    setPopover(prev =>
      prev?.status === status && prev.bucketIdx === bucketIdx ? null : { status, bucketIdx }
    )
  }

  const headerStyle: React.CSSProperties = {
    minWidth: 70,
    minHeight: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-muted, #6b7280)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  }

  return (
    <div style={{ overflowX: 'auto', position: 'relative' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `140px repeat(${BUCKETS.length}, 1fr)`,
        gap: 4,
        minWidth: 480,
      }}>
        <div style={headerStyle} />
        {BUCKETS.map(b => (
          <div key={b.label} style={headerStyle}>{b.label}</div>
        ))}

        {grid.map(({ col, buckets }) => (
          <>
            <div
              key={`label-${col.status}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--color-text, #e5e7eb)',
                padding: '0 4px',
              }}
            >
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: col.accent,
                flexShrink: 0,
              }} />
              {col.label}
            </div>

            {buckets.map(({ bi, deals }) => {
              const count = deals.length
              const isOpen = popover?.status === col.status && popover.bucketIdx === bi

              return (
                <div
                  key={`${col.status}-${bi}`}
                  style={{ position: 'relative' }}
                >
                  <div
                    onClick={() => handleCellClick(deals, col.status, bi)}
                    style={{
                      minWidth: 70,
                      minHeight: 50,
                      background: cellColor(count),
                      border: cellBorder(count),
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: count > 0 ? 'pointer' : 'default',
                      fontSize: 18,
                      fontWeight: 700,
                      color: count === 0 ? '#ffffff18' : 'var(--color-text, #e5e7eb)',
                      transition: 'opacity 0.15s',
                    }}
                  >
                    {count === 0 ? '—' : count}
                  </div>

                  {isOpen && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      zIndex: 50,
                      background: 'var(--color-surface, #1a1a2e)',
                      border: '1px solid var(--color-border, #2d2d44)',
                      borderRadius: 8,
                      padding: '8px 0',
                      minWidth: 200,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      marginTop: 4,
                    }}>
                      {deals.map(deal => (
                        <div
                          key={deal.id}
                          onClick={() => {
                            onDealClick?.(deal)
                            setPopover(null)
                          }}
                          style={{
                            padding: '6px 12px',
                            cursor: 'pointer',
                            fontSize: 12,
                            color: 'var(--color-text, #e5e7eb)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#ffffff0a')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{ fontWeight: 500 }}>{deal.name || deal.clientName}</span>
                          <span style={{ color: 'var(--color-muted, #6b7280)', whiteSpace: 'nowrap' }}>
                            {deal.daysInCurrentStage}j
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        ))}
      </div>
    </div>
  )
}
