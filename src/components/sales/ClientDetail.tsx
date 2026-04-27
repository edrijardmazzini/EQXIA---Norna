'use client'

import type { Client, Project } from '@/types/sales'
import { fmtCurrency, fmtDate, PIPELINE_COLS, CLOSED_WON } from '@/types/sales'

interface ClientDetailProps {
  client: Client
  projects: Project[]
  onClose: () => void
  inline?: boolean
}

function healthColor(health: string): string {
  if (health === 'Good' || health === '✅') return '#4ade80'
  if (health === 'At Risk' || health === '⚠️') return '#f59e0b'
  if (health === 'Critical' || health === '❌') return '#ef4444'
  return '#6b7280'
}

function healthLabel(health: string): string {
  if (health === 'Good' || health === '✅') return 'Good'
  if (health === 'At Risk' || health === '⚠️') return 'At Risk'
  if (health === 'Critical' || health === '❌') return 'Critical'
  return health || '—'
}

function satisfactionStyle(satisfaction: string): { background: string; color: string } {
  if (satisfaction === 'Very Satisfied') return { background: 'rgba(74,222,128,0.15)', color: '#4ade80' }
  if (satisfaction === 'Satisfied') return { background: 'rgba(166,201,206,0.15)', color: '#A6C9CE' }
  if (satisfaction === 'Neutral') return { background: 'rgba(107,114,128,0.15)', color: '#9ca3af' }
  if (satisfaction === 'Dissatisfied') return { background: 'rgba(239,68,68,0.15)', color: '#ef4444' }
  return { background: 'rgba(107,114,128,0.15)', color: '#9ca3af' }
}

function upXsellStyle(potential: string): { background: string; color: string } {
  if (potential === 'High') return { background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }
  if (potential === 'Medium') return { background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
  return { background: 'rgba(107,114,128,0.15)', color: '#9ca3af' }
}

function statusDotColor(status: string): string {
  const map: Record<string, string> = {
    Won: '#4ade80',
    Active: '#4ade80',
    Completed: '#4ade80',
    Lost: '#f87171',
    Cancelled: '#f87171',
    'On Hold': '#9ca3af',
    Lead: '#6b7280',
    Qualified: '#3b82f6',
    Scoping: '#8b5cf6',
    'Proposal Sent': '#f59e0b',
    Negotiation: '#ef4444',
    'Verbal Commitment': '#10b981',
  }
  return map[status] || '#6b7280'
}

const PIPELINE_STATUS_SET = new Set(PIPELINE_COLS.map(c => c.status))
const CLOSED_ALL = new Set(['Won', 'Active', 'Completed', 'Lost', 'Cancelled'])

export function ClientDetail({ client, projects, onClose, inline = false }: ClientDetailProps) {
  const projectsForClient = projects.filter(p => p.clientIds.includes(client.id))

  const activeDeals = projectsForClient.filter(p => PIPELINE_STATUS_SET.has(p.status))
  const closedDeals = projectsForClient
    .filter(p => CLOSED_ALL.has(p.status))
    .sort((a, b) => {
      const da = a.dateClosed || a.created || ''
      const db = b.dateClosed || b.created || ''
      return db.localeCompare(da)
    })

  const pipelineAmount = activeDeals.reduce((sum, p) => sum + (p.quotedAmount || 0), 0)
  const wonActive = projectsForClient.filter(p => CLOSED_WON.has(p.status))

  const satStyle = satisfactionStyle(client.satisfaction)
  const upStyle = upXsellStyle(client.upXsellPotential)
  const hColor = healthColor(client.health)

  const panelStyle: React.CSSProperties = inline
    ? {
        width: '100%',
        overflowY: 'auto',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-card)',
        padding: 28,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
      }
    : {
        width: 520,
        height: '100vh',
        overflowY: 'auto',
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border-accent)',
        padding: 28,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        boxShadow: 'var(--shadow-modal)',
      }

  const content = (
    <>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <span
            style={{
              fontSize: 'var(--fs-2xl)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 1.2,
            }}
          >
            {client.name}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-btn)',
              color: 'var(--text-muted)',
              fontSize: 'var(--fs-lg)',
              cursor: 'pointer',
              padding: '2px 10px',
              lineHeight: 1.4,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {client.sectors.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {client.sectors.map(s => (
              <span
                key={s}
                style={{
                  fontSize: 'var(--fs-2xs)',
                  color: 'var(--text-secondary)',
                  background: 'rgba(166,201,206,0.15)',
                  borderRadius: 6,
                  padding: '2px 7px',
                }}
              >
                {s}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              display: 'inline-block',
              background: hColor,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
            {healthLabel(client.health)}
          </span>
          <span
            style={{
              fontSize: 'var(--fs-xs)',
              padding: '2px 8px',
              borderRadius: 6,
              background: satStyle.background,
              color: satStyle.color,
              fontWeight: 500,
            }}
          >
            {client.satisfaction || '—'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Lifetime Value</span>
          <span
            style={{
              fontSize: 'var(--fs-2xl)',
              fontWeight: 700,
              color: 'var(--accent)',
              letterSpacing: '-0.5px',
            }}
          >
            {fmtCurrency(client.lifetimeValue)}
          </span>
        </div>

        {client.relationshipOwner && (
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            Owner : {client.relationshipOwner}
          </span>
        )}

        {client.upXsellPotential && (
          <span
            style={{
              alignSelf: 'flex-start',
              fontSize: 'var(--fs-xs)',
              padding: '2px 8px',
              borderRadius: 6,
              background: upStyle.background,
              color: upStyle.color,
              fontWeight: 500,
            }}
          >
            {client.upXsellPotential} Up/X-sell
          </span>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Vue d'ensemble
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Total projets', value: String(projectsForClient.length) },
            { label: 'Projets Won/Actifs', value: String(wonActive.length) },
            { label: 'Pipeline actif', value: fmtCurrency(pipelineAmount) },
            { label: 'Dernier review', value: fmtDate(client.lastQualityReview) },
          ].map(kpi => (
            <div
              key={kpi.label}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-input)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>{kpi.label}</span>
              <span style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--text-primary)' }}>
                {kpi.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline */}
      {activeDeals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Pipeline actif
          </span>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {PIPELINE_COLS.map(col => {
              const colDeals = activeDeals.filter(p => p.status === col.status)
              if (colDeals.length === 0) return null
              return (
                <div
                  key={col.status}
                  style={{
                    minWidth: 140,
                    flexShrink: 0,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderTop: `2px solid ${col.accent}`,
                    borderRadius: 'var(--radius-input)',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 'var(--fs-2xs)',
                      fontWeight: 600,
                      color: col.accent,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {col.label}
                  </span>
                  {colDeals.map(deal => (
                    <div
                      key={deal.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 'var(--fs-xs)',
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {deal.name}
                      </span>
                      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
                        {fmtCurrency(deal.quotedAmount, deal.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Historique */}
      {closedDeals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Historique
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {closedDeals.map(deal => (
              <div
                key={deal.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-input)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    display: 'inline-block',
                    background: statusDotColor(deal.status),
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 'var(--fs-xs)',
                    color: 'var(--text-primary)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {deal.name}
                </span>
                <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {deal.type}
                </span>
                <span
                  style={{
                    fontSize: 'var(--fs-xs)',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    flexShrink: 0,
                  }}
                >
                  {fmtCurrency(deal.finalAmount || deal.quotedAmount, deal.currency)}
                </span>
                <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {fmtDate(deal.dateClosed || deal.created)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contacts */}
      <div
        style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-input)',
          padding: '14px 16px',
          fontSize: 'var(--fs-xs)',
          color: 'var(--text-muted)',
        }}
      >
        Voir Notion pour les contacts associés à ce client.
      </div>
    </>
  )

  if (inline) {
    return <div style={panelStyle}>{content}</div>
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div style={panelStyle}>{content}</div>
    </div>
  )
}
