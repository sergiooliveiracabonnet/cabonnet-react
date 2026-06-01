import { useState, useMemo, type ReactNode } from 'react'
import {
  MapPin, ChevronRight, Search, X,
} from 'lucide-react'
import { Modal }  from '../../components/ui/Modal'
import { shortEquipe, situacaoVariant } from '../../lib/osFormat'
import { Badge }   from '../../components/ui/Badge'
import type { OSRow } from '../../lib/types'
import type { DrillRow, EquipeEntry, IconComp } from './gerencialUtils'

export function SectionLabel({ icon: Icon, color, children }: { icon: IconComp; color: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ background: color }} />
      <Icon size={12} style={{ color }} className="flex-shrink-0" />
      <span className="text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color }}>
        {children}
      </span>
    </div>
  )
}

// ─── OSListModal ──────────────────────────────────────────────────────────────

export function OSListModal({ open, onClose, title, rows = [] as OSRow[], color = '#3b82f6' }: {
  open: boolean; onClose: () => void; title: string; rows?: OSRow[]; color?: string
}) {
  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="780px">
      <div className="flex flex-col" style={{ maxHeight: '72vh' }}>

        {/* Sub-header: count + legenda */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/[0.08]">
          <span className="text-[12px] font-semibold" style={{ color }}>
            {rows.length} {rows.length === 1 ? 'ordem' : 'ordens'}
          </span>
          <div className="flex items-center gap-4 text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-green inline-block" /> Concluída
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-cyan inline-block" /> Atendimento
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-yellow inline-block" /> Pendente
            </span>
          </div>
        </div>

        {/* Cabeçalho da tabela */}
        <div className="grid grid-cols-[80px_1fr_110px_110px_55px] gap-3 px-5 py-2
                        bg-surface/20 border-b border-white/[0.05]
                        text-[10px] font-bold uppercase tracking-[0.05em] text-muted flex-shrink-0">
          <span>OS #</span>
          <span>Cliente</span>
          <span>Cidade</span>
          <span>Equipe</span>
          <span className="text-right">Aging</span>
        </div>

        {/* Lista scrollável */}
        <div className="overflow-y-auto flex-1">
          {rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-[12px] text-muted">
              Nenhuma OS encontrada
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {rows.map(r => {
                const aging = r._aging ?? 0
                const agClr = aging >= 6 ? '#f87171' : aging >= 3 ? '#f97316' : '#94a3b8'
                const sitVariant = situacaoVariant(r.descsituacao)
                return (
                  <div key={r.numos}
                       className="grid grid-cols-[80px_1fr_110px_110px_55px] gap-3
                                  px-5 py-2.5 items-center hover:bg-surface/20 transition-colors">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono font-bold text-[11px]" style={{ color }}>
                        {r.numos}
                      </span>
                      <Badge variant={sitVariant} className="text-[9px] px-1.5 py-px w-fit">
                        {(r.descsituacao || '—').replace('Concluída/Sem Execução', 'S/Exec')}
                      </Badge>
                    </div>
                    <span className="text-[12px] font-semibold text-text truncate">
                      {r.nomecliente || '—'}
                    </span>
                    <span className="text-[11px] text-secondary truncate">
                      {r.nomedacidade || '—'}
                    </span>
                    <span className="text-[11px] text-muted truncate">
                      {shortEquipe(r.nomedaequipe) || '—'}
                    </span>
                    <span className="font-mono font-bold text-[12px] text-right"
                          style={{ color: agClr }}>
                      {aging}d
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── HeroCount ────────────────────────────────────────────────────────────────

export function HeroCount({ value, label, sub, color, onClick }: {
  value: number | string; label: string; sub?: string; color: string; onClick?: () => void
}) {
  const clickable = !!onClick
  return (
    <div className={`relative overflow-hidden rounded-2xl border animate-card-enter
                     ${clickable ? 'cursor-pointer transition-transform hover:-translate-y-0.5' : ''}`}
         style={{ borderColor: `${color}25` }}
         onClick={onClick}>
      <div className="absolute top-0 left-0 right-0 h-[2.5px]"
           style={{ background: `linear-gradient(90deg, ${color}, ${color}60, transparent)` }} />
      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none"
           style={{ background: `${color}14` }} />
      <div className="relative p-5">
        <p className="font-mono font-black tabular-nums leading-none"
           style={{ fontSize: 'clamp(40px, 5vw, 52px)', color }}>
          {value}
        </p>
        <p className="text-[13px] font-semibold text-text mt-1">{label}</p>
        {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
        {clickable && (
          <span className="absolute bottom-3 right-3 flex items-center gap-0.5
                           text-[9px] font-semibold uppercase tracking-wide"
                style={{ color: `${color}90` }}>
            Ver OS <ChevronRight size={10} />
          </span>
        )}
      </div>
    </div>
  )
}

// ─── CidadeTable ──────────────────────────────────────────────────────────────

export function CidadeTable({ rows: cidades, color, emptyMsg = 'Nenhuma OS no período', sourceRows, onDrillDown }: {
  rows: { cidade: string; total: number }[]; color: string; emptyMsg?: string
  sourceRows: OSRow[]; onDrillDown: (d: DrillRow) => void
}) {
  const max = cidades[0]?.total ?? 1

  if (!cidades.length) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-card px-4 py-8 text-center">
        <p className="text-[12px] text-muted">{emptyMsg}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
      <div className="divide-y divide-white/[0.04]">
        {cidades.map((c, i) => {
          const pct = Math.round((c.total / max) * 100)
          const clickable = !!(sourceRows && onDrillDown)
          return (
            <div key={c.cidade}
                 className={`flex items-center gap-3 px-4 py-3 transition-colors
                             ${clickable ? 'cursor-pointer hover:bg-surface/30' : 'hover:bg-surface/20'}`}
                 style={{ animationDelay: `${i * 30}ms` }}
                 onClick={clickable ? () => {
                   const filtered = sourceRows.filter(r =>
                     (r.nomedacidade || '(sem cidade)').trim() === c.cidade
                   )
                   onDrillDown({ title: `${c.cidade} — ${c.total} OS`, rows: filtered, color })
                 } : undefined}>
              <MapPin size={10} className="text-muted flex-shrink-0" />
              <span className="text-[12px] font-semibold text-text w-36 flex-shrink-0 truncate">
                {c.cidade}
              </span>
              <div className="flex-1 h-1.5 bg-surface/40 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                     style={{ width: `${pct}%`, background: color,
                              boxShadow: `0 0 6px ${color}60` }} />
              </div>
              <span className="font-mono font-bold text-[13px] w-8 text-right flex-shrink-0"
                    style={{ color }}>
                {c.total}
              </span>
              {clickable && <ChevronRight size={10} className="text-muted flex-shrink-0" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── EmRotaCard ───────────────────────────────────────────────────────────────
/** Lista OS em Atendimento com cidade e tempo em campo */
export function EmRotaCard({ rows, color }: { rows: OSRow[]; color: string }) {
  const max = Math.max(...rows.map(r => r._agingAbertura ?? 0), 1)

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-card px-4 py-8 text-center">
        <p className="text-[12px] text-muted">Nenhuma OS em rota agora</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_1fr_80px] gap-3 px-4 py-2 bg-surface/20
                      border-b border-white/[0.05] text-[10px] font-bold uppercase tracking-[0.05em] text-muted">
        <span>Cliente</span>
        <span>Cidade · Equipe</span>
        <span className="text-right">Aging</span>
      </div>
      <div className="divide-y divide-white/[0.04] max-h-72 overflow-y-auto">
        {rows.slice(0, 50).map(r => {
          const aging = r._agingAbertura ?? 0
          const pct   = Math.round((aging / max) * 100)
          const agClr = aging >= 6 ? '#f87171' : aging >= 3 ? '#f97316' : color
          return (
            <div key={r.numos} className="grid grid-cols-[1fr_1fr_80px] gap-3 px-4 py-2.5
                                          hover:bg-surface/20 transition-colors items-center">
              <div className="min-w-0">
                <p className="text-[11.5px] font-semibold text-text truncate">
                  {r.nomecliente || '—'}
                </p>
                <p className="text-[10px] font-mono text-muted">{r.numos}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-secondary truncate">{r.nomedacidade || '—'}</p>
                <p className="text-[10px] text-muted truncate">
                  {shortEquipe(r.nomedaequipe) || 'Sem equipe'}
                </p>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <div className="flex-1 h-1 bg-surface/40 rounded-full overflow-hidden max-w-[32px]">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: agClr }} />
                </div>
                <span className="font-mono font-bold text-[12px] flex-shrink-0" style={{ color: agClr }}>
                  {aging}d
                </span>
              </div>
            </div>
          )
        })}
        {rows.length > 50 && (
          <div className="px-4 py-2 text-center text-[11px] text-muted">
            +{rows.length - 50} registros adicionais
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ClienteSearch ───────────────────────────────────────────────────────────

export function ClienteSearch({ rows, color, onDrillDown }: { rows: OSRow[]; color: string; onDrillDown: (d: DrillRow) => void }) {
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()

  const results = useMemo(() => {
    if (!term) return []
    return rows.filter(r =>
      (r.nomecliente ?? '').toLowerCase().includes(term) ||
      (r.numos ?? '').includes(term)
    ).slice(0, 6)
  }, [rows, term])

  return (
    <div className="mt-2 space-y-1.5">
      {/* Input */}
      <div className="relative">
        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar cliente em rota…"
          className="w-full pl-7 pr-7 py-1.5 rounded-lg text-[11px] bg-surface/30
                     border border-white/[0.08] text-text placeholder:text-muted/50
                     focus:outline-none focus:border-muted/40 transition-colors"
        />
        {q && (
          <button
            onClick={() => setQ('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-secondary transition-colors">
            <X size={10} />
          </button>
        )}
      </div>

      {/* Resultados */}
      {term && (
        <div className="rounded-lg border border-white/[0.08] bg-card overflow-hidden">
          {results.length === 0 ? (
            <p className="px-3 py-2.5 text-[11px] text-muted text-center">
              Nenhum cliente em rota
            </p>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {results.map(r => {
                const aging = r._agingAbertura ?? 0
                const agClr = aging >= 6 ? '#f87171' : aging >= 3 ? '#f97316' : color
                return (
                  <div
                    key={r.numos}
                    className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-surface/30 transition-colors"
                    onClick={() => onDrillDown({ title: `${r.nomecliente} — OS ${r.numos}`, rows: [r], color })}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[11.5px] font-semibold text-text truncate leading-none">
                        {r.nomecliente || '—'}
                      </p>
                      <p className="text-[10px] text-muted mt-0.5 truncate">
                        {r.nomedacidade || '—'} · {shortEquipe(r.nomedaequipe) || 'Sem equipe'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                      <span className="font-mono text-[10px]" style={{ color }}>{r.numos}</span>
                      <span className="font-mono font-bold text-[11px]" style={{ color: agClr }}>{aging}d</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── EquipeTable ──────────────────────────────────────────────────────────────

export function EquipeTable({ equipes, sourceRows, onDrillDown }: { equipes: ({ equipe: string } & EquipeEntry)[]; sourceRows: OSRow[]; onDrillDown: (d: DrillRow) => void }) {
  const max = equipes[0]?.total ?? 1

  if (!equipes.length) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-card px-4 py-8 text-center">
        <p className="text-[12px] text-muted">Sem dados de equipes no período</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_60px_60px_60px_60px_24px] gap-2 px-4 py-2.5 bg-surface/20
                      border-b border-white/[0.05] text-[10px] font-bold uppercase tracking-[0.05em] text-muted">
        <span>Equipe</span>
        <span className="text-right">Total</span>
        <span className="text-right text-yellow">Pend.</span>
        <span className="text-right text-cyan">Atend.</span>
        <span className="text-right text-green">Concl.</span>
        <span />
      </div>
      <div className="divide-y divide-white/[0.04] max-h-96 overflow-y-auto">
        {equipes.map((e, _i) => {
          const pct = Math.round((e.total / max) * 100)
          const clickable = !!(sourceRows && onDrillDown)
          return (
            <div key={e.equipe}
                 className={`grid grid-cols-[1fr_60px_60px_60px_60px_24px] gap-2 px-4 py-3
                             transition-colors items-center
                             ${clickable ? 'cursor-pointer hover:bg-surface/30' : 'hover:bg-surface/20'}`}
                 onClick={clickable ? () => {
                   const filtered = sourceRows.filter(r =>
                     shortEquipe(r.nomedaequipe) === e.equipe
                   )
                   onDrillDown({ title: `${e.equipe} — ${e.total} OS`, rows: filtered, color: '#3b82f6' })
                 } : undefined}>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-text truncate">{e.equipe}</p>
                <div className="mt-1 h-1 bg-surface/40 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-primary/60 transition-all duration-700"
                       style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="font-mono font-bold text-[13px] text-text text-right">{e.total}</span>
              <span className="font-mono text-[12px] text-yellow text-right">{e.pendente}</span>
              <span className="font-mono text-[12px] text-cyan text-right">{e.atendimento}</span>
              <span className="font-mono text-[12px] text-green text-right">{e.concluida}</span>
              {clickable
                ? <ChevronRight size={11} className="text-muted justify-self-end" />
                : <span />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── GerencialPage ────────────────────────────────────────────────────────────
