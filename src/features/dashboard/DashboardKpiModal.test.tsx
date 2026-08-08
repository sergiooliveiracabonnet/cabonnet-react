import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { OSRow } from '../../lib/types'
import { KpiModalTable } from './DashboardKpiModal'

const rows = [
  {
    numos: '1234567', nomecliente: 'Cliente Alfa', nomedacidade: 'Taubaté',
    descsituacao: 'Pendente', _situacaoEfetiva: 'Pendente', nomedaequipe: 'F01', _aging: 4,
  },
  {
    numos: '7654321', nomecliente: 'Cliente Beta', nomedacidade: 'Caçapava',
    descsituacao: 'Em atendimento', _situacaoEfetiva: 'Em atendimento', nomedaequipe: 'F08', _aging: 1,
  },
] as OSRow[]

function renderTable() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <KpiModalTable rows={rows} onOS={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('KpiModalTable', () => {
  it('busca por OS ou cliente e atualiza a contagem visível', () => {
    renderTable()

    fireEvent.change(screen.getByRole('searchbox', { name: /buscar nas ordens/i }), {
      target: { value: '7654321' },
    })

    expect(screen.queryByText('Cliente Alfa')).not.toBeInTheDocument()
    expect(screen.getByText('Cliente Beta')).toBeInTheDocument()
    expect(screen.getByText('1 de 2 OS')).toBeInTheDocument()
  })

  it('filtra por cidade e permite limpar os filtros', () => {
    renderTable()

    fireEvent.change(screen.getByLabelText('Filtrar por cidade'), { target: { value: 'Taubaté' } })
    expect(screen.getByText('Cliente Alfa')).toBeInTheDocument()
    expect(screen.queryByText('Cliente Beta')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /limpar filtros/i }))
    expect(screen.getByText('Cliente Beta')).toBeInTheDocument()
  })
})
