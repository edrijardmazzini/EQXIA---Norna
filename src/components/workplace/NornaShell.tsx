'use client'

import { type ReactNode, useEffect, useState, createContext, useContext } from 'react'
import { Monitor, Moon, Sun, Search } from 'lucide-react'
import { AppHeader } from '@/components/layout/AppHeader'
import { NornaTabs } from './NornaTabs'
import { WorkplaceProviders } from './WorkplaceProviders'
import { WorkplaceDataProvider } from './WorkplaceDataProvider'
import { CommandPalette } from './CommandPalette'
import { useTheme } from '@/hooks/useTheme'

const BG_IMAGES = [
  '/assets/backgrounds/bg-ice-surface-light.jpg',
  '/assets/backgrounds/bg-sediment-blue-white.jpg',
  '/assets/backgrounds/bg-ink-teal-copper.jpg',
  '/assets/backgrounds/bg-glacial-river-teal.jpg',
  '/assets/backgrounds/bg-confluence-streams.jpg',
  '/assets/backgrounds/bg-glacial-teal-copper.jpg',
]

const THEME_ICONS = { auto: Monitor, dark: Moon, light: Sun } as const

// Bg image partagé avec NornaLoadingScreen pour cohérence visuelle
const BgImageContext = createContext<string>('')
export function useBgImage(): string { return useContext(BgImageContext) }

export function NornaShell({ children }: { children: ReactNode }) {
  const { mode, setTheme } = useTheme()
  const [bgImage, setBgImage] = useState(BG_IMAGES[0])
  const [themeOpen, setThemeOpen] = useState(false)
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setBgImage(BG_IMAGES[Math.floor(Math.random() * BG_IMAGES.length)])
    setNow(new Date())
  }, [])

  const ActiveThemeIcon = THEME_ICONS[mode]

  return (
    <BgImageContext.Provider value={bgImage}>
      <WorkplaceProviders>
        <WorkplaceDataProvider>
          <CommandPalette />
        <div style={{
          minHeight: '100vh',
          backgroundImage: `url(${bgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
          position: 'relative',
        }}>
          {/* Soft overlay pour la lisibilité */}
          <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', zIndex: 0, pointerEvents: 'none' }} />

          <div style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
            color: 'var(--text-primary)',
          }}>
            <AppHeader
              appName="Norna"
              right={
                now && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ textAlign: 'right', lineHeight: 1.1 }}>
                      <div style={{
                        fontSize: 'var(--fs-2xs)',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        fontWeight: 600,
                      }}>
                        {now.toLocaleDateString('fr-FR', { weekday: 'long' })}
                      </div>
                      <div style={{
                        fontSize: 'var(--fs-sm)',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                        fontFamily: 'monospace',
                      }}>
                        {now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 9px',
                      borderRadius: 'var(--radius-btn)',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-muted)',
                      fontSize: 10,
                      fontFamily: 'monospace',
                      whiteSpace: 'nowrap',
                    }}>
                      <Search size={10} /> ⌘K
                    </span>
                  </div>
                )
              }
            />

            <NornaTabs />

            <main style={{
              flex: 1,
              maxWidth: 'var(--content-max)',
              margin: '0 auto',
              padding: 'var(--content-py) var(--content-px)',
              width: '100%',
            }}>
              {children}
            </main>
          </div>

          {/* Theme toggle flottant — bottom-left */}
          <div style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 100 }}>
            <div style={{ position: 'relative' }}>
              {themeOpen && (
                <>
                  <div onClick={() => setThemeOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
                  <div style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    zIndex: 99,
                    background: 'var(--bg-panel)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid var(--border-panel)',
                    borderRadius: 10,
                    padding: 4,
                    boxShadow: 'var(--shadow-card)',
                  }}>
                    {(['auto', 'dark', 'light'] as const).map(m => {
                      const Icon = THEME_ICONS[m]
                      const active = mode === m
                      return (
                        <button
                          key={m}
                          onClick={() => { setTheme(m); setThemeOpen(false) }}
                          title={m === 'auto' ? 'Auto (système)' : m === 'dark' ? 'Sombre' : 'Clair'}
                          style={{
                            width: 36,
                            height: 36,
                            background: active ? 'var(--accent-soft)' : 'none',
                            border: 'none',
                            borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                            borderRadius: 6,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s',
                            opacity: active ? 1 : 0.5,
                            color: 'var(--text-primary)',
                          }}
                        >
                          <Icon size={15} />
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
              <button
                onClick={() => setThemeOpen(t => !t)}
                title="Thème"
                style={{
                  width: 36,
                  height: 36,
                  background: 'var(--bg-panel)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid var(--border-panel)',
                  borderRadius: 10,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'var(--shadow-card)',
                  color: 'var(--text-primary)',
                }}
              >
                <ActiveThemeIcon size={15} />
              </button>
            </div>
          </div>
        </div>
        </WorkplaceDataProvider>
      </WorkplaceProviders>
    </BgImageContext.Provider>
  )
}
