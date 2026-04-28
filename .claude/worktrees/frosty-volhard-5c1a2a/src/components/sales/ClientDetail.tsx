'use client'

import { useState, useEffect } from 'react'
import type { Client, Project, Contact, Task } from '@/types/sales'
import { fmtCurrency, fmtDate, PIPELINE_COLS, CLOSED_WON } from '@/types/sales'
import { GenericEditModal } from './GenericEditModal'

// ── Style constants ────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--bg-page)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-input)', color: 'var(--text-primary)', fontSize: 'var(--fs-xs)',
  padding: '6px 10px', fontFamily: 'inherit', boxSizing: 'border-box',
}
const LBL: React.CSSProperties = { fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginBottom: 3 }

// ── Color helpers ──────────────────────────────────────────────────────────

function healthColor(h: string) {
  if (h === 'Good' || h === '✅') return '#4ade80'
  if (h === 'At Risk' || h === '⚠️') return '#f59e0b'
  if (h === 'Critical' || h === '❌') return '#ef4444'
  return '#6b7280'
}

function satStyle(s: string) {
  if (s === 'Very Satisfied') return { bg: 'rgba(74,222,128,0.15)', fg: '#4ade80' }
  if (s === 'Satisfied') return { bg: 'rgba(166,201,206,0.15)', fg: '#A6C9CE' }
  if (s === 'Neutral') return { bg: 'rgba(107,114,128,0.15)', fg: '#9ca3af' }
  if (s === 'Dissatisfied') return { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444' }
  return { bg: 'rgba(107,114,128,0.15)', fg: '#9ca3af' }
}

function upStyle(p: string) {
  if (p === 'High') return { bg: 'rgba(139,92,246,0.15)', fg: '#a78bfa' }
  if (p === 'Medium') return { bg: 'rgba(245,158,11,0.15)', fg: '#f59e0b' }
  return { bg: 'rgba(107,114,128,0.15)', fg: '#9ca3af' }
}

function taskStatusStyle(s: string) {
  if (s === 'Done') return { bg: 'rgba(74,222,128,0.15)', fg: '#4ade80' }
  if (s === 'In Progress') return { bg: 'rgba(59,130,246,0.15)', fg: '#60a5fa' }
  if (s === 'Cancelled') return { bg: 'rgba(239,68,68,0.15)', fg: '#f87171' }
  return { bg: 'rgba(107,114,128,0.15)', fg: '#9ca3af' }
}

function priorityColor(p: string) {
  if (p === 'Urgent') return '#ef4444'
  if (p === 'High') return '#f59e0b'
  if (p === 'Medium') return '#3b82f6'
  return '#6b7280'
}

function statusDotColor(s: string) {
  const map: Record<string, string> = {
    Won: '#4ade80', Active: '#4ade80', Completed: '#4ade80',
    Lost: '#f87171', Cancelled: '#f87171', 'On Hold': '#9ca3af',
    Lead: '#6b7280', Qualified: '#3b82f6', Scoping: '#8b5cf6',
    'Proposal Sent': '#f59e0b', Negotiation: '#ef4444', 'Verbal Commitment': '#10b981',
  }
  return map[s] || '#6b7280'
}

// ── Shared sub-components ──────────────────────────────────────────────────

function SectionHeader({ title, count, onAdd }: { title: string; count?: number; onAdd?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</span>
        {count !== undefined && (
          <span style={{ fontSize: 'var(--fs-2xs)', padding: '1px 6px', borderRadius: 10, background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
            {count}
          </span>
        )}
      </div>
      {onAdd && (
        <button onClick={onAdd} style={{
          background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 6,
          color: 'var(--text-muted)', fontSize: 11, padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          + Ajouter
        </button>
      )}
    </div>
  )
}

function SaveCancelRow({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
      <button onClick={onCancel} style={{
        background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 6,
        color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit',
      }}>Annuler</button>
      <button onClick={onSave} disabled={saving} style={{
        background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#000',
        fontSize: 'var(--fs-xs)', fontWeight: 600, padding: '4px 14px',
        cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
      }}>{saving ? '…' : 'Sauvegarder'}</button>
    </div>
  )
}

// ── Contact Form ───────────────────────────────────────────────────────────

function ContactForm({ initial, clientId, onSave, onCancel }: {
  initial?: Contact; clientId: string
  onSave: (c: Contact) => void; onCancel: () => void
}) {
  const [f, setF] = useState({ name: initial?.name || '', email: initial?.email || '', phone: initial?.phone || '', linkedin: initial?.linkedin || '', role: initial?.role || '', notes: initial?.notes || '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(p => ({ ...p, [k]: e.target.value }))

  async function save() {
    if (!f.name.trim()) { setErr('Le nom est requis'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch(initial ? `/api/contacts/${initial.id}` : '/api/contacts', {
        method: initial ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, clientIds: [clientId] }),
      })
      const d = await res.json() as { ok?: boolean; id?: string; error?: string }
      if (!res.ok || d.error) { setErr(d.error || 'Erreur'); return }
      onSave({ ...f, id: initial?.id || String(d.id), clientIds: [clientId] })
    } catch { setErr('Erreur réseau') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-input)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><div style={LBL}>Nom *</div><input value={f.name} onChange={set('name')} placeholder="Nom complet" style={INPUT} /></div>
        <div><div style={LBL}>Rôle</div><input value={f.role} onChange={set('role')} placeholder="DG, RH..." style={INPUT} /></div>
        <div><div style={LBL}>Email</div><input value={f.email} onChange={set('email')} type="email" placeholder="email@..." style={INPUT} /></div>
        <div><div style={LBL}>Téléphone</div><input value={f.phone} onChange={set('phone')} type="tel" placeholder="+230..." style={INPUT} /></div>
        <div style={{ gridColumn: '1 / -1' }}><div style={LBL}>LinkedIn</div><input value={f.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/in/..." style={INPUT} /></div>
        <div style={{ gridColumn: '1 / -1' }}><div style={LBL}>Notes</div><textarea value={f.notes} onChange={set('notes')} placeholder="Notes..." rows={2} style={{ ...INPUT, resize: 'vertical', minHeight: 48 }} /></div>
      </div>
      {err && <span style={{ fontSize: 'var(--fs-xs)', color: '#ef4444' }}>{err}</span>}
      <SaveCancelRow onSave={save} onCancel={onCancel} saving={saving} />
    </div>
  )
}

// ── Task Form ──────────────────────────────────────────────────────────────

const TASK_STATUSES = ['To Do', 'In Progress', 'Done', 'Cancelled']
const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

function TaskForm({ initial, clientId, onSave, onCancel }: {
  initial?: Task; clientId: string
  onSave: (t: Task) => void; onCancel: () => void
}) {
  const [f, setF] = useState({ name: initial?.name || '', status: initial?.status || 'To Do', dueDate: initial?.dueDate || '', priority: initial?.priority || '', notes: initial?.notes || '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF(p => ({ ...p, [k]: e.target.value }))

  async function save() {
    if (!f.name.trim()) { setErr('Le nom est requis'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch(initial ? `/api/tasks/${initial.id}` : '/api/tasks', {
        method: initial ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, clientIds: [clientId] }),
      })
      const d = await res.json() as { ok?: boolean; id?: string; error?: string }
      if (!res.ok || d.error) { setErr(d.error || 'Erreur'); return }
      onSave({ ...f, id: initial?.id || String(d.id), clientIds: [clientId], projectIds: initial?.projectIds || [], assignedTo: initial?.assignedTo || '', created: initial?.created || '' })
    } catch { setErr('Erreur réseau') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-input)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ gridColumn: '1 / -1' }}><div style={LBL}>Tâche *</div><input value={f.name} onChange={set('name')} placeholder="Nom de la tâche" style={INPUT} /></div>
        <div>
          <div style={LBL}>Statut</div>
          <select value={f.status} onChange={set('status')} style={{ ...INPUT, cursor: 'pointer' }}>
            {TASK_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div style={LBL}>Priorité</div>
          <select value={f.priority} onChange={set('priority')} style={{ ...INPUT, cursor: 'pointer' }}>
            <option value="">—</option>
            {TASK_PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div><div style={LBL}>Échéance</div><input value={f.dueDate} onChange={set('dueDate')} type="date" style={{ ...INPUT, colorScheme: 'dark' }} /></div>
        <div><div style={LBL}>Notes</div><input value={f.notes} onChange={set('notes')} placeholder="Notes..." style={INPUT} /></div>
      </div>
      {err && <span style={{ fontSize: 'var(--fs-xs)', color: '#ef4444' }}>{err}</span>}
      <SaveCancelRow onSave={save} onCancel={onCancel} saving={saving} />
    </div>
  )
}

// ── Project Mini Form ──────────────────────────────────────────────────────

const ALL_STATUSES = ['Lead', 'Qualified', 'Scoping', 'Proposal Sent', 'Negotiation', 'Verbal Commitment', 'Won', 'Active', 'On Hold', 'Completed', 'Lost', 'Cancelled']

function ProjectMiniForm({ project, onSave, onCancel }: {
  project: Project; onSave: (p: Partial<Project>) => void; onCancel: () => void
}) {
  const [f, setF] = useState({ status: project.status, quotedAmount: String(project.quotedAmount || ''), finalAmount: String(project.finalAmount || ''), expectedCloseDate: project.expectedCloseDate || '', nextAction: project.nextAction || '', nextActionDate: project.nextActionDate || '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(p => ({ ...p, [k]: e.target.value }))

  async function save() {
    setSaving(true); setErr('')
    try {
      const payload: Record<string, unknown> = {
        status: f.status,
        expectedCloseDate: f.expectedCloseDate || null,
        nextAction: f.nextAction || null,
        nextActionDate: f.nextActionDate || null,
      }
      if (f.quotedAmount) payload.quotedAmount = Number(f.quotedAmount)
      if (f.finalAmount) payload.finalAmount = Number(f.finalAmount)
      const res = await fetch(`/api/sales/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || d.error) { setErr(d.error || 'Erreur'); return }
      onSave({ status: f.status, quotedAmount: f.quotedAmount ? Number(f.quotedAmount) : project.quotedAmount, finalAmount: f.finalAmount ? Number(f.finalAmount) : project.finalAmount, expectedCloseDate: f.expectedCloseDate, nextAction: f.nextAction, nextActionDate: f.nextActionDate })
    } catch { setErr('Erreur réseau') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-input)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={LBL}>Statut</div>
          <select value={f.status} onChange={set('status')} style={{ ...INPUT, cursor: 'pointer' }}>
            {ALL_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div><div style={LBL}>Montant devisé</div><input value={f.quotedAmount} onChange={set('quotedAmount')} type="number" placeholder="0" style={INPUT} /></div>
        <div><div style={LBL}>Montant final</div><input value={f.finalAmount} onChange={set('finalAmount')} type="number" placeholder="0" style={INPUT} /></div>
        <div><div style={LBL}>Expected close</div><input value={f.expectedCloseDate} onChange={set('expectedCloseDate')} type="date" style={{ ...INPUT, colorScheme: 'dark' }} /></div>
        <div><div style={LBL}>Date next action</div><input value={f.nextActionDate} onChange={set('nextActionDate')} type="date" style={{ ...INPUT, colorScheme: 'dark' }} /></div>
        <div style={{ gridColumn: '1 / -1' }}><div style={LBL}>Next Action</div><input value={f.nextAction} onChange={set('nextAction')} placeholder="Send proposal…" style={INPUT} /></div>
      </div>
      {err && <span style={{ fontSize: 'var(--fs-xs)', color: '#ef4444' }}>{err}</span>}
      <SaveCancelRow onSave={save} onCancel={onCancel} saving={saving} />
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

interface ClientDetailProps {
  client: Client
  projects: Project[]
  onClose: () => void
  inline?: boolean
}

const PIPELINE_STATUS_SET = new Set(PIPELINE_COLS.map(c => c.status))
const CLOSED_ALL = new Set(['Won', 'Active', 'Completed', 'Lost', 'Cancelled'])

export function ClientDetail({ client, projects, onClose, inline = false }: ClientDetailProps) {
  const projectsForClient = projects.filter(p => p.clientIds.includes(client.id))
  const activeDeals = projectsForClient.filter(p => PIPELINE_STATUS_SET.has(p.status))
  const closedDeals = projectsForClient.filter(p => CLOSED_ALL.has(p.status)).sort((a, b) => (b.dateClosed || b.created || '').localeCompare(a.dateClosed || a.created || ''))
  const wonActive = projectsForClient.filter(p => CLOSED_WON.has(p.status))
  const pipelineAmount = activeDeals.reduce((s, p) => s + (p.quotedAmount || 0), 0)

  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [localDeals, setLocalDeals] = useState<Project[]>(activeDeals)

  const [editContactId, setEditContactId] = useState<string | 'new' | null>(null)
  const [editTaskId, setEditTaskId] = useState<string | 'new' | null>(null)
  const [editProjectId, setEditProjectId] = useState<string | null>(null)
  const [editHistoryId, setEditHistoryId] = useState<string | null>(null)
  const [localHistory, setLocalHistory] = useState<Project[]>(closedDeals)
  const [genericEdit, setGenericEdit] = useState<{ entity: 'project' | 'contact' | 'task'; data: Record<string, unknown> } | null>(null)

  useEffect(() => {
    setLocalDeals(activeDeals)
    setLocalHistory(closedDeals)
    setEditContactId(null); setEditTaskId(null); setEditProjectId(null); setEditHistoryId(null)
    setContacts(null); setTasks(null)
    fetch(`/api/contacts?clientId=${client.id}`)
      .then(r => r.json())
      .then((d: { contacts?: Contact[] }) => setContacts(d.contacts || []))
      .catch(() => setContacts([]))
    fetch(`/api/tasks?clientId=${client.id}`)
      .then(r => r.json())
      .then((d: { tasks?: Task[] }) => setTasks(d.tasks || []))
      .catch(() => setTasks([]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id])

  const ss = satStyle(client.satisfaction)
  const up = upStyle(client.upXsellPotential)
  const hColor = healthColor(client.health)

  const panelStyle: React.CSSProperties = inline
    ? { width: '100%', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', padding: 28, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 28 }
    : { width: 'min(1100px, 90vw)', height: '100vh', overflowY: 'auto', background: 'var(--bg-card)', borderLeft: '1px solid var(--border-accent)', padding: 32, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 28, boxShadow: 'var(--shadow-modal)' }

  const content = (
    <>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
            {client.name}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-btn)', color: 'var(--text-muted)', fontSize: 'var(--fs-lg)', cursor: 'pointer', padding: '2px 10px', lineHeight: 1.4, flexShrink: 0 }}>
            ×
          </button>
        </div>

        {client.sectors.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {client.sectors.map(s => (
              <span key={s} style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', background: 'rgba(166,201,206,0.15)', borderRadius: 6, padding: '2px 7px' }}>{s}</span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: hColor, flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>{client.health || '—'}</span>
          <span style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: 6, background: ss.bg, color: ss.fg, fontWeight: 500 }}>{client.satisfaction || '—'}</span>
          {client.upXsellPotential && (
            <span style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: 6, background: up.bg, color: up.fg, fontWeight: 500 }}>{client.upXsellPotential} Up/X-sell</span>
          )}
          {client.relationshipOwner && (
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Owner : {client.relationshipOwner}</span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Lifetime Value</span>
          <span style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.5px' }}>{fmtCurrency(client.lifetimeValue)}</span>
        </div>
      </div>

      {/* KPIs */}
      <div>
        <SectionHeader title="Vue d'ensemble" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: 'Total projets', value: String(projectsForClient.length) },
            { label: 'Won / Actifs', value: String(wonActive.length) },
            { label: 'Pipeline actif', value: fmtCurrency(pipelineAmount) },
            { label: 'Dernier review', value: fmtDate(client.lastQualityReview) },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-input)', padding: '12px 14px' }}>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--text-primary)' }}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Contacts */}
      <div>
        <SectionHeader
          title="Contacts"
          count={contacts?.length}
          onAdd={() => setEditContactId(editContactId === 'new' ? null : 'new')}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {contacts === null && (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', padding: '8px 0' }}>Chargement…</div>
          )}
          {contacts?.map(contact => (
            <div key={contact.id}>
              <button
                onClick={() => setEditContactId(editContactId === contact.id ? null : contact.id)}
                style={{
                  width: '100%', textAlign: 'left', background: editContactId === contact.id ? 'var(--bg-input)' : 'transparent',
                  border: `1px solid ${editContactId === contact.id ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-input)', padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s',
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                    {contact.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>{contact.name}</div>
                  <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                    {[contact.role, contact.email].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {contact.phone && <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>{contact.phone}</span>}
                {contact.linkedin && (
                  <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 'var(--fs-2xs)', color: 'var(--accent)', flexShrink: 0 }}>
                    LinkedIn
                  </a>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setGenericEdit({ entity: 'contact', data: contact as unknown as Record<string, unknown> }) }}
                  style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                >
                  Edit+
                </button>
                <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>{editContactId === contact.id ? '▲' : '▼'}</span>
              </button>
              {editContactId === contact.id && (
                <div style={{ marginTop: 4 }}>
                  <ContactForm
                    initial={contact}
                    clientId={client.id}
                    onSave={updated => {
                      setContacts(cs => cs?.map(c => c.id === updated.id ? updated : c) || [updated])
                      setEditContactId(null)
                    }}
                    onCancel={() => setEditContactId(null)}
                  />
                </div>
              )}
            </div>
          ))}
          {contacts?.length === 0 && editContactId !== 'new' && (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', padding: '8px 0' }}>Aucun contact associé</div>
          )}
          {editContactId === 'new' && (
            <ContactForm
              clientId={client.id}
              onSave={c => {
                setContacts(cs => [...(cs || []), c])
                setEditContactId(null)
              }}
              onCancel={() => setEditContactId(null)}
            />
          )}
        </div>
      </div>

      {/* Pipeline actif */}
      {localDeals.length > 0 && (
        <div>
          <SectionHeader title="Pipeline actif" count={localDeals.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {localDeals.map(deal => (
              <div key={deal.id}>
                <button
                  onClick={() => setEditProjectId(editProjectId === deal.id ? null : deal.id)}
                  style={{
                    width: '100%', textAlign: 'left', background: editProjectId === deal.id ? 'var(--bg-input)' : 'transparent',
                    border: `1px solid ${editProjectId === deal.id ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-input)', padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusDotColor(deal.status), flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 'var(--fs-xs)', color: 'var(--text-primary)', fontWeight: 500, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.name}</span>
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>{deal.status}</span>
                  <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>{fmtCurrency(deal.quotedAmount, deal.currency)}</span>
                  {deal.expectedCloseDate && <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>{fmtDate(deal.expectedCloseDate)}</span>}
                  <button
                    onClick={e => { e.stopPropagation(); setGenericEdit({ entity: 'project', data: deal as unknown as Record<string, unknown> }) }}
                    style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                  >
                    Edit+
                  </button>
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>{editProjectId === deal.id ? '▲' : '▼'}</span>
                </button>
                {editProjectId === deal.id && (
                  <ProjectMiniForm
                    project={deal}
                    onSave={updated => {
                      setLocalDeals(ds => ds.map(d => d.id === deal.id ? { ...d, ...updated } : d))
                      setEditProjectId(null)
                    }}
                    onCancel={() => setEditProjectId(null)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tasks */}
      <div>
        <SectionHeader
          title="Tâches"
          count={tasks?.length}
          onAdd={() => setEditTaskId(editTaskId === 'new' ? null : 'new')}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tasks === null && (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', padding: '8px 0' }}>Chargement…</div>
          )}
          {tasks?.map(task => {
            const ts = taskStatusStyle(task.status)
            return (
              <div key={task.id}>
                <button
                  onClick={() => setEditTaskId(editTaskId === task.id ? null : task.id)}
                  style={{
                    width: '100%', textAlign: 'left', background: editTaskId === task.id ? 'var(--bg-input)' : 'transparent',
                    border: `1px solid ${editTaskId === task.id ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-input)', padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 'var(--fs-2xs)', padding: '2px 7px', borderRadius: 6, background: ts.bg, color: ts.fg, fontWeight: 500, flexShrink: 0 }}>{task.status || 'To Do'}</span>
                  <span style={{ flex: 1, fontSize: 'var(--fs-xs)', color: 'var(--text-primary)', fontWeight: 500, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
                  {task.priority && <span style={{ fontSize: 'var(--fs-2xs)', color: priorityColor(task.priority), flexShrink: 0, fontWeight: 600 }}>{task.priority}</span>}
                  {task.dueDate && <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>{fmtDate(task.dueDate)}</span>}
                  {task.assignedTo && <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexShrink: 0, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.assignedTo}</span>}
                  <button
                    onClick={e => { e.stopPropagation(); setGenericEdit({ entity: 'task', data: task as unknown as Record<string, unknown> }) }}
                    style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                  >
                    Edit+
                  </button>
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>{editTaskId === task.id ? '▲' : '▼'}</span>
                </button>
                {editTaskId === task.id && (
                  <div style={{ marginTop: 4 }}>
                    <TaskForm
                      initial={task}
                      clientId={client.id}
                      onSave={updated => {
                        setTasks(ts => ts?.map(t => t.id === updated.id ? updated : t) || [updated])
                        setEditTaskId(null)
                      }}
                      onCancel={() => setEditTaskId(null)}
                    />
                  </div>
                )}
              </div>
            )
          })}
          {tasks?.length === 0 && editTaskId !== 'new' && (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', padding: '8px 0' }}>Aucune tâche associée</div>
          )}
          {editTaskId === 'new' && (
            <TaskForm
              clientId={client.id}
              onSave={t => {
                setTasks(ts => [...(ts || []), t])
                setEditTaskId(null)
              }}
              onCancel={() => setEditTaskId(null)}
            />
          )}
        </div>
      </div>

      {/* Generic edit modal */}
      {genericEdit && (
        <GenericEditModal
          entity={genericEdit.entity}
          data={genericEdit.data}
          onSave={updated => {
            const id = genericEdit.data.id as string
            if (genericEdit.entity === 'project') {
              setLocalDeals(ds => ds.map(d => d.id === id ? { ...d, ...updated } as Project : d))
              setLocalHistory(ds => ds.map(d => d.id === id ? { ...d, ...updated } as Project : d))
            } else if (genericEdit.entity === 'contact') {
              setContacts(cs => cs?.map(c => c.id === id ? { ...c, ...updated } as Contact : c) ?? null)
            } else if (genericEdit.entity === 'task') {
              setTasks(ts => ts?.map(t => t.id === id ? { ...t, ...updated } as Task : t) ?? null)
            }
            setGenericEdit(null)
          }}
          onClose={() => setGenericEdit(null)}
        />
      )}

      {/* Historique */}
      {localHistory.length > 0 && (
        <div>
          <SectionHeader title="Historique" count={localHistory.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {localHistory.map(deal => (
              <div key={deal.id}>
                <button
                  onClick={() => setEditHistoryId(editHistoryId === deal.id ? null : deal.id)}
                  style={{
                    width: '100%', textAlign: 'left',
                    background: editHistoryId === deal.id ? 'var(--bg-input)' : 'transparent',
                    border: `1px solid ${editHistoryId === deal.id ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-input)', padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusDotColor(deal.status), flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 'var(--fs-xs)', color: 'var(--text-primary)', fontWeight: 500, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.name}</span>
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>{deal.type}</span>
                  <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>{fmtCurrency(deal.finalAmount || deal.quotedAmount, deal.currency)}</span>
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>{fmtDate(deal.dateClosed || deal.created)}</span>
                  <button
                    onClick={e => { e.stopPropagation(); setGenericEdit({ entity: 'project', data: deal as unknown as Record<string, unknown> }) }}
                    style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                  >
                    Edit+
                  </button>
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', flexShrink: 0 }}>{editHistoryId === deal.id ? '▲' : '▼'}</span>
                </button>
                {editHistoryId === deal.id && (
                  <ProjectMiniForm
                    project={deal}
                    onSave={updated => {
                      setLocalHistory(ds => ds.map(d => d.id === deal.id ? { ...d, ...updated } : d))
                      setEditHistoryId(null)
                    }}
                    onCancel={() => setEditHistoryId(null)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )

  if (inline) return <div style={panelStyle}>{content}</div>

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div style={panelStyle}>{content}</div>
    </div>
  )
}
