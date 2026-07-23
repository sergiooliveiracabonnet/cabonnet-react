import { describe, it, expect } from 'vitest'
import {
  isRevisitaAtiva, filtrarRevisitasAtivas, filtrarRevisitaPorTipo, contarRevisitasPorTipo,
  revisitaPorCidade, clientesCronicos,
} from './revisitaPorTipo'
import type { BacklogRow } from '../../hooks/useBacklog'

function makeRow(overrides: Partial<BacklogRow> = {}): BacklogRow {
  return {
    nomecliente: 'CLIENTE TESTE', numos: '9000001', codigocliente: 'C1', codigocontrato: '100',
    servico: 'ASSISTENCIA TECNICA', tiposervico: 'MANUTENCAO', nomedacidade: 'TAUBATE', bairro: 'CENTRO',
    periodo: '2026-07', descsituacao: 'Concluída', nomedaequipe: 'F01', equipeexecutou: 'F01',
    datacadastro: '01/07/2026', dataagendamento: '02/07/2026', dataexecucao: '02/07/2026',
    horas_resolucao: 24, revisita_inst: 0, revisita_manut: 0, revisita_serv: 0,
    tempo_maior_24h: 0, tempo_maior_4h: 0, tempo_maior_3h: 0,
    ...overrides,
  }
}

describe('isRevisitaAtiva', () => {
  it('true quando qualquer flag está ativo', () => {
    expect(isRevisitaAtiva(makeRow({ revisita_manut: 1 }))).toBe(true)
  })
  it('false quando nenhum flag está ativo', () => {
    expect(isRevisitaAtiva(makeRow())).toBe(false)
  })
})

describe('filtrarRevisitasAtivas', () => {
  it('mantém só as linhas com algum flag ativo', () => {
    const rows = [makeRow({ numos: '1', revisita_inst: 1 }), makeRow({ numos: '2' })]
    expect(filtrarRevisitasAtivas(rows).map(r => r.numos)).toEqual(['1'])
  })
})

describe('filtrarRevisitaPorTipo', () => {
  it('filtra só o tipo pedido', () => {
    const rows = [
      makeRow({ numos: '1', revisita_inst: 1 }),
      makeRow({ numos: '2', revisita_manut: 1 }),
    ]
    expect(filtrarRevisitaPorTipo(rows, 'instalacao').map(r => r.numos)).toEqual(['1'])
    expect(filtrarRevisitaPorTipo(rows, 'manutencao').map(r => r.numos)).toEqual(['2'])
  })
})

describe('contarRevisitasPorTipo', () => {
  it('conta cada tipo independentemente', () => {
    const rows = [
      makeRow({ revisita_inst: 1 }),
      makeRow({ revisita_inst: 1 }),
      makeRow({ revisita_manut: 1 }),
      makeRow({ revisita_serv: 1 }),
    ]
    expect(contarRevisitasPorTipo(rows)).toEqual({ instalacao: 2, manutencao: 1, servico: 1 })
  })
})

describe('revisitaPorCidade', () => {
  it('calcula total e taxa por cidade pro tipo pedido', () => {
    const rows = [
      makeRow({ nomedacidade: 'TAUBATE', revisita_manut: 1 }),
      makeRow({ nomedacidade: 'TAUBATE' }),
      makeRow({ nomedacidade: 'CACAPAVA', revisita_manut: 1 }),
    ]
    const result = revisitaPorCidade(rows, 'manutencao')
    expect(result).toEqual(expect.arrayContaining([
      { cidade: 'TAUBATE',  rev: 1, total: 2, taxa: 50 },
      { cidade: 'CACAPAVA', rev: 1, total: 1, taxa: 100 },
    ]))
  })

  it('usa "Sem cidade" quando nomedacidade está vazio', () => {
    const result = revisitaPorCidade([makeRow({ nomedacidade: '', revisita_serv: 1 })], 'servico')
    expect(result[0].cidade).toBe('Sem cidade')
  })
})

describe('clientesCronicos', () => {
  it('só inclui clientes com 2 ou mais ocorrências', () => {
    const rows = [
      makeRow({ codigocliente: 'C1', nomecliente: 'JOAO' }),
      makeRow({ codigocliente: 'C1', nomecliente: 'JOAO' }),
      makeRow({ codigocliente: 'C2', nomecliente: 'MARIA' }),
    ]
    expect(clientesCronicos(rows)).toEqual([{ nome: 'JOAO', count: 2 }])
  })

  it('ordena do maior pro menor count', () => {
    const rows = [
      makeRow({ codigocliente: 'C1', nomecliente: 'A' }),
      makeRow({ codigocliente: 'C1', nomecliente: 'A' }),
      makeRow({ codigocliente: 'C2', nomecliente: 'B' }),
      makeRow({ codigocliente: 'C2', nomecliente: 'B' }),
      makeRow({ codigocliente: 'C2', nomecliente: 'B' }),
    ]
    const result = clientesCronicos(rows)
    expect(result[0]).toEqual({ nome: 'B', count: 3 })
    expect(result[1]).toEqual({ nome: 'A', count: 2 })
  })
})
