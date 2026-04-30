'use client'

import type { ReactNode } from 'react'
import { ToastProvider } from './ToastProvider'
import { CommandPalette } from './CommandPalette'

export function WorkplaceProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <CommandPalette />
    </ToastProvider>
  )
}
