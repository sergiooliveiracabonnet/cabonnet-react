import { describe, expect, it } from 'vitest'
import type { OSRow } from '../../lib/types'
import { searchRows } from './GlobalSearch'

const row = (values: Record<string, unknown>): OSRow => ({
  numos: '9000001', nomecliente: 'Cliente Teste', nomedacidade: 'Taubaté',
  nomedaequipe: 'F08', tiposervico: '', servico: '', descsituacao: 'Pendente',
  datacadastro: '', dataagendamento: '', dataexecucao: '', databaixa: '',
  bairro: 'Centro', logradouro: '', complemento: '', numero: '', empresa: '',
  obs: '', periodo: '', _agingAbertura: 0, _agingAgendamento: 0, _agingHoras: 0,
  _aging: 0, _slaLimite: 1, _slaTipoLabel: '', _diasAteAgendamento: 0,
  _slaExcedido: false, _slaSemAgend: false, _slaCritico: false,
  _slaCriticoHoras: false, _diasAcimaSLA: 0, _fornecedor: 'WES', _tipo: 'OUTRO',
  _categoria: 'SERVICO', _situacaoEfetiva: 'Pendente', _executadaHoje: false,
  _riskScore: 0, _diasAteViolacao: 0, _vtPrazoHoras: null,
  _vtHorasRestantes: null, _vtViolado: false, _vtCumpridaNoPrazo: null,
  _vtPriorityScore: 0, ...values,
})

describe('searchRows', () => {
  const rows = [row({ codigocontrato: '456789', cpfcliente: '123.456.789-00' })]

  it('encontra pelo número do contrato', () => {
    expect(searchRows(rows, '456789')).toHaveLength(1)
  })

  it('encontra CPF com ou sem pontuação', () => {
    expect(searchRows(rows, '12345678900')).toHaveLength(1)
    expect(searchRows(rows, '123.456.789-00')).toHaveLength(1)
  })
})
