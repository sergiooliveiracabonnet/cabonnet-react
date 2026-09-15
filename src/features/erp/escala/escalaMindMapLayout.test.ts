import { describe, expect, it } from 'vitest'
import { layoutMindMap, LEAF_D } from './escalaMindMapLayout'
import type { MindMapGroup } from './escalaMindMap'

function grupo(label: string, nEquipes: number): MindMapGroup {
  return {
    key: label, label, kind: 'cidade', color: '#3b82f6',
    equipes: Array.from({ length: nEquipes }, (_, i) => ({
      codigo: `F${i}`, tecnico: `Tecnico ${i}`, empresa: 'INSTACABLE', segundoLocal: false,
    })),
  }
}

describe('layoutMindMap (organograma em duas colunas)', () => {
  it('não quebra com zero grupos', () => {
    const layout = layoutMindMap([])
    expect(layout.groups).toHaveLength(0)
    expect(Number.isFinite(layout.width)).toBe(true)
    expect(Number.isFinite(layout.height)).toBe(true)
  })

  it('distribui os grupos entre coluna esquerda e direita do tronco', () => {
    const layout = layoutMindMap([grupo('A', 1), grupo('B', 1), grupo('C', 1), grupo('D', 1)])
    const lados = new Set(layout.groups.map(g => g.side))
    expect(lados.has('left')).toBe(true)
    expect(lados.has('right')).toBe(true)
    for (const g of layout.groups) {
      if (g.side === 'left')  expect(g.x).toBeLessThan(layout.rootX)
      if (g.side === 'right') expect(g.x).toBeGreaterThan(layout.rootX)
    }
  })

  it('a largura do canvas não cresce conforme mais grupos são adicionados (o que crescia era a altura)', () => {
    const poucos  = layoutMindMap([grupo('A', 1), grupo('B', 1)])
    const muitos  = layoutMindMap(Array.from({ length: 8 }, (_, i) => grupo(`G${i}`, 1)))
    expect(muitos.width).toBe(poucos.width)
    expect(muitos.height).toBeGreaterThan(poucos.height)
  })

  it('as equipes de um grupo ficam centralizadas sob o nó do grupo', () => {
    const layout = layoutMindMap([grupo('A', 4)])
    const [g] = layout.groups
    const mediaX = g.leaves.reduce((s, l) => s + l.x, 0) / g.leaves.length
    expect(mediaX).toBeCloseTo(g.x, 0)
    for (const leaf of g.leaves) expect(leaf.y).toBeGreaterThan(g.y)
  })

  it('leaves do mesmo grupo não se sobrepõem', () => {
    const layout = layoutMindMap([grupo('A', 6)])
    const [g] = layout.groups
    for (let i = 0; i < g.leaves.length; i++) {
      for (let j = i + 1; j < g.leaves.length; j++) {
        const d = Math.hypot(g.leaves[i].x - g.leaves[j].x, g.leaves[i].y - g.leaves[j].y)
        expect(d).toBeGreaterThan(40)
      }
    }
  })

  it('grupos empilhados na mesma coluna não se sobrepõem verticalmente', () => {
    const layout = layoutMindMap([grupo('Grande', 8), grupo('A', 1), grupo('B', 1), grupo('C', 1)])
    const porColuna = { left: layout.groups.filter(g => g.side === 'left'), right: layout.groups.filter(g => g.side === 'right') }
    for (const lado of [porColuna.left, porColuna.right]) {
      const ys = lado.map(g => g.y).sort((a, b) => a - b)
      for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1])
    }
  })

  it('nenhuma coordenada é NaN mesmo com muitos grupos', () => {
    const grupos = Array.from({ length: 9 }, (_, i) => grupo(`G${i}`, i))
    const layout = layoutMindMap(grupos)
    expect(Number.isFinite(layout.rootX)).toBe(true)
    for (const g of layout.groups) {
      expect(Number.isFinite(g.x)).toBe(true)
      expect(Number.isFinite(g.y)).toBe(true)
      for (const leaf of g.leaves) {
        expect(Number.isFinite(leaf.x)).toBe(true)
        expect(Number.isFinite(leaf.y)).toBe(true)
      }
    }
  })

  it('exporta o diâmetro do leaf usado no layout (consistência com o SVG)', () => {
    expect(LEAF_D).toBeGreaterThan(0)
  })
})
