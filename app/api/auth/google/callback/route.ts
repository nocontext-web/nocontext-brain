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

  if (!code) return NextResponse.redirect(`${base}/settings?error=no_code`)

  try {
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: userInfo } = await oauth2.userinfo.get()
    const email = userInfo.email!

    await supabase.from('google_tokens').upsert({
      email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? '',
      expiry_date: tokens.expiry_date,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'email' })

    return NextResponse.redirect(`${base}/settings?connected=true`)
  } catch (err: any) {
    console.error('Google callback error:', err)
    return NextResponse.redirect(`${base}/settings?error=${encodeURIComponent(err.message)}`)
  }
}
