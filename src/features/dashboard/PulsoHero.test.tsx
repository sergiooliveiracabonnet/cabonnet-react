import { describe, it, expect, afterEach, vi } from 'vitest'
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
    // MTTR é métrica de fluxo e tem Δ comparável. O sentido vem do ícone Phosphor
    // (TrendUp/TrendDown com <title>), não de um glifo no texto.
    expect(within(vitais).getByText('0,3d')).toBeInTheDocument()
    expect(within(vitais).getByTitle('alta')).toBeInTheDocument()
    expect(screen.getByText('A fila recua pelo terceiro dia seguido.')).toBeInTheDocument()
  })

  // O valor do período anterior era só um title= (precisava de hover); agora é texto.
  it('expõe o valor do período anterior e a meta de cada vital sem depender de hover', () => {
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} mudancas={MUDANCAS} />)
    const vitais = screen.getByTestId('pulso-vitais')
    expect(within(vitais).getByText('antes 1,8d')).toBeInTheDocument()
    expect(within(vitais).getByText('meta ≥ 90%')).toBeInTheDocument()
    expect(within(vitais).getByText('meta ≥ 80%')).toBeInTheDocument()
    expect(within(vitais).getByText('alvo ≤ 2d')).toBeInTheDocument()
  })

  it('resume o estado do painel num veredito derivado do pior vital', () => {
    // slaFila 87 e taxa 76 caem na faixa de atenção
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} />)
    expect(screen.getByTestId('pulso-veredito')).toHaveTextContent('Sob atenção')
    cleanup()

    render(<PulsoHero pulso={makePulso({ slaFila: 60 })} aiData={null} isLoadingAI={false} />)
    expect(screen.getByTestId('pulso-veredito')).toHaveTextContent('Crítico')
    expect(screen.getByTestId('pulso-veredito')).toHaveTextContent('SLA da Fila')
    cleanup()

    render(<PulsoHero pulso={makePulso({ slaFila: 95, taxa: 88, mttr: 1.4 })} aiData={null} isLoadingAI={false} />)
    expect(screen.getByTestId('pulso-veredito')).toHaveTextContent('Dentro das metas')
  })

  // SLA da Fila é estoque (foto de agora) e o Δ de 'sla' em mudancas é do SLA do
  // PERÍODO — outra métrica. Casar os dois mostraria a variação de um número ao
  // lado do valor de outro.
  it('não cola o Δ do SLA do período no vital SLA da Fila, que é estoque', () => {
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} mudancas={MUDANCAS} />)
    const vitais = screen.getByTestId('pulso-vitais')
    expect(within(vitais).getByText('SLA da Fila')).toBeInTheDocument()
    expect(within(vitais).getByText('agora', { exact: false })).toBeInTheDocument()
    expect(within(vitais).queryByText(/5%/)).not.toBeInTheDocument()
  })

  it('mostra o Δ negativo sem sinal duplicado', () => {
    const queda = [{ id: 'mttr', label: 'MTTR', atual: 1.8, anterior: 2.1, delta: -0.3, unidade: 'd', melhorou: true, variacao: 14.3 }]
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} mudancas={queda} />)
    const vitais = screen.getByTestId('pulso-vitais')
    expect(within(vitais).getByText('0,3d')).toBeInTheDocument()
    expect(within(vitais).getByTitle('queda')).toBeInTheDocument()
    expect(within(vitais).queryByText(/-0,3/)).not.toBeInTheDocument()
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
    // Exclui os ícones para sobrar só SVG desenhado à mão (sparkline). O lucide
    // marcava os seus com class="lucide"; o Phosphor não usa classe, mas todo
    // ícone dele vem no grid 256 — é esse o marcador equivalente.
    expect(container.querySelectorAll('svg[aria-hidden="true"]:not([viewBox="0 0 256 256"]) path')).toHaveLength(0)
  })

  it('abre as ordens de entradas e concluídas de hoje pelo fluxo do dia', () => {
    const onOpenFlow = vi.fn()
    render(<PulsoHero pulso={makePulso()} aiData={null} isLoadingAI={false} onOpenFlow={onOpenFlow} />)

    fireEvent.click(screen.getByRole('button', { name: /Entradas hoje.*46.*Ver ordens/i }))
    expect(onOpenFlow).toHaveBeenCalledWith('entradas')

    fireEvent.click(screen.getByRole('button', { name: /Concluídas hoje.*51.*Ver ordens/i }))
    expect(onOpenFlow).toHaveBeenCalledWith('saidas')
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
    expect(within(vitais).queryByTitle('alta')).not.toBeInTheDocument()
    expect(within(vitais).queryByTitle('queda')).not.toBeInTheDocument()
  })
})
