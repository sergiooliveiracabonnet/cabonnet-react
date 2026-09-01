import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardPanelHeader, SectionLabel } from './DashboardKpiPrimitives'
import { WarningCircle } from '@phosphor-icons/react'
describe('SectionLabel', () => {
  it('renderiza um heading h2 com o texto da seção', () => {
    render(<SectionLabel icon={WarningCircle} color="#f87171">Alertas &amp; Risco</SectionLabel>)
    expect(screen.getByRole('heading', { level: 2, name: 'Alertas & Risco' })).toBeInTheDocument()
  })
})

describe('DashboardPanelHeader', () => {
  it('combina título semântico, contexto e affordance de drill-down', () => {
    render(
      <DashboardPanelHeader
        icon={WarningCircle}
        color="#f87171"
        meta="comparação do período"
        actionLabel="Abrir OS"
      >
        Painel operacional
      </DashboardPanelHeader>,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Painel operacional' })).toBeInTheDocument()
    expect(screen.getByText('comparação do período')).toBeInTheDocument()
    expect(screen.getByText('Abrir OS')).toBeInTheDocument()
  })
})
