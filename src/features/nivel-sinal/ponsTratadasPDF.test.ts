import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { TreatedPon } from './ponTreatments'

const textos: string[] = []
let fontSizeAtual = 7

const doc = {
  setFontSize: (size: number) => { fontSizeAtual = size },
  setTextColor: vi.fn(), setFont: vi.fn(), setFillColor: vi.fn(),
  setDrawColor: vi.fn(), setLineWidth: vi.fn(),
  rect: vi.fn(), line: vi.fn(), addImage: vi.fn(),
  addPage: vi.fn(), save: vi.fn(), setPage: vi.fn(),
  internal: { getNumberOfPages: () => 1 },
  getTextWidth: (text: string) => text.length * 1.4,
  splitTextToSize: (text: string, largura: number) => {
    const max = Math.max(8, Math.floor(largura / (0.5 * fontSizeAtual * 0.3528)))
    return [String(text).slice(0, max)]
  },
  text: (value: string | string[], _x: number, _y: number) => {
    const linhas = Array.isArray(value) ? value : [value]
    linhas.forEach(linha => textos.push(linha))
  },
}

vi.mock('jspdf', () => ({ default: class { constructor() { return doc } } }))
vi.mock('../../lib/pdfBrand', () => ({
  drawPDFHeader: () => { doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(17, 24, 39); return 38 },
}))

const { exportPonsTratadasPDF } = await import('./ponsTratadasPDF')

const pon = (overrides: Partial<TreatedPon> = {}): TreatedPon => ({
  pon_key: 'OLT TBT|1|1/2',
  action: 'tratada',
  snapshot: {
    olt: 'OLT Caçapava', pon: '3/10', cidade: 'Caçapava', bairro: 'Borda da Mata',
    total: 30, criticos: 21, concentracao: 0.7, rxMediano: -27.9, piorRx: -31, tempMax: 47, nivel: 'alto',
  },
  created_at: '2026-09-09 16:20:00', created_by: 'admin',
  treated_count: 6, reopened_count: 5,
  medicoes: [],
  aindaCritica: true,
  atual: { key: 'x', olt: 'OLT Caçapava', pon: '3/10', cidade: 'Caçapava', bairro: 'Borda da Mata', total: 30, criticos: 21, concentracao: 0.7, rxMediano: -27.9, piorRx: -31, tempMax: 47, nivel: 'alto', score: 14.7 },
  ...overrides,
})

const posicao = (trecho: string) => textos.findIndex(t => t.includes(trecho))

beforeEach(() => { textos.length = 0; fontSizeAtual = 7 })

describe('exportPonsTratadasPDF', () => {
  it('mostra o resumo antes da tabela e os dados da PON na linha', () => {
    exportPonsTratadasPDF([pon()], true)
    expect(posicao('PONs tratadas')).toBeGreaterThanOrEqual(0)
    expect(posicao('1 tratada')).toBeLessThan(posicao('PON / OLT'))
    expect(posicao('3/10')).toBeGreaterThan(posicao('PON / OLT'))
  })

  it('marca "Ainda crítica" quando a PON continua batendo o critério no CSV atual', () => {
    exportPonsTratadasPDF([pon({ aindaCritica: true })], true)
    expect(posicao('Ainda crítica')).toBeGreaterThanOrEqual(0)
    expect(posicao('Normalizada')).toBe(-1)
  })

  it('marca "Normalizada" quando a PON saiu do critério no CSV atual', () => {
    exportPonsTratadasPDF([pon({ aindaCritica: false, atual: null })], true)
    expect(posicao('Normalizada')).toBeGreaterThanOrEqual(0)
    expect(posicao('Ainda crítica')).toBe(-1)
  })

  it('avisa que não há CSV carregado em vez de arriscar uma situação errada', () => {
    exportPonsTratadasPDF([pon()], false)
    expect(posicao('sem CSV carregado')).toBeGreaterThanOrEqual(0)
    expect(posicao('Ainda crítica')).toBe(-1)
    expect(posicao('Normalizada')).toBe(-1)
  })

  it('mostra mensagem de vazio sem desenhar a tabela quando não há PON no filtro', () => {
    exportPonsTratadasPDF([], true)
    expect(posicao('Nenhuma PON tratada no filtro atual.')).toBeGreaterThanOrEqual(0)
    expect(posicao('PON / OLT')).toBe(-1)
  })
})
