const CLICKUP_BASE = 'https://api.clickup.com/api/v2'

export const CLICKUP_LISTS: Record<string, string> = {
  'content briefs': '901615693654',
  'editing briefs': '901615693655',
  'ad briefs': '901615693656',
  'proposals': '901615693647',
  'outreach': '901615693648',
  'active creators': '901615693649',
  'creator roster': '901615693650',
}

// Team member -> which ClickUp list their work lands in (mirrors nocontext-slack/hermes TEAM_LISTS)
export const TEAM_LISTS: Record<string, string> = {
  ellie: 'editing briefs',
  zoe: 'content briefs',
  molly: 'content briefs',
  ria: 'outreach',
  lever: 'ad briefs',
}

// When a team member accepts their ClickUp invite, add their user ID here so tasks assign to them directly.
// Until then, the task still lands in the right list, just unassigned.
const TEAM_IDS: Record<string, string> = {
  josh: '100851027',
  joshua: '100851027',
}

export function resolveClickUpList(assignee: string | null | undefined): { listKey: string; listId: string } | null {
  if (!assignee) return null
  const listKey = TEAM_LISTS[assignee.toLowerCase()]
  if (!listKey) return null
  return { listKey, listId: CLICKUP_LISTS[listKey] }
}

export async function createClickUpTask({ listId, title, description, assignee, dueDate }: {
  listId: string
  title: string
  description?: string
  assignee?: string | null
  dueDate?: string | null
}): Promise<{ id: string; url: string }> {
  const token = process.env.CLICKUP_API_KEY
  if (!token) throw new Error('CLICKUP_API_KEY not set')

  const body: Record<string, unknown> = { name: title, status: 'Open' }
  if (description) body.description = description
  if (assignee) {
    const uid = TEAM_IDS[assignee.toLowerCase()]
    if (uid) body.assignees = [Number(uid)]
  }
  if (dueDate) body.due_date = new Date(dueDate).getTime()

  const res = await fetch(`${CLICKUP_BASE}/list/${listId}/task`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.id) throw new Error(data?.err || `ClickUp error creating task: ${res.status}`)
  return { id: data.id, url: data.url }
}
