import { describe, expect, it } from 'vitest'
import { buildTreatedPons, snapshotFromHotspot, type PonTreatment } from './ponTreatments'
import type { PonMedicao } from './ponMedicoes'
import type { SignalHotspot } from './nivelSinal'
import { distribuicaoGanho, efetividadePor, efetividadeResumo, evolucaoSemanal, matrizTransicao, ponsQueMenosMelhoraram } from './ponEfetividade'

const hotspot = (pon: string, olt = 'OLT A'): SignalHotspot => ({
  key: `${olt} · ${pon}`, olt, pon, cidade: 'Taubaté', bairro: 'Centro', total: 4, criticos: 3, atencao: 1,
  concentracao: 0.75, rxMediano: -28, piorRx: -30, tempMax: 40, nivel: 'medio', score: 1,
})

let seq = 0
const med = (rx_antes: number | null, rx_depois: number | null): PonMedicao => ({
  onu_key: `m${seq++}`, cliente: 'C', onu: '1', serial: 's', codigo: '1', rx_antes, rx_depois, observacao: '',
})

const build = (pon: string, medicoes: PonMedicao[], created_at = '2026-09-01 10:00:00', olt = 'OLT A') => {
  const h = hotspot(pon, olt)
  const t: PonTreatment = {
    pon_key: h.key, action: 'tratada', snapshot: snapshotFromHotspot(h), created_at, created_by: 'x',
    treated_count: 1, reopened_count: 0, medicoes,
  }
  return buildTreatedPons([t], [])[0]
}

describe('efetividadeResumo', () => {
  it('mede ganho e recuperação só com clientes que têm antes e depois', () => {
    const pons = [build('1/1', [med(-30, -22), med(-28, -26), med(-29, null), med(null, -20)])]
    const r = efetividadeResumo(pons)
    expect(r.clientes).toBe(4)
    expect(r.medidos).toBe(2)
    expect(r.cobertura).toBe(0.5)
    expect(r.ganhoMedio).toBe(5) // (8 + 2) / 2
    expect(r.criticosAntes).toBe(2)
    expect(r.criticosDepois).toBe(0)
    expect(r.recuperados).toBe(2)
    expect(r.taxaRecuperacao).toBe(1)
  })

  it('conta quem piorou e não quebra sem dados', () => {
    const r = efetividadeResumo([build('1/1', [med(-24, -28)]), build('1/2', [])])
    expect(r.pioraram).toBe(1)
    expect(r.melhoraram).toBe(0)
    expect(efetividadeResumo([]).ganhoMedio).toBeNull()
    expect(efetividadeResumo([]).taxaRecuperacao).toBe(0)
  })
})

describe('matrizTransicao', () => {
  it('cruza nível antes e depois', () => {
    const m = matrizTransicao([build('1/1', [med(-30, -20), med(-30, -28), med(-26, -20)])])
    const total = (de: string, para: string) => m.find(t => t.de === de && t.para === para)?.total
    expect(total('Crítico', 'Normal')).toBe(1)
    expect(total('Crítico', 'Crítico')).toBe(1)
    expect(total('Atenção', 'Normal')).toBe(1)
    expect(m).toHaveLength(9)
  })
})

describe('distribuicaoGanho', () => {
  it('distribui o ganho em faixas', () => {
    const faixas = distribuicaoGanho([build('1/1', [med(-30, -31), med(-30, -29), med(-30, -26), med(-30, -22), med(-30, -15)])])
    expect(faixas.map(f => f.total)).toEqual([1, 1, 1, 1, 1])
  })
})

describe('efetividadePor', () => {
  it('agrupa por OLT e ordena pelo maior ganho', () => {
    const grupos = efetividadePor([
      build('1/1', [med(-30, -20)], undefined, 'OLT A'),
      build('1/1', [med(-30, -28)], undefined, 'OLT B'),
      build('2/1', [med(-30, null)], undefined, 'OLT C'),
    ], 'olt')
    expect(grupos.map(g => g.nome)).toEqual(['OLT A', 'OLT B'])
    expect(grupos[0].taxaNormal).toBe(1)
    expect(grupos[1].taxaNormal).toBe(0)
  })
})

describe('evolucaoSemanal', () => {
  it('agrupa pela segunda-feira da semana do OK', () => {
    const semanas = evolucaoSemanal([
      build('1/1', [med(-30, -20)], '2026-09-01 10:00:00'), // terça
      build('1/2', [med(-30, -25)], '2026-09-06 10:00:00'), // domingo, mesma semana
      build('1/3', [], '2026-09-08 10:00:00'),
    ])
    expect(semanas.map(s => s.inicio)).toEqual(['2026-08-31', '2026-09-07'])
    expect(semanas[0]).toMatchObject({ tratadas: 2, ganhoMedio: 7.5 })
    expect(semanas[1].ganhoMedio).toBeNull()
  })
})

describe('ponsQueMenosMelhoraram', () => {
  it('lista primeiro as de menor ganho e ignora as sem medição', () => {
    const lista = ponsQueMenosMelhoraram([
      build('1/1', [med(-30, -20)]), build('1/2', [med(-30, -31)]), build('1/3', []),
    ])
    expect(lista.map(p => p.pon)).toEqual(['1/2', '1/1'])
  })
})
