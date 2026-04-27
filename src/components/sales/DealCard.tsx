import type { Project } from '@/types/sales'
import { TYPE_COLORS, fmtCurrency, fmtDate, winFactor } from '@/types/sales'

interface DealCardProps {
  deal: Project
  onClick?: () => void
  compact?: boolean
}

function daysColor(days: number): string {
  if (days > 14) return '#ef4444'
  if (days > 7) return '#f97316'
  return '#4ade80'
}

function actionStatus(deal: Project): 'late' | 'warn' | 'ok' | 'none' {
  if (!deal.nextActionDate) return 'none'
  const diff = (new Date(deal.nextActionDate).getTime() - Date.now()) / 86400000
  if (diff < 0) return 'late'
  if (diff <= 3) return 'warn'
  return 'ok'
}

export function DealCard({ deal, onClick, compact }: DealCardProps) {
  const as = actionStatus(deal)
  const borderColor = as === 'late' ? '#ef4444' : as === 'warn' ? '#f97316' : 'transparent'

  return (
    <div
      draggable
      onClick={onClick}
      style={{
        background: 'var(--bg-page)',
        borderRadius: 10,
        padding: compact ? '8px 10px' : '10px 12px',
        cursor: 'pointer',
        border: '1px solid var(--border-subtle)',
        borderLeft: `3px solid ${borderColor || 'var(--border-accent)'}`,
        transition: 'background 0.15s',
      }}
    >
      <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, lineHeight: 1.3 }}>
        {deal.name}
      </div>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: compact ? 4 : 6 }}>
        {deal.clientName}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
        {deal.type && (
          <span style={{
            fontSize: 'var(--fs-2xs)', padding: '1px 6px', borderRadius: 6,
            background: `${TYPE_COLORS[deal.type] || '#6b7280'}22`,
            color: TYPE_COLORS[deal.type] || '#6b7280', fontWeight: 600,
          }}>
            {deal.type}
          </span>
        )}
        {deal.health && (
          <span style={{ fontSize: 'var(--fs-2xs)' }}>{deal.health.split(' ')[0]}</span>
        )}
        {deal.daysInCurrentStage > 0 && (
          <span style={{
            fontSize: 'var(--fs-2xs)', padding: '1px 6px', borderRadius: 6,
            background: `${daysColor(deal.daysInCurrentStage)}22`,
            color: daysColor(deal.daysInCurrentStage), fontWeight: 600,
          }}>
            {deal.daysInCurrentStage}j
          </span>
        )}
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent)', fontWeight: 600, marginLeft: 'auto' }}>
          {fmtCurrency(deal.quotedAmount, deal.currency)}
        </span>
      </div>

      {!compact && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
            Win {Math.round(winFactor(deal) * 100)}%
          </span>
          {deal.nextAction && (
            <span style={{
              fontSize: 'var(--fs-2xs)', fontWeight: 500,
              color: as === 'late' ? '#ef4444' : as === 'warn' ? '#f97316' : 'var(--text-muted)',
            }}>
              {as === 'late' ? '⚠ ' : ''}{deal.nextAction}
              {deal.nextActionDate ? ` · ${fmtDate(deal.nextActionDate)}` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
