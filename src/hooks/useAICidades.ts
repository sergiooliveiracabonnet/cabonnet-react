import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ai } from '../lib/api'

export interface CidadesCluster {
  bairro:   string
  cidade:   string
  count:    number
  tipos:    string[]
  sugestao: string
}

export interface AICidadesResult {
  ok:        boolean
  clusters:  CidadesCluster[]
  narrativa: string
  cached:    boolean
}

interface PendItem {
  numos:  string
  cidade: string
  bairro: string
  tipo:   string
  aging:  number
}

interface UseAICidadesInput {
  pendRows: PendItem[]
}

export function useAICidades({ pendRows, enabled = false }: UseAICidadesInput & { enabled?: boolean }) {
  const payload = useMemo(() => ({ pendentes: pendRows }), [pendRows])

  return useQuery<AICidadesResult>({
    queryKey:  ['ai-cidades-cluster', payload],
    queryFn:   () => ai.cidadesCluster(payload) as Promise<AICidadesResult>,
    staleTime: 3 * 60_000,
    gcTime:    15 * 60_000,
    retry:     false,
    enabled:   enabled && pendRows.length >= 5,
    select:    (data) => (data?.ok ? data : null) as AICidadesResult,
  })
}
