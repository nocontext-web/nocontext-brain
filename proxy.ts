import { NextRequest, NextResponse } from 'next/server'
import { authorized } from './lib/access'

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/api/health') return NextResponse.next()
  const header = request.headers.get('authorization') ?? ''
  if (!authorized(header, request.nextUrl.pathname)) {
    return new NextResponse('Sign in to the NO CONTEXT brain.', {
      status: 401, headers: { 'WWW-Authenticate': 'Basic realm="NO CONTEXT", charset="UTF-8"', 'Cache-Control': 'no-store' },
    })
  }
  // Browsers automatically resend Basic credentials. Block cross-origin
  // mutations so those credentials cannot be used by another website.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !header.startsWith('Bearer ')) {
    const origin = request.headers.get('origin')
    const expected = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    if (!origin || origin !== new URL(expected).origin) return new NextResponse('Invalid request origin', { status: 403 })
  }
  const response = NextResponse.next()
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'same-origin')
  return response
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
