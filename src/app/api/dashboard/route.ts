import { NextResponse } from 'next/server'
import type { WorkplaceEmployee, WorkplaceProject, Allocation, TimeEntry } from '@/types/workplace'

const NOTION_VERSION = '2022-06-28'
const EMPLOYEES_DB_ID    = process.env.NOTION_EMPLOYEES_DB_ID    || '107cb251-a49b-45c3-806e-b0edf20f44ec'
const PROJECTS_DB_ID     = process.env.NOTION_PROJECTS_DB_ID     || '15933668-ad6e-49ea-902b-1c6bc2bce3dc'
const ALLOCATIONS_DB_ID  = process.env.NOTION_ALLOCATIONS_DB_ID  || '7ae1822f-dfd0-41e0-9098-c03b97f93bd5'
const CLIENTS_DB_ID      = process.env.NOTION_CLIENTS_DB_ID      || '1c4a4860-b36e-4ca2-a243-57446accbe53'
const TIME_ENTRIES_DB_ID = process.env.NOTION_TIME_ENTRIES_DB_ID || '61d3d22e-530c-493c-96cd-8f827355420a'

// Fenêtre de fetch des time entries : 90 jours en arrière (pour comparer planifié vs réalisé)
const TIME_ENTRIES_WINDOW_DAYS = 90

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

async function queryAll(dbId: string, filter?: Record<string, unknown>): Promise<any[]> {
  const results: any[] = []
  let cursor: string | undefined
  let hasMore = true

  while (hasMore) {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    if (filter) body.filter = filter

    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      console.error(`[norna] Notion query failed for ${dbId}:`, await res.text())
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
  if (prop?.type === 'title')      return prop.title?.map((t: any) => t.plain_text).join('') || ''
  if (prop?.type === 'rich_text')  return prop.rich_text?.map((t: any) => t.plain_text).join('') || ''
  return ''
}

function getSelect(prop: any): string {
  return prop?.select?.name || ''
}

function getMultiSelect(prop: any): string[] {
  return prop?.multi_select?.map((s: any) => s.name) || []
}

function getNumber(prop: any): number {
  return prop?.number ?? 0
}

function getDate(prop: any): string {
  return prop?.date?.start || ''
}

function getRelationIds(prop: any): string[] {
  return prop?.relation?.map((r: any) => r.id) || []
}

const ACTIVE_PROJECT_STATUSES = new Set([
  'Lead', 'Qualified', 'Scoping', 'Proposal Sent', 'Negotiation',
  'Verbal Commitment', 'Won', 'Active', 'On Hold', 'Identified',
])

export async function GET() {
  try {
    // Borne basse pour les time entries
    const timeEntriesFrom = new Date()
    timeEntriesFrom.setDate(timeEntriesFrom.getDate() - TIME_ENTRIES_WINDOW_DAYS)
    const timeEntriesFromStr = timeEntriesFrom.toISOString().slice(0, 10)

    const [employeesRaw, projectsRaw, allocationsRaw, clientsRaw, timeEntriesRaw] = await Promise.all([
      queryAll(EMPLOYEES_DB_ID),
      queryAll(PROJECTS_DB_ID),
      queryAll(ALLOCATIONS_DB_ID),
      queryAll(CLIENTS_DB_ID),
      queryAll(TIME_ENTRIES_DB_ID, {
        property: 'Period',
        date: { on_or_after: timeEntriesFromStr },
      }),
    ])

    // Full employees lookup (incluant les Departed pour résoudre les owners legacy)
    const employeesMap: Record<string, string> = {}
    const allEmployees = employeesRaw
      .map((e: any) => {
        const props = e.properties as Record<string, any>
        const titleProp = Object.values(props).find((p: any) => p.type === 'title') as any
        const name = titleProp?.title?.map((t: any) => t.plain_text).join('').trim() || ''
        if (name) employeesMap[e.id] = name
        return { raw: e, name, status: getSelect(props['Status']) }
      })
      .filter(x => x.name)

    // Active employees only (returned to front)
    const employees: WorkplaceEmployee[] = allEmployees
      .filter(x => x.status === 'Active')
      .map(({ raw: e, name }) => {
        const props = e.properties as Record<string, any>
        return {
          id: e.id,
          name,
          email:              props['Email']?.email || '',
          role:               getSelect(props['Role']),
          department:         getSelect(props['Department']),
          pays:               getSelect(props['Pays']),
          specializations:    getMultiSelect(props['Specializations']),
          availability:       getSelect(props['Availability']),
          leaveQuotaAnnual:   getNumber(props['Congé annuel DAYS/Y']),
          leaveMedQuota:      getNumber(props['Med & autres DAYS/Y']),
          leaveConsoCurrentY: getNumber(props['CurrentY Conso Congé DAYS']),
          leaveMedConsoCurrentY: getNumber(props['CurrentY Conso Med&Others DAYS']),
        } satisfies WorkplaceEmployee
      })

    // Clients lookup
    const clientsMap: Record<string, string> = {}
    for (const c of clientsRaw) {
      const titleProp = Object.values(c.properties as Record<string, any>).find((p: any) => p.type === 'title') as any
      const name = titleProp?.title?.map((t: any) => t.plain_text).join('').trim() || ''
      if (name) clientsMap[c.id] = name
    }

    // projects lookup + list
    const projectsMap: Record<string, { name: string; type: string }> = {}
    const projects: WorkplaceProject[] = projectsRaw
      .map((p: any) => {
        const props  = p.properties as Record<string, any>
        const name   = getText(props['Name'])
        const status = getSelect(props['Status'])
        const type   = getSelect(props['Type'])
        if (name) projectsMap[p.id] = { name, type }
        if (!ACTIVE_PROJECT_STATUSES.has(status)) return null

        const ownerIds = getRelationIds(props['Owner'])
        const ownerName = ownerIds.map(id => employeesMap[id] || '').filter(Boolean).join(', ')
        const clientIds = getRelationIds(props['Client'])
        const clientName = clientIds.map(id => clientsMap[id] || '').filter(Boolean).join(', ')

        return {
          id: p.id,
          name,
          type,
          status,
          phase:       getSelect(props['Phase']),
          clientName,
          startDate:   getDate(props['Start Date']),
          endDate:     getDate(props['End Date']),
          deadline:    getDate(props['Deadline']) || getDate(props['Expected Close Date']),
          ownerName,
          ownerIds,
          health:      props['Health']?.formula?.string || '',
          allocated:   props['Alloué']?.formula?.boolean ?? false,
        } satisfies WorkplaceProject
      })
      .filter(Boolean) as WorkplaceProject[]

    // allocations
    const allocations: Allocation[] = allocationsRaw.map((a: any) => {
      const props = a.properties as Record<string, any>
      const projectIds  = getRelationIds(props['Project'])
      const firstProject = projectIds.length > 0 ? projectsMap[projectIds[0]] : null
      return {
        id:             a.id,
        name:           getText(props['Name']),
        personIds:      getRelationIds(props['Person']),
        projectIds,
        projectName:    firstProject?.name || '',
        projectType:    firstProject?.type || '',
        type:           (getSelect(props['Type']) || 'Project') as Allocation['type'],
        startDate:      getDate(props['Start Date']),
        startHalf:      (getSelect(props['Start Half']) || 'Morning') as Allocation['startHalf'],
        endDate:        getDate(props['End Date']),
        endHalf:        (getSelect(props['End Half']) || 'Afternoon') as Allocation['endHalf'],
        effortPct:      getNumber(props['Effort %']) || 100,
        status:         (getSelect(props['Status']) || 'Confirmed') as Allocation['status'],
        leaveType:      getSelect(props['Leave Type']) as Allocation['leaveType'],
        approvalStatus: getSelect(props['Approval Status']) as Allocation['approvalStatus'],
        approverIds:    getRelationIds(props['Approver']),
        notes:          getText(props['Notes']),
      } satisfies Allocation
    })

    // time entries (90 derniers jours, lecture seule)
    const timeEntries: TimeEntry[] = timeEntriesRaw.map((t: any) => {
      const props = t.properties as Record<string, any>
      return {
        id:          t.id,
        description: getText(props['Description']),
        personIds:   getRelationIds(props['Employee']),
        projectIds:  getRelationIds(props['Project']),
        date:        getDate(props['Period']),
        endDate:     props['Period']?.date?.end || getDate(props['Period']),
        hours:       getNumber(props['Hours']),
        workType:    getSelect(props['Work Type']),
        notes:       getText(props['Notes']),
      } satisfies TimeEntry
    })

    return NextResponse.json({ employees, projects, allocations, timeEntries })
  } catch (error: any) {
    console.error('[norna] dashboard error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
