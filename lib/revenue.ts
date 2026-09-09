export type RevenueClient = { id: string; name: string; status?: string | null; monthly_value?: number | string | null; next_action?: string | null }

export function monthlyValue(client: RevenueClient): number | null {
  if (client.monthly_value == null || client.monthly_value === '') return null
  const value = Number(client.monthly_value)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function revenueSummary(clients: RevenueClient[]) {
  const active = clients.filter(c => !c.status || c.status === 'active')
  const prospects = clients.filter(c => c.status === 'prospect')
  const contracted = active.reduce((sum, c) => sum + (monthlyValue(c) ?? 0), 0)
  const pipeline = prospects.reduce((sum, c) => sum + (monthlyValue(c) ?? 0), 0)
  return { active, prospects, contracted, pipeline, missing: active.filter(c => monthlyValue(c) == null).length }
}
