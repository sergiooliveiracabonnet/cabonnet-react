import { describe, it, expect } from 'vitest'
import { visibleNavGroups, NAV_GROUPS } from './navigation'

describe('visibleNavGroups', () => {
  it('gestor ve todos os grupos e ganha Usuarios no grupo infra', () => {
    const groups = visibleNavGroups('gestor', [])
    expect(groups.length).toBe(NAV_GROUPS.length)
    const infra = groups.find(g => g.key === 'infra')
    expect(infra?.links.map(l => l.to)).toContain('/erp/usuarios')
  })

  it('operador ve somente links dos modulos liberados', () => {
    const groups = visibleNavGroups('operador', ['dashboard', 'ordens'])
    const allLinks = groups.flatMap(g => g.links.map(l => l.to))
    expect(allLinks).toEqual(expect.arrayContaining(['/', '/ordens']))
    expect(allLinks).not.toContain('/juniper')
    expect(allLinks).not.toContain('/erp/usuarios')
  })

  it('remove grupos sem nenhum link visivel', () => {
    const groups = visibleNavGroups('viewer', ['dashboard'])
    expect(groups.every(g => g.links.length > 0)).toBe(true)
    expect(groups.find(g => g.key === 'operar')).toBeUndefined()
  })

  it('viewer sem modulos liberados nao ve nenhum grupo', () => {
    const groups = visibleNavGroups('viewer', [])
    expect(groups).toEqual([])
  })
})
