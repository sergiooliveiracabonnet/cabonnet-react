import { describe, expect, it } from 'vitest'
import { buildRevisitReasonsSummary } from './revisitReasonsSummary'
import type { RevisitJourney } from '../../hooks/useRevisitJourneys'

function journey(os: string, observacao = ''): RevisitJourney {
  return {
    origin_os: null, revisit_os: os, recurrence: 1, link_basis: null,
    link_confidence: 'unlinked', days_between: null, same_team: null, origin: null,
    revisit: { numos: os, observacao, nomedacidade: 'Taubaté', equipeexecutou: 'F01' } as RevisitJourney['revisit'],
  }
}

describe('buildRevisitReasonsSummary', () => {
  it('fecha o total oficial sem duplicar OS entre categorias', () => {
    const result = buildRevisitReasonsSummary(
      [journey('1', 'trocado roteador'), journey('2', 'refeito conector'), journey('3')],
      [{ numos: '1', motivo: 'Execução / Técnico', ts: 1, nomedaequipe: 'F01', nomedacidade: 'Taubaté', origem: 'manual' }],
    )
    expect(result.total).toBe(3)
    expect(result.confirmed + result.probable + result.undetermined).toBe(3)
    expect(result.items.find(i => i.revisitOs === '1')?.level).toBe('confirmed')
    expect(result.items.find(i => i.revisitOs === '2')?.category).toBe('Conectorização/Sinal')
  })

  it('agrega categorias e preserva ocorrências de exemplo', () => {
    const result = buildRevisitReasonsSummary([journey('1', 'sinal baixo'), journey('2', 'potência fora')], [])
    expect(result.categories[0]).toMatchObject({ category: 'Conectorização/Sinal', count: 2, pct: 100 })
    expect(result.categories[0].occurrences).toHaveLength(2)
  })
})
