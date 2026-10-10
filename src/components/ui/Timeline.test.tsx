import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Timeline } from './Timeline'

const items = [
  { id: 1, autor: 'F08', descricao: 'abriu a OS 1234567', quando: 'há 2h' },
  { id: 2, autor: 'Dispatch', descricao: 'reagendou para amanhã', quando: 'agora', inicial: 'DP', emAndamento: true },
]

describe('Timeline', () => {
  it('renderiza um item por evento com autor, descrição e horário', () => {
    render(<Timeline items={items} title="Histórico" />)
    expect(screen.getByRole('heading', { name: 'Histórico' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText(/abriu a OS 1234567/)).toBeInTheDocument()
    expect(screen.getByText(/há 2h/)).toBeInTheDocument()
  })

  it('usa a inicial informada ou a primeira letra do autor', () => {
    render(<Timeline items={items} />)
    expect(screen.getByText('F')).toBeInTheDocument()
    expect(screen.getByText('DP')).toBeInTheDocument()
  })
})
