import { ai } from '../lib/api'
import { useAIQuery } from './useAIQuery'

interface AlertaItem {
  tipo:    string
  ref:     string
  nivel:   string
  titulo:  string
  msg:     string
}

interface AIAlertasInput {
  alertas:  AlertaItem[]
  contexto: {
    total:     number
    criticas:  number
    semEquipe: number
    aging:     number
  }
}

export interface AIAlertasResult {
  ok?:            boolean
  prioridade?:    string
  causa_raiz?:    string
  acao_imediata?: string
  insights?:      string[]
  cached?:        boolean
}

export function useAIAlertas({ alertas, contexto, enabled = false }: AIAlertasInput & { enabled?: boolean }) {
  const payload = { alertas, contexto }
  return useAIQuery<AIAlertasResult>({
    key:     ['ai-alertas', payload],
    fn:      () => ai.alertas(payload),
    enabled: enabled && alertas.length > 0,
  })
}
