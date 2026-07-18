import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PulsoHero } from './PulsoHero'
import type { Pulso } from '../../lib/types'

afterEach(cleanup)

function makePulso(overrides: Partial<Pulso> = {}): Pulso {
  return {
    score: 82, scoreLabel: 'saudável',
    scoreBreakdown: [
      { id: 'sla', label: 'SLA', value: 88, weight: 45 },
      { id: 'taxa', label: 'Taxa', value: 76, weight: 35 },
      { id: 'mttr', label: 'MTTR', value: 90, weight: 20 },
    ],
    narrativa: 'A fila recua pelo terceiro dia seguido.',
    quickInsights: [],
    agingMed: 3.4, agingDist: {} as never, slaFila: 87, slaAtingimento: 91,
    semAgendamento: 4, mttr: 2.1, mttrP90: 4.5, backlogDias: null,
    topCidadesCriticas: [], clustersAtivos: [], criticasTotal: 7,
    entradasHoje: 46, saidasHoje: 51, fluxoHoje: -5, entradaMediaDia: 44,
    metaMes: { concluidas: 900, meta: 1240, pct: 72, diasUteisRestantes: 5, diasUteisTotal: 22, projecaoFinal: 1310, status: 'acima' },
    ritmoIntradiario: {} as never,
    ...overrides,
  }
}

const evolucao = {
  labels: Array.from({ length: 14 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`),
  abertas: Array.from({ length: 14 }, (_, i) => 40 + i),
  concluidas: Array.from({ length: 14 }, (_, i) => 38 + i),
}

describe('PulsoHero', () => {
  it('renderiza score, tendência e narrativa', () => {
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false}
                       tendencia={{ atual: 82, anterior: 78, delta: 4 }} evolucao={evolucao} />)
    expect(screen.getByText('82')).toBeInTheDocument()
    expect(screen.getByText(/vs anterior/)).toBeInTheDocument()
    expect(screen.getByText('A fila recua pelo terceiro dia seguido.')).toBeInTheDocument()
  })

  it('renderiza os 4 tiles de fluxo do dia, com sparkline em 3 deles', () => {
    const { container } = render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} evolucao={evolucao} />)
    expect(screen.getByText('Entradas hoje')).toBeInTheDocument()
    expect(screen.getByText('46')).toBeInTheDocument()
    expect(screen.getByText('Concluídas hoje')).toBeInTheDocument()
    expect(screen.getByText('51')).toBeInTheDocument()
    expect(screen.getByText('Saldo do dia')).toBeInTheDocument()
    expect(screen.getByText('fila encolhendo')).toBeInTheDocument()
    expect(screen.getByText('Projeção do mês')).toBeInTheDocument()
    expect(screen.getByText('1.310')).toBeInTheDocument()
    // Entradas, Concluídas e Saldo têm sparkline — Projeção do mês não tem série diária.
    // Exclui o ícone Activity (lucide-react também usa aria-hidden="true" + <path>).
    expect(container.querySelectorAll('svg[aria-hidden="true"]:not([class*="lucide"]) path')).toHaveLength(3)
  })

  it('breakdown do score fica em popover, mini-stats antigos não vivem mais aqui', () => {
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} evolucao={evolucao} />)
    expect(screen.getByText('Peso: SLA 45% · Taxa 35% · MTTR 20%')).toBeInTheDocument()
    expect(screen.queryByText('Sem Agend.')).not.toBeInTheDocument()
    expect(screen.queryByText('Revisitas')).not.toBeInTheDocument()
  })

  it('mostra CTA para analisar com IA quando não há aiData', () => {
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} onRequestAI={() => {}} evolucao={evolucao} />)
    expect(screen.getByRole('button', { name: /Analisar com IA/ })).toBeInTheDocument()
  })
})
