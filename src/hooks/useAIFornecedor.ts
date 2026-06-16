import { ai } from '../lib/api'
import { useAIQuery } from './useAIQuery'

interface FornecedorRankItem {
  nome:         string
  score:        number
  sla:          number
  mttr:         number
  total:        number
  criticas:     number
  custo_por_os: number
}

interface AIFornecedorInput {
  fornecedores: FornecedorRankItem[]
}

export interface AIFornecedorRankItem {
  nome:          string
  tier:          'A' | 'B' | 'C'
  recomendacao:  'aumentar' | 'manter' | 'reduzir'
  motivo:        string
}

export interface AIFornecedorResult {
  ok?:       boolean
  narrativa?: string
  ranking?:  AIFornecedorRankItem[]
  cached?:   boolean
}

export function useAIFornecedor({ fornecedores, enabled = false }: AIFornecedorInput & { enabled?: boolean }) {
  const payload = { fornecedores }
  return useAIQuery<AIFornecedorResult>({
    key:     ['ai-fornecedor', payload],
    fn:      () => ai.fornecedorRec(payload),
    enabled: enabled && fornecedores.length >= 2,
  })
}
