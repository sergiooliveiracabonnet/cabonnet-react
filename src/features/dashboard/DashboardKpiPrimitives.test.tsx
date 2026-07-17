import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionLabel } from './DashboardKpiPrimitives'
import { AlertCircle } from 'lucide-react'

describe('SectionLabel', () => {
  it('renderiza um heading h2 com o texto da seção', () => {
    render(<SectionLabel icon={AlertCircle} color="#f87171">Alertas &amp; Risco</SectionLabel>)
    expect(screen.getByRole('heading', { level: 2, name: 'Alertas & Risco' })).toBeInTheDocument()
  })
})
