import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OcorrenciasSinal } from './OcorrenciasSinal'
import { syncSignalOccurrences } from './signalOccurrenceModel'
import type { SignalRow } from './nivelSinal'

const signal = (overrides: Partial<SignalRow>): SignalRow => ({
  cidade: 'Taubaté', bairro: 'Centro', olt: 'OLT TBT', tipo: 'Huawei', slot: '1', pon: '1/2', onu: '7',
  cliente: 'Cliente Crítico', codigo: '1001', situacao: 'Conectado', pppoe: 'critico', serial: 'SERIAL-1',
  modelo: 'HG8145', status: 'Online', classificacao: 'Crítico', rx: -30, tx: null, oltRx: null, distancia: null, causa: '—',
  ...overrides,
})

const occurrences = syncSignalOccurrences([], [
  signal({}),
  signal({ cidade: 'Caçapava', olt: 'OLT CCP', pon: '2/4', cliente: 'Cliente Atenção', serial: 'SERIAL-2', codigo: '1002', classificacao: 'Atenção', rx: -25.5 }),
], '2026-08-11')

describe('OcorrenciasSinal — filtros de priorização', () => {
  it('filtra a fila por cidade e severidade e permite limpar', () => {
    render(<OcorrenciasSinal occurrences={occurrences} onChange={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Filtrar por cidade'), { target: { value: 'Caçapava' } })
    expect(screen.getByText('Cliente Atenção')).toBeInTheDocument()
    expect(screen.queryByText('Cliente Crítico')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Filtrar por severidade'), { target: { value: 'Crítico' } })
    expect(screen.getByText('Nenhuma ocorrência corresponde aos filtros.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.getByText('Cliente Crítico')).toBeInTheDocument()
    expect(screen.getByText('Cliente Atenção')).toBeInTheDocument()
  })

  it('busca por cliente e informa quantos resultados estão visíveis', () => {
    render(<OcorrenciasSinal occurrences={occurrences} onChange={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar ocorrências' }), { target: { value: 'atenção' } })
    expect(screen.getByText('1 de 2 ocorrências')).toBeInTheDocument()
    expect(screen.queryByText('Cliente Crítico')).not.toBeInTheDocument()
  })
})
