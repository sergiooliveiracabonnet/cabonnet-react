import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ai } from '../lib/api'

interface FornecedorRankItem {
  nome:         string
  score:        number
  sla:          number
  mttr:         number
  total:        number
  criticas:     number
  custo_por_os: number
}

interface AIFornecedorInput {
  fornecedores: FornecedorRankItem[]
}

export interface AIFornecedorRankItem {
  nome:          string
  tier:          'A' | 'B' | 'C'
  recomendacao:  'aumentar' | 'manter' | 'reduzir'
  motivo:        string
}

export interface AIFornecedorResult {
  ok?:       boolean
  narrativa?: string
  ranking?:  AIFornecedorRankItem[]
  cached?:   boolean
}

export function useAIFornecedor({ fornecedores }: AIFornecedorInput) {
  const payload = useMemo(
    () => ({ fornecedores }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(fornecedores)]
  )

  return useQuery({
    queryKey:  ['ai-fornecedor', payload],
    queryFn:   () => ai.fornecedorRec(payload),
    staleTime: 5 * 60_000,
    gcTime:    15 * 60_000,
    retry:     false,
    enabled:   fornecedores.length >= 2,
    select:    (data: unknown): AIFornecedorResult | null => {
      const d = data as { ok?: boolean } | null
      return d?.ok ? (d as AIFornecedorResult) : null
    },
  })
}
