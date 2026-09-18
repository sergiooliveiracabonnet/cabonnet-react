import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AnomaliaSection } from './AnomaliaSection'
import type { AnomaliasData } from '../../lib/types'

afterEach(cleanup)

function renderSection(anomalias: AnomaliasData) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AnomaliaSection anomalias={anomalias} contexto={{ total: 0, sla_pct: 0, criticas: 0, aging_med: 0 }} />
    </QueryClientProvider>,
  )
}

const anomalias: AnomaliasData = {
  total: 2,
  picosDia: [{ date: '01/09', count: 12, zScore: 3.1 }],
  bairrosAnomalia: [],
  equipesAnomalia: [],
} as unknown as AnomaliasData

describe('AnomaliaSection', () => {
  it('nasce fechado mesmo com anomalias detectadas', () => {
    renderSection(anomalias)
    expect(screen.getByText('2 anomalias')).toBeInTheDocument()
    expect(screen.queryByText('Picos de Abertura')).not.toBeInTheDocument()
  })

  it('abre ao clicar no cabeçalho', () => {
    renderSection(anomalias)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Picos de Abertura')).toBeInTheDocument()
  })
})
