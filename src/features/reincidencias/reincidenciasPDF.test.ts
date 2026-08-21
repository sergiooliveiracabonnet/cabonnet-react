import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ClienteReincidente } from '../../lib/builders/churn'
import type { AIReincidenciaAnalysis } from '../../hooks/useAIReincidencias'
import type { OSRow } from '../../lib/types'

const textos: string[] = []

const doc = {
  setFontSize: vi.fn(), setTextColor: vi.fn(), setFont: vi.fn(), setFillColor: vi.fn(),
  setDrawColor: vi.fn(), roundedRect: vi.fn(), rect: vi.fn(), line: vi.fn(), addImage: vi.fn(),
  addPage: vi.fn(), save: vi.fn(),
  splitTextToSize: (text: string) => [text],
  text: (value: string | string[]) => { textos.push(...(Array.isArray(value) ? value : [value])) },
}

vi.mock('jspdf', () => ({ default: class { constructor() { return doc } } }))
vi.mock('../../lib/pdfBrand', () => ({ drawPDFHeader: () => 40 }))

const { exportReincidenciasPDF } = await import('./reincidenciasPDF')

const rows = [
  { numos: '9069512', dataexecucao: '2026-07-01 09:00', nomedaequipe: 'F04 - EQUIPE', servico: 'MANUTENCAO', observacoes: 'refez conector', _fornecedor: 'WES' },
  { numos: '9069513', dataexecucao: '2026-07-06 09:00', nomedaequipe: 'F04 - EQUIPE', servico: 'MANUTENCAO', observacoes: 'sinal fora do padrao', _fornecedor: 'WES' },
] as unknown as OSRow[]

const cliente: ClienteReincidente = {
  chave: '1001', cliente: 'Maria S. Oliveira', cidade: 'Taubaté', bairro: 'Jardim Ana Emília',
  visitas: 2, intervaloMedio: 5, diasDesdeUltima: 3, rows,
} as ClienteReincidente

const analysis: AIReincidenciaAnalysis = {
  ok: true, cached: false,
  resumo: '4 pares de revisita classificados. Causa dominante: Conectorização/Sinal — 3 pares (75%).',
  notas: ['Leitura do lote 1.'], paresAnalisados: 4,
  causas: [{ causa: 'Conectorização/Sinal', count: 3, pct: 75, pares: [] }],
  porPar: {}, sinteseErro: false,
  sintese: 'As revisitas se concentram na F04 e voltam rápido demais.',
  acoes: [{ titulo: 'Auditar o fechamento da F04', detalhe: 'Exigir foto do conector.', causa: 'Conectorização/Sinal' }],
}

const posicao = (trecho: string) => textos.findIndex(t => t.includes(trecho))

beforeEach(() => { textos.length = 0 })

describe('exportReincidenciasPDF', () => {
  it('abre o relatório com o diagnóstico da IA, antes do detalhamento por cliente', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras'], analysis)

    expect(posicao('Diagnóstico da IA')).toBeGreaterThanOrEqual(0)
    expect(posicao('Diagnóstico da IA')).toBeLessThan(posicao('Detalhamento por cliente'))
    expect(posicao('As revisitas se concentram na F04')).toBeLessThan(posicao('Detalhamento por cliente'))
    expect(posicao('Detalhamento por cliente')).toBeLessThan(posicao('Maria S. Oliveira'))
  })

  it('põe a síntese da IA acima dos números consolidados', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras'], analysis)
    expect(posicao('As revisitas se concentram na F04')).toBeLessThan(posicao('4 pares de revisita classificados'))
  })

  it('leva as ações recomendadas para o topo, junto da síntese', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras'], analysis)
    expect(posicao('Ações recomendadas')).toBeLessThan(posicao('Detalhamento por cliente'))
    expect(posicao('1. Auditar o fechamento da F04 (Conectorização/Sinal)')).toBeGreaterThanOrEqual(0)
  })

  it('mantém o escopo do recorte em uma linha só, acima do bloco da IA', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras', 'Equipe: F04'], analysis)
    const escopo = posicao('1 clientes · 2 ordens · Todas as terceiras · Equipe: F04')
    expect(escopo).toBeGreaterThanOrEqual(0)
    expect(escopo).toBeLessThan(posicao('Diagnóstico da IA'))
  })

  it('sem análise gerada, o relatório começa direto no detalhamento', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras'], null)
    expect(posicao('Diagnóstico da IA')).toBe(-1)
    expect(posicao('Detalhamento por cliente')).toBeGreaterThanOrEqual(0)
    expect(posicao('Maria S. Oliveira')).toBeGreaterThanOrEqual(0)
  })

  it('cai para as leituras parciais quando a síntese do conjunto falhou', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras'], { ...analysis, sintese: '', sinteseErro: true })
    expect(posicao('Leitura do lote 1.')).toBeGreaterThanOrEqual(0)
    expect(posicao('Leitura do lote 1.')).toBeLessThan(posicao('Detalhamento por cliente'))
  })
})
