import { useState, useMemo, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import {
  AlertCircle, CheckCircle2, Zap, TrendingUp, TrendingDown, Minus,
  MapPin, Clock, BarChart3, Package, Wrench, Radio, Target, Calendar,
  ChevronDown, ChevronUp, Activity, Users, RotateCcw, ArrowDownRight, ArrowUpRight, Gauge,
} from 'lucide-react'
import type { AINarrativeResult } from '../../hooks/useAINarrative'
import { Badge } from '../../components/ui/Badge'
import { shortEquipe, situacaoVariant } from '../../lib/osFormat'
import { isCOPE, isReagend, getReagendTipo } from '../../lib/transform'
import type {
  OSRow, KPI, Pulso, ClusterAtivo, AccentColor, CampoSemaforo, PulsoMetaMes, PulsoRitmoIntradiario,
} from '../../lib/types'
export { PulsoHero } from './PulsoHero'
export type { AnomaliaContextType } from './PulsoHero'
export { AnomaliaSection } from './AnomaliaSection'

export interface ModalState        { title: string; rows: OSRow[]; foco?: string }
// KPIs de risco que têm filtro correspondente na OrdensPage (deep-link "Abrir na fila")
export const FOCO_NAVEGAVEL = new Set(['criticas', 'semEq', 'pend', 'atend', 'reagendInviab', 'reagendMobile', 'reagendFutura'])
export type { AINarrativeResult }
export type IconComp = ComponentType<{ size?: number; className?: string; style?: CSSProperties }>

export interface CatCfgItem {
  cat:   string
  label: string
  icon:  IconComp | null
  color: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isRede  = (r: OSRow): boolean => r._tipo === 'REDE'
const isAtivo = (r: OSRow): boolean => ['Pendente','Atendimento'].includes(r.descsituacao)

export const KPI_FILTERS: Record<string, (r: OSRow) => boolean> = {
  total:    r => !isCOPE(r) && !isReagend(r) && isAtivo(r) && !isRede(r),
  rede:     r => !isCOPE(r) && !isReagend(r) && isAtivo(r) &&  isRede(r),
  concl:    r => !isCOPE(r) && !isReagend(r) && r.descsituacao === 'Concluída',
  pend:     r => !isCOPE(r) && !isReagend(r) && r.descsituacao === 'Pendente'    && !isRede(r),
  atend:    r => !isCOPE(r) && !isReagend(r) && r.descsituacao === 'Atendimento' && !isRede(r),
  criticas: r => !isCOPE(r) && !isReagend(r) && r._slaCritico  && !isRede(r),
  semEq:    r => !isCOPE(r) && !isReagend(r) && !r.nomedaequipe?.trim() && isAtivo(r) && !isRede(r),
  reagendInviab: r => isReagend(r) && isAtivo(r) && getReagendTipo(r) === 'inviabilidade',
  reagendMobile: r => isReagend(r) && isAtivo(r) && getReagendTipo(r) === 'mobile',
  reagendFutura: r => isReagend(r) && isAtivo(r) && getReagendTipo(r) === 'futura',
}
export const ALLROWS_KPIS = new Set(['total','rede','pend','atend','criticas','semEq','reagendInviab','reagendMobile','reagendFutura'])

type AccentConfig = { solid: string; glow: string; bg: string }
export const ACCENT_COLORS: Record<AccentColor, AccentConfig> = {
  red:     { solid: '#f87171', glow: 'rgba(248,113,113,0.18)', bg: 'rgba(248,113,113,0.10)' },
  orange:  { solid: '#fb923c', glow: 'rgba(251,146,60,0.18)',  bg: 'rgba(251,146,60,0.10)'  },
  yellow:  { solid: '#facc15', glow: 'rgba(250,204,21,0.16)',  bg: 'rgba(250,204,21,0.10)'  },
  cyan:    { solid: '#22d3ee', glow: 'rgba(34,211,238,0.18)',  bg: 'rgba(34,211,238,0.10)'  },
  primary: { solid: '#3b82f6', glow: 'rgba(59,130,246,0.18)',  bg: 'rgba(59,130,246,0.10)'  },
  purple:  { solid: '#c4b5fd', glow: 'rgba(196,181,253,0.16)', bg: 'rgba(196,181,253,0.10)' },
  green:   { solid: '#4ade80', glow: 'rgba(74,222,128,0.18)',  bg: 'rgba(74,222,128,0.10)'  },
}

export const KPI_ICONS: Partial<Record<string, IconComp>> = {
  criticas: AlertCircle, semEq: Users, pend: Clock, atend: Activity,
  reagendInviab: RotateCcw, reagendMobile: RotateCcw, reagendFutura: RotateCcw,
  total: BarChart3, rede: Radio, concl: CheckCircle2, taxa: Target,
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

export interface DashFornCard { nome: string; total: number; concluidas: number; sla: number; cor: string }
export interface ScoreTendencia { atual: number; anterior: number | null; delta: number | null }
export interface DashMover { id: string; label: string; atual: number; anterior: number; delta: number; unidade: string; melhorou: boolean; impacto: number }
export interface ProjecaoRisco { proj24h: number; proj48h: number; amostra: OSRow[] }
export interface TypedDashboard {
  kpis: KPI[]; fornecedores: DashFornCard[]; pulso: Pulso
  scoreTendencia: ScoreTendencia; mudancas: DashMover[]; metaScore: number; projecaoRisco: ProjecaoRisco
}

// Painel preditivo: OS que vão estourar o SLA nas próximas 24-48h (clicável → drill-down)
export function ProjecaoRiscoPanel({ proj, criticasAgora, onOpen }: {
  proj: ProjecaoRisco; criticasAgora: number; onOpen: (rows: OSRow[]) => void
}) {
  if (proj.proj24h === 0 && proj.proj48h === 0) return null
  const totalProj = proj.proj24h + proj.proj48h
  return (
    <button
      onClick={() => onOpen(proj.amostra)}
      className="w-full flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-card border border-orange/20
                 px-4 py-2.5 text-left hover:border-orange/40 hover:bg-orange/[0.04] transition-colors duration-fast"
    >
      <div className="flex items-center gap-2">
        <TrendingUp size={14} className="text-orange" />
        <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Projeção de risco</span>
      </div>
      <span className="text-[12px] text-secondary">
        <span className="font-semibold text-text tabular-nums">{criticasAgora}</span> críticas agora
        {' · '}<span className="font-semibold text-orange tabular-nums">+{proj.proj24h}</span> em ≤24h
        {' · '}<span className="font-semibold text-yellow tabular-nums">+{proj.proj48h}</span> em ≤48h
      </span>
      <span className="sm:ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-orange">
        {totalProj} em risco — ver OS <ArrowUpRight size={12} />
      </span>
    </button>
  )
}

// Faixa de trajetória: Δ do score do período + os fatores que mais mexeram nele
export function MudancasStrip({ tendencia, mudancas }: { tendencia: ScoreTendencia; mudancas: DashMover[] }) {
  if (tendencia.delta == null || mudancas.length === 0) return null
  const up   = tendencia.delta > 0
  const flat = tendencia.delta === 0
  const cor  = flat ? '#94a3b8' : up ? '#4ade80' : '#f87171'
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-card border border-white/[0.08] px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Tendência</span>
        <span className="text-[12px] font-semibold tabular-nums" style={{ color: cor }}>
          {flat ? '— estável' : `${up ? '↑' : '↓'} ${up ? '+' : ''}${tendencia.delta} pts`}
        </span>
        <span className="text-[10px] text-muted">vs período anterior · score do período {tendencia.atual}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <span className="text-[10px] text-muted">O que mudou:</span>
        {mudancas.map(m => (
          <span key={m.id}
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border tabular-nums
                        ${m.melhorou ? 'text-green bg-green/10 border-green/20' : 'text-red bg-red/10 border-red/20'}`}
            title={`${m.label}: ${m.anterior}${m.unidade} → ${m.atual}${m.unidade}`}>
            {m.melhorou ? '↑' : '↓'} {m.label} {m.atual}{m.unidade}
          </span>
        ))}
      </div>
    </div>
  )
}


export function SectionLabel({ icon: Icon, color, children }: {
  icon: IconComp; color: string; children: ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ background: color }} />
      <Icon size={12} style={{ color }} className="flex-shrink-0" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color }}>
        {children}
      </span>
    </div>
  )
}

// ─── BentoKPICard ─────────────────────────────────────────────────────────────

export function BentoKPICard({ kpi, icon: Icon, delay = 0, onClick, scope }: {
  kpi: KPI; icon: IconComp | undefined; delay?: number; onClick?: () => void
  scope?: 'aovivo' | 'periodo'
}) {
  const { title, value, sub, accent, trend } = kpi
  const ac = ACCENT_COLORS[accent] ?? ACCENT_COLORS.primary

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={e => e.key === 'Enter' && onClick?.()}
      style={{ animationDelay: `${delay}ms`, borderColor: `${ac.solid}22` }}
      className="relative overflow-hidden rounded-xl border bg-card
                 animate-card-enter cursor-pointer group
                 transition-colors duration-150
                 hover:shadow-md"
    >
      {/* Accent top bar */}
      <div className="absolute top-0 left-0 right-0 h-[2.5px] transition-opacity duration-200"
           style={{ background: `linear-gradient(90deg, ${ac.solid}, ${ac.solid}80)` }} />

      {/* Background glow on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
           style={{ background: `radial-gradient(ellipse at top right, ${ac.solid}0d, transparent 65%)` }} />

      <div className="relative p-4">
        {/* Icon + Trend row */}
        <div className="flex items-start justify-between mb-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{ background: ac.bg }}>
            {Icon && <Icon size={15} style={{ color: ac.solid }} />}
          </div>
          {trend && <TrendPill trend={trend} />}
        </div>

        {/* Value */}
        <p className="number-display tabular-nums leading-none mb-1.5 transition-colors duration-150"
           style={{
             fontSize: String(value).length > 4 ? '32px' : '40px',
             color: ac.solid,
           }}>
          {value}
        </p>

        {/* Title */}
        <p className="text-[12px] font-semibold text-text mb-0.5">{title}</p>

        {/* Sub */}
        <p className="text-[11px] text-muted leading-snug">{sub}</p>

        {/* Escopo: ao vivo (ignora filtro de data) vs no período selecionado */}
        {scope && (
          <p className="flex items-center gap-1 text-[8.5px] uppercase tracking-wide text-muted/45 mt-1.5">
            {scope === 'aovivo'
              ? <><span className="w-1 h-1 rounded-full bg-green animate-pulse flex-shrink-0" /> Ao vivo</>
              : <><Calendar size={8} className="flex-shrink-0" /> No período</>}
          </p>
        )}
      </div>

      {/* Bottom indicator when clickable */}
      {onClick && (
        <div className="absolute bottom-0 left-4 right-4 h-px opacity-0 group-hover:opacity-100 transition-opacity"
             style={{ background: `linear-gradient(90deg, transparent, ${ac.solid}50, transparent)` }} />
      )}
    </div>
  )
}

export function TrendPill({ trend }: { trend: KPI['trend'] }) {
  const { delta, pct, higherIsBetter } = trend ?? {}
  if (delta == null) return null
  const positive = (delta > 0) === (higherIsBetter !== false)
  const color    = positive ? '#4ade80' : '#f87171'
  const Icon     = delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold flex-shrink-0"
         style={{ background: `${color}12`, borderColor: `${color}30`, color }}>
      <Icon size={9} />
      {pct != null ? `${pct}%` : (delta > 0 ? `+${delta}` : delta)}
    </div>
  )
}

// ─── ExecutadasHeroBlock ──────────────────────────────────────────────────────

// Categorias de negócio do provedor — usa _categoria (calculado em enrichRows)
const CAT_CFG: CatCfgItem[] = [
  { cat: 'INSTALACAO',    label: 'Instalação',      icon: Package, color: '#3b82f6' },
  { cat: 'VT_MANUTENCAO', label: 'VT / Manutenção', icon: Wrench,  color: '#fb923c' },
  { cat: 'SERVICO',       label: 'Serviço',          icon: null,    color: '#c4b5fd' },
  { cat: 'REDE',          label: 'Rede',             icon: Radio,   color: '#71717a' },
]

// Espelha o objeto `projecao` retornado por buildCampo (campo.ts) — não é
// per-equipe, é a projeção agregada da fila. types.ts ainda não foi atualizado
// para esse shape (ver memória "Melhorias pendentes"), então tipamos localmente.
export interface CampoProjecaoReal {
  conclHoje:     number
  dayFraction:   number
  mediaBaseline: number
  projecaoFinal: number | null
  status:        'acima' | 'abaixo' | 'neutro'
  label:         string
}

export interface FluxoHoje {
  entradas: number
  saidas:   number
  saldo:    number
  mediaEntrada?: number
}

function RitmoIndicator({ p }: { p: CampoProjecaoReal }) {
  const cor  = p.status === 'acima' ? '#4ade80' : p.status === 'abaixo' ? '#facc15' : '#94a3b8'
  const Icon = p.status === 'acima' ? TrendingUp : p.status === 'abaixo' ? TrendingDown : Gauge
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <Icon size={11} style={{ color: cor }} />
      <span className="font-semibold" style={{ color: cor }}>
        {p.status === 'acima' ? 'No ritmo' : p.status === 'abaixo' ? 'Abaixo do ritmo' : 'Início do dia'}
      </span>
      <span className="text-muted">· {p.label}</span>
    </div>
  )
}

function FluxoIndicator({ f }: { f: FluxoHoje }) {
  const crescendo = f.saldo > 0
  const cor  = crescendo ? '#fb923c' : f.saldo < 0 ? '#4ade80' : '#94a3b8'
  const Icon = crescendo ? ArrowUpRight : f.saldo < 0 ? ArrowDownRight : Minus
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <Icon size={11} style={{ color: cor }} />
      <span className="font-semibold" style={{ color: cor }}>
        Fila {crescendo ? `+${f.saldo}` : f.saldo} hoje
      </span>
      <span className="text-muted">· {f.entradas} entraram · {f.saidas} saíram</span>
      {f.mediaEntrada != null && f.mediaEntrada > 0 && (() => {
        const acima = f.entradas > f.mediaEntrada
        const igual = f.entradas === f.mediaEntrada
        return (
          <span className={`flex items-center gap-0.5 font-semibold ${igual ? 'text-muted' : acima ? 'text-orange' : 'text-green'}`}
                title={`Entradas hoje vs média diária do período (${f.mediaEntrada}/dia)`}>
            {igual ? <Minus size={10} /> : acima ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
            média {f.mediaEntrada}/d
          </span>
        )
      })()}
    </div>
  )
}

function RitmoIntradiarioBar({ r }: { r: PulsoRitmoIntradiario }) {
  const tot = r.manha + r.tarde
  if (tot === 0) return null
  const pctManha = Math.round((r.manha / tot) * 100)
  const pctTarde = 100 - pctManha
  return (
    <div className="mt-4 pt-3 border-t border-white/[0.05]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted">Ritmo por turno hoje</span>
        {r.alerta && (
          <span className="text-[10px] font-semibold text-yellow flex items-center gap-1">
            <AlertCircle size={9} /> Queda no turno da tarde
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 mb-1.5">
        <span className="flex items-center gap-1.5 text-[11px]">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#f59e0b' }} />
          <span className="text-muted">Manhã</span>
          <span className="font-mono font-bold text-text">{r.manha}</span>
        </span>
        <span className="flex items-center gap-1.5 text-[11px]">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#818cf8' }} />
          <span className="text-muted">Tarde</span>
          <span className={`font-mono font-bold ${r.alerta ? 'text-yellow' : 'text-text'}`}>
            {r.tardeIniciada ? r.tarde : '—'}
          </span>
        </span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-surface/30">
        <div className="h-full" style={{ width: `${pctManha}%`, background: '#f59e0b' }} />
        <div className="h-full" style={{ width: `${pctTarde}%`, background: '#818cf8' }} />
      </div>
    </div>
  )
}

export function ExecutadasHeroBlock({ rows, projecao, fluxo, ritmoIntradiario, onOpenModal }: {
  rows: OSRow[]
  projecao?: CampoProjecaoReal | null
  fluxo?:    FluxoHoje | null
  ritmoIntradiario?: PulsoRitmoIntradiario | null
  onOpenModal: (title: string, rows: OSRow[]) => void
}) {
  const hojeRows = useMemo(() => rows.filter(r => r._executadaHoje), [rows])
  const total    = hojeRows.length

  const grupos = useMemo(() => {
    const map: Record<string, OSRow[]> = {}
    for (const cfg of CAT_CFG) map[cfg.cat] = []
    for (const r of hojeRows) {
      const cat = r._categoria || 'SERVICO'
      if (map[cat]) map[cat].push(r)
      else map['SERVICO'].push(r)
    }
    return CAT_CFG.map(cfg => ({ ...cfg, rows: map[cfg.cat] })).filter(g => g.rows.length > 0)
  }, [hojeRows])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-green/20 bg-card">
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-[2px]"
           style={{ background: 'linear-gradient(90deg, transparent, #4ade80, transparent)' }} />
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-64 h-32 blur-3xl pointer-events-none"
           style={{ background: 'rgba(74,222,128,0.07)' }} />

      <div className="relative p-5">
        <div className="flex items-start justify-between mb-3">
          <SectionLabel icon={CheckCircle2} color="#4ade80">Executadas Hoje</SectionLabel>
          {total > 0 && (
            <button
              onClick={() => onOpenModal('Executadas Hoje', hojeRows)}
              className="text-[11px] text-muted hover:text-green border border-white/[0.08]
                         hover:border-green/30 rounded-lg px-2.5 py-1 transition-all duration-fast"
            >
              Ver todas →
            </button>
          )}
        </div>

        {(projecao || fluxo) && (
          <div className="flex items-center gap-4 flex-wrap mb-4 pb-3 border-b border-white/[0.05]">
            {projecao && <RitmoIndicator p={projecao} />}
            {fluxo && <FluxoIndicator f={fluxo} />}
          </div>
        )}

        {total === 0 ? (
          <div className="flex items-center gap-3 py-4">
            <p className="number-display text-[64px] leading-none text-muted/20">0</p>
            <p className="text-[13px] text-muted/60">Nenhuma OS concluída registrada ainda.</p>
          </div>
        ) : (
          <div className="flex items-end gap-6 flex-wrap">
            {/* Hero number */}
            <div className="flex items-end gap-2 flex-shrink-0">
              <span className="font-mono font-black leading-none tabular-nums text-green"
                    style={{ fontSize: 'clamp(56px, 8vw, 80px)' }}>
                {total}
              </span>
              <span className="text-[13px] text-muted mb-3">OS hoje</span>
            </div>

            {/* Type breakdown */}
            <div className="flex-1 min-w-[200px] grid grid-cols-2 sm:grid-cols-4 gap-2">
              {grupos.map(g => {
                const pct = Math.round(g.rows.length / total * 100)
                const GIcon = g.icon
                return (
                  <button
                    key={g.cat}
                    onClick={() => onOpenModal(`Hoje — ${g.label}`, g.rows)}
                    className="bg-surface/30 hover:bg-surface border border-white/[0.08]
                               hover:border-muted/30 rounded-xl p-3 text-left
                               transition-all duration-150 cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      {GIcon
                        ? <GIcon size={12} style={{ color: g.color }} />
                        : <span className="w-3 h-3 rounded-full" style={{ background: g.color }} />
                      }
                      <span className="text-[10px] font-mono text-muted">{pct}%</span>
                    </div>
                    <p className="font-mono font-bold text-[26px] leading-none mb-1"
                       style={{ color: g.color }}>
                      {g.rows.length}
                    </p>
                    <p className="text-[11px] text-muted truncate">{g.label}</p>
                    <div className="mt-2 h-[3px] rounded-full bg-surface/40 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                           style={{ width: `${pct}%`, background: g.color }} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Composition bar */}
        {total > 0 && (
          <div className="mt-4 flex h-1 rounded-full overflow-hidden bg-surface/30">
            {grupos.map(g => (
              <div
                key={g.cat}
                title={`${g.label}: ${g.rows.length}`}
                className="h-full transition-all duration-700"
                style={{ width: `${Math.round(g.rows.length / total * 100)}%`, background: g.color }}
              />
            ))}
          </div>
        )}

        {ritmoIntradiario && <RitmoIntradiarioBar r={ritmoIntradiario} />}
      </div>
    </div>
  )
}

// ─── MetaMesCard ──────────────────────────────────────────────────────────────

export function MetaMesCard({ meta }: { meta: PulsoMetaMes }) {
  if (meta.meta === 0) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-card p-5">
        <div className="flex items-center gap-2.5">
          <Target size={14} className="text-muted" />
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Meta do Mês</span>
        </div>
        <p className="text-[12px] text-muted/60 mt-3">
          {meta.concluidas} concluídas até agora · sem histórico dos 3 meses anteriores para definir uma meta
        </p>
      </div>
    )
  }

  const cor = meta.status === 'acima' ? '#4ade80' : meta.status === 'abaixo' ? '#facc15' : '#94a3b8'
  const pct = Math.min(100, meta.pct ?? 0)
  const diasLabel = meta.diasUteisRestantes === 1 ? '1 dia útil restante' : `${meta.diasUteisRestantes} dias úteis restantes`

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-5" style={{ borderColor: `${cor}28` }}>
      <div className="absolute top-0 left-0 right-0 h-[2px]"
           style={{ background: `linear-gradient(90deg, transparent, ${cor}, transparent)` }} />

      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <Target size={14} style={{ color: cor }} />
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Meta do Mês</span>
        </div>
        <span className="text-[11px] text-muted">{diasLabel}</span>
      </div>

      <div className="flex items-end gap-3 mb-2">
        <span className="font-mono font-black leading-none" style={{ fontSize: '32px', color: cor }}>
          {meta.pct}%
        </span>
        <span className="text-[12px] text-muted mb-1">
          {meta.concluidas} concluídas · meta ~{meta.meta} (média 3 meses)
        </span>
      </div>

      <div className="h-2 bg-surface/40 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
             style={{ width: `${pct}%`, background: cor, boxShadow: `0 0 8px ${cor}60` }} />
      </div>

      {meta.projecaoFinal != null && (
        <p className="mt-2.5 text-[11px]" style={{ color: cor }}>
          {meta.status === 'acima' ? '↑ No ritmo atual' : meta.status === 'abaixo' ? '↓ No ritmo atual' : 'No ritmo atual'}:
          {' '}projeção de <strong>{meta.projecaoFinal}</strong> até o fim do mês
          {meta.status === 'abaixo' ? ' — abaixo da meta' : meta.status === 'acima' ? ' — acima da meta' : ''}
        </p>
      )}
    </div>
  )
}

// ─── AlertaTopoBanner ─────────────────────────────────────────────────────────

export function AlertaTopoBanner({ clustersCount, anomaliasCount, onScrollClusters, onScrollAnomalias }: {
  clustersCount: number; anomaliasCount: number
  onScrollClusters?: () => void; onScrollAnomalias?: () => void
}) {
  if (!clustersCount && !anomaliasCount) return null
  return (
    <div className="flex items-center gap-3 flex-wrap rounded-xl border border-red/25 bg-red/[0.06] px-4 py-2.5">
      <AlertCircle size={13} className="text-red flex-shrink-0" />
      <span className="text-[12px] font-bold text-red">Atenção necessária:</span>
      {clustersCount > 0 && (
        <button
          onClick={onScrollClusters}
          className="text-[12px] text-text underline-offset-2 hover:underline hover:text-red transition-colors"
        >
          {clustersCount} cluster{clustersCount !== 1 ? 's' : ''} de falha detectado{clustersCount !== 1 ? 's' : ''}
        </button>
      )}
      {clustersCount > 0 && anomaliasCount > 0 && <span className="text-muted">·</span>}
      {anomaliasCount > 0 && (
        <button
          onClick={onScrollAnomalias}
          className="text-[12px] text-text underline-offset-2 hover:underline hover:text-red transition-colors"
        >
          {anomaliasCount} anomalia{anomaliasCount !== 1 ? 's' : ''} detectada{anomaliasCount !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}

// ─── ClustersBairroPanel ──────────────────────────────────────────────────────

export function ClustersBairroPanel({ clusters }: { clusters: ClusterAtivo[] }) {
  if (!clusters?.length) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-green/15 bg-card p-5">
        <div className="absolute top-0 left-0 right-0 h-[2px]"
             style={{ background: 'linear-gradient(90deg, transparent, #4ade8066, transparent)' }} />
        <SectionLabel icon={Zap} color="#4ade80">Clusters de Falha</SectionLabel>
        <div className="flex items-center gap-3 mt-4">
          <CheckCircle2 size={18} className="text-green flex-shrink-0" />
          <p className="text-[13px] text-green font-semibold">
            Nenhum cluster detectado — sem bairros com 4+ OS nas últimas 24h
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card"
         style={{ borderColor: 'rgba(248,113,113,0.35)' }}>
      <div className="absolute top-0 left-0 right-0 h-[2px]"
           style={{ background: 'linear-gradient(90deg, transparent, #f87171, transparent)' }} />
      <div className="absolute -top-10 left-0 w-40 h-32 blur-3xl pointer-events-none"
           style={{ background: 'rgba(248,113,113,0.08)' }} />

      <div className="relative p-5">
        <div className="flex items-start justify-between mb-4">
          <SectionLabel icon={Zap} color="#f87171">Clusters de Falha</SectionLabel>
          <span className="text-[10px] font-bold uppercase tracking-[0.05em] bg-red/15 text-red
                           border border-red/25 rounded-full px-2.5 py-1">
            ALERTA
          </span>
        </div>

        <p className="text-[13px] font-semibold text-text mb-1">
          {clusters.length} bairro{clusters.length !== 1 ? 's' : ''} com possível problema de infraestrutura
        </p>
        <p className="text-[11px] text-muted mb-4">4+ OS abertas no mesmo bairro nas últimas 24h</p>

        <div className="space-y-2">
          {clusters.map((cl, i) => (
            <div key={i} className="flex items-center gap-3 bg-red/[0.04] border border-red/[0.12]
                                    rounded-lg px-3 py-2.5">
              <MapPin size={11} className="text-red/60 flex-shrink-0" />
              <span className="text-[12px] font-semibold text-text flex-1 truncate">{cl.bairro}</span>
              <span className="text-[11px] text-muted">{cl.cidade}</span>
              <span className="font-mono text-[13px] font-bold text-red flex-shrink-0">{cl.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── AgingPanel ───────────────────────────────────────────────────────────────

export function AgingPanel({ pulso }: { pulso: Pulso }) {
  const { agingDist } = pulso
  const agingTotals = agingDist as unknown as Record<string, number>
  const agingTotal  = Object.values(agingTotals).reduce((s, v) => s + v, 0)

  const agingEntries: { key: string; label: string; color: string }[] = [
    { key: '≤1d',  label: '≤ 1 dia',  color: '#4ade80' },
    { key: '2-3d', label: '2–3 dias', color: '#facc15' },
    { key: '4-7d', label: '4–7 dias', color: '#f97316' },
    { key: '8+d',  label: '8+ dias',  color: '#f87171' },
  ]

  if (!agingTotal) return (
    <div className="rounded-2xl border border-white/[0.08] bg-card p-5 flex items-center justify-center">
      <p className="text-muted text-[12px]">Sem dados de aging</p>
    </div>
  )

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-card p-5">
      <SectionLabel icon={Clock} color="#3b82f6">Aging da Fila Ativa</SectionLabel>

      <div className="mt-4 space-y-3">
        {agingEntries.map(e => {
          const val = agingTotals[e.key] ?? 0
          const pct = agingTotal > 0 ? Math.round(val / agingTotal * 100) : 0
          return (
            <div key={e.key} className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: e.color }} />
              <span className="text-[11px] text-muted w-14 flex-shrink-0">{e.label}</span>
              <div className="flex-1 h-2 bg-surface/40 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                     style={{ width: `${pct}%`, background: e.color, boxShadow: `0 0 6px ${e.color}60` }} />
              </div>
              <span className="font-mono text-[12px] text-text font-semibold w-6 text-right flex-shrink-0">
                {val}
              </span>
              <span className="font-mono text-[10px] text-muted w-8 text-right flex-shrink-0">
                {pct}%
              </span>
            </div>
          )
        })}
      </div>

      {/* Stacked bar total */}
      <div className="mt-4 flex h-1.5 rounded-full overflow-hidden bg-surface/30">
        {agingEntries.map(e => {
          const val = agingTotals[e.key] ?? 0
          const pct = agingTotal > 0 ? Math.round(val / agingTotal * 100) : 0
          return pct > 0 ? (
            <div key={e.key} className="h-full" style={{ width: `${pct}%`, background: e.color }} />
          ) : null
        })}
      </div>
    </div>
  )
}

// ─── RitmoEquipesPanel ──────────────────────────────────────────────────────

export function RitmoEquipesPanel({ semaforo }: { semaforo: CampoSemaforo[] }) {
  const comRitmo = semaforo.filter(e => e.ritmoHoje != null)
  const abaixo = comRitmo
    .filter(e => e.ritmoHoje!.status === 'abaixo')
    .sort((a, b) => (b.ritmoHoje!.baseline - b.ritmoHoje!.atual) - (a.ritmoHoje!.baseline - a.ritmoHoje!.atual))
    .slice(0, 3)
  const acima = comRitmo
    .filter(e => e.ritmoHoje!.status === 'acima')
    .sort((a, b) => (b.ritmoHoje!.atual - b.ritmoHoje!.baseline) - (a.ritmoHoje!.atual - a.ritmoHoje!.baseline))
    .slice(0, 3)

  if (!comRitmo.length) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-card p-5">
        <SectionLabel icon={Gauge} color="#22d3ee">Ritmo por Equipe — Hoje</SectionLabel>
        <div className="flex items-center justify-center py-8">
          <p className="text-muted text-[12px]">Ainda sem histórico de ritmo para comparar hoje</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-card p-5">
      <SectionLabel icon={Gauge} color="#22d3ee">Ritmo por Equipe — Hoje</SectionLabel>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-yellow/80 mb-2 flex items-center gap-1">
            <TrendingDown size={10} /> Abaixo do ritmo
          </p>
          {abaixo.length === 0 ? (
            <p className="text-[11px] text-muted/50">Nenhuma equipe abaixo da média</p>
          ) : (
            <div className="space-y-1.5">
              {abaixo.map(e => (
                <div key={e.nome} className="flex items-center justify-between text-[11px] gap-2">
                  <span className="text-text font-semibold truncate">{e.nome}</span>
                  <span className="font-mono text-yellow flex-shrink-0">
                    {e.ritmoHoje!.atual}/{e.ritmoHoje!.baseline}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-green/80 mb-2 flex items-center gap-1">
            <TrendingUp size={10} /> Acima do ritmo
          </p>
          {acima.length === 0 ? (
            <p className="text-[11px] text-muted/50">Nenhuma equipe acima da média</p>
          ) : (
            <div className="space-y-1.5">
              {acima.map(e => (
                <div key={e.nome} className="flex items-center justify-between text-[11px] gap-2">
                  <span className="text-text font-semibold truncate">{e.nome}</span>
                  <span className="font-mono text-green flex-shrink-0">
                    {e.ritmoHoje!.atual}/{e.ritmoHoje!.baseline}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── CidadesPanel ─────────────────────────────────────────────────────────────

export function CidadesPanel({ cidades }: { cidades: { cidade: string; count: number }[] }) {
  const max = Math.max(...cidades.map(c => c.count), 1)
  return (
    <div className="relative overflow-hidden rounded-2xl border border-red/15 bg-card p-5">
      <div className="absolute top-0 left-0 right-0 h-[2px]"
           style={{ background: 'linear-gradient(90deg, transparent, rgba(248,113,113,0.4), transparent)' }} />
      <SectionLabel icon={MapPin} color="#f87171">Top Cidades — OS Críticas</SectionLabel>
      <div className="mt-4 space-y-2.5">
        {cidades.map(c => (
          <div key={c.cidade} className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-text w-28 flex-shrink-0 truncate">{c.cidade}</span>
            <div className="flex-1 h-2 bg-surface/40 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                   style={{ width: `${Math.round(c.count / max * 100)}%`, background: '#f87171', boxShadow: '0 0 6px rgba(248,113,113,0.5)' }} />
            </div>
            <span className="font-mono text-[13px] font-bold text-red w-6 text-right flex-shrink-0">{c.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── FornecedorCard ───────────────────────────────────────────────────────────

const SLA_TIER = { ok: { cls: 'badge-green', label: 'No SLA' }, warn: { cls: 'badge-yellow', label: 'Atenção' }, crit: { cls: 'badge-red', label: 'Crítico' } }

export function FornecedorCard({ nome, total, concluidas, sla, cor, slaTrend }: {
  nome: string; total: number; concluidas: number; sla: number; cor: string
  slaTrend?: KPI['trend']
}) {
  const tier = sla >= 85 ? 'ok' : sla >= 65 ? 'warn' : 'crit'
  const t    = SLA_TIER[tier]

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card transition-all duration-200
                    hover:-translate-y-0.5 hover:shadow-lg cursor-default"
         style={{ borderColor: `${cor}22` }}>
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: cor }} />
      <div className="absolute -top-8 -right-8 w-20 h-20 rounded-full blur-2xl pointer-events-none"
           style={{ background: `${cor}14` }} />

      <div className="relative p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cor }} />
            <p className="text-[12.5px] font-bold text-text truncate">{nome}</p>
          </div>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2 ${t.cls}`}>
            {t.label}
          </span>
        </div>

        <div className="flex items-end justify-between mb-2.5">
          <div>
            <p className="font-mono font-black text-[28px] leading-none text-text">{total}</p>
            <p className="text-[11px] text-muted mt-0.5">OS abertas</p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5">
              <p className="font-mono font-bold text-[22px] leading-none"
                 style={{ color: cor }}>{sla}%</p>
              {slaTrend && <TrendPill trend={slaTrend} />}
            </div>
            <p className="text-[11px] text-muted mt-0.5">conclusão · vs. período anterior</p>
          </div>
        </div>

        <div className="h-1.5 bg-surface/40 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
               style={{ width: `${sla}%`, background: cor }} />
        </div>
        <p className="text-[10px] text-muted mt-1.5">{concluidas} concluídas</p>
      </div>
    </div>
  )
}

// ─── Modal de OS ──────────────────────────────────────────────────────────────

const MODAL_COLS = [
  { key: 'numos',           label: 'Nº OS'       },
  { key: 'nomecliente',     label: 'Cliente'      },
  { key: 'nomedacidade',    label: 'Cidade'       },
  { key: 'nomedaequipe',    label: 'Equipe'       },
  { key: 'descsituacao',    label: 'Situação'     },
  { key: '_aging',          label: 'Aging'        },
  { key: 'dataagendamento', label: 'Agendamento'  },
]

export function KpiModalTable({ rows, onOS }: { rows: OSRow[]; onOS: (os: OSRow) => void }) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: '_aging', dir: 'desc' })
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  function toggleSort(key: string) { setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' })); setPage(0) }
  function agendSort(s: string | null | undefined): string { if (!s) return ''; const p = s.split(' ')[0].split('/'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : s }

  const sorted = useMemo(() => {
    if (!rows.length) return []
    return [...rows].sort((a, b) => {
      const { key, dir } = sort
      let av: number | string, bv: number | string
      if (key === 'numos')                { av = parseInt(a.numos) || 0; bv = parseInt(b.numos) || 0 }
      else if (key === 'dataagendamento') { av = agendSort(a.dataagendamento ?? ''); bv = agendSort(b.dataagendamento ?? '') }
      else if (key === '_aging')          { av = a._aging ?? -1; bv = b._aging ?? -1 }
      else                               {
        av = String((a as Record<string, unknown>)[key] ?? '').toLowerCase()
        bv = String((b as Record<string, unknown>)[key] ?? '').toLowerCase()
      }
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
      return dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageRows   = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (!rows.length) return <p className="text-center text-muted text-[12px] py-10">Nenhuma OS encontrada.</p>

  return (
    <div className="overflow-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-white/[0.08] bg-surface text-left text-[10px] font-bold uppercase tracking-[0.04em] text-muted">
            {MODAL_COLS.map(col => (
              <th key={col.key} onClick={() => toggleSort(col.key)}
                  className="px-4 py-2.5 whitespace-nowrap cursor-pointer select-none hover:text-secondary transition-colors">
                <span className="flex items-center gap-1">
                  {col.label}
                  {sort.key === col.key
                    ? (sort.dir === 'asc' ? <ChevronUp size={9} className="text-primary" /> : <ChevronDown size={9} className="text-primary" />)
                    : <ChevronDown size={9} className="opacity-20" />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {pageRows.map(os => {
            const aging = os._aging ?? 0
            const agVar = aging >= 6 ? 'red' : aging >= 3 ? 'yellow' : 'cyan'
            return (
              <tr key={os.numos} onClick={() => onOS(os)}
                  className="hover:bg-surface/30 cursor-pointer transition-colors">
                <td className="px-4 py-2.5 font-mono text-primary">{os.numos}</td>
                <td className="px-4 py-2.5 text-text max-w-[160px] truncate">{os.nomecliente ?? '—'}</td>
                <td className="px-4 py-2.5 text-secondary">{os.nomedacidade ?? '—'}</td>
                <td className="px-4 py-2.5 text-secondary max-w-[140px] truncate">{shortEquipe(os.nomedaequipe) || '—'}</td>
                <td className="px-4 py-2.5"><Badge variant={situacaoVariant(os._situacaoEfetiva ?? os.descsituacao)}>{os._situacaoEfetiva ?? os.descsituacao ?? '—'}</Badge></td>
                <td className="px-4 py-2.5">{os._aging != null ? <Badge variant={agVar}>{aging}d</Badge> : <span className="text-muted">—</span>}</td>
                <td className="px-4 py-2.5 font-mono text-muted">{os.dataagendamento ? os.dataagendamento.slice(0, 10) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.08] text-[10px] text-muted">
          <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} de {sorted.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="px-2 py-1 rounded border border-white/[0.08] disabled:opacity-30 hover:bg-surface/40 transition-colors">‹</button>
            <span className="px-2 font-mono">{page + 1}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                    className="px-2 py-1 rounded border border-white/[0.08] disabled:opacity-30 hover:bg-surface/40 transition-colors">›</button>
          </div>
        </div>
      )}
    </div>
  )
}

