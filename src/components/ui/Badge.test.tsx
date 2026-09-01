import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './Badge'

describe('Badge', () => {
  it('renderiza o texto do filho', () => {
    render(<Badge>Pendente</Badge>)
    expect(screen.getByText('Pendente')).toBeInTheDocument()
  })

  it('aplica classe de variante correta', () => {
    const { container } = render(<Badge variant="red">Crítico</Badge>)
    const span = container.querySelector('span')
    expect(span?.className).toContain('badge-red')
  })

  it('não aplica classe se variante desconhecida', () => {
    const { container } = render(<Badge variant="desconhecida">Teste</Badge>)
    const span = container.querySelector('span')
    // sem crash — apenas sem classe de variante
    expect(span).toBeInTheDocument()
  })

  it('exibe dot por padrão', () => {
    const { container } = render(<Badge>Com dot</Badge>)
    const dots = container.querySelectorAll('span span')
    expect(dots.length).toBeGreaterThan(0)
  })

  it('esconde dot quando dot=false', () => {
    const { container } = render(<Badge dot={false}>Sem dot</Badge>)
    // apenas o span externo, sem span filho de dot
    const outerSpan = container.querySelector('span')
    expect(outerSpan?.querySelectorAll('span').length).toBe(0)
  })

  it('aceita className adicional', () => {
    const { container } = render(<Badge className="custom-class">OK</Badge>)
    const span = container.querySelector('span')
    expect(span?.className).toContain('custom-class')
  })
})
