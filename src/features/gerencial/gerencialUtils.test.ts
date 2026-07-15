import { describe, it, expect } from 'vitest'
import { enrichRows } from '../../lib/transform'
import { _isExecNoPeriodo, isAgendadaFutura, byEquipe } from './gerencialUtils'
import type { OSRow } from '../../lib/types'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function makeOS(overrides: Record<string, unknown> = {}): OSRow {
  return {
    numos:           '0000001',
    nomecliente:     'CLIENTE TESTE',
    nomedacidade:    'TAUBATE',
    nomedaequipe:    '03- VAL - INSTALACAO F50',
    tiposervico:     'MANUTENCAO',
    servico:         'ASSISTENCIA TECNICA',
    descsituacao:    'Pendente',
    datacadastro:    daysAgo(1),
    dataagendamento: '',
    dataexecucao:    '',
    databaixa:       '',
    bairro: 'CENTRO', logradouro: 'RUA TESTE', complemento: '', numero: '1',
    empresa: '', obs: '', periodo: '',
    ...overrides,
  } as unknown as OSRow
}

describe('_isExecNoPeriodo', () => {
  const from = new Date(); from.setDate(from.getDate() - 7); from.setHours(0, 0, 0, 0)
  const to   = new Date()

  it('aceita OS com data de execução dentro do período', () => {
    const r = makeOS({ descsituacao: 'Concluída', dataexecucao: daysAgo(2) })
    expect(_isExecNoPeriodo(r, from, to)).toBe(true)
  })

  it('rejeita OS concluída SEM data de execução/baixa (não usa cadastro como proxy)', () => {
    // O fallback antigo para datacadastro inflava as "executadas no período"
    const r = makeOS({ descsituacao: 'Concluída', dataexecucao: '', databaixa: '', datacadastro: daysAgo(2) })
    expect(_isExecNoPeriodo(r, from, to)).toBe(false)
  })

  it('rejeita execução fora do período', () => {
    const r = makeOS({ descsituacao: 'Concluída', dataexecucao: daysAgo(30) })
    expect(_isExecNoPeriodo(r, from, to)).toBe(false)
  })
})

describe('isAgendadaFutura', () => {
  it('agendamento de amanhã é futuro; de hoje e de ontem não são', () => {
    const amanha = new Date(); amanha.setDate(amanha.getDate() + 1)
    const amanhaStr = `${String(amanha.getDate()).padStart(2, '0')}/${String(amanha.getMonth() + 1).padStart(2, '0')}/${amanha.getFullYear()}`
    expect(isAgendadaFutura(makeOS({ dataagendamento: amanhaStr }))).toBe(true)
    expect(isAgendadaFutura(makeOS({ dataagendamento: daysAgo(0) }))).toBe(false)
    expect(isAgendadaFutura(makeOS({ dataagendamento: daysAgo(1) }))).toBe(false)
    expect(isAgendadaFutura(makeOS({ dataagendamento: '' }))).toBe(false)
  })
})

describe('byEquipe', () => {
  it('conta ativas e concluídas de bases separadas, com chave shortEquipe (drill funciona)', () => {
    const ativas = enrichRows([
      makeOS({ numos: 'A1', descsituacao: 'Pendente' }),
      makeOS({ numos: 'A2', descsituacao: 'Atendimento' }),
    ])
    const concluidas = enrichRows([
      makeOS({ numos: 'C1', descsituacao: 'Concluída', dataexecucao: daysAgo(1), databaixa: daysAgo(1) }),
    ])
    const eqs = byEquipe(ativas, concluidas)
    expect(eqs).toHaveLength(1)
    const e = eqs[0]
    expect(e.equipe).toContain('INST F50')                       // shortEquipe…
    expect(e.equipe).not.toContain('03- VAL - INSTALACAO')       // …não o nome cru
    expect(e.pendente).toBe(1)
    expect(e.atendimento).toBe(1)
    expect(e.concluida).toBe(1)
    expect(e.total).toBe(3)
    expect(typeof e.slaPct).toBe('number')
  })

  it('conta críticas das ativas', () => {
    const ativas = enrichRows([
      makeOS({ numos: 'A1', descsituacao: 'Pendente', datacadastro: daysAgo(5) }),  // aging 5 > 2× limite 1
    ])
    const eqs = byEquipe(ativas, [])
    expect(eqs[0].criticas).toBe(1)
  })
})
