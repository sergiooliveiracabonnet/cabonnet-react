import { describe, it, expect } from 'vitest'
import { enrichRows } from '../transform'
import { buildFila, filaUrgenciaTier } from './fila'
import type { OSRow } from '../types'

function makeOS(overrides: Record<string, unknown> = {}): OSRow {
  return {
    numos:           '0000001',
    nomecliente:     'CLIENTE TESTE',
    nomedacidade:    'TAUBATE',
    nomedaequipe:    'EQUIPE F01',
    tiposervico:     'Manutenção',
    servico:         'ASSISTENCIA - VT 24H',
    descsituacao:    'Concluída',
    datacadastro:    '01/06/2026 08:00',
    dataagendamento: '',
    dataexecucao:    '01/06/2026 18:00',  // 10h após cadastro → dentro de VT 24h
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

// Helper para OS em aberto (entra nos painéis de carga)
function makeAberta(overrides: Record<string, unknown> = {}): OSRow {
  return makeOS({ descsituacao: 'Pendente', dataexecucao: '', ...overrides })
}

describe('buildFila — cumprimento', () => {
  it('retorna cumprimento zerado para arrays vazios', () => {
    const { cumprimento } = buildFila([], [], [])
    expect(cumprimento.total).toBe(0)
    expect(cumprimento.noPrazo).toBe(0)
    expect(cumprimento.pct).toBeNull()
    expect(cumprimento.deltaPp).toBeNull()
  })

  it('ignora OS sem aferição de prazo (não executadas)', () => {
    const revisitas = enrichRows([
      makeOS({ numos: 'B', descsituacao: 'Pendente', dataexecucao: '' }),  // VT não executada
    ])
    const { cumprimento } = buildFila([], revisitas, [])
    expect(cumprimento.total).toBe(0)
    expect(cumprimento.pct).toBeNull()
  })

  it('calcula % no prazo sobre VT executadas', () => {
    const revisitas = enrichRows([
      makeOS({ numos: 'A', dataexecucao: '01/06/2026 18:00' }),  // 10h → no prazo
      makeOS({ numos: 'B', dataexecucao: '03/06/2026 18:00' }),  // 58h → fora (VT 24h)
      makeOS({ numos: 'C', dataexecucao: '01/06/2026 20:00' }),  // 12h → no prazo
      makeOS({ numos: 'D', dataexecucao: '01/06/2026 12:00' }),  // 4h  → no prazo
    ])
    const { cumprimento } = buildFila([], revisitas, [])
    expect(cumprimento.total).toBe(4)
    expect(cumprimento.noPrazo).toBe(3)
    expect(cumprimento.fora).toBe(1)
    expect(cumprimento.pct).toBe(75)
  })

  it('calcula % no prazo sobre não-VT executadas (SLA em dias)', () => {
    const revisitas = enrichRows([
      // Instalação, limite padrão 2 dias
      makeOS({ numos: 'A', servico: 'ASSISTENCIA TECNICA', tiposervico: 'Instalação', datacadastro: '01/06/2026 08:00', dataexecucao: '01/06/2026 18:00' }), // <1d → no prazo
      makeOS({ numos: 'B', servico: 'ASSISTENCIA TECNICA', tiposervico: 'Instalação', datacadastro: '01/06/2026 08:00', dataexecucao: '10/06/2026 18:00' }), // 9d → fora
    ])
    const { cumprimento } = buildFila([], revisitas, [])
    expect(cumprimento.total).toBe(2)
    expect(cumprimento.noPrazo).toBe(1)
    expect(cumprimento.pct).toBe(50)
  })

  it('calcula delta em pontos percentuais vs período anterior', () => {
    const atual = enrichRows([
      makeOS({ numos: 'A', dataexecucao: '01/06/2026 18:00' }),  // no prazo
      makeOS({ numos: 'B', dataexecucao: '01/06/2026 20:00' }),  // no prazo
    ]) // 100%
    const anterior = enrichRows([
      makeOS({ numos: 'X', dataexecucao: '01/06/2026 18:00' }),  // no prazo
      makeOS({ numos: 'Y', dataexecucao: '03/06/2026 18:00' }),  // fora
    ]) // 50%
    const { cumprimento } = buildFila([], atual, anterior)
    expect(cumprimento.pct).toBe(100)
    expect(cumprimento.prevPct).toBe(50)
    expect(cumprimento.deltaPp).toBe(50)
  })
})

// Formata (hoje − offset dias) como DD/MM/YYYY HH:MM
function execDia(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()} 10:00`
}

describe('buildFila — tendência 7 dias', () => {
  it('retorna 7 dias com zeros para entrada vazia', () => {
    const { tendencia } = buildFila([], [], [], [])
    expect(tendencia).toHaveLength(7)
    expect(tendencia.every(d => d.total === 0 && d.violadas === 0)).toBe(true)
    // ordem cronológica: último item é hoje
    const hoje = new Date()
    const dd = String(hoje.getDate()).padStart(2, '0')
    expect(tendencia[6].label.startsWith(dd)).toBe(true)
  })

  it('conta OS executadas fora do prazo por dia de execução (VT e não-VT juntos)', () => {
    const all = enrichRows([
      // hoje: 1 violada (VT 8h) + 1 no prazo (VT 24h)
      makeOS({ numos: 'H1', datacadastro: execDia(0).replace('10:00', '00:00'), dataexecucao: execDia(0) }), // 10h → no prazo (VT 24h)
      makeOS({ numos: 'H2', servico: 'VT 08H', datacadastro: execDia(0).replace('10:00', '00:00'), dataexecucao: execDia(0) }), // 10h > 8h → violada
      // ontem: 1 violada (não-VT, instalação limite 2d, executada 5d depois)
      makeOS({ numos: 'O1', servico: 'ASSISTENCIA TECNICA', tiposervico: 'Instalação', datacadastro: execDia(6), dataexecucao: execDia(1) }), // 5d > 2d → violada
    ])
    const { tendencia } = buildFila([], [], [], all)
    expect(tendencia[6].total).toBe(2)     // hoje
    expect(tendencia[6].violadas).toBe(1)  // hoje: só a VT08h
    expect(tendencia[5].violadas).toBe(1)  // ontem: a não-VT
  })
})

describe('buildFila — carga', () => {
  it('retorna carga vazia para arrays vazios', () => {
    const { cargaFornecedor, cargaCidade } = buildFila([], [], [])
    expect(cargaFornecedor).toEqual([])
    expect(cargaCidade).toEqual([])
  })

  it('agrega OS abertas por fornecedor com violadas e críticas (VT)', () => {
    const rows = enrichRows([
      makeAberta({ numos: 'W1', nomedaequipe: 'EQUIPE F08', datacadastro: '01/06/2026 08:00' }), // WES, violada
      makeAberta({ numos: 'W2', nomedaequipe: 'EQUIPE F08', datacadastro: '01/06/2026 08:00' }), // WES, violada
      makeAberta({ numos: 'I1', nomedaequipe: 'EQUIPE F01', datacadastro: '01/06/2026 08:00' }), // Instacable, violada
    ])
    const { cargaFornecedor } = buildFila(rows, [], [])
    const wes = cargaFornecedor.find(c => c.nome === 'WES')
    const inst = cargaFornecedor.find(c => c.nome === 'Instacable')
    expect(wes?.total).toBe(2)
    expect(wes?.violadas).toBe(2)
    expect(inst?.total).toBe(1)
    // ordenado por violadas desc → WES (2) antes de Instacable (1)
    expect(cargaFornecedor[0].nome).toBe('WES')
  })

  it('agrega OS abertas por cidade INCLUINDO não-VT (fila unificada)', () => {
    const rows = enrichRows([
      makeAberta({ numos: 'C1', nomedacidade: 'SAO JOSE DOS CAMPOS', datacadastro: '01/06/2026 08:00' }),
      makeAberta({ numos: 'C2', nomedacidade: 'SAO JOSE DOS CAMPOS', datacadastro: '01/06/2026 08:00' }),
      makeAberta({ numos: 'C3', nomedacidade: 'TAUBATE',             datacadastro: '01/06/2026 08:00' }),
      makeAberta({ numos: 'N1', nomedacidade: 'TAUBATE', servico: 'ASSISTENCIA TECNICA' }), // não-VT → agora ENTRA na fila unificada
    ])
    const { cargaCidade } = buildFila(rows, [], [])
    const sjc = cargaCidade.find(c => c.nome === 'SAO JOSE DOS CAMPOS')
    const tau = cargaCidade.find(c => c.nome === 'TAUBATE')
    expect(sjc?.total).toBe(2)
    expect(tau?.total).toBe(2)  // C3 (VT) + N1 (não-VT), unificadas
  })
})

describe('filaUrgenciaTier', () => {
  it('classifica VT violado como "violado"', () => {
    const [row] = enrichRows([makeAberta({ servico: 'VT 08H', datacadastro: '01/06/2026 08:00' })])
    expect(filaUrgenciaTier(row)).toBe('violado')
  })

  it('classifica não-VT com SLA 2x excedido como "violado"', () => {
    const [row] = enrichRows([makeAberta({ servico: 'ASSISTENCIA TECNICA', tiposervico: 'Instalação', datacadastro: '01/06/2026 08:00' })])
    expect(filaUrgenciaTier(row)).toBe('violado')
  })
})
