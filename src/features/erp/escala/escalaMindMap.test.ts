import { describe, expect, it } from 'vitest'
import { buildMindMapGroups } from './escalaMindMap'
import type { EscalaItem } from '../../../lib/api'

const DIA = '14/09/2026'

function item(team_code: string, local1: string, local2 = ''): EscalaItem {
  return { team_code, dia: DIA, local1, local2, updated_at: '', updated_by: '' }
}

describe('buildMindMapGroups', () => {
  it('quem está de folga, férias ou treinamento não entra na imagem', () => {
    const groups = buildMindMapGroups([
      item('F01', 'Folga'),
      item('F04', 'Férias'),
      item('F12', 'Treinamento'),
      item('F20', 'Taubaté'),
    ], DIA)

    const codigos = groups.flatMap(g => g.equipes.map(e => e.codigo))
    expect(codigos).not.toContain('F01')
    expect(codigos).not.toContain('F04')
    expect(codigos).not.toContain('F12')
    expect(codigos).toContain('F20')
    expect(groups.some(g => g.label === 'Folga')).toBe(false)
    expect(groups.some(g => g.label === 'Férias')).toBe(false)
    expect(groups.some(g => g.label === 'Treinamento')).toBe(false)
  })

  it('ausente, plantão e qualidade continuam aparecendo', () => {
    const groups = buildMindMapGroups([
      item('F01', 'Ausente'),
      item('F04', 'Plantão'),
      item('M01', 'Qualidade'),
    ], DIA)

    const labels = groups.map(g => g.label)
    expect(labels).toContain('Ausente')
    expect(labels).toContain('Plantão')
    expect(labels).toContain('Qualidade')
  })

  it('também exclui quando o status excluído está no local2', () => {
    const groups = buildMindMapGroups([item('F01', 'Taubaté', 'Folga')], DIA)
    const taubate = groups.find(g => g.label === 'Taubaté')
    expect(taubate?.equipes).toHaveLength(1)
    expect(groups.some(g => g.label === 'Folga')).toBe(false)
  })
})
