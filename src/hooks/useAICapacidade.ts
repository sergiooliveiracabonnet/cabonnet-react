import { ai } from '../lib/api'
import { useAIQuery } from './useAIQuery'

interface AICapacidadeInput {
  fila:           number
  ritmo_dia:      number
  meta_dia:       number
  dias_previstos: number | string
  equipes_ativas: number
  por_tipo:       Record<string, number>
}

export interface AICapacidadeResult {
  ok?:           boolean
  diagnostico?:  string
  projecao?:     string
  recomendacao?: string
  cached?:       boolean
}

export function useAICapacidade({
  fila,
  ritmo_dia,
  meta_dia,
  dias_previstos,
  equipes_ativas,
  por_tipo,
  enabled = false,
}: AICapacidadeInput & { enabled?: boolean }) {
  const payload = { fila, ritmo_dia, meta_dia, dias_previstos, equipes_ativas, por_tipo }
  return useAIQuery<AICapacidadeResult>({
    key:     ['ai-capacidade', payload],
    fn:      () => ai.capacidade(payload),
    enabled: enabled && fila > 0,
  })
}
