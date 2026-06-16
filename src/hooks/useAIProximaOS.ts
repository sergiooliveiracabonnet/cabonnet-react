import { ai } from '../lib/api'
import { useAIQuery } from './useAIQuery'

export type Urgencia = 'critica' | 'alta' | 'normal'

export interface ProximaOSItem {
  numos:    string
  motivo:   string
  urgencia: Urgencia
}

export interface AIProximaOSResult {
  ok:        boolean
  proximas:  ProximaOSItem[]
  narrativa: string
  cached:    boolean
}

interface FilaItem {
  numos:      string
  tipo:       string
  cidade:     string
  bairro:     string
  aging:      number
  sla_risco:  number
  equipe:     string
}

interface UseAIProximaOSInput {
  fila: FilaItem[]
  n?:   number
}

export function useAIProximaOS({ fila, n = 3, enabled = false }: UseAIProximaOSInput & { enabled?: boolean }) {
  const payload = { fila, n }
  return useAIQuery<AIProximaOSResult>({
    key:       ['ai-proxima-os', payload],
    fn:        () => ai.proximaOs(payload),
    enabled:   enabled && fila.length >= 3,
    staleTime: 2 * 60_000,
    gcTime:    10 * 60_000,
  })
}
