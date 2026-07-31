import { describe, it, expect } from 'vitest'
import { enrichRows } from '../transform'
import { buildRevisitas } from './revisitas'
import type { OSRow } from '../types'

// buildRevisitas nunca teve teste antes desta suíte — 241 linhas de cruzamento
// cliente×mês, ordenação por execução e três tipos de par (inst→manut,
// manut→manut, serv→manut), sem rede de segurança nenhuma. Esta suíte trava o
// comportamento ATUAL antes de a próxima entrega (custo de revisita por
// fornecedor) tocar na função — ver .planning/specs/2026-07-31-fornecedor-custo-revisita-design.md.

function makeOS(overrides: Record<string, unknown> = {}): OSRow {
  return {
    numos:           '0000001',
    codigocliente:   'CLI1',
    nomecliente:     'CLIENTE TESTE', // enrichRows sanitiza nomecliente para maiúsculas
    nomedacidade:    'TAUBATE',
    nomedaequipe:    'EQUIPE F08',
    tiposervico:     'INSTALACAO',
    servico:         'INSTALACAO',
    descsituacao:    'Concluída',
    datacadastro:    '',
    dataagendamento: '',
    dataexecucao:    '',
    databaixa:       '',
    bairro:          'CENTRO',
    logradouro:      '',
    complemento:     '',
    numero:          '',
    empresa:         '',
    obs:             '',
    periodo:         '',
    ...overrides,
  } as unknown as OSRow
}

// ─── Filtragem de base ──────────────────────────────────────────────────────

describe('buildRevisitas — exclusão de COPE e Reagendamento da base', () => {
  it('OS de equipe COPE não conta na base nem forma par', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', nomedaequipe: 'COPE VALE', tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' }),
      makeOS({ numos: '2', nomedaequipe: 'COPE VALE', tiposervico: 'MANUTENCAO', dataexecucao: '12/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.base.total).toBe(0)
    expect(r.totalRevisitas).toBe(0)
  })

  it('OS de equipe de Reagendamento não conta na base nem forma par', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', nomedaequipe: 'REAGENDAMENTO F08', tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' }),
      makeOS({ numos: '2', nomedaequipe: 'REAGENDAMENTO F08', tiposervico: 'MANUTENCAO', dataexecucao: '12/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.base.total).toBe(0)
  })
})

// ─── Pareamento instalação → manutenção ────────────────────────────────────

describe('buildRevisitas — par instalação → manutenção', () => {
  it('gera um evento de revisita com os dias corretos entre execução da instalação e da manutenção', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: '12/03/2026', numero: '2' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.totalRevisitas).toBe(1)
    expect(r.revInst).toBe(1)
    expect(r.tempoMedio).toBe(7)
  })

  it('uma manutenção por instalação para cada manutenção subsequente no mesmo cliente-mês', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '01/03/2026' }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: '10/03/2026' }),
      makeOS({ numos: '3', tiposervico: 'MANUTENCAO', dataexecucao: '20/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    // 2 manutenções após 1 instalação → 2 eventos tipo 'inst', mais 1 evento
    // manut→manut entre as duas manutenções (par 2 e 3) — comportamento atual:
    // os três tipos de par não são mutuamente exclusivos no mesmo grupo.
    expect(r.revInst).toBe(2)
    expect(r.revManut).toBe(1)
  })

  it('instalação sem nenhuma manutenção no mesmo cliente-mês não gera revisita', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.totalRevisitas).toBe(0)
  })
})

// ─── Pareamento manutenção → manutenção (retrabalho) ───────────────────────

describe('buildRevisitas — par manutenção → manutenção (retrabalho)', () => {
  it('duas manutenções no mesmo cliente-mês geram um evento entre a 1ª e a 2ª', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'MANUTENCAO', dataexecucao: '03/03/2026' }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: '15/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.revManut).toBe(1)
    expect(r.tempoMedio).toBe(12)
  })

  it('três manutenções geram dois eventos — pares consecutivos, não todos-contra-todos', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'MANUTENCAO', dataexecucao: '01/03/2026' }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: '10/03/2026' }),
      makeOS({ numos: '3', tiposervico: 'MANUTENCAO', dataexecucao: '25/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.revManut).toBe(2)
  })

  it('uma única manutenção isolada não gera revisita', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'MANUTENCAO', dataexecucao: '05/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.totalRevisitas).toBe(0)
  })
})

// ─── Pareamento serviço → manutenção ────────────────────────────────────────

describe('buildRevisitas — par serviço → manutenção', () => {
  it('serviço seguido de manutenção no mesmo cliente-mês gera revisita tipo serv', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'OUTRO', servico: 'CONFIGURACAO', dataexecucao: '02/03/2026' }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: '09/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.revServ).toBe(1)
  })
})

// ─── Isolamento por mês e por cliente ───────────────────────────────────────

describe('buildRevisitas — o pareamento é por cliente E por mês de execução', () => {
  it('mesmo cliente, meses diferentes — não forma par (cada mês é um grupo isolado)', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '28/01/2026' }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: '03/02/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.totalRevisitas).toBe(0)
  })

  it('clientes diferentes no mesmo mês não se misturam', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', codigocliente: 'A', tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' }),
      makeOS({ numos: '2', codigocliente: 'B', tiposervico: 'MANUTENCAO', dataexecucao: '12/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.totalRevisitas).toBe(0)
  })

  it('sem codigocliente, usa nomecliente como chave de agrupamento', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', codigocliente: '', nomecliente: 'Maria Silva', tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' }),
      makeOS({ numos: '2', codigocliente: '', nomecliente: 'Maria Silva', tiposervico: 'MANUTENCAO', dataexecucao: '12/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.totalRevisitas).toBe(1)
  })

  it('sem data de execução nem de baixa, a OS não entra em nenhum grupo', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '', databaixa: '' }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: '12/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.totalRevisitas).toBe(0)
  })

  it('databaixa serve de data de execução quando dataexecucao está vazia', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '', databaixa: '05/03/2026' }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: '12/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.totalRevisitas).toBe(1)
  })
})

// ─── porEquipe e porCidade — atribuição pela OS DE RETORNO ─────────────────

describe('buildRevisitas — porEquipe e porCidade atribuem à equipe/cidade da OS de revisita', () => {
  it('a revisita conta para a equipe e cidade da OS DE RETORNO, não da OS de origem', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', nomedaequipe: 'EQUIPE F08', nomedacidade: 'TAUBATE',  tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' }),
      makeOS({ numos: '2', nomedaequipe: 'EQUIPE F01', nomedacidade: 'CACAPAVA', tiposervico: 'MANUTENCAO', dataexecucao: '12/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.porEquipe.find(e => e.equipe === 'EQUIPE F01')?.total).toBe(1)
    expect(r.porEquipe.find(e => e.equipe === 'EQUIPE F08')).toBeUndefined()
    // porCidade usa `revisitas`, não `total` — nome de campo diferente de
    // porEquipe para a mesma noção de contagem. Ver nota de tipo divergente
    // abaixo: RevisitasData declara { cidade, total, taxa }, mas a implementação
    // devolve { cidade, revisitas, totalBase, taxa }. `total` não existe aqui.
    expect(r.porCidade.find(c => c.cidade === 'CACAPAVA')?.revisitas).toBe(1)
  })

  it('equipe vazia cai no bucket "Sem equipe"', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' }),
      makeOS({ numos: '2', nomedaequipe: '', tiposervico: 'MANUTENCAO', dataexecucao: '12/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.porEquipe.find(e => e.equipe === 'Sem equipe')?.total).toBe(1)
  })
})

// ─── Clientes crônicos ──────────────────────────────────────────────────────

describe('buildRevisitas — clientes crônicos', () => {
  it('cliente com 3 ou mais OS no total (não só revisitas) entra na lista de crônicos', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '01/01/2026' }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: '01/02/2026' }),
      makeOS({ numos: '3', tiposervico: 'MANUTENCAO', dataexecucao: '01/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.cronicos.find(c => c.cliente === 'CLIENTE TESTE')?.count).toBe(3)
  })

  it('cliente com apenas 2 OS não entra na lista de crônicos', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '01/01/2026' }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: '01/02/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.cronicos).toHaveLength(0)
  })
})

// ─── Taxas, evitáveis e custo estimado — trava a fórmula ATUAL ─────────────

describe('buildRevisitas — evitaveis e custoEstimado usam as constantes não calibradas ATUAIS', () => {
  // Trava a fórmula de hoje (revInst*0.70 + revManut*0.50, custo fixo de R$180)
  // exatamente para que a próxima entrega (custo real por fornecedor) tenha uma
  // rede de segurança ao alterar esta função — ver spec de custo de revisita.
  it('evitaveis.count = round(revInst*0.70 + revManut*0.50)', () => {
    const rows = enrichRows([
      // 1 par inst→manut
      makeOS({ numos: '1', codigocliente: 'A', tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' }),
      makeOS({ numos: '2', codigocliente: 'A', tiposervico: 'MANUTENCAO', dataexecucao: '12/03/2026' }),
      // 1 par manut→manut
      makeOS({ numos: '3', codigocliente: 'B', tiposervico: 'MANUTENCAO', dataexecucao: '01/03/2026' }),
      makeOS({ numos: '4', codigocliente: 'B', tiposervico: 'MANUTENCAO', dataexecucao: '10/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.revInst).toBe(1)
    expect(r.revManut).toBe(1)
    expect(r.evitaveis.count).toBe(Math.round(1 * 0.70 + 1 * 0.50))
  })

  it('custoEstimado = totalRevisitas × R$180, igual para qualquer fornecedor', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: '12/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.custoEstimado).toBe(r.totalRevisitas * 180)
  })

  it('sem revisitas, evitaveis e custoEstimado são zero', () => {
    const rows = enrichRows([makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' })])
    const r = buildRevisitas(rows)
    expect(r.evitaveis).toEqual({ count: 0, pct: 0 })
    expect(r.custoEstimado).toBe(0)
  })
})

// ─── Distribuição por dias ──────────────────────────────────────────────────

describe('buildRevisitas — diasDist bucketiza nas fronteiras corretas', () => {
  it.each([
    [7,  '1-7'],
    [8,  '8-14'],
    [14, '8-14'],
    [15, '15-20'],
    [20, '15-20'],
    [21, '21-30'],
  ])('%i dias cai no bucket %s', (dias, bucket) => {
    const dataInst = '01/03/2026'
    const d = new Date(2026, 2, 1 + dias)
    const dataManut = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: dataInst }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: dataManut }),
    ])
    const r = buildRevisitas(rows)
    expect(r.diasDist[bucket as keyof typeof r.diasDist]).toBe(1)
  })
})

// ─── Tendência vs. período anterior ─────────────────────────────────────────

describe('buildRevisitas — tendencia', () => {
  it('sem prevRows, prevTaxa é zero e delta é igual à taxa atual', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: '12/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.tendencia.prevTaxa).toBe(0)
    expect(r.tendencia.delta).toBe(r.taxa.geral)
  })

  it('com prevRows sem nenhuma revisita, prevTaxa é zero', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: '12/03/2026' }),
    ])
    const prevRows = enrichRows([
      makeOS({ numos: '9', tiposervico: 'INSTALACAO', dataexecucao: '05/02/2026' }),
    ])
    const r = buildRevisitas(rows, prevRows)
    expect(r.tendencia.prevTaxa).toBe(0)
  })
})

// ─── Narrativa e hipóteses ───────────────────────────────────────────────────

describe('buildRevisitas — narrativa', () => {
  it('sem nenhuma revisita, narrativa é a mensagem fixa de ausência', () => {
    const rows = enrichRows([makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' })])
    const r = buildRevisitas(rows)
    expect(r.narrativa).toBe('Nenhuma revisita detectada no período selecionado.')
  })

  it('com revisitas, a narrativa cita a taxa geral e o custo estimado', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: '12/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.narrativa).toContain(`Taxa geral: ${r.taxa.geral}%`)
    expect(r.narrativa).toContain(`R$ ${r.custoEstimado.toLocaleString('pt-BR')}`)
  })
})

describe('buildRevisitas — hipoteses reflete as três taxas', () => {
  it('expõe taxa de instalação, manutenção e serviço nas três primeiras hipóteses', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', tiposervico: 'INSTALACAO', dataexecucao: '05/03/2026' }),
      makeOS({ numos: '2', tiposervico: 'MANUTENCAO', dataexecucao: '12/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.hipoteses).toHaveLength(3)
    expect(r.hipoteses[0].pergunta).toBe('Taxa em instalações')
    expect(r.hipoteses[0].resposta).toBe(`${r.taxa.inst}%`)
  })
})

// ─── Cenário de domínio: WES, Instacable, THM e REDE fazem os três tipos ────
//
// WES, Instacable e THM são equipes que fazem instalação, manutenção e serviço
// com o MESMO código de frente — não trocam de fornecedor entre um tipo e
// outro. A equipe de Rede faz serviços de rede, instalação e manutenção quando
// necessário. Este bloco fixa esse comportamento com fixtures realistas, para
// que a próxima entrega (fornecedor por revisita) tenha uma base já validada
// em vez de inventar fixtures do zero.

describe('buildRevisitas — cenário de domínio: WES/Instacable/THM/REDE fazem os três tipos', () => {
  it('WES instala e depois faz a manutenção de retorno com a mesma equipe', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', nomedaequipe: 'EQUIPE F08', tiposervico: 'INSTALACAO', dataexecucao: '02/03/2026' }),
      makeOS({ numos: '2', nomedaequipe: 'EQUIPE F08', tiposervico: 'MANUTENCAO', dataexecucao: '09/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.revInst).toBe(1)
    expect(r.porEquipe.find(e => e.equipe === 'EQUIPE F08')?.total).toBe(1)
  })

  it('Instacable e THM geram revisitas isoladas uma da outra, mesmo no mesmo mês', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', codigocliente: 'A', nomedaequipe: 'EQUIPE F01', tiposervico: 'INSTALACAO', dataexecucao: '02/03/2026' }),
      makeOS({ numos: '2', codigocliente: 'A', nomedaequipe: 'EQUIPE F01', tiposervico: 'MANUTENCAO', dataexecucao: '09/03/2026' }),
      makeOS({ numos: '3', codigocliente: 'B', nomedaequipe: 'EQUIPE F12', tiposervico: 'INSTALACAO', dataexecucao: '03/03/2026' }),
      makeOS({ numos: '4', codigocliente: 'B', nomedaequipe: 'EQUIPE F12', tiposervico: 'MANUTENCAO', dataexecucao: '11/03/2026' }),
    ])
    const r = buildRevisitas(rows)
    expect(r.revInst).toBe(2)
    expect(r.porEquipe.find(e => e.equipe === 'EQUIPE F01')?.total).toBe(1)
    expect(r.porEquipe.find(e => e.equipe === 'EQUIPE F12')?.total).toBe(1)
  })

  // ACHADO ao escrever este teste, não comportamento desejado: getEquipeTipo
  // testa "REDE" no NOME da equipe antes de olhar tiposervico —
  // (/\bREDE\b/.test(nomedaequipe)) vence e força _tipo='REDE' mesmo quando a
  // OS é uma instalação ou manutenção de verdade. buildRevisitas só bucketiza
  // _tipo em 'INSTALACAO'|'MANUTENCAO'|'OUTRO'; 'REDE' não cai em nenhum dos
  // três, então cai no chão silenciosamente. Resultado: a equipe de Rede faz
  // instalação e manutenção "quando é preciso" (conforme o usuário descreveu),
  // mas o detector de revisita está estruturalmente cego pra ela — nenhuma
  // revisita de Rede jamais aparece em taxa, porEquipe, custoEstimado, nada.
  // Não corrigido aqui: exige decisão de produto (Rede ganha seu próprio
  // pareamento de revisita, ou a introspeção de _tipo muda), fora do escopo
  // desta suíte de regressão.
  it('DOCUMENTA o achado: revisita da equipe de Rede não é detectada, porque _tipo trava em REDE', () => {
    const rows = enrichRows([
      makeOS({ numos: '1', nomedaequipe: '03-VAL - REDE FIBRA', tiposervico: 'INSTALACAO', dataexecucao: '02/03/2026' }),
      makeOS({ numos: '2', nomedaequipe: '03-VAL - REDE FIBRA', tiposervico: 'MANUTENCAO', dataexecucao: '09/03/2026' }),
    ])
    expect(rows[0]._tipo).toBe('REDE')
    expect(rows[1]._tipo).toBe('REDE')
    const r = buildRevisitas(rows)
    expect(r.totalRevisitas).toBe(0)
    expect(r.porEquipe.find(e => e.equipe === '03-VAL - REDE FIBRA')).toBeUndefined()
  })
})
