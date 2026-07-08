import type { ComponentType, CSSProperties } from 'react'
import {
  AlertCircle, CheckCircle2, Target,
  Clock, BarChart3, Radio, Activity, Users, RotateCcw, Send,
} from 'lucide-react'
import { isCOPE, isReagend, getReagendTipo } from '../../lib/transform'
import type { OSRow, KPI, Pulso, AccentColor } from '../../lib/types'
import type { ProjecaoRisco } from '../../lib/builders/dashboard'

export type { ProjecaoRisco }
export type { AINarrativeResult } from '../../hooks/useAINarrative'

export interface ModalState { title: string; rows: OSRow[]; foco?: string }

// KPIs de risco que têm filtro correspondente na OrdensPage (deep-link "Abrir na fila")
export const FOCO_NAVEGAVEL = new Set(['criticas', 'semEq', 'pend', 'atend', 'reagendInviab', 'reagendMobile', 'reagendFutura'])

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
const _hojeDDMMYYYY = (): string => {
  const n = new Date()
  return `${String(n.getDate()).padStart(2, '0')}/${String(n.getMonth() + 1).padStart(2, '0')}/${n.getFullYear()}`
}
const isAgendadaHoje = (r: OSRow): boolean => (r.dataagendamento || '').split(' ')[0] === _hojeDDMMYYYY()

export const KPI_FILTERS: Record<string, (r: OSRow) => boolean> = {
  total:    r => !isCOPE(r) && !isReagend(r) && isAtivo(r) && !isRede(r),
  rede:     r => !isCOPE(r) && !isReagend(r) && isAtivo(r) &&  isRede(r),
  concl:    r => !isCOPE(r) && !isReagend(r) && r.descsituacao === 'Concluída',
  pend:     r => !isCOPE(r) && !isReagend(r) && r.descsituacao === 'Pendente'    && !isRede(r),
  atend:    r => !isCOPE(r) && !isReagend(r) && r.descsituacao === 'Atendimento' && !isRede(r),
  criticas: r => !isCOPE(r) && !isReagend(r) && r._slaCritico  && !isRede(r) && isAgendadaHoje(r),
  semEq:    r => !isCOPE(r) && !isReagend(r) && !r.nomedaequipe?.trim() && isAtivo(r) && !isRede(r),
  copeAguardando: r => isCOPE(r) && isAtivo(r),
  reagendInviab: r => isReagend(r) && isAtivo(r) && getReagendTipo(r) === 'inviabilidade',
  reagendMobile: r => isReagend(r) && isAtivo(r) && getReagendTipo(r) === 'mobile',
  reagendFutura: r => isReagend(r) && isAtivo(r) && getReagendTipo(r) === 'futura',
  reagend:       r => isReagend(r) && isAtivo(r),
}
export const ALLROWS_KPIS = new Set(['total','rede','pend','atend','criticas','semEq','copeAguardando','reagendInviab','reagendMobile','reagendFutura','reagend'])

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
  copeAguardando: Send,
  reagendInviab: RotateCcw, reagendMobile: RotateCcw, reagendFutura: RotateCcw, reagend: RotateCcw,
  total: BarChart3, rede: Radio, concl: CheckCircle2, taxa: Target,
}

export interface DashFornCard { nome: string; total: number; concluidas: number; sla: number; cor: string }
export interface ScoreTendencia { atual: number; anterior: number | null; delta: number | null }
export interface DashMover { id: string; label: string; atual: number; anterior: number; delta: number; unidade: string; melhorou: boolean; impacto: number }
export interface TypedDashboard {
  kpis: KPI[]; fornecedores: DashFornCard[]; pulso: Pulso
  scoreTendencia: ScoreTendencia; mudancas: DashMover[]; metaScore: number; projecaoRisco: ProjecaoRisco
}

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
