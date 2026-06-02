import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ai } from '../lib/api'

export interface PlannerSugestao {
  equipe:  string
  acao:    string
  impacto: string
}

export interface AIPlannerResult {
  ok:        boolean
  narrativa: string
  sugestoes: PlannerSugestao[]
  cached:    boolean
}

interface EquipePlanner {
  nome:        string
  total_semana: number
  por_dia:     Record<string, number>
}

interface UseAIPlannerInput {
  equipes:      EquipePlanner[]
  meta_diaria:  number
  dias:         string[]
}

export function useAIPlanner({ equipes, meta_diaria, dias }: UseAIPlannerInput) {
  const totalSemana = useMemo(
    () => equipes.reduce((s, e) => s + e.total_semana, 0),
    [equipes],
  )

  const payload = useMemo(
    () => ({ equipes, meta_diaria, dias }),
    [equipes, meta_diaria, dias],
  )

  return useQuery<AIPlannerResult>({
    queryKey:  ['ai-planner', payload],
    queryFn:   () => ai.planner(payload) as Promise<AIPlannerResult>,
    staleTime: 5 * 60_000,
    gcTime:    15 * 60_000,
    retry:     false,
    enabled:   equipes.length >= 2 && totalSemana > 0,
    select:    (data) => (data?.ok ? data : null) as AIPlannerResult,
  })
}
