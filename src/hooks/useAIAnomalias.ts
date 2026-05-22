import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ai } from '../lib/api'

interface AnomaliaItem {
  zScore: number
  [key: string]: unknown
}

interface AIAnomaliasInput {
  picosDia?:        AnomaliaItem[]
  bairrosAnomalia?: AnomaliaItem[]
  equipesAnomalia?: AnomaliaItem[]
  contexto?: {
    total:     number
    sla_pct:   number
    criticas:  number
    aging_med: number
  }
}

export interface AIAnomaliasData {
  ok:         boolean
  causa_raiz: string
  acoes:      string[]
  prioridade: 'alta' | 'média' | 'baixa'
  cached:     boolean
}

export function useAIAnomalias({
  picosDia        = [],
  bairrosAnomalia = [],
  equipesAnomalia = [],
  contexto,
}: AIAnomaliasInput = {}) {
  const payload = useMemo(() => ({
    picosDia,
    bairrosAnomalia,
    equipesAnomalia,
    contexto: contexto ?? {},
  }), // eslint-disable-next-line react-hooks/exhaustive-deps
  [
    picosDia.length, bairrosAnomalia.length, equipesAnomalia.length,
    contexto?.total, contexto?.sla_pct, contexto?.criticas,
  ])

  const total = picosDia.length + bairrosAnomalia.length + equipesAnomalia.length

  return useQuery<AIAnomaliasData>({
    queryKey:  ['ai-anomalias', payload],
    queryFn:   () => ai.anomalias(payload) as Promise<AIAnomaliasData>,
    staleTime: 5 * 60_000,
    gcTime:    10 * 60_000,
    retry:     false,
    enabled:   total > 0,
    select:    (data) => (data?.ok ? data : null) as AIAnomaliasData,
  })
}
