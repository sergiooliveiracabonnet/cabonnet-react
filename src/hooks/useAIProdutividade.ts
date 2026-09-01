import { ai } from '../lib/api'
import { useAIQuery } from './useAIQuery'

interface EquipeQueda {
  equipe:    string
  atual:     number
  anterior:  number
  delta_pct: number
}

interface AIProdutividadeInput {
  quedas:   EquipeQueda[]
  contexto: string
}

export interface AIAnaliseEquipe {
  equipe:        string
  causa:         string
  recomendacao:  string
}

export interface AIProdutividadeResult {
  ok?:       boolean
  analises?: AIAnaliseEquipe[]
  narrativa?: string
  cached?:   boolean
}

export function useAIProdutividade({ quedas, contexto, enabled = false }: AIProdutividadeInput & { enabled?: boolean }) {
  const payload = { quedas, contexto }
  return useAIQuery<AIProdutividadeResult>({
    key:     ['ai-produtividade', payload],
    fn:      () => ai.produtividade(payload),
    enabled: enabled && quedas.length > 0,
  })
}
