import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ai } from '../lib/api'

export interface JuniperSemOS {
  nome:   string
  cidade: string
  alerta: string
}

export interface AIJuniperResult {
  ok:        boolean
  sem_os:    JuniperSemOS[]
  narrativa: string
  cached:    boolean
}

interface ClienteInativo {
  nome:   string
  cidade: string
}

interface OSAtiva {
  numos:  string
  cidade: string
  tipo:   string
}

interface UseAIJuniperInput {
  inativos: ClienteInativo[]
  os_ativas: OSAtiva[]
}

export function useAIJuniper({ inativos, os_ativas }: UseAIJuniperInput) {
  const payload = useMemo(() => ({ inativos, os_ativas }), [inativos, os_ativas])

  return useQuery<AIJuniperResult>({
    queryKey:  ['ai-juniper-correlacao', payload],
    queryFn:   () => ai.juniperCorrelacao(payload) as Promise<AIJuniperResult>,
    staleTime: 5 * 60_000,
    gcTime:    15 * 60_000,
    retry:     false,
    enabled:   inativos.length > 0,
    select:    (data) => (data?.ok ? data : null) as AIJuniperResult,
  })
}
