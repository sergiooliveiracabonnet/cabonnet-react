import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ChurnPanel, type ClienteReincidenteView } from './ChurnPanel'
import type { OSRow } from '../../lib/types'

afterEach(cleanup)

const OS = [{ numos: '9069512' }, { numos: '9069513' }] as unknown as OSRow[]

function cliente(o: Partial<ClienteReincidenteView> = {}): ClienteReincidenteView {
  return {
    chave: '1001', cliente: 'Maria S. Oliveira', cidade: 'Taubaté', bairro: 'Jardim Ana Emília',
    visitas: 4, intervaloMedio: 9.5, diasDesdeUltima: 3, rows: OS,
    ...o,
  }
}

const base = { janelaDias: 60, totalReincidentes: 7, totalBase: 58, pctReincidencia: 12 }

describe('ChurnPanel', () => {
  it('mostra o cliente, onde ele está e quantas vezes chamou', () => {
    render(<ChurnPanel {...base} clientes={[cliente()]} onOpen={vi.fn()} />)
    expect(screen.getByText('Maria S. Oliveira')).toBeInTheDocument()
    expect(screen.getByText(/Taubaté · Jardim Ana Emília/)).toBeInTheDocument()
    expect(screen.getByText('4×')).toBeInTheDocument()
    expect(screen.getByText(/~9,5d/)).toBeInTheDocument()
  })

  it('contextualiza a reincidência contra a base atendida', () => {
    render(<ChurnPanel {...base} clientes={[cliente()]} onOpen={vi.fn()} />)
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('58')).toBeInTheDocument()
    expect(screen.getByText(/12% da base/)).toBeInTheDocument()
  })

  it('abre as OS do cliente ao clicar na linha', () => {
    const onOpen = vi.fn()
    render(<ChurnPanel {...base} clientes={[cliente()]} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /Maria S. Oliveira.*Abrir OS/i }))
    expect(onOpen).toHaveBeenCalledWith('Maria S. Oliveira — 4 manutenções em 60d', OS)
  })

  it('não quebra o layout quando o cliente não tem bairro', () => {
    render(<ChurnPanel {...base} clientes={[cliente({ bairro: '' })]} onOpen={vi.fn()} />)
    expect(screen.getByText(/Taubaté · última há 3d/)).toBeInTheDocument()
  })

  it('mostra estado saudável quando ninguém é reincidente', () => {
    render(<ChurnPanel janelaDias={60} clientes={[]} totalReincidentes={0} totalBase={40}
                       pctReincidencia={0} onOpen={vi.fn()} />)
    expect(screen.getByText(/Nenhum cliente com manutenção repetida nos últimos 60 dias/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renderiza uma linha clicável por cliente', () => {
    render(<ChurnPanel {...base} clientes={[
      cliente({ chave: '1', cliente: 'Cliente A' }),
      cliente({ chave: '2', cliente: 'Cliente B' }),
      cliente({ chave: '3', cliente: 'Cliente C' }),
    ]} onOpen={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })
})
