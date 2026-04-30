import { NextRequest, NextResponse } from 'next/server'
import type { WorkplaceEmployee, WorkplaceProject, Allocation } from '@/types/workplace'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MODEL = 'claude-sonnet-4-5-20250929'

const SYSTEM_PROMPT = `Tu es un assistant de staffing pour Eqxia, un cabinet conseil IA basé à Maurice et en France (15-30 personnes).

# Ta mission
Quand on te pose une question type "qui peut faire X", tu dois :
1. Extraire l'intention : période visée, type de projet, compétences requises, contraintes (pays, niveau)
2. Filtrer les candidats actifs
3. Scorer chaque candidat sur 100 selon trois axes :
   - **Compétences (40 pts)** : matching entre les Specializations du candidat et les besoins inférés du type de projet
   - **Disponibilité (40 pts)** : ne pas avoir d'allocation Confirmed ni de congé Approved sur la période
   - **Pays (20 pts)** : si la mission requiert un pays, plein score si match, 0 si mismatch ; pas de contrainte → score neutre 10
4. Renvoyer les 5 meilleurs candidats

# Mapping Specialization ↔ type de projet
- Workshop / Training → Training & Facilitation, AI Strategy, Prompt Engineering
- Audit → AI Strategy, Data & Analytics, Change Management
- Consulting → AI Strategy, Change Management, Sales & BD
- Development → Technical Implementation, Automation, Product Development
- Strategic Review → AI Strategy, Sales & BD
- Retainer → variable selon contexte

# Format de sortie
Réponds UNIQUEMENT par un JSON valide, sans markdown ni texte autour. Format :
{
  "intent": {
    "summary": "résumé de la demande en 1 phrase",
    "dateRange": "ex: '18 novembre 2026' ou 'semaine 47' ou null si non spécifié",
    "projectType": "Workshop|Audit|Consulting|Development|Training|Retainer|Strategic Review|Internal|null",
    "location": "Maurice|France|null",
    "requiredSkills": ["AI Strategy", ...]
  },
  "candidates": [
    {
      "employeeId": "id-uuid",
      "name": "Nom Prénom",
      "score": 85,
      "skillScore": 35,
      "availabilityScore": 40,
      "locationScore": 10,
      "reasoning": "1 phrase concise (ex: 'Spécialiste AI Strategy + Training, 100% libre cette semaine, basée à Maurice')"
    }
  ]
}

Si aucun candidat ne correspond, renvoie candidates: [] avec un intent.summary qui explique pourquoi.`

interface ParsedIntent {
  summary: string
  dateRange: string | null
  projectType: string | null
  location: string | null
  requiredSkills: string[]
}

interface RankedCandidate {
  employeeId: string
  name: string
  score: number
  skillScore: number
  availabilityScore: number
  locationScore: number
  reasoning: string
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

    // Fetch fresh workplace data via internal call
    const dashUrl = new URL('/api/dashboard', req.nextUrl.origin)
    const dashRes = await fetch(dashUrl, { cache: 'no-store' })
    if (!dashRes.ok) {
      return NextResponse.json({ error: 'Impossible de récupérer les données équipe' }, { status: 502 })
    }
    const data = await dashRes.json() as { employees: WorkplaceEmployee[]; projects: WorkplaceProject[]; allocations: Allocation[] }

    // Compress data — keep only what matters for staffing decisions
    const teamData = data.employees.map(e => ({
      id: e.id,
      name: e.name,
      role: e.role,
      pays: e.pays,
      specializations: e.specializations,
      availability: e.availability,
    }))

    const today = new Date()
    const horizon = new Date(today)
    horizon.setDate(today.getDate() + 180) // 6 months ahead
    const horizonStr = horizon.toISOString().slice(0, 10)
    const todayStr = today.toISOString().slice(0, 10)

    const allocsData = data.allocations
      .filter(a => a.endDate >= todayStr && a.startDate <= horizonStr)
      .map(a => ({
        person: a.personIds[0],
        type: a.type,
        projectType: a.projectType || null,
        from: a.startDate,
        to: a.endDate,
        status: a.status || null,
        approval: a.approvalStatus || null,
        effort: a.effortPct,
      }))

    const userMessage = `# Date du jour\n${todayStr}\n\n# Équipe (${teamData.length} personnes)\n${JSON.stringify(teamData)}\n\n# Allocations actuelles et à venir (${allocsData.length})\n${JSON.stringify(allocsData)}\n\n# Question\n${query}`

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
      console.error('[norna] Claude API error:', text)
      return NextResponse.json({ error: `Claude API: ${text}` }, { status: claudeRes.status })
    }

    const result = await claudeRes.json()
    const text = result.content?.[0]?.text || ''

    // Strip optional markdown fences if Claude slipped
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    let parsed: { intent: ParsedIntent; candidates: RankedCandidate[] }
    try {
      parsed = JSON.parse(cleaned)
    } catch (_e) {
      console.error('[norna] Claude returned invalid JSON:', text)
      return NextResponse.json({ error: 'Réponse invalide du modèle', raw: text }, { status: 502 })
    }

    return NextResponse.json({
      ...parsed,
      usage: {
        inputTokens: result.usage?.input_tokens || 0,
        outputTokens: result.usage?.output_tokens || 0,
        cacheReadTokens: result.usage?.cache_read_input_tokens || 0,
        cacheCreationTokens: result.usage?.cache_creation_input_tokens || 0,
      },
    })
  } catch (error: any) {
    console.error('[norna] AI staff error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
