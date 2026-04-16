'use client'

interface AppHeaderProps {
  appName: string
  right?: React.ReactNode
}

export function AppHeader({ appName, right }: AppHeaderProps) {
  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 10,
      height: 'var(--header-height)',
      background: 'var(--bg-header)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-panel)',
      padding: '0 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      {/* Left: logo + app name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <img
          src="/assets/logos/eqxia-logo-teal-transparent.png"
          className="logo-dark"
          style={{ height: 'var(--header-logo-h)' }}
          alt="EQXIA"
        />
        <img
          src="/assets/logos/eqxia-logo-black-transparent.png"
          className="logo-light"
          style={{ height: 'var(--header-logo-h)' }}
          alt="EQXIA"
        />
        <div style={{ width: 1, height: 16, background: 'var(--border-accent)' }} />
        <div style={{ fontSize: 'var(--header-app-fs)', color: 'var(--text-subtle)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {appName}
        </div>
      </div>

      {/* Right: custom slot */}
      {right && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {right}
        </div>
      )}
    </div>
  )
}
