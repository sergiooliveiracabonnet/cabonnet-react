import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ai } from '../lib/api'

interface KPI {
  id:    string
  value: number | string
}

interface AINarrativeInput {
  kpis?:        KPI[]
  pulso?:       Record<string, unknown>
  fornecedores?: { nome: string; total: number; concluidas: number; sla: number }[]
  anomalias?:   { total?: number }
}

export function useAINarrative({ kpis = [], pulso = {}, fornecedores = [], anomalias = {} }: AINarrativeInput = {}) {
  const payload = useMemo(() => {
    const get = (id: string): number => {
      const kpi = kpis.find(k => k.id === id)
      return typeof kpi?.value === 'number' ? kpi.value : parseInt(String(kpi?.value)) || 0
    }
    return {
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
    }
  }, [kpis, pulso, fornecedores, anomalias])

  return useQuery({
    queryKey:  ['ai-narrative', payload],
    queryFn:   () => ai.narrative(payload),
    staleTime: 5 * 60 * 1000,
    gcTime:    10 * 60 * 1000,
    retry:     false,
    enabled:   payload.total > 0,
    select:    (data: unknown) => {
      const d = data as { ok?: boolean } | null
      return d?.ok ? d : null
    },
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
