/**
 * Monta a árvore de topologia PPPoE a partir dos clientes já normalizados
 * por `transformJuniper`.
 *
 * Hierarquia real do monitor:  cluster → interface (porta/VLAN) → cliente
 *
 * Camada pura, sem Three.js — o layout 3D consome o resultado daqui. Isso
 * mantém a regra de negócio testável sem precisar de WebGL no ambiente de teste.
 */

/** Cliente já normalizado por `transformJuniper` (campos em maiúsculas). */
export interface TopologyClient {
  usuario?: string
  ip?:      string
  mac?:     string
  iface?:   string
  state?:   string
  uptime?:  string
}

export type NodeKind = 'cluster' | 'iface' | 'client'

export interface TopologyNode {
  id:     string
  kind:   NodeKind
  label:  string
  /** Nó pai na árvore. `null` apenas para o cluster. */
  parent: string | null
  /**
   * Sessão ativa. Neste monitor uma sessão ativa é ANOMALIA, não saúde —
   * a página inteira trata "conexões indevidas" como o alerta.
   */
  active: boolean
  /** Total de clientes sob o nó (1 para folhas). Dimensiona o raio da esfera. */
  weight: number
  /** Clientes ativos sob o nó. Dimensiona a intensidade do vermelho. */
  activeCount: number
  detail: Record<string, string>
}

export interface TopologyLink {
  source: string
  target: string
  active: boolean
}

export interface TopologyGraph {
  nodes: TopologyNode[]
  links: TopologyLink[]
  stats: { ifaces: number; clients: number; active: number }
}

const EMPTY  = '—'
/** `ge-0/0/1.100` e `ge-0/0/1.200` são a mesma porta física. */
const physicalPort = (iface: string): string => (iface || 'UNKNOWN').split('.')[0] || 'UNKNOWN'

/** Sessão ativa é tudo que não seja explicitamente `inactive` — mesma regra de `transformJuniper`. */
export const isActive = (state?: string): boolean => (state ?? '').toLowerCase() !== 'inactive'

export function buildTopology(
  clientes: readonly TopologyClient[] | null | undefined,
  cluster = 'Vale',
): TopologyGraph {
  const list = clientes ?? []

  const clusterId = 'cluster'
  const nodes: TopologyNode[] = []
  const links: TopologyLink[] = []

  // Agrupa por porta física preservando a ordem de chegada, para que a
  // disposição no anel não mude de posição a cada refetch.
  const byIface = new Map<string, TopologyClient[]>()
  for (const c of list) {
    const port = physicalPort((c.iface ?? '').toUpperCase())
    const bucket = byIface.get(port)
    if (bucket) bucket.push(c)
    else byIface.set(port, [c])
  }

  let totalActive = 0

  for (const [port, members] of byIface) {
    const ifaceId = `iface:${port}`
    const activeMembers = members.filter(m => isActive(m.state)).length
    totalActive += activeMembers

    nodes.push({
      id:     ifaceId,
      kind:   'iface',
      label:  port,
      parent: clusterId,
      active: activeMembers > 0,
      weight: members.length,
      activeCount: activeMembers,
      detail: {
        Interface: port,
        Sessões:   String(members.length),
        Ativas:    String(activeMembers),
      },
    })
    links.push({ source: clusterId, target: ifaceId, active: activeMembers > 0 })

    members.forEach((c, i) => {
      // O usuário PPPoE pode repetir entre portas; o índice garante id único.
      const clientId = `client:${port}:${i}`
      const active   = isActive(c.state)
      nodes.push({
        id:     clientId,
        kind:   'client',
        label:  c.usuario || EMPTY,
        parent: ifaceId,
        active,
        weight: 1,
        activeCount: active ? 1 : 0,
        detail: {
          Usuário:   c.usuario || EMPTY,
          IP:        c.ip      || EMPTY,
          MAC:       c.mac     || EMPTY,
          Interface: c.iface   || EMPTY,
          Estado:    active ? 'ATIVA' : 'INATIVA',
          Uptime:    c.uptime  || EMPTY,
        },
      })
      links.push({ source: ifaceId, target: clientId, active })
    })
  }

  // O cluster entra primeiro na lista para ficar no índice 0 do layout.
  nodes.unshift({
    id:     clusterId,
    kind:   'cluster',
    label:  cluster || EMPTY,
    parent: null,
    active: totalActive > 0,
    weight: Math.max(list.length, 1),
    activeCount: totalActive,
    detail: {
      Cluster:    cluster || EMPTY,
      Interfaces: String(byIface.size),
      Sessões:    String(list.length),
      Ativas:     String(totalActive),
    },
  })

  return {
    nodes,
    links,
    stats: { ifaces: byIface.size, clients: list.length, active: totalActive },
  }
}
