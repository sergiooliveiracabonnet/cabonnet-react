import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import type { ClienteReincidente } from '../../lib/builders/churn'
import type { OSRow } from '../../lib/types'
import { ultimosMeses } from './reincidenciasMatriz'

const lin = (numos: string) => ({ numos, nomedaequipe: '03- VAL - INSTALACAO F11', dataexecucao: '10/09/2026', databaixa: '10/09/2026' }) as unknown as OSRow

// Cada mês devolve um cliente em "VITORIA VALE" (com e sem acento, alternando) e OS
// proporcionais ao mês — assim o teste não depende da data em que roda.
const churnDoMes = (from: Date) => {
  const n = (from.getMonth() % 3) + 2
  const cliente = {
    chave: `K${from.getMonth()}`, cliente: 'Cliente', cidade: 'Caçapava', bairro: from.getMonth() % 2 ? 'VITÓRIA VALE' : 'VITORIA VALE',
    visitas: n, intervaloMedio: 5, diasDesdeUltima: 1, rows: Array.from({ length: n }, (_, i) => lin(`${from.getMonth()}${i}`)),
  } as unknown as ClienteReincidente
  return { janelaDias: 30, clientes: [cliente], totalReincidentes: 1, totalBase: 4, pctReincidencia: 25, baseClientes: [] }
}
const manut = vi.fn((_rows: unknown, _topo: unknown, _now: unknown, range: { from: Date }) => churnDoMes(range.from))
const instal = vi.fn((_rows: unknown, _topo: unknown, _now: unknown, range: { from: Date }) => churnDoMes(range.from))
vi.mock('../../lib/builders/churn', () => ({
  buildManutencaoRevisitaChurn: (...args: Parameters<typeof manut>) => manut(...args),
  buildInstallChurn: (...args: Parameters<typeof instal>) => instal(...args),
}))
const exportarPDF = vi.fn()
vi.mock('./reincidenciasComparativoPDF', () => ({ exportComparativoPDF: (...args: unknown[]) => exportarPDF(...args) }))

const { ReincidenciasComparativo } = await import('./ReincidenciasComparativo')

afterEach(cleanup)
beforeEach(() => { manut.mockClear(); instal.mockClear(); exportarPDF.mockClear() })

const ultimos3 = ultimosMeses(3).reverse()  // do mais antigo ao mais novo, como as colunas

describe('ReincidenciasComparativo', () => {
  it('abre com os 3 últimos meses, um por coluna, do mais antigo ao mais novo', () => {
    render(<ReincidenciasComparativo allRows={[]} />)
    const tabela = screen.getByRole('table')
    const cabecalhos = within(tabela).getAllByRole('columnheader').map(th => th.textContent)
    expect(cabecalhos).toEqual(['Bairro', 'Cidade', ...ultimos3.map(m => m.label), 'Total', 'Var.'])
  })

  it('o mesmo bairro, com e sem acento, fica numa linha só', () => {
    render(<ReincidenciasComparativo allRows={[]} />)
    const corpo = screen.getByRole('table').querySelector('tbody')!
    expect(within(corpo).getAllByRole('row')).toHaveLength(1)
    expect(within(corpo).getByRole('rowheader').textContent).toMatch(/VIT[OÓ]RIA VALE/)
  })

  it('o total do rodapé fecha com a soma da linha', () => {
    render(<ReincidenciasComparativo allRows={[]} />)
    const esperado = ultimos3.reduce((s, m) => s + (m.from.getMonth() % 3) + 2, 0)
    const rodape = screen.getByRole('table').querySelector('tfoot')!
    expect(within(rodape).getAllByRole('cell').map(c => c.textContent)).toContain(String(esperado))
  })

  it('desmarcar um mês tira a coluna dele', () => {
    render(<ReincidenciasComparativo allRows={[]} />)
    const grupo = screen.getByRole('group', { name: 'Meses para comparar' })
    fireEvent.click(within(grupo).getByRole('button', { name: new RegExp(`^${ultimos3[1].label}`) }))
    const cabecalhos = within(screen.getByRole('table')).getAllByRole('columnheader').map(th => th.textContent)
    expect(cabecalhos).not.toContain(ultimos3[1].label)
    expect(cabecalhos).toContain(ultimos3[0].label)
  })

  it('sem nenhum mês escolhido mostra o aviso e nenhuma tabela', () => {
    render(<ReincidenciasComparativo allRows={[]} />)
    const grupo = screen.getByRole('group', { name: 'Meses para comparar' })
    ultimos3.forEach(m => fireEvent.click(within(grupo).getByRole('button', { name: new RegExp(`^${m.label}`) })))
    expect(screen.getByText(/Escolha pelo menos um mês/)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('"Últimos 6" seleciona seis colunas', () => {
    render(<ReincidenciasComparativo allRows={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Últimos 6' }))
    const meses = within(screen.getByRole('table')).getAllByRole('columnheader').filter(th => /^[A-Z]{3}\/\d{2}$/.test(th.textContent ?? ''))
    expect(meses).toHaveLength(6)
  })

  it('trocar para instalação usa a regra de instalação', () => {
    render(<ReincidenciasComparativo allRows={[]} />)
    expect(instal).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Tipo de revisita'), { target: { value: 'instalacao' } })
    expect(instal).toHaveBeenCalled()
    expect(screen.getByText(/instalados no mês anterior/)).toBeTruthy()
  })

  it('cada mês é calculado sobre o mês civil inteiro', () => {
    render(<ReincidenciasComparativo allRows={[]} />)
    const faixas = manut.mock.calls.map(c => c[3] as { from: Date; to: Date })
    const mes = ultimos3[0]
    expect(faixas.some(f => f.from.getTime() === mes.from.getTime() && f.to.getTime() === mes.to.getTime())).toBe(true)
  })

  it('a métrica taxa tira a coluna de total', () => {
    render(<ReincidenciasComparativo allRows={[]} />)
    fireEvent.change(screen.getByLabelText('Valor mostrado'), { target: { value: 'taxa' } })
    const cabecalhos = within(screen.getByRole('table')).getAllByRole('columnheader').map(th => th.textContent)
    expect(cabecalhos).not.toContain('Total')
    expect(cabecalhos).toContain('Var. (pp)')
  })

  it('exportar PDF entrega a tabela, o tipo e os filtros', () => {
    render(<ReincidenciasComparativo allRows={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }))
    expect(exportarPDF).toHaveBeenCalledTimes(1)
    const [tabela, opcoes] = exportarPDF.mock.calls[0] as [{ colunas: unknown[] }, { tipo: string; filtros: string[] }]
    expect(tabela.colunas).toHaveLength(3)
    expect(opcoes.tipo).toBe('Revisita de manutenção')
    expect(opcoes.filtros).toContain('Todas as terceiras')
  })

  it('exportar Excel baixa um CSV', () => {
    const criar = vi.fn(() => 'blob:csv')
    Object.assign(URL, { createObjectURL: criar, revokeObjectURL: vi.fn() })
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<ReincidenciasComparativo allRows={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Excel/ }))
    expect(criar).toHaveBeenCalledTimes(1)
    expect(clique).toHaveBeenCalled()
    clique.mockRestore()
  })
})
