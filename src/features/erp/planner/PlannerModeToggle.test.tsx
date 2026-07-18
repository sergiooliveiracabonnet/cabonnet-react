import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PlannerModeToggle } from './PlannerModeToggle'

// Projeto não usa `test.globals` — RTL não desmonta entre testes sem afterEach explícito.
afterEach(cleanup)

describe('PlannerModeToggle', () => {
  it('mostra os dois modos e destaca o ativo', () => {
    render(<PlannerModeToggle modo="executado" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Executado' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Planejado' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('chama onChange com o modo clicado', () => {
    const onChange = vi.fn()
    render(<PlannerModeToggle modo="executado" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Planejado' }))
    expect(onChange).toHaveBeenCalledWith('planejado')
  })
})
