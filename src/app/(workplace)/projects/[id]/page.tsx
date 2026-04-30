'use client'

import { useMemo, useState, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, ExternalLink, Sparkles, AlertCircle } from 'lucide-react'
import { useWorkplaceData } from '@/hooks/useWorkplaceData'
import { useToast } from '@/components/workplace/ToastProvider'
import { generateGrid, coversCell, weekLabel, weekNumber, getMondayOf, type GridCell } from '@/lib/workplace/grid'
import { HOLIDAY_DATES_MU } from '@/lib/workplace/holidays'
import { skillMatch, expectedSkillsFor } from '@/lib/workplace/skills'
import { AllocationModal } from '@/components/workplace/AllocationModal'
import { RefreshButton } from '@/components/workplace/RefreshButton'
import type { Allocation, WorkplaceEmployee } from '@/types/workplace'

interface AICandidate {
  employeeId: string
  name: string
  score: number
  skillScore: number
  availabilityScore: number
  locationScore: number
  reasoning: string
}

interface AIResponse {
  intent: { summary: string; dateRange: string | null; projectType: string | null; location: string | null; requiredSkills: string[] }
  candidates: AICandidate[]
}

const WEEKS = 12

const STATUS_COLORS: Record<string, string> = {
  Confirmed: '#22c55e',
  Probable:  '#facc15',
  Draft:     '#6b7280',
}

function fmtDate(s: string): string {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })
}

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--card-bg)',
  backdropFilter: 'var(--card-blur)',
  WebkitBackdropFilter: 'var(--card-blur)',
  border: 'var(--card-border)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
}

function notionUrl(id: string): string {
  return `https://notion.so/${id.replace(/-/g, '')}`
}

interface ScoredCandidate {
  emp: WorkplaceEmployee
  score: number
  skillScore: number
  availabilityScore: number
  matchedSkills: string[]
  freeDays: number
  totalDays: number
}

function scoreCandidates(
  candidates: WorkplaceEmployee[],
  projectType: string,
  cells: GridCell[],
  projectAllocations: Allocation[],
  allAllocations: Allocation[],
): ScoredCandidate[] {
  const expectedSkills = expectedSkillsFor(projectType)

  return candidates.map(emp => {
    const personAllocs = allAllocations.filter(a => a.personIds.includes(emp.id))

    // Compute available half-days over the project window
    let freeHalfDays = 0
    let totalHalfDays = 0
    for (const cell of cells) {
      if (HOLIDAY_DATES_MU.has(cell.date)) continue
      totalHalfDays++
      const allocsHere = personAllocs.filter(a => coversCell(a, cell))
      const blocked = allocsHere.some(a =>
        (a.type === 'Project' && a.status === 'Confirmed') ||
        (a.type === 'Leave'   && a.approvalStatus === 'Approved'),
      )
      if (!blocked) freeHalfDays++
    }

    const skillRatio = skillMatch(emp.specializations, projectType)
    const availRatio = totalHalfDays > 0 ? freeHalfDays / totalHalfDays : 0

    const matchedSkills = expectedSkills.filter(s => emp.specializations.includes(s))

    return {
      emp,
      skillScore:        Math.round(skillRatio * 50),
      availabilityScore: Math.round(availRatio * 50),
      score:             Math.round(skillRatio * 50 + availRatio * 50),
      matchedSkills,
      freeDays:          freeHalfDays / 2,
      totalDays:         totalHalfDays / 2,
    }
  })
  .sort((a, b) => b.score - a.score)
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const toast = useToast()
  const { employees, projects, allocations, loading, refreshing, error, reload, lastFetchAt } = useWorkplaceData()
  const [modalState, setModalState] = useState<
    | { mode: 'closed' }
    | { mode: 'create'; personId?: string }
    | { mode: 'edit'; allocation: Allocation }
  >({ mode: 'closed' })

  // AI candidates state
  const [candidatesMode, setCandidatesMode] = useState<'auto' | 'ai'>('auto')
  const [aiCandidates, setAiCandidates] = useState<AIResponse | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const project = useMemo(() => projects.find(p => p.id === projectId), [projects, projectId])

  // Build a context-aware AI query for this project
  function buildAIQuery(): string {
    if (!project) return ''
    const parts: string[] = [
      `Qui sont les meilleurs candidats pour le projet "${project.name}"`,
    ]
    if (project.type) parts.push(`(type ${project.type})`)
    if (project.clientName) parts.push(`pour le client ${project.clientName}`)
    if (project.startDate && project.endDate) {
      parts.push(`sur la période du ${project.startDate} au ${project.endDate}`)
    } else if (project.startDate) {
      parts.push(`à partir du ${project.startDate}`)
    } else if (project.deadline) {
      parts.push(`avant la deadline du ${project.deadline}`)
    }
    parts.push('?')
    return parts.join(' ')
  }

  async function fetchAICandidates() {
    if (!project) return
    setAiLoading(true)
    setAiError('')
    try {
      const res = await fetch('/api/ai/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: buildAIQuery() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setAiCandidates(data)
      toast.success(`Claude a trouvé ${data.candidates.length} candidat${data.candidates.length > 1 ? 's' : ''}`)
    } catch (e) {
      const msg = (e as Error).message
      setAiError(msg)
      toast.error(`Erreur IA : ${msg}`)
    } finally {
      setAiLoading(false)
    }
  }

  function switchToAI() {
    setCandidatesMode('ai')
    if (!aiCandidates && !aiLoading) fetchAICandidates()
  }

  const projectAllocations = useMemo(
    () => allocations.filter(a => a.type === 'Project' && a.projectIds.includes(projectId)),
    [allocations, projectId],
  )

  const employeesById = useMemo(() => {
    const m = new Map<string, WorkplaceEmployee>()
    for (const e of employees) m.set(e.id, e)
    return m
  }, [employees])

  // Team currently allocated to this project
  const allocatedPeopleIds = useMemo(() => {
    const set = new Set<string>()
    for (const a of projectAllocations) {
      for (const pid of a.personIds) set.add(pid)
    }
    return set
  }, [projectAllocations])

  // 12-week grid starting from project start date or today, whichever is earlier
  const gridStart = useMemo(() => {
    const today = new Date()
    if (project?.startDate) {
      const start = new Date(project.startDate + 'T00:00:00')
      return getMondayOf(start < today ? today : start)
    }
    return getMondayOf(today)
  }, [project])

  const { cells, weekStarts } = useMemo(() => generateGrid(WEEKS, gridStart), [gridStart])

  // Available candidates = active employees NOT yet allocated to this project (or with low presence)
  const candidates = useMemo(() => {
    if (!project) return []
    const pool = employees.filter(e => !allocatedPeopleIds.has(e.id))
    return scoreCandidates(pool, project.type, cells, projectAllocations, allocations).slice(0, 8)
  }, [project, employees, allocatedPeopleIds, cells, projectAllocations, allocations])

  if (error)   return <div style={{ padding: 40, color: 'var(--color-error)' }}>Erreur : {error}</div>
  if (!project) return (
    <div style={CARD_STYLE}>
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
        Projet introuvable. <Link href="/projects" style={{ color: 'var(--accent)' }}>Retour à la liste</Link>
      </div>
    </div>
  )

  const expectedSkills = expectedSkillsFor(project.type)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Back link */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Link href="/projects" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 'var(--fs-xs)', color: 'var(--text-muted)',
          textDecoration: 'none',
        }}>
          <ArrowLeft size={12} /> Retour aux projets
        </Link>
        <RefreshButton onRefresh={reload} refreshing={refreshing} lastFetchAt={lastFetchAt} />
      </div>

      {/* Header */}
      <div style={{ ...CARD_STYLE, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              {project.clientName || 'Sans client'} · {project.type}
            </div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
              {project.name}
              <a href={notionUrl(project.id)} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, color: 'var(--text-muted)', display: 'inline-flex', verticalAlign: 'middle' }} title="Ouvrir dans Notion">
                <ExternalLink size={14} />
              </a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12, fontSize: 'var(--fs-xs)' }}>
              <Field label="Statut"   value={project.status} />
              <Field label="Phase"    value={project.phase || '—'} />
              <Field label="Owner"    value={project.ownerName || '—'} />
              <Field label="Démarrage" value={fmtDate(project.startDate)} />
              <Field label="Fin"      value={fmtDate(project.endDate)} />
              {project.deadline && <Field label="Deadline" value={fmtDate(project.deadline)} />}
            </div>
            {expectedSkills.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>
                  Compétences attendues
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {expectedSkills.map(s => (
                    <span key={s} style={{
                      padding: '3px 9px',
                      borderRadius: 'var(--radius-badge)',
                      background: 'var(--accent-soft)',
                      color: 'var(--accent)',
                      fontSize: 'var(--fs-2xs)',
                      fontWeight: 600,
                    }}>{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setModalState({ mode: 'create' })}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 14px',
              borderRadius: 'var(--radius-btn)',
              border: '1px solid var(--btn-add-border)',
              background: 'var(--btn-add-bg)',
              color: 'var(--btn-add-color)',
              fontSize: 'var(--fs-xs)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            <Plus size={13} /> Allocation
          </button>
        </div>
      </div>

      {/* Allocation timeline */}
      <div style={{ ...CARD_STYLE, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Équipe staffée</div>
          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
            {allocatedPeopleIds.size} {allocatedPeopleIds.size > 1 ? 'personnes' : 'personne'} · {projectAllocations.length} allocations · {WEEKS} prochaines semaines
          </div>
        </div>
        {allocatedPeopleIds.size === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', fontStyle: 'italic' }}>
            Aucune personne staffée. Ajoutez une allocation pour démarrer.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 1, minWidth: '100%' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--fs-2xs)', fontWeight: 500, position: 'sticky', left: 0, background: 'var(--bg-card)', minWidth: 160 }}>
                    Personne
                  </th>
                  {weekStarts.map(ws => (
                    <th key={ws} style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 10, fontWeight: 600, minWidth: 56 }}>
                      <div>S{weekNumber(ws)}</div>
                      <div style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{weekLabel(ws).split(' – ')[0]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(allocatedPeopleIds).map((personId, idx) => {
                  const emp = employeesById.get(personId)
                  if (!emp) return null
                  return (
                    <tr key={personId}>
                      <td style={{
                        padding: '6px 14px',
                        whiteSpace: 'nowrap',
                        position: 'sticky',
                        left: 0,
                        background: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-hover)',
                      }}>
                        <Link href={`/people/${emp.id}`} style={{ textDecoration: 'none', display: 'block', color: 'var(--text-primary)' }}>
                          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600 }}>{emp.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{emp.role}</div>
                        </Link>
                      </td>
                      {weekStarts.map((_, wi) => {
                        const weekCells = cells.slice(wi * 10, (wi + 1) * 10)
                        let bookedHalves = 0
                        let totalEffort = 0
                        let dominantStatus: string = 'Confirmed'
                        for (const cell of weekCells) {
                          for (const a of projectAllocations) {
                            if (a.personIds.includes(personId) && coversCell(a, cell)) {
                              bookedHalves++
                              totalEffort += (a.effortPct ?? 100)
                              if (a.status === 'Probable') dominantStatus = 'Probable'
                              if (a.status === 'Draft' && dominantStatus === 'Confirmed') dominantStatus = 'Draft'
                            }
                          }
                        }
                        const intensity = bookedHalves / 10
                        const color = STATUS_COLORS[dominantStatus] || '#22c55e'
                        const bg = bookedHalves === 0 ? 'transparent' : `${color}${Math.floor(intensity * 200 + 30).toString(16).padStart(2, '0')}`
                        return (
                          <td
                            key={wi}
                            title={bookedHalves === 0 ? '' : `${(bookedHalves / 2).toFixed(1)} jours · effort moyen ${Math.round(totalEffort / bookedHalves)}%`}
                            style={{
                              padding: '8px 4px',
                              textAlign: 'center',
                              background: bg,
                              borderRadius: 3,
                              fontSize: 10,
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              color: bookedHalves > 5 ? '#ffffff' : 'var(--text-secondary)',
                            }}
                          >
                            {bookedHalves > 0 ? `${(bookedHalves / 2).toFixed(0)}j` : ''}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Allocations list */}
      {projectAllocations.length > 0 && (
        <div style={{ ...CARD_STYLE, padding: 0 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Allocations sur ce projet</div>
          </div>
          {projectAllocations
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
            .map(alloc => {
              const emp = employeesById.get(alloc.personIds[0])
              return (
                <button
                  key={alloc.id}
                  onClick={() => setModalState({ mode: 'edit', allocation: alloc })}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    width: '100%',
                    padding: '11px 18px',
                    borderTop: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    border: 'none',
                    borderTopWidth: 1,
                    borderTopStyle: 'solid',
                    borderTopColor: 'var(--border-subtle)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div>
                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600 }}>{emp?.name || '?'}</div>
                    <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                      {fmtDate(alloc.startDate)} → {fmtDate(alloc.endDate)} · {alloc.effortPct}%
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 9px', borderRadius: 'var(--radius-badge)',
                    background: `${STATUS_COLORS[alloc.status] || '#6b7280'}20`,
                    color: STATUS_COLORS[alloc.status] || '#6b7280',
                    fontSize: 'var(--fs-2xs)', fontWeight: 600,
                  }}>{alloc.status}</span>
                </button>
              )
            })}
        </div>
      )}

      {/* Available candidates */}
      <div style={{ ...CARD_STYLE, padding: 0 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Candidats disponibles</div>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
              {candidatesMode === 'auto'
                ? `Top ${candidates.length} non-staffés, scorés sur compétences × disponibilité (12 prochaines semaines)`
                : 'Recommandation contextuelle Claude basée sur le projet, l\'équipe et les allocations'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--bg-input)', borderRadius: 'var(--radius-btn)', flexShrink: 0 }}>
            <button
              onClick={() => setCandidatesMode('auto')}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-btn)',
                border: 'none',
                background: candidatesMode === 'auto' ? 'var(--bg-card)' : 'transparent',
                color: candidatesMode === 'auto' ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 'var(--fs-2xs)',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Match auto
            </button>
            <button
              onClick={switchToAI}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px',
                borderRadius: 'var(--radius-btn)',
                border: 'none',
                background: candidatesMode === 'ai' ? 'var(--bg-card)' : 'transparent',
                color: candidatesMode === 'ai' ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 'var(--fs-2xs)',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Sparkles size={10} /> Avec IA
            </button>
          </div>
        </div>

        {candidatesMode === 'ai' ? (
          aiLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: '2px solid var(--accent-soft)',
                  borderTopColor: 'var(--accent)',
                  animation: 'spin 0.8s linear infinite',
                  display: 'inline-block',
                }} />
                Claude analyse l'équipe et les allocations…
              </span>
            </div>
          ) : aiError ? (
            <div style={{ padding: 24, display: 'flex', alignItems: 'flex-start', gap: 10, color: 'var(--color-error)' }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600 }}>Erreur IA</div>
                <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{aiError}</div>
                <button onClick={fetchAICandidates} style={{ marginTop: 8, padding: '4px 10px', borderRadius: 'var(--radius-btn)', border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 'var(--fs-2xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Réessayer
                </button>
              </div>
            </div>
          ) : aiCandidates ? (
            <>
              <div style={{ padding: '10px 18px', background: 'var(--bg-input)', borderBottom: '1px solid var(--border-subtle)', fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {aiCandidates.intent.summary}
              </div>
              {aiCandidates.candidates.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
                  Aucun candidat trouvé par l'IA.
                </div>
              ) : (
                aiCandidates.candidates.map((c, idx) => {
                  const scoreColor =
                    c.score >= 80 ? '#22c55e' :
                    c.score >= 60 ? '#facc15' :
                    c.score >= 40 ? '#f97316' : '#ef4444'
                  const emp = employeesById.get(c.employeeId)
                  return (
                    <div key={c.employeeId} style={{ padding: '12px 18px', borderTop: idx === 0 ? 'none' : '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 11,
                        background: idx === 0 ? 'var(--accent)' : 'var(--accent-soft)',
                        color: idx === 0 ? 'var(--bg-page)' : 'var(--accent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, flexShrink: 0,
                      }}>
                        {idx + 1}
                      </div>
                      <div style={{
                        width: 40, height: 40, borderRadius: 20,
                        background: `${scoreColor}22`, border: `2px solid ${scoreColor}`,
                        color: scoreColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 'var(--fs-xs)', fontFamily: 'monospace', flexShrink: 0,
                      }}>
                        {c.score}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600 }}>
                          {emp ? <Link href={`/people/${emp.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>{c.name}</Link> : c.name}
                          {emp && (
                            <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontWeight: 400 }}>
                              {emp.role}{emp.pays ? ` · ${emp.pays}` : ''}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
                          {c.reasoning}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>
                          Compétences {c.skillScore}/40 · Dispo {c.availabilityScore}/40 · Pays {c.locationScore}/20
                        </div>
                      </div>
                      <button
                        onClick={() => setModalState({ mode: 'create', personId: c.employeeId })}
                        style={{
                          padding: '5px 11px',
                          borderRadius: 'var(--radius-btn)',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--accent-soft)',
                          color: 'var(--accent)',
                          fontSize: 'var(--fs-2xs)',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          flexShrink: 0,
                        }}
                      >
                        Allouer
                      </button>
                    </div>
                  )
                })
              )}
            </>
          ) : (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
              Cliquez sur "Avec IA" pour lancer une recommandation contextuelle.
            </div>
          )
        ) : candidates.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', fontStyle: 'italic' }}>
            Toute l'équipe est déjà staffée sur ce projet.
          </div>
        ) : (
          candidates.map((c, idx) => {
            const scoreColor =
              c.score >= 70 ? '#22c55e' :
              c.score >= 50 ? '#facc15' :
              c.score >= 30 ? '#f97316' : '#ef4444'
            return (
              <div key={c.emp.id} style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 20,
                  background: `${scoreColor}22`, border: `2px solid ${scoreColor}`,
                  color: scoreColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 'var(--fs-xs)', fontFamily: 'monospace', flexShrink: 0,
                }}>
                  {c.score}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600 }}>
                    <Link href={`/people/${c.emp.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>{c.emp.name}</Link>
                    <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontWeight: 400 }}>{c.emp.role} · {c.emp.pays}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    Compétences <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{c.skillScore}/50</span>
                    {c.matchedSkills.length > 0 && <span> ({c.matchedSkills.join(', ')})</span>}
                    {' · '}
                    Dispo <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{c.availabilityScore}/50</span>
                    {' '}({c.freeDays.toFixed(0)}/{c.totalDays.toFixed(0)} jours libres)
                  </div>
                </div>
                <button
                  onClick={() => setModalState({ mode: 'create', personId: c.emp.id })}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 'var(--radius-btn)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    fontSize: 'var(--fs-2xs)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                  }}
                >
                  Allouer
                </button>
              </div>
            )
          })
        )}
      </div>

      {modalState.mode !== 'closed' && (
        <AllocationModal
          employees={employees}
          projects={projects}
          allocations={allocations}
          existing={modalState.mode === 'edit' ? modalState.allocation : undefined}
          defaultPersonId={modalState.mode === 'create' ? modalState.personId : undefined}
          defaultProjectId={projectId}
          onClose={() => setModalState({ mode: 'closed' })}
          onSaved={() => { setModalState({ mode: 'closed' }); reload() }}
        />
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-primary)', fontWeight: 500, marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}
