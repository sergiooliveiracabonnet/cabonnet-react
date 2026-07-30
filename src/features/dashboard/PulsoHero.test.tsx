import { describe, it, expect, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup, within } from '@testing-library/react'
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
    metaMes: { concluidas: 900, meta: 1240, pct: 72, diasUteisRestantes: 5, diasUteisTotal: 22, projecaoFinal: 1310, status: 'acima', frentes: 12, prodFrenteDia: 4.7 },
    ritmoIntradiario: {} as never,
    ...overrides,
  }
}

describe('PulsoHero', () => {
  it('renderiza score, tendência e narrativa', () => {
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false}
                       tendencia={{ atual: 82, anterior: 78, delta: 4 }} />)
    expect(screen.getByText('82')).toBeInTheDocument()
    const anterior = screen.getByTestId('score-periodo-anterior')
    expect(within(anterior).getByText('Anterior')).toBeInTheDocument()
    expect(within(anterior).getByText('78')).toBeInTheDocument()
    expect(within(anterior).getByText('↑ +4')).toBeInTheDocument()
    expect(within(anterior).queryByText(/vs anterior/)).not.toBeInTheDocument()
    expect(screen.getByText('A fila recua pelo terceiro dia seguido.')).toBeInTheDocument()
  })

  it('renderiza as 4 métricas de fluxo sem duplicar sparklines do painel detalhado', () => {
    const { container } = render(<PulsoHero pulso={makePulso({ backlogDias: 3.2 })} aiData={null} isLoadingAI={false} />)
    expect(screen.getByText('Entradas hoje')).toBeInTheDocument()
    expect(screen.getByText('46')).toBeInTheDocument()
    expect(screen.getByText('Concluídas hoje')).toBeInTheDocument()
    expect(screen.getByText('51')).toBeInTheDocument()
    expect(screen.getByText('Saldo do dia')).toBeInTheDocument()
    expect(screen.getByText('fila encolhendo')).toBeInTheDocument()
    // Projeção do mês vive no MetaMesCard; aqui entra o backlog de capacidade
    expect(screen.getByText('Backlog da fila')).toBeInTheDocument()
    expect(screen.getByText('3,2d')).toBeInTheDocument()
    expect(screen.queryByText('Projeção do mês')).not.toBeInTheDocument()
    expect(container.querySelectorAll('svg[aria-hidden="true"]:not([class*="lucide"]) path')).toHaveLength(0)
  })

  it('breakdown do score fica em popover, mini-stats antigos não vivem mais aqui', () => {
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} />)
    expect(screen.getByText('Peso: SLA 45% · Taxa 35% · MTTR 20%')).toBeInTheDocument()
    expect(screen.queryByText('Sem Agend.')).not.toBeInTheDocument()
    expect(screen.queryByText('Revisitas')).not.toBeInTheDocument()
  })

  it('prioriza a narrativa nativa e mantém o formulário de IA recolhido', () => {
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} onRequestAI={() => {}} />)
    expect(screen.getByText('A fila recua pelo terceiro dia seguido.')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Contexto opcional para a IA/)).not.toBeInTheDocument()

    const trigger = screen.getByRole('button', { name: /Enriquecer com IA/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByPlaceholderText(/Contexto opcional para a IA/)).toBeInTheDocument()
  })

  it('score breakdown popover tem nome acessivel e aria-describedby', () => {
    const { container } = render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} />)

    // Localizar o trigger (div com role="button")
    const trigger = container.querySelector('[role="button"][aria-label="Detalhar composição do score"]')
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-describedby', 'score-breakdown-popover')

    // Localizar o popover panel
    const popover = container.querySelector('#score-breakdown-popover')
    expect(popover).toBeInTheDocument()
    expect(popover).toHaveAttribute('role', 'tooltip')
  })

  it('score breakdown não renderiza quando scoreBreakdown está vazio', () => {
    const { container } = render(<PulsoHero pulso={makePulso({ scoreBreakdown: [] })} aiData={null} isLoadingAI={false} />)

    // Trigger não deve ter aria-describedby quando não há breakdown
    const trigger = container.querySelector('[role="button"][aria-label="Detalhar composição do score"]')
    expect(trigger).toBeInTheDocument()
    expect(trigger).not.toHaveAttribute('aria-describedby')

    // Popover não deve ser renderizado
    const popover = container.querySelector('#score-breakdown-popover')
    expect(popover).not.toBeInTheDocument()
  })
})
