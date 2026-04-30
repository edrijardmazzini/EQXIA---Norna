import type { ReactNode } from 'react'
import { NornaShell } from '@/components/workplace/NornaShell'

export default function WorkplaceLayout({ children }: { children: ReactNode }) {
  return <NornaShell>{children}</NornaShell>
}
