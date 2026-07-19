import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Activity } from 'lucide-react'
import { SectionLabel } from './SectionLabel'

describe('SectionLabel', () => {
  it('renderiza o texto como heading', () => {
    render(<SectionLabel icon={Activity} color="#a78bfa">Acompanhamento Diário</SectionLabel>)
    expect(screen.getByRole('heading', { name: 'Acompanhamento Diário' })).toBeInTheDocument()
  })

  it('não aplica cor no texto do heading — só na barra/ícone', () => {
    render(<SectionLabel icon={Activity} color="#a78bfa">Teste</SectionLabel>)
    const heading = screen.getByRole('heading', { name: 'Teste' })
    expect(heading.style.color).toBe('')
  })

  it('renderiza a barra lateral com a cor recebida', () => {
    const { container } = render(<SectionLabel icon={Activity} color="#a78bfa">Teste</SectionLabel>)
    const bar = container.querySelector('div[style]') as HTMLElement
    expect(bar).not.toBeNull()
    expect(bar.style.background).not.toBe('')
  })

  it('renderiza o ícone fornecido', () => {
    const { container } = render(<SectionLabel icon={Activity} color="#a78bfa">Teste</SectionLabel>)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
