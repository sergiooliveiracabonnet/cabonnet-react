import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Award } from 'lucide-react'
import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('renderiza título como heading e descrição', () => {
    render(<PageHeader title="Ordens de Serviço" description="Fila ativa do período" />)
    expect(screen.getByRole('heading', { name: 'Ordens de Serviço' })).toBeInTheDocument()
    expect(screen.getByText('Fila ativa do período')).toBeInTheDocument()
  })
  it('renderiza slot de ações', () => {
    render(<PageHeader title="X" actions={<button>Exportar</button>} />)
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeInTheDocument()
  })
  it('renderiza o ícone antes do título quando fornecido', () => {
    const { container } = render(<PageHeader title="Ranking de Técnicos" icon={Award} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ranking de Técnicos' })).toBeInTheDocument()
  })
  it('não renderiza nenhum ícone quando icon não é fornecido', () => {
    const { container } = render(<PageHeader title="Ordens de Serviço" />)
    expect(container.querySelector('svg')).not.toBeInTheDocument()
  })
})
