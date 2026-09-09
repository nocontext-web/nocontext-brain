export function socialUrl(value: unknown, platform?: 'instagram' | 'tiktok'): string {
  if (typeof value !== 'string') throw new Error('A social URL is required')
  const url = new URL(value)
  const host = url.hostname.toLowerCase()
  const allowed = platform === 'instagram' ? ['instagram.com', 'www.instagram.com']
    : platform === 'tiktok' ? ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']
    : ['instagram.com', 'www.instagram.com', 'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com', 'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowed.includes(host)) throw new Error('Use a direct HTTPS Instagram, TikTok or YouTube link')
  url.hash = ''
  return url.href
}
