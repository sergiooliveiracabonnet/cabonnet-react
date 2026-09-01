import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DashboardCommandCenter } from './DashboardCommandCenter'
import type { KPI, OSRow } from '../../lib/types'

const priorities: KPI[] = [
  { id: 'criticas', title: 'OS Críticas', value: 3, sub: 'SLA 2× excedido', accent: 'red' },
  { id: 'semEq', title: 'Sem Equipe', value: 5, sub: 'sem atribuição', accent: 'orange' },
  { id: 'copeAguardando', title: 'Aguard. Roteirização', value: 12, sub: 'parado no COPE', accent: 'orange' },
]

describe('DashboardCommandCenter', () => {
  it('mantém a primeira dobra dedicada somente às prioridades', () => {
    render(
      <DashboardCommandCenter
        priorities={priorities}
        projection={{ proj24h: 0, proj48h: 0, amostra: [] }}
        criticalNow={3}
        onPriority={() => {}}
        onProjection={() => {}}
      />,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Prioridades agora' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Pulso operacional' })).not.toBeInTheDocument()
    expect(screen.getAllByTestId('priority-card')).toHaveLength(3)
  })

  it('coloca prioridades ativas antes das zeradas e desabilita cards sem ocorrências', () => {
    render(
      <DashboardCommandCenter
        priorities={[
          { id: 'zerada', title: 'Sem equipe', value: 0, sub: 'sem atribuição', accent: 'orange' },
          { id: 'ativa', title: 'OS Críticas', value: 4, sub: 'SLA 2× excedido', accent: 'red' },
        ]}
        projection={{ proj24h: 0, proj48h: 0, amostra: [] }}
        criticalNow={4}
        onPriority={() => {}}
        onProjection={() => {}}
      />,
    )

    const cards = screen.getAllByTestId('priority-card')
    expect(cards[0]).toHaveTextContent('OS Críticas')
    expect(screen.getByRole('button', { name: /Sem equipe.*sem ocorrências/i })).toBeDisabled()
  })

  it('abre a prioridade e a projeção usando os callbacks do container', () => {
    const onPriority = vi.fn()
    const onProjection = vi.fn()
    const riskRow = { numos: '9000001' } as OSRow

    render(
      <DashboardCommandCenter
        priorities={priorities}
        projection={{ proj24h: 2, proj48h: 4, amostra: [riskRow] }}
        criticalNow={3}
        onPriority={onPriority}
        onProjection={onProjection}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /OS Críticas.*3.*Abrir/i }))
    expect(onPriority).toHaveBeenCalledWith(priorities[0])

    fireEvent.click(screen.getByRole('button', { name: /6 em risco.*ver OS/i }))
    expect(onProjection).toHaveBeenCalledWith([riskRow])
  })
})
