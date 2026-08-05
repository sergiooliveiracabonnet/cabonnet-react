import { describe, expect, it } from 'vitest'
import { backlogRowToOSRow } from './backlogToOSRow'
import type { BacklogRow } from '../../hooks/useBacklog'

function backlogRow(overrides: Partial<BacklogRow> = {}): BacklogRow {
  return {
    nomecliente: 'cliente teste', numos: '9123456', codigocliente: 'C1', codigocontrato: '100',
    servico: 'ASSISTENCIA TECNICA', tiposervico: 'MANUTENCAO', nomedacidade: 'taubaté', bairro: 'centro',
    periodo: '2026-07', descsituacao: 'Concluída', nomedaequipe: 'F01', equipeexecutou: 'F04',
    datacadastro: '01/07/2026', dataagendamento: '02/07/2026', dataexecucao: '03/07/2026',
    horas_resolucao: 24, recorrencia: 1, is_revisita: true,
    revisita_inst: 0, revisita_manut: 1, revisita_serv: 0,
    tempo_maior_24h: 0, tempo_maior_4h: 0, tempo_maior_3h: 0,
    ...overrides,
  }
}

describe('backlogRowToOSRow', () => {
  it('preserva os campos que o drawer usa para identificar a OS', () => {
    const os = backlogRowToOSRow(backlogRow())

    expect(os.numos).toBe('9123456')
    expect(os.servico).toBe('ASSISTENCIA TECNICA')
    expect(os.descsituacao).toBe('Concluída')
    expect(os.dataexecucao).toBe('03/07/2026')
    expect(os.equipeexecutou).toBe('F04')
  })

  // O drawer mostra SLA, aging e situação efetiva — campos que só existem
  // depois do enrichRows. Sem passar por ele a gaveta abriria pela metade.
  it('entrega a linha já enriquecida, como o resto do app consome', () => {
    const os = backlogRowToOSRow(backlogRow())

    expect(os._tipo).toBe('MANUTENCAO')
    expect(os._situacaoEfetiva).toBeDefined()
    expect(os._aging).not.toBeUndefined()
    expect(typeof os._riskScore).toBe('number')
  })

  it('normaliza cliente, cidade e bairro como o enrichRows faz no caminho normal', () => {
    const os = backlogRowToOSRow(backlogRow())

    expect(os.nomecliente).toBe('CLIENTE TESTE')
    expect(os.nomedacidade).toBe('TAUBATÉ')
    expect(os.bairro).toBe('CENTRO')
  })

  it('leva a observação do BI para o campo que o drawer lê', () => {
    const os = backlogRowToOSRow(backlogRow({ observacao: 'cliente ausente na primeira visita' }))

    expect(os.observacoes).toBe('cliente ausente na primeira visita')
  })

  it('não quebra quando o BI vem sem os campos opcionais', () => {
    const os = backlogRowToOSRow(backlogRow({ observacao: undefined, bairro: '' }))

    expect(os.numos).toBe('9123456')
    expect(os.observacoes).toBe('')
  })
})
