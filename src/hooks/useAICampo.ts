import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ai } from '../lib/api'

interface FornecedorItem {
  nome:     string
  fila:     number
  ritmo:    number
  sla_pct:  number
  criticas: number
}

interface AICAMPOInput {
  fornecedores: FornecedorItem[]
  meta_sla:     number
}

export interface AIAnaliseFornecedor {
  nome:      string
  status:    'ok' | 'risco' | 'critico'
  narrativa: string
  risco:     string
}

export interface AICampoResult {
  ok?:           boolean
  analises?:     AIAnaliseFornecedor[]
  recomendacao?: string
  cached?:       boolean
}

export function useAICampo({ fornecedores, meta_sla, enabled = false }: AICAMPOInput & { enabled?: boolean }) {
  const payload = useMemo(
    () => ({ fornecedores, meta_sla }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(fornecedores), meta_sla]
  )

  return useQuery({
    queryKey:  ['ai-campo', payload],
    queryFn:   () => ai.campoPrevisao(payload),
    staleTime: 5 * 60_000,
    gcTime:    15 * 60_000,
    retry:     false,
    enabled:   enabled && fornecedores.length > 0,
    select:    (data: unknown): AICampoResult | null => {
      const d = data as { ok?: boolean } | null
      return d?.ok ? (d as AICampoResult) : null
    },
  })
}
