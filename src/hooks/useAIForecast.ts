import { useMemo } from 'react'
import { ai } from '../lib/api'
import { useAIQuery } from './useAIQuery'
import { forecastDemand, type ForecastResult } from '../lib/forecast'
import type { EvolucaoData } from '../lib/types'

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

interface AINarrativaResponse { ok: boolean; narrativa: string; cached?: boolean }

// A projeção (tendência, 7 dias, pico) é calculada localmente por regressão
// linear + sazonalidade (src/lib/forecast.ts) — sempre disponível, sem custo de
// API. A IA (opt-in) só recebe esses números prontos e escreve a explicação;
// não gera nem recalcula a previsão.
export function useAIForecast({ evolucao, totalAtivo = 0, fila = 0, enabled = false }: UseAIForecastInput & { enabled?: boolean }) {
  const serie = useMemo(() => buildSerie(evolucao), [evolucao])
  const forecast = useMemo<ForecastResult | null>(() => forecastDemand(serie), [serie])

  const mediaDiaria = serie.length ? serie.reduce((a, p) => a + p.abertas, 0) / serie.length : 0
  const payload = {
    serie,
    contexto:      { total_ativo: totalAtivo, fila, media_diaria: mediaDiaria },
    tendencia:     forecast?.tendencia ?? 'estável',
    previsao:      forecast?.previsao ?? [],
    pico_previsto: forecast?.pico_previsto ?? null,
    r2:            forecast?.r2 ?? 0,
  }

  const { data, isFetching, isError } = useAIQuery<AINarrativaResponse>({
    key:       ['ai-forecast', payload],
    fn:        () => ai.forecast(payload),
    enabled:   enabled && !!forecast,
    staleTime: 60 * 60_000,
    gcTime:    2 * 60 * 60_000,
  })

  return {
    forecast,
    narrativa:  data?.narrativa ?? null,
    cached:     data?.cached ?? false,
    isFetching,
    isError,
  }
}
