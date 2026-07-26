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

interface ConexaoAtiva {
  nome:   string
  cidade: string
}

interface OSAtiva {
  numos:  string
  cidade: string
  tipo:   string
}

interface UseAIJuniperInput {
  conexoes_ativas: ConexaoAtiva[]
  os_ativas: OSAtiva[]
}

export function useAIJuniper({ conexoes_ativas, os_ativas, enabled = false }: UseAIJuniperInput & { enabled?: boolean }) {
  const payload = { conexoes_ativas, os_ativas }
  return useAIQuery<AIJuniperResult>({
    key:     ['ai-juniper-correlacao', payload],
    fn:      () => ai.juniperCorrelacao(payload),
    enabled: enabled && conexoes_ativas.length > 0,
  })
}
