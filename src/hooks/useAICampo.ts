import { ai } from '../lib/api'
import { useAIQuery } from './useAIQuery'

interface FornecedorItem {
  nome:     string
  fila:     number
  ritmo:    number
  sla_pct:  number
  criticas: number
}

interface AICAMPOInput {
  fornecedores: FornecedorItem[]
  meta_sla:     number
}

export interface AIAnaliseFornecedor {
  nome:      string
  status:    'ok' | 'risco' | 'critico'
  narrativa: string
  risco:     string
}

export interface AICampoResult {
  ok?:           boolean
  analises?:     AIAnaliseFornecedor[]
  recomendacao?: string
  cached?:       boolean
}

export function useAICampo({ fornecedores, meta_sla, enabled = false }: AICAMPOInput & { enabled?: boolean }) {
  const payload = { fornecedores, meta_sla }
  return useAIQuery<AICampoResult>({
    key:     ['ai-campo', payload],
    fn:      () => ai.campoPrevisao(payload),
    enabled: enabled && fornecedores.length > 0,
  })
}
