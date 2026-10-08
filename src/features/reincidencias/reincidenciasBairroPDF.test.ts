import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ClienteReincidente } from '../../lib/builders/churn'
import type { OSRow } from '../../lib/types'
import { buildBairroSummary } from './reincidenciasReport'
import type { ClienteBase } from '../../lib/builders/churn'

const textos: string[] = []
const saves: string[] = []
const addPage = vi.fn()

const doc = {
  setFontSize: vi.fn(), setTextColor: vi.fn(), setFont: vi.fn(), setFillColor: vi.fn(),
  setDrawColor: vi.fn(), setLineWidth: vi.fn(), setLineHeightFactor: vi.fn(),
  roundedRect: vi.fn(), rect: vi.fn(), line: vi.fn(), addImage: vi.fn(), circle: vi.fn(),
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

const { exportBairrosPDF, leituraPorBairro, acoesSugeridas, deltaPDF } = await import('./reincidenciasBairroPDF')

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

describe('exportBairrosPDF — página executiva', () => {
  const eq = (e: string) => ({ ...os('x'), nomedaequipe: `03- VAL - INSTALACAO ${e}` }) as OSRow
  const comEquipes = (chave: string, bairro: string, equipes: string[]): ClienteReincidente => ({
    chave, cliente: `Cliente ${chave}`, cidade: 'Taubaté', bairro, visitas: equipes.length, intervaloMedio: 6, diasDesdeUltima: 2,
    rows: equipes.map((e, i) => ({ ...eq(e), numos: `${chave}${i}` })),
  })
  const atendidos = (bairro: string, n: number): ClienteBase[] => Array.from({ length: n }, (_, i) => ({ chave: `${bairro}${i}`, cliente: `At ${i}`, cidade: 'Taubaté', bairro, rows: [os(`a${i}`)] }))

  const atual = [
    comEquipes('A', 'CENTRO', ['F11', 'F11', 'F11']), comEquipes('B', 'CENTRO', ['F11', 'F11', 'F36']),
    comEquipes('C', 'JARDIM', ['F12', 'F13']), comEquipes('D', 'JARDIM', ['F14', 'F45']), comEquipes('E', 'JARDIM', ['F20', 'F11']),
    comEquipes('F', 'VILA', ['F11', 'F11']),
  ]
  const base = [...atendidos('CENTRO', 10), ...atendidos('JARDIM', 8), ...atendidos('VILA', 20)]
  const anterior = [comEquipes('Z', 'CENTRO', ['F11', 'F11'])]
  const resumoCom = buildBairroSummary(atual, { base, anterior })
  const opcoes = { tipo: 'Revisita de manutenção', filtros: [], totalBase: base.length, totalOSAnterior: 2 }

  it('a manchete traz a taxa e a variação contra o período anterior', () => {
    exportBairrosPDF(resumoCom, opcoes)
    expect(textos.some(t => t.includes('lidera com') && t.includes('taxa de revisita de') && t.includes('contra o período anterior'))).toBe(true)
  })

  it('mostra a taxa geral e a variação de OS nos indicadores', () => {
    exportBairrosPDF(resumoCom, opcoes)
    expect(textos).toContain('taxa de revisita')
    expect(textos).toContain('6 de 38 atendidos')
    expect(textos.some(t => /^\+\d+ vs período anterior$/.test(t))).toBe(true)
  })

  it('desenha o quadrante e as ações sugeridas antes da tabela completa', () => {
    exportBairrosPDF(resumoCom, opcoes)
    const ordem = ['ONDE AGIR', 'LEITURA', 'AÇÕES SUGERIDAS', 'TODOS OS BAIRROS'].map(posicao)
    expect(ordem.every(p => p >= 0)).toBe(true)
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem)
    expect(posicao('clientes atendidos no bairro')).toBeGreaterThanOrEqual(0)
  })

  it('sem base o quadrante não aparece mas o resto sai normalmente', () => {
    exportBairrosPDF(buildBairroSummary(atual), { tipo: 'Revisita de manutenção', filtros: [] })
    expect(posicao('ONDE AGIR')).toBe(-1)
    expect(posicao('TODOS OS BAIRROS')).toBeGreaterThanOrEqual(0)
  })

  it('a tabela completa traz taxa e indício', () => {
    exportBairrosPDF(resumoCom, opcoes)
    expect(textos).toContain('Atend.')
    expect(textos).toContain('Indício')
    expect(textos.some(t => t.startsWith('Indício de execução'))).toBe(true)
  })
})

describe('acoesSugeridas', () => {
  const eq = (e: string) => ({ ...os('x'), nomedaequipe: `03- VAL - INSTALACAO ${e}` }) as OSRow
  const c = (chave: string, bairro: string, equipes: string[]): ClienteReincidente => ({
    chave, cliente: chave, cidade: 'Taubaté', bairro, visitas: equipes.length, intervaloMedio: 5, diasDesdeUltima: 1,
    rows: equipes.map((e, i) => ({ ...eq(e), numos: `${chave}${i}` })),
  })

  it('sugere auditar a equipe quando o indício é de execução', () => {
    const r = buildBairroSummary([c('A', 'CENTRO', ['F11', 'F11', 'F11']), c('B', 'CENTRO', ['F11', 'F11', 'F11'])])
    expect(acoesSugeridas(r).some(a => a.startsWith('Execução em CENTRO') && a.includes('INST F11'))).toBe(true)
  })

  it('sugere medir CTO e acionar a Rede quando o indício é de rede', () => {
    const r = buildBairroSummary([c('A', 'CENTRO', ['F11', 'F36', 'F11']), c('B', 'CENTRO', ['F12', 'F13']), c('C', 'CENTRO', ['F14', 'F45'])])
    expect(acoesSugeridas(r).some(a => a.startsWith('Rede em CENTRO') && a.includes('Engenharia de Rede'))).toBe(true)
  })

  it('avisa quando um dos maiores bairros está piorando', () => {
    const r = buildBairroSummary([c('A', 'CENTRO', ['F11', 'F11', 'F11']), c('B', 'CENTRO', ['F11', 'F11', 'F11'])], { anterior: [c('Z', 'CENTRO', ['F11', 'F11'])] })
    expect(acoesSugeridas(r).some(a => a.startsWith('Piorando: CENTRO subiu 4 OS'))).toBe(true)
  })

  it('sem padrão, manda revisar caso a caso', () => {
    expect(acoesSugeridas(buildBairroSummary([c('A', 'CENTRO', ['F11', 'F11'])]))[0]).toContain('revisar os casos um a um')
  })

  it('no máximo três ações', () => {
    const muitos = Array.from({ length: 8 }, (_, i) => [c(`a${i}`, `B${i}`, ['F11', 'F11', 'F11']), c(`b${i}`, `B${i}`, ['F11', 'F11', 'F11'])]).flat()
    expect(acoesSugeridas(buildBairroSummary(muitos)).length).toBeLessThanOrEqual(3)
  })
})

describe('deltaPDF', () => {
  it('usa só ASCII (a fonte do PDF não tem seta nem menos tipográfico)', () => {
    expect(deltaPDF(5)).toBe('+5')
    expect(deltaPDF(-3)).toBe('-3')
    expect(deltaPDF(0)).toBe('0')
    expect(deltaPDF(null)).toBe('')
  })
})

describe('exportBairrosPDF — várias cidades no mesmo PDF', () => {
  const eq = (e: string) => ({ ...os('x'), nomedaequipe: `03- VAL - INSTALACAO ${e}` }) as OSRow
  const c = (chave: string, bairro: string, cidade: string, equipes = ['F11', 'F11']): ClienteReincidente => ({
    chave, cliente: `Cliente ${chave}`, cidade, bairro, visitas: equipes.length, intervaloMedio: 6, diasDesdeUltima: 2,
    rows: equipes.map((e, i) => ({ ...eq(e), numos: `${chave}${i}` })),
  })
  const varias = buildBairroSummary([
    c('A', 'CENTRO', 'Taubaté', ['F11', 'F11', 'F11']), c('B', 'JARDIM', 'Taubaté'), c('C', 'CENTRO', 'Caçapava'), c('D', 'VILA', 'Pindamonhangaba', ['F08', 'F23', 'F08', 'F08']),
  ])
  const opcoes = { tipo: 'Revisita de manutenção', filtros: ['Cidades: Taubaté, Caçapava, Pindamonhangaba'], basePorCidade: { TAUBATE: 20, CACAPAVA: 5, PINDAMONHANGABA: 8 } }

  it('inclui o quadro "Por cidade" com as três cidades e os totais batendo', () => {
    exportBairrosPDF(varias, opcoes)
    expect(posicao('POR CIDADE (3)')).toBeGreaterThanOrEqual(0)
    expect(posicao('POR CIDADE (3)')).toBeLessThan(posicao('TODOS OS BAIRROS'))
    for (const cidade of ['Taubaté', 'Caçapava', 'Pindamonhangaba']) expect(textos).toContain(cidade)
  })

  it('a taxa de cada cidade usa a base da cidade', () => {
    exportBairrosPDF(varias, opcoes)
    expect(textos).toContain('10,0%')   // Taubaté: 2 reincidentes de 20
    expect(textos).toContain('20,0%')   // Caçapava: 1 de 5
  })

  it('a leitura diz quanto cada cidade pesa', () => {
    exportBairrosPDF(varias, opcoes)
    expect(textos.some(t => t.includes('Por cidade:') && t.includes('Taubaté'))).toBe(true)
  })

  it('uma cidade só não ganha o quadro por cidade', () => {
    exportBairrosPDF(buildBairroSummary([c('A', 'CENTRO', 'Taubaté'), c('B', 'JARDIM', 'Taubaté')]), { tipo: 'Revisita de manutenção', filtros: [] })
    expect(posicao('POR CIDADE')).toBe(-1)
    expect(textos.some(t => t.includes('Por cidade:'))).toBe(false)
  })

  it('o cabeçalho do PDF traz as cidades escolhidas', () => {
    exportBairrosPDF(varias, opcoes)
    expect(textos.some(t => t.includes('Cidades: Taubaté, Caçapava, Pindamonhangaba'))).toBe(true)
  })
})
