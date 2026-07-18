import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QualidadePeriodoCard } from './DashboardPaineis'
import type { Pulso } from '../../lib/types'

afterEach(cleanup)

function makePulso(overrides: Partial<Pulso> = {}): Pulso {
  return {
    score: 0, scoreLabel: '', scoreBreakdown: [], narrativa: '', quickInsights: [],
    agingMed: 3.4, agingDist: {} as never, slaFila: 87, slaAtingimento: 91,
    semAgendamento: 4, mttr: 2.1, mttrP90: 4.5, backlogDias: null,
    topCidadesCriticas: [], clustersAtivos: [], criticasTotal: 0,
    entradasHoje: 0, saidasHoje: 0, fluxoHoje: 0, entradaMediaDia: 0,
    metaMes: { concluidas: 0, meta: 0, pct: null, diasUteisRestantes: 0, diasUteisTotal: 0, projecaoFinal: null, status: 'neutro' },
    ritmoIntradiario: {} as never,
    ...overrides,
  }
}

describe('QualidadePeriodoCard', () => {
  it('renderiza os 6 indicadores de qualidade do período', () => {
    render(<QualidadePeriodoCard pulso={makePulso()} taxaRevisitas={5.2} />)
    expect(screen.getByText('Qualidade do Período')).toBeInTheDocument()
    expect(screen.getByText('87%')).toBeInTheDocument()
    expect(screen.getByText('91%')).toBeInTheDocument()
    expect(screen.getByText('2,1d')).toBeInTheDocument()
    expect(screen.getByText('3,4d')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('5,2%')).toBeInTheDocument()
  })

  it('mostra travessão quando taxaRevisitas não está disponível', () => {
    render(<QualidadePeriodoCard pulso={makePulso()} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
