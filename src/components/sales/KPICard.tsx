interface KPICardProps {
  label: string
  value: string
  sub?: string
  accent?: boolean
}

export function KPICard({ label, value, sub, accent }: KPICardProps) {
  return (
    <div style={{
      background: 'var(--card-bg)',
      backdropFilter: 'var(--card-blur)',
      WebkitBackdropFilter: 'var(--card-blur)',
      border: 'var(--card-border)',
      borderRadius: 'var(--card-radius)',
      boxShadow: 'var(--card-shadow)',
      padding: 'var(--card-padding)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 500, marginBottom: 12 }}>
        {label}
      </div>
      <div style={{
        fontSize: 'var(--fs-kpi)',
        fontWeight: 'var(--fw-kpi)' as React.CSSProperties['fontWeight'],
        letterSpacing: 'var(--ls-kpi)',
        lineHeight: 1,
        color: accent ? 'var(--accent)' : 'var(--text-primary)',
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 8 }}>{sub}</div>
      )}
    </div>
  )
}
