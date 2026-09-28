import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SignalHotspot } from './nivelSinal'
import type { ExecutivoGrupo, NivelSinalExecutivoInput } from './nivelSinalExecutivoPDF'

const textos: string[] = []

const doc = {
  setFontSize: vi.fn(),
  setTextColor: vi.fn(), setFont: vi.fn(), setFillColor: vi.fn(),
  setDrawColor: vi.fn(), setLineWidth: vi.fn(), setLineHeightFactor: vi.fn(),
  roundedRect: vi.fn(), rect: vi.fn(), line: vi.fn(), addImage: vi.fn(),
  addPage: vi.fn(), save: vi.fn(),
  getTextWidth: (text: string) => text.length * 1.4,
  splitTextToSize: (text: string) => [String(text)],
  text: (value: string | string[], _x: number, _y: number) => {
    const linhas = Array.isArray(value) ? value : [value]
    linhas.forEach(linha => textos.push(linha))
  },
}

vi.mock('jspdf', () => ({ default: class { constructor() { return doc } } }))
vi.mock('../../lib/pdfBrand', () => ({
  drawPDFHeader: () => { doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(17, 24, 39); return 38 },
}))

const { exportNivelSinalExecutivoPDF } = await import('./nivelSinalExecutivoPDF')

const hotspot = (overrides: Partial<SignalHotspot> = {}): SignalHotspot => ({
  key: 'OLT Belém 2 · 7/6', olt: 'OLT Belém 2', pon: '7/6', cidade: 'Taubaté', bairro: 'Centro',
  total: 5, criticos: 1, atencao: 1, concentracao: 0.2, rxMediano: -26, piorRx: -29, tempMax: 40,
  nivel: 'baixo', score: 0.2,
  ...overrides,
})

const grupo = (overrides: Partial<ExecutivoGrupo> = {}): ExecutivoGrupo => ({ key: 'Taubaté', total: 10, criticos: 4, atencao: 3, ...overrides })

const base = (overrides: Partial<NivelSinalExecutivoInput> = {}): NivelSinalExecutivoInput => ({
  filterLabel: 'Panorama completo das cinco cidades atendidas',
  totalOnus: 100, sinalBom: 90, criticos: 6, atencao: 4, offline: 2,
  hotspots: [hotspot()], treatedCount: 3,
  porCidade: [grupo()], porOlt: [grupo({ key: 'OLT Belém 2' })],
  ...overrides,
})

const posicao = (trecho: string) => textos.findIndex(t => t.includes(trecho))

beforeEach(() => { textos.length = 0 })

describe('exportNivelSinalExecutivoPDF', () => {
  it('mostra o filtro ativo e o resumo executivo antes das tabelas', () => {
    exportNivelSinalExecutivoPDF(base())
    expect(posicao('Panorama completo das cinco cidades atendidas')).toBeGreaterThanOrEqual(0)
    expect(posicao('100 ONUs monitoradas')).toBeGreaterThanOrEqual(0)
    expect(posicao('1 PON pendente de tratativa')).toBeGreaterThanOrEqual(0)
    expect(posicao('3 já tratadas')).toBeGreaterThanOrEqual(0)
  })

  it('lista a distribuição por cidade e o ranking de OLTs', () => {
    exportNivelSinalExecutivoPDF(base())
    expect(posicao('DISTRIBUIÇÃO POR CIDADE')).toBeGreaterThanOrEqual(0)
    expect(posicao('Taubaté')).toBeGreaterThan(posicao('DISTRIBUIÇÃO POR CIDADE'))
    expect(posicao('RANKING DE OLTS')).toBeGreaterThanOrEqual(0)
    expect(posicao('OLT Belém 2')).toBeGreaterThan(posicao('RANKING DE OLTS'))
  })

  it('lista toda PON pendente, inclusive as de risco baixo que não eram hotspot antes', () => {
    exportNivelSinalExecutivoPDF(base({ hotspots: [hotspot({ pon: '7/6', criticos: 1, atencao: 1, nivel: 'baixo' })] }))
    expect(posicao('7/6 · OLT Belém 2')).toBeGreaterThanOrEqual(0)
    expect(posicao('Baixo')).toBeGreaterThanOrEqual(0)
  })

  it('avisa quando não há PON pendente no filtro', () => {
    exportNivelSinalExecutivoPDF(base({ hotspots: [] }))
    expect(posicao('Nenhuma PON pendente com cliente crítico ou em atenção.')).toBeGreaterThanOrEqual(0)
  })
})
