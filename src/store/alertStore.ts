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

// Meta de SLA (% das OS entregues dentro do prazo) por operadora.
export const DEFAULT_META_SLA: Record<string, number> = {
  WES:        80,
  Instacable: 80,
  THM:        80,
}

interface AlertState {
  rules:      AlertRule[]
  slaLimits:  SlaLimits
  metaSla:    Record<string, number>
  acknowledged: Record<string, number>
  updateRule:       (id: string, patch: Partial<AlertRule>) => void
  resetRules:       () => void
  updateSlaLimit:   (tipo: keyof SlaLimits, dias: number) => void
  resetSlaLimits:   () => void
  updateMetaSla:    (operadora: string, valor: number) => void
  resetMetaSla:     () => void
  toggleAcknowledged: (id: string) => void
}

export const ALERT_STORE_VERSION = 4

type PersistedAlertState = Partial<AlertState> & {
  /** Removido na v4: era a meta do score composto do fornecedor. */
  metaScore?: Record<string, number>
}

/**
 * Exportada para teste: a lógica de reset por versão é fácil de errar em
 * silêncio, e o erro só aparece no navegador de quem já tinha dado salvo.
 *
 * v4 zera a meta por operadora de propósito. O valor salvo era alvo de um score
 * composto (SLA 45% + conclusão 35% + MTTR 20%) que não existe mais; carregá-lo
 * como meta de SLA manteria o número e trocaria o significado por baixo do
 * gestor. Quem tinha meta customizada precisa reconfigurar — em compensação, o
 * número que ele vê passa a medir o que o rótulo diz.
 */
export function migrateAlertStore(persisted: unknown, version: number): AlertState {
  // metaScore sai do objeto: sem isso o spread abaixo carregaria a chave morta
  // de volta para o localStorage a cada migração, acumulando lixo para sempre.
  const { metaScore: _obsoleto, ...current } = (persisted ?? {}) as PersistedAlertState
  void _obsoleto
  return {
    ...current,
    slaLimits:    current.slaLimits ?? DEFAULT_SLA_LIMITS,
    metaSla:      version < 4 ? DEFAULT_META_SLA : current.metaSla ?? DEFAULT_META_SLA,
    rules:        current.rules ?? DEFAULT_RULES,
    acknowledged: version < 2 ? {} : current.acknowledged ?? {},
  } as AlertState
}

export const useAlertStore = create<AlertState>()(
  persist(
    (set) => ({
      rules:     DEFAULT_RULES,
      slaLimits: DEFAULT_SLA_LIMITS,
      metaSla:   DEFAULT_META_SLA,
      acknowledged: {},

      updateRule: (id, patch) =>
        set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),

      resetRules: () => set({ rules: DEFAULT_RULES }),

      updateSlaLimit: (tipo, dias) =>
        set((s) => ({ slaLimits: { ...s.slaLimits, [tipo]: Number(dias) } })),

      resetSlaLimits: () => set({ slaLimits: DEFAULT_SLA_LIMITS }),

      updateMetaSla: (operadora, valor) =>
        set((s) => ({ metaSla: { ...s.metaSla, [operadora]: Number(valor) } })),

      resetMetaSla: () => set({ metaSla: DEFAULT_META_SLA }),
      toggleAcknowledged: (id) => set((s) => {
        const acknowledged = { ...s.acknowledged }
        if (acknowledged[id]) delete acknowledged[id]
        else acknowledged[id] = Date.now()
        return { acknowledged }
      }),
    }),
    {
      name:    'cabonnet-alert-store',
      version: ALERT_STORE_VERSION,
      migrate: migrateAlertStore,
    }
  )
)
