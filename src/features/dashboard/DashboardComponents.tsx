import { useState, useMemo, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import {
  AlertCircle, CheckCircle2, Zap, TrendingUp, TrendingDown, Minus,
  MapPin, Clock, BarChart3, Package, Wrench, Radio, Target, Sparkles,
  ChevronDown, ChevronUp, Activity, Users, RotateCcw,
} from 'lucide-react'
import { useAIAnomalias } from '../../hooks/useAIAnomalias'
import type { AINarrativeResult } from '../../hooks/useAINarrative'
import { GaugeChart } from '../../components/ui/GaugeChart'
import { Badge } from '../../components/ui/Badge'
import { shortEquipe, situacaoVariant } from '../../lib/osFormat'
import { isCOPE, isReagend } from '../../lib/transform'
import type {
  OSRow, KPI, Pulso, AnomaliasData, ClusterAtivo, AccentColor,
} from '../../lib/types'

export interface ModalState        { title: string; rows: OSRow[] }
export type { AINarrativeResult }
export type IconComp = ComponentType<{ size?: number; className?: string; style?: CSSProperties }>

export interface CatCfgItem {
  cat:   string
  label: string
  icon:  IconComp | null
  color: string
}

export interface AnomaliaContextType {
  total:     number
  sla_pct:   number
  criticas:  number
  aging_med: number
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
  reagend:  r => isReagend(r) && isAtivo(r),
}
export const ALLROWS_KPIS = new Set(['total','rede','pend','atend','criticas','semEq','reagend'])

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
  reagend: RotateCcw, total: BarChart3, rede: Radio, concl: CheckCircle2, taxa: Target,
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

export interface DashFornCard { nome: string; total: number; concluidas: number; sla: number; cor: string }
export interface TypedDashboard { kpis: KPI[]; fornecedores: DashFornCard[]; pulso: Pulso }


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

// ─── PulsoHero ────────────────────────────────────────────────────────────────

export function PulsoHero({ pulso, aiData, isLoadingAI, onRequestAI }: {
  pulso: Pulso; aiData: AINarrativeResult | null | undefined; isLoadingAI: boolean; onRequestAI?: (obs: string) => void
}) {
  const [draftObs, setDraftObs] = useState('')
  const [showReanalysis, setShowReanalysis] = useState(false)

  const {
    score = 0, scoreLabel = '—', narrativa = '', quickInsights = [],
    agingMed = 0, slaFila = 0, mttr = 0, semAgendamento = 0,
  } = pulso

  const scoreColor =
    score >= 85 ? '#4ade80' :
    score >= 65 ? '#facc15' : '#f87171'

  type DisplayInsight = { level: string; text: string; ai?: boolean }
  const displayNarrative = narrativa
  const displayInsights: DisplayInsight[] = aiData?.insights?.length
    ? aiData.insights.map(text => ({ level: 'cyan', text, ai: true }))
    : quickInsights

  const miniStats = [
    { label: 'Aging Médio', value: agingMed > 0 ? `${agingMed}d` : '—',      warn: agingMed > 3, danger: agingMed > 7  },
    { label: 'SLA da Fila', value: `${slaFila}%`,                              warn: slaFila < 90, danger: slaFila < 75  },
    { label: 'MTTR',        value: mttr > 0 ? `${mttr}d` : '—',               warn: mttr > 2,     danger: mttr > 5      },
    { label: 'Sem Agend.',  value: String(semAgendamento),                      warn: semAgendamento > 5, danger: semAgendamento > 20 },
  ]

  const INSIGHT_CLS = {
    red:    'bg-red/10 text-red border-red/25',
    orange: 'bg-orange/10 text-orange border-orange/25',
    yellow: 'bg-yellow/10 text-yellow border-yellow/25',
    green:  'bg-green/10 text-green border-green/25',
    cyan:   'bg-cyan/10 text-cyan border-cyan/25',
  } as Record<string, string>

  return (
    <div
      className="relative overflow-hidden rounded-2xl border"
      style={{
        background: 'rgb(var(--c-card))',
        borderColor: `${scoreColor}28`,
      }}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px]"
           style={{ background: `linear-gradient(90deg, transparent, ${scoreColor}, transparent)` }} />

      {/* Atmospheric glow */}
      <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full blur-3xl pointer-events-none"
           style={{ background: `${scoreColor}0e` }} />
      <div className="absolute -bottom-20 -left-10 w-48 h-48 rounded-full blur-3xl pointer-events-none"
           style={{ background: 'rgba(59,130,246,0.05)' }} />

      <div className="relative p-5 space-y-4">
        {/* Main row */}
        <div className="flex items-start gap-6 flex-wrap">

          {/* Gauge */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <GaugeChart value={score} color={scoreColor} label={scoreLabel} size={100} />
            <span className="text-[10px] font-bold uppercase tracking-[0.06em]"
                  style={{ color: `${scoreColor}99` }}>
              Score
            </span>
          </div>

          {/* Narrativa */}
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={10} className="text-muted" />
              <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted">
                Análise Operacional
              </span>
              {aiData && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary/80
                                 bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">
                  <Sparkles size={7} /> IA
                </span>
              )}
            </div>

            {!isLoadingAI && !aiData && onRequestAI ? (
              <div className="space-y-2">
                <textarea
                  value={draftObs}
                  onChange={e => setDraftObs(e.target.value)}
                  placeholder="Contexto opcional para a IA: ex. tivemos queda de energia hoje, o que pode justificar menor fluxo de atendimentos."
                  rows={2}
                  className="w-full text-[11px] text-secondary placeholder:text-muted/50
                             bg-surface/60 border border-white/[0.08] rounded-lg px-3 py-2
                             resize-none focus:outline-none focus:border-primary/30
                             leading-relaxed"
                />
                <button
                  onClick={() => onRequestAI(draftObs)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-primary/70 hover:text-primary
                             px-3 py-1.5 rounded-lg border border-primary/20 hover:border-primary/40 hover:bg-primary/[0.08]
                             transition-all duration-fast"
                >
                  <Sparkles size={11} /> Analisar com IA
                </button>
              </div>
            ) : isLoadingAI && !aiData ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="h-2 bg-surface rounded animate-pulse w-16" />
                  <div className="h-3 bg-surface rounded animate-pulse w-full" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 bg-surface rounded animate-pulse w-16" />
                  <div className="h-3 bg-surface rounded animate-pulse w-5/6" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 bg-surface rounded animate-pulse w-16" />
                  <div className="h-3 bg-surface rounded animate-pulse w-4/5" />
                </div>
              </div>
            ) : aiData?.problema ? (
              <div className="space-y-2.5">
                {/* Problema */}
                <div className="flex gap-2.5 items-start">
                  <span className="mt-[3px] flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red" />
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-red/70 mb-0.5">Problema</p>
                    <p className="text-[12px] text-secondary leading-snug">{aiData.problema}</p>
                  </div>
                </div>
                {/* Sugestão */}
                <div className="flex gap-2.5 items-start">
                  <span className="mt-[3px] flex-shrink-0 w-1.5 h-1.5 rounded-full bg-yellow" />
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-yellow/70 mb-0.5">Sugestão</p>
                    <p className="text-[12px] text-secondary leading-snug">{aiData.sugestao}</p>
                  </div>
                </div>
                {/* Ação */}
                <div className="flex gap-2.5 items-start">
                  <Zap size={10} className="mt-[2px] flex-shrink-0 text-green" />
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-green/70 mb-0.5">Ação Imediata</p>
                    <p className="text-[12px] font-semibold text-text leading-snug">{aiData.acao}</p>
                  </div>
                </div>

                {/* Reanalisar */}
                {onRequestAI && !showReanalysis && (
                  <button
                    onClick={() => setShowReanalysis(true)}
                    className="mt-1 flex items-center gap-1 text-[10px] text-muted/60 hover:text-primary
                               transition-colors duration-fast"
                  >
                    <Sparkles size={9} /> Reanalisar com novo contexto
                  </button>
                )}
                {showReanalysis && onRequestAI && (
                  <div className="pt-1 space-y-1.5 border-t border-white/[0.05]">
                    <textarea
                      value={draftObs}
                      onChange={e => setDraftObs(e.target.value)}
                      placeholder="Novo contexto para a IA..."
                      rows={2}
                      className="w-full text-[11px] text-secondary placeholder:text-muted/50
                                 bg-surface/60 border border-white/[0.08] rounded-lg px-3 py-2
                                 resize-none focus:outline-none focus:border-primary/30
                                 leading-relaxed"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { onRequestAI(draftObs); setShowReanalysis(false) }}
                        className="flex items-center gap-1 text-[10px] font-semibold text-primary/70 hover:text-primary
                                   px-2.5 py-1 rounded-md border border-primary/20 hover:border-primary/40
                                   hover:bg-primary/[0.08] transition-all duration-fast"
                      >
                        <Sparkles size={9} /> Analisar
                      </button>
                      <button
                        onClick={() => setShowReanalysis(false)}
                        className="text-[10px] text-muted/60 hover:text-muted px-2 py-1 transition-colors duration-fast"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-secondary leading-[1.7]">
                {displayNarrative || 'Carregando análise operacional…'}
              </p>
            )}
          </div>

          {/* Mini stats */}
          <div className="flex-shrink-0 grid grid-cols-2 gap-x-8 gap-y-3">
            {miniStats.map(s => (
              <div key={s.label} className="text-right">
                <p className="text-[10px] text-muted mb-0.5">{s.label}</p>
                <p className={`font-mono font-bold text-[18px] leading-none tabular-nums
                               ${s.danger ? 'text-red' : s.warn ? 'text-yellow' : 'text-text'}`}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Insight pills */}
        {displayInsights.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-3 border-t border-white/[0.05]">
            {displayInsights.map((ins, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold
                            px-2.5 py-[5px] rounded-full border ${INSIGHT_CLS[ins.level] ?? INSIGHT_CLS.cyan}`}
              >
                {ins.ai
                  ? <Sparkles size={8} className="flex-shrink-0 opacity-70" />
                  : <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                }
                {ins.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── BentoKPICard ─────────────────────────────────────────────────────────────

export function BentoKPICard({ kpi, icon: Icon, delay = 0, onClick }: {
  kpi: KPI; icon: IconComp | undefined; delay?: number; onClick?: () => void
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

export function ExecutadasHeroBlock({ rows, onOpenModal }: {
  rows: OSRow[]
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
        <div className="flex items-start justify-between mb-4">
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
      </div>
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

export function FornecedorCard({ nome, total, concluidas, sla, cor }: {
  nome: string; total: number; concluidas: number; sla: number; cor: string
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
            <p className="font-mono font-bold text-[22px] leading-none"
               style={{ color: cor }}>{sla}%</p>
            <p className="text-[11px] text-muted mt-0.5">conclusão</p>
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

// ─── AnomaliaSection ──────────────────────────────────────────────────────────

const PRIORIDADE_STYLE = {
  alta:  { color: '#f87171', bg: 'rgba(248,113,113,0.08)',   border: 'rgba(248,113,113,0.25)'   },
  média: { color: '#facc15', bg: 'rgba(250,204,21,0.08)',   border: 'rgba(250,204,21,0.25)'   },
  baixa: { color: '#4ade80', bg: 'rgba(74,222,128,0.08)',   border: 'rgba(74,222,128,0.25)'   },
}

export function AnomaliaSection({ anomalias, contexto }: {
  anomalias: AnomaliasData; contexto: AnomaliaContextType
}) {
  const { total = 0, picosDia = [], bairrosAnomalia = [], equipesAnomalia = [] } = anomalias ?? {}
  const [open, setOpen] = useState(total > 0)
  const [aiEnabled, setAiEnabled] = useState(false)

  type HookAnomItem = { zScore: number; [k: string]: unknown }
  const { data: rcaData, isLoading: rcaLoading } = useAIAnomalias({
    picosDia:        picosDia        as unknown as HookAnomItem[],
    bairrosAnomalia: bairrosAnomalia as unknown as HookAnomItem[],
    equipesAnomalia: equipesAnomalia as unknown as HookAnomItem[],
    contexto,
    enabled: aiEnabled,
  })

  const pri    = rcaData?.prioridade ?? 'média'
  const priSty = PRIORIDADE_STYLE[pri] ?? PRIORIDADE_STYLE['média']

  return (
    <div className="relative overflow-hidden rounded-2xl border border-yellow/20 bg-card">
      <div className="absolute top-0 left-0 right-0 h-[2px]"
           style={{ background: 'linear-gradient(90deg, transparent, rgba(250,204,21,0.5), transparent)' }} />

      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface/15 transition-colors"
      >
        <AlertCircle size={14} className="text-yellow flex-shrink-0" />
        <span className="font-semibold text-[13px] text-text flex-1">Detecções Automáticas</span>
        <span className="text-[10px] font-mono bg-yellow/10 text-yellow border border-yellow/20 rounded-full px-2.5 py-1">
          {total} anomalia{total !== 1 ? 's' : ''}
        </span>
        <ChevronDown size={13} className={`text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-yellow/[0.10]">
          <p className="text-[11px] text-muted/70 pt-3">
            Padrões fora do normal detectados via Z-score nos dados do período selecionado.
          </p>

          {picosDia.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-2">Picos de Abertura</p>
              <div className="space-y-2">
                {picosDia.map(p => (
                  <div key={p.date} className="flex items-center gap-3 text-[12px] bg-surface/20 rounded-lg px-3 py-2">
                    <span className="font-mono text-primary w-22 flex-shrink-0">{p.date}</span>
                    <span className="font-mono font-bold text-text">{p.count} OS</span>
                    <span className="text-muted ml-auto">Z: <span className="text-yellow font-mono">{p.zScore}σ</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bairrosAnomalia.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-2">Bairros com SLA Anômalo</p>
              <div className="space-y-2">
                {bairrosAnomalia.map(b => (
                  <div key={b.bairro} className="flex items-center gap-3 text-[12px] bg-surface/20 rounded-lg px-3 py-2">
                    <span className="text-text font-semibold flex-1 min-w-0 truncate">{b.bairro}</span>
                    <span className="font-mono font-bold text-red">{b.ratePct}%</span>
                    <span className="text-muted">{b.slaExc}/{b.total}</span>
                    <span className="text-muted ml-auto">Z: <span className="text-yellow font-mono">{b.zScore}σ</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {equipesAnomalia.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-2">Equipes com Aging Elevado</p>
              <div className="space-y-2">
                {equipesAnomalia.map(e => (
                  <div key={e.nome} className="flex items-center gap-3 text-[12px] bg-surface/20 rounded-lg px-3 py-2">
                    <span className="text-text font-semibold flex-1 min-w-0 truncate">{e.nome}</span>
                    <span className="font-mono font-bold text-orange">{e.agingMed}d</span>
                    <span className="text-muted">{e.count} OS</span>
                    <span className="text-muted ml-auto">Z: <span className="text-yellow font-mono">{e.zScore}σ</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Análise de Causa Raiz (Claude) ── */}
          <div className="border-t border-white/[0.08] pt-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={12} className="text-primary/70" />
                <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">Análise de Causa Raiz</p>
              </div>
              {!aiEnabled && (
                <button
                  onClick={() => setAiEnabled(true)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-primary/70 hover:text-primary
                             px-3 py-1.5 rounded-lg border border-primary/20 hover:border-primary/40 hover:bg-primary/[0.08]
                             transition-all duration-fast"
                >
                  <Sparkles size={11} /> Analisar com IA
                </button>
              )}
            </div>

            {rcaLoading && (
              <div className="flex items-center gap-2 text-[11px] text-muted/60 py-2">
                <div className="w-3 h-3 rounded-full border border-primary/40 border-t-primary animate-spin" />
                Analisando anomalias...
              </div>
            )}

            {rcaData && (
              <div className="space-y-3">
                <div className="rounded-lg px-3 py-2.5 text-[12px] leading-relaxed text-text/80 italic"
                     style={{ background: priSty.bg, border: `1px solid ${priSty.border}` }}>
                  <span className="not-italic font-semibold mr-1.5"
                        style={{ color: priSty.color }}>
                    [{pri.charAt(0).toUpperCase() + pri.slice(1)}]
                  </span>
                  {rcaData.causa_raiz}
                </div>

                {rcaData.acoes?.length > 0 && (
                  <div className="space-y-1.5">
                    {rcaData.acoes.map((acao, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px] text-text/70">
                        <span className="text-primary/60 font-mono flex-shrink-0 mt-0.5">{i + 1}.</span>
                        <span>{acao}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
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
                <td className="px-4 py-2.5"><Badge variant={situacaoVariant(os.descsituacao)}>{os.descsituacao ?? '—'}</Badge></td>
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

