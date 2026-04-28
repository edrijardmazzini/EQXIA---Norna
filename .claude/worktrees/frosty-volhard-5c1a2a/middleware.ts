import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public assets and auth routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/assets') ||
    pathname.startsWith('/api/') ||
    pathname === '/favicon.ico' ||
    pathname === '/login'
  ) {
    return NextResponse.next()
  }

  // Skip auth check if NextAuth is not configured
  if (!process.env.NEXTAUTH_SECRET || !process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.next()
  }

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    const email = (token?.email as string) ?? ''

    if (!token || !email.endsWith('@eqxia.com')) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  } catch {
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets/).*)'],
}
