import { ai } from '../lib/api'
import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReincidenciaPair } from '../features/reincidencias/reincidenciasReport'

export interface AIReincidenciaAnalysis {
  ok?: boolean
  cached?: boolean
  narrativa: string
  analises: Array<{ par: number; numos_orig: string; numos_rev: string; causa: string; feito_primeira: string; o_que_faltou: string }>
  causas_distribuicao: Array<{ causa: string; count: number; pct: number }>
}

export function useAIReincidencias(pares: ReincidenciaPair[], enabled: boolean) {
  const batches = useMemo(() => {
    const result: ReincidenciaPair[][] = []
    for (let i = 0; i < pares.length; i += 25) result.push(pares.slice(i, i + 25))
    return result
  }, [pares])
  const queries = useQueries({
    queries: batches.map((batch, index) => ({
      queryKey: ['ai-reincidencias-relatorio', index, batch],
      queryFn: () => ai.revisitasCausa({ pares: batch }) as Promise<AIReincidenciaAnalysis>,
      enabled: enabled && batch.length > 0,
      staleTime: 10 * 60_000,
      retry: false,
    })),
  })
  const data = useMemo<AIReincidenciaAnalysis | null>(() => {
    const ready = queries.map(q => q.data).filter((item): item is AIReincidenciaAnalysis => !!item?.ok)
    if (!ready.length || ready.length !== batches.length) return null
    const causeCounts = new Map<string, number>()
    ready.flatMap(item => item.causas_distribuicao || []).forEach(c => causeCounts.set(c.causa, (causeCounts.get(c.causa) || 0) + c.count))
    const total = [...causeCounts.values()].reduce((sum, count) => sum + count, 0)
    return {
      ok: true,
      cached: ready.every(item => item.cached),
      narrativa: ready.map(item => item.narrativa).filter(Boolean).join(' '),
      analises: ready.flatMap(item => item.analises || []),
      causas_distribuicao: [...causeCounts].sort((a, b) => b[1] - a[1]).map(([causa, count]) => ({ causa, count, pct: total ? Math.round(count / total * 100) : 0 })),
    }
  }, [batches.length, queries])
  return {
    data,
    isFetching: queries.some(q => q.isFetching),
    isError: queries.some(q => q.isError),
  }
}
