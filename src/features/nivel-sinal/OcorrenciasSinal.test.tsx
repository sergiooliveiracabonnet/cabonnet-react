import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OcorrenciasSinal } from './OcorrenciasSinal'
import { syncSignalOccurrences } from './signalOccurrenceModel'
import type { SignalRow } from './nivelSinal'

const signal = (overrides: Partial<SignalRow>): SignalRow => ({
  cidade: 'Taubaté', bairro: 'Centro', olt: 'OLT TBT', tipo: 'Huawei', slot: '1', pon: '1/2', onu: '7',
  cliente: 'Cliente Crítico', codigo: '1001', situacao: 'Conectado', pppoe: 'critico', serial: 'SERIAL-1',
  modelo: 'HG8145', status: 'Online', classificacao: 'Crítico', rx: -30, tx: null, oltRx: null, distancia: null,
  temperatura: null, causa: '—', cidadeCliente: 'TAUBATE', alertaRx: true,
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

describe('OcorrenciasSinal — confirmação rápida do sinal após manutenção', () => {
  it('preenche o sinal, clica em OK e conclui a ocorrência sem exigir status ou observação', () => {
    const onChange = vi.fn()
    render(<OcorrenciasSinal occurrences={occurrences} onChange={onChange} />)

    const input = screen.getByLabelText('Sinal após manutenção de Cliente Crítico')
    const confirmButton = screen.getByRole('button', { name: 'Confirmar sinal de Cliente Crítico' })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(input, { target: { value: '-19.5' } })
    expect(confirmButton).toBeEnabled()
    fireEvent.click(confirmButton)

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated = onChange.mock.calls[0][0]
    const confirmed = updated.find((item: { client: string }) => item.client === 'Cliente Crítico')
    expect(confirmed.after).toBe(-19.5)
    expect(confirmed.status).toBe('Concluído')
  })

  it('não mostra a confirmação rápida para ocorrências já concluídas', () => {
    const concluded = occurrences.map(item => item.client === 'Cliente Crítico' ? { ...item, status: 'Concluído' as const } : item)
    render(<OcorrenciasSinal occurrences={concluded} onChange={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Filtrar por status'), { target: { value: 'Todos' } })
    expect(screen.queryByLabelText('Sinal após manutenção de Cliente Crítico')).not.toBeInTheDocument()
  })
})

describe('OcorrenciasSinal — evolução do sinal médio', () => {
  it('exibe o gráfico de evolução com as barras de antes e depois quando há confirmações no dia', () => {
    // Data de Brasilia, nao UTC: depois das 21h as duas divergem e o teste
    // procurava a barra num dia que o componente nao desenha.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
    const withConfirmation = occurrences.map(item => item.client === 'Cliente Crítico'
      ? { ...item, after: -18, status: 'Concluído' as const, updatedAt: today }
      : item)
    render(<OcorrenciasSinal occurrences={withConfirmation} onChange={vi.fn()} />)

    expect(screen.getByText('Evolução do sinal médio')).toBeInTheDocument()
    expect(screen.getByTitle(`Antes: ${(-30).toFixed(1)} dBm`)).toBeInTheDocument()
    expect(screen.getByTitle('Depois: -18.0 dBm')).toBeInTheDocument()
    expect(screen.getByText('1 confirmação(ões) no período')).toBeInTheDocument()
  })

  it('mostra travessão quando nenhum dia tem confirmação registrada', () => {
    render(<OcorrenciasSinal occurrences={occurrences} onChange={vi.fn()} />)
    expect(screen.getByText('0 confirmação(ões) no período')).toBeInTheDocument()
  })
})
