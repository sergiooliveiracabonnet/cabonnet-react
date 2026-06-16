import { ai } from '../lib/api'
import { useAIQuery } from './useAIQuery'

interface AnomaliaItem {
  zScore: number
  [key: string]: unknown
}

interface AIAnomaliasInput {
  picosDia?:        AnomaliaItem[]
  bairrosAnomalia?: AnomaliaItem[]
  equipesAnomalia?: AnomaliaItem[]
  contexto?: {
    total:     number
    sla_pct:   number
    criticas:  number
    aging_med: number
  }
}

export interface AIAnomaliasData {
  ok:         boolean
  causa_raiz: string
  acoes:      string[]
  prioridade: 'alta' | 'média' | 'baixa'
  cached:     boolean
}

export function useAIAnomalias({
  picosDia        = [],
  bairrosAnomalia = [],
  equipesAnomalia = [],
  contexto,
  enabled         = false,
}: AIAnomaliasInput & { enabled?: boolean } = {}) {
  const payload = { picosDia, bairrosAnomalia, equipesAnomalia, contexto: contexto ?? {} }
  const total = picosDia.length + bairrosAnomalia.length + equipesAnomalia.length

  return useAIQuery<AIAnomaliasData>({
    key:     ['ai-anomalias', payload],
    fn:      () => ai.anomalias(payload),
    enabled: enabled && total > 0,
    gcTime:  10 * 60_000,
  })
}
