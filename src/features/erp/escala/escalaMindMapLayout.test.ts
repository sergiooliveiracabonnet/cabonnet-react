import { describe, expect, it } from 'vitest'
import { layoutMindMap } from './escalaMindMapLayout'
import type { MindMapGroup } from './escalaMindMap'

function grupo(label: string, nEquipes: number): MindMapGroup {
  return {
    key: label, label, kind: 'cidade', color: '#3b82f6',
    equipes: Array.from({ length: nEquipes }, (_, i) => ({
      codigo: `F${i}`, tecnico: `Tecnico ${i}`, empresa: 'INSTACABLE', segundoLocal: false,
    })),
  }
}

const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by)

describe('layoutMindMap', () => {
  it('não quebra com zero grupos', () => {
    const layout = layoutMindMap([])
    expect(layout.groups).toHaveLength(0)
    expect(Number.isFinite(layout.size)).toBe(true)
  })

  it('posiciona cada grupo num ângulo diferente ao redor do centro', () => {
    const layout = layoutMindMap([grupo('A', 1), grupo('B', 1), grupo('C', 1)])
    const angulos = layout.groups.map(g => g.angleDeg)
    expect(new Set(angulos).size).toBe(3)
  })

  it('todo leaf fica mais longe do centro do que o próprio nó do grupo', () => {
    const layout = layoutMindMap([grupo('A', 5)])
    const [g] = layout.groups
    const distGrupo = dist(g.x, g.y, layout.centerX, layout.centerY)
    for (const leaf of g.leaves) {
      expect(dist(leaf.x, leaf.y, layout.centerX, layout.centerY)).toBeGreaterThan(distGrupo)
    }
  })

  it('leaves do mesmo grupo não se sobrepõem entre si', () => {
    const layout = layoutMindMap([grupo('A', 6)])
    const [g] = layout.groups
    for (let i = 0; i < g.leaves.length; i++) {
      for (let j = i + 1; j < g.leaves.length; j++) {
        const d = dist(g.leaves[i].x, g.leaves[i].y, g.leaves[j].x, g.leaves[j].y)
        expect(d).toBeGreaterThan(40)
      }
    }
  })

  it('cluster de leaves fica compacto (2 colunas) em vez de esticar numa fila só', () => {
    // 6 equipes deveriam formar ~3 "andares" (2 colunas), não 6 — o raio
    // máximo do grupo cresce bem menos do que cresceria numa fila reta.
    const um   = layoutMindMap([grupo('A', 1)])
    const seis = layoutMindMap([grupo('A', 6)])
    const raioUm   = dist(um.groups[0].leaves[0].x, um.groups[0].leaves[0].y, um.centerX, um.centerY)
    const raioSeis = Math.max(...seis.groups[0].leaves.map(l => dist(l.x, l.y, seis.centerX, seis.centerY)))
    // numa fila reta o raio do 6º item seria ~6x o do 1º; em 2 colunas (3
    // andares) deve ficar bem abaixo disso.
    expect(raioSeis).toBeLessThan(raioUm * 4)
  })

  it('canvas cresce para caber grupos com muitas equipes', () => {
    const pequeno = layoutMindMap([grupo('A', 1)])
    const grande  = layoutMindMap([grupo('A', 10)])
    expect(grande.size).toBeGreaterThan(pequeno.size)
  })

  it('nenhuma coordenada é NaN mesmo com muitos grupos', () => {
    const grupos = Array.from({ length: 9 }, (_, i) => grupo(`G${i}`, i))
    const layout = layoutMindMap(grupos)
    for (const g of layout.groups) {
      expect(Number.isFinite(g.x)).toBe(true)
      expect(Number.isFinite(g.y)).toBe(true)
      for (const leaf of g.leaves) {
        expect(Number.isFinite(leaf.x)).toBe(true)
        expect(Number.isFinite(leaf.y)).toBe(true)
      }
    }
  })
})
