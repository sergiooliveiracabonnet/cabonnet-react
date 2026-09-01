import { describe, expect, it } from 'vitest'
import type { OSRow } from '../types'
import { buildAgingStatistics } from './graficosEstatistica'

const row = (aging: number | null, cidade = 'Taubaté', sla = false, status = 'Pendente') => ({
  _aging: aging,
  nomedacidade: cidade,
  descsituacao: status,
  _slaExcedido: sla,
}) as OSRow

describe('buildAgingStatistics', () => {
  it('calcula estatísticas apenas sobre OS ativas com aging válido', () => {
    const result = buildAgingStatistics([
      row(1), row(3), row(5, 'Caçapava', true), row(9, 'Caçapava', true), row(null), row(30, 'Taubaté', false, 'Concluída'),
    ])
    expect(result.summary).toEqual({ total: 4, media: 4.5, mediana: 4, p75: 6, maximo: 9, slaExcedido: 2, slaPct: 50 })
    expect(result.buckets.map(item => item.value)).toEqual([1, 1, 1, 1, 0])
  })

  it('ordena cidades pelo maior aging médio e informa a amostra', () => {
    const result = buildAgingStatistics([row(2, 'Taubaté'), row(4, 'Taubaté'), row(8, 'Caçapava')])
    expect(result.cidades).toEqual([
      { name: 'Caçapava', total: 1, media: 8, mediana: 8 },
      { name: 'Taubaté', total: 2, media: 3, mediana: 3 },
    ])
  })
})
