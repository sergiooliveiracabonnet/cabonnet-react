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
  it('h1 sem ícone não tem classes flex', () => {
    const { container } = render(<PageHeader title="Ordens de Serviço" />)
    const h1 = container.querySelector('h1')
    expect(h1).toHaveClass('text-title', 'font-semibold', 'text-text')
    expect(h1).not.toHaveClass('flex', 'items-center', 'gap-2')
  })
  it('renderiza titleExtra ao lado do título e aplica flex no h1', () => {
    const { container } = render(
      <PageHeader title="Notificações & Alertas" titleExtra={<span data-testid="badge">3 ativos</span>} />
    )
    expect(screen.getByTestId('badge')).toBeInTheDocument()
    const h1 = container.querySelector('h1')
    expect(h1).toHaveClass('flex', 'items-center', 'gap-2')
  })
  it('renderiza descriptionExtra ao lado da descrição quando description está presente', () => {
    render(
      <PageHeader
        title="Alertas"
        description="Motor de regras em tempo real"
        descriptionExtra={<span data-testid="live">Ao vivo</span>}
      />
    )
    expect(screen.getByTestId('live')).toBeInTheDocument()
    expect(screen.getByText('Motor de regras em tempo real')).toBeInTheDocument()
  })
  it('não renderiza descriptionExtra se description não for fornecida', () => {
    render(<PageHeader title="X" descriptionExtra={<span data-testid="live">Ao vivo</span>} />)
    expect(screen.queryByTestId('live')).not.toBeInTheDocument()
  })
})
