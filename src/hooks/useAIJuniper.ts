import { ai } from '../lib/api'
import { useAIQuery } from './useAIQuery'

export interface JuniperSemOS {
  nome:   string
  cidade: string
  alerta: string
}

export interface AIJuniperResult {
  ok:        boolean
  sem_os:    JuniperSemOS[]
  narrativa: string
  cached:    boolean
}

interface ClienteInativo {
  nome:   string
  cidade: string
}

interface OSAtiva {
  numos:  string
  cidade: string
  tipo:   string
}

interface UseAIJuniperInput {
  inativos: ClienteInativo[]
  os_ativas: OSAtiva[]
}

export function useAIJuniper({ inativos, os_ativas, enabled = false }: UseAIJuniperInput & { enabled?: boolean }) {
  const payload = { inativos, os_ativas }
  return useAIQuery<AIJuniperResult>({
    key:     ['ai-juniper-correlacao', payload],
    fn:      () => ai.juniperCorrelacao(payload),
    enabled: enabled && inativos.length > 0,
  })
}
