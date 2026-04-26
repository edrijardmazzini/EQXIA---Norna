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

    // Build clients lookup + structured list
    const clientsMap: Record<string, string> = {}
    const clients: Array<{ id: string; name: string }> = []
    for (const c of clientsRaw) {
      const titleProp = Object.values(c.properties as Record<string, any>).find((p: any) => p.type === "title") as any
      const name = titleProp?.title?.length > 0 ? titleProp.title.map((t: any) => t.plain_text).join("").trim() : ""
      if (name) {
        clientsMap[c.id] = name
        clients.push({ id: c.id, name })
      }
    }
    clients.sort((a, b) => a.name.localeCompare(b.name))

    // Build employees lookup + structured list (CJE, dates)
    const employeesMap: Record<string, string> = {}
    const employees: Array<{ id: string; name: string; cje: number; startDate: string; endDate: string; role: string; country: string; dateFirstSalary: string }> = []
    for (const e of employeesRaw) {
      const props = e.properties as Record<string, any>
      const titleProp = Object.values(props).find((p: any) => p.type === "title") as any
      const name = titleProp?.title?.length > 0 ? titleProp.title.map((t: any) => t.plain_text).join("").trim() : ""
      if (name) employeesMap[e.id] = name
      // Coût Journalier Entreprise (peut être formule ou number)
      let cje = 0
      const cjeProp = props["Coût Journalier Entreprise"] || props["Coût journalier entreprise"] || props["CJE"] || props["Cout Journalier Entreprise"]
      if (cjeProp) {
        if (cjeProp.type === "number") cje = cjeProp.number ?? 0
        else if (cjeProp.type === "formula") cje = getFormula(cjeProp) ?? 0
      }
      const startDate = getDate(props["Date d'entrée"] || props["Start Date"] || props["Date début"] || {})
      const endDate = getDate(props["Date de sortie"] || props["End Date"] || props["Date fin"] || {})
      const role = getSelect(props["Role"] || props["Rôle"] || {}) || getText(props["Role"] || props["Rôle"] || {})
      const country = getSelect(props["Country"] || props["Pays"] || {})
      const dateFirstSalary = getDate(props["Date Premier Salaire"] || props["Date premier salaire"] || props["First Salary Date"] || {})
      employees.push({ id: e.id, name, cje, startDate, endDate, role, country, dateFirstSalary })
    }

    // Parse projects
    const projects = projectsRaw.map((p: any) => {
      const props = p.properties
      // Commission : % (champ "% of commissions") et bénéficiaire (champ "Ad-hoc commissions 1 ? (eg training services)")
      let commissionPercent = 0
      const comPctProp = props["% of commissions"] || props["Commission %"] || props["Commission"]
      if (comPctProp) {
        if (comPctProp.type === "number") commissionPercent = comPctProp.number ?? 0
        else if (comPctProp.type === "formula") commissionPercent = getFormula(comPctProp) ?? 0
        else if (comPctProp.type === "percent" || comPctProp.type === "rollup") commissionPercent = comPctProp.percent ?? getFormula(comPctProp) ?? 0
      }
      // Owner / Phase / Team Members — champs utilisés pour la vérification de santé (Internal + tous types)
      let ownerIds: string[] = []
      let ownerName = ""
      const ownerProp = props["Owner"] || props["Project Owner"] || props["Responsable"]
      if (ownerProp) {
        if (ownerProp.type === "relation") {
          ownerIds = getRelationIds(ownerProp)
          ownerName = ownerIds.map(id => employeesMap[id] || "").filter(Boolean).join(", ")
        } else if (ownerProp.type === "people") {
          const people = ownerProp.people || []
          ownerIds = people.map((u: any) => u.id).filter(Boolean)
          ownerName = people.map((u: any) => u.name).filter(Boolean).join(", ")
        } else if (ownerProp.type === "select") {
          ownerName = getSelect(ownerProp)
        } else if (ownerProp.type === "rich_text" || ownerProp.type === "title") {
          ownerName = getText(ownerProp)
        }
      }
      const phase = getSelect(props["Phase"] || {}) || getText(props["Phase"] || {})
      let teamMemberIds: string[] = []
      let teamMemberNames = ""
      const teamProp = props["Team Members"] || props["Team"] || props["\u00c9quipe"] || props["Team members"]
      if (teamProp) {
        if (teamProp.type === "relation") {
          teamMemberIds = getRelationIds(teamProp)
          teamMemberNames = teamMemberIds.map(id => employeesMap[id] || "").filter(Boolean).join(", ")
        } else if (teamProp.type === "people") {
          const people = teamProp.people || []
          teamMemberIds = people.map((u: any) => u.id).filter(Boolean)
          teamMemberNames = people.map((u: any) => u.name).filter(Boolean).join(", ")
        } else if (teamProp.type === "multi_select") {
          teamMemberNames = (teamProp.multi_select || []).map((s: any) => s.name).join(", ")
        }
      }

      let commissionTo = ""
      const comToProp = props["Ad-hoc commissions 1 ? (eg training services)"] || props["Ad-hoc commissions 1"] || props["Commissionnaire"] || props["Commission à"]
      if (comToProp) {
        if (comToProp.type === "relation") {
          const ids = getRelationIds(comToProp)
          commissionTo = ids.map(id => employeesMap[id] || clientsMap[id] || "Inconnu").filter(Boolean).join(", ")
        } else if (comToProp.type === "select") commissionTo = getSelect(comToProp)
        else if (comToProp.type === "multi_select") commissionTo = (comToProp.multi_select || []).map((s: any) => s.name).join(", ")
        else if (comToProp.type === "people") commissionTo = (comToProp.people || []).map((u: any) => u.name).join(", ")
        else if (comToProp.type === "rich_text" || comToProp.type === "title") commissionTo = getText(comToProp)
        else if (comToProp.type === "status") commissionTo = comToProp.status?.name || ""
      }
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
        winAuto: (() => {
          const v = getFormula(props["% win (auto)"])
          return typeof v === "number" ? v : 0
        })(),
        riskLevel: getSelect(props["Risk Level"]),
        clientSatisfaction: getSelect(props["Client Satisfaction"]),
        startDate: getDate(props["Start Date"]),
        endDate: getDate(props["End Date"]),
        rentabilite: getFormula(props["Rentabilité (%)"]),
        netAmount: getFormula(props["Net amount"]),
        humanCost: getFormula(props["Human Internal Cost of project"]),
        clientIds: getRelationIds(props["Client"]),
        clientName: getRelationIds(props["Client"]).map(id => clientsMap[id] || "Inconnu").join(", ") || "N/A",
        ownerIds,
        ownerName,
        phase,
        teamMemberIds,
        teamMemberNames,
        commissionPercent,
        commissionTo,
        health: getFormula(props["Health"]) || "",
      }
    })

    // Parse dépenses
    const depenses = depensesRaw.map((d: any) => {
      const props = d.properties
      const payeParIds = getRelationIds(props["Payé par"])
      const payeParName = payeParIds.length > 0 ? (employeesMap[payeParIds[0]] || "Inconnu") : "Non attribué"

      // Recurring Critical (checkbox) — dépenses à projeter dans le futur
      const rcProp = props["Recurring Critical"] || props["Récurrent critique"] || props["Critical Recurring"]
      const recurringCritical = rcProp?.type === "checkbox" ? !!rcProp.checkbox : !!(rcProp?.checkbox ?? false)
      // Abonnement (Select) : nom canonique pour dédup recurring critical
      const abonnement = getSelect(props["Abonnement"] || props["Subscription"] || {})
      // Récurrence (Select) : "Mensuel" / "Annuel" — pilote le facteur mensuel
      const recurrence = getSelect(props["Récurrence"] || props["Recurrence"] || props["Periodicité"] || {})
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
        recurringCritical,
        abonnement,
        recurrence,
      }
    })

    return NextResponse.json({ projects, depenses, employees, clients })
  } catch (error: any) {
    console.error("Dashboard fetch error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
