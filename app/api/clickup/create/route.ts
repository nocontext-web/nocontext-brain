import { NextRequest, NextResponse } from 'next/server'
import { resolveClickUpList, createClickUpTask } from '@/lib/clickup'
import type { ProposedTask } from '../../granola/sync/route'

export async function POST(req: NextRequest) {
  const { tasks } = await req.json() as { tasks: ProposedTask[] }

  if (!tasks?.length) return NextResponse.json({ error: 'No tasks provided' }, { status: 400 })

  const results = await Promise.all(
    tasks.map(async (task) => {
      const list = resolveClickUpList(task.assignee)
      if (!list) return { task: task.name, status: 'error' as const, error: `No ClickUp list for assignee "${task.assignee}"` }
      try {
        const created = await createClickUpTask({
          listId: list.listId,
          title: task.name,
          description: task.notes,
          assignee: task.assignee,
        })
        return { task: task.name, status: 'created' as const, ...created }
      } catch (err) {
        return {
          task: task.name,
          status: 'error' as const,
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
