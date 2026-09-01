import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { CapacidadePanel, type CapacidadeCidadeView } from './CapacidadePanel'

afterEach(cleanup)

function cidade(o: Partial<CapacidadeCidadeView> = {}): CapacidadeCidadeView {
  return {
    cidade: 'Taubaté', fila: 142, frentes: 6,
    entradasDia: 5.2, saidasDia: 4.1, saldoDia: 1.1, prodFrenteDia: 0.7,
    frentesEstabilizar: 2, frentesZerar: 4, diasParaZerar: null, status: 'nao_zera',
    ...o,
  }
}

describe('CapacidadePanel', () => {
  it('mostra fila, frentes e as taxas de entrada e saída', () => {
    render(<CapacidadePanel horizonte={7} cidades={[cidade()]} />)
    expect(screen.getByText('Taubaté')).toBeInTheDocument()
    expect(screen.getByText(/142 na fila/)).toBeInTheDocument()
    expect(screen.getByText(/6 frentes/)).toBeInTheDocument()
    expect(screen.getByText(/5,2/)).toBeInTheDocument()
    expect(screen.getByText(/4,1/)).toBeInTheDocument()
  })

  it('anuncia acúmulo quando entra mais do que sai', () => {
    render(<CapacidadePanel horizonte={7} cidades={[cidade()]} />)
    expect(screen.getByText(/acumula \+1,1\/d/)).toBeInTheDocument()
    expect(screen.getByText(/1 acumulando/)).toBeInTheDocument()
  })

  it('pede frentes e separa o que é para zerar do que é só para estabilizar', () => {
    render(<CapacidadePanel horizonte={7} cidades={[cidade()]} />)
    expect(screen.getByText(/\+4 frentes para zerar em 7d/)).toBeInTheDocument()
    expect(screen.getByText(/2 só para parar de crescer/)).toBeInTheDocument()
  })

  it('usa singular quando é uma frente só', () => {
    render(<CapacidadePanel horizonte={7} cidades={[cidade({ frentes: 1, frentesZerar: 1, frentesEstabilizar: 0 })]} />)
    expect(screen.getByText(/1 frente$/)).toBeInTheDocument()
    expect(screen.getByText(/\+1 frente para zerar/)).toBeInTheDocument()
  })

  it('mostra dias para zerar quando a cidade está drenando a fila', () => {
    render(<CapacidadePanel horizonte={7} cidades={[cidade({
      saldoDia: -1.9, diasParaZerar: 3.4, status: 'ok', frentesZerar: 0, frentesEstabilizar: 0,
    })]} />)
    expect(screen.getByText(/zera em 3,4d/)).toBeInTheDocument()
    expect(screen.getByText(/nenhuma acumulando/)).toBeInTheDocument()
    expect(screen.queryByText(/para zerar em/)).not.toBeInTheDocument()
  })

  // Sem produtividade medida não dá para dimensionar frente — o painel precisa
  // dizer isso em vez de sugerir um número inventado.
  it('avisa quando não há execução recente para dimensionar frente', () => {
    render(<CapacidadePanel horizonte={7} cidades={[cidade({
      frentes: 0, prodFrenteDia: 0, frentesZerar: null, frentesEstabilizar: 0,
    })]} />)
    expect(screen.getByText(/não dá para dimensionar frente/)).toBeInTheDocument()
    expect(screen.queryByText(/frentes para zerar/)).not.toBeInTheDocument()
  })

  it('mostra estado vazio sem quebrar', () => {
    render(<CapacidadePanel horizonte={7} cidades={[]} />)
    expect(screen.getByText(/Sem fila nem execuções/)).toBeInTheDocument()
  })
})
