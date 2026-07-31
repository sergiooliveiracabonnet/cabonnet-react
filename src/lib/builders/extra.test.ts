import { describe, expect, it } from 'vitest'
import { enrichRows } from '../transform'
import { buildFornecedor, transformJuniper, diasNoPeriodo, MIN_OS_RANKING } from './extra'
import type { OSRow } from '../types'

describe('transformJuniper', () => {
  it('trata uma coleta válida sem conexões como saudável', () => {
    const result = transformJuniper({
      total: 0,
      alerta: false,
      clientes: [],
      cluster: 'Vale',
      ultima_coleta: '26/07/2026 10:00:00',
    })

    expect(result?.hero.nivel).toBe('ok')
    expect(result?.hero.nivel_label).toBe('Nenhuma conexão ativa detectada')
    expect(result?.hasAlert).toBe(false)
    expect(result?.hasData).toBe(true)
  })

  it('trata qualquer conexão ativa como incidente, mesmo se o backend enviar alerta incorreto', () => {
    const result = transformJuniper({
      total: 1,
      alerta: false,
      clientes: [{ user_name: 'cliente-1', state: 'active', ip_address: '10.0.0.1' }],
      cluster: 'Vale',
      ultima_coleta: '26/07/2026 10:00:00',
    })

    expect(result?.hero.nivel).toBe('alert')
    expect(result?.hero.nivel_label).toBe('1 conexão ativa exige verificação')
    expect(result?.hasAlert).toBe(true)
  })

  it('distingue ausência de coleta de uma coleta saudável com zero conexões', () => {
    const result = transformJuniper({ total: 0, clientes: [], cluster: 'Vale' })

    expect(result?.hero.nivel).toBe('warn')
    expect(result?.hero.nivel_label).toBe('Aguardando dados da coleta')
    expect(result?.hasAlert).toBe(false)
    expect(result?.hasData).toBe(false)
  })
})

// ─── buildFornecedor ──────────────────────────────────────────────────────────

const HOJE = new Date()
function diasAtras(n: number): string {
  const d = new Date(HOJE)
  d.setDate(d.getDate() - n)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function os(o: Record<string, unknown> = {}): OSRow {
  return {
    numos: '1234567', nomecliente: 'Cliente', nomedacidade: 'TAUBATE',
    tiposervico: 'MANUTENCAO', servico: 'ASSISTENCIA TECNICA',
    descsituacao: 'Pendente', datacadastro: null, dataagendamento: null,
    ...o,
  } as unknown as OSRow
}

/** n OS de uma equipe, concluídas `dias` após a abertura. */
function entregues(equipe: string, n: number, dias: number): OSRow[] {
  const abertura = diasAtras(20)
  const baixa    = diasAtras(20 - dias)
  return Array.from({ length: n }, (_, i) =>
    os({
      numos: `9${equipe.slice(-2)}${dias}${i}`.padStart(7, '9'), nomedaequipe: equipe,
      descsituacao: 'Concluída', datacadastro: abertura, dataexecucao: baixa, databaixa: baixa,
    })
  )
}

describe('buildFornecedor', () => {
  it('não expõe mais score composto nos kpis nem no ranking', () => {
    const { paineis, ranking } = buildFornecedor(enrichRows(entregues('EQUIPE F01', 3, 1)))
    expect(paineis[0].kpis).not.toHaveProperty('score')
    expect(ranking[0]).not.toHaveProperty('score')
  })

  // Manutenção vence em 1 dia. WES entrega no prazo; Instacable entrega o dobro
  // do volume, porém atrasado — no score composto o volume compensava o atraso.
  it('ordena por SLA, não por volume entregue', () => {
    const rows = enrichRows([
      ...entregues('EQUIPE F08', 3, 1),
      ...entregues('EQUIPE F01', 6, 10),
    ])
    const { ranking } = buildFornecedor(rows)
    expect(ranking).toHaveLength(2)
    expect(ranking[0].sla).toBeGreaterThan(ranking[1].sla)
    expect(ranking[0].total).toBeLessThan(ranking[1].total)
  })

  // Conclusão mede volume entregue; SLA mede prazo cumprido. Uma OS entregue
  // atrasada conta como concluída e como violação — por isso os dois números
  // divergem, e por isso somá-los num score escondia informação.
  it('expõe conclPct separado do SLA — são perguntas diferentes', () => {
    const rows = enrichRows([
      ...entregues('EQUIPE F08', 1, 1),    // concluída no prazo
      ...entregues('EQUIPE F08', 1, 9),    // concluída, porém atrasada
      os({ numos: '9999991', nomedaequipe: 'EQUIPE F08', descsituacao: 'Pendente', datacadastro: diasAtras(20) }),
    ])
    const kpis = buildFornecedor(rows).paineis[0].kpis
    expect(kpis.conclPct).toBe(67)   // 2 de 3 entregues
    expect(kpis.sla).toBe(33)        // só 1 de 3 dentro do prazo
  })
})

describe('diasNoPeriodo', () => {
  it('conta os dois extremos — 01 a 31 são 31 dias, não 30', () => {
    expect(diasNoPeriodo(new Date(2026, 0, 1), new Date(2026, 0, 31))).toBe(31)
  })

  it('um único dia conta 1', () => {
    const d = new Date(2026, 0, 15)
    expect(diasNoPeriodo(d, d)).toBe(1)
  })

  it('sem intervalo definido assume o mês de referência', () => {
    expect(diasNoPeriodo(null, null)).toBe(30)
    expect(diasNoPeriodo(new Date(2026, 0, 1), null)).toBe(30)
  })
})

describe('buildFornecedor — custo por OS', () => {
  // 10 OS concluídas dentro do prazo, custo mensal de R$ 30.000.
  const rows = enrichRows(entregues('EQUIPE F08', 10, 1))
  const custo = { WES: 30000 }

  it('prorrateia o custo mensal pelo período analisado', () => {
    // 7 dias de 30 => R$ 7.000 no período => R$ 700 por OS concluída.
    const kpis = buildFornecedor(rows, '', custo, 7).paineis[0].kpis
    expect(kpis.custoPorOs).toBe(700)
  })

  it('período de um mês inteiro devolve o custo cheio', () => {
    const kpis = buildFornecedor(rows, '', custo, 30).paineis[0].kpis
    expect(kpis.custoPorOs).toBe(3000)
  })

  it('período mais curto NÃO pode inflar o custo por OS', () => {
    const semana = buildFornecedor(rows, '', custo, 7).paineis[0].kpis.custoPorOs!
    const mes    = buildFornecedor(rows, '', custo, 30).paineis[0].kpis.custoPorOs!
    expect(semana).toBeLessThan(mes)
  })

  it('sem custo configurado não inventa número', () => {
    expect(buildFornecedor(rows, '', {}, 30).paineis[0].kpis.custoPorOs).toBeNull()
  })
})

describe('buildFornecedor — piso de volume no ranking', () => {
  it('marca amostra insuficiente abaixo do piso', () => {
    const { ranking } = buildFornecedor(enrichRows(entregues('EQUIPE F08', 3, 1)))
    expect(ranking[0].total).toBeLessThan(MIN_OS_RANKING)
    expect(ranking[0].amostraInsuficiente).toBe(true)
  })

  // O caso que motivou a mudança: 100% em 3 OS liderava sobre 90%+ em volume real.
  it('volume relevante vem antes de SLA alto com amostra pequena', () => {
    const rows = enrichRows([
      ...entregues('EQUIPE F08', 3, 1),                                  // Instacable-like: 100% em 3 OS
      ...entregues('EQUIPE F01', MIN_OS_RANKING + 5, 1),                 // volume acima do piso
      ...entregues('EQUIPE F01', 1, 9),                                  // com uma violação, SLA < 100
    ])
    const { ranking } = buildFornecedor(rows)
    expect(ranking[0].amostraInsuficiente).toBe(false)
    expect(ranking[0].total).toBeGreaterThanOrEqual(MIN_OS_RANKING)
    expect(ranking[1].amostraInsuficiente).toBe(true)
    expect(ranking[1].sla).toBeGreaterThan(ranking[0].sla)
  })
})
