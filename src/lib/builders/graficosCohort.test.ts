import { describe, expect, it } from 'vitest'
import { buildCohortView } from './graficosCohort'

describe('buildCohortView', () => {
  it('calcula pendentes, taxas de mesmo mês e resumo ponderado', () => {
    const result = buildCohortView({
      labels: ['2026-06', '2026-07'], total: [10, 5], concluidas: [8, 2], mesmoMes: [6, 1], taxaResolucao: [80, 40], mttr: [3, 1],
    }, new Date(2026, 6, 26))
    expect(result.rows).toEqual([
      expect.objectContaining({ name: '2026-06', encerradas: 8, abertas: 2, mesmoMesPct: 60, emFormacao: false }),
      expect.objectContaining({ name: '2026-07', encerradas: 2, abertas: 3, mesmoMesPct: 20, emFormacao: true }),
    ])
    expect(result.summary).toEqual({ coortes: 2, total: 15, encerradas: 10, abertas: 5, taxa: 67, mesmoMesPct: 47 })
  })

  it('limita valores inconsistentes aos totais da coorte', () => {
    const result = buildCohortView({ labels: ['2026-01'], total: [2], concluidas: [5], mesmoMes: [4] })
    expect(result.rows[0]).toEqual(expect.objectContaining({ encerradas: 2, abertas: 0, mesmoMes: 2, taxa: 100, mesmoMesPct: 100 }))
  })
})
