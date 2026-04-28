import type { Metadata } from 'next'
import SessionProvider from '@/components/providers/SessionProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Eqxia — Concordia',
  description: 'CRM & Pipeline — Eqxia',
  icons: { icon: '/eqxia-plutus-favicon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="icon" href="/eqxia-plutus-favicon.svg" type="image/svg+xml" />
      </head>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
