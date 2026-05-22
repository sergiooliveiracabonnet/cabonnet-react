import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SlaLimits } from '../lib/types'

export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertOperator = '>' | '<' | '>=' | '<=' | '==='

export interface AlertRule {
  id:        string
  label:     string
  desc:      string
  metric:    string
  operator:  AlertOperator
  threshold: number
  severity:  AlertSeverity
  enabled:   boolean
}

export const DEFAULT_RULES: AlertRule[] = [
  { id: 'sla_critico',   label: 'OS Críticas de SLA',         desc: 'Alerta quando o nº de OS com SLA 2× excedido supera o limite',          metric: 'criticas',   operator: '>',  threshold: 5,   severity: 'critical', enabled: true  },
  { id: 'taxa_conclusao', label: 'Taxa de Conclusão Baixa',   desc: 'Alerta quando a taxa de conclusão cai abaixo do mínimo configurado',     metric: 'taxa',       operator: '<',  threshold: 70,  severity: 'warning',  enabled: true  },
  { id: 'sem_equipe',    label: 'OS sem Equipe',               desc: 'Alerta quando há OS ativas pendentes sem equipe atribuída',              metric: 'semEquipe',  operator: '>',  threshold: 3,   severity: 'warning',  enabled: true  },
  { id: 'fila_alta',     label: 'Fila Total Elevada',          desc: 'Alerta quando a fila total de OS ativas supera o limite',                metric: 'total',      operator: '>',  threshold: 150, severity: 'info',     enabled: false },
  { id: 'sem_equipe_4h', label: 'OS sem Equipe há mais de 4h', desc: 'Alerta quando há OS ativas sem equipe atribuída há mais de 4 horas',    metric: 'semEquipe4h', operator: '>', threshold: 0,   severity: 'critical', enabled: true  },
]

export const DEFAULT_SLA_LIMITS: SlaLimits = {
  INSTALACAO: 2,
  MANUTENCAO: 1,
  SERVICO:    2,
  VT24H:      1,
  VT48H:      2,
  VT08H:      1,
}

export const DEFAULT_META_SCORE: Record<string, number> = {
  WES:        70,
  Instacable: 70,
  THM:        70,
}

interface AlertState {
  rules:      AlertRule[]
  slaLimits:  SlaLimits
  metaScore:  Record<string, number>
  updateRule:       (id: string, patch: Partial<AlertRule>) => void
  resetRules:       () => void
  updateSlaLimit:   (tipo: keyof SlaLimits, dias: number) => void
  resetSlaLimits:   () => void
  updateMetaScore:  (operadora: string, valor: number) => void
  resetMetaScore:   () => void
}

export const useAlertStore = create<AlertState>()(
  persist(
    (set) => ({
      rules:     DEFAULT_RULES,
      slaLimits: DEFAULT_SLA_LIMITS,
      metaScore: DEFAULT_META_SCORE,

      updateRule: (id, patch) =>
        set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),

      resetRules: () => set({ rules: DEFAULT_RULES }),

      updateSlaLimit: (tipo, dias) =>
        set((s) => ({ slaLimits: { ...s.slaLimits, [tipo]: Number(dias) } })),

      resetSlaLimits: () => set({ slaLimits: DEFAULT_SLA_LIMITS }),

      updateMetaScore: (operadora, valor) =>
        set((s) => ({ metaScore: { ...s.metaScore, [operadora]: Number(valor) } })),

      resetMetaScore: () => set({ metaScore: DEFAULT_META_SCORE }),
    }),
    {
      name:    'cabonnet-alert-store',
      version: 1,
      migrate: (persisted, version) => {
        if (version < 1) {
          return { ...(persisted as object), slaLimits: DEFAULT_SLA_LIMITS, metaScore: DEFAULT_META_SCORE, rules: DEFAULT_RULES }
        }
        return persisted as AlertState
      },
    }
  )
)
