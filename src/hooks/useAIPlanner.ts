import { ai } from '../lib/api'
import { useAIQuery } from './useAIQuery'

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

export function useAIPlanner({ equipes, meta_diaria, dias, enabled = false }: UseAIPlannerInput & { enabled?: boolean }) {
  const totalSemana = equipes.reduce((s, e) => s + e.total_semana, 0)
  const payload = { equipes, meta_diaria, dias }
  return useAIQuery<AIPlannerResult>({
    key:     ['ai-planner', payload],
    fn:      () => ai.planner(payload),
    enabled: enabled && equipes.length >= 2 && totalSemana > 0,
  })
}
