interface KPICardProps {
  label: string
  value: string
  sub?: string
  accent?: boolean
}

export function KPICard({ label, value, sub, accent }: KPICardProps) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-card)',
      padding: '18px 20px',
    }}>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  )
}
