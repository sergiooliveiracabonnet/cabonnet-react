import { describe, expect, it } from 'vitest'
import { inferRevisitCause } from './revisitCause'

describe('inferRevisitCause', () => {
  it('prioriza motivo confirmado manualmente', () => {
    const result = inferRevisitCause({ manualReason: 'Equipamento com defeito', texts: ['sinal baixo'] })
    expect(result.level).toBe('confirmed')
    expect(result.category).toBe('Equipamento com defeito')
  })

  it('classifica sinal com evidência textual rastreável', () => {
    const result = inferRevisitCause({ texts: ['Refeito conector e normalizado sinal da fibra'] })
    expect(result.category).toBe('Conectorização/Sinal')
    expect(result.level).toBe('probable')
    expect(result.evidence[0]).toContain('conector')
  })

  it('não inventa causa quando faltam evidências', () => {
    expect(inferRevisitCause({ texts: [] })).toEqual({
      category: 'Sem informação', level: 'undetermined', confidence: 0, evidence: [],
    })
  })
})
