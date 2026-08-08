import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import NivelSinalPage from './NivelSinalPage'

describe('NivelSinalPage', () => {
  it('incorpora o console óptico sanitizado em um frame identificado e isolado', () => {
    render(<NivelSinalPage />)

    const frame = screen.getByTitle('Console óptico — nível de sinal das ONUs')
    expect(frame).toHaveAttribute('src', '/nivel-de-sinal.html')
    expect(frame).not.toHaveAttribute('srcdoc')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-forms allow-downloads')
  })
})
