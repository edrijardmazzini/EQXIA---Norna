import { NextRequest, NextResponse } from 'next/server'
import type { Contact } from '@/types/sales'

const NOTION_VERSION = '2022-06-28'
const CONTACTS_DB_ID = process.env.NOTION_CONTACTS_DB_ID || 'f8488151-3f9f-4a1e-87c8-8e068a5eb4a8'

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
function getEmail(prop: P): string { return prop?.email || '' }
function getPhone(prop: P): string { return prop?.phone_number || '' }
function getUrl(prop: P): string { return prop?.url || '' }
function getSelect(prop: P): string { return prop?.select?.name || '' }
function getRelationIds(prop: P): string[] { return prop?.relation?.map((r: P) => r.id) || [] }

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
    if (!res.ok) { console.error('Contacts query failed:', await res.text()); break }
    const data = await res.json() as { results: P[]; has_more: boolean; next_cursor: string }
    results.push(...data.results)
    hasMore = data.has_more
    cursor = data.next_cursor
  }
  return results
}

function parseContact(c: P): Contact {
  const props = c.properties as Record<string, P>
  return {
    id: c.id as string,
    name: getText(props['Name'] || props['Nom'] || Object.values(props).find((p) => p.type === 'title') || {}),
    email: getEmail(props['Email']),
    phone: getPhone(props['Phone'] || props['Téléphone']),
    linkedin: getUrl(props['LinkedIn']),
    role: getSelect(props['Role'] || props['Rôle']) || getText(props['Role'] || props['Rôle'] || {}),
    notes: getText(props['Notes']),
    clientIds: getRelationIds(props['Client'] || props['Clients']),
  }
}

export async function GET(req: NextRequest) {
  if (!CONTACTS_DB_ID) return NextResponse.json({ contacts: [] })
  const clientId = req.nextUrl.searchParams.get('clientId')
  try {
    const filter = clientId
      ? { property: 'Client', relation: { contains: clientId } }
      : undefined
    const raw = await queryAll(CONTACTS_DB_ID, filter)
    const contacts: Contact[] = raw.map(parseContact).filter(c => c.name)
    return NextResponse.json({ contacts })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!CONTACTS_DB_ID) return NextResponse.json({ error: 'NOTION_CONTACTS_DB_ID not set' }, { status: 500 })
  try {
    const body = await req.json() as { name: string; email?: string; phone?: string; linkedin?: string; role?: string; notes?: string; clientIds?: string[] }
    const properties: Record<string, unknown> = {
      Name: { title: [{ text: { content: body.name || '' } }] },
    }
    if (body.email) properties['Email'] = { email: body.email }
    if (body.phone) properties['Phone'] = { phone_number: body.phone }
    if (body.linkedin) properties['LinkedIn'] = { url: body.linkedin }
    if (body.role) properties['Role'] = { select: { name: body.role } }
    if (body.notes) properties['Notes'] = { rich_text: [{ text: { content: body.notes } }] }
    if (body.clientIds?.length) properties['Client'] = { relation: body.clientIds.map(id => ({ id })) }

    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers: notionHeaders(),
      body: JSON.stringify({ parent: { database_id: CONTACTS_DB_ID }, properties }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status })
    const created = await res.json() as { id: string }
    return NextResponse.json({ ok: true, id: created.id })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
