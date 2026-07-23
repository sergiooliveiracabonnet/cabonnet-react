import { describe, it, expect } from 'vitest'
import { buildBiGestaoTecnicaPainel } from './biGestaoTecnicaPainel'
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

describe('buildBiGestaoTecnicaPainel', () => {
  it('classifica e totaliza por tipo, excluindo REDE', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01' }),
      makeRow({ numos: '2', tiposervico: 'INSTALACAO', nomedaequipe: 'F04' }),
      makeRow({ numos: '3', tiposervico: 'SERVICOS',   nomedaequipe: 'F09' }),
      makeRow({ numos: '4', tiposervico: 'MANUTENCAO', nomedaequipe: '03-VAL-REDE F04' }),
    ]
    const painel = buildBiGestaoTecnicaPainel(rows)
    expect(painel.totalManutencao).toBe(1)
    expect(painel.totalInstalacao).toBe(1)
    expect(painel.totalServico).toBe(1)
    expect(painel.totalGeral).toBe(3)
  })

  it('taxaManutencaoPct = manutencao / geral', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01' }),
      makeRow({ numos: '2', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01' }),
      makeRow({ numos: '3', tiposervico: 'INSTALACAO', nomedaequipe: 'F04' }),
    ]
    expect(buildBiGestaoTecnicaPainel(rows).taxaManutencaoPct).toBe(67)
  })

  it('agrupa Total de OS por Mês corretamente', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', datacadastro: '05/06/2026' }),
      makeRow({ numos: '2', tiposervico: 'INSTALACAO', nomedaequipe: 'F04', datacadastro: '10/06/2026' }),
      makeRow({ numos: '3', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', datacadastro: '01/07/2026' }),
    ]
    const { ostPorMes } = buildBiGestaoTecnicaPainel(rows)
    expect(ostPorMes).toEqual([
      { mes: '2026-06', label: 'Jun 2026', instalacao: 1, manutencao: 1, servico: 0 },
      { mes: '2026-07', label: 'Jul 2026', instalacao: 0, manutencao: 1, servico: 0 },
    ])
  })

  it('mediaDiasExecucao converte horas_resolucao pra dias', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', horas_resolucao: 24 }),
      makeRow({ numos: '2', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', horas_resolucao: 48 }),
    ]
    expect(buildBiGestaoTecnicaPainel(rows).mediaDiasExecucao.manutencao).toBe(1.5)
  })

  it('cumprimentoAgendaPct considera execução no dia agendado ou antes', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', dataagendamento: '10/07/2026', dataexecucao: '10/07/2026' }),
      makeRow({ numos: '2', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', dataagendamento: '10/07/2026', dataexecucao: '12/07/2026' }),
    ]
    expect(buildBiGestaoTecnicaPainel(rows).cumprimentoAgendaPct.manutencao).toBe(50)
  })

  it('revisitaPct usa contarRevisitasPorTipo sobre o total do tipo', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', revisita_manut: 1 }),
      makeRow({ numos: '2', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01' }),
    ]
    expect(buildBiGestaoTecnicaPainel(rows).revisitaPct.manutencao).toBe(50)
  })

  it('revisitaPct ignora flag de revisita em linha de outro tipo (REDE) — nunca passa de 100%', () => {
    const rows = [
      makeRow({ numos: '1', tiposervico: 'MANUTENCAO', nomedaequipe: 'F01', revisita_manut: 0 }),
      makeRow({ numos: '2', tiposervico: 'MANUTENCAO', nomedaequipe: '03-VAL-REDE F04', revisita_manut: 1 }),
    ]
    const painel = buildBiGestaoTecnicaPainel(rows)
    expect(painel.totalManutencao).toBe(1)
    expect(painel.revisitaPct.manutencao).toBe(0)
  })

  it('retorna zeros quando não há linhas', () => {
    const painel = buildBiGestaoTecnicaPainel([])
    expect(painel.totalGeral).toBe(0)
    expect(painel.taxaManutencaoPct).toBe(0)
    expect(painel.ostPorMes).toEqual([])
  })
})
