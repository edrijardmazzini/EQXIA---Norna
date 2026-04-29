'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, BarChart3, Umbrella, User, Zap, BrainCircuit } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/workplace',          label: 'Planification',  icon: CalendarDays },
  { href: '/workplace/capacity', label: 'Capacité',       icon: BarChart3 },
  { href: '/workplace/leaves',   label: 'Congés',         icon: Umbrella },
  { href: '/workplace/me',       label: 'Mon dashboard',  icon: User },
  { href: '/workplace/ai',       label: 'Assistant IA',   icon: BrainCircuit },
  { href: '/workplace/signals',  label: 'Signaux',        icon: Zap },
] as const

export function WorkplaceSidebar() {
  const pathname = usePathname()

  return (
    <nav style={{
      width: 200,
      flexShrink: 0,
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 8px',
      gap: 2,
      position: 'sticky',
      top: 'var(--header-height)',
      height: 'calc(100vh - var(--header-height))',
      overflowY: 'auto',
    }}>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = href === '/workplace'
          ? pathname === '/workplace'
          : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '7px 10px',
              borderRadius: 'var(--radius-btn)',
              fontSize: 'var(--fs-sm)',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              textDecoration: 'none',
              transition: 'background 0.12s, color 0.12s',
              borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
            }}
          >
            <Icon size={14} style={{ flexShrink: 0 }} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
