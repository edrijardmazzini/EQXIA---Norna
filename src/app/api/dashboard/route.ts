// ============================================================
// app/api/dashboard/route.ts — Fetch Projects + Dépenses from Notion
// ============================================================
import { NextResponse } from "next/server"

const NOTION_VERSION = "2022-06-28"
const PROJECTS_DB_ID = process.env.NOTION_PROJECTS_DB_ID || "15933668-ad6e-49ea-902b-1c6bc2bce3dc"
const DEPENSES_DB_ID = process.env.NOTION_DEPENSES_DB_ID || process.env.NOTION_DATABASE_ID || "5a6559c5-fb2e-4074-a9f3-046f1b563827"
const EMPLOYEES_DB_ID = process.env.NOTION_EMPLOYEES_DB_ID || "107cb251-a49b-45c3-806e-b0edf20f44ec"
const CLIENTS_DB_ID = process.env.NOTION_CLIENTS_DB_ID || "1c4a4860-b36e-4ca2-a243-57446accbe53"

function headers() {
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

    const res = await fetch(
      `https://api.notion.com/v1/databases/${dbId}/query`,
      { method: "POST", headers: headers(), body: JSON.stringify(body) }
    )

    if (!res.ok) {
      console.error(`Notion query failed for ${dbId}:`, await res.text())
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

function getSelect(prop: any): string {
  return prop?.select?.name || ""
}

function getNumber(prop: any): number {
  return prop?.number ?? 0
}

function getDate(prop: any): string {
  return prop?.date?.start || ""
}

function getRelationIds(prop: any): string[] {
  return prop?.relation?.map((r: any) => r.id) || []
}

function getFormula(prop: any): any {
  if (!prop?.formula) return null
  const f = prop.formula
  if (f.type === "number") return f.number
  if (f.type === "string") return f.string
  return null
}

export async function GET() {
  try {
    console.log(`[dashboard] Fetching: Projects=${PROJECTS_DB_ID}, Dépenses=${DEPENSES_DB_ID}, Employees=${EMPLOYEES_DB_ID}`)

    const [projectsRaw, depensesRaw, employeesRaw, clientsRaw] = await Promise.all([
      queryAll(PROJECTS_DB_ID),
      queryAll(DEPENSES_DB_ID),
      queryAll(EMPLOYEES_DB_ID),
      queryAll(CLIENTS_DB_ID),
    ])

    console.log(`[dashboard] Fetched: ${projectsRaw.length} projects, ${depensesRaw.length} dépenses, ${employeesRaw.length} employees, ${clientsRaw.length} clients`)

    // Build clients lookup
    const clientsMap: Record<string, string> = {}
    for (const c of clientsRaw) {
      const titleProp = Object.values(c.properties as Record<string, any>).find((p: any) => p.type === "title")
      if (titleProp?.title?.length > 0) {
        clientsMap[c.id] = titleProp.title.map((t: any) => t.plain_text).join("").trim()
      }
    }

    // Build employees lookup
    const employeesMap: Record<string, string> = {}
    for (const e of employeesRaw) {
      const titleProp = Object.values(e.properties as Record<string, any>).find((p: any) => p.type === "title")
      if (titleProp?.title?.length > 0) {
        employeesMap[e.id] = titleProp.title.map((t: any) => t.plain_text).join("").trim()
      }
    }

    // Parse projects
    const projects = projectsRaw.map((p: any) => {
      const props = p.properties
      return {
        id: p.id,
        name: getText(props["Name"]),
        status: getSelect(props["Status"]),
        type: getSelect(props["Type"]),
        methodology: getSelect(props["Methodology"]),
        currency: getSelect(props["Currency"]),
        quotedAmount: getNumber(props["Quoted Amount"]),
        finalAmount: getNumber(props["Final Amount"]),
        winPercent: getNumber(props["Win % (gut feeling)"]),
        riskLevel: getSelect(props["Risk Level"]),
        clientSatisfaction: getSelect(props["Client Satisfaction"]),
        startDate: getDate(props["Start Date"]),
        endDate: getDate(props["End Date"]),
        rentabilite: getFormula(props["Rentabilité (%)"]),
        netAmount: getFormula(props["Net amount"]),
        humanCost: getFormula(props["Human Internal Cost of project"]),
        clientIds: getRelationIds(props["Client"]),
        clientName: getRelationIds(props["Client"]).map(id => clientsMap[id] || "Inconnu").join(", ") || "N/A",
      }
    })

    // Parse dépenses
    const depenses = depensesRaw.map((d: any) => {
      const props = d.properties
      const payeParIds = getRelationIds(props["Payé par"])
      const payeParName = payeParIds.length > 0 ? (employeesMap[payeParIds[0]] || "Inconnu") : "Non attribué"

      return {
        id: d.id,
        description: getText(props["Description"]),
        date: getDate(props["Date"]),
        fournisseur: getText(props["Fournisseur"]),
        categorie: getSelect(props["Catégorie"]),
        sousCategorie: getSelect(props["Sous-catégorie"]),
        montant: getNumber(props["Montant"]),
        montantMUR: getNumber(props["Montant MUR"]),
        devise: getSelect(props["Devise"]),
        dossier: getText(props["Dossier"]),
        payePar: payeParName,
      }
    })

    return NextResponse.json({ projects, depenses })
  } catch (error: any) {
    console.error("Dashboard fetch error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
