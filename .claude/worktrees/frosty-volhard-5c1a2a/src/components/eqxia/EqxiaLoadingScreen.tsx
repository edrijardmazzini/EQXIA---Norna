'use client'
import { useEffect, useState } from 'react'

export const DEFAULT_LOADING_TEXTS = [
  'Julienning', 'Alexing', 'Govining', 'Pierreling', 'Patening',
  'Guillosesting', 'Drijaring', 'Mazzining', 'Roding', 'Eqxing',
  'Kiting', 'Bumble-Beeing', 'Megatroning', 'Moonloying', 'Pragmacticing',
  'Beavering', 'Slash-compacting', 'Emiling', 'Sasching', 'Fiaking',
  'BodIAbuilding',
]

export const LOADING_WORDS_KEY = 'eqxia-loading-words'

function getActiveWords(): string[] {
  if (typeof window === 'undefined') return DEFAULT_LOADING_TEXTS
  try {
    const raw = localStorage.getItem(LOADING_WORDS_KEY)
    if (!raw) return DEFAULT_LOADING_TEXTS
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as string[]) : DEFAULT_LOADING_TEXTS
  } catch { return DEFAULT_LOADING_TEXTS }
}

interface EqxiaLoadingScreenProps {
  appName?: string
  bgImage?: string
}

export function EqxiaLoadingScreen({ appName, bgImage }: EqxiaLoadingScreenProps) {
  const [words] = useState<string[]>(getActiveWords)
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * getActiveWords().length))
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIdx(i => (i + 1) % words.length)
        setVisible(true)
      }, 150)
    }, 900)
    return () => clearInterval(id)
  }, [words.length])

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
            marginBottom: 28,
          }}>
            {appName}
          </div>
        )}

        {/* Spinner */}
        <div style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '2.5px solid rgba(166, 201, 206, 0.20)',
          borderTopColor: '#A6C9CE',
          animation: 'spin 0.75s linear infinite',
          marginBottom: 16,
        }} />

        {/* Texte tournant */}
        <div style={{
          color: '#A6C9CE',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 'var(--fs-md, 15px)',
          fontWeight: 500,
          letterSpacing: '0.05em',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.07s ease',
          minWidth: 260,
          userSelect: 'none',
        }}>
          {words[idx]}&hellip;
        </div>
      </div>
    </div>
  )
}
