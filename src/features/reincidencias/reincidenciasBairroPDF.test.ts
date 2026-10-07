import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ClienteReincidente } from '../../lib/builders/churn'
import type { OSRow } from '../../lib/types'
import { buildBairroSummary } from './reincidenciasReport'

const textos: string[] = []
const saves: string[] = []
const addPage = vi.fn()

const doc = {
  setFontSize: vi.fn(), setTextColor: vi.fn(), setFont: vi.fn(), setFillColor: vi.fn(),
  setDrawColor: vi.fn(), setLineWidth: vi.fn(), setLineHeightFactor: vi.fn(),
  roundedRect: vi.fn(), rect: vi.fn(), line: vi.fn(), addImage: vi.fn(),
  addPage, save: (nome: string) => { saves.push(nome) },
  getTextWidth: (text: string) => text.length * 1.4,
  splitTextToSize: (text: string, largura: number) => {
    const max = Math.max(8, Math.floor(largura / 1.4))
    const linhas: string[] = []
    let atual = ''
    for (const palavra of String(text).split(' ')) {
      if (atual && (atual + ' ' + palavra).length > max) { linhas.push(atual); atual = palavra } else { atual = atual ? `${atual} ${palavra}` : palavra }
    }
    if (atual) linhas.push(atual)
    return linhas.length ? linhas : ['']
  },
  text: (value: string | string[]) => { (Array.isArray(value) ? value : [value]).forEach(l => textos.push(l)) },
}

vi.mock('jspdf', () => ({ default: class { constructor() { return doc } } }))
vi.mock('../../lib/pdfBrand', () => ({ drawPDFHeader: () => 38 }))

const { exportBairrosPDF, leituraPorBairro } = await import('./reincidenciasBairroPDF')

const os = (numos: string, obs = 'trocou conector'): OSRow => ({
  numos, servico: 'ASSISTENCIA - VT 24H', tiposervico: 'MANUTENCAO', nomedaequipe: '03- VAL - INSTALACAO F11',
  dataexecucao: '10/09/2026', databaixa: '10/09/2026', observacoes: obs, _fornecedor: 'WES',
}) as unknown as OSRow

const cli = (chave: string, cidade: string, bairro: string, n: number): ClienteReincidente => ({
  chave, cliente: `Cliente ${chave}`, cidade, bairro, visitas: n, intervaloMedio: 6, diasDesdeUltima: 2,
  rows: Array.from({ length: n }, (_, i) => os(`${chave}${i}`)),
})

const resumo = buildBairroSummary([
  cli('A', 'Taubaté', 'CENTRO', 2), cli('B', 'Taubaté', 'CENTRO', 2),
  cli('C', 'Taubaté', 'JARDIM AZUL', 5),
  cli('D', 'Pindamonhangaba', 'VILA NOVA', 2),
])

const posicao = (trecho: string) => textos.findIndex(t => t.includes(trecho))
beforeEach(() => { textos.length = 0; saves.length = 0; addPage.mockClear() })

describe('exportBairrosPDF', () => {
  it('abre com a manchete do bairro líder e os números do conjunto', () => {
    exportBairrosPDF(resumo, { tipo: 'Revisita de manutenção', filtros: ['Todas as terceiras'], periodo: '01/09/2026 a 30/09/2026' })
    expect(posicao('JARDIM AZUL lidera com 5 OS')).toBeGreaterThanOrEqual(0)
    expect(posicao('01/09/2026 a 30/09/2026 · Todas as terceiras')).toBeGreaterThanOrEqual(0)
    expect(textos).toContain('3')               // bairros
    expect(textos).toContain('11')              // OS envolvidas (4 + 5 + 2)
    expect(textos).toContain('bairros com revisita')
    expect(textos).toContain('OS envolvidas')
  })

  it('segue a ordem: leitura, barras, tabela completa e ordens dos maiores', () => {
    exportBairrosPDF(resumo, { tipo: 'Revisita de manutenção', filtros: [] })
    const ordem = ['LEITURA', 'OS ENVOLVIDAS POR BAIRRO', 'TODOS OS BAIRROS', 'Ordens dos'].map(posicao)
    expect(ordem.every(p => p >= 0)).toBe(true)
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem)
  })

  it('a tabela fecha com a linha de total igual à soma dos bairros', () => {
    exportBairrosPDF(resumo, { tipo: 'Revisita de manutenção', filtros: [] })
    const total = textos.lastIndexOf('Total')
    expect(total).toBeGreaterThan(0)
    expect(textos.slice(total, total + 3)).toEqual(['Total', '11', '4'])  // 11 OS, 4 clientes
  })

  it('lista as OS dos maiores bairros com a observação', () => {
    exportBairrosPDF(resumo, { tipo: 'Revisita de manutenção', filtros: [] })
    expect(posicao('OS C0')).toBeGreaterThanOrEqual(0)
    expect(posicao('trocou conector')).toBeGreaterThanOrEqual(0)
  })

  it('salva com o nome do relatório por bairro', () => {
    exportBairrosPDF(resumo, { tipo: 'Revisita de instalação', filtros: [] })
    expect(saves[0]).toMatch(/^reincidencias-por-bairro-\d{4}-\d{2}-\d{2}\.pdf$/)
  })

  it('sem revisitas gera um PDF curto com o aviso, sem quebrar', () => {
    exportBairrosPDF([], { tipo: 'Revisita de manutenção', filtros: [] })
    expect(posicao('Nenhuma revisita encontrada')).toBeGreaterThanOrEqual(0)
    expect(saves).toHaveLength(1)
  })

  it('muitos bairros viram várias páginas e repetem o cabeçalho da tabela', () => {
    const muitos = buildBairroSummary(Array.from({ length: 80 }, (_, i) => cli(`K${i}`, 'Taubaté', `BAIRRO ${i}`, 2)))
    exportBairrosPDF(muitos, { tipo: 'Revisita de manutenção', filtros: [] })
    expect(addPage).toHaveBeenCalled()
    expect(textos.filter(t => t === 'Clientes').length).toBeGreaterThan(1)
  })
})

describe('leituraPorBairro', () => {
  it('diz quanto os 3 maiores concentram e quem mais volta', () => {
    const frases = leituraPorBairro(resumo)
    expect(frases[0]).toContain('100%')
    expect(frases.some(f => f.includes('Quem mais volta: CENTRO') || f.includes('Quem mais volta: JARDIM AZUL'))).toBe(true)
  })

  it('aponta bairros com um único cliente como casos isolados', () => {
    expect(leituraPorBairro(resumo).some(f => f.includes('um único cliente reincidente'))).toBe(true)
  })

  it('lista vazia não gera frases', () => {
    expect(leituraPorBairro([])).toEqual([])
  })
})
