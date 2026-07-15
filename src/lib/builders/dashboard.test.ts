import { describe, it, expect } from 'vitest'
import { enrichRows } from '../transform'
import { periodHealth, buildMudancas, entradaMediaDia, buildProjecaoRisco, buildDashboard, type PeriodHealth } from './dashboard'
import type { OSRow } from '../types'

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
    nomedaequipe:    'EQUIPE F01',
    tiposervico:     'Manutenção',
    servico:         'ASSISTENCIA TECNICA',
    descsituacao:    'Concluída',
    datacadastro:    '01/06/2026',
    dataagendamento: '02/06/2026',
    dataexecucao:    '02/06/2026',
    databaixa:       '02/06/2026',
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

describe('periodHealth', () => {
  it('retorna score 0 / sla 100 / taxa 0 para período vazio', () => {
    const h = periodHealth([])
    expect(h.total ?? 0).toBe(0)
    expect(h.slaPct).toBe(100)
    expect(h.taxa).toBe(0)
    expect(h.score).toBe(0)
  })

  it('período 100% concluído dentro do SLA tem score alto', () => {
    const rows = enrichRows([
      makeOS({ numos: 'A' }),
      makeOS({ numos: 'B' }),
    ])
    const h = periodHealth(rows)
    expect(h.taxa).toBe(100)
    expect(h.slaPct).toBe(100)
    expect(h.score).toBeGreaterThan(80)
  })

  it('OS com agendamento além do prazo derruba o slaPct', () => {
    const rows = enrichRows([
      makeOS({ numos: 'A' }),                                   // dentro do prazo
      makeOS({ numos: 'B', dataagendamento: '10/06/2026' }),    // 9 dias > limite 1 → viola
    ])
    const h = periodHealth(rows)
    expect(h.slaPct).toBeLessThan(100)
  })

  it('ignora REDE, COPE e reagendamentos na amostra', () => {
    const rows = enrichRows([
      makeOS({ numos: 'A' }),
      makeOS({ numos: 'R', nomedaequipe: '03-VAL - REDE FIBRA' }),       // REDE
      makeOS({ numos: 'C', nomedaequipe: 'COPE VALE' }),                 // COPE
      makeOS({ numos: 'G', nomedaequipe: 'REAGENDAMENTO F01' }),         // reagendamento
    ])
    const h = periodHealth(rows)
    expect(h.total).toBe(1)
  })
})

describe('entradaMediaDia', () => {
  it('retorna 0 para período vazio', () => {
    expect(entradaMediaDia([])).toBe(0)
  })

  it('calcula a média diária de entradas (total / dias com entrada)', () => {
    const rows = enrichRows([
      makeOS({ numos: 'A', datacadastro: daysAgo(2) }),
      makeOS({ numos: 'B', datacadastro: daysAgo(2) }),
      makeOS({ numos: 'C', datacadastro: daysAgo(2) }),
      makeOS({ numos: 'D', datacadastro: daysAgo(1) }),
      makeOS({ numos: 'E', datacadastro: daysAgo(1) }),
    ]) // dia -2 = 3, dia -1 = 2 → média (3+2)/2 = 2.5 → 3
    expect(entradaMediaDia(rows)).toBe(3)
  })

  it('ignora entradas fora da janela (baseline fixo, independente do filtro)', () => {
    const rows = enrichRows([
      makeOS({ numos: 'A', datacadastro: daysAgo(1) }),
      makeOS({ numos: 'B', datacadastro: daysAgo(1) }),
      makeOS({ numos: 'V', datacadastro: daysAgo(60) }),   // fora da janela de 28d
      makeOS({ numos: 'W', datacadastro: daysAgo(60) }),
      makeOS({ numos: 'X', datacadastro: daysAgo(60) }),
    ])
    expect(entradaMediaDia(rows)).toBe(2)
  })

  it('ignora COPE e reagendamentos na média', () => {
    const rows = enrichRows([
      makeOS({ numos: 'A', datacadastro: daysAgo(1) }),
      makeOS({ numos: 'C', nomedaequipe: 'COPE VALE', datacadastro: daysAgo(1) }),
      makeOS({ numos: 'G', nomedaequipe: 'REAGENDAMENTO F01', datacadastro: daysAgo(1) }),
    ])
    expect(entradaMediaDia(rows)).toBe(1)
  })
})

describe('buildProjecaoRisco', () => {
  it('projeta OS ativas que virarão críticas em ≤24h e ≤48h', () => {
    // tiposervico 'MANUTENCAO' (forma do banco, sem acento) → limite 1 → crítico em 2 dias
    const rows = enrichRows([
      makeOS({ numos: 'A', tiposervico: 'MANUTENCAO', descsituacao: 'Pendente', dataagendamento: '', datacadastro: daysAgo(1) }), // aging 1 → ~1d
      makeOS({ numos: 'B', tiposervico: 'MANUTENCAO', descsituacao: 'Pendente', dataagendamento: '', datacadastro: daysAgo(0) }), // aging 0 → ~2d
      makeOS({ numos: 'C', tiposervico: 'MANUTENCAO', descsituacao: 'Pendente', dataagendamento: '', datacadastro: daysAgo(5) }), // já crítica → fora
      makeOS({ numos: 'D', tiposervico: 'MANUTENCAO', descsituacao: 'Pendente', dataagendamento: '', datacadastro: daysAgo(1), nomedaequipe: 'COPE VALE' }), // COPE → fora
    ])
    const p = buildProjecaoRisco(rows)
    expect(p.proj24h).toBe(1)
    expect(p.proj48h).toBe(1)
    expect(p.amostra).toHaveLength(2)
    expect(p.amostra[0].numos).toBe('A')   // mais iminente primeiro
  })

  it('retorna zeros para fila sem risco iminente', () => {
    const p = buildProjecaoRisco([])
    expect(p.proj24h).toBe(0)
    expect(p.proj48h).toBe(0)
    expect(p.amostra).toEqual([])
  })
})

describe('clustersAtivos (Clusters de Falha)', () => {
  it('não sinaliza bairro com muitas OS de Instalação (arrastão do PAP é prática normal)', () => {
    const rows = enrichRows(
      Array.from({ length: 6 }, (_, i) => makeOS({
        numos: `INST${i}`, bairro: 'JARDIM SUL', tiposervico: 'INSTALACAO',
        descsituacao: 'Pendente', datacadastro: daysAgo(0), dataagendamento: '', dataexecucao: '', databaixa: '',
      }))
    )
    const { pulso } = buildDashboard(rows)
    expect((pulso as { clustersAtivos: { bairro: string }[] }).clustersAtivos).toHaveLength(0)
  })

  it('sinaliza bairro com muitas OS de Manutenção como cluster de falha', () => {
    const rows = enrichRows(
      Array.from({ length: 6 }, (_, i) => makeOS({
        numos: `MAN${i}`, bairro: 'JARDIM SUL', tiposervico: 'MANUTENCAO',
        descsituacao: 'Pendente', datacadastro: daysAgo(0), dataagendamento: '', dataexecucao: '', databaixa: '',
      }))
    )
    const { pulso } = buildDashboard(rows)
    const clusters = (pulso as { clustersAtivos: { bairro: string; total: number }[] }).clustersAtivos
    expect(clusters.find(c => c.bairro === 'JARDIM SUL')?.total).toBe(6)
  })
})

describe('fornecedores — SLA de prazo (não taxa de conclusão)', () => {
  it('fornecedor que conclui tudo mas fora do prazo tem SLA baixo e conclPct alto', () => {
    // WES F01: 3 OS concluídas, todas agendadas 9 dias após o cadastro (limite 2d p/ instalação)
    const rows = enrichRows([1, 2, 3].map(i => makeOS({
      numos: `W${i}`, nomedaequipe: 'INSTALACAO F08', tiposervico: 'INSTALACAO',
      datacadastro: '01/06/2026', dataagendamento: '10/06/2026',
      dataexecucao: '10/06/2026', databaixa: '10/06/2026',
    })))
    const { fornecedores } = buildDashboard(rows)
    const wes = fornecedores.find(f => f.nome === 'WES')
    expect(wes?.conclPct).toBe(100)   // throughput perfeito…
    expect(wes?.sla).toBe(0)          // …mas nenhuma dentro do prazo
  })
})

describe('slaAtingimento (fluxo) e agingDist relativo ao SLA', () => {
  it('atingimento mede as concluídas entregues dentro do SLA', () => {
    const rows = enrichRows([
      makeOS({ numos: 'A' }),  // cadastro 01/06, baixa 02/06 → 1d, limite manut 1d → no prazo
      makeOS({ numos: 'B', dataexecucao: '09/06/2026', databaixa: '09/06/2026' }),  // 8d → fora
    ])
    const { pulso } = buildDashboard(rows)
    expect((pulso as { slaAtingimento: number | null }).slaAtingimento).toBe(50)
  })

  it('bucket é relativo ao SLA: manutenção com 2d de aging já conta como estourada', () => {
    const rows = enrichRows([
      makeOS({ numos: 'M', tiposervico: 'MANUTENCAO', descsituacao: 'Pendente',
               dataagendamento: '', dataexecucao: '', databaixa: '', datacadastro: daysAgo(2) }),
    ])
    const { pulso } = buildDashboard(rows)
    const dist = (pulso as { agingDist: { ok: number; limite: number; estourado: number; critico: number } }).agingDist
    expect(dist.estourado).toBe(1)   // aging 2 ÷ limite 1 = 2× → estourado (borda do crítico)
    expect(dist.ok).toBe(0)
  })
})

describe('buildMudancas', () => {
  const base: PeriodHealth = { slaPct: 80, taxa: 70, mttr: 3, score: 0, total: 100 }

  it('marca melhorou=true quando taxa sobe e false quando MTTR sobe', () => {
    const cur:  PeriodHealth = { ...base, taxa: 80, mttr: 4 }   // taxa +10 (bom), mttr +1 (ruim)
    const movers = buildMudancas(cur, base)
    const taxa = movers.find(m => m.id === 'taxa')
    const mttr = movers.find(m => m.id === 'mttr')
    expect(taxa?.melhorou).toBe(true)
    expect(mttr?.melhorou).toBe(false)
  })

  it('ordena por impacto no score (maior primeiro) e descarta deltas zero', () => {
    const cur: PeriodHealth = { ...base, slaPct: 60, taxa: 70, mttr: 3 } // só SLA mudou (−20)
    const movers = buildMudancas(cur, base)
    expect(movers).toHaveLength(1)
    expect(movers[0].id).toBe('sla')
    expect(movers[0].melhorou).toBe(false)
  })
})
