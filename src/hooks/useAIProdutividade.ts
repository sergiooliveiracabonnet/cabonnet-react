import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ai } from '../lib/api'

interface EquipeQueda {
  equipe:    string
  atual:     number
  anterior:  number
  delta_pct: number
}

interface AIProdutividadeInput {
  quedas:   EquipeQueda[]
  contexto: string
}

export interface AIAnaliseEquipe {
  equipe:        string
  causa:         string
  recomendacao:  string
}

export interface AIProdutividadeResult {
  ok?:       boolean
  analises?: AIAnaliseEquipe[]
  narrativa?: string
  cached?:   boolean
}

export function useAIProdutividade({ quedas, contexto }: AIProdutividadeInput) {
  const payload = useMemo(
    () => ({ quedas, contexto }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(quedas), contexto]
  )

  return useQuery({
    queryKey:  ['ai-produtividade', payload],
    queryFn:   () => ai.produtividade(payload),
    staleTime: 5 * 60_000,
    gcTime:    15 * 60_000,
    retry:     false,
    enabled:   quedas.length > 0,
    select:    (data: unknown): AIProdutividadeResult | null => {
      const d = data as { ok?: boolean } | null
      return d?.ok ? (d as AIProdutividadeResult) : null
    },
  })
}
