import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import {
  FornecedoresPanel,
  AgingPanel,
  MetaMesCard,
  QualidadePeriodoCard,
  RitmoEquipesPanel,
} from './DashboardPaineis'
import type { CampoSemaforo, Pulso, PulsoMetaMes } from '../../lib/types'

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

describe('semântica dos painéis analíticos', () => {
  it.each([
    {
      concluidas: 18,
      meta: 30,
      pct: 60,
      diasUteisRestantes: 5,
      diasUteisTotal: 22,
      projecaoFinal: 28,
      status: 'abaixo',
    },
    {
      concluidas: 18,
      meta: 0,
      pct: null,
      diasUteisRestantes: 0,
      diasUteisTotal: 22,
      projecaoFinal: null,
      status: 'neutro',
    },
  ] satisfies PulsoMetaMes[])('expõe Meta do Mês como h2 em todos os estados', meta => {
    render(<MetaMesCard meta={meta} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Meta do Mês' })).toBeInTheDocument()
  })
})

describe('drill-downs comparativos', () => {
  it('apresenta a distribuição do prazo consumido com quantidade e percentual', () => {
    render(<AgingPanel pulso={makePulso({
      agingDist: { ok: 40, limite: 30, estourado: 20, critico: 10 } as never,
      backlogDias: 3.2,
    })} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Fila Ativa — Prazo Consumido' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /distribuição de 100 OS por consumo do SLA/i })).toBeInTheDocument()
    expect(screen.getAllByRole('progressbar')).toHaveLength(4)
    expect(screen.getByText('30 em risco')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.getByText('20%')).toBeInTheDocument()
    expect(screen.getByText('10%')).toBeInTheDocument()
  })

  it('abre as OS da equipe selecionada no painel de ritmo', () => {
    const onOpen = vi.fn()
    const semaforo: CampoSemaforo[] = [{
      nome: 'F01',
      fila: 8,
      concl: 5,
      taxa: 62,
      slaExc: 1,
      status: 'atencao',
      diasAteSLA: 2,
      ritmoHoje: { atual: 5, projetado: 9, baseline: 7, status: 'abaixo' },
    }]

    render(<RitmoEquipesPanel semaforo={semaforo} onOpen={onOpen} />)

    expect(screen.getByText('Abrir OS')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Equipe F01.*Abrir OS/i }))
    expect(onOpen).toHaveBeenCalledWith('F01')
  })

  it('abre as OS do fornecedor selecionado', () => {
    const onOpen = vi.fn()
    const fornecedores = [{
      nome: 'WES',
      total: 12,
      concluidas: 9,
      sla: 88,
      conclPct: 75,
      cor: '#3b82f6',
    }]

    render(<FornecedoresPanel fornecedores={fornecedores} onOpen={onOpen} />)

    expect(screen.getByText('Abrir OS')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Fornecedor WES.*Abrir OS/i }))
    expect(onOpen).toHaveBeenCalledWith('WES')
  })
})
