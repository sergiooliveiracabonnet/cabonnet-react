import { describe, it, expect } from 'vitest'
import { enrichRows } from '../transform'
import { buildCampo } from './campo'
import type { OSRow } from '../types'

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

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

describe('buildCampo — kpis', () => {
  it('kpi "campo" conta OS Pendente e Atendimento', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', descsituacao: 'Pendente'    }),
      makeOS({ numos: '0000002', descsituacao: 'Atendimento' }),
      makeOS({ numos: '0000003', descsituacao: 'Concluída'   }),
    ])
    const { kpis } = buildCampo(rows)
    const campo = kpis.find(k => k.id === 'campo')
    expect(campo?.value).toBe(2)
  })

  it('kpi "concl" conta apenas OS com execução real (Concluída / Atend/Finalizadas)', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', descsituacao: 'Concluída'               }),
      makeOS({ numos: '0000002', descsituacao: 'Atendimento/Finalizadas'  }),
      makeOS({ numos: '0000003', descsituacao: 'Pendente'                }),
    ])
    const { kpis } = buildCampo(rows)
    const concl = kpis.find(k => k.id === 'concl')
    expect(concl?.value).toBe(2)
  })

  it('kpi "taxa" é 0% para array vazio', () => {
    const { kpis } = buildCampo([])
    const taxa = kpis.find(k => k.id === 'taxa')
    expect(taxa?.value).toBe('0%')
  })

  it('kpi "taxa" é 50% quando metade está concluída', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', descsituacao: 'Concluída' }),
      makeOS({ numos: '0000002', descsituacao: 'Pendente'  }),
    ])
    const { kpis } = buildCampo(rows)
    const taxa = kpis.find(k => k.id === 'taxa')
    expect(taxa?.value).toBe('50%')
  })

  it('exclui OS COPE do cálculo de taxa', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', descsituacao: 'Concluída', nomedaequipe: 'COPE VALE' }),
      makeOS({ numos: '0000002', descsituacao: 'Pendente' }),
    ])
    const { kpis } = buildCampo(rows)
    // COPE excluída → 1 OS total (Pendente), 0 concluídas → taxa 0%
    const taxa = kpis.find(k => k.id === 'taxa')
    expect(taxa?.value).toBe('0%')
  })

  it('retorna sempre 4 KPIs com ids corretos', () => {
    const { kpis } = buildCampo([])
    const ids = kpis.map(k => k.id)
    expect(ids).toContain('campo')
    expect(ids).toContain('concl')
    expect(ids).toContain('slaExc')
    expect(ids).toContain('taxa')
  })
})

// ─── Semáforo ─────────────────────────────────────────────────────────────────

describe('buildCampo — semaforo', () => {
  it('equipe com taxa >= 80% recebe status "ok"', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída'   }),
      makeOS({ numos: '0000002', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída'   }),
      makeOS({ numos: '0000003', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída'   }),
      makeOS({ numos: '0000004', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída'   }),
      makeOS({ numos: '0000005', nomedaequipe: 'EQUIPE F01', descsituacao: 'Pendente'    }),
    ])
    const { semaforo } = buildCampo(rows)
    const eq = semaforo.find(e => e.nome.includes('F01'))
    expect(eq?.status).toBe('ok')
    expect(eq?.taxa).toBe(80)
  })

  it('equipe com taxa 50% recebe status "atencao"', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída' }),
      makeOS({ numos: '0000002', nomedaequipe: 'EQUIPE F01', descsituacao: 'Pendente'  }),
    ])
    const { semaforo } = buildCampo(rows)
    const eq = semaforo.find(e => e.nome.includes('F01'))
    expect(eq?.status).toBe('atencao')
    expect(eq?.taxa).toBe(50)
  })

  it('equipe com taxa 25% recebe status "critico"', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída' }),
      makeOS({ numos: '0000002', nomedaequipe: 'EQUIPE F01', descsituacao: 'Pendente'  }),
      makeOS({ numos: '0000003', nomedaequipe: 'EQUIPE F01', descsituacao: 'Pendente'  }),
      makeOS({ numos: '0000004', nomedaequipe: 'EQUIPE F01', descsituacao: 'Pendente'  }),
    ])
    const { semaforo } = buildCampo(rows)
    const eq = semaforo.find(e => e.nome.includes('F01'))
    expect(eq?.status).toBe('critico')
  })

  it('equipes sem fila e sem concluídas não aparecem no semáforo', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', nomedaequipe: 'EQUIPE F01', descsituacao: 'Pendente' }),
    ])
    const { semaforo } = buildCampo(rows)
    expect(semaforo.every(e => e.fila + e.concl > 0)).toBe(true)
  })

  it('semaforo vazio para array vazio', () => {
    const { semaforo } = buildCampo([])
    expect(semaforo).toHaveLength(0)
  })
})

// ─── Distribuição de aging ────────────────────────────────────────────────────

describe('buildCampo — agingDist', () => {
  it('distribui OS ativas pelos buckets corretos', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', datacadastro: daysAgo(0),  descsituacao: 'Pendente' }),
      makeOS({ numos: '0000002', datacadastro: daysAgo(2),  descsituacao: 'Pendente' }),
      makeOS({ numos: '0000003', datacadastro: daysAgo(4),  descsituacao: 'Pendente' }),
      makeOS({ numos: '0000004', datacadastro: daysAgo(7),  descsituacao: 'Pendente' }),
      makeOS({ numos: '0000005', datacadastro: daysAgo(11), descsituacao: 'Pendente' }),
    ])
    const { agingDist } = buildCampo(rows)
    // buckets: 0-1d, 2-3d, 4-5d, 6-10d, 11+d
    expect(agingDist.labels).toEqual(['0—1d', '2—3d', '4—5d', '6—10d', '11+d'])
    expect(agingDist.values[0]).toBe(1)
    expect(agingDist.values[1]).toBe(1)
    expect(agingDist.values[2]).toBe(1)
    expect(agingDist.values[3]).toBe(1)
    expect(agingDist.values[4]).toBe(1)
  })

  it('hasCritical é true quando há OS nos buckets 6-10d ou 11+d', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', datacadastro: daysAgo(8), descsituacao: 'Pendente' }),
    ])
    const { agingDist } = buildCampo(rows)
    expect(agingDist.hasCritical).toBe(true)
  })

  it('hasCritical é false quando todas as OS têm aging <= 5d', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', datacadastro: daysAgo(1), descsituacao: 'Pendente' }),
      makeOS({ numos: '0000002', datacadastro: daysAgo(3), descsituacao: 'Pendente' }),
    ])
    const { agingDist } = buildCampo(rows)
    expect(agingDist.hasCritical).toBe(false)
  })

  it('OS concluídas não entram no agingDist', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', datacadastro: daysAgo(12), descsituacao: 'Concluída' }),
    ])
    const { agingDist } = buildCampo(rows)
    const total = agingDist.values.reduce((a, b) => a + b, 0)
    expect(total).toBe(0)
    expect(agingDist.hasCritical).toBe(false)
  })
})

// ─── Risco ────────────────────────────────────────────────────────────────────

describe('buildCampo — risco', () => {
  it('risco.count é 0 quando nenhuma OS tem _slaCritico', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', descsituacao: 'Pendente', datacadastro: daysAgo(1) }),
    ])
    const { risco } = buildCampo(rows)
    expect(risco.count).toBe(0)
    expect(risco.desc).toBe('Sem OS críticas')
  })

  it('risco.pct é 0 para array vazio', () => {
    const { risco } = buildCampo([])
    expect(risco.pct).toBe(0)
    expect(risco.count).toBe(0)
  })
})

// ─── Hero ─────────────────────────────────────────────────────────────────────

describe('buildCampo — hero', () => {
  it('hero.status é "ok" quando todas equipes têm taxa >= 80%', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída', datacadastro: daysAgo(1) }),
      makeOS({ numos: '0000002', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída', datacadastro: daysAgo(1) }),
      makeOS({ numos: '0000003', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída', datacadastro: daysAgo(1) }),
      makeOS({ numos: '0000004', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída', datacadastro: daysAgo(1) }),
      makeOS({ numos: '0000005', nomedaequipe: 'EQUIPE F01', descsituacao: 'Pendente',  datacadastro: daysAgo(1) }),
    ])
    const { hero } = buildCampo(rows)
    expect(hero.status).toBe('ok')
  })

  it('hero.status é "critico" quando há equipe com taxa < 50%', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída', datacadastro: daysAgo(1) }),
      makeOS({ numos: '0000002', nomedaequipe: 'EQUIPE F01', descsituacao: 'Pendente',  datacadastro: daysAgo(1) }),
      makeOS({ numos: '0000003', nomedaequipe: 'EQUIPE F01', descsituacao: 'Pendente',  datacadastro: daysAgo(1) }),
      makeOS({ numos: '0000004', nomedaequipe: 'EQUIPE F01', descsituacao: 'Pendente',  datacadastro: daysAgo(1) }),
    ])
    const { hero } = buildCampo(rows)
    expect(hero.status).toBe('critico')
  })

  it('hero.status é "atencao" quando equipe tem taxa entre 50-79%', () => {
    const rows = enrichRows([
      makeOS({ numos: '0000001', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída', datacadastro: daysAgo(1) }),
      makeOS({ numos: '0000002', nomedaequipe: 'EQUIPE F01', descsituacao: 'Pendente',  datacadastro: daysAgo(1) }),
    ])
    const { hero } = buildCampo(rows)
    expect(hero.status).toBe('atencao')
  })

  it('hero para array vazio: totalEquipes 0 e status ok', () => {
    const { hero } = buildCampo([])
    expect(hero.totalEquipes).toBe(0)
    expect(hero.status).toBe('ok')
  })

  it('hero expõe criticoCount e atencaoCount corretos', () => {
    const rows = enrichRows([
      // equipe critica (25%)
      makeOS({ numos: '0000001', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída', datacadastro: daysAgo(1) }),
      makeOS({ numos: '0000002', nomedaequipe: 'EQUIPE F01', descsituacao: 'Pendente',  datacadastro: daysAgo(1) }),
      makeOS({ numos: '0000003', nomedaequipe: 'EQUIPE F01', descsituacao: 'Pendente',  datacadastro: daysAgo(1) }),
      makeOS({ numos: '0000004', nomedaequipe: 'EQUIPE F01', descsituacao: 'Pendente',  datacadastro: daysAgo(1) }),
      // equipe atencao (50%)
      makeOS({ numos: '0000005', nomedaequipe: 'EQUIPE F08', descsituacao: 'Concluída', datacadastro: daysAgo(1) }),
      makeOS({ numos: '0000006', nomedaequipe: 'EQUIPE F08', descsituacao: 'Pendente',  datacadastro: daysAgo(1) }),
    ])
    const { hero } = buildCampo(rows)
    expect(hero.criticoCount).toBe(1)
    expect(hero.atencaoCount).toBe(1)
  })
})

// ─── Ritmo de equipe (baseline histórico) ─────────────────────────────────────

describe('buildCampo — ritmoHoje', () => {
  it('fica null para todas as equipes quando "rows" só contém o dia de hoje (filtro "hoje")', () => {
    // Reproduz o card "Ritmo por Equipe" em branco: o filtro global padrão é
    // "hoje", então activeRows só tem OS de hoje e nunca há data anterior
    // para servir de baseline de mesmo dia da semana.
    const rows = enrichRows([
      makeOS({ numos: '0000001', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída', dataagendamento: daysAgo(0) }),
    ])
    const { semaforo } = buildCampo(rows)
    const eq = semaforo.find(e => e.nome.includes('F01'))
    expect(eq?.ritmoHoje).toBeNull()
  })

  it('usa allRowsForRitmo (não restrito pelo filtro de data) para calcular a baseline', () => {
    const historico = enrichRows([
      makeOS({ numos: '0000002', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída', dataagendamento: daysAgo(7)  }),
      makeOS({ numos: '0000003', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída', dataagendamento: daysAgo(14) }),
      makeOS({ numos: '0000004', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída', dataagendamento: daysAgo(21) }),
    ])
    const hoje = enrichRows([
      makeOS({ numos: '0000001', nomedaequipe: 'EQUIPE F01', descsituacao: 'Concluída', dataagendamento: daysAgo(0) }),
    ])
    const allRows = [...hoje, ...historico]

    // "rows" simula o filtro global "hoje": só a OS de hoje chega no builder
    const { semaforo } = buildCampo(hoje, allRows)
    const eq = semaforo.find(e => e.nome.includes('F01'))
    expect(eq?.ritmoHoje).not.toBeNull()
    expect(eq?.ritmoHoje?.atual).toBe(1)
    expect(eq?.ritmoHoje?.baseline).toBe(1)
  })
})
