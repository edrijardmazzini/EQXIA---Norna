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

    if (body.status !== undefined) properties['Status'] = { select: { name: body.status } }
    if (body.nextAction !== undefined) properties['Next Action'] = body.nextAction ? { select: { name: body.nextAction } } : { select: null }
    if (body.nextActionDate !== undefined) properties['Next Action Date'] = body.nextActionDate ? { date: { start: body.nextActionDate } } : { date: null }
    if (body.expectedCloseDate !== undefined) properties['Expected Close Date'] = body.expectedCloseDate ? { date: { start: body.expectedCloseDate } } : { date: null }
    if (body.decisionDate !== undefined) properties['Expected Close Date'] = body.decisionDate ? { date: { start: body.decisionDate } } : { date: null }
    if (body.lostReason !== undefined) properties['Lost Reason'] = body.lostReason ? { select: { name: body.lostReason } } : { select: null }
    if (body.winPercent !== undefined) properties['Win % (gut feeling)'] = { number: Number(body.winPercent) }
    if (body.budgetConfirmed !== undefined) properties['Budget Confirmed'] = { checkbox: !!body.budgetConfirmed }
    if (body.internalChampion !== undefined) properties['Internal Champion'] = { rich_text: [{ text: { content: body.internalChampion || '' } }] }
    if (body.riskLevel !== undefined) properties['Risk Level'] = body.riskLevel ? { select: { name: body.riskLevel } } : { select: null }
    if (body.sourceLead !== undefined) properties['Source Lead'] = body.sourceLead ? { select: { name: body.sourceLead } } : { select: null }
    if (body.quotedAmount !== undefined) properties['Quoted Amount'] = { number: Number(body.quotedAmount) }
    if (body.finalAmount !== undefined) properties['Final Amount'] = { number: Number(body.finalAmount) }
    if (body.name != null && body.name !== '') properties['Name'] = { title: [{ text: { content: String(body.name) } }] }
    if (body.type) properties['Type'] = { select: { name: body.type } }
    if (body.currency) properties['Currency'] = { select: { name: body.currency } }
    if (body.startDate !== undefined) properties['Start Date'] = body.startDate ? { date: { start: body.startDate } } : { date: null }
    if (body.endDate !== undefined) properties['End Date'] = body.endDate ? { date: { start: body.endDate } } : { date: null }

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
