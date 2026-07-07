import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { FluxoOSPanel, type FluxoEvolucao } from './FluxoOSPanel'

// jsdom não implementa ResizeObserver — entrega largura fixa de 800px
class ResizeObserverMock {
  private cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) { this.cb = cb }
  observe() {
    this.cb(
      [{ contentRect: { width: 800 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

afterEach(cleanup)

function makeEvolucao(dias: number): FluxoEvolucao {
  const labels: string[] = []
  const abertas: number[] = []
  const concluidas: number[] = []
  for (let i = 0; i < dias; i++) {
    labels.push(`2026-06-${String(i + 1).padStart(2, '0')}`)
    abertas.push(30 + (i % 7))
    concluidas.push(28 + ((i + 3) % 8))
  }
  return { labels, abertas, concluidas }
}

describe('FluxoOSPanel', () => {
  it('mostra estado vazio com menos de 2 dias de dados', () => {
    render(<FluxoOSPanel evolucao={makeEvolucao(1)} />)
    expect(screen.getByText('Sem dados suficientes para o fluxo diário')).toBeInTheDocument()
  })

  it('renderiza o gráfico com legenda e janela de 14 dias', () => {
    render(<FluxoOSPanel evolucao={makeEvolucao(30)} />)
    expect(screen.getByText('Fluxo de OS — 14 dias')).toBeInTheDocument()
    // "Entradas"/"Concluídas" aparecem na legenda e no cabeçalho da tabela
    expect(screen.getAllByText('Entradas')).toHaveLength(2)
    expect(screen.getAllByText('Concluídas')).toHaveLength(2)
    expect(screen.getByRole('img', { name: /entradas e conclusões diárias/i })).toBeInTheDocument()
  })

  it('usa toda a série quando há menos de 14 dias', () => {
    render(<FluxoOSPanel evolucao={makeEvolucao(5)} />)
    expect(screen.getByText('Fluxo de OS — 5 dias')).toBeInTheDocument()
  })

  it('exibe tooltip com saldo ao passar o mouse', () => {
    render(<FluxoOSPanel evolucao={makeEvolucao(14)} />)
    const svg = screen.getByRole('img', { name: /entradas e conclusões diárias/i })
    fireEvent.pointerMove(svg, { clientX: 400, clientY: 100 })
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Saldo da fila')).toBeInTheDocument()
    fireEvent.pointerLeave(svg)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('expõe os dados em tabela acessível', () => {
    render(<FluxoOSPanel evolucao={makeEvolucao(14)} />)
    fireEvent.click(screen.getByText('ver dados em tabela'))
    const tabela = screen.getByRole('table')
    expect(tabela).toBeInTheDocument()
    // 14 linhas de dados + cabeçalho
    expect(tabela.querySelectorAll('tbody tr')).toHaveLength(14)
  })
})
