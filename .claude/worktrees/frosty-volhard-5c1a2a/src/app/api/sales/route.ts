import { NextRequest, NextResponse } from 'next/server'
import { fetchSalesData } from '@/lib/notion-sales'

const NOTION_VERSION = '2022-06-28'
const PROJECTS_DB_ID = process.env.NOTION_PROJECTS_DB_ID || 'c0167047-f3c2-45c3-99bd-6c170d207a96'

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

export async function GET() {
  try {
    const data = await fetchSalesData()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Sales GET error:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      name: string
      clientIds?: string[]
      type?: string
      quotedAmount?: number
      currency?: string
      ownerIds?: string[]
      nextAction?: string
      nextActionDate?: string
      winPercent?: number
    }
    const { name, clientIds, type, quotedAmount, currency, ownerIds, nextAction, nextActionDate, winPercent } = body

    const properties: Record<string, unknown> = {
      Name: { title: [{ text: { content: name || '' } }] },
      Status: { select: { name: 'Lead' } },
    }
    if (type) properties['Type'] = { select: { name: type } }
    if (currency) properties['Currency'] = { select: { name: currency } }
    if (quotedAmount != null) properties['Quoted Amount'] = { number: Number(quotedAmount) || 0 }
    properties['Win % (gut feeling)'] = { number: Number(winPercent) || 20 }
    if (nextAction) properties['Next Action'] = { select: { name: nextAction } }
    if (nextActionDate) properties['Next Action Date'] = { date: { start: nextActionDate } }
    if (Array.isArray(clientIds) && clientIds.length) {
      properties['Client'] = { relation: clientIds.map((id) => ({ id })) }
    }
    if (Array.isArray(ownerIds) && ownerIds.length) {
      properties['Owner'] = { relation: ownerIds.map((id) => ({ id })) }
    }

    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({ parent: { database_id: PROJECTS_DB_ID }, properties }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status })
    const created = await res.json() as { id: string }
    return NextResponse.json({ ok: true, id: created.id })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
