import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

describe('Button', () => {
  it('renderiza o label do filho', () => {
    render(<Button>Salvar</Button>)
    expect(screen.getByText('Salvar')).toBeInTheDocument()
  })

  it('dispara onClick ao ser clicado', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Clique</Button>)
    fireEvent.click(screen.getByText('Clique'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('não dispara onClick quando disabled', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick} disabled>Bloqueado</Button>)
    fireEvent.click(screen.getByText('Bloqueado'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('aplica variante primary por padrão', () => {
    const { container } = render(<Button>OK</Button>)
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('bg-primary')
  })

  it('aplica variante ghost corretamente', () => {
    const { container } = render(<Button variant="ghost">Ghost</Button>)
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('bg-transparent')
  })

  it('aplica variante danger corretamente', () => {
    const { container } = render(<Button variant="danger">Deletar</Button>)
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('text-red')
  })

  it('aplica tamanho sm corretamente', () => {
    const { container } = render(<Button size="sm">Pequeno</Button>)
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('text-[12px]')
  })

  it('botão é um elemento button no DOM', () => {
    const { container } = render(<Button>Focalizável</Button>)
    const btn = container.querySelector('button')
    expect(btn).toBeInTheDocument()
  })

  it('renderiza tag button HTML', () => {
    const { container } = render(<Button>Tipo</Button>)
    const btn = container.querySelector('button')
    expect(btn?.tagName).toBe('BUTTON')
  })
})
