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
