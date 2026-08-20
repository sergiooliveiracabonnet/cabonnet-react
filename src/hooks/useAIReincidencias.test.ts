import { describe, expect, it } from 'vitest'
import { mergeAIReincidenciaBatches, type AIReincidenciaAnalysis } from './useAIReincidencias'

const batch = (causa: string, count: number, narrativa: string): AIReincidenciaAnalysis => ({
  ok: true, cached: false, narrativa, analises: [], causas_distribuicao: [{ causa, count, pct: 100 }],
})

describe('mergeAIReincidenciaBatches', () => {
  it('consolida lotes sequenciais e recalcula os percentuais globais', () => {
    const result = mergeAIReincidenciaBatches([
      batch('Equipamento', 3, 'Lote um.'),
      batch('Configuração', 1, 'Lote dois.'),
    ])
    expect(result.narrativa).toBe('Lote um. Lote dois.')
    expect(result.causas_distribuicao).toEqual([
      { causa: 'Equipamento', count: 3, pct: 75 },
      { causa: 'Configuração', count: 1, pct: 25 },
    ])
  })
})
