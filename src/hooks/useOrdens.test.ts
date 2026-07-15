import { describe, it, expect } from 'vitest'
import { withCopeQuandoPendente, splitAgendaFutura, isAgendadaEm, dataBR } from './useOrdens'
import { enrichRows } from '../lib/transform'
import type { OSRow } from '../lib/types'

function makeOS(overrides: Record<string, unknown> = {}): OSRow {
  return {
    numos:           '0000001',
    nomecliente:     'CLIENTE TESTE',
    nomedacidade:    'TAUBATE',
    nomedaequipe:    'EQUIPE F01',
    tiposervico:     'Manutenção',
    servico:         'ASSISTENCIA TECNICA',
    descsituacao:    'Pendente',
    datacadastro:    '01/06/2026',
    dataagendamento: '02/06/2026',
    dataexecucao:    '',
    databaixa:       '',
    bairro:          'CENTRO',
    logradouro:      'RUA TESTE',
    complemento:     '',
    numero:          '1',
    empresa:         '',
    obs:             '',
    periodo:         '2026-06',
    ...overrides,
  } as unknown as OSRow
}

// ─── Testes das funções puras extraídas de useOrdens ────────────────────────
// O hook em si depende de React + OSDataContext e não é testado aqui.
// Estas funções puras representam a lógica de filtragem/ordenação que pode
// ser extraída futuramente para um módulo independente.

// Reimplementação local de parseAgend para testes (idêntica à do hook)
function parseAgend(str: string | null | undefined): Date | null {
  if (!str) return null
  const s = str.trim().split(' ')[0]
  if (s.includes('/')) {
    const [d, m, y] = s.split('/')
    if (!d || !m || !y) return null
    return new Date(Number(y), Number(m) - 1, Number(d))
  }
  const dt = new Date(s)
  return isNaN(dt.getTime()) ? null : dt
}

// Utilitário para filtro de aging (idêntico ao do hook)
function matchesAging(aging: number, filter: string): boolean {
  if (filter === '1')  return aging <= 1
  if (filter === '2')  return aging <= 2
  if (filter === '3')  return aging >= 3 && aging <= 5
  if (filter === '6')  return aging >= 6
  if (filter === '11') return aging >= 11
  return true
}

describe('parseAgend', () => {
  it('parseia formato DD/MM/YYYY', () => {
    const d = parseAgend('15/06/2025')
    expect(d).not.toBeNull()
    expect(d!.getDate()).toBe(15)
    expect(d!.getMonth()).toBe(5)
    expect(d!.getFullYear()).toBe(2025)
  })

  it('parseia formato DD/MM/YYYY com hora (ignora hora)', () => {
    const d = parseAgend('10/04/2025 08:30')
    expect(d).not.toBeNull()
    expect(d!.getDate()).toBe(10)
  })

  it('formato ISO YYYY-MM-DD é interpretado como data local pelo Date constructor', () => {
    // parseAgend usa new Date(s) para ISO; o resultado depende do timezone do ambiente de teste
    const d = parseAgend('2025-06-15')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2025)
    expect(d!.getMonth()).toBe(5)  // junho = 5
  })

  it('retorna null para string vazia', () => {
    expect(parseAgend('')).toBeNull()
    expect(parseAgend(null)).toBeNull()
    expect(parseAgend(undefined)).toBeNull()
  })

  it('retorna null para string inválida', () => {
    expect(parseAgend('nao-e-data')).toBeNull()
    expect(parseAgend('///')).toBeNull()
  })

  it('ordena corretamente por data de agendamento', () => {
    const dates = ['20/06/2025', '10/04/2025', '01/01/2025']
    const sorted = [...dates].sort((a, b) => {
      const da = parseAgend(a)!.getTime()
      const db = parseAgend(b)!.getTime()
      return da - db
    })
    expect(sorted).toEqual(['01/01/2025', '10/04/2025', '20/06/2025'])
  })
})

describe('withCopeQuandoPendente — reincorpora OS da COPE quando status = Pendente', () => {
  it('não altera a lista quando o status filtrado não é Pendente', () => {
    const allRows = enrichRows([makeOS({ numos: '0000002', nomedaequipe: 'COPE VALE' })])
    const ordens  = [] as OSRow[]  // buildOrdens já removeu a COPE daqui
    const result  = withCopeQuandoPendente(ordens, allRows, 'Atendimento')
    expect(result).toEqual([])
  })

  it('reincorpora OS da COPE quando status = Pendente', () => {
    const allRows = enrichRows([
      makeOS({ numos: '0000001', nomedaequipe: 'EQUIPE F01' }),
      makeOS({ numos: '0000002', nomedaequipe: 'COPE VALE' }),
    ])
    const ordens = allRows.filter(r => r.numos === '0000001')  // simula buildOrdens (sem COPE)
    const result = withCopeQuandoPendente(ordens, allRows, 'Pendente')
    const numos  = result.map(r => r.numos)
    expect(numos).toContain('0000001')
    expect(numos).toContain('0000002')
    expect(result).toHaveLength(2)
  })

  it('não duplica OS que já estão em `ordens`', () => {
    const allRows = enrichRows([makeOS({ numos: '0000001', nomedaequipe: 'EQUIPE F01' })])
    const ordens  = allRows
    const result  = withCopeQuandoPendente(ordens, allRows, 'Pendente')
    expect(result).toHaveLength(1)
  })
})

describe('isAgendadaEm / dataBR — comparação em formato BR', () => {
  it('casa dataagendamento DD/MM/YYYY com o dia em formato BR (bug: ISO nunca casava)', () => {
    const hoje = dataBR()
    const r = makeOS({ dataagendamento: `${hoje} 08:00` })
    expect(isAgendadaEm(r, hoje)).toBe(true)
    expect(isAgendadaEm(makeOS({ dataagendamento: '01/01/2020' }), hoje)).toBe(false)
    expect(isAgendadaEm(makeOS({ dataagendamento: '' }), hoje)).toBe(false)
  })

  it('dataBR formata como DD/MM/YYYY', () => {
    expect(dataBR(new Date(2026, 6, 15))).toBe('15/07/2026')
  })
})

describe('splitAgendaFutura — agenda de amanhã em diante', () => {
  function amanhaBR(): string {
    const d = new Date(); d.setDate(d.getDate() + 1)
    return dataBR(d)
  }

  it('inclui Pendente e Atendimento agendadas para amanhã', () => {
    const rows = enrichRows([
      makeOS({ numos: 'P1', descsituacao: 'Pendente',    dataagendamento: amanhaBR() }),
      makeOS({ numos: 'A1', descsituacao: 'Atendimento', dataagendamento: amanhaBR() }),
    ])
    const { amanhaOrdens, futuroOrdens } = splitAgendaFutura(rows)
    expect(amanhaOrdens).toHaveLength(2)
    expect(futuroOrdens).toHaveLength(2)
  })

  it('exclui COPE, reagendamento e concluídas com data futura', () => {
    const rows = enrichRows([
      makeOS({ numos: 'C1', nomedaequipe: 'COPE VALE',          dataagendamento: amanhaBR() }),
      makeOS({ numos: 'R1', nomedaequipe: 'REAGENDAMENTO F01',  dataagendamento: amanhaBR() }),
      makeOS({ numos: 'X1', descsituacao: 'Concluída',          dataagendamento: amanhaBR() }),
      makeOS({ numos: 'P1', descsituacao: 'Pendente',           dataagendamento: amanhaBR() }),
    ])
    const { amanhaOrdens } = splitAgendaFutura(rows)
    expect(amanhaOrdens.map(r => r.numos)).toEqual(['P1'])
  })

  it('agendamento de hoje ou passado não entra na agenda futura', () => {
    const rows = enrichRows([
      makeOS({ numos: 'H1', descsituacao: 'Pendente', dataagendamento: dataBR() }),
      makeOS({ numos: 'V1', descsituacao: 'Pendente', dataagendamento: '01/01/2020' }),
    ])
    const { futuroOrdens } = splitAgendaFutura(rows)
    expect(futuroOrdens).toHaveLength(0)
  })
})

describe('matchesAging — filtro de aging', () => {
  it('filtro "1" → apenas aging ≤ 1', () => {
    expect(matchesAging(0, '1')).toBe(true)
    expect(matchesAging(1, '1')).toBe(true)
    expect(matchesAging(2, '1')).toBe(false)
  })

  it('filtro "2" → apenas aging ≤ 2', () => {
    expect(matchesAging(2, '2')).toBe(true)
    expect(matchesAging(3, '2')).toBe(false)
  })

  it('filtro "3" → aging entre 3 e 5', () => {
    expect(matchesAging(3, '3')).toBe(true)
    expect(matchesAging(5, '3')).toBe(true)
    expect(matchesAging(6, '3')).toBe(false)
    expect(matchesAging(2, '3')).toBe(false)
  })

  it('filtro "6" → aging ≥ 6', () => {
    expect(matchesAging(6, '6')).toBe(true)
    expect(matchesAging(10, '6')).toBe(true)
    expect(matchesAging(5, '6')).toBe(false)
  })

  it('filtro "11" → aging ≥ 11', () => {
    expect(matchesAging(11, '11')).toBe(true)
    expect(matchesAging(100, '11')).toBe(true)
    expect(matchesAging(10, '11')).toBe(false)
  })

  it('filtro vazio → todos passam', () => {
    expect(matchesAging(0,   '')).toBe(true)
    expect(matchesAging(100, '')).toBe(true)
  })
})
