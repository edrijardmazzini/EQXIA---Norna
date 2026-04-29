import { NextRequest, NextResponse } from 'next/server'

const NOTION_VERSION = '2022-06-28'

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const properties: Record<string, unknown> = {}

    if (body.name !== undefined) {
      properties['Name'] = { title: [{ text: { content: String(body.name) } }] }
    }
    if (body.personIds !== undefined) {
      properties['Person'] = { relation: (body.personIds as string[]).map(pid => ({ id: pid })) }
    }
    if (body.projectIds !== undefined) {
      properties['Project'] = { relation: (body.projectIds as string[]).map(pid => ({ id: pid })) }
    }
    if (body.type !== undefined)           properties['Type']            = { select: { name: body.type } }
    if (body.startDate !== undefined)      properties['Start Date']      = { date: { start: body.startDate } }
    if (body.startHalf !== undefined)      properties['Start Half']      = { select: { name: body.startHalf } }
    if (body.endDate !== undefined)        properties['End Date']        = { date: { start: body.endDate } }
    if (body.endHalf !== undefined)        properties['End Half']        = { select: { name: body.endHalf } }
    if (body.effortPct !== undefined)      properties['Effort %']        = { number: Number(body.effortPct) }
    if (body.status !== undefined)         properties['Status']          = body.status ? { select: { name: body.status } } : { select: null }
    if (body.leaveType !== undefined)      properties['Leave Type']      = body.leaveType ? { select: { name: body.leaveType } } : { select: null }
    if (body.approvalStatus !== undefined) properties['Approval Status'] = body.approvalStatus ? { select: { name: body.approvalStatus } } : { select: null }
    if (body.approverIds !== undefined)    properties['Approver']        = { relation: (body.approverIds as string[]).map(pid => ({ id: pid })) }
    if (body.notes !== undefined)          properties['Notes']           = { rich_text: [{ text: { content: String(body.notes) } }] }

    const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ properties }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[norna] patch allocation failed:', text)
      return NextResponse.json({ error: text }, { status: res.status })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[norna] allocation PATCH error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // Notion = soft delete via "archived: true"
    const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ archived: true }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[norna] delete allocation failed:', text)
      return NextResponse.json({ error: text }, { status: res.status })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[norna] allocation DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
