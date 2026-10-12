import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPill, StatusValue } from './StatusPill'
import { nivelPorPiso, nivelPorTeto } from '../../lib/statusNivel'

describe('nivelPorPiso', () => {
  it('classifica nos pisos inclusivos', () => {
    expect(nivelPorPiso(90, 90, 75)).toBe('ok')
    expect(nivelPorPiso(89, 90, 75)).toBe('atencao')
    expect(nivelPorPiso(75, 90, 75)).toBe('atencao')
    expect(nivelPorPiso(74, 90, 75)).toBe('critico')
  })
})

describe('StatusPill', () => {
  it('nao depende so da cor: cada nivel tem um icone proprio', () => {
    const svgs = (['ok', 'atencao', 'critico'] as const).map(nivel => {
      const { container } = render(<StatusPill nivel={nivel}>50%</StatusPill>)
      return container.querySelector('svg')?.innerHTML
    })
    expect(svgs.every(Boolean)).toBe(true)
    expect(new Set(svgs).size).toBe(3)
  })

  it('anuncia o nivel para leitor de tela', () => {
    render(<StatusPill nivel="critico">62%</StatusPill>)
    expect(screen.getByText(/crítico/)).toHaveClass('sr-only')
    expect(screen.getByText('62%', { exact: false })).toBeInTheDocument()
  })
})

describe('nivelPorTeto', () => {
  it('classifica metricas em que menos e melhor', () => {
    expect(nivelPorTeto(3, 3, 5)).toBe('ok')
    expect(nivelPorTeto(4, 3, 5)).toBe('atencao')
    expect(nivelPorTeto(5, 3, 5)).toBe('atencao')
    expect(nivelPorTeto(6, 3, 5)).toBe('critico')
  })
})

describe('StatusValue', () => {
  it('so desenha a forma na excecao: ok fica sem icone', () => {
    const ok = render(<StatusValue nivel="ok">2d</StatusValue>)
    expect(ok.container.querySelector('svg')).toBeNull()
    const ruim = render(<StatusValue nivel="critico">9d</StatusValue>)
    expect(ruim.container.querySelector('svg')).not.toBeNull()
  })

  it('usa okClass no nivel ok', () => {
    const { container } = render(<StatusValue nivel="ok" okClass="text-text">2d</StatusValue>)
    expect(container.firstElementChild).toHaveClass('text-text')
  })
})
