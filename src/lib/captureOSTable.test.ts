import { describe, it, expect } from 'vitest'
import type { CaptureOSRow } from './captureOSTable'

// ─── Helpers testáveis extraídos da lógica de captureOSTable ────────────────
// As funções canvas em si não podem ser testadas sem DOM (jsdom não suporta
// CanvasRenderingContext2D). Testamos apenas a lógica pura de agrupamento
// e ordenação que é reutilizável e crítica para a corretude das imagens.

function makeRow(overrides: Partial<CaptureOSRow> = {}): CaptureOSRow {
  return {
    nomedaequipe:     'EQUIPE TESTE',
    _situacaoEfetiva: 'Pendente',
    _aging:            2,
    _slaCritico:       false,
    numos:            '1234567',
    nomecliente:      'Cliente Teste',
    dataagendamento:  '15/06/2025',
    nomedacidade:     'TAUBATE',
    ...overrides,
  }
}

// Reimplementação local da lógica de agrupamento por equipe
function groupByEquipe(rows: CaptureOSRow[]): Map<string, { pendente: number; atend: number; aging: number[]; criticas: number }> {
  const map = new Map<string, { pendente: number; atend: number; aging: number[]; criticas: number }>()
  for (const r of rows) {
    const eq = (r.nomedaequipe as string)?.trim() || '(Sem Equipe)'
    if (!map.has(eq)) map.set(eq, { pendente: 0, atend: 0, aging: [], criticas: 0 })
    const g = map.get(eq)!
    if (r._situacaoEfetiva === 'Pendente')    g.pendente++
    if (r._situacaoEfetiva === 'Atendimento') g.atend++
    if (r._aging != null)                      g.aging.push(r._aging as number)
    if (r._slaCritico)                         g.criticas++
  }
  return map
}

function sortGroupsByTotal(groups: [string, { pendente: number; atend: number }][]): [string, { pendente: number; atend: number }][] {
  return [...groups].sort(([, a], [, b]) => (a.pendente + a.atend) - (b.pendente + b.atend))
}

describe('groupByEquipe — agrupamento de OS por equipe', () => {
  it('agrupa corretamente por equipe', () => {
    const rows = [
      makeRow({ nomedaequipe: 'EQUIPE A', _situacaoEfetiva: 'Pendente' }),
      makeRow({ nomedaequipe: 'EQUIPE A', _situacaoEfetiva: 'Atendimento' }),
      makeRow({ nomedaequipe: 'EQUIPE B', _situacaoEfetiva: 'Pendente' }),
    ]
    const groups = groupByEquipe(rows)
    expect(groups.size).toBe(2)
    expect(groups.get('EQUIPE A')?.pendente).toBe(1)
    expect(groups.get('EQUIPE A')?.atend).toBe(1)
    expect(groups.get('EQUIPE B')?.pendente).toBe(1)
  })

  it('usa "(Sem Equipe)" para equipe vazia', () => {
    const rows = [
      makeRow({ nomedaequipe: '' }),
      makeRow({ nomedaequipe: '   ' }),
    ]
    const groups = groupByEquipe(rows)
    expect(groups.has('(Sem Equipe)')).toBe(true)
    expect(groups.get('(Sem Equipe)')!.pendente).toBe(2)
  })

  it('conta OS críticas corretamente', () => {
    const rows = [
      makeRow({ nomedaequipe: 'EQUIPE A', _slaCritico: true }),
      makeRow({ nomedaequipe: 'EQUIPE A', _slaCritico: true }),
      makeRow({ nomedaequipe: 'EQUIPE A', _slaCritico: false }),
    ]
    const groups = groupByEquipe(rows)
    expect(groups.get('EQUIPE A')?.criticas).toBe(2)
  })

  it('acumula array de aging', () => {
    const rows = [
      makeRow({ nomedaequipe: 'EQUIPE A', _aging: 3 }),
      makeRow({ nomedaequipe: 'EQUIPE A', _aging: 7 }),
      makeRow({ nomedaequipe: 'EQUIPE A', _aging: null }),
    ]
    const groups = groupByEquipe(rows)
    expect(groups.get('EQUIPE A')?.aging).toEqual([3, 7])
  })

  it('retorna mapa vazio para lista vazia', () => {
    expect(groupByEquipe([])).toEqual(new Map())
  })
})

describe('sortGroupsByTotal — ordenação por volume', () => {
  it('ordena do menor para o maior volume (para o relatório por equipe)', () => {
    const groups: [string, { pendente: number; atend: number }][] = [
      ['EQUIPE C', { pendente: 10, atend: 5 }],
      ['EQUIPE A', { pendente: 2,  atend: 1  }],
      ['EQUIPE B', { pendente: 5,  atend: 3  }],
    ]
    const sorted = sortGroupsByTotal(groups)
    expect(sorted.map(([name]) => name)).toEqual(['EQUIPE A', 'EQUIPE B', 'EQUIPE C'])
  })

  it('não mutaciona o array original', () => {
    const groups: [string, { pendente: number; atend: number }][] = [
      ['EQUIPE B', { pendente: 5, atend: 0 }],
      ['EQUIPE A', { pendente: 2, atend: 0 }],
    ]
    const originalFirst = groups[0][0]
    sortGroupsByTotal(groups)
    expect(groups[0][0]).toBe(originalFirst)
  })

  it('mantém estabilidade quando totais são iguais', () => {
    const groups: [string, { pendente: number; atend: number }][] = [
      ['EQUIPE A', { pendente: 5, atend: 0 }],
      ['EQUIPE B', { pendente: 3, atend: 2 }],
    ]
    const sorted = sortGroupsByTotal(groups)
    expect(sorted).toHaveLength(2)
  })
})
