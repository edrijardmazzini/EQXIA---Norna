'use client'
import { useState, useMemo, useRef } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface Transaction {
  id: string; transactionNumber: string; type: string; status: string
  amount: number; currency: string; dateIssued: string; dateAccepted: string
  dueDate: string; datePaid: string; delayDays: number; description: string
  projectId: string; clientId: string; paymentMethod: string; notes: string
}
interface DepenseMin {
  id: string; date: string; description: string; montantMUR: number
  categorie: string; fournisseur: string; dossier: string
}
interface MonthData {
  code: string; label: string; theorique: number; reel: number
  invoices: Transaction[]; isFuture: boolean
}
interface CashflowData {
  theoriqueTotal: number; reelTotal: number; tauxRecouvrement: number
  months: MonthData[]; rangeInfo: { nbPast: number; nbFuture: number }
  nbInvoices: number; nbOverdue: number; nbPending: number
}
export interface CashflowViewProps {
  transactions: Transaction[]
  depenses: DepenseMin[]
  cashflowData: CashflowData
  cfViewMode: 'past' | 'future' | 'custom'; setCfViewMode: (v: any) => void
  cfViewPast: 'all' | '12m' | '6m' | '3m'; setCfViewPast: (v: any) => void
  cfViewFuture: '12m' | '6m' | '3m'; setCfViewFuture: (v: any) => void
  cfViewCustomStart: string; setCfViewCustomStart: (v: string) => void
  cfViewCustomEnd: string; setCfViewCustomEnd: (v: string) => void
  fyLabel: string
  currentDossier: string
  onTransactionUpdated: (t: Transaction) => void
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const MFR = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc']
const CARD: React.CSSProperties = { background:'var(--bg-card)', borderRadius:16, border:'1px solid var(--border-subtle)', boxShadow:'var(--shadow-card)', overflow:'hidden' }
const TH: React.CSSProperties = { padding:'8px 12px', textAlign:'left', fontWeight:600, color:'var(--text-muted)', fontSize:'var(--fs-2xs)', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid rgba(166,201,206,0.08)', whiteSpace:'nowrap' }
const TD: React.CSSProperties = { padding:'8px 12px', color:'var(--text-primary)', borderBottom:'1px solid rgba(166,201,206,0.05)', fontSize:'var(--fs-xs)' }

const STATUS_CLR: Record<string,string> = {
  Draft:'#94a3b8', Sent:'#60a5fa', Accepted:'#34d399', Paid:'#22c55e',
  Partial:'#facc15', Overdue:'#f97316', 'Written Off':'#a78bfa',
  Cancelled:'#ef4444', Rejected:'#ef4444',
}
const TYPE_CLR: Record<string,string> = { Quote:'#60a5fa', Invoice:'#A6C9CE', 'Credit Note':'#f97316' }

const STATUS_OPTIONS = ['Draft','Sent','Accepted','Rejected','Revised','Paid','Partial','Overdue','Written Off','Cancelled']
const CURRENCY_OPTIONS = ['MUR','EUR','USD','GBP','KES','ZAR','Other']
const PM_OPTIONS = ['','Bank Transfer','Card','Check','Other']

// ─── Mini helpers ───────────────────────────────────────────────────────────────
function agingColor(days: number, maxDays = 30): string {
  const t = Math.max(0, Math.min(1, days / maxDays))
  return `hsl(${Math.round(120*(1-t))}, 78%, 48%)`
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CLR[status] ?? '#94a3b8'
  return <span style={{ padding:'1px 7px', borderRadius:10, background:`${c}22`, color:c, fontWeight:600, fontSize:'var(--fs-2xs)', whiteSpace:'nowrap' }}>{status}</span>
}

function TypeBadge({ type }: { type: string }) {
  const c = TYPE_CLR[type] ?? '#94a3b8'
  return <span style={{ padding:'1px 7px', borderRadius:10, background:`${c}22`, color:c, fontWeight:600, fontSize:'var(--fs-2xs)', whiteSpace:'nowrap' }}>{type}</span>
}

function fmtAmt(n: number, cur: string) {
  return `${n.toLocaleString('fr-FR')} ${cur}`
}

// ─── Seg & ViewRangeToggle ──────────────────────────────────────────────────────
function Seg({ value, onChange, options }: { value:string; onChange:(v:string)=>void; options:readonly (readonly [string,string])[] }) {
  return (
    <div style={{ display:'flex', background:'rgba(166,201,206,0.06)', borderRadius:6, overflow:'hidden', border:'1px solid rgba(166,201,206,0.10)' }}>
      {options.map(([val, label]) => (
        <button key={val} onClick={() => onChange(val)} style={{ padding:'3px 10px', fontSize:'var(--fs-2xs)', fontWeight:value===val?600:400, color:value===val?'var(--text-primary)':'var(--text-muted)', background:value===val?'rgba(166,201,206,0.15)':'transparent', border:'none', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}>{label}</button>
      ))}
    </div>
  )
}

function ViewRangeToggle({ mode, setMode, past, setPast, future, setFuture, customStart, setCustomStart, customEnd, setCustomEnd, fyLabel }: {
  mode:'past'|'future'|'custom'; setMode:(v:any)=>void
  past:'all'|'12m'|'6m'|'3m'; setPast:(v:any)=>void
  future:'12m'|'6m'|'3m'; setFuture:(v:any)=>void
  customStart:string; setCustomStart:(v:string)=>void
  customEnd:string; setCustomEnd:(v:string)=>void
  fyLabel?:string
}) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
      <Seg value={mode} onChange={v=>setMode(v)} options={[['past','Past'],['future','Future'],['custom','Custom']]} />
      {mode==='past' && <Seg value={past} onChange={v=>setPast(v)} options={[['all','All'],['12m','12m'],['6m','6m'],['3m','3m']]} />}
      {mode==='future' && <Seg value={future} onChange={v=>setFuture(v)} options={[['12m','12m'],['6m','6m'],['3m','3m']]} />}
      {mode==='custom' && (
        <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:'var(--fs-2xs)' }}>
          <input type="month" value={customStart} onChange={e=>setCustomStart(e.target.value)} style={{ padding:'3px 6px', fontSize:'var(--fs-2xs)', background:'rgba(166,201,206,0.06)', border:'1px solid rgba(166,201,206,0.12)', borderRadius:4, color:'var(--text-primary)', fontFamily:'inherit' }}/>
          <span style={{ color:'var(--text-muted)' }}>→</span>
          <input type="month" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} style={{ padding:'3px 6px', fontSize:'var(--fs-2xs)', background:'rgba(166,201,206,0.06)', border:'1px solid rgba(166,201,206,0.12)', borderRadius:4, color:'var(--text-primary)', fontFamily:'inherit' }}/>
          {(customStart||customEnd) && <button onClick={()=>{setCustomStart('');setCustomEnd('')}} style={{ background:'none', border:'1px solid var(--border-subtle)', color:'var(--text-muted)', cursor:'pointer', fontSize:'var(--fs-2xs)', padding:'3px 6px', borderRadius:4, fontFamily:'inherit' }}>{fyLabel?`FY ${fyLabel}`:'Reset'}</button>}
        </div>
      )}
    </div>
  )
}

// ─── Aging Chart ────────────────────────────────────────────────────────────────
function AgingChart({ transactions }: { transactions: Transaction[] }) {
  const [tip, setTip] = useState<{ t: Transaction; x: number; y: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const W = 900, H = 220
  const PL = 10, PR = 10, PT = 30, PB = 30
  const plotW = W - PL - PR

  const now = new Date(); now.setHours(0,0,0,0)
  const nowMs = now.getTime()
  const startMs = nowMs - 120 * 86400000  // 4 months ago
  const endMs   = nowMs +  90 * 86400000  // 3 months ahead
  const spanMs  = endMs - startMs
  const todayX  = PL + ((nowMs - startMs) / spanMs) * plotW

  const xFor = (iso: string): number | null => {
    if (!iso) return null
    const ms = new Date(iso).getTime()
    if (isNaN(ms)) return null
    return PL + ((ms - startMs) / spanMs) * plotW
  }

  // Y jitter — deterministic from id
  const yJit = (id: string, range: number) => {
    const h = id.split('').reduce((a,c) => (a*31 + c.charCodeAt(0)) & 0xffff, 0)
    return (h % range) - range/2
  }

  const dotR = (amt: number) => Math.max(3, Math.min(11, Math.sqrt(Math.abs(amt)/8000)*2.5 + 3))

  // Lane 1 – pending acceptance
  const pendAcc = transactions.filter(t =>
    t.dateIssued && !t.dateAccepted &&
    !['Paid','Cancelled','Rejected','Written Off'].includes(t.status)
  )
  const L1 = PT + 25

  // Lane 2 – pending payment (invoices with due date, unpaid)
  const pendPay = transactions.filter(t =>
    t.type === 'Invoice' && (t.dueDate || t.dateIssued) && !t.datePaid &&
    !['Cancelled','Written Off','Rejected'].includes(t.status)
  )
  const L2 = PT + 115

  // Month ticks
  const ticks: { x: number; label: string }[] = []
  const cur = new Date(startMs); cur.setDate(1)
  while (cur.getTime() < endMs) {
    const tx = PL + ((cur.getTime()-startMs)/spanMs)*plotW
    ticks.push({ x: tx, label: `${MFR[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}` })
    cur.setMonth(cur.getMonth()+1)
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!tip) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const scaleX = W / rect.width
    setTip(prev => prev ? { ...prev, x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * (H / rect.height) } : null)
  }

  return (
    <div style={{ ...CARD, marginBottom: 0 }}>
      <div style={{ padding:'14px 20px 12px', borderBottom:'1px solid rgba(166,201,206,0.08)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <span style={{ fontSize:'var(--fs-sm)', fontWeight:600, color:'var(--text-primary)' }}>📊 Pipeline Aging</span>
          <span style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)', marginLeft:10 }}>vert = récent · rouge = en attente depuis longtemps</span>
        </div>
        <div style={{ display:'flex', gap:12, fontSize:'var(--fs-2xs)', color:'var(--text-muted)', alignItems:'center' }}>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:'50%', background:'hsl(120,78%,48%)', display:'inline-block' }}/>{'< 7 j'}</span>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:'50%', background:'hsl(60,78%,48%)', display:'inline-block' }}/>{' 7–30 j'}</span>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:'50%', background:'hsl(0,78%,48%)', display:'inline-block' }}/>{' > 30 j'}</span>
        </div>
      </div>
      <div style={{ padding:'8px 16px 14px', position:'relative' }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display:'block', overflow:'visible' }}
          onMouseMove={handleMouseMove} onMouseLeave={() => setTip(null)}>

          {/* Lane backgrounds */}
          <rect x={PL} y={PT+6} width={plotW} height={42} rx={4} fill="rgba(166,201,206,0.04)" stroke="rgba(166,201,206,0.08)" strokeWidth={1}/>
          <rect x={PL} y={PT+96} width={plotW} height={42} rx={4} fill="rgba(166,201,206,0.04)" stroke="rgba(166,201,206,0.08)" strokeWidth={1}/>

          {/* Lane labels */}
          <text x={PL} y={PT+2} fontSize={9} fill="rgba(166,201,206,0.55)" fontFamily="inherit" fontWeight="600" style={{ letterSpacing:'0.08em' }}>
            {`EN ATTENTE D'ACCEPTATION (${pendAcc.length})`}
          </text>
          <text x={PL} y={PT+92} fontSize={9} fill="rgba(166,201,206,0.55)" fontFamily="inherit" fontWeight="600" style={{ letterSpacing:'0.08em' }}>
            {`EN ATTENTE DE PAIEMENT (${pendPay.length})`}
          </text>

          {/* Today line */}
          <line x1={todayX} y1={PT+2} x2={todayX} y2={PT+140} stroke="rgba(166,201,206,0.35)" strokeWidth={1} strokeDasharray="3 3"/>
          <text x={todayX+3} y={PT+14} fontSize={8} fill="rgba(166,201,206,0.5)" fontFamily="inherit">Aujourd&apos;hui</text>

          {/* Month ticks */}
          {ticks.map(t => (
            <g key={t.label}>
              <line x1={t.x} y1={PT+140} x2={t.x} y2={PT+145} stroke="rgba(166,201,206,0.2)" strokeWidth={1}/>
              <text x={t.x} y={PT+156} fontSize={8} fill="rgba(166,201,206,0.45)" fontFamily="inherit" textAnchor="middle">{t.label}</text>
            </g>
          ))}

          {/* Lane 1 dots — pending acceptance */}
          {pendAcc.map(t => {
            const x = xFor(t.dateIssued)
            if (x === null || x < PL-5 || x > W-PR+5) return null
            const days = (nowMs - new Date(t.dateIssued).getTime()) / 86400000
            const y = L1 + yJit(t.id, 28)
            const r = dotR(t.amount)
            return (
              <circle key={t.id} cx={x} cy={y} r={r}
                fill={agingColor(days)} opacity={0.88}
                onMouseEnter={() => setTip({ t, x, y })}
                onMouseLeave={() => setTip(null)}
                style={{ cursor:'pointer' }}
              />
            )
          })}

          {/* Lane 2 dots — pending payment */}
          {pendPay.map(t => {
            const ref = t.dueDate || t.dateIssued
            const x = xFor(ref)
            if (x === null || x < PL-5 || x > W-PR+5) return null
            const days = (nowMs - new Date(ref).getTime()) / 86400000
            const y = L2 + yJit(t.id, 28)
            const r = dotR(t.amount)
            return (
              <circle key={t.id} cx={x} cy={y} r={r}
                fill={agingColor(days)} opacity={0.88}
                onMouseEnter={() => setTip({ t, x, y })}
                onMouseLeave={() => setTip(null)}
                style={{ cursor:'pointer' }}
              />
            )
          })}
        </svg>

        {/* Tooltip HTML overlay */}
        {tip && (() => {
          const svgRect = svgRef.current?.getBoundingClientRect()
          if (!svgRect) return null
          const scaleX = svgRect.width / W
          const scaleY = svgRect.height / H
          const px = tip.x * scaleX
          const py = tip.y * scaleY
          const ref = tip.t.dueDate || tip.t.dateIssued
          const days = ref ? (nowMs - new Date(ref).getTime()) / 86400000 : 0
          return (
            <div style={{
              position:'absolute', left: Math.min(px + 14, svgRect.width - 200), top: Math.max(0, py - 20),
              pointerEvents:'none', background:'var(--bg-panel)', border:'1px solid var(--border-subtle)',
              borderRadius:8, padding:'8px 12px', fontSize:'var(--fs-xs)', color:'var(--text-primary)',
              boxShadow:'0 8px 24px rgba(0,0,0,0.5)', zIndex:10, minWidth:180, maxWidth:220,
            }}>
              <div style={{ fontWeight:700, marginBottom:3 }}>{tip.t.transactionNumber || '—'}</div>
              <div><TypeBadge type={tip.t.type}/> <StatusBadge status={tip.t.status}/></div>
              <div style={{ fontFamily:'monospace', marginTop:4 }}>{fmtAmt(tip.t.amount, tip.t.currency)}</div>
              {tip.t.dateIssued && <div style={{ color:'var(--text-muted)', marginTop:2, fontSize:'var(--fs-2xs)' }}>Émis : {tip.t.dateIssued}</div>}
              {tip.t.dueDate && <div style={{ color:'var(--text-muted)', fontSize:'var(--fs-2xs)' }}>Échéance : {tip.t.dueDate}</div>}
              <div style={{ color:agingColor(Math.max(0, days)), fontSize:'var(--fs-2xs)', marginTop:2, fontWeight:600 }}>
                {days < 0 ? `Échéance dans ${Math.round(-days)} j` : `${Math.round(days)} j sans action`}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ─── Edit Modal ──────────────────────────────────────────────────────────────────
function EditModal({ t, onClose, onSaved }: { t: Transaction; onClose: () => void; onSaved: (u: Transaction) => void }) {
  const [form, setForm] = useState({ ...t })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k: keyof Transaction, v: any) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/transactions/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: form.status, amount: form.amount, currency: form.currency,
          dateIssued: form.dateIssued || null, dateAccepted: form.dateAccepted || null,
          datePaid: form.datePaid || null, delayDays: form.delayDays,
          description: form.description, notes: form.notes, paymentMethod: form.paymentMethod,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Erreur')
      onSaved(form)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = { width:'100%', padding:'6px 10px', background:'rgba(166,201,206,0.06)', border:'1px solid rgba(166,201,206,0.15)', borderRadius:6, color:'var(--text-primary)', fontSize:'var(--fs-xs)', fontFamily:'inherit', boxSizing:'border-box' }
  const labelStyle: React.CSSProperties = { fontSize:'var(--fs-2xs)', color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:4 }
  const field = (label: string, el: React.ReactNode) => (
    <div>
      <label style={labelStyle}>{label}</label>
      {el}
    </div>
  )

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background:'var(--bg-card)', borderRadius:16, border:'1px solid var(--border-subtle)', boxShadow:'0 24px 80px rgba(0,0,0,0.6)', width:'min(680px, 95vw)', maxHeight:'90vh', overflowY:'auto' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 24px', borderBottom:'1px solid rgba(166,201,206,0.08)' }}>
          <div>
            <div style={{ fontSize:'var(--fs-md)', fontWeight:700, color:'var(--text-primary)' }}>{form.transactionNumber || 'Transaction'}</div>
            <div style={{ display:'flex', gap:6, marginTop:4 }}>
              <TypeBadge type={form.type}/>
              <StatusBadge status={form.status}/>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:20, lineHeight:1, padding:'4px 8px' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding:'20px 24px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {field('Status',
            <select value={form.status} onChange={e=>set('status',e.target.value)} style={inputStyle}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {field('Méthode de paiement',
            <select value={form.paymentMethod} onChange={e=>set('paymentMethod',e.target.value)} style={inputStyle}>
              {PM_OPTIONS.map(p => <option key={p} value={p}>{p || '—'}</option>)}
            </select>
          )}
          {field('Montant',
            <input type="number" value={form.amount} onChange={e=>set('amount',Number(e.target.value))} style={inputStyle}/>
          )}
          {field('Devise',
            <select value={form.currency} onChange={e=>set('currency',e.target.value)} style={inputStyle}>
              {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {field('Date Issued',
            <input type="date" value={form.dateIssued || ''} onChange={e=>set('dateIssued',e.target.value)} style={inputStyle}/>
          )}
          {field('Date Accepted',
            <input type="date" value={form.dateAccepted || ''} onChange={e=>set('dateAccepted',e.target.value)} style={inputStyle}/>
          )}
          {field('Due Date (formule — lecture seule)',
            <input type="text" readOnly value={form.dueDate || '—'} style={{ ...inputStyle, opacity:0.5, cursor:'default' }}/>
          )}
          {field('Délai de paiement (jours)',
            <input type="number" value={form.delayDays || ''} onChange={e=>set('delayDays',Number(e.target.value))} style={inputStyle}/>
          )}
          {field('Date Paid',
            <input type="date" value={form.datePaid || ''} onChange={e=>set('datePaid',e.target.value)} style={inputStyle}/>
          )}
          <div/>
          <div style={{ gridColumn:'1 / -1' }}>
            {field('Description',
              <textarea value={form.description || ''} onChange={e=>set('description',e.target.value)} rows={2} style={{ ...inputStyle, resize:'vertical' }}/>
            )}
          </div>
          <div style={{ gridColumn:'1 / -1' }}>
            {field('Notes',
              <textarea value={form.notes || ''} onChange={e=>set('notes',e.target.value)} rows={2} style={{ ...inputStyle, resize:'vertical' }}/>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:10, padding:'14px 24px', borderTop:'1px solid rgba(166,201,206,0.08)' }}>
          {err && <span style={{ color:'#ef4444', fontSize:'var(--fs-xs)', marginRight:'auto' }}>{err}</span>}
          <button onClick={onClose} style={{ padding:'8px 18px', background:'none', border:'1px solid var(--border-subtle)', color:'var(--text-muted)', borderRadius:8, cursor:'pointer', fontSize:'var(--fs-xs)', fontFamily:'inherit' }}>Annuler</button>
          <button onClick={save} disabled={saving} style={{ padding:'8px 22px', background:'var(--accent)', border:'none', color:'#000', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:'var(--fs-xs)', fontFamily:'inherit', opacity:saving?0.6:1 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main CashflowView ────────────────────────────────────────────────────────────
export function CashflowView({
  transactions, depenses, cashflowData,
  cfViewMode, setCfViewMode, cfViewPast, setCfViewPast,
  cfViewFuture, setCfViewFuture, cfViewCustomStart, setCfViewCustomStart,
  cfViewCustomEnd, setCfViewCustomEnd, fyLabel, currentDossier, onTransactionUpdated,
}: CashflowViewProps) {
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<keyof Transaction>('dateIssued')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')

  // ── Filtered transaction list ─────────────────────────────────────────────
  const filteredTx = useMemo(() => {
    return transactions
      .filter(t => typeFilter === 'All' || t.type === typeFilter)
      .filter(t => statusFilter === 'All' || t.status === statusFilter)
      .filter(t => !search || t.transactionNumber.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const va = String(a[sortCol] ?? ''), vb = String(b[sortCol] ?? '')
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      })
  }, [transactions, typeFilter, statusFilter, search, sortCol, sortDir])

  const sortHeader = (col: keyof Transaction, label: string) => (
    <th style={TH}>
      <button onClick={() => { if (sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc'); else { setSortCol(col); setSortDir('desc') }}}
        style={{ background:'none', border:'none', color:'inherit', fontSize:'inherit', fontWeight:'inherit', letterSpacing:'inherit', textTransform:'inherit', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:4 }}>
        {label} {sortCol===col ? (sortDir==='asc'?'↑':'↓') : ''}
      </button>
    </th>
  )

  // ── Dépenses by month ─────────────────────────────────────────────────────
  const depByMonth = useMemo(() => {
    const codeSet = new Set(cashflowData.months.map(m => m.code))
    const map: Record<string, number> = {}
    for (const d of depenses) {
      if (d.dossier && codeSet.has(d.dossier)) map[d.dossier] = (map[d.dossier]??0) + d.montantMUR
    }
    return cashflowData.months.map(m => ({ ...m, dep: map[m.code]??0 }))
  }, [depenses, cashflowData.months])

  const depTotal = depByMonth.reduce((s,m) => s + m.dep, 0)
  const maxDepBar = Math.max(...depByMonth.map(m=>m.dep), 1)
  const maxCfBar  = Math.max(...cashflowData.months.map(m=>Math.max(m.theorique, m.reel)), 1)

  const taux = cashflowData.tauxRecouvrement
  const tauxColor = taux >= 80 ? '#22c55e' : taux >= 50 ? '#facc15' : '#ef4444'

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* ── KPIs + chart ──────────────────────────────────────────────────── */}
      <div style={CARD}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 24px', borderBottom:'1px solid rgba(166,201,206,0.08)', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontSize:'var(--fs-md)', fontWeight:600, color:'var(--text-primary)' }}>
              💰 Cashflow Factures
              <span style={{ fontSize:'var(--fs-xs)', fontWeight:400, color:'var(--text-muted)', marginLeft:8 }}>Due Date (théorique) vs Date Paid (réel)</span>
            </div>
            <div style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)', marginTop:2 }}>
              {cashflowData.nbInvoices} facture(s)
              {cashflowData.nbOverdue > 0 && <span style={{ color:'#ef4444', marginLeft:8 }}>· {cashflowData.nbOverdue} en retard</span>}
              {cashflowData.nbPending > 0 && <span style={{ color:'#facc15', marginLeft:8 }}>· {cashflowData.nbPending} en attente</span>}
            </div>
          </div>
          <ViewRangeToggle mode={cfViewMode} setMode={setCfViewMode} past={cfViewPast} setPast={setCfViewPast}
            future={cfViewFuture} setFuture={setCfViewFuture} customStart={cfViewCustomStart}
            setCustomStart={setCfViewCustomStart} customEnd={cfViewCustomEnd} setCustomEnd={setCfViewCustomEnd}
            fyLabel={fyLabel} />
        </div>

        {/* KPI row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', borderBottom:'1px solid rgba(166,201,206,0.08)' }}>
          <div style={{ padding:'18px 24px', borderRight:'1px solid rgba(166,201,206,0.08)' }}>
            <div style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.06em' }}>Théorique (Due Date)</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:6, marginTop:6 }}>
              <span style={{ fontSize:26, fontWeight:800, color:'var(--text-primary)', fontFamily:'monospace' }}>{Math.round(cashflowData.theoriqueTotal).toLocaleString('fr-FR')}</span>
              <span style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)' }}>MUR</span>
            </div>
            <div style={{ fontSize:'var(--fs-2xs)', color:'var(--text-muted)', marginTop:4 }}>Facturé sur la période</div>
          </div>
          <div style={{ padding:'18px 24px', borderRight:'1px solid rgba(166,201,206,0.08)' }}>
            <div style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.06em' }}>Réel (Date Paid)</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:6, marginTop:6 }}>
              <span style={{ fontSize:26, fontWeight:800, color:'#22c55e', fontFamily:'monospace' }}>{Math.round(cashflowData.reelTotal).toLocaleString('fr-FR')}</span>
              <span style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)' }}>MUR</span>
            </div>
            <div style={{ fontSize:'var(--fs-2xs)', color:'var(--text-muted)', marginTop:4 }}>Encaissé effectivement</div>
          </div>
          <div style={{ padding:'18px 24px' }}>
            <div style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.06em' }}>Taux de recouvrement</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:6, marginTop:6 }}>
              <span style={{ fontSize:26, fontWeight:800, color:tauxColor, fontFamily:'monospace' }}>{taux.toFixed(1)}</span>
              <span style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)' }}>%</span>
            </div>
            <div style={{ fontSize:'var(--fs-2xs)', color:'var(--text-muted)', marginTop:4 }}>
              {cashflowData.theoriqueTotal > 0 ? `${Math.round(cashflowData.theoriqueTotal - cashflowData.reelTotal).toLocaleString('fr-FR')} MUR restants` : 'Aucun encours'}
            </div>
          </div>
        </div>

        {/* Monthly double-bar chart */}
        {cashflowData.months.some(m=>m.theorique>0||m.reel>0) ? (
          <div style={{ padding:'16px 24px 20px' }}>
            <div style={{ fontSize:'var(--fs-2xs)', color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>Mensuel</div>
            <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:96 }}>
              {cashflowData.months.map(m => (
                <div key={m.code} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:0 }}>
                  <div style={{ color:'var(--text-muted)', fontFamily:'monospace', fontSize:8 }}>
                    {m.theorique>0 ? `${Math.round(m.theorique/1000)}k` : ''}
                  </div>
                  <div style={{ width:'100%', position:'relative', height:Math.max(3, Math.round((m.theorique/maxCfBar)*68)) }}>
                    <div title={`Théorique ${m.label} : ${Math.round(m.theorique).toLocaleString('fr-FR')} MUR`}
                      style={{ position:'absolute', bottom:0, left:0, right:0, height:'100%', borderRadius:3,
                        background:m.isFuture?'rgba(166,201,206,0.10)':'rgba(166,201,206,0.18)',
                        border:`1px ${m.isFuture?'dashed':'solid'} rgba(166,201,206,0.35)` }}/>
                    {m.reel>0 && <div title={`Réel ${m.label} : ${Math.round(m.reel).toLocaleString('fr-FR')} MUR`}
                      style={{ position:'absolute', bottom:0, left:0, right:0,
                        height:`${Math.round((m.reel/m.theorique)*100)}%`, borderRadius:3,
                        background:'linear-gradient(180deg,#22c55e 0%,#16a34a 100%)', minHeight:3 }}/>}
                  </div>
                  <div style={{ fontSize:8, color:'var(--text-muted)', textAlign:'center', overflow:'hidden', maxWidth:'100%', whiteSpace:'nowrap' }}>
                    {m.label.slice(0,3)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:16, marginTop:10, fontSize:'var(--fs-2xs)', color:'var(--text-muted)' }}>
              <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:10,height:10,borderRadius:2,background:'rgba(166,201,206,0.18)',border:'1px solid rgba(166,201,206,0.35)',display:'inline-block' }}/>Théorique</span>
              <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:10,height:10,borderRadius:2,background:'linear-gradient(180deg,#22c55e 0%,#16a34a 100%)',display:'inline-block' }}/>Réel</span>
            </div>
          </div>
        ) : (
          <div style={{ padding:'16px 24px', fontSize:'var(--fs-xs)', color:'var(--text-muted)', fontStyle:'italic' }}>
            {transactions.length===0 ? 'Chargement des transactions…' : 'Aucune facture sur la période.'}
          </div>
        )}
      </div>

      {/* ── Aging chart ─────────────────────────────────────────────────────── */}
      <AgingChart transactions={transactions}/>

      {/* ── Dépenses ──────────────────────────────────────────────────────── */}
      <div style={CARD}>
        <div style={{ padding:'14px 24px 12px', borderBottom:'1px solid rgba(166,201,206,0.08)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:'var(--fs-sm)', fontWeight:600, color:'var(--text-primary)' }}>💸 Dépenses</div>
            <div style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)', marginTop:2 }}>À la date de la dépense · même plage que le cashflow</div>
          </div>
          <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
            <span style={{ fontSize:20, fontWeight:800, color:'#ef4444', fontFamily:'monospace' }}>{Math.round(depTotal).toLocaleString('fr-FR')}</span>
            <span style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)' }}>MUR</span>
          </div>
        </div>

        {depTotal > 0 ? (
          <>
            {/* Monthly bar chart */}
            <div style={{ padding:'16px 24px 12px' }}>
              <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:56 }}>
                {depByMonth.map(m => (
                  <div key={m.code} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:0 }}>
                    <div
                      title={`${m.label} · ${Math.round(m.dep).toLocaleString('fr-FR')} MUR`}
                      style={{ width:'100%', height:m.dep>0?Math.max(3,Math.round((m.dep/maxDepBar)*44)):2, borderRadius:3,
                        background:m.isFuture?'rgba(239,68,68,0.20)':'linear-gradient(180deg,#ef4444 0%,#b91c1c 100%)',
                        border:m.isFuture?'1px dashed rgba(239,68,68,0.3)':'none', transition:'height 0.3s ease' }}/>
                    <div style={{ fontSize:8, color:'var(--text-muted)', overflow:'hidden', maxWidth:'100%', whiteSpace:'nowrap' }}>
                      {m.label.slice(0,3)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Top depenses listing */}
            <div style={{ borderTop:'1px solid rgba(166,201,206,0.06)' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    <th style={TH}>Date</th>
                    <th style={TH}>Description</th>
                    <th style={TH}>Fournisseur</th>
                    <th style={TH}>Catégorie</th>
                    <th style={{ ...TH, textAlign:'right' }}>Montant (MUR)</th>
                  </tr>
                </thead>
                <tbody>
                  {depenses
                    .filter(d => cashflowData.months.some(m=>m.code===d.dossier))
                    .sort((a,b)=>b.date.localeCompare(a.date))
                    .slice(0,20)
                    .map(d => (
                      <tr key={d.id} style={{ transition:'background 0.15s' }}
                        onMouseEnter={e=>(e.currentTarget.style.background='rgba(166,201,206,0.04)')}
                        onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                        <td style={{ ...TD, fontFamily:'monospace', color:'var(--text-muted)', whiteSpace:'nowrap' }}>{d.date||'—'}</td>
                        <td style={TD}>{d.description||'—'}</td>
                        <td style={{ ...TD, color:'var(--text-secondary)' }}>{d.fournisseur||'—'}</td>
                        <td style={TD}><span style={{ fontSize:'var(--fs-2xs)', color:'var(--text-muted)' }}>{d.categorie||'—'}</span></td>
                        <td style={{ ...TD, textAlign:'right', fontFamily:'monospace', fontWeight:600, color:'#ef4444' }}>{Math.round(d.montantMUR).toLocaleString('fr-FR')}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {depenses.filter(d=>cashflowData.months.some(m=>m.code===d.dossier)).length > 20 && (
                <div style={{ padding:'8px 16px', fontSize:'var(--fs-2xs)', color:'var(--text-muted)', borderTop:'1px solid rgba(166,201,206,0.05)' }}>
                  + {depenses.filter(d=>cashflowData.months.some(m=>m.code===d.dossier)).length-20} dépenses non affichées
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ padding:'16px 24px', fontSize:'var(--fs-xs)', color:'var(--text-muted)', fontStyle:'italic' }}>Aucune dépense sur la période.</div>
        )}
      </div>

      {/* ── Transaction listing ───────────────────────────────────────────── */}
      <div style={CARD}>
        <div style={{ padding:'14px 24px 12px', borderBottom:'1px solid rgba(166,201,206,0.08)' }}>
          <div style={{ fontSize:'var(--fs-sm)', fontWeight:600, color:'var(--text-primary)', marginBottom:10 }}>📋 Transactions</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            {/* Type filter */}
            <Seg value={typeFilter} onChange={setTypeFilter} options={[['All','Toutes'],['Invoice','Factures'],['Quote','Devis'],['Credit Note','Avoirs']]}/>
            {/* Status filter */}
            <Seg value={statusFilter} onChange={setStatusFilter}
              options={[['All','Tous'],['Sent','Sent'],['Accepted','Accepted'],['Paid','Paid'],['Overdue','Overdue'],['Partial','Partial']]}/>
            {/* Search */}
            <input
              value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Rechercher…"
              style={{ padding:'3px 10px', fontSize:'var(--fs-2xs)', background:'rgba(166,201,206,0.06)', border:'1px solid rgba(166,201,206,0.12)', borderRadius:6, color:'var(--text-primary)', fontFamily:'inherit', outline:'none' }}/>
            <span style={{ marginLeft:'auto', fontSize:'var(--fs-2xs)', color:'var(--text-muted)' }}>{filteredTx.length} transaction(s)</span>
          </div>
        </div>

        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:780 }}>
            <thead>
              <tr>
                {sortHeader('transactionNumber','Numéro')}
                {sortHeader('type','Type')}
                {sortHeader('status','Statut')}
                {sortHeader('amount','Montant')}
                {sortHeader('dateIssued','Émis le')}
                {sortHeader('dueDate','Échéance')}
                {sortHeader('datePaid','Payé le')}
                <th style={TH}/>
              </tr>
            </thead>
            <tbody>
              {filteredTx.length === 0 ? (
                <tr><td colSpan={8} style={{ ...TD, textAlign:'center', fontStyle:'italic', color:'var(--text-muted)', padding:'20px' }}>Aucune transaction</td></tr>
              ) : filteredTx.map((t, i) => {
                const dueDays = t.dueDate && !t.datePaid
                  ? (new Date().getTime() - new Date(t.dueDate).getTime()) / 86400000
                  : null
                return (
                  <tr key={t.id}
                    style={{ borderBottom: i < filteredTx.length-1 ? '1px solid rgba(166,201,206,0.05)' : undefined, transition:'background 0.15s' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(166,201,206,0.04)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <td style={{ ...TD, fontWeight:600 }}>{t.transactionNumber||'—'}</td>
                    <td style={TD}><TypeBadge type={t.type}/></td>
                    <td style={TD}><StatusBadge status={t.status}/></td>
                    <td style={{ ...TD, fontFamily:'monospace', textAlign:'right', whiteSpace:'nowrap' }}>{fmtAmt(t.amount, t.currency)}</td>
                    <td style={{ ...TD, fontFamily:'monospace', color:'var(--text-muted)', whiteSpace:'nowrap' }}>{t.dateIssued||'—'}</td>
                    <td style={{ ...TD, fontFamily:'monospace', whiteSpace:'nowrap',
                      color: dueDays !== null ? (dueDays > 0 ? agingColor(dueDays) : '#22c55e') : 'var(--text-muted)' }}>
                      {t.dueDate||'—'}
                      {dueDays !== null && dueDays > 0 && <span style={{ fontSize:'var(--fs-2xs)', marginLeft:4 }}>({Math.round(dueDays)}j)</span>}
                    </td>
                    <td style={{ ...TD, fontFamily:'monospace', color:t.datePaid?'#22c55e':'var(--text-muted)', whiteSpace:'nowrap' }}>{t.datePaid||'—'}</td>
                    <td style={{ ...TD, textAlign:'right' }}>
                      <button onClick={() => setEditTx(t)}
                        style={{ padding:'3px 10px', background:'rgba(166,201,206,0.08)', border:'1px solid rgba(166,201,206,0.15)', color:'var(--accent)', borderRadius:6, cursor:'pointer', fontSize:'var(--fs-2xs)', fontFamily:'inherit', fontWeight:600 }}>
                        Éditer
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {editTx && (
        <EditModal
          t={editTx}
          onClose={() => setEditTx(null)}
          onSaved={updated => { setEditTx(null); onTransactionUpdated(updated) }}
        />
      )}
    </div>
  )
}
