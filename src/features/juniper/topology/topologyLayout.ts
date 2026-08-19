/**
 * Posiciona a árvore de topologia no espaço 3D.
 *
 * Camada pura (só aritmética, sem Three.js) para permitir teste sem WebGL.
 * Distribuição de Fibonacci: espalha N pontos numa esfera com espaçamento
 * quase uniforme, sem o acúmulo nos polos que uma grade lat/long produz.
 */
import type { TopologyGraph, TopologyNode } from './topologyGraph'

export interface Vec3 { x: number; y: number; z: number }
export type PositionMap = Map<string, Vec3>

/** Raio do anel de interfaces em torno do cluster. */
const IFACE_RADIUS = 9
/** Raio base da nuvem de clientes em torno da sua interface. */
const CLIENT_RADIUS = 2.4
/** Ângulo de ouro — o passo que gera a espiral de Fibonacci. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** i-ésimo de `count` pontos distribuídos numa esfera de raio `radius`. */
export function fibonacciPoint(i: number, count: number, radius: number): Vec3 {
  if (count <= 1) return { x: radius, y: 0, z: 0 }
  // y varia linearmente de +1 a -1; o raio do corte circular acompanha.
  const y     = 1 - (i / (count - 1)) * 2
  const ring  = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = GOLDEN_ANGLE * i
  return {
    x: Math.cos(theta) * ring * radius,
    y: y * radius,
    z: Math.sin(theta) * ring * radius,
  }
}

/** Nuvem de clientes cresce devagar com a contagem, senão portas cheias viram bolas gigantes. */
export function clientCloudRadius(memberCount: number): number {
  return CLIENT_RADIUS + Math.sqrt(Math.max(0, memberCount - 1)) * 0.55
}

export function layoutTopology(graph: TopologyGraph): PositionMap {
  const pos: PositionMap = new Map()
  pos.set('cluster', { x: 0, y: 0, z: 0 })

  const ifaces = graph.nodes.filter(n => n.kind === 'iface')
  ifaces.forEach((iface, i) => {
    pos.set(iface.id, fibonacciPoint(i, ifaces.length, IFACE_RADIUS))
  })

  // Agrupa clientes por interface para distribuí-los dentro da própria nuvem.
  const byParent = new Map<string, TopologyNode[]>()
  for (const n of graph.nodes) {
    if (n.kind !== 'client' || !n.parent) continue
    const bucket = byParent.get(n.parent)
    if (bucket) bucket.push(n)
    else byParent.set(n.parent, [n])
  }

  for (const [parentId, members] of byParent) {
    const origin = pos.get(parentId) ?? { x: 0, y: 0, z: 0 }
    const radius = clientCloudRadius(members.length)
    members.forEach((c, i) => {
      const p = fibonacciPoint(i, members.length, radius)
      pos.set(c.id, { x: origin.x + p.x, y: origin.y + p.y, z: origin.z + p.z })
    })
  }

  return pos
}

/** Raio da esfera do nó — cluster > interface > cliente, com peso na interface. */
export function nodeRadius(node: TopologyNode): number {
  if (node.kind === 'cluster') return 1.5
  if (node.kind === 'iface')   return 0.55 + Math.min(Math.sqrt(node.weight) * 0.18, 0.75)
  return 0.26
}
