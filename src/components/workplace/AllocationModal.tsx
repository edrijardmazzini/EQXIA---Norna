'use client'

import { useState, useMemo } from 'react'
import { X, Trash2 } from 'lucide-react'
import type {
  Allocation,
  WorkplaceEmployee,
  WorkplaceProject,
  AllocationType,
  AllocationStatus,
  HalfDay,
  LeaveType,
} from '@/types/workplace'

interface Props {
  employees: WorkplaceEmployee[]
  projects: WorkplaceProject[]
  existing?: Allocation
  defaultPersonId?: string
  defaultDate?: string
  onClose: () => void
  onSaved: () => void
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-input)',
  borderRadius: 'var(--radius-input)',
  padding: '6px 10px',
  fontSize: 'var(--fs-xs)',
  color: 'var(--text-primary)',
  fontFamily: 'inherit',
  width: '100%',
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 'var(--fs-2xs)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 600,
  marginBottom: 4,
}

function todayYMD(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function AllocationModal({ employees, projects, existing, defaultPersonId, defaultDate, onClose, onSaved }: Props) {
  const isEdit = !!existing

  const [type, setType] = useState<AllocationType>(existing?.type || 'Project')
  const [personId, setPersonId] = useState(existing?.personIds[0] || defaultPersonId || employees[0]?.id || '')
  const [projectId, setProjectId] = useState(existing?.projectIds[0] || projects[0]?.id || '')
  const [startDate, setStartDate] = useState(existing?.startDate || defaultDate || todayYMD())
  const [startHalf, setStartHalf] = useState<HalfDay>(existing?.startHalf || 'Morning')
  const [endDate, setEndDate] = useState(existing?.endDate || defaultDate || todayYMD())
  const [endHalf, setEndHalf] = useState<HalfDay>(existing?.endHalf || 'Afternoon')
  const [effortPct, setEffortPct] = useState(existing?.effortPct ?? 100)
  const [status, setStatus] = useState<AllocationStatus>(existing?.status || 'Confirmed')
  const [leaveType, setLeaveType] = useState<LeaveType>((existing?.leaveType || 'Annual') as LeaveType)
  const [notes, setNotes] = useState(existing?.notes || '')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const person  = useMemo(() => employees.find(e => e.id === personId), [employees, personId])
  const project = useMemo(() => projects.find(p => p.id === projectId), [projects, projectId])

  const generatedName = useMemo(() => {
    const personName = person?.name || '?'
    if (type === 'Leave') return `${personName} — ${leaveType} (${startDate})`
    const projectName = project?.name || '?'
    return `${personName} → ${projectName} (${startDate} → ${endDate})`
  }, [type, person, project, startDate, endDate, leaveType])

  async function handleSubmit() {
    setError('')
    if (!personId) { setError('Personne requise'); return }
    if (type === 'Project' && !projectId) { setError('Projet requis'); return }
    if (endDate < startDate) { setError('La date de fin doit être après la date de début'); return }

    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        name: generatedName,
        personIds: [personId],
        type,
        startDate,
        startHalf,
        endDate,
        endHalf,
        effortPct,
        notes,
      }
      if (type === 'Project') {
        payload.projectIds = [projectId]
        payload.status = status
        payload.leaveType = ''
        payload.approvalStatus = ''
      } else if (type === 'Leave') {
        payload.projectIds = []
        payload.leaveType = leaveType
        payload.approvalStatus = existing?.approvalStatus || 'Pending'
        payload.status = ''
      }

      const url = isEdit
        ? `/api/workplace/allocations/${existing!.id}`
        : '/api/workplace/allocations'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!existing) return
    if (!confirm('Supprimer cette allocation ?')) return
    setDeleting(true)
    setError('')
    try {
      const res = await fetch(`/api/workplace/allocations/${existing.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  const busy = submitting || deleting

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-panel)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-modal)',
          color: 'var(--text-primary)',
          display: 'flex', flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700 }}>
            {isEdit ? 'Modifier l\'allocation' : 'Nouvelle allocation'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>

          <div>
            <div style={LABEL_STYLE}>Type</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['Project', 'Leave'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  style={{
                    flex: 1,
                    padding: '7px 12px',
                    borderRadius: 'var(--radius-btn)',
                    border: type === t ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                    background: type === t ? 'var(--accent-soft)' : 'transparent',
                    color: type === t ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: 'var(--fs-xs)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {t === 'Project' ? 'Projet' : 'Congé'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={LABEL_STYLE}>Personne</div>
            <select value={personId} onChange={e => setPersonId(e.target.value)} style={INPUT_STYLE}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          {type === 'Project' && (
            <div>
              <div style={LABEL_STYLE}>Projet</div>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} style={INPUT_STYLE}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name} · {p.type}</option>)}
              </select>
            </div>
          )}

          {type === 'Leave' && (
            <div>
              <div style={LABEL_STYLE}>Type de congé</div>
              <select value={leaveType} onChange={e => setLeaveType(e.target.value as LeaveType)} style={INPUT_STYLE}>
                <option value="Annual">Annuel</option>
                <option value="Sick">Médical</option>
                <option value="Special">Spécial</option>
                <option value="Unpaid">Sans solde</option>
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={LABEL_STYLE}>Début</div>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={INPUT_STYLE} />
              <select value={startHalf} onChange={e => setStartHalf(e.target.value as HalfDay)} style={{ ...INPUT_STYLE, marginTop: 6 }}>
                <option value="Morning">Matin</option>
                <option value="Afternoon">Après-midi</option>
              </select>
            </div>
            <div>
              <div style={LABEL_STYLE}>Fin</div>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={INPUT_STYLE} />
              <select value={endHalf} onChange={e => setEndHalf(e.target.value as HalfDay)} style={{ ...INPUT_STYLE, marginTop: 6 }}>
                <option value="Morning">Matin</option>
                <option value="Afternoon">Après-midi</option>
              </select>
            </div>
          </div>

          {type === 'Project' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={LABEL_STYLE}>Effort (%)</div>
                <input
                  type="number"
                  min={0} max={100}
                  value={effortPct}
                  onChange={e => setEffortPct(Number(e.target.value))}
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <div style={LABEL_STYLE}>Statut</div>
                <select value={status} onChange={e => setStatus(e.target.value as AllocationStatus)} style={INPUT_STYLE}>
                  <option value="Confirmed">Confirmé</option>
                  <option value="Probable">Probable</option>
                  <option value="Draft">Brouillon</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <div style={LABEL_STYLE}>Notes</div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              style={{ ...INPUT_STYLE, resize: 'vertical' }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-error)', padding: '6px 10px', background: 'rgba(248, 113, 113, 0.08)', borderRadius: 'var(--radius-input)' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          {isEdit ? (
            <button
              onClick={handleDelete}
              disabled={busy}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 12px',
                borderRadius: 'var(--radius-btn)',
                border: '1px solid var(--btn-danger-bg)',
                background: 'var(--btn-danger-bg)',
                color: 'var(--btn-danger-text)',
                fontSize: 'var(--fs-xs)',
                fontWeight: 600,
                cursor: busy ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Trash2 size={12} /> {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '7px 14px',
                borderRadius: 'var(--radius-btn)',
                border: '1px solid var(--border-subtle)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 'var(--fs-xs)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={busy}
              style={{
                padding: '7px 14px',
                borderRadius: 'var(--radius-btn)',
                border: '1px solid var(--btn-add-border)',
                background: busy ? 'var(--accent-soft)' : 'var(--btn-add-bg)',
                color: 'var(--btn-add-color)',
                fontSize: 'var(--fs-xs)',
                fontWeight: 600,
                cursor: busy ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {submitting ? (isEdit ? 'Enregistrement…' : 'Création…') : (isEdit ? 'Enregistrer' : 'Créer')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
