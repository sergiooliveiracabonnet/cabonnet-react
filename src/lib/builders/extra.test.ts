import { describe, expect, it } from 'vitest'
import { enrichRows } from '../transform'
import { buildFornecedor, transformJuniper } from './extra'
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
