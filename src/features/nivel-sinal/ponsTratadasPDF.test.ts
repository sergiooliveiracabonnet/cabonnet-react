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
  medicoes: [{ onu_key: 'k1', cliente: 'Cliente 1', onu: '1', serial: 's1', codigo: '1', rx_antes: -29, rx_depois: null, observacao: '' }],
  aindaCritica: true,
  situacao: 'critica',
  resumoSituacao: { criticos: 1, atencao: 0, melhorados: 0 },
  atual: { key: 'x', olt: 'OLT Caçapava', pon: '3/10', cidade: 'Caçapava', bairro: 'Borda da Mata', total: 30, criticos: 21, atencao: 5, concentracao: 0.7, rxMediano: -27.9, piorRx: -31, tempMax: 47, nivel: 'alto', score: 14.7 },
  ...overrides,
})

const posicao = (trecho: string) => textos.findIndex(t => t.includes(trecho))

beforeEach(() => { textos.length = 0; fontSizeAtual = 7 })

describe('exportPonsTratadasPDF', () => {
  it('mostra o resumo antes da tabela e os dados da PON na linha', () => {
    exportPonsTratadasPDF([pon()])
    expect(posicao('PONs tratadas')).toBeGreaterThanOrEqual(0)
    expect(posicao('1 tratada')).toBeLessThan(posicao('PON / OLT'))
    expect(posicao('3/10')).toBeGreaterThan(posicao('PON / OLT'))
  })

  it('marca "Ainda crítica" quando sobra cliente crítico pela Nova Potência', () => {
    exportPonsTratadasPDF([pon({ situacao: 'critica', resumoSituacao: { criticos: 1, atencao: 0, melhorados: 0 } })])
    expect(posicao('Ainda crítica')).toBeGreaterThanOrEqual(0)
    expect(posicao('Normalizada')).toBe(-1)
  })

  it('marca "Em atenção" quando não sobra crítico mas tem cliente em atenção', () => {
    exportPonsTratadasPDF([pon({ situacao: 'atencao', resumoSituacao: { criticos: 0, atencao: 1, melhorados: 0 } })])
    expect(posicao('Em atenção')).toBeGreaterThanOrEqual(0)
    expect(posicao('Ainda crítica')).toBe(-1)
  })

  it('marca "Normalizada" quando nenhum cliente segue crítico ou em atenção', () => {
    exportPonsTratadasPDF([pon({ situacao: 'normalizada', resumoSituacao: { criticos: 0, atencao: 0, melhorados: 1 }, atual: null })])
    expect(posicao('Normalizada')).toBeGreaterThanOrEqual(0)
    expect(posicao('Ainda crítica')).toBe(-1)
  })

  it('avisa que não há cliente registrado em vez de arriscar uma situação errada', () => {
    exportPonsTratadasPDF([pon({ medicoes: [], situacao: 'sem-dados', resumoSituacao: { criticos: 0, atencao: 0, melhorados: 0 } })])
    expect(posicao('sem clientes')).toBeGreaterThanOrEqual(0)
    expect(posicao('Ainda crítica')).toBe(-1)
    expect(posicao('Normalizada')).toBe(-1)
  })

  it('mostra mensagem de vazio sem desenhar a tabela quando não há PON no filtro', () => {
    exportPonsTratadasPDF([])
    expect(posicao('Nenhuma PON tratada no filtro atual.')).toBeGreaterThanOrEqual(0)
    expect(posicao('PON / OLT')).toBe(-1)
  })
})
