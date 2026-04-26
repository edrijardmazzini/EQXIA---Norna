'use client'
import { useEffect, useState } from 'react'

const LOADING_TEXTS = [
  'Julienning', 'Alexing', 'Govining', 'Pierreling', 'Patening',
  'Guillosesting', 'Drijaring', 'Mazzining', 'Roding', 'Eqxing',
  'Kiting', 'Bumble-Beeing', 'Megatroning', 'Moonloying', 'Pragmacticing',
  'Beavering', 'Slash-compacting', 'Emiling', 'Sasching', 'Fiaking',
]

interface EqxiaLoadingScreenProps {
  appName?: string
  bgImage?: string
}

export function EqxiaLoadingScreen({ appName, bgImage }: EqxiaLoadingScreenProps) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * LOADING_TEXTS.length))
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIdx(i => (i + 1) % LOADING_TEXTS.length)
        setVisible(true)
      }, 70)
    }, 300)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      backgroundImage: bgImage ? `url(${bgImage})` : undefined,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }}>
      {bgImage && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.32)' }} />}
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <img
          src="/assets/logos/eqxia-logo-teal-transparent.png"
          alt="EQXIA"
          className="logo-dark"
          style={{ height: 'var(--loading-logo-h, 140px)', marginBottom: 20 }}
        />
        <img
          src="/assets/logos/eqxia-logo-black-transparent.png"
          alt="EQXIA"
          className="logo-light"
          style={{ height: 'var(--loading-logo-h, 140px)', marginBottom: 20 }}
        />
        {appName && (
          <div style={{
            color: '#A6C9CE',
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 'var(--loading-app-fs, 24px)',
            fontWeight: 800,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            marginBottom: 32,
          }}>
            {appName}
          </div>
        )}
        <div style={{
          color: '#A6C9CE',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 'var(--fs-2xl, 24px)',
          fontWeight: 700,
          letterSpacing: '0.06em',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.07s ease',
          minWidth: 300,
          userSelect: 'none',
        }}>
          {LOADING_TEXTS[idx]}&hellip;
        </div>
      </div>
    </div>
  )
}
