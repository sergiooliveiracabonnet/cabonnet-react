import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DashboardInvestigation } from './DashboardInvestigation'

describe('DashboardInvestigation', () => {
  it('mostra uma única visão por vez e troca por clique', () => {
    render(
      <DashboardInvestigation
        operation={<p>Conteúdo operacional</p>}
        territory={<p>Conteúdo territorial</p>}
        quality={<p>Conteúdo de qualidade</p>}
      />,
    )

    expect(screen.getByText('Conteúdo operacional')).toBeInTheDocument()
    expect(screen.queryByText('Conteúdo territorial')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /Território e demanda/i }))

    expect(screen.queryByText('Conteúdo operacional')).not.toBeInTheDocument()
    expect(screen.getByText('Conteúdo territorial')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Território e demanda/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('permite navegar nas visões com as setas do teclado', () => {
    render(
      <DashboardInvestigation
        operation={<p>Conteúdo operacional</p>}
        territory={<p>Conteúdo territorial</p>}
        quality={<p>Conteúdo de qualidade</p>}
      />,
    )

    const operation = screen.getByRole('tab', { name: /Operação/i })
    operation.focus()
    fireEvent.keyDown(operation, { key: 'ArrowRight' })

    expect(screen.getByText('Conteúdo territorial')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Território e demanda/i })).toHaveFocus()
  })
})
