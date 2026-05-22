import { useQuery } from '@tanstack/react-query'
import { api, endpoints } from '../lib/api'

export interface StatsFila {
  pendente:        number
  atendimento:     number
  total:           number
  rede:            number
  criticas:        number
  sem_equipe:      number
  sem_agendamento: number
  sla_pct:         number
  aging_med:       number
  aging_dist: {
    le1d:   number
    d2a3:   number
    d4a7:   number
    d8mais: number
  }
}

export interface StatsData {
  ts:     number
  cached: boolean
  fila:   StatsFila
  por_cidade: { cidade: string; pendente: number; atendimento: number; criticas: number }[]
  por_tipo:   { tipo: string; n: number; sla_exc: number }[]
}

export function useStats() {
  return useQuery<StatsData>({
    queryKey:  ['stats'],
    queryFn:   () => api.get<StatsData>(endpoints.stats),
    staleTime: 30_000,
    gcTime:    5 * 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
}
