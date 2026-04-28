import type { Client } from '@/types/sales'
import { fmtCurrency } from '@/types/sales'

interface ClientCardProps {
  client: Client
  activeDealsCount: number
  onClick?: () => void
}

function healthColor(health: string): string {
  if (health === 'Good' || health === '✅') return '#4ade80'
  if (health === 'At Risk' || health === '⚠️') return '#f59e0b'
  if (health === 'Critical' || health === '❌') return '#ef4444'
  return '#6b7280'
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

export function ClientCard({ client, activeDealsCount, onClick }: ClientCardProps) {
  const visibleSectors = client.sectors.slice(0, 2)
  const extraSectors = client.sectors.length - 2
  const satStyle = satisfactionStyle(client.satisfaction)
  const upStyle = upXsellStyle(client.upXsellPotential)
  const hColor = healthColor(client.health)

  return (
    <div
      onClick={onClick}
      style={{
        width: '100%',
        background: 'var(--card-bg)',
        backdropFilter: 'var(--card-blur)',
        WebkitBackdropFilter: 'var(--card-blur)',
        border: 'var(--card-border)',
        borderRadius: 'var(--card-radius)',
        boxShadow: 'var(--card-shadow)',
        padding: 'var(--card-padding-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
        boxSizing: 'border-box',
      }}
      onMouseEnter={e => {
        if (onClick) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-accent)'
      }}
      onMouseLeave={e => {
        if (onClick) (e.currentTarget as HTMLDivElement).style.borderColor = ''
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--fs-base)', color: 'var(--text-primary)' }}>
          {client.name}
        </span>
        {visibleSectors.map(s => (
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
        {extraSectors > 0 && (
          <span
            style={{
              fontSize: 'var(--fs-2xs)',
              color: 'var(--text-muted)',
              background: 'rgba(166,201,206,0.10)',
              borderRadius: 6,
              padding: '2px 7px',
            }}
          >
            +{extraSectors}
          </span>
        )}
      </div>

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

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span
          style={{
            fontSize: 'var(--fs-xl)',
            fontWeight: 700,
            color: 'var(--accent)',
            letterSpacing: '-0.5px',
          }}
        >
          {fmtCurrency(client.lifetimeValue)}
        </span>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
          {activeDealsCount} deal{activeDealsCount !== 1 ? 's' : ''} actif{activeDealsCount !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            fontSize: 'var(--fs-xs)',
            padding: '2px 8px',
            borderRadius: 6,
            background: upStyle.background,
            color: upStyle.color,
            fontWeight: 500,
          }}
        >
          {client.upXsellPotential || '—'} Up/X-sell
        </span>
        {client.relationshipOwner && (
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            {client.relationshipOwner}
          </span>
        )}
      </div>
    </div>
  )
}
