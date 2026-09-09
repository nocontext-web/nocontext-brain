export function clientInput(body: unknown, creating = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected client fields')
  const fields = body as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of ['name','website','instagram','tiktok','brief','notes','north_star','research_notes','next_action','context_notes']) {
    if (!(key in fields)) continue
    if (fields[key] !== null && typeof fields[key] !== 'string') throw new Error(`Invalid ${key}`)
    result[key] = typeof fields[key] === 'string' ? fields[key].trim() : null
  }
  if ((creating || 'name' in fields) && (typeof result.name !== 'string' || !result.name)) throw new Error('Client name is required')
  if ('status' in fields) {
    if (!['active','prospect','paused','adhoc','churned'].includes(String(fields.status))) throw new Error('Invalid client status')
    result.status = fields.status
  }
  if ('monthly_value' in fields) {
    if (fields.monthly_value !== null && (typeof fields.monthly_value !== 'number' || !Number.isFinite(fields.monthly_value) || fields.monthly_value < 0)) throw new Error('Invalid monthly retainer')
    result.monthly_value = fields.monthly_value
  }
  if ('services' in fields) {
    if (!Array.isArray(fields.services) || fields.services.some(s => typeof s !== 'string')) throw new Error('Invalid services')
    result.services = fields.services
  }
  if (!Object.keys(result).length) throw new Error('No supported client fields')
  return result
}
