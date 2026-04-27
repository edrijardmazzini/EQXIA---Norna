import { NextRequest, NextResponse } from 'next/server'

const NOTION_VERSION = '2022-06-28'

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json() as Record<string, unknown>

    const properties: Record<string, unknown> = {}

    if (body.name !== undefined) properties['Name'] = { title: [{ text: { content: body.name || '' } }] }
    if (body.status !== undefined) properties['Status'] = body.status ? { select: { name: body.status } } : { select: null }
    if (body.dueDate !== undefined) properties['Due Date'] = body.dueDate ? { date: { start: body.dueDate } } : { date: null }
    if (body.priority !== undefined) properties['Priority'] = body.priority ? { select: { name: body.priority } } : { select: null }
    if (body.notes !== undefined) properties['Notes'] = { rich_text: [{ text: { content: body.notes || '' } }] }
    if (body.clientIds !== undefined) properties['Client'] = { relation: (body.clientIds as string[]).map(cid => ({ id: cid })) }
    if (body.projectIds !== undefined) properties['Project'] = { relation: (body.projectIds as string[]).map(pid => ({ id: pid })) }

    const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      method: 'PATCH',
      headers: notionHeaders(),
      body: JSON.stringify({ properties }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
