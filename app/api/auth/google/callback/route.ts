import { equalSecret } from '@/lib/access'
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { supabase } from '@/lib/supabase'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const base = req.nextUrl.origin

  const state = req.nextUrl.searchParams.get('state') || ''
  if (!equalSecret(state, req.cookies.get('google_oauth_state')?.value)) return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 403 })

  if (!code) return NextResponse.redirect(`${base}/settings?error=no_code`)

  try {
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: userInfo } = await oauth2.userinfo.get()
    const email = userInfo.email!

    if (process.env.GOOGLE_ACCOUNT_EMAIL && email !== process.env.GOOGLE_ACCOUNT_EMAIL) return NextResponse.json({ error: 'Connect the configured Google account' }, { status: 403 })
    const { data: previous, error: readError } = await supabase.from('google_tokens').select('refresh_token').eq('email', email).maybeSingle()
    if (readError) throw new Error('Could not read Google connection')
    const { error: saveError } = await supabase.from('google_tokens').upsert({
      email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? previous?.refresh_token ?? '',
      expiry_date: tokens.expiry_date,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'email' })

    if (saveError) throw new Error('Google connection was not saved')
    const response = NextResponse.redirect(`${base}/settings?connected=true`)
    response.cookies.set('google_oauth_state', '', { maxAge: 0, path: '/api/auth/google' })
    return response
  } catch (err: any) {
    console.error('Google callback error:', err)
    return NextResponse.redirect(`${base}/settings?error=${encodeURIComponent(err.message)}`)
  }
}
