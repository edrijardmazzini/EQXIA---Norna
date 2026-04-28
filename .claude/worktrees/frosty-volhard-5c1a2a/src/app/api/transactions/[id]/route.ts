import { NextRequest, NextResponse } from "next/server"

const NOTION_VERSION = "2022-06-28"

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  }
}

function dateOrNull(v: string | null | undefined) {
  return v ? { date: { start: v } } : { date: null }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const {
      status, amount, currency,
      dateIssued, dateAccepted, datePaid,
      delayDays, description, notes, paymentMethod,
    } = body

    const properties: Record<string, unknown> = {}
    if (status != null)       properties["Status"]                   = { select: { name: status } }
    if (amount != null)       properties["Amount"]                   = { number: Number(amount) || 0 }
    if (currency)             properties["Currency"]                 = { select: { name: currency } }
    if (dateIssued !== undefined)  properties["Date Issued"]         = dateOrNull(dateIssued)
    if (dateAccepted !== undefined) properties["Date Accepted"]      = dateOrNull(dateAccepted)
    if (datePaid !== undefined)    properties["Date Paid"]           = dateOrNull(datePaid)
    if (delayDays != null)    properties["Delay of Payment (DAYS)"]  = { number: Number(delayDays) || 0 }
    if (description != null)  properties["Description"]              = { rich_text: [{ text: { content: description } }] }
    if (notes != null)        properties["Notes"]                    = { rich_text: [{ text: { content: notes } }] }
    if (paymentMethod)        properties["Payment Method"]           = { select: { name: paymentMethod } }

    const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      method: "PATCH",
      headers: notionHeaders(),
      body: JSON.stringify({ properties }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error("[transactions/PATCH]", text)
      return NextResponse.json({ error: text }, { status: res.status })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
