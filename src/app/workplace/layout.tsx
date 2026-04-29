import type { ReactNode } from 'react'
import { AppHeader } from '@/components/layout/AppHeader'
import { WorkplaceSidebar } from '@/components/workplace/WorkplaceSidebar'

export default function WorkplaceLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-page)' }}>
      <AppHeader appName="Norna" />
      <div style={{ display: 'flex', flex: 1 }}>
        <WorkplaceSidebar />
        <main style={{ flex: 1, overflow: 'auto', padding: 'var(--content-py) var(--content-px)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
