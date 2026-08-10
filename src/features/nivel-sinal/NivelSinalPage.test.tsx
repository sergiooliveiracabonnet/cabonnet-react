import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import NivelSinalPage from './NivelSinalPage'

describe('NivelSinalPage', () => {
  it('usa a estrutura nativa do projeto sem documento incorporado', () => {
    render(<NivelSinalPage />)
    expect(screen.getByRole('heading', { name: 'Nível de Sinal' })).toBeInTheDocument()
    expect(screen.getByText('Carregue o relatório de sinais das ONUs')).toBeInTheDocument()
    expect(screen.queryByTitle(/console óptico/i)).not.toBeInTheDocument()
  })
})
