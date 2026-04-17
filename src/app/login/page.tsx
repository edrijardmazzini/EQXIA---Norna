'use client'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'

function LoginContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [bgImage] = useState('/assets/backgrounds/bg-ink-dark-moody.jpg')

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.email?.endsWith('@eqxia.com')) {
      const callbackUrl = searchParams.get('callbackUrl') ?? '/'
      router.replace(callbackUrl)
    }
  }, [status, session, router, searchParams])

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a2326' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #274A4F', borderTopColor: '#A6C9CE', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  const error = searchParams.get('error')

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center', fontFamily: '"Inter","Calibri",Arial,sans-serif' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 360, padding: 40 }}>
        <img src="/assets/logos/eqxia-logo-teal-transparent.png" alt="EQXIA" style={{ height: 160, marginBottom: 28, display: 'block', marginLeft: 'auto', marginRight: 'auto' }} />
        <div style={{ color: '#d0e1e2', fontSize: 28, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>Plutus</div>
        <div style={{ color: '#87A0A4', fontSize: 13, marginBottom: 32 }}>Dashboard financier</div>
        {error && (
          <div style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 20, color: '#f87171', fontSize: 12 }}>
            Accès refusé — Réservé aux comptes @eqxia.com
          </div>
        )}
        <button
          onClick={() => signIn('google', { callbackUrl: searchParams.get('callbackUrl') ?? '/' })}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%',
            padding: '12px 20px', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
            background: 'rgba(166,201,206,0.1)', color: '#d0e1e2',
            border: '1px solid rgba(166,201,206,0.3)', borderRadius: 10,
            cursor: 'pointer', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(166,201,206,0.2)'; e.currentTarget.style.borderColor = '#A6C9CE' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(166,201,206,0.1)'; e.currentTarget.style.borderColor = 'rgba(166,201,206,0.3)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Se connecter avec Google
        </button>
        <div style={{ color: '#53585F', fontSize: 11, marginTop: 16 }}>Réservé aux comptes @eqxia.com</div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#1a2326' }} />}>
      <LoginContent />
    </Suspense>
  )
}
