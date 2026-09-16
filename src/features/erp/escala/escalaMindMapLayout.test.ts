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

describe('layoutMindMap (organograma em colunas)', () => {
  it('não quebra com zero grupos', () => {
    const layout = layoutMindMap([])
    expect(layout.groups).toHaveLength(0)
    expect(Number.isFinite(layout.width)).toBe(true)
    expect(Number.isFinite(layout.height)).toBe(true)
  })

  it('distribui os grupos em colunas ao redor do tronco (pelo menos 2)', () => {
    const layout = layoutMindMap([grupo('A', 1), grupo('B', 1), grupo('C', 1), grupo('D', 1)])
    const xs = new Set(layout.groups.map(g => g.x))
    expect(xs.size).toBeGreaterThanOrEqual(2)
  })

  it('abre mais colunas (mais largura, menos altura) quando há muito mais gente escalada', () => {
    const poucos  = layoutMindMap([grupo('A', 1), grupo('B', 1)])
    const muitos  = layoutMindMap(Array.from({ length: 10 }, (_, i) => grupo(`G${i}`, 6)))
    expect(muitos.width).toBeGreaterThan(poucos.width)
    // a proporção não pode disparar pra um retrato muito comprido — é o que
    // ficava ilegível numa miniatura de chat.
    expect(muitos.height / muitos.width).toBeLessThan(3)
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
    const porX = new Map<number, typeof layout.groups>()
    for (const g of layout.groups) porX.set(g.x, [...(porX.get(g.x) ?? []), g])
    for (const coluna of porX.values()) {
      const ys = coluna.map(g => g.y).sort((a, b) => a - b)
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
