import { describe, it, expect } from 'vitest'
import { withCopeQuandoPendente, splitAgendaFutura, isAgendadaEm, dataBR, matchesOSSearch, aplicarFiltros, matchesAgingFaixa, proximoAgendaFoco, type OrdensFiltros } from './useOrdens'
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

describe('splitAgendaFutura — amanhã e após amanhã, disjuntos', () => {
  function emDias(n: number): string {
    const d = new Date(); d.setDate(d.getDate() + n)
    return dataBR(d)
  }

  it('inclui Pendente e Atendimento agendadas para amanhã', () => {
    const rows = enrichRows([
      makeOS({ numos: 'P1', descsituacao: 'Pendente',    dataagendamento: emDias(1) }),
      makeOS({ numos: 'A1', descsituacao: 'Atendimento', dataagendamento: emDias(1) }),
    ])
    const { amanhaOrdens, posAmanhaOrdens } = splitAgendaFutura(rows)
    expect(amanhaOrdens).toHaveLength(2)
    expect(posAmanhaOrdens).toHaveLength(0)
  })

  it('amanhã e após amanhã não se sobrepõem', () => {
    const rows = enrichRows([
      makeOS({ numos: 'A1', descsituacao: 'Pendente', dataagendamento: emDias(1) }),
      makeOS({ numos: 'D2', descsituacao: 'Pendente', dataagendamento: emDias(2) }),
      makeOS({ numos: 'D9', descsituacao: 'Pendente', dataagendamento: emDias(9) }),
    ])
    const { amanhaOrdens, posAmanhaOrdens } = splitAgendaFutura(rows)
    expect(amanhaOrdens.map(r => r.numos)).toEqual(['A1'])
    expect(posAmanhaOrdens.map(r => r.numos)).toEqual(['D2', 'D9'])
    const intersecao = amanhaOrdens.filter(a => posAmanhaOrdens.some(p => p.numos === a.numos))
    expect(intersecao).toHaveLength(0)
  })

  it('exclui COPE, reagendamento e concluídas com data futura', () => {
    const rows = enrichRows([
      makeOS({ numos: 'C1', nomedaequipe: 'COPE VALE',         dataagendamento: emDias(1) }),
      makeOS({ numos: 'R1', nomedaequipe: 'REAGENDAMENTO F01', dataagendamento: emDias(1) }),
      makeOS({ numos: 'X1', descsituacao: 'Concluída',         dataagendamento: emDias(1) }),
      makeOS({ numos: 'P1', descsituacao: 'Pendente',          dataagendamento: emDias(1) }),
    ])
    const { amanhaOrdens } = splitAgendaFutura(rows)
    expect(amanhaOrdens.map(r => r.numos)).toEqual(['P1'])
  })

  it('agendamento de hoje ou passado não entra em nenhum dos dois', () => {
    const rows = enrichRows([
      makeOS({ numos: 'H1', descsituacao: 'Pendente', dataagendamento: dataBR() }),
      makeOS({ numos: 'V1', descsituacao: 'Pendente', dataagendamento: '01/01/2020' }),
    ])
    const { amanhaOrdens, posAmanhaOrdens } = splitAgendaFutura(rows)
    expect(amanhaOrdens).toHaveLength(0)
    expect(posAmanhaOrdens).toHaveLength(0)
  })

  it('o recorte de agenda é filtrável por aplicarFiltros — base dos KPIs corrigidos', () => {
    const rows = enrichRows([
      makeOS({ numos: 'T1', descsituacao: 'Pendente', nomedacidade: 'TAUBATE',  dataagendamento: emDias(1) }),
      makeOS({ numos: 'C1', descsituacao: 'Pendente', nomedacidade: 'CACAPAVA', dataagendamento: emDias(1) }),
    ])
    const { amanhaOrdens } = splitAgendaFutura(rows)
    const soTaubate = aplicarFiltros(amanhaOrdens, {
      search: '', status: '', reagendTipo: '', tipo: '', cidade: 'TAUBATE', bairro: '',
      equipe: '', fornecedor: '', tipoOs: '', periodo: '', aging: '',
      semEquipe: false, critico: false, agendHoje: false,
    })
    expect(soTaubate.map(r => r.numos)).toEqual(['T1'])
  })

  it('zerar agendHoje evita que o balde de amanhã se autofiltre, sem desligar os demais filtros', () => {
    const rows = enrichRows([
      makeOS({ numos: 'T1', descsituacao: 'Pendente', nomedacidade: 'TAUBATE', dataagendamento: emDias(1) }),
    ])
    const { amanhaOrdens } = splitAgendaFutura(rows)
    const comCidadeEAgendHoje: OrdensFiltros = {
      search: '', status: '', reagendTipo: '', tipo: '', cidade: 'TAUBATE', bairro: '',
      equipe: '', fornecedor: '', tipoOs: '', periodo: '', aging: '',
      semEquipe: false, critico: false, agendHoje: true,
    }
    // Nenhuma OS do balde "amanhã" tem dataagendamento = hoje, então com
    // agendHoje ligado o próprio recorte se anula — é o bug que a Task 4 corrigiu.
    expect(aplicarFiltros(amanhaOrdens, comCidadeEAgendHoje).map(r => r.numos)).toEqual([])

    // filtrosAgenda faz exatamente isto: zera só agendHoje. A OS volta a
    // aparecer e o filtro de cidade (dimensional, não relacionado à agenda)
    // continua valendo — prova que os demais filtros não foram desligados junto.
    const filtrosAgenda: OrdensFiltros = { ...comCidadeEAgendHoje, agendHoje: false }
    expect(aplicarFiltros(amanhaOrdens, filtrosAgenda).map(r => r.numos)).toEqual(['T1'])
  })
})

describe('matchesAging — filtro de aging', () => {
  it('filtro "1" → apenas aging ≤ 1', () => {
    expect(matchesAgingFaixa(0, '1')).toBe(true)
    expect(matchesAgingFaixa(1, '1')).toBe(true)
    expect(matchesAgingFaixa(2, '1')).toBe(false)
  })

  it('filtro "2" → apenas aging ≤ 2', () => {
    expect(matchesAgingFaixa(2, '2')).toBe(true)
    expect(matchesAgingFaixa(3, '2')).toBe(false)
  })

  it('filtro "3" → aging entre 3 e 5', () => {
    expect(matchesAgingFaixa(3, '3')).toBe(true)
    expect(matchesAgingFaixa(5, '3')).toBe(true)
    expect(matchesAgingFaixa(6, '3')).toBe(false)
    expect(matchesAgingFaixa(2, '3')).toBe(false)
  })

  it('filtro "6" → aging ≥ 6', () => {
    expect(matchesAgingFaixa(6, '6')).toBe(true)
    expect(matchesAgingFaixa(10, '6')).toBe(true)
    expect(matchesAgingFaixa(5, '6')).toBe(false)
  })

  it('filtro "11" → aging ≥ 11', () => {
    expect(matchesAgingFaixa(11, '11')).toBe(true)
    expect(matchesAgingFaixa(100, '11')).toBe(true)
    expect(matchesAgingFaixa(10, '11')).toBe(false)
  })

  it('filtro vazio → todos passam', () => {
    expect(matchesAgingFaixa(0,   '')).toBe(true)
    expect(matchesAgingFaixa(100, '')).toBe(true)
  })
})

describe('matchesOSSearch — pesquisa operacional normalizada', () => {
  const row = makeOS({
    nomecliente: 'JOÃO D’ÁVILA',
    codigocontrato: 'CTR-90871',
    cpf: '123.456.789-01',
    bairro: 'JARDIM DAS FLORES',
    logradouro: 'RUA DAS ACÁCIAS',
    nomedaequipe: 'EQUIPE F08',
    nometecnico: 'ÉLCIO SILVA',
  })

  it.each(['joao', 'davila', '90871', '12345678901', 'flores', 'acacias', 'f08', 'elcio'])(
    'encontra a OS por "%s"',
    query => expect(matchesOSSearch(row, query)).toBe(true),
  )

  it('não encontra um termo ausente', () => {
    expect(matchesOSSearch(row, 'cliente inexistente')).toBe(false)
  })
})

describe('aplicarFiltros — cadeia de filtros da página de Ordens', () => {
  const VAZIO: OrdensFiltros = {
    search: '', status: '', reagendTipo: '', tipo: '', cidade: '', bairro: '',
    equipe: '', fornecedor: '', tipoOs: '', periodo: '', aging: '',
    semEquipe: false, critico: false, agendHoje: false,
  }

  const rows = enrichRows([
    makeOS({ numos: '0000001', nomedacidade: 'TAUBATE',  nomedaequipe: 'EQUIPE F01' }),
    makeOS({ numos: '0000002', nomedacidade: 'CACAPAVA', nomedaequipe: 'EQUIPE F08' }),
    makeOS({ numos: '0000003', nomedacidade: 'TAUBATE',  nomedaequipe: '' }),
  ])

  it('sem nenhum filtro devolve a lista intacta', () => {
    expect(aplicarFiltros(rows, VAZIO)).toHaveLength(3)
  })

  it('filtra por cidade', () => {
    const r = aplicarFiltros(rows, { ...VAZIO, cidade: 'TAUBATE' })
    expect(r.map(x => x.numos)).toEqual(['0000001', '0000003'])
  })

  it('filtra por equipe', () => {
    const r = aplicarFiltros(rows, { ...VAZIO, equipe: 'EQUIPE F08' })
    expect(r.map(x => x.numos)).toEqual(['0000002'])
  })

  it('semEquipe pega apenas OS sem alocação', () => {
    const r = aplicarFiltros(rows, { ...VAZIO, semEquipe: true })
    expect(r.map(x => x.numos)).toEqual(['0000003'])
  })

  it('filtros combinam por interseção, não por substituição', () => {
    const r = aplicarFiltros(rows, { ...VAZIO, cidade: 'TAUBATE', semEquipe: true })
    expect(r.map(x => x.numos)).toEqual(['0000003'])
  })

  it('agendHoje usa a data BR injetada, não o relógio do sistema', () => {
    const hoje = dataBR()
    const comHoje = enrichRows([
      makeOS({ numos: '0000004', dataagendamento: `${hoje} 08:00` }),
      makeOS({ numos: '0000005', dataagendamento: '01/01/2020' }),
    ])
    const r = aplicarFiltros(comHoje, { ...VAZIO, agendHoje: true }, hoje)
    expect(r.map(x => x.numos)).toEqual(['0000004'])
  })

  it('não muta o array de entrada', () => {
    const antes = rows.map(r => r.numos)
    aplicarFiltros(rows, { ...VAZIO, cidade: 'TAUBATE' })
    expect(rows.map(r => r.numos)).toEqual(antes)
  })
})

describe('proximoAgendaFoco — recortes de agenda mutuamente exclusivos', () => {
  it('clicar num foco inativo o ativa', () => {
    expect(proximoAgendaFoco(null, 'hoje')).toBe('hoje')
  })

  it('clicar no foco já ativo o desliga', () => {
    expect(proximoAgendaFoco('hoje', 'hoje')).toBeNull()
  })

  it('clicar em outro foco troca, nunca acumula', () => {
    expect(proximoAgendaFoco('hoje', 'amanha')).toBe('amanha')
    expect(proximoAgendaFoco('amanha', 'posAmanha')).toBe('posAmanha')
    expect(proximoAgendaFoco('posAmanha', 'hoje')).toBe('hoje')
  })
})
