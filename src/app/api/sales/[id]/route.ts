import { NextRequest, NextResponse } from "next/server"

const NOTION_VERSION = "2022-06-28"

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const {
      status, nextAction, nextActionDate, decisionDate,
      budgetConfirmed, internalChampion, lostReason,
      winPercent, riskLevel,
    } = body

    const properties: Record<string, unknown> = {}
    if (status !== undefined) properties["Status"] = { select: { name: status } }
    if (nextAction !== undefined) properties["Next Action"] = nextAction ? { select: { name: nextAction } } : { select: null }
    if (nextActionDate !== undefined) properties["Next Action Date"] = nextActionDate ? { date: { start: nextActionDate } } : { date: null }
    if (decisionDate !== undefined) properties["Decision Date"] = decisionDate ? { date: { start: decisionDate } } : { date: null }
    if (budgetConfirmed !== undefined) properties["Budget Confirmed"] = { checkbox: !!budgetConfirmed }
    if (internalChampion !== undefined) properties["Internal Champion"] = { rich_text: [{ text: { content: internalChampion || "" } }] }
    if (lostReason !== undefined) properties["Lost Reason"] = lostReason ? { select: { name: lostReason } } : { select: null }
    if (winPercent !== undefined) properties["Win % (gut feeling)"] = { number: Number(winPercent) }
    if (riskLevel !== undefined) properties["Risk Level"] = riskLevel ? { select: { name: riskLevel } } : { select: null }

    const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      method: "PATCH",
      headers: notionHeaders(),
      body: JSON.stringify({ properties }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
