'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface Props {
  onRefresh: () => void
  refreshing?: boolean
  lastFetchAt: number | null
}

function formatRelative(ts: number | null, now: number): string {
  if (!ts) return ''
  const seconds = Math.round((now - ts) / 1000)
  if (seconds < 5)    return 'à l\'instant'
  if (seconds < 60)   return `il y a ${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60)   return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  return `il y a ${hours}h`
}

export function RefreshButton({ onRefresh, refreshing, lastFetchAt }: Props) {
  // Re-render every 30s to update relative time
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30 * 1000)
    return () => clearInterval(interval)
  }, [])

  const label = formatRelative(lastFetchAt, now)
  const stale = lastFetchAt ? (now - lastFetchAt) > 6 * 60 * 1000 : false

  return (
    <button
      onClick={onRefresh}
      disabled={refreshing}
      title={lastFetchAt ? `Données mises à jour ${label}` : 'Rafraîchir les données'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 9px',
        borderRadius: 'var(--radius-btn)',
        border: '1px solid var(--border-subtle)',
        background: 'transparent',
        color: stale ? 'var(--color-warning)' : 'var(--text-muted)',
        fontSize: 10,
        fontFamily: 'inherit',
        cursor: refreshing ? 'wait' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <RefreshCw
        size={11}
        style={{
          animation: refreshing ? 'spin 0.8s linear infinite' : undefined,
          flexShrink: 0,
        }}
      />
      {label || 'Actualiser'}
    </button>
  )
}
