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

describe('searchRows — número da OS', () => {
  const alvo = row({ numos: '9000001' })
  const outra = row({ numos: '9000002', nomecliente: 'Outro Cliente' })
  const rows = [alvo, outra]

  it('encontra pelo número completo', () => {
    expect(searchRows(rows, '9000001').map(r => r.numos)).toEqual(['9000001'])
  })

  it('encontra pelo prefixo', () => {
    expect(searchRows(rows, '90000')).toHaveLength(2)
  })

  it('encontra pelos dígitos finais, que é como a operação costuma anotar', () => {
    expect(searchRows(rows, '0001').map(r => r.numos)).toEqual(['9000001'])
  })

  it('ignora pontuação e prefixo colados junto', () => {
    expect(searchRows(rows, 'OS 9000001').map(r => r.numos)).toEqual(['9000001'])
    expect(searchRows(rows, '9.000.001').map(r => r.numos)).toEqual(['9000001'])
  })

  it('exige 3 dígitos para casar trecho no meio, senão qualquer par de dígitos traria a base toda', () => {
    // '00' aparece no meio das duas OS, mas não é prefixo de nenhuma.
    expect(searchRows(rows, '00')).toHaveLength(0)
  })

  it('o número exato vem primeiro, mesmo quando outra OS também casa', () => {
    const comSufixo = [row({ numos: '1900001' }), alvo]
    expect(searchRows(comSufixo, '9000001')[0].numos).toBe('9000001')
  })
})
