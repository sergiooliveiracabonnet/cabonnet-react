import { describe, it, expect } from 'vitest'
import { buildTopology, type TopologyClient } from './topologyGraph'
import { layoutTopology, fibonacciPoint, clientCloudRadius, nodeRadius } from './topologyLayout'

const mag = (p: { x: number; y: number; z: number }) => Math.hypot(p.x, p.y, p.z)

const c = (iface: string, state = 'active'): TopologyClient => ({
  usuario: 'X', ip: '10.0.0.1', mac: 'AA', iface, state, uptime: '1H',
})

describe('fibonacciPoint', () => {
  it('mantem todos os pontos sobre a esfera do raio pedido', () => {
    const n = 24
    for (let i = 0; i < n; i++) {
      expect(mag(fibonacciPoint(i, n, 9))).toBeCloseTo(9, 5)
    }
  })

  it('nao gera NaN no caso degenerado de um ponto', () => {
    const p = fibonacciPoint(0, 1, 5)
    expect(Number.isNaN(p.x + p.y + p.z)).toBe(false)
    expect(mag(p)).toBeCloseTo(5, 5)
  })

  it('distribui pontos distintos', () => {
    const pts = Array.from({ length: 10 }, (_, i) => JSON.stringify(fibonacciPoint(i, 10, 4)))
    expect(new Set(pts).size).toBe(10)
  })
})

describe('clientCloudRadius', () => {
  it('cresce de forma sublinear com a quantidade', () => {
    const r1  = clientCloudRadius(1)
    const r10 = clientCloudRadius(10)
    const r40 = clientCloudRadius(40)
    expect(r10).toBeGreaterThan(r1)
    expect(r40).toBeGreaterThan(r10)
    // Quadruplicar a contagem nao pode dobrar o raio.
    expect(r40 - r10).toBeLessThan(r10 - r1 + 2)
  })
})

describe('nodeRadius', () => {
  it('mantem a hierarquia visual cluster > interface > cliente', () => {
    const g = buildTopology([c('AE0')])
    const cluster = g.nodes.find(n => n.kind === 'cluster')!
    const iface   = g.nodes.find(n => n.kind === 'iface')!
    const client  = g.nodes.find(n => n.kind === 'client')!
    expect(nodeRadius(cluster)).toBeGreaterThan(nodeRadius(iface))
    expect(nodeRadius(iface)).toBeGreaterThan(nodeRadius(client))
  })

  it('limita o crescimento da interface por peso', () => {
    const pequena = buildTopology([c('AE0')]).nodes.find(n => n.kind === 'iface')!
    const enorme  = buildTopology(Array.from({ length: 300 }, () => c('AE0')))
      .nodes.find(n => n.kind === 'iface')!
    expect(nodeRadius(enorme)).toBeGreaterThan(nodeRadius(pequena))
    expect(nodeRadius(enorme)).toBeLessThanOrEqual(1.3)
  })
})

describe('layoutTopology', () => {
  it('posiciona o cluster na origem', () => {
    const pos = layoutTopology(buildTopology([c('AE0')]))
    expect(pos.get('cluster')).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('da posicao a todos os nos do grafo', () => {
    const g = buildTopology([c('AE0'), c('AE1'), c('GE-0/0/1.10')])
    const pos = layoutTopology(g)
    for (const node of g.nodes) {
      expect(pos.has(node.id)).toBe(true)
    }
  })

  it('nao produz coordenadas NaN', () => {
    const g = buildTopology(Array.from({ length: 30 }, (_, i) => c(`AE${i % 4}`)))
    for (const p of layoutTopology(g).values()) {
      expect(Number.isFinite(p.x + p.y + p.z)).toBe(true)
    }
  })

  it('mantem clientes proximos da propria interface', () => {
    const g = buildTopology(Array.from({ length: 6 }, () => c('AE0')))
    const pos = layoutTopology(g)
    const iface = g.nodes.find(n => n.kind === 'iface')!
    const origin = pos.get(iface.id)!
    const raio = clientCloudRadius(6)
    for (const client of g.nodes.filter(n => n.parent === iface.id)) {
      const p = pos.get(client.id)!
      const d = Math.hypot(p.x - origin.x, p.y - origin.y, p.z - origin.z)
      expect(d).toBeLessThanOrEqual(raio + 0.001)
    }
  })

  it('e estavel entre execucoes com a mesma entrada', () => {
    const input = [c('AE0'), c('AE1'), c('AE0')]
    const a = layoutTopology(buildTopology(input))
    const b = layoutTopology(buildTopology(input))
    expect([...a.entries()]).toEqual([...b.entries()])
  })
})
