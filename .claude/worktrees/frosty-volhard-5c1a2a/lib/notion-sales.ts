import type { Project, Client, Employee, SalesData } from '@/types/sales'

const NOTION_VERSION = '2022-06-28'
const PROJECTS_DB_ID = process.env.NOTION_PROJECTS_DB_ID || 'c0167047-f3c2-45c3-99bd-6c170d207a96'
const CLIENTS_DB_ID = process.env.NOTION_CLIENTS_DB_ID || '942e7bc6-f656-43c8-9af2-71a1365a060e'
const EMPLOYEES_DB_ID = process.env.NOTION_EMPLOYEES_DB_ID || '107cb251-a49b-45c3-806e-b0edf20f44ec'

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

async function queryAll(dbId: string): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = []
  let cursor: string | undefined
  let hasMore = true
  while (hasMore) {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify(body),
      next: { revalidate: 300 },
    })
    if (!res.ok) {
      console.error(`Notion query failed ${dbId}:`, await res.text())
      break
    }
    const data = await res.json() as { results: Record<string, unknown>[]; has_more: boolean; next_cursor: string }
    results.push(...data.results)
    hasMore = data.has_more
    cursor = data.next_cursor
  }
  return results
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionProp = Record<string, any>

function getText(prop: NotionProp): string {
  if (prop?.type === 'title') return prop.title?.map((t: NotionProp) => t.plain_text).join('') || ''
  if (prop?.type === 'rich_text') return prop.rich_text?.map((t: NotionProp) => t.plain_text).join('') || ''
  return ''
}
function getSelect(prop: NotionProp): string { return prop?.select?.name || '' }
function getMultiSelect(prop: NotionProp): string[] { return prop?.multi_select?.map((s: NotionProp) => s.name) || [] }
function getNumber(prop: NotionProp): number { return prop?.number ?? 0 }
function getDate(prop: NotionProp): string { return prop?.date?.start || '' }
function getRelationIds(prop: NotionProp): string[] { return prop?.relation?.map((r: NotionProp) => r.id) || [] }
function getCheckbox(prop: NotionProp): boolean { return prop?.checkbox ?? false }
function getPeople(prop: NotionProp): string {
  return (prop?.people || []).map((u: NotionProp) => u.name).filter(Boolean).join(', ')
}
function getFormula(prop: NotionProp): number | string | null {
  if (!prop?.formula) return null
  const f = prop.formula
  if (f.type === 'number') return f.number
  if (f.type === 'string') return f.string
  return null
}

const SAT_SCORE: Record<string, number> = {
  'Very Satisfied': 4, Satisfied: 3, Neutral: 2, Dissatisfied: 1,
}
const UPSELL_SCORE: Record<string, number> = {
  High: 3, Medium: 2, Low: 1,
}

export async function fetchSalesData(): Promise<SalesData> {
  const [projectsRaw, clientsRaw, employeesRaw] = await Promise.all([
    queryAll(PROJECTS_DB_ID),
    queryAll(CLIENTS_DB_ID),
    queryAll(EMPLOYEES_DB_ID),
  ])

  // Employees
  const employeesMap: Record<string, string> = {}
  const employees: Employee[] = []
  for (const e of employeesRaw) {
    const props = e.properties as Record<string, NotionProp>
    const titleProp = Object.values(props).find((p) => p.type === 'title') as NotionProp
    const name = titleProp?.title?.map((t: NotionProp) => t.plain_text).join('').trim() || ''
    if (name) { employeesMap[e.id as string] = name; employees.push({ id: e.id as string, name }) }
  }
  employees.sort((a, b) => a.name.localeCompare(b.name))

  // Clients
  const clientsMap: Record<string, string> = {}
  const clients: Client[] = clientsRaw.map((c) => {
    const props = c.properties as Record<string, NotionProp>
    const titleProp = Object.values(props).find((p) => p.type === 'title') as NotionProp
    const name = titleProp?.title?.map((t: NotionProp) => t.plain_text).join('').trim() || ''
    if (name) clientsMap[c.id as string] = name
    const sat = getSelect(props['Satisfaction'])
    const upsell = getSelect(props['Up/X-sell Potential'])
    const ltvRaw = getFormula(props['Lifetime Value'])
    const healthRaw = getFormula(props['Health'])
    const ownerProp = props['Relationship Owner']
    const relationshipOwner = ownerProp?.type === 'people' ? getPeople(ownerProp) : ''
    return {
      id: c.id as string,
      name,
      health: typeof healthRaw === 'string' ? healthRaw : '',
      lifetimeValue: typeof ltvRaw === 'number' ? ltvRaw : getNumber(props['Lifetime Value']),
      satisfaction: sat,
      satisfactionScore: SAT_SCORE[sat] ?? 0,
      sectors: getMultiSelect(props['Sector']),
      upXsellPotential: upsell,
      upXsellScore: UPSELL_SCORE[upsell] ?? 0,
      relationshipOwner,
      lastQualityReview: getDate(props['Last Quality Review']),
      lastTouchpointDate: getDate(props['Last Touchpoint Date']) || getDate(props['Last Quality Review']),
      projectIds: getRelationIds(props['Projects']),
      npsScore: getNumber(props['NPS Score']),
      referralPotential: getSelect(props['Referral Potential']),
    } satisfies Client
  }).filter((c) => c.name)
  clients.sort((a, b) => a.name.localeCompare(b.name))

  // Projects
  const projects: Project[] = projectsRaw.map((p) => {
    const props = p.properties as Record<string, NotionProp>
    let ownerName = ''
    const ownerProp = props['Owner']
    if (ownerProp?.type === 'relation') {
      ownerName = getRelationIds(ownerProp).map((id) => employeesMap[id] || '').filter(Boolean).join(', ')
    } else if (ownerProp?.type === 'people') {
      ownerName = getPeople(ownerProp)
    }
    const clientIds = getRelationIds(props['Client'])
    const winAutoRaw = getFormula(props['% win (auto)'])
    const netRaw = getFormula(props['Net amount'])
    const healthRaw = getFormula(props['Health'])
    const daysRaw = getFormula(props['Days in Current Stage'])
    return {
      id: p.id as string,
      name: getText(props['Name']),
      status: getSelect(props['Status']),
      type: getSelect(props['Type']),
      currency: getSelect(props['Currency']) || 'MUR',
      quotedAmount: getNumber(props['Quoted Amount']),
      finalAmount: getNumber(props['Final Amount']),
      winPercent: getNumber(props['Win % (gut feeling)']),
      winAuto: typeof winAutoRaw === 'number' ? winAutoRaw : 0,
      health: typeof healthRaw === 'string' ? healthRaw : '',
      daysInCurrentStage: typeof daysRaw === 'number' ? daysRaw : 0,
      sourceLead: getSelect(props['Source Lead']),
      nextAction: getSelect(props['Next Action']),
      nextActionDate: getDate(props['Next Action Date']),
      expectedCloseDate: getDate(props['Expected Close Date']),
      lostReason: getSelect(props['Lost Reason']),
      clientIds,
      clientName: clientIds.map((id) => clientsMap[id] || '').filter(Boolean).join(', ') || 'N/A',
      ownerName,
      ownerIds: getRelationIds(props['Owner']),
      created: p.created_time as string || '',
      startDate: getDate(props['Start Date']),
      endDate: getDate(props['End Date']),
      dateQualified: getDate(props['Date Qualified']),
      dateScoping: getDate(props['Date Scoping']),
      dateProposalSent: getDate(props['Date Proposal Sent']),
      dateNegotiation: getDate(props['Date Negotiation']),
      dateVerbalCommitment: getDate(props['Date Verbal Commitment']),
      dateClosed: getDate(props['Date Closed']),
      dateOnHold: getDate(props['Date On Hold']),
      // Legacy
      decisionDate: getDate(props['Expected Close Date']) || getDate(props['Date Closed']),
      riskLevel: getSelect(props['Risk Level']),
      budgetConfirmed: getCheckbox(props['Budget Confirmed']),
      internalChampion: getText(props['Internal Champion']),
      netAmount: typeof netRaw === 'number' ? netRaw : 0,
    } satisfies Project
  }).filter((p) => p.name)

  return { projects, clients, employees }
}
