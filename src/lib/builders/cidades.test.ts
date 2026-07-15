import { describe, it, expect } from 'vitest'
import { enrichRows } from '../transform'
import { buildCidades } from './cidades'
import type { OSRow } from '../types'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// Dia recente que não é domingo nem hoje (execuções de domingo/hoje ficam fora da capacidade)
function diaUtilRecente(): string {
  for (let n = 1; n <= 7; n++) {
    const d = new Date()
    d.setDate(d.getDate() - n)
    if (d.getDay() !== 0) return daysAgo(n)
  }
  return daysAgo(1)
}

function makeOS(overrides: Record<string, unknown> = {}): OSRow {
  return {
    numos:           '0000001',
    nomecliente:     'CLIENTE TESTE',
    nomedacidade:    'TAUBATE',
    nomedaequipe:    'EQUIPE F01',
    tiposervico:     'MANUTENCAO',
    servico:         'ASSISTENCIA TECNICA',
    descsituacao:    'Pendente',
    datacadastro:    daysAgo(1),
    dataagendamento: '',
    dataexecucao:    '',
    databaixa:       '',
    bairro:          'CENTRO',
    logradouro:      'RUA TESTE',
    complemento:     '',
    numero:          '1',
    empresa:         '',
    obs:             '',
    periodo:         '',
    ...overrides,
  } as unknown as OSRow
}

describe('buildCidades — saúde por cidade', () => {
  it('conta fila, críticas e SLA por cidade', () => {
    const rows = enrichRows([
      makeOS({ numos: 'A', nomedacidade: 'TAUBATE' }),                              // aging 1 = limite → no prazo
      makeOS({ numos: 'B', nomedacidade: 'TAUBATE', datacadastro: daysAgo(5) }),    // aging 5 > 2× limite 1 → crítica
      makeOS({ numos: 'C', nomedacidade: 'CACAPAVA' }),
    ])
    const { saude } = buildCidades(rows)
    const tb = saude.find(c => c.cidade === 'TAUBATE')
    expect(tb?.fila).toBe(2)
    expect(tb?.criticas).toBe(1)
    expect(tb?.slaPct).toBe(50)
    expect(saude.find(c => c.cidade === 'CACAPAVA')?.fila).toBe(1)
  })

  it('calcula backlog em dias (fila ÷ saídas/dia) e shares', () => {
    const exec = diaUtilRecente()
    const rows = enrichRows([
      // TAUBATE: 4 na fila, 2 executadas num único dia útil → 2/dia → backlog 2d
      ...[1, 2, 3, 4].map(i => makeOS({ numos: `F${i}`, nomedacidade: 'TAUBATE' })),
      makeOS({ numos: 'E1', nomedacidade: 'TAUBATE', descsituacao: 'Concluída', dataexecucao: exec, databaixa: exec, datacadastro: daysAgo(10) }),
      makeOS({ numos: 'E2', nomedacidade: 'TAUBATE', descsituacao: 'Concluída', dataexecucao: exec, databaixa: exec, datacadastro: daysAgo(10) }),
      // CACAPAVA: 1 na fila, nenhuma execução → backlog indefinido
      makeOS({ numos: 'G', nomedacidade: 'CACAPAVA' }),
    ])
    const { saude } = buildCidades(rows)
    const tb = saude.find(c => c.cidade === 'TAUBATE')
    expect(tb?.saidasDia).toBe(2)
    expect(tb?.backlogDias).toBe(2)
    expect(tb?.shareFila).toBe(80)      // 4 de 5 na fila
    expect(tb?.shareExec).toBe(100)     // todas as execuções
    expect(tb?.deltaShare).toBe(-20)    // executa mais do que acumula
    const cc = saude.find(c => c.cidade === 'CACAPAVA')
    expect(cc?.backlogDias).toBeNull()
    expect(cc?.deltaShare).toBe(20)     // 20% da fila, 0% das execuções → acumulando
  })

  it('exclui COPE, reagendamentos e REDE', () => {
    const rows = enrichRows([
      makeOS({ numos: 'A' }),
      makeOS({ numos: 'C', nomedaequipe: 'COPE VALE' }),
      makeOS({ numos: 'G', nomedaequipe: 'REAGENDAMENTO F01' }),
      makeOS({ numos: 'R', nomedaequipe: '03-VAL - REDE FIBRA' }),
    ])
    const { saude } = buildCidades(rows)
    expect(saude.find(c => c.cidade === 'TAUBATE')?.fila).toBe(1)
  })

  it('kpis refletem cidades com fila e acumulando', () => {
    const rows = enrichRows([
      makeOS({ numos: 'A', nomedacidade: 'TAUBATE', datacadastro: daysAgo(5) }),  // crítica
      makeOS({ numos: 'B', nomedacidade: 'CACAPAVA' }),
    ])
    const { kpis } = buildCidades(rows)
    expect(kpis.find(k => k.id === 'total')?.value).toBe(2)
    expect(kpis.find(k => k.id === 'criticas')?.value).toBe(1)
  })
})
