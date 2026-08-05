import { describe, expect, it } from 'vitest'
import { buildRevisitReasonsSummary, summarizeReasonItems } from './revisitReasonsSummary'
import type { RevisitJourney } from '../../hooks/useRevisitJourneys'

type Flags = { revisita_inst?: number; revisita_manut?: number; revisita_serv?: number }

function journey(os: string, observacao = '', cidade = 'Taubaté', flags: Flags = {}): RevisitJourney {
  return {
    origin_os: null, revisit_os: os, recurrence: 1, link_basis: null,
    link_confidence: 'unlinked', days_between: null, same_team: null, origin: null,
    revisit: {
      numos: os, observacao, nomedacidade: cidade, equipeexecutou: 'F01',
      revisita_inst: 0, revisita_manut: 0, revisita_serv: 0, ...flags,
    } as RevisitJourney['revisit'],
  }
}

const INST  = { revisita_inst: 1 }
const MANUT = { revisita_manut: 1 }
const SERV  = { revisita_serv: 1 }

describe('buildRevisitReasonsSummary', () => {
  it('fecha o total oficial sem duplicar OS entre categorias', () => {
    const result = buildRevisitReasonsSummary(
      [journey('1', 'trocado roteador'), journey('2', 'refeito conector'), journey('3')],
      [{ numos: '1', motivo: 'Execução / Técnico', ts: 1, nomedaequipe: 'F01', nomedacidade: 'Taubaté', origem: 'manual' }],
    )
    expect(result.total).toBe(3)
    expect(result.confirmed + result.probable + result.undetermined).toBe(3)
    expect(result.items.find(i => i.revisitOs === '1')?.level).toBe('confirmed')
    expect(result.items.find(i => i.revisitOs === '2')?.category).toBe('Conectorização/Sinal')
  })

  it('agrega categorias e preserva ocorrências de exemplo', () => {
    const result = buildRevisitReasonsSummary([journey('1', 'sinal baixo'), journey('2', 'potência fora')], [])
    expect(result.categories[0]).toMatchObject({ category: 'Conectorização/Sinal', count: 2, pct: 100 })
    expect(result.categories[0].occurrences).toHaveLength(2)
  })
})

describe('recorte por cidade', () => {
  it('agrupa por cidade e ordena da mais impactada para a menos', () => {
    const result = buildRevisitReasonsSummary([
      journey('1', 'sinal baixo',   'Taubaté'),
      journey('2', 'conector solto', 'Taubaté'),
      journey('3', 'trocado roteador', 'Caçapava'),
    ], [])

    expect(result.byCity.map(c => c.city)).toEqual(['Taubaté', 'Caçapava'])
    expect(result.byCity[0].total).toBe(2)
    expect(result.byCity[1].total).toBe(1)
  })

  it('calcula o percentual dentro da própria cidade, não sobre o total geral', () => {
    const result = buildRevisitReasonsSummary([
      journey('1', 'sinal baixo',      'Taubaté'),
      journey('2', 'sinal baixo',      'Taubaté'),
      journey('3', 'sinal baixo',      'Taubaté'),
      journey('4', 'trocado roteador', 'Caçapava'),
    ], [])

    const cacapava = result.byCity.find(c => c.city === 'Caçapava')
    // 1 de 4 no geral, mas 100% do que impacta Caçapava
    expect(cacapava?.categories[0]).toMatchObject({ category: 'Equipamento', count: 1, pct: 100 })
  })

  it('expõe o motivo dominante de cada cidade', () => {
    const result = buildRevisitReasonsSummary([
      journey('1', 'sinal baixo',      'Taubaté'),
      journey('2', 'sinal baixo',      'Taubaté'),
      journey('3', 'trocado roteador', 'Taubaté'),
      journey('4', 'trocado roteador', 'Caçapava'),
    ], [])

    expect(result.byCity.find(c => c.city === 'Taubaté')).toMatchObject({
      topCategory: 'Conectorização/Sinal', topCount: 2, topPct: 67,
    })
    expect(result.byCity.find(c => c.city === 'Caçapava')?.topCategory).toBe('Equipamento')
  })

  it('usa "Sem cidade" quando a OS não tem cidade', () => {
    const result = buildRevisitReasonsSummary([journey('1', 'sinal baixo', '')], [])
    expect(result.byCity[0].city).toBe('Sem cidade')
  })

  it('summarizeReasonItems reescopa os KPIs para o subconjunto recebido', () => {
    const result = buildRevisitReasonsSummary([
      journey('1', 'sinal baixo',      'Taubaté'),
      journey('2', 'trocado roteador', 'Caçapava'),
    ], [])

    const soTaubate = summarizeReasonItems(result.items.filter(i => i.city === 'Taubaté'))

    expect(result.total).toBe(2)
    expect(soTaubate.total).toBe(1)
    expect(soTaubate.categories[0]).toMatchObject({ category: 'Conectorização/Sinal', pct: 100 })
  })
})

describe('quebra por tipo de revisita', () => {
  it('lê o tipo das flags oficiais da linha', () => {
    const result = buildRevisitReasonsSummary([
      journey('1', 'sinal baixo', 'Taubaté', INST),
      journey('2', 'sinal baixo', 'Taubaté', MANUT),
      journey('3', 'sinal baixo', 'Taubaté', SERV),
    ], [])

    expect(result.items.map(i => i.tipo)).toEqual(['instalacao', 'manutencao', 'servico'])
  })

  // A diretoria precisa ver o zero: uma cidade sem revisita de instalação é
  // informação, não ausência de informação.
  it('sempre devolve os três tipos, mesmo zerados', () => {
    const result = buildRevisitReasonsSummary([journey('1', 'sinal baixo', 'Taubaté', MANUT)], [])

    expect(result.byTipo.map(t => t.tipo)).toEqual(['instalacao', 'servico', 'manutencao'])
    expect(result.byTipo.find(t => t.tipo === 'instalacao')).toMatchObject({ count: 0, pct: 0 })
    expect(result.byTipo.find(t => t.tipo === 'manutencao')).toMatchObject({ count: 1, pct: 100 })
  })

  it('traz os motivos de cada tipo, com percentual dentro do tipo', () => {
    const result = buildRevisitReasonsSummary([
      journey('1', 'sinal baixo',      'Taubaté', INST),
      journey('2', 'conector solto',   'Taubaté', INST),
      journey('3', 'trocado roteador', 'Taubaté', MANUT),
    ], [])

    const inst = result.byTipo.find(t => t.tipo === 'instalacao')
    expect(inst?.count).toBe(2)
    expect(inst?.categories[0]).toMatchObject({ category: 'Conectorização/Sinal', count: 2, pct: 100 })

    const manut = result.byTipo.find(t => t.tipo === 'manutencao')
    expect(manut?.categories[0]).toMatchObject({ category: 'Equipamento', count: 1, pct: 100 })
  })

  it('cada cidade tem sua própria quebra por tipo', () => {
    const result = buildRevisitReasonsSummary([
      journey('1', 'sinal baixo',      'Taubaté',  INST),
      journey('2', 'trocado roteador', 'Taubaté',  MANUT),
      journey('3', 'trocado roteador', 'Caçapava', MANUT),
    ], [])

    const taubate = result.byCity.find(c => c.city === 'Taubaté')
    const cacapava = result.byCity.find(c => c.city === 'Caçapava')

    expect(taubate?.byTipo.find(t => t.tipo === 'instalacao')?.count).toBe(1)
    expect(cacapava?.byTipo.find(t => t.tipo === 'instalacao')?.count).toBe(0)
    expect(cacapava?.byTipo.find(t => t.tipo === 'manutencao')?.categories[0]?.category).toBe('Equipamento')
  })

  it('revisita sem flag não é contada em nenhum tipo', () => {
    const result = buildRevisitReasonsSummary([journey('1', 'sinal baixo', 'Taubaté')], [])

    expect(result.items[0].tipo).toBeNull()
    expect(result.byTipo.reduce((acc, t) => acc + t.count, 0)).toBe(0)
    expect(result.total).toBe(1)
  })
})
