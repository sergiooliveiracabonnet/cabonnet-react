import { describe, expect, it } from 'vitest'
import { buildTreatedPons, medicoesProgresso, medicoesSituacao, snapshotFromHotspot, splitHotspots, treatedPonKeys, treatedSummary, treatmentsByKey, type PonTreatment } from './ponTreatments'
import type { SignalHotspot } from './nivelSinal'
import type { PonMedicao } from './ponMedicoes'

const hotspot = (overrides: Partial<SignalHotspot> = {}): SignalHotspot => ({
  key: 'OLT TBT · 1/2', olt: 'OLT TBT', pon: '1/2', cidade: 'Taubaté', bairro: 'Centro',
  total: 10, criticos: 6, atencao: 2, concentracao: 0.6, rxMediano: -28.4, piorRx: -31.2, tempMax: 48,
  nivel: 'medio', score: 3.6,
  ...overrides,
})

let seq = 0
const medicao = (rx_depois: number | null, rx_antes: number | null = -29): PonMedicao => ({
  onu_key: `m${seq++}`, cliente: 'Cliente', onu: '1', serial: 's', codigo: '1', rx_antes, rx_depois, observacao: '',
})

const treatment = (overrides: Partial<PonTreatment> = {}): PonTreatment => ({
  pon_key: 'OLT TBT · 1/2', action: 'tratada', snapshot: snapshotFromHotspot(hotspot()),
  created_at: '2026-09-01 10:00:00', created_by: 'sergio', treated_count: 1, reopened_count: 0, medicoes: [],
  ...overrides,
})

describe('snapshotFromHotspot', () => {
  it('congela os números da PON no instante do OK', () => {
    expect(snapshotFromHotspot(hotspot())).toEqual({
      olt: 'OLT TBT', pon: '1/2', cidade: 'Taubaté', bairro: 'Centro',
      total: 10, criticos: 6, concentracao: 0.6, rxMediano: -28.4, piorRx: -31.2, tempMax: 48, nivel: 'medio',
    })
  })
})

describe('treatedPonKeys', () => {
  it('considera tratada apenas a PON cujo último evento foi tratada', () => {
    const keys = treatedPonKeys([
      treatment(),
      treatment({ pon_key: 'OLT TBT · 3/4', action: 'reaberta', treated_count: 1, reopened_count: 1 }),
    ])

    expect(keys.has('OLT TBT · 1/2')).toBe(true)
    expect(keys.has('OLT TBT · 3/4')).toBe(false)
  })
})

describe('splitHotspots', () => {
  it('tira da pendência só as PONs tratadas', () => {
    const pendente = hotspot({ key: 'OLT TBT · 3/4', pon: '3/4' })
    const { pendentes, tratadas } = splitHotspots([hotspot(), pendente], treatedPonKeys([treatment()]))

    expect(pendentes).toEqual([pendente])
    expect(tratadas.map(item => item.key)).toEqual(['OLT TBT · 1/2'])
  })

  it('mantém a PON tratada fora da fila mesmo quando o CSV atual ainda a acusa', () => {
    const { pendentes } = splitHotspots([hotspot({ criticos: 9 })], treatedPonKeys([treatment()]))
    expect(pendentes).toEqual([])
  })
})

describe('medicoesSituacao', () => {
  it('classifica pela Nova Potência e cai na de antes para quem ainda não foi medido', () => {
    const resumo = medicoesSituacao({ medicoes: [medicao(-28), medicao(-26), medicao(-22), medicao(null, -30)] })
    expect(resumo).toEqual({ criticos: 2, atencao: 1, melhorados: 1 })
  })
})

describe('buildTreatedPons', () => {
  it('cruza a tratativa com a Nova Potência de cada cliente, não com o recálculo de hotspot do CSV inteiro', () => {
    const [ainda] = buildTreatedPons([treatment({ medicoes: [medicao(-28), medicao(null, -30)] })], [hotspot({ criticos: 9 })])

    expect(ainda.aindaCritica).toBe(true)
    expect(ainda.situacao).toBe('critica')
    expect(ainda.resumoSituacao).toEqual({ criticos: 2, atencao: 0, melhorados: 0 })
    expect(ainda.atual?.criticos).toBe(9)
    expect(ainda.snapshot.criticos).toBe(6)
    expect(ainda.action).toBe('tratada')
  })

  it('marca "atencao" quando não sobra crítico mas tem cliente em atenção', () => {
    const [item] = buildTreatedPons([treatment({ medicoes: [medicao(-26), medicao(-22)] })], [])

    expect(item.aindaCritica).toBe(false)
    expect(item.situacao).toBe('atencao')
    expect(item.resumoSituacao).toEqual({ criticos: 0, atencao: 1, melhorados: 1 })
  })

  it('marca como normalizada a PON sem cliente crítico ou em atenção pela Nova Potência', () => {
    const [normalizada] = buildTreatedPons([treatment({ medicoes: [medicao(-22)] })], [])

    expect(normalizada.aindaCritica).toBe(false)
    expect(normalizada.situacao).toBe('normalizada')
    expect(normalizada.atual).toBeNull()
  })

  it('marca "sem-dados" a PON tratada sem nenhum cliente registrado', () => {
    const [semDados] = buildTreatedPons([treatment({ medicoes: [] })], [])

    expect(semDados.situacao).toBe('sem-dados')
    expect(semDados.aindaCritica).toBe(false)
  })

  it('ignora PONs cujo último evento foi reabertura', () => {
    const reaberta = treatment({ pon_key: 'OLT TBT · 3/4', action: 'reaberta' })
    expect(buildTreatedPons([treatment(), reaberta], [])).toHaveLength(1)
  })

  it('põe as que continuam críticas no topo, depois as reincidentes', () => {
    const critica = treatment({ pon_key: 'OLT TBT · 9/9', medicoes: [medicao(-28)] })
    const reincidente = treatment({ pon_key: 'OLT TBT · 5/5', treated_count: 2, reopened_count: 1 })
    const calma = treatment({ pon_key: 'OLT TBT · 1/1', created_at: '2026-08-01 10:00:00' })

    const ordered = buildTreatedPons([calma, reincidente, critica], [])

    expect(ordered.map(item => item.pon_key)).toEqual(['OLT TBT · 9/9', 'OLT TBT · 5/5', 'OLT TBT · 1/1'])
  })
})

describe('treatedSummary', () => {
  it('conta críticas, em atenção, normalizadas e reincidência', () => {
    const treated = buildTreatedPons([
      treatment({ medicoes: [medicao(-28)] }),
      treatment({ pon_key: 'OLT TBT · 5/5', treated_count: 2, reopened_count: 1, medicoes: [medicao(-26)] }),
      treatment({ pon_key: 'OLT TBT · 7/7', medicoes: [medicao(-22)] }),
    ], [])

    expect(treatedSummary(treated)).toEqual({
      total: 3, aindaCriticas: 1, emAtencao: 1, normalizadas: 1, semDados: 0, reincidentes: 1, potenciasPendentes: 0,
    })
  })

  it('acusa a PON que ficou com cliente sem nova potência', () => {
    const treated = buildTreatedPons([
      treatment({ medicoes: [medicao(-22), medicao(null, -29)] }),
      treatment({ pon_key: 'OLT TBT · 5/5', medicoes: [medicao(-21)] }),
    ], [])

    expect(treatedSummary(treated).potenciasPendentes).toBe(1)
    expect(medicoesProgresso(treated[0])).toEqual({ total: 2, preenchidas: 1, pendentes: 1 })
  })
})

describe('treatmentsByKey', () => {
  it('indexa o estado por PON para o card de hotspot mostrar reincidência', () => {
    const map = treatmentsByKey([treatment({ action: 'reaberta', treated_count: 3, reopened_count: 3 })])
    expect(map.get('OLT TBT · 1/2')?.treated_count).toBe(3)
  })
})
