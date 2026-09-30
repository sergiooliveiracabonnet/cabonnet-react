import { describe, it, expect } from 'vitest'
import { visibleNavGroups, flattenLinks, NAV_GROUPS } from './navigation'

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

  it('exibe nivel de sinal quando o modulo esta liberado', () => {
    const groups = visibleNavGroups('operador', ['nivel_sinal'])
    const links = groups.flatMap(group => group.links.map(link => link.to))

    expect(links).toEqual(['/nivel-sinal'])
  })

  it('exibe clientes so com o modulo cliente liberado', () => {
    const links = (m: string[]) => visibleNavGroups('operador', m).flatMap(g => g.links.map(l => l.to))
    expect(links(['cliente'])).toEqual(['/clientes'])
    expect(links(['ordens'])).not.toContain('/clientes')
  })

  it('reincidencias e submenu de qualidade e herda a permissao do modulo qualidade', () => {
    const agora = (m: string[]) => visibleNavGroups('operador', m).find(g => g.key === 'agora')
    const qualidade = agora(['qualidade'])?.links.find(l => l.to === '/qualidade')
    expect(qualidade?.children?.map(c => c.to)).toEqual(['/qualidade/reincidencias'])
    expect(flattenLinks(agora(['qualidade'])!.links).map(l => l.to)).toContain('/qualidade/reincidencias')
    expect(agora(['ordens'])).toBeUndefined()
  })

  it('so ter dashboard nao libera mais qualidade e tendencia (modulo proprio)', () => {
    const agora = (m: string[]) => visibleNavGroups('operador', m).find(g => g.key === 'agora')
    const links = flattenLinks(agora(['dashboard'])!.links).map(l => l.to)
    expect(links).not.toContain('/qualidade')
    expect(links).not.toContain('/qualidade/reincidencias')
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
