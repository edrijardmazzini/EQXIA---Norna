import { NextRequest, NextResponse } from "next/server"

const NOTION_VERSION = "2022-06-28"
const PROJECTS_DB_ID = process.env.NOTION_PROJECTS_DB_ID || "15933668-ad6e-49ea-902b-1c6bc2bce3dc"
const CLIENTS_DB_ID = process.env.NOTION_CLIENTS_DB_ID || "1c4a4860-b36e-4ca2-a243-57446accbe53"
const EMPLOYEES_DB_ID = process.env.NOTION_EMPLOYEES_DB_ID || "107cb251-a49b-45c3-806e-b0edf20f44ec"

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  }
}

async function queryAll(dbId: string): Promise<any[]> {
  const results: any[] = []
  let cursor: string | undefined
  let hasMore = true
  while (hasMore) {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify(body),
    })
    if (!res.ok) { console.error(`Notion query failed ${dbId}:`, await res.text()); break }
    const data = await res.json()
    results.push(...data.results)
    hasMore = data.has_more
    cursor = data.next_cursor
  }
  return results
}

function getText(prop: any): string {
  if (prop?.type === "title") return prop.title?.map((t: any) => t.plain_text).join("") || ""
  if (prop?.type === "rich_text") return prop.rich_text?.map((t: any) => t.plain_text).join("") || ""
  return ""
}
function getSelect(prop: any): string { return prop?.select?.name || "" }
function getNumber(prop: any): number { return prop?.number ?? 0 }
function getDate(prop: any): string { return prop?.date?.start || "" }
function getRelationIds(prop: any): string[] { return prop?.relation?.map((r: any) => r.id) || [] }
function getCheckbox(prop: any): boolean { return prop?.checkbox ?? false }
function getFormula(prop: any): number | string | null {
  if (!prop?.formula) return null
  const f = prop.formula
  if (f.type === "number") return f.number
  if (f.type === "string") return f.string
  return null
}

export async function GET() {
  try {
    const [projectsRaw, clientsRaw, employeesRaw] = await Promise.all([
      queryAll(PROJECTS_DB_ID),
      queryAll(CLIENTS_DB_ID),
      queryAll(EMPLOYEES_DB_ID),
    ])

    // Employees
    const employeesMap: Record<string, string> = {}
    const employees: { id: string; name: string }[] = []
    for (const e of employeesRaw) {
      const props = e.properties as Record<string, any>
      const titleProp = Object.values(props).find((p: any) => p.type === "title") as any
      const name = titleProp?.title?.map((t: any) => t.plain_text).join("").trim() || ""
      if (name) { employeesMap[e.id] = name; employees.push({ id: e.id, name }) }
    }
    employees.sort((a, b) => a.name.localeCompare(b.name))

    // Clients
    const clientsMap: Record<string, string> = {}
    const SAT_SCORE: Record<string, number> = { "Very Satisfied": 4, "Satisfied": 3, "Neutral": 2, "Dissatisfied": 1 }
    const UPSELL_SCORE: Record<string, number> = { "Very High": 5, "High": 4, "Medium": 3, "Low": 2, "Not Applicable": 1 }
    const clients = clientsRaw.map((c: any) => {
      const props = c.properties as Record<string, any>
      const titleProp = Object.values(props).find((p: any) => p.type === "title") as any
      const name = titleProp?.title?.map((t: any) => t.plain_text).join("").trim() || ""
      if (name) clientsMap[c.id] = name
      const sat = getSelect(props["Satisfaction"])
      const upsell = getSelect(props["Up/X-sell Potential"])
      const ltvRaw = getFormula(props["Lifetime Value"])
      return {
        id: c.id,
        name,
        status: getSelect(props["Status"]),
        satisfaction: sat,
        satisfactionScore: SAT_SCORE[sat] ?? 0,
        upXsellPotential: upsell,
        upXsellScore: UPSELL_SCORE[upsell] ?? 0,
        lifetimeValue: typeof ltvRaw === "number" ? ltvRaw : getNumber(props["Lifetime Value"]),
        lastTouchpointDate: getDate(props["Last Touchpoint Date"]),
        npsScore: getNumber(props["NPS Score"]),
        referralPotential: getSelect(props["Referral Potential"]),
      }
    }).filter((c: any) => c.name)
    clients.sort((a: any, b: any) => a.name.localeCompare(b.name))

    // Projects
    const projects = projectsRaw.map((p: any) => {
      const props = p.properties as Record<string, any>
      let ownerName = ""
      const ownerProp = props["Owner"]
      if (ownerProp?.type === "relation") {
        ownerName = getRelationIds(ownerProp).map((id: string) => employeesMap[id] || "").filter(Boolean).join(", ")
      } else if (ownerProp?.type === "people") {
        ownerName = (ownerProp.people || []).map((u: any) => u.name).filter(Boolean).join(", ")
      } else if (ownerProp?.type === "select") {
        ownerName = getSelect(ownerProp)
      }
      const clientIds = getRelationIds(props["Client"])
      const winAutoRaw = getFormula(props["% win (auto)"])
      const netRaw = getFormula(props["Net amount"])
      return {
        id: p.id,
        name: getText(props["Name"]),
        status: getSelect(props["Status"]),
        type: getSelect(props["Type"]),
        currency: getSelect(props["Currency"]) || "MUR",
        quotedAmount: getNumber(props["Quoted Amount"]),
        finalAmount: getNumber(props["Final Amount"]),
        winPercent: getNumber(props["Win % (gut feeling)"]),
        winAuto: typeof winAutoRaw === "number" ? winAutoRaw : 0,
        riskLevel: getSelect(props["Risk Level"]),
        nextAction: getSelect(props["Next Action"]),
        nextActionDate: getDate(props["Next Action Date"]),
        decisionDate: getDate(props["Decision Date"]),
        lostReason: getSelect(props["Lost Reason"]),
        budgetConfirmed: getCheckbox(props["Budget Confirmed"]),
        internalChampion: getText(props["Internal Champion"]),
        clientIds,
        clientName: clientIds.map((id: string) => clientsMap[id] || "").filter(Boolean).join(", ") || "N/A",
        ownerName,
        ownerIds: getRelationIds(props["Owner"]),
        created: p.created_time || "",
        netAmount: typeof netRaw === "number" ? netRaw : 0,
      }
    }).filter((p: any) => p.name)

    return NextResponse.json({ projects, clients, employees })
  } catch (error: any) {
    console.error("Sales GET error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, clientIds, type, quotedAmount, currency, ownerIds, nextAction, nextActionDate, winPercent } = body

    const properties: Record<string, unknown> = {
      Name: { title: [{ text: { content: name || "" } }] },
      Status: { select: { name: "Lead" } },
    }
    if (type) properties["Type"] = { select: { name: type } }
    if (currency) properties["Currency"] = { select: { name: currency } }
    if (quotedAmount != null) properties["Quoted Amount"] = { number: Number(quotedAmount) || 0 }
    properties["Win % (gut feeling)"] = { number: Number(winPercent) || 20 }
    if (nextAction) properties["Next Action"] = { select: { name: nextAction } }
    if (nextActionDate) properties["Next Action Date"] = { date: { start: nextActionDate } }
    if (Array.isArray(clientIds) && clientIds.length) {
      properties["Client"] = { relation: clientIds.map((id: string) => ({ id })) }
    }
    if (Array.isArray(ownerIds) && ownerIds.length) {
      properties["Owner"] = { relation: ownerIds.map((id: string) => ({ id })) }
    }

    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify({ parent: { database_id: PROJECTS_DB_ID }, properties }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status })
    const created = await res.json()
    return NextResponse.json({ ok: true, id: created.id })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
