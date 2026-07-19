import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { useOSDerived } from '../../contexts/OSDataContext'
import OSDrawer from '../../features/ordens/OSDrawer'
import { Badge } from './Badge'
import { shortEquipe, situacaoVariant } from '../../lib/osFormat'
import { useVisibleNavGroups } from '../../lib/navigation'
import type { NavGroup, NavLinkDef } from '../../lib/navigation'
import type { OSRow } from '../../lib/types'

function matchOS(r: OSRow, q: string): boolean {
  return !!(
    (r.numos as string | undefined)?.toLowerCase().startsWith(q)      ||
    (r.nomecliente as string | undefined)?.toLowerCase().includes(q)  ||
    (r.bairro as string | undefined)?.toLowerCase().includes(q)       ||
    (r.nomedacidade as string | undefined)?.toLowerCase().includes(q) ||
    (r.nomedaequipe as string | undefined)?.toLowerCase().includes(q)
  )
}

function searchRows(allRows: OSRow[], query: string): OSRow[] {
  if (!query || query.trim().length < 2) return []
  const q = query.toLowerCase().trim()
  return allRows
    .filter(r => matchOS(r, q))
    .sort((a, b) => {
      if ((a.numos as string | undefined)?.toLowerCase() === q) return -1
      if ((b.numos as string | undefined)?.toLowerCase() === q) return 1
      return ((b._aging as number) ?? (b._agingAbertura as number) ?? -1) -
             ((a._aging as number) ?? (a._agingAbertura as number) ?? -1)
    })
    .slice(0, 20)
}

// eslint-disable-next-line react-refresh/only-export-components
export function matchPages(groups: NavGroup[], query: string): NavLinkDef[] {
  if (!query.trim()) return []
  const q = query.toLowerCase().trim()
  return groups
    .flatMap(g => g.links)
    .filter(l => l.label.toLowerCase().includes(q))
    .sort((a, b) => {
      const aExact = a.label.toLowerCase() === q
      const bExact = b.label.toLowerCase() === q
      if (aExact && !bExact) return -1
      if (bExact && !aExact) return 1
      return 0
    })
}

type NavigableItem =
  | { type: 'page'; data: NavLinkDef }
  | { type: 'os';   data: OSRow }

interface GlobalSearchProps {
  open:    boolean
  onClose: () => void
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const { allRows } = useOSDerived()
  const groups = useVisibleNavGroups()
  const navigate = useNavigate()
  const [query,      setQuery]      = useState('')
  const [activeIdx,  setActiveIdx]  = useState(-1)
  const [selectedOS, setSelectedOS] = useState<OSRow | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    if (!query.trim()) return { pages: [] as NavLinkDef[], os: [] as OSRow[] }
    return {
      pages: matchPages(groups, query),
      os:    searchRows(allRows as OSRow[], query),
    }
  }, [groups, allRows, query])

  const navigableItems = useMemo<NavigableItem[]>(() => {
    if (!query.trim()) {
      return groups.flatMap(g => g.links.map(l => ({ type: 'page' as const, data: l })))
    }
    return [
      ...results.pages.map(p => ({ type: 'page' as const, data: p })),
      ...results.os.map(o => ({ type: 'os' as const, data: o })),
    ]
  }, [query, groups, results])

  const showSectionHeaders = results.pages.length > 0 && results.os.length > 0

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(-1)
      setSelectedOS(null)
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [open])

  function selectItem(item: NavigableItem) {
    if (item.type === 'page') {
      navigate(item.data.to)
      onClose()
    } else {
      setSelectedOS(item.data)
      onClose()
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !selectedOS) { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, navigableItems.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && activeIdx >= 0 && navigableItems[activeIdx]) { selectItem(navigableItems[activeIdx]) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, selectedOS, navigableItems, activeIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open && !selectedOS) return null

  return (
    <>
      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
          className="fixed inset-0 bg-black/70 backdrop-blur-[2px] z-[200]
                     flex items-start justify-center pt-[12vh] px-4"
        >
          <div className="w-full max-w-[600px] bg-elevated border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.08]">
              <Search size={16} className="text-muted flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setActiveIdx(-1) }}
                placeholder="Buscar OS ou página…"
                className="flex-1 bg-transparent text-body text-text placeholder-muted/60 outline-none"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); setActiveIdx(-1) }}
                  aria-label="Limpar busca"
                  className="text-muted hover:text-secondary transition-colors p-0.5"
                >
                  <X size={13} />
                </button>
              )}
              <kbd className="text-caption font-mono bg-surface border border-white/[0.08]
                              rounded px-1.5 py-0.5 text-muted flex-shrink-0 hidden sm:block leading-none">
                ESC
              </kbd>
            </div>

            <div className="max-h-[58vh] overflow-y-auto">
              {!query.trim() && (
                <div className="px-2 py-2">
                  {groups.map(group => (
                    <div key={group.key} className="mb-1">
                      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                        <div className="w-1 h-3 rounded-full flex-shrink-0" style={{ background: group.color }} />
                        <span
                          className="text-caption font-semibold uppercase tracking-[0.06em]"
                          style={{ color: group.color + 'aa' }}
                        >
                          {group.label}
                        </span>
                      </div>
                      <div className="space-y-px">
                        {group.links.map(link => {
                          const globalIdx = navigableItems.findIndex(it => it.type === 'page' && it.data.to === link.to)
                          const isActive = globalIdx === activeIdx
                          const Icon = link.icon
                          return (
                            <button
                              key={link.to}
                              onClick={() => selectItem({ type: 'page', data: link })}
                              onMouseEnter={() => setActiveIdx(globalIdx)}
                              className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors rounded-lg
                                          ${isActive ? 'bg-surface' : 'hover:bg-surface/30'}`}
                            >
                              <Icon size={14} className="text-muted flex-shrink-0" />
                              <span className="text-body text-text font-medium flex-1">{link.label}</span>
                              {isActive && (
                                <kbd className="text-caption font-mono bg-surface border border-white/[0.08] rounded px-1.5 py-0.5 flex-shrink-0 text-muted leading-none">↵</kbd>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-2.5 border-t border-white/[0.08] flex items-center gap-5 text-muted/50 mt-1">
                    {[
                      { keys: ['↑', '↓'], label: 'navegar' },
                      { keys: ['↵'],      label: 'abrir'   },
                      { keys: ['ESC'],    label: 'fechar'  },
                    ].map(({ keys, label }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <div className="flex gap-1">
                          {keys.map(k => (
                            <kbd key={k} className="text-caption font-mono bg-surface border border-white/[0.08] rounded px-1.5 py-0.5 leading-none text-muted/70">
                              {k}
                            </kbd>
                          ))}
                        </div>
                        <span className="text-caption">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {query.trim().length > 0 && results.pages.length === 0 && results.os.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <p className="text-body text-muted">Nenhum resultado para <span className="text-text font-semibold">"{query}"</span></p>
                  <p className="text-caption text-muted/50 mt-1">Tente nº da OS, nome do cliente, cidade ou o nome de uma página</p>
                </div>
              )}

              {results.pages.length > 0 && (
                <div>
                  {showSectionHeaders && (
                    <p className="px-4 pt-3 pb-1 text-caption font-semibold text-muted uppercase tracking-[0.06em]">Páginas</p>
                  )}
                  <div className="divide-y divide-white/[0.04]">
                    {results.pages.map(page => {
                      const globalIdx = navigableItems.findIndex(it => it.type === 'page' && it.data.to === page.to)
                      const isActive = globalIdx === activeIdx
                      const Icon = page.icon
                      return (
                        <button
                          key={page.to}
                          onClick={() => selectItem({ type: 'page', data: page })}
                          onMouseEnter={() => setActiveIdx(globalIdx)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                                      ${isActive ? 'bg-surface' : 'hover:bg-surface/30'}`}
                        >
                          <Icon size={14} className="text-muted flex-shrink-0" />
                          <span className="text-body text-text font-medium flex-1">{page.label}</span>
                          {isActive && (
                            <kbd className="text-caption font-mono bg-surface border border-white/[0.08] rounded px-1.5 py-0.5 flex-shrink-0 text-muted leading-none">↵</kbd>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {results.os.length > 0 && (
                <div>
                  {showSectionHeaders && (
                    <p className="px-4 pt-3 pb-1 text-caption font-semibold text-muted uppercase tracking-[0.06em]">Ordens de Serviço</p>
                  )}
                  <div className="divide-y divide-white/[0.04]">
                    {results.os.map(os => {
                      const aging = (os._aging as number | undefined) ?? (os._agingAbertura as number | undefined)
                      const agCls = (aging ?? 0) >= 6 ? 'text-red' : (aging ?? 0) >= 3 ? 'text-yellow' : 'text-muted'
                      const globalIdx = navigableItems.findIndex(it => it.type === 'os' && it.data.numos === os.numos)
                      const isActive = globalIdx === activeIdx
                      return (
                        <button
                          key={os.numos as string}
                          onClick={() => selectItem({ type: 'os', data: os })}
                          onMouseEnter={() => setActiveIdx(globalIdx)}
                          className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors
                                      ${isActive ? 'bg-surface' : 'hover:bg-surface/30'}`}
                        >
                          <span className="font-mono text-label text-primary font-bold w-[68px] flex-shrink-0 pt-0.5">
                            {os.numos as string}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-body text-text font-semibold truncate max-w-[220px]">
                                {(os.nomecliente as string) || '—'}
                              </span>
                              <Badge variant={situacaoVariant(os.descsituacao as string)}>{os.descsituacao as string}</Badge>
                              {os._slaCritico && <Badge variant="red">Crítico</Badge>}
                            </div>
                            <p className="text-caption text-muted truncate">
                              {[os.nomedacidade, os.bairro, shortEquipe(os.nomedaequipe as string) || 'Sem equipe']
                                .filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          {aging != null && (
                            <span className={`text-caption font-mono font-bold flex-shrink-0 ${agCls}`}>{aging}d</span>
                          )}
                          {isActive && (
                            <kbd className="text-caption font-mono bg-surface border border-white/[0.08] rounded px-1.5 py-0.5 flex-shrink-0 self-center text-muted leading-none">
                              ↵
                            </kbd>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <div className="px-4 py-2.5 border-t border-white/[0.08] flex items-center justify-between">
                    <span className="text-caption text-muted">
                      {results.os.length} resultado{results.os.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-caption text-muted/50">↑↓ para navegar</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <OSDrawer os={selectedOS} onClose={() => setSelectedOS(null)} />
    </>
  )
}
