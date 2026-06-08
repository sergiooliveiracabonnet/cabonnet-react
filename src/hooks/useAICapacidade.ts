import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ai } from '../lib/api'

interface AICapacidadeInput {
  fila:           number
  ritmo_dia:      number
  meta_dia:       number
  dias_previstos: number | string
  equipes_ativas: number
  por_tipo:       Record<string, number>
}

export interface AICapacidadeResult {
  ok?:           boolean
  diagnostico?:  string
  projecao?:     string
  recomendacao?: string
  cached?:       boolean
}

export function useAICapacidade({
  fila,
  ritmo_dia,
  meta_dia,
  dias_previstos,
  equipes_ativas,
  por_tipo,
  enabled = false,
}: AICapacidadeInput & { enabled?: boolean }) {
  const payload = useMemo(
    () => ({ fila, ritmo_dia, meta_dia, dias_previstos, equipes_ativas, por_tipo }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fila, ritmo_dia, meta_dia, dias_previstos, equipes_ativas, JSON.stringify(por_tipo)]
  )

  return useQuery({
    queryKey:  ['ai-capacidade', payload],
    queryFn:   () => ai.capacidade(payload),
    staleTime: 5 * 60_000,
    gcTime:    15 * 60_000,
    retry:     false,
    enabled:   enabled && fila > 0,
    select:    (data: unknown): AICapacidadeResult | null => {
      const d = data as { ok?: boolean } | null
      return d?.ok ? (d as AICapacidadeResult) : null
    },
  })
}
