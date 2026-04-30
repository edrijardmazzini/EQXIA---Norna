'use client'

import { useEffect, useMemo, useState, useRef, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Search, CalendarDays, BarChart3, Briefcase, Umbrella, User, BrainCircuit, Users, FolderKanban } from 'lucide-react'
import { useWorkplaceData } from '@/hooks/useWorkplaceData'

interface CommandItem {
  id: string
  label: string
  hint: string
  href: string
  icon: typeof Search
  category: 'page' | 'person' | 'project'
}

const PAGE_ITEMS: CommandItem[] = [
  { id: 'p:planning',  label: 'Planification',   hint: 'Grille équipe',          href: '/',          icon: CalendarDays, category: 'page' },
  { id: 'p:capacity',  label: 'Capacité',        hint: 'Heatmap + signaux',      href: '/capacity', icon: BarChart3,    category: 'page' },
  { id: 'p:projects',  label: 'Projets',         hint: 'Liste forecast',         href: '/projects', icon: Briefcase,    category: 'page' },
  { id: 'p:leaves',    label: 'Congés',          hint: 'Workflow + soldes',      href: '/leaves',   icon: Umbrella,     category: 'page' },
  { id: 'p:me',        label: 'Mon dashboard',   hint: 'Vue perso',              href: '/me',       icon: User,         category: 'page' },
  { id: 'p:ai',        label: 'Assistant IA',    hint: 'Staffing + Q&A',         href: '/ai',       icon: BrainCircuit, category: 'page' },
]

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  return qi === q.length
}

function scoreMatch(query: string, text: string): number {
  if (!query) return 0.5
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t.startsWith(q)) return 100
  if (t.includes(q))   return 50
  if (fuzzyMatch(q, t)) return 10
  return 0
}

const CATEGORY_LABELS: Record<CommandItem['category'], string> = {
  page:    'Pages',
  person:  'Personnes',
  project: 'Projets',
}

export function CommandPalette() {
  const router = useRouter()
  const { employees, projects } = useWorkplaceData()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        setQuery('')
        setActiveIdx(0)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  const items: CommandItem[] = useMemo(() => {
    const peopleItems: CommandItem[] = employees.map(e => ({
      id: `pe:${e.id}`,
      label: e.name,
      hint: `${e.role}${e.pays ? ' · ' + e.pays : ''}`,
      href: `/people/${e.id}`,
      icon: Users,
      category: 'person',
    }))
    const projectItems: CommandItem[] = projects.map(p => ({
      id: `pr:${p.id}`,
      label: p.name,
      hint: `${p.clientName || '—'} · ${p.type}`,
      href: `/projects/${p.id}`,
      icon: FolderKanban,
      category: 'project',
    }))
    return [...PAGE_ITEMS, ...peopleItems, ...projectItems]
  }, [employees, projects])

  const filtered = useMemo(() => {
    return items
      .map(item => ({
        item,
        score: Math.max(scoreMatch(query, item.label), scoreMatch(query, item.hint) * 0.5),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map(({ item }) => item)
  }, [items, query])

  // Reset active index when filter changes
  useEffect(() => { setActiveIdx(0) }, [query])

  function navigate(item: CommandItem) {
    router.push(item.href)
    setOpen(false)
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = filtered[activeIdx]
      if (selected) navigate(selected)
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (!open) return
    const list = listRef.current
    if (!list) return
    const active = list.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, open])

  if (!open) return null

  // Group by category for display
  const grouped: Record<CommandItem['category'], CommandItem[]> = {
    page: [], person: [], project: [],
  }
  filtered.forEach(item => grouped[item.category].push(item))

  let runningIdx = 0

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '12vh 20px 20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-panel)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-modal)',
          display: 'flex', flexDirection: 'column',
          maxHeight: '70vh',
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <Search size={14} color="var(--text-muted)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Aller à une page, personne ou projet…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 'var(--fs-md)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          />
          <span style={{
            fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace',
            padding: '2px 6px', background: 'var(--bg-input)', borderRadius: 4,
          }}>
            ESC
          </span>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
              Aucun résultat.
            </div>
          ) : (
            (Object.keys(grouped) as CommandItem['category'][]).map(cat => {
              if (grouped[cat].length === 0) return null
              return (
                <div key={cat}>
                  <div style={{
                    padding: '8px 16px 4px',
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontWeight: 600,
                  }}>
                    {CATEGORY_LABELS[cat]}
                  </div>
                  {grouped[cat].map(item => {
                    const idx = runningIdx++
                    const Icon = item.icon
                    const active = idx === activeIdx
                    return (
                      <button
                        key={item.id}
                        data-idx={idx}
                        onClick={() => navigate(item)}
                        onMouseEnter={() => setActiveIdx(idx)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 16px',
                          background: active ? 'var(--accent-soft)' : 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          textAlign: 'left',
                          color: 'var(--text-primary)',
                          borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                        }}
                      >
                        <Icon size={13} color={active ? 'var(--accent)' : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.hint}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'space-between',
          fontSize: 10, color: 'var(--text-muted)',
          fontFamily: 'monospace',
        }}>
          <span>↑↓ naviguer · ↵ ouvrir</span>
          <span>{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}
