import { google } from 'googleapis'
import { supabase } from './supabase'

export async function getAuthClient() {
  let query = supabase.from('google_tokens').select('*')
  if (process.env.GOOGLE_ACCOUNT_EMAIL) query = query.eq('email', process.env.GOOGLE_ACCOUNT_EMAIL)
  const { data: accounts, error } = await query.limit(2)
  if (error) throw new Error('Google connection could not be read')
  if (!accounts?.length) throw new Error('Google not connected')
  if (accounts.length !== 1) throw new Error('Choose the Google account with GOOGLE_ACCOUNT_EMAIL')
  const data = accounts[0]

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  oauth2Client.setCredentials({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: data.expiry_date,
  })

  // Auto-refresh and save new token
  oauth2Client.on('tokens', async (tokens) => {
    await supabase.from('google_tokens').update({
      access_token: tokens.access_token,
      expiry_date: tokens.expiry_date,
      updated_at: new Date().toISOString(),
    }).eq('email', data.email)
  })

  return { auth: oauth2Client, email: data.email }
}
