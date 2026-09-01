import { describe, expect, it } from 'vitest'
import { buildDistribuicaoSummary, sortDistribution } from './graficosDistribuicao'

describe('sortDistribution', () => {
  it('ordena por volume e calcula percentual da amostra', () => {
    expect(sortDistribution({ labels: ['B', 'A'], values: [2, 8] })).toEqual([
      { name: 'A', value: 8, pct: 80 },
      { name: 'B', value: 2, pct: 20 },
    ])
  })
})

describe('buildDistribuicaoSummary', () => {
  it('resume as dimensões predominantes sem inventar eficiência', () => {
    const result = buildDistribuicaoSummary(10, {
      status: { labels: ['Pendente', 'Atendimento'], values: [6, 4] },
      tipo: { labels: ['Instalação', 'Manutenção'], values: [3, 7] },
      cidade: { labels: ['Taubaté', 'Caçapava'], values: [8, 2] },
    })
    expect(result).toEqual({
      total: 10,
      status: { name: 'Pendente', value: 6, pct: 60 },
      categoria: { name: 'Manutenção', value: 7, pct: 70 },
      cidade: { name: 'Taubaté', value: 8, pct: 80 },
    })
  })
})
