import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from './EmptyState'
import { Inbox } from 'lucide-react'

describe('EmptyState', () => {
  it('renderiza título e descrição', () => {
    render(<EmptyState icon={Inbox} title="Sem ordens" description="Ajuste os filtros." />)
    expect(screen.getByText('Sem ordens')).toBeInTheDocument()
    expect(screen.getByText('Ajuste os filtros.')).toBeInTheDocument()
  })
  it('renderiza ação e dispara onClick', () => {
    const onClick = vi.fn()
    render(<EmptyState title="Vazio" action={{ label: 'Limpar filtros', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(onClick).toHaveBeenCalled()
  })
})
