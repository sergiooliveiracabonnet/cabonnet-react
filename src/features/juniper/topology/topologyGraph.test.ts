import { describe, it, expect } from 'vitest'
import { buildTopology, isActive, type TopologyClient } from './topologyGraph'

const c = (over: Partial<TopologyClient> = {}): TopologyClient => ({
  usuario: 'FULANO',
  ip:      '10.0.0.1',
  mac:     'AA:BB:CC',
  iface:   'GE-0/0/1.100',
  state:   'active',
  uptime:  '1H',
  ...over,
})

describe('isActive', () => {
  it('trata apenas "inactive" como sessao encerrada', () => {
    expect(isActive('active')).toBe(true)
    expect(isActive('ACTIVE')).toBe(true)
    expect(isActive(undefined)).toBe(true)
    expect(isActive('inactive')).toBe(false)
    expect(isActive('INACTIVE')).toBe(false)
  })
})

describe('buildTopology', () => {
  it('devolve so o cluster quando nao ha clientes', () => {
    const g = buildTopology([], 'Vale')
    expect(g.nodes).toHaveLength(1)
    expect(g.nodes[0].kind).toBe('cluster')
    expect(g.links).toHaveLength(0)
    expect(g.stats).toEqual({ ifaces: 0, clients: 0, active: 0 })
  })

  it('tolera entrada nula', () => {
    expect(buildTopology(null).nodes).toHaveLength(1)
    expect(buildTopology(undefined).stats.clients).toBe(0)
  })

  it('agrupa sub-interfaces na mesma porta fisica', () => {
    const g = buildTopology([
      c({ iface: 'GE-0/0/1.100' }),
      c({ iface: 'GE-0/0/1.200' }),
      c({ iface: 'AE0.10' }),
    ])
    const ifaces = g.nodes.filter(n => n.kind === 'iface')
    expect(ifaces.map(i => i.label).sort()).toEqual(['AE0', 'GE-0/0/1'])
    expect(ifaces.find(i => i.label === 'GE-0/0/1')?.weight).toBe(2)
  })

  it('o cluster e sempre o primeiro no', () => {
    const g = buildTopology([c(), c()])
    expect(g.nodes[0].id).toBe('cluster')
    expect(g.nodes[0].parent).toBeNull()
  })

  it('conta sessoes ativas e propaga ate o cluster', () => {
    const g = buildTopology([
      c({ state: 'active' }),
      c({ state: 'inactive' }),
      c({ state: 'inactive' }),
    ])
    expect(g.stats).toEqual({ ifaces: 1, clients: 3, active: 1 })
    expect(g.nodes[0].activeCount).toBe(1)
    expect(g.nodes[0].active).toBe(true)
  })

  it('marca interface sem sessao ativa como inativa', () => {
    const g = buildTopology([c({ state: 'inactive' })])
    const iface = g.nodes.find(n => n.kind === 'iface')
    expect(iface?.active).toBe(false)
    expect(iface?.activeCount).toBe(0)
  })

  it('gera ids unicos mesmo com usuario repetido na mesma porta', () => {
    const g = buildTopology([c({ usuario: 'REPETIDO' }), c({ usuario: 'REPETIDO' })])
    const ids = g.nodes.map(n => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('liga cada cliente a sua interface e cada interface ao cluster', () => {
    const g = buildTopology([c({ iface: 'AE0' }), c({ iface: 'AE1' })])
    const fromCluster = g.links.filter(l => l.source === 'cluster')
    expect(fromCluster).toHaveLength(2)
    // Todo no que nao e cluster precisa ser alvo de exatamente uma ligacao.
    for (const node of g.nodes.filter(n => n.parent !== null)) {
      expect(g.links.filter(l => l.target === node.id)).toHaveLength(1)
    }
  })

  it('usa fallback para campos ausentes sem quebrar', () => {
    const g = buildTopology([{}])
    const client = g.nodes.find(n => n.kind === 'client')
    expect(client?.label).toBe('—')
    expect(client?.detail.IP).toBe('—')
    expect(g.nodes.find(n => n.kind === 'iface')?.label).toBe('UNKNOWN')
  })

  it('registra o estado legivel no detalhe do cliente', () => {
    const g = buildTopology([c({ state: 'inactive' })])
    expect(g.nodes.find(n => n.kind === 'client')?.detail.Estado).toBe('INATIVA')
  })
})
