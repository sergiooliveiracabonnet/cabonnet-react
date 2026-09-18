import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { CidadesPanel, type CapacidadeCidadeView } from './CidadesPanel'
import type { OSRow } from '../../lib/types'

afterEach(cleanup)

function capacidade(o: Partial<CapacidadeCidadeView> = {}): CapacidadeCidadeView {
  return {
    cidade: 'Taubaté', fila: 142, frentes: 6,
    entradasDia: 5.2, saidasDia: 4.1, saldoDia: 1.1, prodFrenteDia: 0.7,
    frentesEstabilizar: 2, frentesZerar: 4, diasParaZerar: null, status: 'nao_zera',
    ...o,
  }
}

function row(cidade: string, o: Partial<OSRow> = {}): OSRow {
  return {
    nomedacidade: cidade, _slaExcedido: false, _slaSemAgend: false, _slaCritico: false,
    ...o,
  } as unknown as OSRow
}

describe('CidadesPanel', () => {
  it('junta fila/SLA e capacidade da mesma cidade numa linha só', () => {
    const filaAtiva = [row('Taubaté'), row('Taubaté', { _slaCritico: true }), row('Taubaté', { _slaExcedido: true })]
    render(<CidadesPanel horizonte={7} capacidadeCidades={[capacidade()]} filaAtiva={filaAtiva} onOpen={vi.fn()} />)

    expect(screen.getByText('Taubaté')).toBeInTheDocument()
    expect(screen.getByText(/3 na fila · 6 frentes/)).toBeInTheDocument()
    expect(screen.getByText('67%')).toBeInTheDocument() // (3-1)/3
    expect(screen.getByText(/acumula \+1,1\/d/)).toBeInTheDocument()
    expect(screen.getByText(/\+4 frentes para zerar em 7d/)).toBeInTheDocument()
  })

  it('abre as OS da cidade ao clicar na linha', () => {
    const onOpen = vi.fn()
    const filaAtiva = [row('Taubaté')]
    render(<CidadesPanel horizonte={7} capacidadeCidades={[capacidade()]} filaAtiva={filaAtiva} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole('button', { name: /Taubaté.*Abrir OS/i }))
    expect(onOpen).toHaveBeenCalledWith('Fila — Taubaté', filaAtiva)
  })

  it('mostra cidade só com dado de capacidade, sem fila agora', () => {
    render(<CidadesPanel horizonte={7} capacidadeCidades={[capacidade({ cidade: 'Tremembé', fila: 0 })]} filaAtiva={[]} onOpen={vi.fn()} />)
    expect(screen.getByText('Tremembé')).toBeInTheDocument()
    expect(screen.getByText(/0 na fila · 6 frentes/)).toBeInTheDocument()
  })

  it('mostra cidade só com fila agora, sem dado de capacidade dimensionável', () => {
    render(<CidadesPanel horizonte={7} capacidadeCidades={[]} filaAtiva={[row('Pindamonhangaba')]} onOpen={vi.fn()} />)
    expect(screen.getByText('Pindamonhangaba')).toBeInTheDocument()
    expect(screen.getByText(/^1 na fila$/)).toBeInTheDocument()
    expect(screen.queryByText(/não dá para dimensionar frente/)).not.toBeInTheDocument()
  })

  it('avisa quando não há execução recente para dimensionar frente', () => {
    const filaAtiva = [row('Taubaté')]
    render(<CidadesPanel horizonte={7} capacidadeCidades={[capacidade({
      frentes: 0, prodFrenteDia: 0, frentesZerar: null, frentesEstabilizar: 0,
    })]} filaAtiva={filaAtiva} onOpen={vi.fn()} />)
    expect(screen.getByText(/não dá para dimensionar frente/)).toBeInTheDocument()
  })

  it('mostra estado vazio sem quebrar', () => {
    render(<CidadesPanel horizonte={7} capacidadeCidades={[]} filaAtiva={[]} onOpen={vi.fn()} />)
    expect(screen.getByText(/Sem fila nem execuções/)).toBeInTheDocument()
  })
})
