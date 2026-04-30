'use client'

import { useState, FormEvent, KeyboardEvent } from 'react'
import { Sparkles, Send, Lightbulb, AlertCircle } from 'lucide-react'

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

interface AIResponse {
  intent: ParsedIntent
  candidates: RankedCandidate[]
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheCreationTokens: number
  }
}

const SUGGESTED_QUERIES = [
  'Qui peut animer un workshop GenAI le 18 novembre à Maurice ?',
  'Qui est libre la semaine prochaine pour un audit ?',
  'Qui a le plus d\'expertise en Change Management ?',
  'Qui peut prendre un consulting IA en France en décembre ?',
]

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--card-bg)',
  backdropFilter: 'var(--card-blur)',
  WebkitBackdropFilter: 'var(--card-blur)',
  border: 'var(--card-border)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'var(--card-shadow)',
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? '#22c55e' :
    score >= 60 ? '#facc15' :
    score >= 40 ? '#f97316' : '#ef4444'
  return (
    <div style={{
      width: 48, height: 48,
      borderRadius: '50%',
      background: `${color}22`,
      border: `2px solid ${color}`,
      color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700,
      fontSize: 'var(--fs-md)',
      fontFamily: 'monospace',
      flexShrink: 0,
    }}>
      {score}
    </div>
  )
}

function ScoreBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ fontFamily: 'monospace' }}>{value}/{max}</span>
      </div>
      <div style={{ height: 4, background: 'var(--bg-input)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

export default function AIAssistantPage() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AIResponse | null>(null)

  async function submit(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    setQuery(trimmed)
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/workplace/ai/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setResult(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    submit(query)
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit(query)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 880, margin: '0 auto', width: '100%' }}>

      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={18} color="var(--accent)" />
          <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700 }}>Assistant Staffing</div>
          <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 'var(--radius-badge)', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em' }}>BETA</span>
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
          Posez une question en langage naturel — Claude classe les candidats selon compétences, disponibilité et localisation.
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{ ...CARD_STYLE, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ex : Qui peut animer un workshop GenAI le 18 novembre à Maurice ?"
          rows={2}
          autoFocus
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: 'var(--fs-md)',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            resize: 'none',
            padding: 4,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            ⌘/Ctrl + Entrée pour envoyer
          </span>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px',
              borderRadius: 'var(--radius-btn)',
              border: '1px solid var(--btn-add-border)',
              background: loading ? 'var(--accent-soft)' : 'var(--btn-add-bg)',
              color: 'var(--btn-add-color)',
              fontSize: 'var(--fs-xs)',
              fontWeight: 600,
              cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: !query.trim() ? 0.5 : 1,
            }}
          >
            <Send size={12} /> {loading ? 'Analyse en cours…' : 'Envoyer'}
          </button>
        </div>
      </form>

      {/* Suggested queries */}
      {!result && !loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            <Lightbulb size={11} /> Exemples de questions
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
            {SUGGESTED_QUERIES.map(q => (
              <button
                key={q}
                onClick={() => submit(q)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-btn)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--fs-xs)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  lineHeight: 1.4,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card-hover)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ ...CARD_STYLE, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 10, borderColor: 'var(--color-error)' }}>
          <AlertCircle size={16} color="var(--color-error)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--color-error)' }}>Erreur</div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>{error}</div>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ ...CARD_STYLE, padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 14, height: 14, borderRadius: '50%',
              border: '2px solid var(--accent-soft)',
              borderTopColor: 'var(--accent)',
              animation: 'spin 0.8s linear infinite',
              display: 'inline-block',
            }} />
            Claude analyse l'équipe et les allocations…
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Intent summary */}
          <div style={{ ...CARD_STYLE, padding: 16 }}>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>
              Compréhension de la requête
            </div>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', marginBottom: 10 }}>
              {result.intent.summary}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {result.intent.dateRange    && <Tag label={result.intent.dateRange} kind="period" />}
              {result.intent.projectType  && <Tag label={result.intent.projectType} kind="type" />}
              {result.intent.location     && <Tag label={result.intent.location} kind="loc" />}
              {result.intent.requiredSkills.map(s => <Tag key={s} label={s} kind="skill" />)}
            </div>
          </div>

          {/* Candidates */}
          {result.candidates.length === 0 ? (
            <div style={{ ...CARD_STYLE, padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
              Aucun candidat ne correspond à cette demande.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {result.candidates.map((c, i) => (
                <div key={c.employeeId} style={{ ...CARD_STYLE, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 12,
                    background: i === 0 ? 'var(--accent)' : 'var(--accent-soft)',
                    color: i === 0 ? 'var(--bg-page)' : 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 'var(--fs-2xs)', fontWeight: 700, flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  <ScoreBadge score={c.score} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.45 }}>
                      {c.reasoning}
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                      <ScoreBar value={c.skillScore}        max={40} label="Compétences" />
                      <ScoreBar value={c.availabilityScore} max={40} label="Dispo" />
                      <ScoreBar value={c.locationScore}     max={20} label="Pays" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Usage footer */}
          {result.usage && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right', fontFamily: 'monospace' }}>
              {result.usage.inputTokens} in · {result.usage.outputTokens} out
              {result.usage.cacheReadTokens > 0 && ` · ${result.usage.cacheReadTokens} cached`}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Tag({ label, kind }: { label: string; kind: 'period' | 'type' | 'loc' | 'skill' }) {
  const palette: Record<typeof kind, { bg: string; color: string }> = {
    period: { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' },
    type:   { bg: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' },
    loc:    { bg: 'rgba(34, 197, 94, 0.15)',  color: '#4ade80' },
    skill:  { bg: 'var(--accent-soft)',       color: 'var(--accent)' },
  }
  const p = palette[kind]
  return (
    <span style={{
      padding: '3px 9px',
      borderRadius: 'var(--radius-badge)',
      background: p.bg,
      color: p.color,
      fontSize: 'var(--fs-2xs)',
      fontWeight: 600,
    }}>
      {label}
    </span>
  )
}
