import { ai } from '../lib/api'
import { useAIQuery } from './useAIQuery'

export interface CidadesCluster {
  bairro:   string
  cidade:   string
  count:    number
  tipos:    string[]
  sugestao: string
}

export interface AICidadesResult {
  ok:        boolean
  clusters:  CidadesCluster[]
  narrativa: string
  cached:    boolean
}

interface PendItem {
  numos:  string
  cidade: string
  bairro: string
  tipo:   string
  aging:  number
}

interface UseAICidadesInput {
  pendRows: PendItem[]
}

export function useAICidades({ pendRows, enabled = false }: UseAICidadesInput & { enabled?: boolean }) {
  const payload = { pendentes: pendRows }
  return useAIQuery<AICidadesResult>({
    key:       ['ai-cidades-cluster', payload],
    fn:        () => ai.cidadesCluster(payload),
    enabled:   enabled && pendRows.length >= 5,
    staleTime: 3 * 60_000,
  })
}
