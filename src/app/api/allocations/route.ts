import { NextRequest, NextResponse } from 'next/server'

const NOTION_VERSION = '2022-06-28'
const ALLOCATIONS_DB_ID = process.env.NOTION_ALLOCATIONS_DB_ID || '7ae1822f-dfd0-41e0-9098-c03b97f93bd5'

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      name,
      personIds,
      projectIds,
      type,
      startDate,
      startHalf,
      endDate,
      endHalf,
      effortPct,
      status,
      leaveType,
      approvalStatus,
      approverIds,
      notes,
    } = body

    if (!personIds || !Array.isArray(personIds) || personIds.length === 0) {
      return NextResponse.json({ error: 'personIds requis' }, { status: 400 })
    }
    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate et endDate requis' }, { status: 400 })
    }

    const properties: Record<string, unknown> = {
      Name: { title: [{ text: { content: name || 'Allocation' } }] },
      Person: { relation: personIds.map((id: string) => ({ id })) },
      'Start Date': { date: { start: startDate } },
      'End Date': { date: { start: endDate } },
      Type: { select: { name: type || 'Project' } },
      'Start Half': { select: { name: startHalf || 'Morning' } },
      'End Half': { select: { name: endHalf || 'Afternoon' } },
      'Effort %': { number: Number(effortPct ?? 100) },
    }

    if (projectIds && Array.isArray(projectIds) && projectIds.length > 0) {
      properties['Project'] = { relation: projectIds.map((id: string) => ({ id })) }
    }
    if (status)         properties['Status']          = { select: { name: status } }
    if (leaveType)      properties['Leave Type']      = { select: { name: leaveType } }
    if (approvalStatus) properties['Approval Status'] = { select: { name: approvalStatus } }
    if (approverIds && Array.isArray(approverIds) && approverIds.length > 0) {
      properties['Approver'] = { relation: approverIds.map((id: string) => ({ id })) }
    }
    if (notes) {
      properties['Notes'] = { rich_text: [{ text: { content: String(notes) } }] }
    }

    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ parent: { database_id: ALLOCATIONS_DB_ID }, properties }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[norna] create allocation failed:', text)
      return NextResponse.json({ error: text }, { status: res.status })
    }

    const created = await res.json()
    return NextResponse.json({ ok: true, id: created.id })
  } catch (error: any) {
    console.error('[norna] allocation POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
