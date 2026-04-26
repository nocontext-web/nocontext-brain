import { NextRequest, NextResponse } from 'next/server'
import type { ProposedTask } from '../../../api/granola/sync/route'

const ASANA_BASE = 'https://app.asana.com/api/1.0'
const ASANA_WORKSPACE = '1212334737336408'

async function createAsanaTask(task: ProposedTask): Promise<{ gid: string; permalink_url: string }> {
  const token = process.env.ASANA_TOKEN
  if (!token) throw new Error('ASANA_TOKEN not set')

  const body: Record<string, unknown> = {
    data: {
      name: task.name,
      workspace: ASANA_WORKSPACE,
      ...(task.assigneeGid && { assignee: task.assigneeGid }),
      ...(task.projectGid && { projects: [task.projectGid] }),
      ...(task.notes && { notes: task.notes }),
    },
  }

  const res = await fetch(`${ASANA_BASE}/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.errors?.[0]?.message || `Asana error ${res.status}`)
  }

  const data = await res.json()
  return {
    gid: data.data.gid,
    permalink_url: data.data.permalink_url ?? `https://app.asana.com/0/${task.projectGid ?? 0}/${data.data.gid}`,
  }
}

export async function POST(req: NextRequest) {
  const { tasks } = await req.json() as { tasks: ProposedTask[] }

  if (!tasks?.length) return NextResponse.json({ error: 'No tasks provided' }, { status: 400 })

  const results = await Promise.all(
    tasks.map(async (task) => {
      try {
        const created = await createAsanaTask(task)
        return { task: task.name, status: 'created', ...created }
      } catch (err) {
        return {
          task: task.name,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        }
      }
    })
  )

  return NextResponse.json({
    created: results.filter(r => r.status === 'created').length,
    results,
  })
}
