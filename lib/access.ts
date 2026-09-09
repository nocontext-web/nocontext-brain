import { timingSafeEqual } from 'node:crypto'

export function equalSecret(actual: string, expected: string | undefined) {
  if (!expected) return false
  const left = Buffer.from(actual), right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function authorized(header: string, path: string, env: NodeJS.ProcessEnv = process.env) {
  if (path.startsWith('/api/') && header.startsWith('Bearer ') && equalSecret(header.slice(7), env.BRAIN_SERVICE_TOKEN)) return true
  if (!header.startsWith('Basic ') || !env.BRAIN_AUTH_USER || !env.BRAIN_AUTH_PASSWORD) return false
  try {
    return equalSecret(Buffer.from(header.slice(6), 'base64').toString(), `${env.BRAIN_AUTH_USER}:${env.BRAIN_AUTH_PASSWORD}`)
  } catch { return false }
}
