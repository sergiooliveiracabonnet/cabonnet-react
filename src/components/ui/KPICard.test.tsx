import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KPICard } from './KPICard'
import { TrendingUp } from 'lucide-react'

describe('KPICard', () => {
  it('renderiza título e valor', () => {
    render(<KPICard title="Total OS" value={42} />)
    expect(screen.getByText('Total OS')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renderiza sub quando fornecido', () => {
    render(<KPICard title="KPI" value={10} sub="este mês" />)
    expect(screen.getByText('este mês')).toBeInTheDocument()
  })

  it('não renderiza sub quando ausente', () => {
    const { container } = render(<KPICard title="KPI" value={10} />)
    expect(container.textContent).not.toContain('undefined')
  })

  it('chama onClick ao clicar', () => {
    const onClick = vi.fn()
    const { container } = render(<KPICard title="KPI clicável" value={5} onClick={onClick} />)
    fireEvent.click(container.firstChild!)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('aplica cursor-pointer quando onClick fornecido', () => {
    const { container } = render(<KPICard title="KPI" value={1} onClick={() => {}} />)
    expect(container.firstChild).toHaveClass('cursor-pointer')
  })

  it('não aplica cursor-pointer sem onClick', () => {
    const { container } = render(<KPICard title="KPI" value={1} />)
    expect(container.firstChild).not.toHaveClass('cursor-pointer')
  })

  it('renderiza ícone quando fornecido', () => {
    const { container } = render(<KPICard title="KPI" value={1} icon={TrendingUp} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renderiza valor string', () => {
    render(<KPICard title="Aging" value="5d" />)
    expect(screen.getByText('5d')).toBeInTheDocument()
  })

  it('renderiza trend positivo com sinal + e seta ↑', () => {
    render(<KPICard title="KPI" value={10} trend={{ delta: 3, pct: 30, higherIsBetter: true }} />)
    expect(screen.getByText(/\+30%/)).toBeInTheDocument()
  })

  it('renderiza trend negativo com seta ↓', () => {
    render(<KPICard title="KPI" value={10} trend={{ delta: -2, pct: -20, higherIsBetter: true }} />)
    expect(screen.getByText(/-20%/)).toBeInTheDocument()
  })

  it('aceita accent desconhecido sem crash (fallback para primary)', () => {
    expect(() => render(<KPICard title="KPI" value={1} accent="inexistente" />)).not.toThrow()
  })

  it('aceita className adicional', () => {
    const { container } = render(<KPICard title="KPI" value={1} className="minha-classe" />)
    expect(container.firstChild).toHaveClass('minha-classe')
  })
})
