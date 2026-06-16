import { ai } from '../lib/api'
import { useAIQuery } from './useAIQuery'
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

export function useAIForecast({ evolucao, totalAtivo = 0, fila = 0, enabled = false }: UseAIForecastInput & { enabled?: boolean }) {
  const serie = buildSerie(evolucao)
  const mediaDiaria = serie.length ? serie.reduce((a, p) => a + p.abertas, 0) / serie.length : 0
  const payload = {
    serie,
    contexto: { total_ativo: totalAtivo, fila, media_diaria: mediaDiaria },
  }

  return useAIQuery<AIForecastData>({
    key:       ['ai-forecast', payload],
    fn:        () => ai.forecast(payload),
    enabled:   enabled && serie.length >= 7,
    staleTime: 60 * 60_000,
    gcTime:    2 * 60 * 60_000,
  })
}
