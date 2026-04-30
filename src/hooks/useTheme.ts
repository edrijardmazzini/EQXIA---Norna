'use client'

import { useEffect, useState } from 'react'

export type ThemeMode = 'auto' | 'dark' | 'light'

const STORAGE_KEY = 'eqxia-theme'

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>('auto')

  // Load persisted preference on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
      if (stored === 'auto' || stored === 'dark' || stored === 'light') {
        setMode(stored)
      }
    } catch {}
  }, [])

  // Apply mode to <html> attribute and persist
  useEffect(() => {
    const root = document.documentElement
    if (mode === 'auto') {
      // Auto = follow system preference
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.setAttribute('data-theme', dark ? 'dark' : 'light')
    } else {
      root.setAttribute('data-theme', mode)
    }
    try { localStorage.setItem(STORAGE_KEY, mode) } catch {}
  }, [mode])

  // Listen for system pref changes when in auto mode
  useEffect(() => {
    if (mode !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  return { mode, setTheme: setMode }
}
