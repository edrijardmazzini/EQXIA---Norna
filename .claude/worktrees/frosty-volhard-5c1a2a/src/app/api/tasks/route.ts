import { NextRequest, NextResponse } from 'next/server'
import type { Task } from '@/types/sales'

const NOTION_VERSION = '2022-06-28'
const TASKS_DB_ID = process.env.NOTION_TASKS_DB_ID || '0360d820-7e6b-4379-9d87-9f38afa64e85'

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = Record<string, any>

function getText(prop: P): string {
  if (prop?.type === 'title') return prop.title?.map((t: P) => t.plain_text).join('') || ''
  if (prop?.type === 'rich_text') return prop.rich_text?.map((t: P) => t.plain_text).join('') || ''
  return ''
}
function getSelect(prop: P): string { return prop?.select?.name || '' }
function getDate(prop: P): string { return prop?.date?.start || '' }
function getRelationIds(prop: P): string[] { return prop?.relation?.map((r: P) => r.id) || [] }
function getPeople(prop: P): string {
  return prop?.people?.map((p: P) => p.name).join(', ') || ''
}

async function queryAll(dbId: string, filter?: Record<string, unknown>): Promise<P[]> {
  const results: P[] = []
  let cursor: string | undefined
  let hasMore = true
  while (hasMore) {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    if (filter) body.filter = filter
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST', headers: notionHeaders(), body: JSON.stringify(body),
    })
    if (!res.ok) { console.error('Tasks query failed:', await res.text()); break }
    const data = await res.json() as { results: P[]; has_more: boolean; next_cursor: string }
    results.push(...data.results)
    hasMore = data.has_more
    cursor = data.next_cursor
  }
  return results
}

function parseTask(c: P): Task {
  const props = c.properties as Record<string, P>
  return {
    id: c.id as string,
    name: getText(props['Name'] || props['Nom'] || Object.values(props).find((p) => p.type === 'title') || {}),
    status: getSelect(props['Status'] || props['Statut']),
    dueDate: getDate(props['Due Date'] || props['Échéance'] || props['Date']),
    assignedTo: getPeople(props['Assigned To'] || props['Assigné à'] || props['Assignee']),
    priority: getSelect(props['Priority'] || props['Priorité']),
    notes: getText(props['Notes'] || props['Description']),
    clientIds: getRelationIds(props['Client'] || props['Clients']),
    projectIds: getRelationIds(props['Project'] || props['Projet'] || props['Projects']),
    created: c.created_time?.slice(0, 10) || '',
  }
}

export async function GET(req: NextRequest) {
  if (!TASKS_DB_ID) return NextResponse.json({ tasks: [] })
  const clientId = req.nextUrl.searchParams.get('clientId')
  const projectId = req.nextUrl.searchParams.get('projectId')
  try {
    let filter: Record<string, unknown> | undefined
    if (clientId) filter = { property: 'Client', relation: { contains: clientId } }
    else if (projectId) filter = { property: 'Project', relation: { contains: projectId } }
    const raw = await queryAll(TASKS_DB_ID, filter)
    const tasks: Task[] = raw.map(parseTask).filter(t => t.name)
    return NextResponse.json({ tasks })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!TASKS_DB_ID) return NextResponse.json({ error: 'NOTION_TASKS_DB_ID not set' }, { status: 500 })
  try {
    const body = await req.json() as { name: string; status?: string; dueDate?: string; priority?: string; notes?: string; clientIds?: string[]; projectIds?: string[] }
    const properties: Record<string, unknown> = {
      Name: { title: [{ text: { content: body.name || '' } }] },
    }
    if (body.status) properties['Status'] = { select: { name: body.status } }
    if (body.dueDate) properties['Due Date'] = { date: { start: body.dueDate } }
    if (body.priority) properties['Priority'] = { select: { name: body.priority } }
    if (body.notes) properties['Notes'] = { rich_text: [{ text: { content: body.notes } }] }
    if (body.clientIds?.length) properties['Client'] = { relation: body.clientIds.map(id => ({ id })) }
    if (body.projectIds?.length) properties['Project'] = { relation: body.projectIds.map(id => ({ id })) }

    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers: notionHeaders(),
      body: JSON.stringify({ parent: { database_id: TASKS_DB_ID }, properties }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status })
    const created = await res.json() as { id: string }
    return NextResponse.json({ ok: true, id: created.id })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
