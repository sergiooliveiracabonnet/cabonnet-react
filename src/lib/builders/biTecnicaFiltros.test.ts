import { describe, it, expect } from 'vitest'
import {
  FILTROS_VAZIOS, opcoesCidade, opcoesFornecedor, opcoesEquipe, filtrarBacklogRows,
} from './biTecnicaFiltros'
import type { BacklogData, BacklogRow } from '../../hooks/useBacklog'

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

function makeData(rows: BacklogRow[]): BacklogData {
  return {
    rows,
    kpis: { total: rows.length, rev_inst: 0, rev_manut: 0, rev_serv: 0, violacoes_24h: 0, violacoes_4h: 0, violacoes_3h: 0 },
    por_equipe: [], por_cidade: [], por_tipo: [],
    n: rows.length, periodo: '2026-07-01', fim: '2026-08-01',
  }
}

describe('opcoesCidade', () => {
  it('retorna cidades distintas ordenadas', () => {
    const rows = [
      makeRow({ nomedacidade: 'TAUBATE' }),
      makeRow({ nomedacidade: 'CACAPAVA' }),
      makeRow({ nomedacidade: 'TAUBATE' }),
    ]
    expect(opcoesCidade(rows)).toEqual(['CACAPAVA', 'TAUBATE'])
  })
})

describe('opcoesFornecedor', () => {
  it('deriva fornecedor via getFornecedor e retorna distintos ordenados', () => {
    const rows = [
      makeRow({ nomedaequipe: 'F01' }),   // Instacable (INST_CODES)
      makeRow({ nomedaequipe: 'F08' }),   // WES (WES_CODES)
      makeRow({ nomedaequipe: 'F01' }),
    ]
    expect(opcoesFornecedor(rows)).toEqual(['Instacable', 'WES'])
  })
})

describe('opcoesEquipe', () => {
  it('retorna equipes distintas ordenadas', () => {
    const rows = [
      makeRow({ nomedaequipe: 'F04' }),
      makeRow({ nomedaequipe: 'F01' }),
      makeRow({ nomedaequipe: 'F04' }),
    ]
    expect(opcoesEquipe(rows)).toEqual(['F01', 'F04'])
  })
})

describe('filtrarBacklogRows', () => {
  it('sem filtros retorna tudo, mesmo total', () => {
    const data = makeData([makeRow({ numos: '1' }), makeRow({ numos: '2' })])
    const result = filtrarBacklogRows(data, FILTROS_VAZIOS)
    expect(result.rows).toHaveLength(2)
    expect(result.kpis.total).toBe(2)
  })

  it('filtra por cidade', () => {
    const data = makeData([
      makeRow({ numos: '1', nomedacidade: 'TAUBATE' }),
      makeRow({ numos: '2', nomedacidade: 'CACAPAVA' }),
    ])
    const result = filtrarBacklogRows(data, { ...FILTROS_VAZIOS, cidade: 'TAUBATE' })
    expect(result.rows.map(r => r.numos)).toEqual(['1'])
    expect(result.kpis.total).toBe(1)
  })

  it('filtra por fornecedor (derivado de nomedaequipe)', () => {
    const data = makeData([
      makeRow({ numos: '1', nomedaequipe: 'F01' }),  // Instacable
      makeRow({ numos: '2', nomedaequipe: 'F08' }),  // WES
    ])
    const result = filtrarBacklogRows(data, { ...FILTROS_VAZIOS, fornecedor: 'WES' })
    expect(result.rows.map(r => r.numos)).toEqual(['2'])
  })

  it('filtra por equipe', () => {
    const data = makeData([
      makeRow({ numos: '1', nomedaequipe: 'F01' }),
      makeRow({ numos: '2', nomedaequipe: 'F04' }),
    ])
    const result = filtrarBacklogRows(data, { ...FILTROS_VAZIOS, equipe: 'F04' })
    expect(result.rows.map(r => r.numos)).toEqual(['2'])
  })

  it('combina os 3 filtros com E lógico', () => {
    const data = makeData([
      makeRow({ numos: '1', nomedacidade: 'TAUBATE',  nomedaequipe: 'F01' }),
      makeRow({ numos: '2', nomedacidade: 'TAUBATE',  nomedaequipe: 'F08' }),
      makeRow({ numos: '3', nomedacidade: 'CACAPAVA', nomedaequipe: 'F01' }),
    ])
    const result = filtrarBacklogRows(data, { cidade: 'TAUBATE', fornecedor: 'Instacable', equipe: '' })
    expect(result.rows.map(r => r.numos)).toEqual(['1'])
  })

  it('não muta o objeto data original', () => {
    const data = makeData([makeRow({ numos: '1', nomedacidade: 'TAUBATE' })])
    const originalRowsRef = data.rows
    filtrarBacklogRows(data, { ...FILTROS_VAZIOS, cidade: 'CACAPAVA' })
    expect(data.rows).toBe(originalRowsRef)
    expect(data.kpis.total).toBe(1)
  })

  it('preserva demais campos de kpis sem alteração', () => {
    const data = makeData([makeRow({ numos: '1' })])
    data.kpis.rev_manut = 5
    const result = filtrarBacklogRows(data, FILTROS_VAZIOS)
    expect(result.kpis.rev_manut).toBe(5)
  })
})
