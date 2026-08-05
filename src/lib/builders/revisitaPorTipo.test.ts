import { describe, it, expect } from 'vitest'
import {
  isRevisitaAtiva, filtrarRevisitasAtivas, filtrarRevisitaPorTipo, contarRevisitasPorTipo,
  revisitaPorCidade, clientesCronicos, contarTotalPorTipo,
} from './revisitaPorTipo'
import type { BacklogRow } from '../../hooks/useBacklog'

function makeRow(overrides: Partial<BacklogRow> = {}): BacklogRow {
  return {
    nomecliente: 'CLIENTE TESTE', numos: '9000001', codigocliente: 'C1', codigocontrato: '100',
    servico: 'ASSISTENCIA TECNICA', tiposervico: 'MANUTENCAO', nomedacidade: 'TAUBATE', bairro: 'CENTRO',
    periodo: '2026-07', descsituacao: 'Concluída', nomedaequipe: 'F01', equipeexecutou: 'F01',
    datacadastro: '01/07/2026', dataagendamento: '02/07/2026', dataexecucao: '02/07/2026',
    horas_resolucao: 24, recorrencia: 0, is_revisita: false,
    revisita_inst: 0, revisita_manut: 0, revisita_serv: 0,
    tempo_maior_24h: 0, tempo_maior_4h: 0, tempo_maior_3h: 0,
    ...overrides,
  }
}

describe('isRevisitaAtiva', () => {
  it('true quando a recorrência oficial é maior que zero', () => {
    expect(isRevisitaAtiva(makeRow({ recorrencia: 2, is_revisita: true }))).toBe(true)
  })
  it('false quando a recorrência oficial é zero', () => {
    expect(isRevisitaAtiva(makeRow())).toBe(false)
  })
})

describe('filtrarRevisitasAtivas', () => {
  it('mantém só as linhas com recorrência oficial maior que zero', () => {
    const rows = [makeRow({ numos: '1', recorrencia: 1 }), makeRow({ numos: '2' })]
    expect(filtrarRevisitasAtivas(rows).map(r => r.numos)).toEqual(['1'])
  })
})

describe('filtrarRevisitaPorTipo', () => {
  it('filtra só o tipo pedido', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'MANUTENCAO', recorrencia: 1, revisita_inst: 1 }),
      makeRow({ numos: '2', recorrencia: 1, revisita_manut: 1 }),
    ]
    expect(filtrarRevisitaPorTipo(rows, 'instalacao').map(r => r.numos)).toEqual(['1'])
    expect(filtrarRevisitaPorTipo(rows, 'manutencao').map(r => r.numos)).toEqual(['2'])
  })
})

describe('contarRevisitasPorTipo', () => {
  it('conta cada tipo independentemente', () => {
    const rows = [
      makeRow({ recorrencia: 1, revisita_inst: 1 }),
      makeRow({ recorrencia: 2, revisita_inst: 1 }),
      makeRow({ recorrencia: 1, revisita_manut: 1 }),
      makeRow({ recorrencia: 1, revisita_serv: 1 }),
    ]
    expect(contarRevisitasPorTipo(rows)).toEqual({ instalacao: 2, manutencao: 1, servico: 1 })
  })
})

describe('revisitaPorCidade', () => {
  it('calcula total e taxa por cidade pro tipo pedido', () => {
    const rows = [
      makeRow({ nomedacidade: 'TAUBATE', recorrencia: 1, revisita_manut: 1 }),
      makeRow({ nomedacidade: 'TAUBATE' }),
      makeRow({ nomedacidade: 'CACAPAVA', recorrencia: 1, revisita_manut: 1 }),
    ]
    const result = revisitaPorCidade(rows, 'manutencao')
    expect(result).toEqual(expect.arrayContaining([
      { cidade: 'TAUBATE',  rev: 1, total: 2, taxa: 50 },
      { cidade: 'CACAPAVA', rev: 1, total: 1, taxa: 100 },
    ]))
  })

  it('usa "Sem cidade" quando nomedacidade está vazio', () => {
    const result = revisitaPorCidade([
      makeRow({ nomedacidade: '', tiposervico: 'SERVICOS', nomedaequipe: 'F09', recorrencia: 1, revisita_serv: 1 }),
    ], 'servico')
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

describe('base das taxas por tipo', () => {
  // O backend marca revisita_inst na OS de RETORNO (quase sempre um VT de
  // manutenção), não na instalação que a originou. A base da taxa continua
  // sendo o total de instalações — são universos diferentes de propósito.
  it('usa somente instalacoes como base da revisita de instalacao', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'INSTALACAO', nomedaequipe: 'F08' }),
      makeRow({ numos: '2', tiposervico: 'INSTALACAO', nomedaequipe: 'F11' }),
      makeRow({ numos: '3', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', recorrencia: 1, revisita_inst: 1 }),
    ]
    expect(contarTotalPorTipo(rows, 'instalacao')).toBe(2)
    expect(revisitaPorCidade(rows, 'instalacao')).toEqual([
      { cidade: 'TAUBATE', rev: 1, total: 2, taxa: 50 },
    ])
  })

  it('soma por cidade bate com o total do KPI, sem depender do tipo da OS de retorno', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'INSTALACAO', nomedaequipe: 'F08', nomedacidade: 'TAUBATE' }),
      makeRow({ numos: '2', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', nomedacidade: 'TAUBATE',
                recorrencia: 1, revisita_inst: 1 }),
      makeRow({ numos: '3', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', nomedacidade: 'CACAPAVA',
                recorrencia: 2, revisita_inst: 1 }),
    ]
    const somaCidades = revisitaPorCidade(rows, 'instalacao').reduce((acc, c) => acc + c.rev, 0)
    expect(somaCidades).toBe(filtrarRevisitaPorTipo(rows, 'instalacao').length)
    expect(somaCidades).toBe(2)
  })

  it('não divide por zero quando a cidade só tem retorno e nenhuma OS da base', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', nomedacidade: 'CACAPAVA',
                recorrencia: 1, revisita_inst: 1 }),
    ]
    expect(revisitaPorCidade(rows, 'instalacao')).toEqual([
      { cidade: 'CACAPAVA', rev: 1, total: 0, taxa: 0 },
    ])
  })
})
