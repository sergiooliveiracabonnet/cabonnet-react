import { ai } from '../lib/api'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReincidenciaPair } from '../features/reincidencias/reincidenciasReport'

export interface AIReincidenciaAnalysis {
  ok?: boolean
  cached?: boolean
  narrativa: string
  analises: Array<{ par: number; numos_orig: string; numos_rev: string; causa: string; feito_primeira: string; o_que_faltou: string }>
  causas_distribuicao: Array<{ causa: string; count: number; pct: number }>
}

export function mergeAIReincidenciaBatches(items: AIReincidenciaAnalysis[]): AIReincidenciaAnalysis {
  const causeCounts = new Map<string, number>()
  items.flatMap(item => item.causas_distribuicao || []).forEach(c => causeCounts.set(c.causa, (causeCounts.get(c.causa) || 0) + c.count))
  const total = [...causeCounts.values()].reduce((sum, count) => sum + count, 0)
  return {
    ok: true,
    cached: items.every(item => item.cached),
    narrativa: items.map(item => item.narrativa).filter(Boolean).join(' '),
    analises: items.flatMap(item => item.analises || []),
    causas_distribuicao: [...causeCounts].sort((a, b) => b[1] - a[1]).map(([causa, count]) => ({ causa, count, pct: total ? Math.round(count / total * 100) : 0 })),
  }
}

export function useAIReincidencias(pares: ReincidenciaPair[], enabled: boolean) {
  const batches = useMemo(() => {
    const result: ReincidenciaPair[][] = []
    // Dez pares mantêm a resposta JSON dentro do limite de tokens do endpoint.
    for (let i = 0; i < pares.length; i += 10) result.push(pares.slice(i, i + 10))
    return result
  }, [pares])
  const query = useQuery({
    queryKey: ['ai-reincidencias-relatorio', batches],
    queryFn: async () => {
      const results: AIReincidenciaAnalysis[] = []
      // Sequencial de propósito: evita bloquear o backend e atingir rate limit.
      for (const batch of batches) {
        results.push(await ai.revisitasCausa({ pares: batch }) as AIReincidenciaAnalysis)
      }
      return mergeAIReincidenciaBatches(results)
    },
    enabled: enabled && batches.length > 0,
    staleTime: 10 * 60_000,
    retry: false,
  })
  return {
    data: query.data ?? null,
    isFetching: query.isFetching,
    isError: query.isError,
    errorMessage: query.error?.message ?? null,
  }
}
