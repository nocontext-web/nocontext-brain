// Auto-sync Google Calendar and Gmail in the background
// Calendar: every 30 minutes, Gmail: every 2 hours

let started = false

export function startAutoSync() {
  if (started) return
  started = true

  const BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  async function syncCalendar() {
    try {
      await fetch(`${BASE}/api/sync/calendar`, { method: 'POST' })
      console.log('[auto-sync] Calendar synced at', new Date().toLocaleTimeString())
    } catch (e) {
      // No Google connected yet — silent fail
    }
  }

  async function syncGmail() {
    try {
      await fetch(`${BASE}/api/sync/gmail`, { method: 'POST' })
      console.log('[auto-sync] Gmail synced at', new Date().toLocaleTimeString())
    } catch (e) {
      // No Google connected yet — silent fail
    }
  }

  // Run immediately on startup
  syncCalendar()
  syncGmail()

  // Then on intervals
  setInterval(syncCalendar, 30 * 60 * 1000)   // every 30 min
  setInterval(syncGmail,    2 * 60 * 60 * 1000) // every 2 hours
}
