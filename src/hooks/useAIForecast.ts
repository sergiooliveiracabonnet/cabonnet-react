import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ai } from '../lib/api'
import type { EvolucaoData } from '../lib/types'

export interface ForecastDay {
  data:      string
  volume:    number
  confianca: 'alta' | 'media' | 'baixa'
}

export interface AIForecastData {
  ok:            boolean
  tendencia:     'crescente' | 'estável' | 'decrescente'
  narrativa:     string
  previsao:      ForecastDay[]
  pico_previsto: { data: string; volume: number } | null
  cached:        boolean
}

interface UseAIForecastInput {
  evolucao:    EvolucaoData
  totalAtivo?: number
  fila?:       number
}

function buildSerie(evolucao: EvolucaoData) {
  return (evolucao.labels ?? []).map((data, i) => ({
    data,
    abertas:    evolucao.abertas[i]    ?? 0,
    concluidas: evolucao.concluidas[i] ?? 0,
  }))
}

export function useAIForecast({ evolucao, totalAtivo = 0, fila = 0 }: UseAIForecastInput) {
  // Stable key from label list content — avoids rebuilding serie on unrelated re-renders
  const evolucaoKey = evolucao.labels.join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const serie = useMemo(() => buildSerie(evolucao), [evolucaoKey])

  const mediaDiaria = useMemo(() => {
    if (!serie.length) return 0
    const sum = serie.reduce((a, p) => a + p.abertas, 0)
    return sum / serie.length
  }, [serie])

  const payload = useMemo(() => ({
    serie,
    contexto: { total_ativo: totalAtivo, fila, media_diaria: mediaDiaria },
  }), [serie, totalAtivo, fila, mediaDiaria])

  return useQuery<AIForecastData>({
    queryKey:  ['ai-forecast', payload],
    queryFn:   () => ai.forecast(payload) as Promise<AIForecastData>,
    staleTime: 60 * 60_000,
    gcTime:    2 * 60 * 60_000,
    retry:     false,
    enabled:   serie.length >= 7,
    select:    (data) => (data?.ok ? data : null) as AIForecastData,
  })
}
