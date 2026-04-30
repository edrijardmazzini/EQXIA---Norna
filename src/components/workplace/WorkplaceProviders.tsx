'use client'

import type { ReactNode } from 'react'
import { ToastProvider } from './ToastProvider'

// Toasts uniquement — le data provider et le command palette sont gérés
// au niveau de NornaShell pour bien ordonner les contexts.
export function WorkplaceProviders({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}
