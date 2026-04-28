'use client'

import { useState } from 'react'

type EntityType = 'project' | 'contact' | 'task' | 'depense'

interface FieldDef {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea' | 'email' | 'tel' | 'url'
  options?: string[]
  readOnly?: boolean
  span2?: boolean
}

const ALL_STATUSES = [
  'Lead', 'Qualified', 'Scoping', 'Proposal Sent', 'Negotiation',
  'Verbal Commitment', 'Won', 'Active', 'On Hold', 'Completed', 'Lost', 'Cancelled',
]
const DEAL_TYPES = ['Workshop', 'Audit', 'Consulting', 'Development', 'Training', 'Retainer', 'Strategic Review', 'Internal']
const CURRENCIES = ['MUR', 'EUR', 'USD', 'GBP']
const NEXT_ACTIONS = ['Send Proposal', 'Follow Up', 'Schedule Meeting', 'Send Contract', 'Awaiting Client', 'Internal Review', 'Close Deal']
const LOST_REASONS = ['Price Too High', 'Went with Competitor', 'No Budget', 'Timing Not Right', 'No Decision Made', 'Scope Mismatch', 'Internal Restructuring', 'Other']
const SOURCE_LEADS = ['Referral', 'Inbound', 'Outbound', 'Événement', 'Réseau perso', 'Partenaire']
const RISK_LEVELS = ['Low', 'Medium', 'High', 'Critical']
const TASK_STATUSES = ['To Do', 'In Progress', 'Done', 'Cancelled']
const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

const PROJECT_FIELDS: FieldDef[] = [
  // Identité (read-only)
  { key: 'id',                  label: 'ID Notion',              type: 'text',   readOnly: true,  span2: true },
  { key: 'clientName',          label: 'Client',                 type: 'text',   readOnly: true },
  { key: 'ownerName',           label: 'Owner',                  type: 'text',   readOnly: true },
  // Core
  { key: 'name',                label: 'Nom',                    type: 'text',                    span2: true },
  { key: 'status',              label: 'Statut',                 type: 'select', options: ALL_STATUSES },
  { key: 'type',                label: 'Type',                   type: 'select', options: DEAL_TYPES },
  { key: 'currency',            label: 'Devise',                 type: 'select', options: CURRENCIES },
  { key: 'sourceLead',          label: 'Source',                 type: 'select', options: ['', ...SOURCE_LEADS] },
  // Montants
  { key: 'quotedAmount',        label: 'Montant devisé',         type: 'number' },
  { key: 'finalAmount',         label: 'Montant final',          type: 'number' },
  { key: 'netAmount',           label: 'Net (auto)',             type: 'number', readOnly: true },
  // Win
  { key: 'winPercent',          label: '% Gut feeling',          type: 'number' },
  { key: 'winAuto',             label: '% Auto (calculé)',       type: 'number', readOnly: true },
  // Santé
  { key: 'health',              label: 'Santé (auto)',           type: 'text',   readOnly: true },
  { key: 'daysInCurrentStage',  label: 'Jours étape (auto)',     type: 'number', readOnly: true },
  // Dates éditables
  { key: 'startDate',           label: 'Date début',             type: 'date' },
  { key: 'endDate',             label: 'Date fin',               type: 'date' },
  { key: 'expectedCloseDate',   label: 'Clôture prévue',         type: 'date' },
  { key: 'nextActionDate',      label: 'Date next action',       type: 'date' },
  // Actions
  { key: 'nextAction',          label: 'Next Action',            type: 'select', options: ['', ...NEXT_ACTIONS] },
  { key: 'lostReason',          label: 'Raison perdu',           type: 'select', options: ['', ...LOST_REASONS] },
  { key: 'riskLevel',           label: 'Niveau de risque',       type: 'select', options: ['', ...RISK_LEVELS] },
  { key: 'internalChampion',    label: 'Champion interne',       type: 'text' },
  { key: 'budgetConfirmed',     label: 'Budget confirmé',        type: 'checkbox' },
  // Dates auto (read-only)
  { key: 'created',             label: 'Créé le (auto)',         type: 'text', readOnly: true },
  { key: 'dateQualified',       label: 'Qualifié le (auto)',     type: 'text', readOnly: true },
  { key: 'dateScoping',         label: 'Scoping le (auto)',      type: 'text', readOnly: true },
  { key: 'dateProposalSent',    label: 'Proposition (auto)',     type: 'text', readOnly: true },
  { key: 'dateNegotiation',     label: 'Négo le (auto)',         type: 'text', readOnly: true },
  { key: 'dateVerbalCommitment',label: 'Verbal le (auto)',       type: 'text', readOnly: true },
  { key: 'dateClosed',          label: 'Clôturé le (auto)',      type: 'text', readOnly: true },
  { key: 'dateOnHold',          label: 'On Hold le (auto)',      type: 'text', readOnly: true },
]

const CONTACT_FIELDS: FieldDef[] = [
  { key: 'id',       label: 'ID Notion',   type: 'text',     readOnly: true, span2: true },
  { key: 'name',     label: 'Nom',         type: 'text' },
  { key: 'role',     label: 'Rôle',        type: 'text' },
  { key: 'email',    label: 'Email',       type: 'email' },
  { key: 'phone',    label: 'Téléphone',   type: 'tel' },
  { key: 'linkedin', label: 'LinkedIn',    type: 'url',      span2: true },
  { key: 'notes',    label: 'Notes',       type: 'textarea', span2: true },
]

const DEPENSE_CATEGORIES = ['Logiciels & Abonnements', 'Infrastructure', 'Ressources Humaines', 'Marketing', 'Déplacements', 'Bureaux', 'Matériel', 'Formation', 'Juridique & Compta', 'Divers']
const DEVISE_OPTIONS = ['MUR', 'EUR', 'USD', 'GBP', 'KES', 'ZAR']

const DEPENSE_FIELDS: FieldDef[] = [
  { key: 'id',               label: 'ID Notion',         type: 'text',   readOnly: true, span2: true },
  { key: 'description',      label: 'Description',       type: 'text',                   span2: true },
  { key: 'fournisseur',      label: 'Fournisseur',       type: 'text' },
  { key: 'categorie',        label: 'Catégorie',         type: 'select', options: ['', ...DEPENSE_CATEGORIES] },
  { key: 'sousCategorie',    label: 'Sous-catégorie',    type: 'text' },
  { key: 'date',             label: 'Date',              type: 'date' },
  { key: 'montant',          label: 'Montant',           type: 'number' },
  { key: 'devise',           label: 'Devise',            type: 'select', options: DEVISE_OPTIONS },
  { key: 'payePar',          label: 'Payé par',          type: 'text' },
  { key: 'abonnement',       label: 'Abonnement',        type: 'text' },
  { key: 'recurrence',       label: 'Récurrence',        type: 'select', options: ['', 'Mensuel', 'Annuel'] },
  { key: 'recurringCritical',label: 'Récurrent critique',type: 'checkbox' },
]

const TASK_FIELDS: FieldDef[] = [
  { key: 'id',         label: 'ID Notion',          type: 'text',   readOnly: true, span2: true },
  { key: 'name',       label: 'Tâche',              type: 'text',                   span2: true },
  { key: 'status',     label: 'Statut',             type: 'select', options: TASK_STATUSES },
  { key: 'priority',   label: 'Priorité',           type: 'select', options: ['', ...TASK_PRIORITIES] },
  { key: 'dueDate',    label: 'Échéance',            type: 'date' },
  { key: 'assignedTo', label: 'Assigné à (auto)',    type: 'text',   readOnly: true },
  { key: 'notes',      label: 'Notes',               type: 'textarea', span2: true },
  { key: 'created',    label: 'Créé le (auto)',      type: 'text',   readOnly: true },
]

const FIELDS_MAP: Record<EntityType, FieldDef[]> = {
  project: PROJECT_FIELDS,
  contact: CONTACT_FIELDS,
  task: TASK_FIELDS,
  depense: DEPENSE_FIELDS,
}

const API_URL: Record<EntityType, (id: string) => string> = {
  project: id => `/api/sales/${id}`,
  contact: id => `/api/contacts/${id}`,
  task:    id => `/api/tasks/${id}`,
  depense: id => `/api/depenses/${id}`,
}

const ENTITY_LABELS: Record<EntityType, string> = {
  project: 'Projet / Deal',
  contact: 'Contact',
  task:    'Tâche',
  depense: 'Dépense',
}

const BASE_INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--bg-page)', border: '1px solid var(--border-subtle)',
  borderRadius: 4, color: 'var(--text-primary)', fontSize: 12,
  padding: '4px 8px', fontFamily: 'inherit', boxSizing: 'border-box',
}

function FieldInput({ f, value, onChange }: {
  f: FieldDef
  value: unknown
  onChange: (v: unknown) => void
}) {
  const s: React.CSSProperties = f.readOnly
    ? { ...BASE_INPUT, opacity: 0.45, cursor: 'not-allowed', background: 'transparent' }
    : BASE_INPUT
  const str = value === null || value === undefined ? '' : String(value)

  if (f.type === 'checkbox') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 3 }}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
          disabled={f.readOnly}
          style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
        />
        <span style={{ fontSize: 12, color: f.readOnly ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
          {value ? 'Oui' : 'Non'}
        </span>
      </div>
    )
  }

  if (f.type === 'textarea') {
    return (
      <textarea
        value={str}
        onChange={e => onChange(e.target.value)}
        disabled={f.readOnly}
        rows={3}
        style={{ ...s, resize: 'vertical', minHeight: 56 }}
      />
    )
  }

  if (f.type === 'select' && f.options) {
    return (
      <select
        value={str}
        onChange={e => onChange(e.target.value)}
        disabled={f.readOnly}
        style={{ ...s, cursor: f.readOnly ? 'not-allowed' : 'pointer' }}
      >
        {f.options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
      </select>
    )
  }

  return (
    <input
      type={f.type === 'text' ? 'text' : f.type}
      value={str}
      onChange={e => onChange(f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
      disabled={f.readOnly}
      style={{ ...s, colorScheme: f.type === 'date' ? 'dark' : undefined }}
    />
  )
}

interface GenericEditModalProps {
  entity: EntityType
  data: Record<string, unknown>
  onSave: (updated: Record<string, unknown>) => void
  onClose: () => void
}

export function GenericEditModal({ entity, data, onSave, onClose }: GenericEditModalProps) {
  const fields = FIELDS_MAP[entity]
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const r: Record<string, unknown> = {}
    fields.forEach(f => { r[f.key] = data[f.key] ?? '' })
    return r
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function set(key: string, val: unknown) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  async function save() {
    setSaving(true); setErr('')
    try {
      const payload: Record<string, unknown> = {}
      fields.forEach(f => { if (!f.readOnly) payload[f.key] = form[f.key] })
      const id = data.id as string
      const res = await fetch(API_URL[entity](id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || d.error) { setErr(d.error || 'Erreur Notion'); return }
      onSave(payload)
    } catch { setErr('Erreur réseau') }
    finally { setSaving(false) }
  }

  const entityName = String(data.name || data.id || '')

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 399 }}
      />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          zIndex: 400, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 8, width: 'min(700px, 96vw)', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {ENTITY_LABELS[entity]}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entityName}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '2px 9px', lineHeight: 1.4 }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {fields.map(f => (
              <div
                key={f.key}
                style={{ gridColumn: f.span2 ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 3 }}
              >
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {f.label}
                </div>
                <FieldInput f={f} value={form[f.key]} onChange={v => set(f.key, v)} />
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          {err
            ? <span style={{ fontSize: 11, color: '#ef4444' }}>{err}</span>
            : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Champs grisés = calculés automatiquement</span>
          }
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: '5px 14px', fontFamily: 'inherit' }}
            >
              Annuler
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={{ background: 'var(--accent)', border: 'none', borderRadius: 4, color: '#000', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontSize: 12, padding: '5px 16px', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? '…' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
