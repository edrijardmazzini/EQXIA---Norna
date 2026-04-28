'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AppHeader } from '@/components/layout/AppHeader'
import { ReglagesContent } from '@/components/layout/ReglagesContent'

const ADMIN_EMAILS = new Set([
  'emile.drijardmazzini@eqxia.com',
  'alexandre.govin@eqxia.com',
])

function isAdmin(email: string | undefined | null): boolean {
  return !!email && ADMIN_EMAILS.has(email.toLowerCase())
}

export default function ReglagesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const allowed = isAdmin(session?.user?.email)

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') router.replace('/login')
    else if (!allowed) router.replace('/')
  }, [status, allowed, router])

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Chargement…
      </div>
    )
  }
  if (!allowed) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Redirection…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <AppHeader
        appName="Réglages"
        right={
          <a href="/" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', textDecoration: 'none', padding: '4px 10px', borderRadius: 'var(--radius-btn)', border: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}>
            ← Dashboard
          </a>
        }
      />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <ReglagesContent />
      </div>
    </div>
  )
}
