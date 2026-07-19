import { describe, it, expect } from 'vitest'
import { ClipboardList, Map as MapIcon } from 'lucide-react'
import { matchPages } from './GlobalSearch'
import type { NavGroup } from '../../lib/navigation'

const GROUPS: NavGroup[] = [
  {
    key: 'operar', label: 'Operar', color: '#22d3ee',
    links: [
      { to: '/ordens', label: 'Ordens', icon: ClipboardList },
      { to: '/mapa',   label: 'Mapa',   icon: MapIcon },
    ],
  },
]

describe('matchPages', () => {
  it('retorna vazio para query em branco', () => {
    expect(matchPages(GROUPS, '')).toEqual([])
    expect(matchPages(GROUPS, '   ')).toEqual([])
  })

  it('filtra por substring case-insensitive no label', () => {
    const result = matchPages(GROUPS, 'orde')
    expect(result.map(p => p.to)).toEqual(['/ordens'])
  })

  it('nao retorna nada quando nenhum label bate', () => {
    expect(matchPages(GROUPS, 'zzz')).toEqual([])
  })

  it('prioriza match exato no topo', () => {
    const groups: NavGroup[] = [
      {
        key: 'g', label: 'G', color: '#000',
        links: [
          { to: '/mapa-de-calor', label: 'Mapa de Calor', icon: MapIcon },
          { to: '/mapa',          label: 'Mapa',           icon: MapIcon },
        ],
      },
    ]
    const result = matchPages(groups, 'mapa')
    expect(result[0].to).toBe('/mapa')
  })

  it('funciona com 1 caractere', () => {
    const result = matchPages(GROUPS, 'm')
    expect(result.map(p => p.to)).toEqual(['/mapa'])
  })
})
