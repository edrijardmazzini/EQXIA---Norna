'use client'
import { useState, useEffect } from 'react'

export type ThemeMode = 'auto' | 'dark' | 'light'

const STORAGE_KEY = 'eqxia-theme-mode'

function applyTheme(mode: ThemeMode) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const effective = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode
  document.documentElement.setAttribute('data-theme', effective)
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>('auto')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
    const initial = saved ?? 'auto'
    setMode(initial)
    applyTheme(initial)

    // Watch system preference changes when in auto mode
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if ((localStorage.getItem(STORAGE_KEY) ?? 'auto') === 'auto') applyTheme('auto')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  function setTheme(next: ThemeMode) {
    setMode(next)
    localStorage.setItem(STORAGE_KEY, next)
    applyTheme(next)
  }

  function cycle() {
    const next: ThemeMode = mode === 'auto' ? 'dark' : mode === 'dark' ? 'light' : 'auto'
    setTheme(next)
  }

  return { mode, setTheme, cycle }
}
