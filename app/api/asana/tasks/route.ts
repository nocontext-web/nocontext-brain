import { NextResponse } from 'next/server'

const ASANA_TOKEN = process.env.ASANA_TOKEN
const BASE = 'https://app.asana.com/api/1.0'

async function asana(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${ASANA_TOKEN}`,
      'Accept': 'application/json',
    },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`Asana ${path} → ${res.status}`)
  const json = await res.json()
  return json.data
}

export async function GET() {
  if (!ASANA_TOKEN) {
    return NextResponse.json({ error: 'ASANA_TOKEN not set' }, { status: 500 })
  }

  try {
    // Get workspaces — target NO*CONTEXT, not the first one
    const workspaces = await asana('/workspaces')
    if (!workspaces?.length) return NextResponse.json({ members: [], projects: [] })
    const pinned = process.env.ASANA_WORKSPACE_GID
    const workspace = pinned
      ? workspaces.find((w: { gid: string }) => w.gid === pinned)
      : workspaces.find((w: { name: string }) => w.name.toLowerCase().includes('context')) ?? workspaces[0]
    const workspaceGid = workspace.gid

    // Fetch workspace members and incomplete tasks in parallel
    const [membersRaw, projectsRaw] = await Promise.all([
      asana(`/workspaces/${workspaceGid}/users`),
      asana(`/workspaces/${workspaceGid}/projects?archived=false&limit=100`),
    ])

    // Fetch all tasks across all projects (incomplete, with assignee + due date)
    const projectTasks = await Promise.all(
      (projectsRaw ?? []).map(async (project: { gid: string; name: string; color?: string }) => {
        try {
          const tasks = await asana(
            `/tasks?project=${project.gid}&completed_since=now&opt_fields=gid,name,assignee,assignee.name,assignee.gid,due_on,completed,notes,permalink_url&limit=100`
          )
          return { project, tasks: tasks ?? [] }
        } catch {
          return { project, tasks: [] }
        }
      })
    )

    // Flatten all tasks and index by assignee
    const tasksByAssignee: Record<string, {
      assignee: { gid: string; name: string }
      tasks: Array<{
        gid: string
        name: string
        project: string
        projectColor: string
        due_on: string | null
        permalink_url: string
      }>
    }> = {}

    const unassignedTasks: Array<{
      gid: string
      name: string
      project: string
      projectColor: string
      due_on: string | null
      permalink_url: string
    }> = []

    for (const { project, tasks } of projectTasks) {
      for (const task of tasks) {
        if (task.completed) continue
        const entry = {
          gid: task.gid,
          name: task.name,
          project: project.name,
          projectColor: project.color ?? 'none',
          due_on: task.due_on ?? null,
          permalink_url: task.permalink_url ?? `https://app.asana.com/0/${project.gid}/${task.gid}`,
        }
        if (task.assignee?.gid) {
          const key = task.assignee.gid
          if (!tasksByAssignee[key]) {
            tasksByAssignee[key] = { assignee: { gid: task.assignee.gid, name: task.assignee.name }, tasks: [] }
          }
          tasksByAssignee[key].tasks.push(entry)
        } else {
          unassignedTasks.push(entry)
        }
      }
    }

    const members = Object.values(tasksByAssignee).sort((a, b) =>
      a.assignee.name.localeCompare(b.assignee.name)
    )

    // Add unassigned bucket if there are any
    const result = unassignedTasks.length > 0
      ? [...members, { assignee: { gid: 'unassigned', name: 'Unassigned' }, tasks: unassignedTasks }]
      : members

    return NextResponse.json({ members: result, fetched_at: new Date().toISOString() })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
