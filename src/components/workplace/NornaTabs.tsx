'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, BarChart3, Briefcase, Zap, Umbrella, User, BrainCircuit } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/',         label: 'Planification', icon: CalendarDays },
  { href: '/capacity', label: 'Capacité',      icon: BarChart3 },
  { href: '/projects', label: 'Projets',       icon: Briefcase },
  { href: '/signals',  label: 'Signaux',       icon: Zap },
  { href: '/leaves',   label: 'Congés',        icon: Umbrella },
  { href: '/me',       label: 'Moi',           icon: User },
  { href: '/ai',       label: 'Assistant IA',  icon: BrainCircuit },
] as const

function isActiveTab(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  // /people/[id] est rattaché logiquement à Planification
  if (pathname.startsWith('/people') && href === '/') return true
  return pathname.startsWith(href)
}

export function NornaTabs() {
  const pathname = usePathname()

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'transparent' }}>
      <div style={{
        maxWidth: 'var(--content-max)',
        margin: '0 auto',
        padding: '0 var(--content-px)',
        display: 'flex',
        gap: 'var(--tab-gap)',
        alignItems: 'center',
        overflowX: 'auto',
      }}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActiveTab(href, pathname)
          return (
            <Link
              key={href}
              href={href}
              style={{
                padding: 'var(--tab-py) var(--tab-px)',
                fontSize: 'var(--tab-fs)',
                fontWeight: 'var(--tab-fw)' as React.CSSProperties['fontWeight'],
                color: active ? 'var(--tab-color-active)' : 'var(--tab-color)',
                borderBottom: `var(--tab-indicator) solid ${active ? 'var(--tab-color-active)' : 'transparent'}`,
                marginBottom: -1,
                transition: 'color 0.15s, border-color 0.15s',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={13} />
              {label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
