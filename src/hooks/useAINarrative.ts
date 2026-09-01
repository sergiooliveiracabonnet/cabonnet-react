import { ai } from '../lib/api'
import { useAIQuery } from './useAIQuery'

interface KPI {
  id:    string
  value: number | string
}

interface AINarrativeInput {
  kpis?:         KPI[]
  pulso?:        Record<string, unknown>
  fornecedores?: { nome: string; total: number; concluidas: number; sla: number }[]
  anomalias?:    { total?: number }
  observacao?:   string
}

export function useAINarrative({ kpis = [], pulso = {}, fornecedores = [], anomalias = {}, observacao = '', enabled = false }: AINarrativeInput & { enabled?: boolean } = {}) {
  const get = (id: string): number => {
    const kpi = kpis.find(k => k.id === id)
    return typeof kpi?.value === 'number' ? kpi.value : parseInt(String(kpi?.value)) || 0
  }
  const payload = {
    total:              get('total'),
    criticas:           get('criticas'),
    semEquipe:          get('semEq'),
    pend:               get('pend'),
    atend:              get('atend'),
    taxa:               get('taxa'),
    slaFila:            (pulso.slaFila         as number) ?? 0,
    agingMed:           (pulso.agingMed        as number) ?? 0,
    semAgendamento:     (pulso.semAgendamento  as number) ?? 0,
    mttr:               (pulso.mttr            as number) ?? 0,
    topCidadesCriticas: (pulso.topCidadesCriticas as unknown[]) ?? [],
    fornecedores:       fornecedores.map(f => ({ nome: f.nome, total: f.total, concluidas: f.concluidas, sla: f.sla })),
    anomalias:          { total: (anomalias as { total?: number }).total ?? 0 },
    observacao:         observacao.trim() || undefined,
  }

  return useAIQuery<AINarrativeResult>({
    key:     ['ai-narrative', payload],
    fn:      () => ai.narrative(payload),
    enabled: enabled && payload.total > 0,
    gcTime:  10 * 60 * 1000,
  })
}

export interface AINarrativeResult {
  ok?:       boolean
  problema?: string
  sugestao?: string
  acao?:     string
  insights?: string[]
  cached?:   boolean
}
