import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { useOSDerived } from '../../contexts/OSDataContext'
import OSDrawer from '../../features/ordens/OSDrawer'
import { Badge } from './Badge'
import { shortEquipe, situacaoVariant } from '../../lib/osFormat'
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

const HINT_TAGS = ['nº OS', 'Cliente', 'Bairro', 'Cidade', 'Equipe']

interface GlobalSearchProps {
  open:    boolean
  onClose: () => void
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const { allRows } = useOSDerived()
  const [query,      setQuery]      = useState('')
  const [activeIdx,  setActiveIdx]  = useState(-1)
  const [selectedOS, setSelectedOS] = useState<OSRow | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => searchRows(allRows as OSRow[], query), [allRows, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(-1)
      setSelectedOS(null)
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !selectedOS) { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && activeIdx >= 0 && results[activeIdx]) { openOS(results[activeIdx]) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, selectedOS, results, activeIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  function openOS(os: OSRow) {
    setSelectedOS(os)
    onClose()
  }

  if (!open && !selectedOS) return null

  return (
    <>
      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
          className="fixed inset-0 bg-black/70 backdrop-blur-[2px] z-[200]
                     flex items-start justify-center pt-[12vh] px-4"
        >
          <div className="w-full max-w-[600px] bg-elevated border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
              <Search size={16} className="text-muted flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setActiveIdx(-1) }}
                placeholder="Buscar OS, cliente, cidade, equipe…"
                className="flex-1 bg-transparent text-[14px] text-text placeholder-muted/60 outline-none"
              />
              {query && (
                <button onClick={() => { setQuery(''); setActiveIdx(-1) }} className="text-muted hover:text-secondary transition-colors p-0.5">
                  <X size={13} />
                </button>
              )}
              <kbd className="text-[9px] font-mono bg-surface border border-border
                              rounded px-1.5 py-0.5 text-muted flex-shrink-0 hidden sm:block leading-none">
                ESC
              </kbd>
            </div>

            <div className="max-h-[58vh] overflow-y-auto">
              {query.length < 2 && (
                <div className="px-5 py-8">
                  <p className="text-[11px] font-semibold text-muted mb-3">Buscar por</p>
                  <div className="flex flex-wrap gap-2 mb-8">
                    {HINT_TAGS.map(tag => (
                      <span key={tag} className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1
                                                 bg-surface/40 border border-border rounded-full text-secondary">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-5 text-muted/50">
                    {[
                      { keys: ['↑', '↓'], label: 'navegar' },
                      { keys: ['↵'],      label: 'abrir'   },
                      { keys: ['ESC'],    label: 'fechar'  },
                    ].map(({ keys, label }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <div className="flex gap-1">
                          {keys.map(k => (
                            <kbd key={k} className="text-[9px] font-mono bg-surface border border-border rounded px-1.5 py-0.5 leading-none text-muted/70">
                              {k}
                            </kbd>
                          ))}
                        </div>
                        <span className="text-[10px]">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {query.length >= 2 && results.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <p className="text-[13px] text-muted">Nenhuma OS para <span className="text-text font-semibold">"{query}"</span></p>
                  <p className="text-[11px] text-muted/50 mt-1">Tente nº da OS, nome do cliente ou cidade</p>
                </div>
              )}

              {results.length > 0 && (
                <>
                  <div className="divide-y divide-border/50">
                    {results.map((os, idx) => {
                      const aging = (os._aging as number | undefined) ?? (os._agingAbertura as number | undefined)
                      const agCls = (aging ?? 0) >= 6 ? 'text-red' : (aging ?? 0) >= 3 ? 'text-yellow' : 'text-muted'
                      const isActive = idx === activeIdx
                      return (
                        <button
                          key={os.numos as string}
                          onClick={() => openOS(os)}
                          onMouseEnter={() => setActiveIdx(idx)}
                          className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors
                                      ${isActive ? 'bg-surface' : 'hover:bg-surface/30'}`}
                        >
                          <span className="font-mono text-[12px] text-primary font-bold w-[68px] flex-shrink-0 pt-0.5">
                            {os.numos as string}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-[13px] text-text font-semibold truncate max-w-[220px]">
                                {(os.nomecliente as string) || '—'}
                              </span>
                              <Badge variant={situacaoVariant(os.descsituacao as string)}>{os.descsituacao as string}</Badge>
                              {os._slaCritico && <Badge variant="red">Crítico</Badge>}
                            </div>
                            <p className="text-[11px] text-muted truncate">
                              {[os.nomedacidade, os.bairro, shortEquipe(os.nomedaequipe as string) || 'Sem equipe']
                                .filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          {aging != null && (
                            <span className={`text-[11px] font-mono font-bold flex-shrink-0 ${agCls}`}>{aging}d</span>
                          )}
                          {isActive && (
                            <kbd className="text-[9px] font-mono bg-surface border border-border rounded px-1.5 py-0.5 flex-shrink-0 self-center text-muted leading-none">
                              ↵
                            </kbd>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
                    <span className="text-[11px] text-muted">
                      {results.length} resultado{results.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[11px] text-muted/50">↑↓ para navegar</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <OSDrawer os={selectedOS} onClose={() => setSelectedOS(null)} />
    </>
  )
}
