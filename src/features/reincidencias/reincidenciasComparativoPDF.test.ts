import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ClienteBase, ClienteReincidente } from '../../lib/builders/churn'
import type { OSRow } from '../../lib/types'
import { buildBairroComparativo } from './reincidenciasReport'
import { montarTabela } from './reincidenciasMatriz'

const textos: string[] = []
const saves: string[] = []
const addPage = vi.fn()
const opcoesDoc: unknown[] = []

const doc = {
  setFontSize: vi.fn(), setTextColor: vi.fn(), setFont: vi.fn(), setFillColor: vi.fn(),
  setDrawColor: vi.fn(), setLineWidth: vi.fn(), roundedRect: vi.fn(), rect: vi.fn(), line: vi.fn(), addImage: vi.fn(),
  addPage, save: (nome: string) => { saves.push(nome) },
  getTextWidth: (text: string) => text.length * 1.4,
  splitTextToSize: (text: string, largura: number) => [String(text)].map(t => t.slice(0, Math.floor(largura / 1.4) * 4)),
  text: (value: string | string[]) => { (Array.isArray(value) ? value : [value]).forEach(l => textos.push(l)) },
}

vi.mock('jspdf', () => ({ default: class { constructor(opcoes: unknown) { opcoesDoc.push(opcoes); return doc } } }))
vi.mock('../../lib/pdfBrand', () => ({ drawPDFHeader: () => 30 }))

const { exportComparativoPDF, nomeArquivoComparativo } = await import('./reincidenciasComparativoPDF')

const lin = (numos: string) => ({ numos, nomedaequipe: '03- VAL - INSTALACAO F11', dataexecucao: '10/09/2026', databaixa: '10/09/2026' }) as unknown as OSRow
const c = (chave: string, bairro: string, n: number) => ({
  chave, cliente: chave, cidade: 'Caçapava', bairro, visitas: n, intervaloMedio: 5, diasDesdeUltima: 1,
  rows: Array.from({ length: n }, (_, i) => lin(`${chave}${i}`)),
}) as unknown as ClienteReincidente
const at = (chave: string, bairro: string) => ({ chave, cliente: chave, cidade: 'Caçapava', bairro, rows: [lin(chave)] }) as unknown as ClienteBase

const comp = buildBairroComparativo([
  { id: '2026-08', label: 'AGO/26', clientes: [c('A', 'VITORIA VALE', 2)], base: [at('A', 'VITORIA VALE'), at('x', 'VITORIA VALE')] },
  { id: '2026-09', label: 'SET/26', clientes: [c('B', 'VITÓRIA VALE', 4), c('C', 'CENTRO', 2)], base: [at('B', 'VITÓRIA VALE'), at('C', 'CENTRO')] },
])

beforeEach(() => { textos.length = 0; saves.length = 0; opcoesDoc.length = 0; addPage.mockClear() })

describe('exportComparativoPDF', () => {
  it('gera em paisagem, com uma coluna por mês e o mesmo bairro numa linha só', () => {
    exportComparativoPDF(montarTabela(comp, 'os'), { tipo: 'Revisita de manutenção', filtros: ['Todas as terceiras'] })
    expect(opcoesDoc[0]).toMatchObject({ orientation: 'landscape' })
    expect(textos).toContain('AGO/26')
    expect(textos).toContain('SET/26')
    expect(textos.filter(t => t.includes('VITORIA VALE') || t.includes('VITÓRIA VALE'))).toHaveLength(1)
    expect(posicao('2 bairros com revisita em AGO/26 a SET/26')).toBeGreaterThanOrEqual(0)
  })

  it('a linha de total fecha com a soma dos bairros', () => {
    exportComparativoPDF(montarTabela(comp, 'os'), { tipo: 'Revisita de manutenção', filtros: [] })
    const total = textos.lastIndexOf('Total')
    expect(textos.slice(total, total + 4)).toEqual(['Total', '2', '6', '8'])
  })

  it('na taxa não há coluna de total e a variação vem em pp', () => {
    exportComparativoPDF(montarTabela(comp, 'taxa'), { tipo: 'Revisita de manutenção', filtros: [] })
    expect(textos.filter(t => t === 'Total')).toHaveLength(1)  // só o rótulo da linha de total; sem coluna de total
    expect(textos).toContain('Var. (pp)')
  })

  it('avisa quando há mês em curso e explica o recorte da instalação', () => {
    exportComparativoPDF(montarTabela(comp, 'os'), { tipo: 'Revisita de instalação', filtros: [], parciais: ['SET/26'] })
    expect(textos.some(t => t.includes('Mês em curso (parcial): SET/26'))).toBe(true)
    expect(textos.some(t => t.includes('instalados no mês anterior'))).toBe(true)
  })

  it('nome do arquivo traz o tipo e o intervalo de meses', () => {
    const tabela = montarTabela(comp, 'os')
    expect(nomeArquivoComparativo('Revisita de manutenção', tabela)).toBe('comparativo-bairros-manutencao-2026-08_2026-09.pdf')
    expect(nomeArquivoComparativo('Revisita de instalação', tabela)).toBe('comparativo-bairros-instalacao-2026-08_2026-09.pdf')
    exportComparativoPDF(tabela, { tipo: 'Revisita de manutenção', filtros: [] })
    expect(saves[0]).toBe('comparativo-bairros-manutencao-2026-08_2026-09.pdf')
  })

  it('muitos bairros viram várias páginas e repetem o cabeçalho', () => {
    const muitos = buildBairroComparativo([{ id: '2026-09', label: 'SET/26', clientes: Array.from({ length: 90 }, (_, i) => c(`K${i}`, `BAIRRO ${i}`, 2)) }])
    exportComparativoPDF(montarTabela(muitos, 'os'), { tipo: 'Revisita de manutenção', filtros: [] })
    expect(addPage).toHaveBeenCalled()
    expect(textos.filter(t => t === 'Bairro').length).toBeGreaterThan(1)
  })

  it('sem revisitas sai um PDF curto com o aviso', () => {
    const vazio = buildBairroComparativo([{ id: '2026-09', label: 'SET/26', clientes: [] }])
    exportComparativoPDF(montarTabela(vazio, 'os'), { tipo: 'Revisita de manutenção', filtros: [] })
    expect(posicao('Nenhuma revisita encontrada')).toBeGreaterThanOrEqual(0)
    expect(saves).toHaveLength(1)
  })
})

function posicao(trecho: string) { return textos.findIndex(t => t.includes(trecho)) }
