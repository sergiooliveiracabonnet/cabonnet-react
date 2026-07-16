import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { fireEvent, cleanup } from '@testing-library/react'
import { Card } from './Card'

// Projeto não usa `test.globals` — RTL não desmonta entre testes sem afterEach explícito.
afterEach(cleanup)

describe('Card interativo', () => {
  it('sem onClick não é botão', () => {
    render(<Card>conteúdo</Card>)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('com onClick é botão acessível', () => {
    const onClick = vi.fn()
    render(<Card onClick={onClick}>conteúdo</Card>)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(btn, { key: 'Enter' })
    fireEvent.keyDown(btn, { key: ' ' })
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(3)
  })
})
