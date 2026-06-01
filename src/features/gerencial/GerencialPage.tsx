import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import {
  Wrench, Package, Users,
  MapPin, Clock, ChevronRight,
  Briefcase, Search, X,
} from 'lucide-react'
import { useOSDerived } from '../../contexts/OSDataContext'
import { useUIStore }    from '../../store/uiStore'
import { shortEquipe, situacaoVariant }  from '../../lib/osFormat'
import { isCOPE, isReagend, isExecucaoReal } from '../../lib/transform'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import type { OSRow } from '../../lib/types'

type DrillRow = { title: string; rows: OSRow[]; color: string }
type IconComp = ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Categorias de negócio (usam _categoria — calculado em enrichRows)
const isInst    = (r: OSRow) => r._categoria === 'INSTALACAO'
const isVTManut = (r: OSRow) => r._categoria === 'VT_MANUTENCAO'
const isServico = (r: OSRow) => r._categoria === 'SERVICO'
const isAtend   = (r: OSRow) => r.descsituacao === 'Atendimento'
const isAtivo   = (r: OSRow) => ['Pendente','Atendimento'].includes(r.descsituacao)
const skip      = (r: OSRow) => isCOPE(r) || isReagend(r)

// Converte "DD/MM/YYYY ..." para Date (sem depender de transform)
function _parseBR(s: string | null | undefined): Date | null {
  if (!s) return null
  const p = s.split(' ')[0].split('/')
  if (p.length < 3) return null
  const dt = new Date(+p[2], +p[1] - 1, +p[0])
  return isNaN(dt.getTime()) ? null : dt
}

// Verifica se a data de execução/baixa da OS está dentro do período do filtro.
// Usa datacadastro como fallback para OS concluídas sem data de execução registrada.
function _isExecNoPeriodo(r: OSRow, from: Date | null | undefined, to: Date | null | undefined): boolean {
  const dt = _parseBR(r.dataexecucao || r.databaixa || r.datacadastro)
  if (!dt) return false
  if (from && dt < from) return false
  if (to) {
    const toEnd = new Date(to); toEnd.setHours(23, 59, 59, 999)
    if (dt > toEnd) return false
  }
  return true
}

/** Agrupa rows por cidade, retorna array ordenado pelo maior volume. */
function byCidade(rows: OSRow[]): { cidade: string; total: number }[] {
  const map: Record<string, number> = {}
  for (const r of rows) {
    const c = (r.nomedacidade || '(sem cidade)').trim()
    map[c] = (map[c] ?? 0) + 1
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([cidade, total]) => ({ cidade, total }))
}

/** Agrupa rows por equipe, retorna array ordenado pelo maior volume total. */
type EquipeEntry = { pendente: number; atendimento: number; concluida: number; total: number }
function byEquipe(rows: OSRow[]): ({ equipe: string } & EquipeEntry)[] {
  const map: Record<string, EquipeEntry> = {}
  for (const r of rows) {
    if (!r.nomedaequipe?.trim()) continue
    const eq = shortEquipe(r.nomedaequipe)
    if (!map[eq]) map[eq] = { pendente: 0, atendimento: 0, concluida: 0, total: 0 }
    const e = map[eq]
    e.total++
    if (r.descsituacao === 'Pendente')       e.pendente++
    else if (r.descsituacao === 'Atendimento') e.atendimento++
    else if (isExecucaoReal(r.descsituacao)) e.concluida++
  }
  return Object.entries(map)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([equipe, d]) => ({ equipe, ...d }))
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

function SectionLabel({ icon: Icon, color, children }: { icon: IconComp; color: string; children: ReactNode }) {
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

function OSListModal({ open, onClose, title, rows = [] as OSRow[], color = '#3b82f6' }: {
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

function HeroCount({ value, label, sub, color, onClick }: {
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

function CidadeTable({ rows: cidades, color, emptyMsg = 'Nenhuma OS no período', sourceRows, onDrillDown }: {
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
function EmRotaCard({ rows, color }: { rows: OSRow[]; color: string }) {
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

function ClienteSearch({ rows, color, onDrillDown }: { rows: OSRow[]; color: string; onDrillDown: (d: DrillRow) => void }) {
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

function EquipeTable({ equipes, sourceRows, onDrillDown }: { equipes: ({ equipe: string } & EquipeEntry)[]; sourceRows: OSRow[]; onDrillDown: (d: DrillRow) => void }) {
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

export default function GerencialPage() {
  const { rows, allRows, isLoading } = useOSDerived()
  const { dateFilter }               = useUIStore()
  const [drillDown, setDrillDown]    = useState<DrillRow | null>(null)

  const { from, to } = dateFilter ?? {}

  const openDrill = (d: DrillRow) => setDrillDown(d)

  // ─── Base de OS sem COPE/Reagend ────────────────────────────────────────
  const allBase = useMemo(() => allRows.filter(r => !skip(r)), [allRows])

  // ─── Concluídas no período: filtradas por data de EXECUÇÃO ──────────────
  // Usa allRows (não allBase) para incluir instalações concluídas pela COPE.
  // Reagendamento excluído para evitar dupla contagem; COPE incluído intencionalmente.
  const concluidas = useMemo(
    () => allRows.filter(r => !isReagend(r) && isExecucaoReal(r.descsituacao) && _isExecNoPeriodo(r, from, to)),
    [allRows, from, to]
  )

  // ─── Ativas: snapshot atual (sem filtro de data) ─────────────────────────
  const ativas = useMemo(() => allBase.filter(isAtivo), [allBase])

  // ─── Instalação ──────────────────────────────────────────────────────────
  const instConclRows = useMemo(() => concluidas.filter(isInst), [concluidas])
  const instAtivos    = useMemo(() => ativas.filter(isInst),     [ativas])
  const instRows      = useMemo(() => [...instConclRows, ...instAtivos], [instConclRows, instAtivos])
  const instCidades        = useMemo(() => byCidade(instConclRows), [instConclRows])
  const instAtivosCidades  = useMemo(() => byCidade(instAtivos),    [instAtivos])

  // ─── VT / Manutenção (VT é sinônimo de Manutenção) ───────────────────────
  const vtManutConclRows    = useMemo(() => concluidas.filter(isVTManut), [concluidas])
  const vtManutAtivos       = useMemo(() => ativas.filter(isVTManut),     [ativas])
  const vtManutRows         = useMemo(() => [...vtManutConclRows, ...vtManutAtivos], [vtManutConclRows, vtManutAtivos])
  const vtManutCidades      = useMemo(() => byCidade(vtManutConclRows),   [vtManutConclRows])
  const vtManutAtivosCidades = useMemo(() => byCidade(vtManutAtivos),     [vtManutAtivos])

  // ─── Serviço ─────────────────────────────────────────────────────────────
  const servConclRows      = useMemo(() => concluidas.filter(isServico), [concluidas])
  const servAtivos         = useMemo(() => ativas.filter(isServico),     [ativas])
  const servRows           = useMemo(() => [...servConclRows, ...servAtivos], [servConclRows, servAtivos])
  const servCidades        = useMemo(() => byCidade(servConclRows),      [servConclRows])
  const servAtivosCidades  = useMemo(() => byCidade(servAtivos),         [servAtivos])

  // ─── Em Rota — snapshot atual pelas 3 categorias de negócio ──────────────
  const rotaInst   = useMemo(
    () => allBase.filter(r => isInst(r) && isAtend(r))
              .sort((a, b) => (b._agingAbertura ?? 0) - (a._agingAbertura ?? 0)),
    [allBase]
  )
  const rotaVTManut = useMemo(
    () => allBase.filter(r => isVTManut(r) && isAtend(r))
              .sort((a, b) => (b._agingAbertura ?? 0) - (a._agingAbertura ?? 0)),
    [allBase]
  )
  const rotaServ   = useMemo(
    () => allBase.filter(r => isServico(r) && isAtend(r))
              .sort((a, b) => (b._agingAbertura ?? 0) - (a._agingAbertura ?? 0)),
    [allBase]
  )
  const rotaInstCidades    = useMemo(() => byCidade(rotaInst),    [rotaInst])
  const rotaVTManutCidades = useMemo(() => byCidade(rotaVTManut), [rotaVTManut])
  const rotaServCidades    = useMemo(() => byCidade(rotaServ),    [rotaServ])

  // ─── Volume por Equipe e KPIs — baseados nas concluídas do período ────────
  const baseRows      = useMemo(() => rows.filter(r => !skip(r)), [rows])
  const equipes       = useMemo(() => byEquipe(baseRows), [baseRows])
  const kpiPendentes  = useMemo(() => allBase.filter(r => r.descsituacao === 'Pendente'), [allBase])
  const kpiAtendendo  = useMemo(() => allBase.filter(isAtend), [allBase])
  const kpiConcluidas = useMemo(() => concluidas, [concluidas])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-secondary text-sm">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        Carregando…
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-[1600px]">

      {/* Modal de drill-down */}
      <OSListModal
        open={!!drillDown}
        onClose={() => setDrillDown(null)}
        title={drillDown?.title ?? ''}
        rows={drillDown?.rows ?? []}
        color={drillDown?.color ?? '#3b82f6'}
      />

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-[20px] font-headline font-bold text-text">Visão Gerencial</h1>
          <span className="flex items-center gap-1.5 text-[10px] text-muted">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green" />
            </span>
            Ao vivo
          </span>
        </div>
        <p className="text-[12px] text-muted">
          Concluídas filtradas por <strong className="text-secondary">data de execução</strong> · Em Rota = snapshot ao vivo
        </p>
      </div>

      {/* ── 1. Instalação ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionLabel icon={Package} color="#3b82f6">
          Instalações — executadas no período
        </SectionLabel>

        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-3">
          <div className="space-y-3">
            <HeroCount
              value={instRows.length}
              label="Total de Instalações"
              sub={`${instAtivos.length} em aberto · ${instConclRows.length} concluídas`}
              color="#3b82f6"
              onClick={() => openDrill({ title: `Instalações — ${instRows.length} ordens`, rows: instRows, color: '#3b82f6' })}
            />
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Em aberto',  drillRows: instAtivos,    color: '#facc15' },
                { label: 'Concluídas', drillRows: instConclRows, color: '#4ade80' },
              ].map(s => (
                <div key={s.label}
                     className="rounded-xl border border-white/[0.08] bg-card px-3 py-3
                                cursor-pointer hover:bg-surface/30 transition-colors"
                     onClick={() => openDrill({ title: `Instalações ${s.label} — ${s.drillRows.length} ordens`, rows: s.drillRows, color: s.color })}>
                  <p className="font-mono font-bold text-[24px] leading-none"
                     style={{ color: s.color }}>{s.drillRows.length}</p>
                  <p className="text-[10px] text-muted mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2 flex items-center gap-1.5">
                <MapPin size={10} /> Em aberto por cidade
              </p>
              <CidadeTable
                rows={instAtivosCidades} color="#facc15" emptyMsg="Nenhuma instalação em aberto"
                sourceRows={instAtivos}
                onDrillDown={openDrill}
              />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2 flex items-center gap-1.5">
                <MapPin size={10} /> Concluídas por cidade
              </p>
              <CidadeTable
                rows={instCidades} color="#3b82f6" emptyMsg="Nenhuma instalação no período"
                sourceRows={instConclRows}
                onDrillDown={openDrill}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. VT / Manutenção ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionLabel icon={Wrench} color="#f97316">
          VT / Manutenção — executadas no período
        </SectionLabel>
        <p className="text-[11px] text-muted -mt-2">
          Inclui Visitas Técnicas (VT 24h, VT 48h, VT 8h) e Manutenções corretivas
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-3">
          <div className="space-y-3">
            <HeroCount
              value={vtManutRows.length}
              label="Total VT / Manutenção"
              sub={`${vtManutAtivos.length} em aberto · ${vtManutConclRows.length} concluídas`}
              color="#f97316"
              onClick={() => openDrill({ title: `VT / Manutenção — ${vtManutRows.length} ordens`, rows: vtManutRows, color: '#f97316' })}
            />
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Em aberto',  drillRows: vtManutAtivos,    color: '#facc15' },
                { label: 'Concluídas', drillRows: vtManutConclRows, color: '#4ade80' },
              ].map(s => (
                <div key={s.label}
                     className="rounded-xl border border-white/[0.08] bg-card px-3 py-3
                                cursor-pointer hover:bg-surface/30 transition-colors"
                     onClick={() => openDrill({ title: `VT/Manutenção ${s.label} — ${s.drillRows.length} ordens`, rows: s.drillRows, color: s.color })}>
                  <p className="font-mono font-bold text-[24px] leading-none"
                     style={{ color: s.color }}>{s.drillRows.length}</p>
                  <p className="text-[10px] text-muted mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2 flex items-center gap-1.5">
                <MapPin size={10} /> Em aberto por cidade
              </p>
              <CidadeTable
                rows={vtManutAtivosCidades} color="#facc15" emptyMsg="Nenhuma VT/Manutenção em aberto"
                sourceRows={vtManutAtivos}
                onDrillDown={openDrill}
              />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2 flex items-center gap-1.5">
                <MapPin size={10} /> Concluídas por cidade
              </p>
              <CidadeTable
                rows={vtManutCidades} color="#f97316" emptyMsg="Nenhuma VT/Manutenção no período"
                sourceRows={vtManutConclRows}
                onDrillDown={openDrill}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Serviço ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionLabel icon={Briefcase} color="#c4b5fd">
          Serviço — executados no período
        </SectionLabel>
        <p className="text-[11px] text-muted -mt-2">
          OS que não são Instalação nem VT/Manutenção (ex: mudança de plano, remanejamento, etc.)
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-3">
          <div className="space-y-3">
            <HeroCount
              value={servRows.length}
              label="Total de Serviços"
              sub={`${servAtivos.length} em aberto · ${servConclRows.length} concluídos`}
              color="#c4b5fd"
              onClick={() => openDrill({ title: `Serviços — ${servRows.length} ordens`, rows: servRows, color: '#c4b5fd' })}
            />
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Em aberto',  drillRows: servAtivos,    color: '#facc15' },
                { label: 'Concluídos', drillRows: servConclRows, color: '#4ade80' },
              ].map(s => (
                <div key={s.label}
                     className="rounded-xl border border-white/[0.08] bg-card px-3 py-3
                                cursor-pointer hover:bg-surface/30 transition-colors"
                     onClick={() => openDrill({ title: `Serviços ${s.label} — ${s.drillRows.length} ordens`, rows: s.drillRows, color: s.color })}>
                  <p className="font-mono font-bold text-[24px] leading-none"
                     style={{ color: s.color }}>{s.drillRows.length}</p>
                  <p className="text-[10px] text-muted mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2 flex items-center gap-1.5">
                <MapPin size={10} /> Em aberto por cidade
              </p>
              <CidadeTable
                rows={servAtivosCidades} color="#facc15" emptyMsg="Nenhum serviço em aberto"
                sourceRows={servAtivos}
                onDrillDown={openDrill}
              />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-2 flex items-center gap-1.5">
                <MapPin size={10} /> Concluídos por cidade
              </p>
              <CidadeTable
                rows={servCidades} color="#c4b5fd" emptyMsg="Nenhum serviço no período"
                sourceRows={servConclRows}
                onDrillDown={openDrill}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Em Rota — snapshot atual ────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionLabel icon={Clock} color="#4ade80">
          Em Rota agora — snapshot operacional (sem filtro de data)
        </SectionLabel>

        {/* Instalação em rota */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-[3px] h-3.5 rounded-full" style={{ background: '#3b82f6' }} />
              <Package size={11} style={{ color: '#3b82f6' }} />
              <span className="text-[11px] font-bold uppercase tracking-[0.06em]"
                    style={{ color: '#3b82f6' }}>
                Instalação em rota
              </span>
            </div>
            <button
              className="flex items-center gap-1.5 font-mono font-black text-[22px] leading-none
                         hover:opacity-80 transition-opacity"
              style={{ color: '#3b82f6' }}
              onClick={() => openDrill({ title: `Instalação em Rota — ${rotaInst.length} ordens`, rows: rotaInst, color: '#3b82f6' })}
              title="Ver todas as OS">
              {rotaInst.length}
              <ChevronRight size={14} className="mt-0.5 opacity-60" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div>
              <p className="text-[10px] text-muted mb-1.5 flex items-center gap-1">
                <MapPin size={9} /> Por cidade
              </p>
              <CidadeTable rows={rotaInstCidades} color="#3b82f6"
                           emptyMsg="Nenhuma instalação em rota"
                           sourceRows={rotaInst}
                           onDrillDown={openDrill} />
              <ClienteSearch rows={rotaInst} color="#3b82f6" onDrillDown={openDrill} />
            </div>
            <div className="lg:col-span-3">
              <p className="text-[10px] text-muted mb-1.5 flex items-center gap-1">
                <Clock size={9} /> Detalhe · aging
              </p>
              <EmRotaCard rows={rotaInst} color="#3b82f6" />
            </div>
          </div>
        </div>

        {/* VT / Manutenção em rota */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-[3px] h-3.5 rounded-full" style={{ background: '#f97316' }} />
              <Wrench size={11} style={{ color: '#f97316' }} />
              <span className="text-[11px] font-bold uppercase tracking-[0.06em]"
                    style={{ color: '#f97316' }}>
                VT / Manutenção em rota
              </span>
            </div>
            <button
              className="flex items-center gap-1.5 font-mono font-black text-[22px] leading-none
                         hover:opacity-80 transition-opacity"
              style={{ color: '#f97316' }}
              onClick={() => openDrill({ title: `VT/Manutenção em Rota — ${rotaVTManut.length} ordens`, rows: rotaVTManut, color: '#f97316' })}
              title="Ver todas as OS">
              {rotaVTManut.length}
              <ChevronRight size={14} className="mt-0.5 opacity-60" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div>
              <p className="text-[10px] text-muted mb-1.5 flex items-center gap-1">
                <MapPin size={9} /> Por cidade
              </p>
              <CidadeTable rows={rotaVTManutCidades} color="#f97316"
                           emptyMsg="Nenhuma VT/Manutenção em rota"
                           sourceRows={rotaVTManut}
                           onDrillDown={openDrill} />
              <ClienteSearch rows={rotaVTManut} color="#f97316" onDrillDown={openDrill} />
            </div>
            <div className="lg:col-span-3">
              <p className="text-[10px] text-muted mb-1.5 flex items-center gap-1">
                <Clock size={9} /> Detalhe · aging
              </p>
              <EmRotaCard rows={rotaVTManut} color="#f97316" />
            </div>
          </div>
        </div>

        {/* Serviço em rota */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-[3px] h-3.5 rounded-full" style={{ background: '#c4b5fd' }} />

              <Briefcase size={11} style={{ color: '#c4b5fd' }} />
              <span className="text-[11px] font-bold uppercase tracking-[0.06em]"
                    style={{ color: '#c4b5fd' }}>
                Serviço em rota
              </span>
            </div>
            <button
              className="flex items-center gap-1.5 font-mono font-black text-[22px] leading-none
                         hover:opacity-80 transition-opacity"
              style={{ color: '#c4b5fd' }}
              onClick={() => openDrill({ title: `Serviço em Rota — ${rotaServ.length} ordens`, rows: rotaServ, color: '#c4b5fd' })}
              title="Ver todas as OS">
              {rotaServ.length}
              <ChevronRight size={14} className="mt-0.5 opacity-60" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div>
              <p className="text-[10px] text-muted mb-1.5 flex items-center gap-1">
                <MapPin size={9} /> Por cidade
              </p>
              <CidadeTable rows={rotaServCidades} color="#c4b5fd"
                           emptyMsg="Nenhum serviço em rota"
                           sourceRows={rotaServ}
                           onDrillDown={openDrill} />
              <ClienteSearch rows={rotaServ} color="#c4b5fd" onDrillDown={openDrill} />
            </div>
            <div className="lg:col-span-3">
              <p className="text-[10px] text-muted mb-1.5 flex items-center gap-1">
                <Clock size={9} /> Detalhe · aging
              </p>
              <EmRotaCard rows={rotaServ} color="#c4b5fd" />
            </div>
          </div>
        </div>

      </section>

      {/* ── 5. Volume Total por Equipe ─────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionLabel icon={Users} color="#4ade80">
            Volume Total por Equipe
          </SectionLabel>
          <span className="text-[11px] text-muted">{equipes.length} equipes · concluídas por data de execução</span>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Concluídas no período', drillRows: kpiConcluidas, color: '#4ade80' },
            { label: 'Pendentes agora',        drillRows: kpiPendentes,  color: '#facc15' },
            { label: 'Em Atendimento agora',   drillRows: kpiAtendendo,  color: '#22d3ee' },
            { label: 'Total OS período',       drillRows: baseRows,      color: '#3b82f6' },
          ].map(s => (
            <div key={s.label}
                 className="relative overflow-hidden rounded-xl border bg-card px-4 py-3 animate-card-enter
                            cursor-pointer hover:bg-surface/20 transition-colors"
                 style={{ borderColor: `${s.color}20` }}
                 onClick={() => openDrill({ title: `${s.label} — ${s.drillRows.length} ordens`, rows: s.drillRows, color: s.color })}>
              <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: s.color }} />
              <p className="font-mono font-black tabular-nums text-[28px] leading-none"
                 style={{ color: s.color }}>{s.drillRows.length}</p>
              <p className="text-[11px] text-muted mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <EquipeTable
          equipes={equipes}
          sourceRows={baseRows}
          onDrillDown={openDrill}
        />
      </section>

    </div>
  )
}
