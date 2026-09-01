import { describe, expect, it } from 'vitest'
import { indexarSlaAnterior, variacaoSla, rotuloVariacao } from './comparativo'

describe('indexarSlaAnterior', () => {
  it('indexa por fornKey', () => {
    const idx = indexarSlaAnterior([
      { fornKey: 'WES', sla: 80 },
      { fornKey: 'THM', sla: 91 },
    ])
    expect(idx).toEqual({ WES: 80, THM: 91 })
  })

  it('lista vazia devolve índice vazio, não quebra', () => {
    expect(indexarSlaAnterior([])).toEqual({})
  })
})

describe('variacaoSla', () => {
  it('calcula a diferença em pontos percentuais', () => {
    expect(variacaoSla(87, 79)).toBe(8)
    expect(variacaoSla(72, 80)).toBe(-8)
  })

  it('estável devolve zero, não null', () => {
    expect(variacaoSla(80, 80)).toBe(0)
  })

  // A regra que motivou o módulo: sem histórico não há variação nenhuma.
  it('fornecedor sem período anterior devolve null, não o próprio SLA', () => {
    expect(variacaoSla(87, undefined)).toBeNull()
  })

  it('SLA anterior de 0 é base válida — não confundir com ausência', () => {
    expect(variacaoSla(50, 0)).toBe(50)
  })
})

describe('rotuloVariacao', () => {
  it('positivo leva sinal explícito', () => {
    expect(rotuloVariacao(8)).toBe('+8')
  })

  it('negativo mantém o sinal', () => {
    expect(rotuloVariacao(-8)).toBe('-8')
  })

  it('zero vira "=" em vez de "+0"', () => {
    expect(rotuloVariacao(0)).toBe('=')
  })

  it('sem base não rotula nada', () => {
    expect(rotuloVariacao(null)).toBeNull()
  })
})
