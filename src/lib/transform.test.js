import { describe, it, expect } from 'vitest'
import { enrichRows, getFornecedor, parseCSV, applyDateFilter } from './transform.js'
import { buildDashboard, buildSla, buildCapacidade } from './builders.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOS(overrides = {}) {
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
  }
}

// Retorna uma data no formato DD/MM/YYYY com offset de dias em relação a hoje
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function _daysAhead(n) {
  return daysAgo(-n)
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

  it('_slaExcedido = true quando agendamento > limite (Pendente)', () => {
    const os = makeOS({
      descsituacao:    'Pendente',
      datacadastro:    daysAgo(10),
      dataagendamento: daysAgo(8),   // 2 dias após abertura — excede limite Manutenção (1d)
      tiposervico:     'MANUTENCAO',
    })
    const [r] = enrichRows([os])
    expect(r._slaExcedido).toBe(true)
  })

  it('_slaExcedido = false quando agendamento dentro do limite', () => {
    const os = makeOS({
      descsituacao:    'Pendente',
      datacadastro:    daysAgo(5),
      dataagendamento: daysAgo(4),   // 1 dia após abertura — dentro do limite (1d)
      tiposervico:     'MANUTENCAO',
    })
    const [r] = enrichRows([os])
    expect(r._slaExcedido).toBe(false)
  })

  it('_slaCritico = true quando SLA > 2× o limite', () => {
    const os = makeOS({
      descsituacao:    'Pendente',
      datacadastro:    daysAgo(10),
      dataagendamento: daysAgo(7),   // 3 dias > 2× limite manutenção (1d)
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
  function row(nome) { return `numos,nomecliente,nomedacidade\n9069512,${nome},TAUBATE` }

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
    const result = applyDateFilter([rowPrevYear, row2026], null)
    expect(result.map(r => r.numos)).toEqual(['1', '2'])
  })

  it('rejeita OS de dois anos atrás', () => {
    const result = applyDateFilter([rowOld, rowPrevYear, row2026], null)
    expect(result.map(r => r.numos)).toEqual(['1', '2'])
  })

  it('mantém OS sem datacadastro (não rejeita por data)', () => {
    const result = applyDateFilter([rowSemData], null)
    expect(result).toHaveLength(1)
  })

  it('filtra por range de UI dentro de 2026', () => {
    const from = new Date(2026, 0, 1)
    const to   = new Date(2026, 2, 31, 23, 59, 59)
    const rowAbr = { numos: '4', datacadastro: '10/04/2026', descsituacao: 'Pendente' }
    const result = applyDateFilter([row2026, rowAbr], { from, to })
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

  it('retorna 8 KPIs', () => {
    const { kpis } = buildDashboard(rows)
    expect(kpis).toHaveLength(8)
  })

  it('total conta apenas Pendente + Atendimento', () => {
    const { kpis } = buildDashboard(rows)
    const total = kpis.find(k => k.id === 'total')
    expect(total.value).toBe(2)
  })

  it('concl conta apenas Concluídas', () => {
    const { kpis } = buildDashboard(rows)
    const concl = kpis.find(k => k.id === 'concl')
    expect(concl.value).toBe(1)
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
    const total = kpis.find(k => k.id === 'total')
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

// ─── buildCapacidade ──────────────────────────────────────────────────────────

describe('buildCapacidade', () => {
  const rows = enrichRows([
    makeOS({ numos: 'C1', descsituacao: 'Concluída', nomedaequipe: 'EQUIPE A', tiposervico: 'MANUTENCAO', datacadastro: daysAgo(5) }),
    makeOS({ numos: 'C2', descsituacao: 'Pendente',  nomedaequipe: 'EQUIPE A', tiposervico: 'MANUTENCAO', datacadastro: daysAgo(1) }),
    makeOS({ numos: 'C3', descsituacao: 'Pendente',  nomedaequipe: 'EQUIPE B', tiposervico: 'MANUTENCAO', datacadastro: daysAgo(1) }),
  ])

  it('retorna estrutura completa com executivo, equipes, semaforo e cobertura', () => {
    const result = buildCapacidade(rows)
    expect(result.executivo).toBeDefined()
    expect(Array.isArray(result.equipes)).toBe(true)
    expect(Array.isArray(result.semaforo)).toBe(true)
    expect(result.cobertura).toHaveLength(4)
  })

  it('fila conta apenas Pendente e Atendimento', () => {
    const { executivo } = buildCapacidade(rows)
    expect(executivo.fila).toBe(2)
  })

  it('hipoteses tem 3 perguntas', () => {
    const { hipoteses } = buildCapacidade(rows)
    expect(hipoteses).toHaveLength(3)
  })

  it('equipes têm nome, total, concluidas e taxa', () => {
    const { equipes } = buildCapacidade(rows)
    expect(equipes.length).toBeGreaterThan(0)
    equipes.forEach(e => {
      expect(e.nome).toBeDefined()
      expect(typeof e.total).toBe('number')
      expect(typeof e.taxa).toBe('number')
    })
  })
})
