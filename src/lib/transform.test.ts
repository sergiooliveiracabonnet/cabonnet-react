import { describe, it, expect } from 'vitest'
import type { OSRow, DateFilter } from './types'
import { enrichRows, getFornecedor, parseCSV, applyDateFilter, parseDate, parseDateTime, isConcluida, isExecucaoReal, isFilaAtiva } from './transform.js'
import { buildDashboard, buildSla, buildAnomalias, buildCidades } from './builders.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOS(overrides: Record<string, unknown> = {}): OSRow {
  return {
    numos:          '12345',
    nomecliente:    'Cliente Teste',
    nomedacidade:   'TAUBATE',
    nomedaequipe:   '',
    tiposervico:    'Manutenção',
    servico:        'ASSISTENCIA TECNICA',
    descsituacao:   'Pendente',
    datacadastro:   null,
    dataagendamento: null,
    ...overrides,
  } as unknown as OSRow
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function hoursAgo(n: number): string {
  const d = new Date()
  d.setHours(d.getHours() - n)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const HH = String(d.getHours()).padStart(2, '0')
  const MI = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()} ${HH}:${MI}`
}


// ─── getFornecedor ─────────────────────────────────────────────────────────────

describe('getFornecedor', () => {
  it('identifica COPE como INTERNO', () => {
    expect(getFornecedor('COPE VALE')).toBe('INTERNO')
  })

  it('identifica equipe REDE', () => {
    expect(getFornecedor('03-VAL - REDE FIBRA')).toBe('REDE')
  })

  it('identifica WES pelo código F08', () => {
    expect(getFornecedor('EQUIPE F08')).toBe('WES')
  })

  it('identifica Instacable pelo código F01', () => {
    expect(getFornecedor('EQUIPE F01')).toBe('Instacable')
  })

  it('retorna OUTRO para equipes desconhecidas', () => {
    expect(getFornecedor('EQUIPE DESCONHECIDA')).toBe('OUTRO')
  })

  it('retorna OUTRO para string vazia', () => {
    expect(getFornecedor('')).toBe('OUTRO')
  })
})

// ─── enrichRows — aging ────────────────────────────────────────────────────────

describe('enrichRows — aging', () => {
  it('calcula _agingAbertura corretamente', () => {
    const rows = [makeOS({ datacadastro: daysAgo(5), descsituacao: 'Pendente' })]
    const [r]  = enrichRows(rows)
    expect(r._agingAbertura).toBe(5)
  })

  it('aging é null quando não há datacadastro', () => {
    const [r] = enrichRows([makeOS({ datacadastro: null })])
    expect(r._agingAbertura).toBeNull()
  })

  it('_aging ativo apenas para OS Pendente e Atendimento', () => {
    // numos únicos para evitar deduplicação
    const pendente    = makeOS({ numos: 'P1', datacadastro: daysAgo(3), descsituacao: 'Pendente' })
    const atendimento = makeOS({ numos: 'A1', datacadastro: daysAgo(3), descsituacao: 'Atendimento' })
    const concluida   = makeOS({ numos: 'C1', datacadastro: daysAgo(3), descsituacao: 'Concluída' })

    const [rP, rA, rC] = enrichRows([pendente, atendimento, concluida])
    expect(rP._aging).toBe(3)
    expect(rA._aging).toBe(3)
    expect(rC._aging).toBeNull()
  })

  it('deduplica numos repetidos mantendo o primeiro', () => {
    const rows = [
      makeOS({ numos: 'X', datacadastro: daysAgo(1) }),
      makeOS({ numos: 'X', datacadastro: daysAgo(2) }),
    ]
    const result = enrichRows(rows)
    expect(result).toHaveLength(1)
    expect(result[0]._agingAbertura).toBe(1)
  })
})

// ─── enrichRows — SLA ─────────────────────────────────────────────────────────

describe('enrichRows — SLA', () => {
  it('VT 24H tem limite de 1 dia', () => {
    const [r] = enrichRows([makeOS({ servico: 'ASSISTENCIA - VT 24H' })])
    expect(r._slaLimite).toBe(1)
    expect(r._slaTipoLabel).toBe('VT 24h')
  })

  it('VT 48H tem limite de 2 dias', () => {
    const [r] = enrichRows([makeOS({ servico: 'VT 48H TESTE' })])
    expect(r._slaLimite).toBe(2)
  })

  it('Instalação tem limite de 2 dias', () => {
    const [r] = enrichRows([makeOS({ tiposervico: 'INSTALAÇÃO FIBRA', servico: 'INSTALAÇAO RESIDENCIAL' })])
    expect(r._slaLimite).toBe(2)
  })

  it('Manutenção tem limite de 1 dia', () => {
    // DB envia sem acento: 'MANUTENCAO' → toUpperCase inclui 'MANUTENC'
    const [r] = enrichRows([makeOS({ tiposervico: 'MANUTENCAO' })])
    expect(r._slaLimite).toBe(1)
  })

  it('_slaExcedido = true quando aging desde a abertura > limite, mesmo com agendamento rápido', () => {
    // Agendada em 1h (dentro do limite), mas segue ativa 10 dias depois — deve
    // contar a partir da abertura, não travar no prazo de agendamento.
    const os = makeOS({
      descsituacao:    'Pendente',
      datacadastro:    daysAgo(10),
      dataagendamento: daysAgo(10),
      tiposervico:     'MANUTENCAO',
    })
    const [r] = enrichRows([os])
    expect(r._slaExcedido).toBe(true)
  })

  it('_slaExcedido = false quando aging desde a abertura está dentro do limite', () => {
    const os = makeOS({
      descsituacao:    'Pendente',
      datacadastro:    daysAgo(1),
      dataagendamento: daysAgo(1),
      tiposervico:     'MANUTENCAO',
    })
    const [r] = enrichRows([os])
    expect(r._slaExcedido).toBe(false)
  })

  it('_slaCritico = true quando aging desde a abertura > 2× o limite', () => {
    const os = makeOS({
      descsituacao:    'Pendente',
      datacadastro:    daysAgo(3),   // 3 dias > 2× limite manutenção (1d)
      dataagendamento: daysAgo(3),
      tiposervico:     'MANUTENCAO',
    })
    const [r] = enrichRows([os])
    expect(r._slaCritico).toBe(true)
  })

  it('_slaSemAgend = true quando ativa sem agendamento além do limite', () => {
    const os = makeOS({
      descsituacao:    'Pendente',
      datacadastro:    daysAgo(5),
      dataagendamento: null,
      tiposervico:     'MANUTENCAO',
    })
    const [r] = enrichRows([os])
    expect(r._slaSemAgend).toBe(true)
  })

  it('_slaSemAgend = false quando excedido mas com agendamento (mesmo que atrasado)', () => {
    const os = makeOS({
      descsituacao:    'Pendente',
      datacadastro:    daysAgo(10),
      dataagendamento: daysAgo(10),
      tiposervico:     'MANUTENCAO',
    })
    const [r] = enrichRows([os])
    expect(r._slaExcedido).toBe(true)
    expect(r._slaSemAgend).toBe(false)
  })
})

// ─── enrichRows — VT Prazo Horas ───────────────────────────────────────────────

describe('enrichRows — VT Prazo Horas', () => {
  it('getVtPrazoHoras retorna 8 para VT 08H', () => {
    const [r] = enrichRows([makeOS({ servico: 'ASSISTENCIA - VT 08H' })])
    expect(r._vtPrazoHoras).toBe(8)
  })

  it('getVtPrazoHoras retorna 24 para VT 24H', () => {
    const [r] = enrichRows([makeOS({ servico: 'ASSISTENCIA - VT 24H' })])
    expect(r._vtPrazoHoras).toBe(24)
  })

  it('getVtPrazoHoras retorna 48 para VT 48H', () => {
    const [r] = enrichRows([makeOS({ servico: 'VT 48H TESTE' })])
    expect(r._vtPrazoHoras).toBe(48)
  })

  it('getVtPrazoHoras retorna null para serviço não-VT', () => {
    const [r] = enrichRows([makeOS({ servico: 'ASSISTENCIA TECNICA' })])
    expect(r._vtPrazoHoras).toBeNull()
  })

  it('_vtHorasRestantes positivo quando dentro do prazo (VT 24h, aberta há 20h)', () => {
    const os = makeOS({
      numos: 'VT1', servico: 'ASSISTENCIA - VT 24H',
      descsituacao: 'Pendente', datacadastro: hoursAgo(20),
    })
    const [r] = enrichRows([os])
    expect(r._vtHorasRestantes).not.toBeNull()
    expect(r._vtHorasRestantes as number).toBeGreaterThan(3)
    expect(r._vtHorasRestantes as number).toBeLessThan(5)
    expect(r._vtViolado).toBe(false)
  })

  it('_vtHorasRestantes negativo e _vtViolado=true quando passou do prazo (VT 24h, aberta há 30h)', () => {
    const os = makeOS({
      numos: 'VT2', servico: 'ASSISTENCIA - VT 24H',
      descsituacao: 'Pendente', datacadastro: hoursAgo(30),
    })
    const [r] = enrichRows([os])
    expect(r._vtHorasRestantes as number).toBeLessThan(0)
    expect(r._vtViolado).toBe(true)
  })

  it('_vtHorasRestantes é null para OS não-VT', () => {
    const os = makeOS({
      numos: 'VT3', servico: 'ASSISTENCIA TECNICA',
      descsituacao: 'Pendente', datacadastro: hoursAgo(5),
    })
    const [r] = enrichRows([os])
    expect(r._vtHorasRestantes).toBeNull()
    expect(r._vtViolado).toBe(false)
  })

  it('_vtHorasRestantes é null para OS VT já concluída (não está mais na fila ativa)', () => {
    const os = makeOS({
      numos: 'VT4', servico: 'ASSISTENCIA - VT 24H',
      descsituacao: 'Concluída', datacadastro: hoursAgo(30),
    })
    const [r] = enrichRows([os])
    expect(r._vtHorasRestantes).toBeNull()
    expect(r._vtViolado).toBe(false)
  })

  it('_vtViolado é true exatamente no limite do prazo (VT 24h, aberta há exatos 24h)', () => {
    const os = makeOS({
      numos: 'VT5', servico: 'ASSISTENCIA - VT 24H',
      descsituacao: 'Pendente', datacadastro: hoursAgo(24),
    })
    const [r] = enrichRows([os])
    expect(r._vtHorasRestantes as number).toBeLessThanOrEqual(0)
    expect(r._vtViolado).toBe(true)
  })

  it('_vtHorasRestantes é null quando OS é VT mas datacadastro está ausente', () => {
    const os = makeOS({
      numos: 'VT6', servico: 'ASSISTENCIA - VT 24H',
      descsituacao: 'Pendente', datacadastro: null,
    })
    const [r] = enrichRows([os])
    expect(r._vtPrazoHoras).toBe(24)
    expect(r._vtHorasRestantes).toBeNull()
    expect(r._vtViolado).toBe(false)
  })
})

// ─── enrichRows — VT Cumprimento de Prazo (executadas) ──────────────────────────

describe('enrichRows — VT Cumprimento de Prazo', () => {
  it('_vtCumpridaNoPrazo=true quando VT 08h executada 6h após o cadastro', () => {
    const os = makeOS({
      numos: 'VC1', servico: 'ASSISTENCIA - VT 08H',
      descsituacao: 'Concluída', datacadastro: hoursAgo(20), dataexecucao: hoursAgo(14),
    })
    const [r] = enrichRows([os])
    expect(r._vtCumpridaNoPrazo).toBe(true)
  })

  it('_vtCumpridaNoPrazo=false quando VT 08h executada 12h após o cadastro', () => {
    const os = makeOS({
      numos: 'VC2', servico: 'ASSISTENCIA - VT 08H',
      descsituacao: 'Concluída', datacadastro: hoursAgo(20), dataexecucao: hoursAgo(8),
    })
    const [r] = enrichRows([os])
    expect(r._vtCumpridaNoPrazo).toBe(false)
  })

  it('_vtCumpridaNoPrazo é null para VT ainda sem dataexecucao', () => {
    const os = makeOS({
      numos: 'VC3', servico: 'ASSISTENCIA - VT 24H',
      descsituacao: 'Pendente', datacadastro: hoursAgo(10),
    })
    const [r] = enrichRows([os])
    expect(r._vtCumpridaNoPrazo).toBeNull()
  })

  it('_vtCumpridaNoPrazo é null para OS não-VT mesmo executada', () => {
    const os = makeOS({
      numos: 'VC4', servico: 'ASSISTENCIA TECNICA',
      descsituacao: 'Concluída', datacadastro: hoursAgo(20), dataexecucao: hoursAgo(10),
    })
    const [r] = enrichRows([os])
    expect(r._vtCumpridaNoPrazo).toBeNull()
  })
})

// ─── enrichRows — VT Priority Score ─────────────────────────────────────────────

describe('enrichRows — VT Priority Score', () => {
  it('_vtPriorityScore é 0 para OS não-VT', () => {
    const [r] = enrichRows([makeOS({ servico: 'ASSISTENCIA TECNICA', datacadastro: hoursAgo(5) })])
    expect(r._vtPriorityScore).toBe(0)
  })

  it('VT 08h pesa mais que VT 48h com o mesmo estouro', () => {
    const [vt08] = enrichRows([makeOS({ numos: 'S1', servico: 'VT 08H', descsituacao: 'Pendente', datacadastro: hoursAgo(10) })])
    const [vt48] = enrichRows([makeOS({ numos: 'S2', servico: 'VT 48H', descsituacao: 'Pendente', datacadastro: hoursAgo(50) })])
    // ambos violados há ~2h, mas o 08h tem peso de tipo 3 vs 1 do 48h
    expect(vt08._vtPriorityScore).toBeGreaterThan(vt48._vtPriorityScore)
  })

  it('VT violada pontua mais que VT no prazo do mesmo tipo', () => {
    const [violada] = enrichRows([makeOS({ numos: 'S3', servico: 'VT 08H', descsituacao: 'Pendente', datacadastro: hoursAgo(12) })]) // violada
    const [noPrazo] = enrichRows([makeOS({ numos: 'S4', servico: 'VT 08H', descsituacao: 'Pendente', datacadastro: hoursAgo(4) })])  // 4h restantes
    expect(violada._vtPriorityScore).toBeGreaterThan(noPrazo._vtPriorityScore)
    expect(noPrazo._vtPriorityScore).toBeGreaterThan(0)
  })

  it('Reagendamento reduz o score (já tem tratativa)', () => {
    const [normal]     = enrichRows([makeOS({ numos: 'S5', servico: 'VT 08H', nomedaequipe: 'EQUIPE F01', descsituacao: 'Pendente', datacadastro: hoursAgo(10) })])
    const [reagendada] = enrichRows([makeOS({ numos: 'S6', servico: 'VT 08H', nomedaequipe: 'REAGENDAMENTO F01', descsituacao: 'Pendente', datacadastro: hoursAgo(10) })])
    expect(reagendada._situacaoEfetiva).toBe('Reagendamento')
    expect(reagendada._vtPriorityScore).toBeLessThan(normal._vtPriorityScore)
  })
})

// ─── parseCSV ─────────────────────────────────────────────────────────────────

describe('parseCSV', () => {
  it('retorna array vazio para string vazia', () => {
    expect(parseCSV('')).toHaveLength(0)
  })

  it('retorna array vazio sem cabeçalho', () => {
    expect(parseCSV('numos')).toHaveLength(0)
  })

  it('faz parse de CSV simples', () => {
    const csv = 'numos,nomecliente,descsituacao,nomedacidade\n1234567,João,Pendente,TAUBATE'
    const rows = parseCSV(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].numos).toBe('1234567')
    expect(rows[0].nomecliente).toBe('João')
  })

  it('ignora linhas sem numos', () => {
    const csv = 'numos,nomecliente,nomedacidade\n,Sem numero,TAUBATE\n1234567,Com numero,TAUBATE'
    expect(parseCSV(csv)).toHaveLength(1)
  })

  it('filtra equipes excluídas (ESTOQUE)', () => {
    const csv = 'numos,nomecliente,nomedaequipe,servico\n1234561,X,ESTOQUE,FIBRA\n1234562,Y,COPE,FIBRA'
    const rows = parseCSV(csv)
    expect(rows.every(r => r.nomedaequipe !== 'ESTOQUE')).toBe(true)
  })

  it('filtra serviços excluídos (INADIMPLENCIA)', () => {
    const csv = 'numos,nomecliente,nomedaequipe,servico,nomedacidade\n1234561,X,FIELD,INADIMPLENCIA FIBRA,TAUBATE\n1234562,Y,FIELD,ASSISTENCIA,TAUBATE'
    const rows = parseCSV(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].numos).toBe('1234562')
  })

  it('detecta separador ponto-e-vírgula', () => {
    const csv = 'numos;nomecliente;nomedacidade\n1234567;Maria;TAUBATE'
    const [r] = parseCSV(csv)
    expect(r.numos).toBe('1234567')
    expect(r.nomecliente).toBe('Maria')
  })

  it('lida com campos entre aspas contendo vírgulas', () => {
    const csv = 'numos,nomecliente,nomedacidade\n1234567,"João da Silva",TAUBATE'
    const [r] = parseCSV(csv)
    expect(r.nomecliente).toBe('João da Silva')
  })
})

// ─── parseCSV — qualidade de dados ───────────────────────────────────────────

describe('parseCSV — qualidade de dados', () => {
  it('rejeita linha com texto no campo numos (com espaços)', () => {
    const csv = 'numos,nomecliente\nINSTALAR EM PINDAMONHANGABA,Cliente X'
    expect(parseCSV(csv)).toHaveLength(0)
  })

  it('rejeita numos sem dígitos (texto sem espaço)', () => {
    const csv = 'numos,nomecliente\nCANCELADA,Cliente Y'
    expect(parseCSV(csv)).toHaveLength(0)
  })

  it('rejeita numos com mais de 7 dígitos', () => {
    const csv = `numos,nomecliente\n${'1'.repeat(8)},Cliente Z`
    expect(parseCSV(csv)).toHaveLength(0)
  })

  it('aceita numos com exatamente 7 dígitos', () => {
    const csv = 'numos,nomecliente,nomedacidade\n1234567,João,TAUBATE'
    expect(parseCSV(csv)).toHaveLength(1)
  })

  it('rejeita numos alfanumérico (ex: OS12345)', () => {
    const csv = 'numos,nomecliente\nOS12345,Maria'
    expect(parseCSV(csv)).toHaveLength(0)
  })

  it('preserva nomecliente como vem do banco', () => {
    const csv = 'numos,nomecliente,nomedacidade\n9900005,FULANO DA SILVA,TAUBATE'
    const rows = parseCSV(csv)
    expect(rows[0].nomecliente).toBe('FULANO DA SILVA')
  })

  it('preserva nome de empresa com caracteres especiais', () => {
    const csv = 'numos,nomecliente,nomedacidade\n9900006,SILVA & SOUZA LTDA,TAUBATE'
    const rows = parseCSV(csv)
    expect(rows[0].nomecliente).toBe('SILVA & SOUZA LTDA')
  })
})

// ─── parseCSV — numos inválidos do mundo real ─────────────────────────────────

describe('parseCSV — numos inválidos (amostras reais)', () => {
  const header = 'numos,nomecliente,nomedacidade\n'

  const invalidos = [
    'quais?', 'APOS', 'A3', 'loss', 'vermelha', 'GREENPARK',
    'QUARTA-FEIRA.', 'fixa', 'urgencia', 'Up', 'Casa', 'casa',
    '3a', '90', '00', '260', '66', '100',
    '12996075310', 'Cep:12085080', '12090-840', 'Belém',
  ]

  invalidos.forEach(numos => {
    it(`rejeita numos inválido: "${numos}"`, () => {
      const csv = `${header}${numos},Cliente Qualquer`
      expect(parseCSV(csv)).toHaveLength(0)
    })
  })

  it('aceita numos válido de 7 dígitos', () => {
    expect(parseCSV(`${header}9069512,VANDERLEI SAVIO,TAUBATE`)).toHaveLength(1)
  })
})

// ─── parseCSV — nomecliente passado do banco sem filtro ──────────────────────

describe('parseCSV — nomecliente preservado como vem do banco', () => {
  function row(nome: string) { return `numos,nomecliente,nomedacidade\n9069512,${nome},TAUBATE` }

  const casos = [
    'VANDERLEI SAVIO',
    'Hilario Jose Signorini',
    'São João',
    "D'Ávila",
    'SILVA & SOUZA LTDA',
    'CONDOMINIO ED. BRASIL',
    'RESTAURANTE DR. JOAO',
    'OBS: CLIENTE SOLICITOU VISITA',
    'AGUARDANDO DISPONIBILIDADE',
  ]

  casos.forEach(nome => {
    it(`preserva "${nome}" sem alteração`, () => {
      const rows = parseCSV(row(nome))
      expect(rows).toHaveLength(1)
      expect(rows[0].nomecliente).toBe(nome)
    })
  })
})

// ─── parseCSV — contagem de descartados ───────────────────────────────────────

describe('parseCSV — _discarded', () => {
  it('conta linhas descartadas por numos inválido', () => {
    const csv = 'numos,nomecliente,nomedacidade\n9069512,Valido,TAUBATE\nAPOS,Lixo,TAUBATE\nUp,Lixo2,TAUBATE'
    const rows = parseCSV(csv)
    expect(rows).toHaveLength(1)
    expect(rows._discarded).toBe(2)
  })

  it('zero descartados quando todos os numos são válidos', () => {
    const csv = 'numos,nomecliente,nomedacidade\n9069512,Alice,TAUBATE\n9069513,Bob,TAUBATE'
    const rows = parseCSV(csv)
    expect(rows).toHaveLength(2)
    expect(rows._discarded).toBe(0)
  })

  it('inicializa _discarded=0 quando CSV vazio', () => {
    const rows = parseCSV('')
    expect(rows._discarded).toBe(0)
  })
})

// ─── applyDateFilter — guarda de ano ──────────────────────────────────────────

describe('applyDateFilter — guarda de ano', () => {
  const currentYear = new Date().getFullYear()
  const prevYear    = currentYear - 1
  const twoYearsAgo = currentYear - 2

  const rowPrevYear = { numos: '1', datacadastro: `15/06/${prevYear}`,    descsituacao: 'Pendente' }
  const row2026     = { numos: '2', datacadastro: `15/01/${currentYear}`, descsituacao: 'Pendente' }
  const rowOld      = { numos: '5', datacadastro: `15/06/${twoYearsAgo}`, descsituacao: 'Pendente' }
  const rowSemData  = { numos: '3', datacadastro: '',                      descsituacao: 'Pendente' }

  it('aceita OS do ano anterior (MIN_YEAR = ano atual - 1)', () => {
    const result = applyDateFilter([rowPrevYear, row2026] as OSRow[], null)
    expect(result.map(r => r.numos)).toEqual(['1', '2'])
  })

  it('rejeita OS de dois anos atrás', () => {
    const result = applyDateFilter([rowOld, rowPrevYear, row2026] as OSRow[], null)
    expect(result.map(r => r.numos)).toEqual(['1', '2'])
  })

  it('mantém OS sem datacadastro (não rejeita por data)', () => {
    const result = applyDateFilter([rowSemData] as OSRow[], null)
    expect(result).toHaveLength(1)
  })

  it('filtra por range de UI dentro de 2026', () => {
    const from = new Date(2026, 0, 1)
    const to   = new Date(2026, 2, 31, 23, 59, 59)
    const rowAbr = { numos: '4', datacadastro: '10/04/2026', descsituacao: 'Pendente' }
    const filter = { from, to, campo: 'datacadastro', preset: 'custom' } as DateFilter
    const result = applyDateFilter([row2026, rowAbr] as OSRow[], filter)
    expect(result.map(r => r.numos)).toEqual(['2'])
  })
})

// ─── buildDashboard ───────────────────────────────────────────────────────────

describe('buildDashboard', () => {
  const rows = enrichRows([
    makeOS({ numos: 'D1', descsituacao: 'Pendente',    datacadastro: daysAgo(3), nomedaequipe: 'MANUTENCAO M01', tiposervico: 'MANUTENCAO' }),
    makeOS({ numos: 'D2', descsituacao: 'Atendimento', datacadastro: daysAgo(2), nomedaequipe: 'MANUTENCAO M01', tiposervico: 'MANUTENCAO' }),
    makeOS({ numos: 'D3', descsituacao: 'Concluída',   datacadastro: daysAgo(1), nomedaequipe: 'MANUTENCAO M01', tiposervico: 'MANUTENCAO' }),
  ])

  it('retorna 12 KPIs', () => {
    const { kpis } = buildDashboard(rows)
    expect(kpis).toHaveLength(12)
  })

  it('total conta apenas Pendente + Atendimento', () => {
    const { kpis } = buildDashboard(rows)
    const total = kpis.find(k => k.id === 'total')!
    expect(total.value).toBe(2)
  })

  it('concl conta apenas Concluídas', () => {
    const { kpis } = buildDashboard(rows)
    const concl = kpis.find(k => k.id === 'concl')!
    expect(concl.value).toBe(1)
  })

  it('diferencia os três subtipos de reagendamento', () => {
    const reagRows = enrichRows([
      makeOS({ numos: 'RI', descsituacao: 'Pendente', nomedaequipe: 'REAGENDAMENTO - INVIABILIDADE' }),
      makeOS({ numos: 'RM', descsituacao: 'Pendente', nomedaequipe: 'REAGENDAMENTO O.S MOBILE' }),
      makeOS({ numos: 'RF1', descsituacao: 'Pendente', nomedaequipe: 'REAGENDAMENTO F01' }),
      makeOS({ numos: 'RF2', descsituacao: 'Atendimento', nomedaequipe: 'REAGENDAMENTO' }),
    ])
    const { kpis } = buildDashboard(reagRows)
    expect(kpis.find(k => k.id === 'reagendInviab')!.value).toBe(1)
    expect(kpis.find(k => k.id === 'reagendMobile')!.value).toBe(1)
    expect(kpis.find(k => k.id === 'reagendFutura')!.value).toBe(2)
  })

  it('copeAguardando conta OS ativas paradas em equipes COPE, ignora concluídas', () => {
    const copeRows = enrichRows([
      makeOS({ numos: 'CP1', descsituacao: 'Pendente',    nomedaequipe: 'COPE - MANUTENCAO' }),
      makeOS({ numos: 'CP2', descsituacao: 'Atendimento', nomedaequipe: 'COPE - INSTALACAO' }),
      makeOS({ numos: 'CP3', descsituacao: 'Concluída',   nomedaequipe: 'COPE - MANUTENCAO' }),
    ])
    const { kpis } = buildDashboard(copeRows)
    expect(kpis.find(k => k.id === 'copeAguardando')!.value).toBe(2)
  })

  it('OS Críticas conta apenas críticas agendadas para hoje', () => {
    const n = new Date()
    const hoje = `${String(n.getDate()).padStart(2, '0')}/${String(n.getMonth() + 1).padStart(2, '0')}/${n.getFullYear()}`
    const critRows = enrichRows([
      makeOS({ numos: 'C1', descsituacao: 'Pendente', tiposervico: 'MANUTENCAO', datacadastro: daysAgo(6), dataagendamento: hoje }),
      makeOS({ numos: 'C2', descsituacao: 'Pendente', tiposervico: 'MANUTENCAO', datacadastro: daysAgo(6), dataagendamento: '01/01/2020' }),
    ])
    const { kpis, pulso } = buildDashboard(critRows)
    expect(kpis.find(k => k.id === 'criticas')!.value).toBe(1)   // só a agendada hoje
    expect((pulso as { criticasTotal: number }).criticasTotal).toBe(2) // todas as críticas preservadas
  })

  it('retorna array de fornecedores', () => {
    const { fornecedores } = buildDashboard(rows)
    expect(Array.isArray(fornecedores)).toBe(true)
  })

  it('aceita allRows separado para fila ativa', () => {
    const all = enrichRows([
      makeOS({ numos: 'A1', descsituacao: 'Pendente', datacadastro: daysAgo(1), nomedaequipe: 'MANUTENCAO M01', tiposervico: 'MANUTENCAO' }),
    ])
    const { kpis } = buildDashboard(rows, all)
    const total = kpis.find(k => k.id === 'total')!
    expect(total.value).toBe(1)
  })
})

// ─── buildSla ─────────────────────────────────────────────────────────────────

describe('buildSla', () => {
  it('retorna pulso com score entre 0 e 100', () => {
    const rows = enrichRows([
      makeOS({ numos: 'S1', descsituacao: 'Pendente', datacadastro: daysAgo(1), nomedaequipe: 'M01', tiposervico: 'MANUTENCAO' }),
      makeOS({ numos: 'S2', descsituacao: 'Concluída', datacadastro: daysAgo(1), nomedaequipe: 'M01', tiposervico: 'MANUTENCAO' }),
    ])
    const { pulso } = buildSla(rows)
    expect(pulso.score).toBeGreaterThanOrEqual(0)
    expect(pulso.score).toBeLessThanOrEqual(100)
  })

  it('retorna hipoteses, resumo, ranking, semaforo', () => {
    const rows = enrichRows([
      makeOS({ numos: 'S3', descsituacao: 'Pendente', datacadastro: daysAgo(2), nomedaequipe: 'M01', tiposervico: 'MANUTENCAO' }),
    ])
    const result = buildSla(rows)
    expect(Array.isArray(result.hipoteses)).toBe(true)
    expect(Array.isArray(result.resumo)).toBe(true)
    expect(Array.isArray(result.ranking)).toBe(true)
    expect(Array.isArray(result.semaforo)).toBe(true)
  })

  it('equipe sem OS ativas não aparece no semaforo', () => {
    const rows = enrichRows([
      makeOS({ numos: 'S4', descsituacao: 'Concluída', datacadastro: daysAgo(1), nomedaequipe: 'M02' }),
    ])
    const { semaforo } = buildSla(rows)
    expect(semaforo.every(e => e.total > 0)).toBe(true)
  })
})

// ─── parseDate ────────────────────────────────────────────────────────────────

describe('parseDate', () => {
  it('parseia formato DD/MM/YYYY', () => {
    const d = parseDate('15/06/2025')
    expect(d).not.toBeNull()
    expect(d!.getDate()).toBe(15)
    expect(d!.getMonth()).toBe(5)
    expect(d!.getFullYear()).toBe(2025)
  })

  it('retorna null para formato ISO YYYY-MM-DD (não suportado — usa DD/MM/YYYY)', () => {
    // parseDate usa DD/MM/YYYY; formato ISO não é suportado propositalmente
    expect(parseDate('2025-06-15')).toBeNull()
  })

  it('retorna null para string vazia', () => {
    expect(parseDate('')).toBeNull()
    expect(parseDate(null)).toBeNull()
    expect(parseDate(undefined)).toBeNull()
  })

  it('retorna null para data inválida (dia 32)', () => {
    expect(parseDate('32/01/2025')).toBeNull()
  })

  it('retorna null para mês inválido (mês 13)', () => {
    expect(parseDate('01/13/2025')).toBeNull()
  })

  it('parseia data com hora (ignora parte de hora)', () => {
    const d = parseDate('10/04/2025 08:30')
    expect(d).not.toBeNull()
    expect(d!.getDate()).toBe(10)
  })

  it('retorna null para string sem 3 partes', () => {
    expect(parseDate('15/2025')).toBeNull()
    expect(parseDate('abc')).toBeNull()
  })
})

describe('parseDateTime', () => {
  it('parseia data com hora', () => {
    const dt = parseDateTime('22/06/2026 14:35')
    expect(dt?.getFullYear()).toBe(2026)
    expect(dt?.getMonth()).toBe(5)
    expect(dt?.getDate()).toBe(22)
    expect(dt?.getHours()).toBe(14)
    expect(dt?.getMinutes()).toBe(35)
  })

  it('parseia data sem hora assumindo 00:00', () => {
    const dt = parseDateTime('22/06/2026')
    expect(dt?.getHours()).toBe(0)
    expect(dt?.getMinutes()).toBe(0)
  })

  it('retorna null para string vazia ou nula', () => {
    expect(parseDateTime('')).toBeNull()
    expect(parseDateTime(null)).toBeNull()
  })

  it('retorna null para data inválida', () => {
    expect(parseDateTime('32/13/2026')).toBeNull()
  })

  it('retorna null para lixo após a hora', () => {
    expect(parseDateTime('22/06/2026 14:35 lixo')).toBeNull()
  })

  it('retorna null para hora fora do intervalo', () => {
    expect(parseDateTime('22/06/2026 25:99')).toBeNull()
  })
})

// ─── isConcluida / isExecucaoReal ─────────────────────────────────────────────

describe('isConcluida', () => {
  it('Concluída retorna true', () => {
    expect(isConcluida('Concluída')).toBe(true)
  })

  it('Concluída/Sem Execução retorna true', () => {
    expect(isConcluida('Concluída/Sem Execução')).toBe(true)
  })

  it('Atendimento/Finalizadas retorna true', () => {
    expect(isConcluida('Atendimento/Finalizadas')).toBe(true)
  })

  it('Pendente retorna false', () => {
    expect(isConcluida('Pendente')).toBe(false)
  })

  it('null/undefined retorna false', () => {
    expect(isConcluida(null)).toBe(false)
    expect(isConcluida(undefined)).toBe(false)
  })
})

describe('isExecucaoReal', () => {
  it('Concluída retorna true', () => {
    expect(isExecucaoReal('Concluída')).toBe(true)
  })

  it('Concluída/Sem Execução retorna false (não é execução real)', () => {
    expect(isExecucaoReal('Concluída/Sem Execução')).toBe(false)
  })

  it('Atendimento/Finalizadas retorna true', () => {
    expect(isExecucaoReal('Atendimento/Finalizadas')).toBe(true)
  })

  it('Pendente retorna false', () => {
    expect(isExecucaoReal('Pendente')).toBe(false)
  })
})

describe('isFilaAtiva', () => {
  it('Pendente retorna true', () => {
    expect(isFilaAtiva('Pendente')).toBe(true)
  })

  it('Atendimento retorna true', () => {
    expect(isFilaAtiva('Atendimento')).toBe(true)
  })

  it('Concluída retorna false', () => {
    expect(isFilaAtiva('Concluída')).toBe(false)
  })

  it('Concluída/Sem Execução retorna false', () => {
    expect(isFilaAtiva('Concluída/Sem Execução')).toBe(false)
  })

  it('Reagendamento retorna false', () => {
    expect(isFilaAtiva('Reagendamento')).toBe(false)
  })

  it('null/undefined retorna false', () => {
    expect(isFilaAtiva(null)).toBe(false)
    expect(isFilaAtiva(undefined)).toBe(false)
  })
})

// ─── buildAnomalias ───────────────────────────────────────────────────────────

describe('buildAnomalias', () => {
  it('retorna estrutura com total, picosDia, bairrosAnomalia, equipesAnomalia', () => {
    const rows = enrichRows([
      makeOS({ numos: 'AN1', datacadastro: daysAgo(1), bairro: 'Centro', nomedaequipe: 'M01', tiposervico: 'MANUTENCAO', descsituacao: 'Pendente' }),
    ])
    const result = buildAnomalias(rows)
    expect(typeof result.total).toBe('number')
    expect(Array.isArray(result.picosDia)).toBe(true)
    expect(Array.isArray(result.bairrosAnomalia)).toBe(true)
    expect(Array.isArray(result.equipesAnomalia)).toBe(true)
  })

  it('retorna total zero para dataset vazio', () => {
    const result = buildAnomalias([])
    expect(result.total).toBe(0)
    expect(result.picosDia).toHaveLength(0)
    expect(result.bairrosAnomalia).toHaveLength(0)
    expect(result.equipesAnomalia).toHaveLength(0)
  })

  it('picosDia tem campos date, count e zScore', () => {
    const rows: OSRow[] = []
    const peakDate = daysAgo(5)
    for (let i = 0; i < 20; i++) {
      rows.push(makeOS({ numos: `P${i}`, datacadastro: peakDate, descsituacao: 'Pendente', tiposervico: 'MANUTENCAO' }))
    }
    // picosDia exige (count > média + 2×desvio padrão) — com só 2 dias distintos essa
    // condição é matematicamente impossível de satisfazer (o dia maior nunca ultrapassa
    // média + 2×desvio quando há apenas 1 outro dia). Por isso o dataset precisa de
    // vários dias de baixo volume ao redor do dia de pico para o cálculo estatístico
    // conseguir de fato detectar o pico (bug já ocorreu: ver commit que corrige esta suite).
    ;[1, 2, 3, 4, 6, 7].forEach(n => {
      rows.push(makeOS({ numos: `N${n}`, datacadastro: daysAgo(n), descsituacao: 'Pendente', tiposervico: 'MANUTENCAO' }))
    })
    const enriched = enrichRows(rows)
    const result   = buildAnomalias(enriched)
    // Garante que o dia de pico foi de fato detectado — sem isso, o forEach abaixo
    // passaria trivialmente mesmo com picosDia vazio.
    expect(result.picosDia.length).toBeGreaterThan(0)
    result.picosDia.forEach(p => {
      expect(typeof p.date).toBe('string')
      expect(typeof p.count).toBe('number')
      expect(typeof p.zScore).toBe('number')
    })
  })
})

// ─── buildCidades ─────────────────────────────────────────────────────────────

describe('buildCidades', () => {
  const rows = enrichRows([
    makeOS({ numos: 'CID1', nomedacidade: 'TAUBATE',    descsituacao: 'Pendente',  tiposervico: 'MANUTENCAO', datacadastro: daysAgo(2) }),
    makeOS({ numos: 'CID2', nomedacidade: 'TAUBATE',    descsituacao: 'Concluída', tiposervico: 'MANUTENCAO', datacadastro: daysAgo(2) }),
    makeOS({ numos: 'CID3', nomedacidade: 'CAÇAPAVA',   descsituacao: 'Pendente',  tiposervico: 'MANUTENCAO', datacadastro: daysAgo(3) }),
    makeOS({ numos: 'CID4', nomedacidade: 'SAO JOSE DOS CAMPOS', descsituacao: 'Atendimento', tiposervico: 'MANUTENCAO', datacadastro: daysAgo(1) }),
  ])

  it('retorna saude e kpis', () => {
    const result = buildCidades(rows)
    expect(Array.isArray(result.saude)).toBe(true)
    expect(Array.isArray(result.kpis)).toBe(true)
    expect(result.saude.length).toBeGreaterThan(0)
  })

  it('saude tem campos cidade, fila, criticas, slaPct, backlogDias', () => {
    const { saude } = buildCidades(rows)
    saude.forEach(c => {
      expect(typeof c.cidade).toBe('string')
      expect(typeof c.fila).toBe('number')
      expect(typeof c.criticas).toBe('number')
      expect(typeof c.slaPct).toBe('number')
      expect(c.backlogDias === null || typeof c.backlogDias === 'number').toBe(true)
    })
  })

  it('city vazia é mapeada como "Sem cidade" pelo builder', () => {
    const empty = enrichRows([makeOS({ numos: 'E1', nomedacidade: '', descsituacao: 'Pendente' })])
    const result = buildCidades(empty)
    expect(result.saude.find(c => c.cidade === 'Sem cidade')?.fila).toBe(1)
  })
})
