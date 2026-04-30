import { NextRequest, NextResponse } from 'next/server'
import type { WorkplaceEmployee, WorkplaceProject, Allocation } from '@/types/workplace'
import { HOLIDAYS_MU_2026 } from '@/lib/workplace/holidays'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MODEL = 'claude-sonnet-4-5-20250929'

const SYSTEM_PROMPT = `Tu es un assistant analytique pour Eqxia (cabinet conseil IA, Maurice + France, 15-30 personnes).

# Ce que tu peux faire
Répondre à des questions analytiques sur l'équipe, les projets et les allocations :
- Compter (jours bookés, personnes libres, projets actifs)
- Filtrer (par compétence, par pays, par période, par statut)
- Calculer des stats (charge moyenne, répartition par type)
- Lister (qui fait quoi, projets par client)

# Schéma des données reçues
- **employees** : id, name, role, pays (Maurice/France/Autre), specializations[], availability
- **projects** : id, name, type (Workshop/Audit/Consulting/...), status, phase, clientName, ownerName, startDate, endDate
- **allocations** : person (employee id), type (Project/Leave), projectType, projectId, from, to, status (Confirmed/Probable/Draft pour Project), approval (Pending/Approved/Rejected pour Leave), effort (0-100)
- **holidays** : fériés Maurice 2026

# Règles métier
- Une personne est **libre** sur une période si elle n'a aucune allocation Confirmed (projet) ni Approved (congé) qui chevauche
- **Charge** = somme des effort% des allocations Confirmed sur la période / capacité disponible
- **Capacité disponible** = jours ouvrés − fériés MU − congés Approved
- 1 jour ouvré = 2 demi-journées
- Année fiscale Eqxia : juillet → juin

# Format de sortie (JSON strict, pas de markdown)
{
  "answer": "1-3 phrases en français répondant directement à la question",
  "highlight": { "value": "32", "unit": "jours" } | null,
  "table": {
    "headers": ["Col1", "Col2"],
    "rows": [["...", "..."]]
  } | null
}

- "highlight" si la réponse principale est UN chiffre clé (ex : "32 jours", "5 personnes")
- "table" si la réponse implique plusieurs items à comparer ou un breakdown

Si la question est ambiguë ou ne peut pas être répondue avec les données disponibles, dis-le dans answer et mets highlight: null, table: null.`

interface QAResponse {
  answer: string
  highlight: { value: string; unit: string } | null
  table: { headers: string[]; rows: string[][] } | null
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query requise' }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY non configurée côté serveur' }, { status: 500 })
    }

    const dashUrl = new URL('/api/dashboard', req.nextUrl.origin)
    const dashRes = await fetch(dashUrl, { cache: 'no-store' })
    if (!dashRes.ok) {
      return NextResponse.json({ error: 'Impossible de récupérer les données équipe' }, { status: 502 })
    }
    const data = await dashRes.json() as { employees: WorkplaceEmployee[]; projects: WorkplaceProject[]; allocations: Allocation[] }

    const todayStr = new Date().toISOString().slice(0, 10)

    // Compress data — drop noisy fields
    const employees = data.employees.map(e => ({
      id: e.id,
      name: e.name,
      role: e.role,
      pays: e.pays,
      specializations: e.specializations,
      availability: e.availability,
    }))

    const projects = data.projects.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      status: p.status,
      phase: p.phase,
      clientName: p.clientName,
      ownerName: p.ownerName,
      startDate: p.startDate,
      endDate: p.endDate,
    }))

    const allocations = data.allocations.map(a => ({
      person: a.personIds[0],
      type: a.type,
      projectType: a.projectType || null,
      projectId: a.projectIds[0] || null,
      from: a.startDate,
      to: a.endDate,
      status: a.status || null,
      approval: a.approvalStatus || null,
      leaveType: a.leaveType || null,
      effort: a.effortPct,
    }))

    const holidays = HOLIDAYS_MU_2026.map(h => ({ date: h.date, name: h.name }))

    const userMessage = `# Date du jour
${todayStr}

# Employees (${employees.length})
${JSON.stringify(employees)}

# Projects (${projects.length})
${JSON.stringify(projects)}

# Allocations (${allocations.length})
${JSON.stringify(allocations)}

# Holidays MU 2026
${JSON.stringify(holidays)}

# Question
${query}`

    const claudeRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!claudeRes.ok) {
      const text = await claudeRes.text()
      console.error('[norna] Claude API error (qa):', text)
      return NextResponse.json({ error: `Claude API: ${text}` }, { status: claudeRes.status })
    }

    const result = await claudeRes.json()
    const text = result.content?.[0]?.text || ''
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    let parsed: QAResponse
    try {
      parsed = JSON.parse(cleaned)
    } catch (_e) {
      console.error('[norna] Claude returned invalid JSON (qa):', text)
      return NextResponse.json({ error: 'Réponse invalide du modèle', raw: text }, { status: 502 })
    }

    return NextResponse.json({
      ...parsed,
      usage: {
        inputTokens:         result.usage?.input_tokens || 0,
        outputTokens:        result.usage?.output_tokens || 0,
        cacheReadTokens:     result.usage?.cache_read_input_tokens || 0,
        cacheCreationTokens: result.usage?.cache_creation_input_tokens || 0,
      },
    })
  } catch (error: any) {
    console.error('[norna] AI qa error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
