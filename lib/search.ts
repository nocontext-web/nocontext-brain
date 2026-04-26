export async function webSearch(query: string, maxResults = 5): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return 'Web search not configured — add TAVILY_API_KEY to .env.local'

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: maxResults,
      include_answer: true,
    }),
  })

  if (!res.ok) return `Search failed: ${res.statusText}`

  const data = await res.json()

  const lines: string[] = []
  if (data.answer) lines.push(`**Summary:** ${data.answer}\n`)

  for (const r of data.results ?? []) {
    lines.push(`**${r.title}**\n${r.content}\nSource: ${r.url}\n`)
  }

  return lines.join('\n') || 'No results found.'
}
