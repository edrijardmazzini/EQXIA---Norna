import { NextRequest, NextResponse } from "next/server"

const NOTION_VERSION = "2022-06-28"

function headers() {
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
    const { name, status, type, methodology, currency, quotedAmount, finalAmount, startDate, endDate, clientSatisfaction, riskLevel, winPercent, clientIds, ownerIds, phase, teamMemberIds, commissionPercent, commissionTo } = body

    const properties: Record<string, unknown> = {}

    if (name != null) properties["Name"] = { title: [{ text: { content: name } }] }
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
    // Relation Client (accepte id unique string ou array)
    if (clientIds !== undefined) {
      const ids: string[] = Array.isArray(clientIds) ? clientIds : (clientIds ? [clientIds] : [])
      properties["Client"] = { relation: ids.map(id => ({ id })) }
    }
    if (commissionPercent != null && commissionPercent !== "") {
      properties["% of commissions"] = { number: Number(commissionPercent) || 0 }
    }
    if (commissionTo !== undefined && commissionTo !== "") {
      properties["Ad-hoc commissions 1 ? (eg training services)"] = { rich_text: [{ text: { content: String(commissionTo) } }] }
    }
    // Owner — tenté en relation (si c'est une relation → Employees)
    if (ownerIds !== undefined) {
      const ids: string[] = Array.isArray(ownerIds) ? ownerIds : (ownerIds ? [ownerIds] : [])
      properties["Owner"] = { relation: ids.map(id => ({ id })) }
    }
    if (phase !== undefined) {
      properties["Phase"] = phase ? { select: { name: String(phase) } } : { select: null }
    }
    // Team Members est un "person" (user picker Notion) — non éditable depuis le site
    // (nos IDs sont des Employees, pas des Notion users). On ignore teamMemberIds volontairement.
    void teamMemberIds

    const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ properties }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error("Notion update project failed:", text)
      return NextResponse.json({ error: text }, { status: res.status })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error("Update project error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
