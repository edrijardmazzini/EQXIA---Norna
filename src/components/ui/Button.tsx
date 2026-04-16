'use client'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  children: React.ReactNode
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
    border: '1px solid transparent',
  },
  secondary: {
    background: 'var(--btn-secondary-bg)',
    color: 'var(--btn-secondary-text)',
    border: '1px solid var(--border-panel)',
  },
  danger: {
    background: 'var(--btn-danger-bg)',
    color: 'var(--btn-danger-text)',
    border: '1px solid rgba(248,113,113,0.25)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
  },
}

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '4px 10px', fontSize: 'var(--fs-xs)' },
  md: { padding: '7px 14px', fontSize: 'var(--fs-sm)' },
  lg: { padding: '10px 20px', fontSize: 'var(--fs-base)' },
}

export function Button({ variant = 'secondary', size = 'md', loading, disabled, children, style, ...props }: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      disabled={isDisabled}
      style={{
        ...variantStyles[variant],
        ...sizeStyles[size],
        borderRadius: 'var(--radius-btn)',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.45 : 1,
        fontFamily: 'inherit',
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        transition: 'opacity 0.15s',
        ...style,
      }}
      {...props}
    >
      {loading && (
        <span style={{ width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
      )}
      {children}
    </button>
  )
}
