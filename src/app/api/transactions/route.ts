import { NextResponse } from "next/server"

const NOTION_VERSION = "2022-06-28"
const TRANSACTIONS_DB_ID = process.env.NOTION_TRANSACTIONS_DB_ID || "310a57193e3946fc941951f713c26e6d"

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
    if (!res.ok) {
      console.error(`[transactions] Notion query failed:`, await res.text())
      break
    }
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
function getNumber(prop: any): number { return typeof prop?.number === "number" ? prop.number : 0 }
function getDate(prop: any): string { return prop?.date?.start || "" }
function getFormulaDate(prop: any): string {
  if (prop?.type !== "formula") return ""
  const f = prop.formula
  if (!f) return ""
  if (f.type === "date") return f.date?.start || ""
  if (f.type === "string") return f.string || ""
  return ""
}
function getRelationId(prop: any): string {
  return prop?.relation?.[0]?.id || ""
}

export async function GET() {
  try {
    const rows = await queryAll(TRANSACTIONS_DB_ID)
    const transactions = rows.map(row => {
      const p = row.properties
      return {
        id: row.id as string,
        transactionNumber: getText(p["Transaction Number"]),
        type: getSelect(p["Type"]),
        status: getSelect(p["Status"]),
        amount: getNumber(p["Amount"]),
        currency: getSelect(p["Currency"]) || "MUR",
        dateIssued: getDate(p["Date Issued"]),
        dateAccepted: getDate(p["Date Accepted"]),
        dueDate: getFormulaDate(p["Due Date"]),
        datePaid: getDate(p["Date Paid"]),
        delayDays: getNumber(p["Delay of Payment (DAYS)"]),
        description: getText(p["Description"]),
        projectId: getRelationId(p["Project"]),
        clientId: getRelationId(p["Client"]),
        paymentMethod: getSelect(p["Payment Method"]),
        notes: getText(p["Notes"]),
      }
    })
    return NextResponse.json({ transactions })
  } catch (error: any) {
    console.error("[transactions] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
