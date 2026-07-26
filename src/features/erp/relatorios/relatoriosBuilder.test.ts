import { describe, expect, it } from 'vitest'
import type { OSRow } from '../../../lib/types'
import { buildReportMetrics, filterReportRows } from './relatoriosBuilder'

const row = (overrides: Partial<OSRow>) => ({
  numos: '1234567', nomecliente: 'Cliente', nomedacidade: 'Taubaté', nomedaequipe: 'F08',
  tiposervico: '', servico: '', descsituacao: 'Pendente', datacadastro: '20/07/2026',
  dataagendamento: '', dataexecucao: '', databaixa: '', bairro: '', logradouro: '', complemento: '', numero: '', empresa: '', obs: '', periodo: '',
  _tipo: 'INSTALACAO', _aging: 3, _agingAbertura: 3, _slaExcedido: false, _slaSemAgend: false,
  ...overrides,
}) as OSRow

describe('relatoriosBuilder', () => {
  it('filtra período pela data escolhida, sem usar aging', () => {
    const rows = [row({ numos: '1111111', datacadastro: '20/07/2026', _aging: 100 }), row({ numos: '2222222', datacadastro: '01/05/2026', _aging: null })]
    expect(filterReportRows(rows, { period: '7d', dateField: 'datacadastro' }, new Date(2026, 6, 26)).map(r => r.numos)).toEqual(['1111111'])
  })

  it('mantém REDE separada e usa execução real na produção', () => {
    const metrics = buildReportMetrics([
      row({ descsituacao: 'Concluída', _tipo: 'REDE', nomedaequipe: 'NOVA' }),
      row({ numos: '2222222', descsituacao: 'Atendimento/Finalizadas', _tipo: 'OUTRO', nomedaequipe: '' }),
      row({ numos: '3333333', descsituacao: 'Concluída/Sem Execução', _tipo: 'INSTALACAO' }),
    ])
    expect(metrics.production).toEqual({ total: 2, instalacao: 0, manutencao: 0, servico: 1, rede: 1 })
  })
})
