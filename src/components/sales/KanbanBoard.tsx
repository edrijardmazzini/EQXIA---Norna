'use client'

import { useState } from 'react'
import type { Project, Client, Employee } from '@/types/sales'
import { PIPELINE_COLS, CLOSED_WON, CLOSED_LOST, fmtCurrency, winFactor } from '@/types/sales'
import { DealCard } from './DealCard'
import { Button } from '@/components/ui/Button'

const NEXT_ACTIONS = ['Send Proposal', 'Follow Up', 'Schedule Meeting', 'Send Contract', 'Awaiting Client', 'Internal Review', 'Close Deal']
const DEAL_TYPES = ['Workshop', 'Audit', 'Consulting', 'Development', 'Training', 'Retainer', 'Strategic Review', 'Internal']
const CURRENCIES = ['MUR', 'EUR', 'USD', 'GBP']
const LOST_REASONS = ['Price Too High', 'Went with Competitor', 'No Budget', 'Timing Not Right', 'No Decision Made', 'Scope Mismatch', 'Internal Restructuring', 'Other']
const ALL_STATUSES = ['Lead', 'Qualified', 'Scoping', 'Proposal Sent', 'Negotiation', 'Verbal Commitment', 'Won', 'Active', 'On Hold', 'Completed', 'Lost', 'Cancelled']

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border-input)',
  borderRadius: 'var(--radius-input)', padding: '7px 10px',
  fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', width: '100%',
}
const labelStyle: React.CSSProperties = {
  fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em',
}

interface KanbanBoardProps {
  projects: Project[]
  clients: Client[]
  employees: Employee[]
  onProjectsChange: (projects: Project[]) => void
  ownerFilter?: string
  clientFilter?: string
}

export function KanbanBoard({ projects, clients, employees, onProjectsChange, ownerFilter, clientFilter }: KanbanBoardProps) {
  const [selectedDeal, setSelectedDeal] = useState<Project | null>(null)
  const [editState, setEditState] = useState<Partial<Project>>({})
  const [editSaving, setEditSaving] = useState(false)
  const [lostPrompt, setLostPrompt] = useState<{ dealId: string; targetStatus: string } | null>(null)
  const [showQuickEntry, setShowQuickEntry] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', clientId: '', type: '', quotedAmount: '', currency: 'MUR',
    ownerId: '', nextAction: '', nextActionDate: '', winPercent: 20,
  })

  const pipelineDeals = projects.filter(p =>
    !CLOSED_WON.has(p.status) && !CLOSED_LOST.has(p.status) && p.status !== 'Completed' && p.status !== 'On Hold'
  )

  const filtered = pipelineDeals.filter(d => {
    if (ownerFilter && d.ownerName !== ownerFilter) return false
    if (clientFilter && !d.clientIds.includes(clientFilter)) return false
    return true
  })

  async function moveDeal(dealId: string, newStatus: string) {
    const deal = projects.find(p => p.id === dealId)
    if (!deal) return
    if (CLOSED_LOST.has(newStatus) && !deal.lostReason) {
      setLostPrompt({ dealId, targetStatus: newStatus })
      return
    }
    onProjectsChange(projects.map(p => p.id === dealId ? { ...p, status: newStatus } : p))
    await fetch(`/api/sales/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
  }

  async function confirmLost(reason: string) {
    if (!lostPrompt) return
    const { dealId, targetStatus } = lostPrompt
    setLostPrompt(null)
    onProjectsChange(projects.map(p => p.id === dealId ? { ...p, status: targetStatus, lostReason: reason } : p))
    await fetch(`/api/sales/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: targetStatus, lostReason: reason }),
    })
  }

  async function saveDealEdit() {
    if (!selectedDeal) return
    setEditSaving(true)
    try {
      await fetch(`/api/sales/${selectedDeal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editState),
      })
      onProjectsChange(projects.map(p => p.id === selectedDeal.id ? { ...p, ...editState } : p))
      setSelectedDeal(null)
      setEditState({})
    } finally {
      setEditSaving(false)
    }
  }

  async function createDeal() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, clientIds: form.clientId ? [form.clientId] : [],
          type: form.type, quotedAmount: Number(form.quotedAmount) || 0,
          currency: form.currency, ownerIds: form.ownerId ? [form.ownerId] : [],
          nextAction: form.nextAction, nextActionDate: form.nextActionDate, winPercent: form.winPercent,
        }),
      })
      const { id } = await res.json() as { id: string }
      const blank: Project = {
        id, name: form.name, status: 'Lead', type: form.type, currency: form.currency,
        quotedAmount: Number(form.quotedAmount) || 0, finalAmount: 0, winPercent: form.winPercent, winAuto: 0,
        health: '', daysInCurrentStage: 0, sourceLead: '', nextAction: form.nextAction,
        nextActionDate: form.nextActionDate, expectedCloseDate: '', lostReason: '',
        clientIds: form.clientId ? [form.clientId] : [],
        clientName: clients.find(c => c.id === form.clientId)?.name || 'N/A',
        ownerName: employees.find(e => e.id === form.ownerId)?.name || '',
        ownerIds: form.ownerId ? [form.ownerId] : [],
        created: new Date().toISOString(), startDate: '', endDate: '',
        dateQualified: '', dateScoping: '', dateProposalSent: '',
        dateNegotiation: '', dateVerbalCommitment: '', dateClosed: '', dateOnHold: '',
        decisionDate: '', riskLevel: '', budgetConfirmed: false, internalChampion: '', netAmount: 0,
      }
      onProjectsChange([blank, ...projects])
      setShowQuickEntry(false)
      setForm({ name: '', clientId: '', type: '', quotedAmount: '', currency: 'MUR', ownerId: '', nextAction: '', nextActionDate: '', winPercent: 20 })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
          {filtered.length} deal{filtered.length !== 1 ? 's' : ''} actifs
        </span>
        <Button variant="primary" size="sm" onClick={() => setShowQuickEntry(true)}>+ Nouveau deal</Button>
      </div>

      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
        {PIPELINE_COLS.map(col => {
          const colDeals = filtered.filter(d => d.status === col.status)
          const total = colDeals.reduce((s, d) => s + d.quotedAmount, 0)
          return (
            <div
              key={col.status}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                const dealId = e.dataTransfer.getData('dealId')
                if (dealId) moveDeal(dealId, col.status)
              }}
              style={{
                minWidth: 220, width: 220, flexShrink: 0,
                background: 'var(--bg-card)', borderRadius: 'var(--radius-card)',
                border: '1px solid var(--border-subtle)', overflow: 'hidden',
              }}
            >
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.accent, display: 'inline-block' }} />
                    <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {col.label}
                    </span>
                  </div>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', background: 'var(--accent-soft)', borderRadius: 10, padding: '1px 7px' }}>
                    {colDeals.length}
                  </span>
                </div>
                {total > 0 && (
                  <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                    {fmtCurrency(total)} · {Math.round(colDeals.reduce((s, d) => s + d.quotedAmount * winFactor(d), 0))}
                  </div>
                )}
              </div>

              <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
                {colDeals.map(deal => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={e => e.dataTransfer.setData('dealId', deal.id)}
                  >
                    <DealCard deal={deal} onClick={() => { setSelectedDeal(deal); setEditState({}) }} />
                  </div>
                ))}
                <button
                  onClick={() => setShowQuickEntry(true)}
                  style={{ padding: 6, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', background: 'none', border: '1px dashed var(--border-subtle)', borderRadius: 8, cursor: 'pointer', textAlign: 'center' }}
                >
                  + Ajouter
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Backdrop */}
      {(showQuickEntry || selectedDeal || lostPrompt) && (
        <div
          onClick={() => { setShowQuickEntry(false); setSelectedDeal(null); setLostPrompt(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40, backdropFilter: 'blur(4px)' }}
        />
      )}

      {/* Quick entry modal */}
      {showQuickEntry && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 50, width: 480, background: 'var(--bg-card)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-modal)', padding: 28 }}>
          <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, marginBottom: 20 }}>Nouveau deal</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Nom du deal *</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Projet RH BDO" />
            </div>
            <div>
              <label style={labelStyle}>Client</label>
              <select style={inputStyle} value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select style={inputStyle} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {DEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Montant estimé</label>
              <input style={inputStyle} type="number" value={form.quotedAmount} onChange={e => setForm(f => ({ ...f, quotedAmount: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label style={labelStyle}>Devise</label>
              <select style={inputStyle} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Owner</label>
              <select style={inputStyle} value={form.ownerId} onChange={e => setForm(f => ({ ...f, ownerId: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Prochaine action</label>
              <select style={inputStyle} value={form.nextAction} onChange={e => setForm(f => ({ ...f, nextAction: e.target.value }))}>
                <option value="">— Sélectionner —</option>
                {NEXT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Date action</label>
              <input style={inputStyle} type="date" value={form.nextActionDate} onChange={e => setForm(f => ({ ...f, nextActionDate: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Win % — {form.winPercent}%</label>
              <input type="range" min={0} max={100} step={5} value={form.winPercent} onChange={e => setForm(f => ({ ...f, winPercent: Number(e.target.value) }))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setShowQuickEntry(false)}>Annuler</Button>
            <Button variant="primary" loading={saving} onClick={createDeal} disabled={!form.name.trim()}>Créer</Button>
          </div>
        </div>
      )}

      {/* Deal detail modal */}
      {selectedDeal && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 50, width: 540, maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-modal)', padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, marginBottom: 2 }}>{selectedDeal.name}</div>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>{selectedDeal.clientName}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--accent)' }}>
                {fmtCurrency(selectedDeal.quotedAmount, selectedDeal.currency)}
              </div>
              {selectedDeal.daysInCurrentStage > 0 && (
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                  {selectedDeal.daysInCurrentStage}j dans cette étape {selectedDeal.health}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
            {([
              ['Type', selectedDeal.type || '—'],
              ['Owner', selectedDeal.ownerName || '—'],
              ['Source', selectedDeal.sourceLead || '—'],
              ['Win %', `${Math.round(winFactor(selectedDeal) * 100)}%`],
            ] as [string, string][]).map(([l, v]) => (
              <div key={l} style={{ background: 'var(--bg-page)', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Mise à jour</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Statut</label>
                <select style={inputStyle} value={(editState.status ?? selectedDeal.status)} onChange={e => setEditState(s => ({ ...s, status: e.target.value }))}>
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Prochaine action</label>
                <select style={inputStyle} value={(editState.nextAction ?? selectedDeal.nextAction)} onChange={e => setEditState(s => ({ ...s, nextAction: e.target.value }))}>
                  <option value="">—</option>
                  {NEXT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Date action</label>
                <input style={inputStyle} type="date" value={(editState.nextActionDate ?? selectedDeal.nextActionDate)} onChange={e => setEditState(s => ({ ...s, nextActionDate: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Expected Close</label>
                <input style={inputStyle} type="date" value={(editState.expectedCloseDate ?? selectedDeal.expectedCloseDate)} onChange={e => setEditState(s => ({ ...s, expectedCloseDate: e.target.value }))} />
              </div>
              {CLOSED_LOST.has((editState.status ?? selectedDeal.status)) && (
                <div>
                  <label style={labelStyle}>Raison de perte</label>
                  <select style={inputStyle} value={(editState.lostReason ?? selectedDeal.lostReason)} onChange={e => setEditState(s => ({ ...s, lostReason: e.target.value }))}>
                    <option value="">—</option>
                    {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => { setSelectedDeal(null); setEditState({}) }}>Fermer</Button>
            <Button variant="primary" loading={editSaving} onClick={saveDealEdit} disabled={Object.keys(editState).length === 0}>Enregistrer</Button>
          </div>
        </div>
      )}

      {/* Lost reason prompt */}
      {lostPrompt && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 51, width: 380, background: 'var(--bg-card)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-modal)', padding: 24 }}>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, marginBottom: 4 }}>Raison de perte</div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: 16 }}>Obligatoire pour passer en Lost.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {LOST_REASONS.map(r => (
              <button key={r} onClick={() => confirmLost(r)} style={{ padding: '8px 14px', borderRadius: 'var(--radius-btn)', border: '1px solid var(--border-subtle)', background: 'var(--bg-page)', color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left', fontSize: 'var(--fs-sm)', fontFamily: 'inherit' }}>
                {r}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" style={{ marginTop: 12 }} onClick={() => setLostPrompt(null)}>Annuler</Button>
        </div>
      )}
    </>
  )
}
