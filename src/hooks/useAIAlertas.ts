import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ai } from '../lib/api'

interface AlertaItem {
  tipo:    string
  ref:     string
  nivel:   string
  titulo:  string
  msg:     string
}

interface AIAlertasInput {
  alertas:  AlertaItem[]
  contexto: {
    total:     number
    criticas:  number
    semEquipe: number
    aging:     number
  }
}

export interface AIAlertasResult {
  ok?:            boolean
  prioridade?:    string
  causa_raiz?:    string
  acao_imediata?: string
  insights?:      string[]
  cached?:        boolean
}

export function useAIAlertas({ alertas, contexto }: AIAlertasInput) {
  const payload = useMemo(
    () => ({ alertas, contexto }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(alertas), JSON.stringify(contexto)]
  )

  return useQuery({
    queryKey:  ['ai-alertas', payload],
    queryFn:   () => ai.alertas(payload),
    staleTime: 5 * 60_000,
    gcTime:    15 * 60_000,
    retry:     false,
    enabled:   alertas.length > 0,
    select:    (data: unknown): AIAlertasResult | null => {
      const d = data as { ok?: boolean } | null
      return d?.ok ? (d as AIAlertasResult) : null
    },
  })
}
