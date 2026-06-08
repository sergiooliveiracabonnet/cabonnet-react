import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ai } from '../lib/api'

export type Urgencia = 'critica' | 'alta' | 'normal'

export interface ProximaOSItem {
  numos:    string
  motivo:   string
  urgencia: Urgencia
}

export interface AIProximaOSResult {
  ok:        boolean
  proximas:  ProximaOSItem[]
  narrativa: string
  cached:    boolean
}

interface FilaItem {
  numos:      string
  tipo:       string
  cidade:     string
  bairro:     string
  aging:      number
  sla_risco:  number
  equipe:     string
}

interface UseAIProximaOSInput {
  fila: FilaItem[]
  n?:   number
}

export function useAIProximaOS({ fila, n = 3, enabled = false }: UseAIProximaOSInput & { enabled?: boolean }) {
  const payload = useMemo(() => ({ fila, n }), [fila, n])

  return useQuery<AIProximaOSResult>({
    queryKey:  ['ai-proxima-os', payload],
    queryFn:   () => ai.proximaOs(payload) as Promise<AIProximaOSResult>,
    staleTime: 2 * 60_000,
    gcTime:    10 * 60_000,
    retry:     false,
    enabled:   enabled && fila.length >= 3,
    select:    (data) => (data?.ok ? data : null) as AIProximaOSResult,
  })
}
