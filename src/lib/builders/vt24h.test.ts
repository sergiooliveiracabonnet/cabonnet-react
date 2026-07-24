import { describe, it, expect } from 'vitest'
import { buildVt24hStats } from './vt24h'
import { FILTROS_VAZIOS } from './biTecnicaFiltros'
import type { OSRow } from '../types'

function makeRow(overrides: Partial<OSRow> = {}): OSRow {
  return {
    numos: '9000001', datacadastro: '01/07/2026', dataexecucao: '02/07/2026',
    nomedacidade: 'TAUBATE', nomedaequipe: 'F01', _fornecedor: 'Instacable',
    _vtPrazoHoras: 24, _vtCumpridaNoPrazo: true, _vtViolado: false,
    ...overrides,
  } as OSRow
}

describe('buildVt24hStats', () => {
  it('conta executou prazo e fora do prazo separadamente', () => {
    const rows = [
      makeRow({ numos: '1', _vtCumpridaNoPrazo: true }),
      makeRow({ numos: '2', _vtCumpridaNoPrazo: false }),
      makeRow({ numos: '3', _vtCumpridaNoPrazo: true }),
    ]
    const stats = buildVt24hStats(rows, '2026-07-01', '2026-08-01')
    expect(stats.executouPrazo).toBe(2)
    expect(stats.executouForaPrazo).toBe(1)
    expect(stats.total).toBe(3)
    expect(stats.pctPrazo).toBe(67)
  })

  it('ignora OS que não são VT24H', () => {
    const rows = [
      makeRow({ numos: '1', _vtPrazoHoras: 8,    _vtCumpridaNoPrazo: true }),   // VT08H
      makeRow({ numos: '2', _vtPrazoHoras: 48,   _vtCumpridaNoPrazo: true }),   // VT48H
      makeRow({ numos: '3', _vtPrazoHoras: null, _vtCumpridaNoPrazo: null }),   // não-VT
    ]
    const stats = buildVt24hStats(rows, '2026-07-01', '2026-08-01')
    expect(stats.total).toBe(0)
  })

  it('ignora OS VT24H não executadas (_vtCumpridaNoPrazo null)', () => {
    const rows = [makeRow({ numos: '1', _vtCumpridaNoPrazo: null })]
    const stats = buildVt24hStats(rows, '2026-07-01', '2026-08-01')
    expect(stats.total).toBe(0)
  })

  it('bucketiza por dataexecucao dentro do período [inicio, fim)', () => {
    const rows = [
      makeRow({ numos: '1', dataexecucao: '30/06/2026', _vtCumpridaNoPrazo: true }),  // antes do período
      makeRow({ numos: '2', dataexecucao: '01/07/2026', _vtCumpridaNoPrazo: true }),  // dentro (início inclusivo)
      makeRow({ numos: '3', dataexecucao: '31/07/2026', _vtCumpridaNoPrazo: true }),  // dentro
      makeRow({ numos: '4', dataexecucao: '01/08/2026', _vtCumpridaNoPrazo: true }),  // fora (fim exclusivo)
    ]
    const stats = buildVt24hStats(rows, '2026-07-01', '2026-08-01')
    expect(stats.total).toBe(2)
  })

  it('retorna zeros quando não há OS VT24H no período', () => {
    expect(buildVt24hStats([], '2026-07-01', '2026-08-01')).toEqual({
      executouPrazo: 0, executouForaPrazo: 0, total: 0, pctPrazo: 0,
    })
  })

  it('sem filtros (default) conta todas as OS VT24H, igual a passar FILTROS_VAZIOS', () => {
    const rows = [
      makeRow({ numos: '1', nomedacidade: 'TAUBATE' }),
      makeRow({ numos: '2', nomedacidade: 'CACAPAVA' }),
    ]
    const semArg   = buildVt24hStats(rows, '2026-07-01', '2026-08-01')
    const comVazio = buildVt24hStats(rows, '2026-07-01', '2026-08-01', FILTROS_VAZIOS)
    expect(semArg).toEqual(comVazio)
    expect(semArg.total).toBe(2)
  })

  it('filtra por cidade', () => {
    const rows = [
      makeRow({ numos: '1', nomedacidade: 'TAUBATE' }),
      makeRow({ numos: '2', nomedacidade: 'CACAPAVA' }),
    ]
    const stats = buildVt24hStats(rows, '2026-07-01', '2026-08-01', { ...FILTROS_VAZIOS, cidade: 'TAUBATE' })
    expect(stats.total).toBe(1)
  })

  it('filtra por fornecedor (usa _fornecedor já pré-computado em OSRow)', () => {
    const rows = [
      makeRow({ numos: '1', _fornecedor: 'Instacable' as OSRow['_fornecedor'] }),
      makeRow({ numos: '2', _fornecedor: 'WES' as OSRow['_fornecedor'] }),
    ]
    const stats = buildVt24hStats(rows, '2026-07-01', '2026-08-01', { ...FILTROS_VAZIOS, fornecedor: 'WES' })
    expect(stats.total).toBe(1)
  })

  it('filtra por equipe', () => {
    const rows = [
      makeRow({ numos: '1', nomedaequipe: 'F01' }),
      makeRow({ numos: '2', nomedaequipe: 'F04' }),
    ]
    const stats = buildVt24hStats(rows, '2026-07-01', '2026-08-01', { ...FILTROS_VAZIOS, equipe: 'F04' })
    expect(stats.total).toBe(1)
  })

  it('combina os 3 filtros com E lógico, igual ao filtro do resto da aba Painel', () => {
    const rows = [
      makeRow({ numos: '1', nomedacidade: 'TAUBATE',  nomedaequipe: 'F01', _fornecedor: 'Instacable' as OSRow['_fornecedor'] }),
      makeRow({ numos: '2', nomedacidade: 'TAUBATE',  nomedaequipe: 'F08', _fornecedor: 'WES' as OSRow['_fornecedor'] }),
      makeRow({ numos: '3', nomedacidade: 'CACAPAVA', nomedaequipe: 'F01', _fornecedor: 'Instacable' as OSRow['_fornecedor'] }),
    ]
    const stats = buildVt24hStats(rows, '2026-07-01', '2026-08-01', { cidade: 'TAUBATE', fornecedor: 'Instacable', equipe: '' })
    expect(stats.total).toBe(1)
  })
})
