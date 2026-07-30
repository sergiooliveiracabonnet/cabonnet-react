import { describe, it, expect, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup, within } from '@testing-library/react'
import { PulsoHero } from './PulsoHero'
import type { Pulso } from '../../lib/types'

afterEach(cleanup)

const MUDANCAS = [
  { id: 'sla',  label: 'SLA do período',    atual: 87, anterior: 82,  delta: 5,    unidade: '%', melhorou: true,  variacao: 6.1 },
  { id: 'mttr', label: 'MTTR',              atual: 2.1, anterior: 1.8, delta: 0.3,  unidade: 'd', melhorou: false, variacao: 16.7 },
]

function makePulso(overrides: Partial<Pulso> = {}): Pulso {
  return {
    narrativa: 'A fila recua pelo terceiro dia seguido.',
    quickInsights: [],
    agingMed: 3.4, agingDist: {} as never, slaFila: 87, taxa: 76, slaAtingimento: 91,
    semAgendamento: 4, mttr: 2.1, mttrP90: 4.5, backlogDias: null,
    topCidadesCriticas: [], clustersAtivos: [], criticasTotal: 7,
    entradasHoje: 46, saidasHoje: 51, fluxoHoje: -5, entradaMediaDia: 44,
    metaMes: { concluidas: 900, meta: 1240, pct: 72, diasUteisRestantes: 5, diasUteisTotal: 22, projecaoFinal: 1310, status: 'acima', frentes: 12, prodFrenteDia: 4.7 },
    ritmoIntradiario: {} as never,
    ...overrides,
  }
}

describe('PulsoHero', () => {
  it('renderiza os três sinais vitais com o Δ do período anterior, e a narrativa', () => {
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} mudancas={MUDANCAS} />)
    const vitais = screen.getByTestId('pulso-vitais')
    expect(within(vitais).getByText('SLA da Fila')).toBeInTheDocument()
    expect(within(vitais).getByText('87%')).toBeInTheDocument()
    expect(within(vitais).getByText('Taxa Conclusão')).toBeInTheDocument()
    expect(within(vitais).getByText('76%')).toBeInTheDocument()
    expect(within(vitais).getByText('MTTR')).toBeInTheDocument()
    expect(within(vitais).getByText('2,1d')).toBeInTheDocument()
    // Δ por componente, cada um na própria unidade
    expect(within(vitais).getByText('↑ +5%')).toBeInTheDocument()
    expect(within(vitais).getByText('↑ +0.3d')).toBeInTheDocument()
    expect(screen.getByText('A fila recua pelo terceiro dia seguido.')).toBeInTheDocument()
  })

  it('não expõe mais score sintético nem gauge', () => {
    const { container } = render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} mudancas={MUDANCAS} />)
    expect(screen.queryByTestId('score-periodo-anterior')).not.toBeInTheDocument()
    expect(screen.queryByText(/Peso: SLA/)).not.toBeInTheDocument()
    expect(container.querySelector('#score-breakdown-popover')).not.toBeInTheDocument()
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

  it('mini-stats de qualidade continuam fora daqui (vivem no QualidadePeriodoCard)', () => {
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} />)
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

  it('omite o Δ de um vital quando não há período anterior para comparar', () => {
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} mudancas={[]} />)
    const vitais = screen.getByTestId('pulso-vitais')
    expect(within(vitais).getByText('87%')).toBeInTheDocument()
    expect(within(vitais).queryByText(/↑|↓/)).not.toBeInTheDocument()
  })
})
