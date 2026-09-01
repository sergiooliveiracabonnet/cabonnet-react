import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ReincidenciasAIPanel } from './ReincidenciasAIPanel'
import type { AIPairDiagnosis, AIPonto, AIReincidenciaAnalysis } from '../../hooks/useAIReincidencias'

afterEach(cleanup)

const diagnostico = (over: Partial<AIPairDiagnosis> = {}): AIPairDiagnosis => ({
  chave: '9069512>9069513', cliente: 'Maria S. Oliveira', chaveCliente: '1001', cidade: 'Taubaté',
  equipe: 'F04', diasEntre: 5, numosOrig: '9069512', numosRev: '9069513',
  causa: 'Conectorização/Sinal', feitoPrimeira: 'Refez o conector na CTO', oQueFaltou: 'Sinal seguiu fora do padrão',
  ...over,
})

const analysis = (over: Partial<AIReincidenciaAnalysis> = {}): AIReincidenciaAnalysis => ({
  ok: true, cached: false,
  resumo: '4 pares de revisita classificados. Causa dominante: Conectorização/Sinal — 3 pares (75%).',
  notas: ['Lote um.'], paresAnalisados: 4,
  causas: [
    { causa: 'Conectorização/Sinal', count: 3, pct: 75, pares: [diagnostico()] },
    { causa: 'Configuração', count: 1, pct: 25, pares: [] },
  ],
  porPar: { '9069512>9069513': diagnostico() },
  metricas: { clientes: 3, intervaloMedio: 6.5, revisitasRapidas: 2 },
  sintese: '', pontos: [], acoes: [], sinteseErro: false,
  ...over,
})

const ponto = (over: Partial<AIPonto> = {}): AIPonto => ({
  titulo: 'F04 concentra as revisitas', detalhe: 'Sete dos dezenove pares saíram da mesma frente.',
  metrica: '7 de 19 pares', causa: 'Conectorização/Sinal', severidade: 'alta',
  ...over,
})

const base = {
  analysis: null, parCount: 12, aiLoading: false, observationsLoading: false,
  observationsError: false, aiError: false, errorMessage: null, onGenerate: vi.fn(),
}

describe('ReincidenciasAIPanel', () => {
  it('mostra as causas ranqueadas com contagem e percentual', () => {
    render(<ReincidenciasAIPanel {...base} analysis={analysis()} />)
    expect(screen.getByText('Conectorização/Sinal')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('abre a causa e revela o par auditável com o que foi feito e o que faltou', () => {
    render(<ReincidenciasAIPanel {...base} analysis={analysis()} />)
    expect(screen.queryByText('Maria S. Oliveira')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('Maria S. Oliveira')).toBeInTheDocument()
    expect(screen.getByText(/OS 9069512 → 9069513 · 5d · F04/)).toBeInTheDocument()
    expect(screen.getByText(/Refez o conector na CTO/)).toBeInTheDocument()
    expect(screen.getByText(/Sinal seguiu fora do padrão/)).toBeInTheDocument()
  })

  it('não deixa expandir causa sem pares detalhados', () => {
    render(<ReincidenciasAIPanel {...base} analysis={analysis()} />)
    const semPares = screen.getAllByRole('button').find(b => b.textContent?.includes('Configuração'))
    expect(semPares).toBeDisabled()
  })

  it('lista uma leitura por lote em vez de um parágrafo emendado', () => {
    render(<ReincidenciasAIPanel {...base} analysis={analysis({ notas: ['Lote um.', 'Lote dois.'] })} />)
    expect(screen.getByText(/2 lotes de até 10 pares/)).toBeInTheDocument()
    expect(screen.getByText('Lote um.')).toBeInTheDocument()
    expect(screen.getByText('Lote dois.')).toBeInTheDocument()
  })

  it('quebra os achados em linhas de tabela, com severidade e indicador', () => {
    render(<ReincidenciasAIPanel {...base} analysis={analysis({
      sintese: 'Metade das revisitas sai da F04.',
      pontos: [ponto(), ponto({ titulo: 'Retorno em menos de uma semana', detalhe: 'Metade volta antes do sétimo dia.', severidade: 'media', metrica: '5 dias', causa: '' })],
    })} />)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Severidade' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Indicador' })).toBeInTheDocument()
    expect(screen.getByText('F04 concentra as revisitas')).toBeInTheDocument()
    expect(screen.getByText('Sete dos dezenove pares saíram da mesma frente.')).toBeInTheDocument()
    expect(screen.getByText('7 de 19 pares')).toBeInTheDocument()
    expect(screen.getByText('Alta')).toBeInTheDocument()
    expect(screen.getByText('Média')).toBeInTheDocument()
  })

  it('mostra os números do conjunto ao lado da manchete, fora do texto', () => {
    render(<ReincidenciasAIPanel {...base} analysis={analysis({ sintese: 'Manchete.' })} />)
    expect(screen.getByText('Pares analisados')).toBeInTheDocument()
    expect(screen.getByText('Clientes distintos')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('2 (50%)')).toBeInTheDocument()
    expect(screen.getByText('6,5d')).toBeInTheDocument()
  })

  it('cai para o resumo determinístico quando a manchete da IA não veio', () => {
    render(<ReincidenciasAIPanel {...base} analysis={analysis()} />)
    expect(screen.getByText(/Causa dominante: Conectorização\/Sinal — 3 pares \(75%\)/)).toBeInTheDocument()
  })

  it('mostra a síntese do conjunto e as ações recomendadas', () => {
    render(<ReincidenciasAIPanel {...base} analysis={analysis({
      sintese: 'As revisitas se concentram na F04 e voltam rápido demais.',
      acoes: [{ titulo: 'Auditar o fechamento da F04', detalhe: 'Exigir foto do conector na baixa.', causa: 'Conectorização/Sinal' }],
    })} />)
    expect(screen.getByText('As revisitas se concentram na F04 e voltam rápido demais.')).toBeInTheDocument()
    expect(screen.getByText('Auditar o fechamento da F04')).toBeInTheDocument()
    expect(screen.getByText('Exigir foto do conector na baixa.')).toBeInTheDocument()
  })

  it('esconde as leituras por lote quando a síntese do conjunto existe', () => {
    render(<ReincidenciasAIPanel {...base} analysis={analysis({ sintese: 'Leitura do conjunto.', notas: ['Lote um.', 'Lote dois.'] })} />)
    expect(screen.queryByText('Lote um.')).not.toBeInTheDocument()
    expect(screen.queryByText(/lotes de até 10 pares/)).not.toBeInTheDocument()
  })

  it('avisa quando a síntese falha e cai para as leituras parciais', () => {
    render(<ReincidenciasAIPanel {...base} analysis={analysis({ sinteseErro: true, notas: ['Lote um.'] })} />)
    expect(screen.getByText(/A síntese do conjunto não pôde ser gerada/)).toBeInTheDocument()
    expect(screen.getByText('Lote um.')).toBeInTheDocument()
  })

  it('bloqueia o botão enquanto as observações carregam', () => {
    render(<ReincidenciasAIPanel {...base} observationsLoading />)
    expect(screen.getByRole('button', { name: 'Carregando observações…' })).toBeDisabled()
  })

  it('mostra o erro da IA sem esconder o restante do relatório', () => {
    render(<ReincidenciasAIPanel {...base} aiError errorMessage="timeout" />)
    expect(screen.getByText(/A IA não respondeu: timeout/)).toBeInTheDocument()
  })
})
