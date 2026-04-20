import { NextRequest, NextResponse } from "next/server"

const NOTION_VERSION = "2022-06-28"
const PROJECTS_DB_ID = process.env.NOTION_PROJECTS_DB_ID || "15933668-ad6e-49ea-902b-1c6bc2bce3dc"

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, status, type, methodology, currency, quotedAmount, finalAmount, startDate, endDate, clientSatisfaction, riskLevel, winPercent, clientIds, commissionPercent, commissionTo } = body

    const properties: Record<string, unknown> = {
      Name: { title: [{ text: { content: name || "" } }] },
    }

    if (status) properties["Status"] = { select: { name: status } }
    if (type) properties["Type"] = { select: { name: type } }
    if (methodology) properties["Methodology"] = { select: { name: methodology } }
    if (currency) properties["Currency"] = { select: { name: currency } }
    if (quotedAmount != null) properties["Quoted Amount"] = { number: Number(quotedAmount) || 0 }
    if (finalAmount != null) properties["Final Amount"] = { number: Number(finalAmount) || 0 }
    if (winPercent != null) properties["Win % (gut feeling)"] = { number: Number(winPercent) || 0 }
    if (riskLevel) properties["Risk Level"] = { select: { name: riskLevel } }
    if (clientSatisfaction) properties["Client Satisfaction"] = { select: { name: clientSatisfaction } }
    if (startDate) properties["Start Date"] = { date: { start: startDate } }
    if (endDate) properties["End Date"] = { date: { start: endDate } }
    if (clientIds) {
      const ids: string[] = Array.isArray(clientIds) ? clientIds : [clientIds]
      properties["Client"] = { relation: ids.map(id => ({ id })) }
    }
    if (commissionPercent != null && commissionPercent !== "") {
      properties["% of commissions"] = { number: Number(commissionPercent) || 0 }
    }
    if (commissionTo) {
      properties["Ad-hoc commissions 1 ? (eg training services)"] = { rich_text: [{ text: { content: String(commissionTo) } }] }
    }

    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ parent: { database_id: PROJECTS_DB_ID }, properties }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error("Notion create project failed:", text)
      return NextResponse.json({ error: text }, { status: res.status })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error("Create project error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
