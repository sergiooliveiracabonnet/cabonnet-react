import { describe, expect, it } from 'vitest'
import { buildTendenciaSummary } from './graficosTendencia'

describe('buildTendenciaSummary', () => {
  it('resume o fluxo e calcula saldo concluídas menos abertas', () => {
    expect(buildTendenciaSummary({
      labels: ['2026-07-24', '2026-07-25'],
      abertas: [5, 3],
      concluidas: [2, 7],
    })).toEqual({
      abertas: 8,
      concluidas: 9,
      saldo: 1,
      mediaAbertas: 4,
      pico: { data: '2026-07-24', valor: 5 },
      dias: 2,
    })
  })

  it('trata série vazia sem produzir valores inválidos', () => {
    expect(buildTendenciaSummary(undefined)).toEqual({
      abertas: 0,
      concluidas: 0,
      saldo: 0,
      mediaAbertas: 0,
      pico: null,
      dias: 0,
    })
  })
})
