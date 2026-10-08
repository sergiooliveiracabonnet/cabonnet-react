import { describe, expect, it } from 'vitest'
import type { ClienteBase, ClienteReincidente } from '../../lib/builders/churn'
import type { OSRow } from '../../lib/types'
import { formatarValor, formatarVariacao, montarTabela, tabelaParaCSV, ultimosMeses, valorCelula } from './reincidenciasMatriz'
import { buildBairroComparativo } from './reincidenciasReport'

const lin = (numos: string) => ({ numos, nomedaequipe: '03- VAL - INSTALACAO F11', dataexecucao: '10/09/2026', databaixa: '10/09/2026' }) as unknown as OSRow
const c = (chave: string, bairro: string, n: number) => ({
  chave, cliente: `Cliente ${chave}`, cidade: 'Caçapava', bairro, visitas: n, intervaloMedio: 5, diasDesdeUltima: 1,
  rows: Array.from({ length: n }, (_, i) => lin(`${chave}${i}`)),
}) as unknown as ClienteReincidente
const at = (chave: string, bairro: string) => ({ chave, cliente: chave, cidade: 'Caçapava', bairro, rows: [lin(chave)] }) as unknown as ClienteBase

const comp = buildBairroComparativo([
  { id: '2026-08', label: 'AGO/26', clientes: [c('A', 'VITORIA VALE', 2), c('B', 'CENTRO', 3)], base: [at('A', 'VITORIA VALE'), at('x', 'VITORIA VALE'), at('B', 'CENTRO')] },
  { id: '2026-09', label: 'SET/26', clientes: [c('C', 'VITÓRIA VALE', 5)], base: [at('C', 'VITÓRIA VALE'), at('y', 'VITÓRIA VALE'), at('z', 'VITÓRIA VALE'), at('w', 'VITÓRIA VALE')] },
])

describe('ultimosMeses', () => {
  it('lista do mês corrente para trás, com rótulo e o primeiro como parcial', () => {
    const m = ultimosMeses(4, new Date(2026, 9, 7))
    expect(m.map(x => x.label)).toEqual(['OUT/26', 'SET/26', 'AGO/26', 'JUL/26'])
    expect(m.map(x => x.id)).toEqual(['2026-10', '2026-09', '2026-08', '2026-07'])
    expect(m[0].parcial).toBe(true)
    expect(m[1].parcial).toBe(false)
  })

  it('cada mês vai do dia 1 ao último dia (fevereiro e virada de ano)', () => {
    const m = ultimosMeses(3, new Date(2026, 1, 15))
    expect(m[0].to).toEqual(new Date(2026, 1, 28))
    expect(m[2].label).toBe('DEZ/25')
    expect(m[2].from).toEqual(new Date(2025, 11, 1))
    expect(m[2].to).toEqual(new Date(2025, 11, 31))
  })
})

describe('montarTabela', () => {
  it('OS: um valor por mês, total e variação do primeiro ao último mês', () => {
    const t = montarTabela(comp, 'os')
    const vv = t.linhas.find(l => l.bairro === 'VITÓRIA VALE')!
    expect(vv.valores).toEqual([2, 5])
    expect(vv.total).toBe(7)
    expect(vv.variacao).toBe(3)
    expect(t.totais).toEqual([5, 5])
    expect(t.totalGeral).toBe(10)
    expect(t.maximo).toBe(5)
  })

  it('clientes: conta clientes distintos por mês', () => {
    const t = montarTabela(comp, 'clientes')
    expect(t.linhas.find(l => l.bairro === 'VITÓRIA VALE')!.valores).toEqual([1, 1])
    expect(t.linhas.find(l => l.bairro === 'CENTRO')!.valores).toEqual([1, 0])
  })

  it('taxa: percentual por mês, sem total e com variação em pontos', () => {
    const t = montarTabela(comp, 'taxa')
    const vv = t.linhas.find(l => l.bairro === 'VITÓRIA VALE')!
    expect(vv.valores).toEqual([50, 25])
    expect(vv.total).toBeNull()
    expect(vv.variacao).toBe(-25)
    expect(t.totalGeral).toBeNull()
  })

  it('a soma das linhas fecha com o total de cada mês', () => {
    const t = montarTabela(comp, 'os')
    t.colunas.forEach((_, i) => expect(t.linhas.reduce((s, l) => s + (l.valores[i] ?? 0), 0)).toBe(t.totais[i]))
  })

  it('valorCelula devolve null para taxa sem base', () => {
    expect(valorCelula({ nOS: 3, nClientes: 1, nBase: 0, taxa: null }, 'taxa')).toBeNull()
  })
})

describe('formatação', () => {
  it('valor: inteiro para contagens e percentual com vírgula', () => {
    expect(formatarValor(7, 'os')).toBe('7')
    expect(formatarValor(12.5, 'taxa')).toBe('12,5%')
    expect(formatarValor(null, 'taxa')).toBe('—')
  })

  it('variação com sinal ASCII e pp na taxa', () => {
    expect(formatarVariacao(3, 'os')).toBe('+3')
    expect(formatarVariacao(-2, 'clientes')).toBe('-2')
    expect(formatarVariacao(0, 'os')).toBe('0')
    expect(formatarVariacao(1.5, 'taxa')).toBe('+1,5 pp')
    expect(formatarVariacao(null, 'os')).toBe('')
  })
})

describe('tabelaParaCSV', () => {
  it('abre com BOM, usa ; e vírgula decimal, e traz uma linha por bairro e o total', () => {
    const csv = tabelaParaCSV(montarTabela(comp, 'os'), 'Revisita de manutenção')
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
    const linhas = csv.slice(1).trim().split('\r\n')
    expect(linhas[0]).toBe('Revisita de manutenção — comparativo mensal por bairro')
    expect(linhas).toContain('Bairro;Cidade;AGO/26;SET/26;Total;Variação')
    expect(linhas).toContain('VITÓRIA VALE;Caçapava;2;5;7;3')
    expect(linhas[linhas.length - 1]).toBe('Total;;5;5;10;0')
  })

  it('taxa sai com vírgula e sem coluna de total', () => {
    const linhas = tabelaParaCSV(montarTabela(comp, 'taxa'), 'Revisita de manutenção').slice(1).trim().split('\r\n')
    expect(linhas).toContain('Bairro;Cidade;AGO/26;SET/26;Variação (pp)')
    expect(linhas).toContain('VITÓRIA VALE;Caçapava;50;25;-25')
  })

  it('protege campos com ponto e vírgula ou aspas', () => {
    const estranho = buildBairroComparativo([{ id: '2026-09', label: 'SET/26', clientes: [c('A', 'BAIRRO "ALFA"; BETA', 2)] }])
    const csv = tabelaParaCSV(montarTabela(estranho, 'os'), 'Revisita de manutenção')
    expect(csv).toContain('"BAIRRO ""ALFA""; BETA"')
  })
})
