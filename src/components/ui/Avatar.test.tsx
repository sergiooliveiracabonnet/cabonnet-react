import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Avatar } from './Avatar'

describe('Avatar', () => {
  it('mostra as iniciais quando nao ha imagem', () => {
    const { getByText } = render(<Avatar name="Sérgio Oliveira" />)
    expect(getByText('SO')).toBeInTheDocument()
  })

  it('usa quadrado arredondado, nao circulo', () => {
    const { container } = render(<Avatar name="Ana" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('rounded-[9px]')
    expect(el.className).not.toContain('rounded-full')
  })

  it('renderiza a imagem com alt quando ha src', () => {
    const { getByAltText } = render(<Avatar name="Ana" src="/a.png" />)
    expect(getByAltText('Ana')).toBeInTheDocument()
  })
})
