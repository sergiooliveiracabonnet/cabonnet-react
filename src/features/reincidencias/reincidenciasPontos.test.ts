import { describe, expect, it } from 'vitest'
import type { ClienteReincidente } from '../../lib/builders/churn'
import type { OSRow } from '../../lib/types'
import { agruparPorCelula, bairroDominante, extrairCoordenadas, limitesDosPontos, paraCamadaDeCalor, pontosDasRevisitas } from './reincidenciasPontos'

const texto = (lat: string, lng: string) =>
  `Informações da Execução:\nObs:SEM DANOS\nNome Executante: T-THIAGO\n\n\nLOCALIZAÇÃO\n\nLatitude Inicio: ${lat}\nLongitude Inicio: ${lng}\nLatitude Fim: -22.9845031\nLongitute Fim: -45.5419546`

describe('extrairCoordenadas', () => {
  it('lê a latitude e a longitude de início da visita', () => {
    expect(extrairCoordenadas(texto('-22.98465', '-45.5419971'))).toEqual({ lat: -22.98465, lng: -45.5419971 })
  })

  it('aceita vírgula decimal e "Início" com acento', () => {
    expect(extrairCoordenadas('Latitude Início: -23,0051167 Longitude Início: -45,5637333')).toEqual({ lat: -23.0051167, lng: -45.5637333 })
  })

  it('ignora a posição final: só o início da visita conta', () => {
    expect(extrairCoordenadas('Latitude Fim: -22.9 Longitute Fim: -45.5')).toBeNull()
  })

  it('texto sem localização devolve null', () => {
    expect(extrairCoordenadas('cliente sem sinal, trocado conector')).toBeNull()
    expect(extrairCoordenadas('')).toBeNull()
    expect(extrairCoordenadas(null)).toBeNull()
    expect(extrairCoordenadas(undefined)).toBeNull()
  })

  it('descarta GPS fora do Vale do Paraíba (0,0, trocado, outro estado)', () => {
    expect(extrairCoordenadas(texto('0.0', '0.0'))).toBeNull()
    expect(extrairCoordenadas(texto('-45.54', '-22.98'))).toBeNull()      // lat e lng trocadas
    expect(extrairCoordenadas(texto('-21.68', '-51.07'))).toBeNull()      // Adamantina
    expect(extrairCoordenadas(texto('-22.98', '-45.54'))).not.toBeNull()
  })
})

const os = (numos: string, obs: string): OSRow => ({ numos, observacoes: obs }) as unknown as OSRow
const cli = (chave: string, rows: OSRow[]): ClienteReincidente => ({
  chave, cliente: chave, cidade: 'Taubaté', bairro: 'CENTRO', visitas: rows.length, intervaloMedio: 5, diasDesdeUltima: 1, rows,
})

describe('pontosDasRevisitas', () => {
  it('um ponto por OS com GPS e a cobertura sobre o total de OS envolvidas', () => {
    const { pontos, cobertura } = pontosDasRevisitas([
      cli('A', [os('1', texto('-23.0', '-45.55')), os('2', texto('-23.0', '-45.55'))]),
      cli('B', [os('3', 'sem gps'), os('4', texto('-22.95', '-45.50'))]),
    ])
    expect(pontos.map(p => p.numos)).toEqual(['1', '2', '4'])
    expect(pontos.map(p => p.clienteChave)).toEqual(['A', 'A', 'B'])
    expect(cobertura).toEqual({ comLocalizacao: 3, total: 4 })
  })

  it('usa a observação crítica quando a observação principal vem vazia', () => {
    const row = { numos: '9', observacoes: '', observacaocritica: texto('-23.0', '-45.55') } as unknown as OSRow
    expect(pontosDasRevisitas([cli('A', [row])]).pontos).toHaveLength(1)
  })

  it('sem clientes não há pontos nem cobertura', () => {
    expect(pontosDasRevisitas([])).toEqual({ pontos: [], cobertura: { comLocalizacao: 0, total: 0 } })
  })
})

describe('agruparPorCelula', () => {
  const p = (numos: string, lat: number, lng: number, cliente = 'A') => ({ numos, lat, lng, clienteChave: cliente })

  it('junta as OS do mesmo quarteirão e soma o peso', () => {
    const q = agruparPorCelula([p('1', -23.0001, -45.5001), p('2', -23.0002, -45.5002, 'B'), p('3', -23.0003, -45.5003, 'A')])
    expect(q).toHaveLength(1)
    expect(q[0].n).toBe(3)
    expect(q[0].clientes.sort()).toEqual(['A', 'B'])
    expect(q[0].numos).toEqual(['1', '2', '3'])
  })

  it('o centro do ponto é a média das coordenadas reais', () => {
    const [q] = agruparPorCelula([p('1', -23.0001, -45.5001), p('2', -23.0003, -45.5003)])
    expect(q.lat).toBeCloseTo(-23.0002, 6)
    expect(q.lng).toBeCloseTo(-45.5002, 6)
  })

  it('pontos distantes ficam em células diferentes, ordenadas do mais quente', () => {
    const q = agruparPorCelula([p('1', -23.00, -45.50), p('2', -23.00, -45.50), p('3', -22.90, -45.40)])
    expect(q.map(x => x.n)).toEqual([2, 1])
  })

  it('a soma dos pesos é o total de pontos', () => {
    const pontos = Array.from({ length: 25 }, (_, i) => p(String(i), -23 + (i % 5) * 0.01, -45.5 + Math.floor(i / 5) * 0.01))
    expect(agruparPorCelula(pontos).reduce((s, x) => s + x.n, 0)).toBe(25)
  })

  it('camada de calor recebe [lat, lng, peso]', () => {
    expect(paraCamadaDeCalor([{ lat: -23, lng: -45.5, n: 3, clientes: ['A'], numos: ['1', '2', '3'] }])).toEqual([[-23, -45.5, 3]])
  })
})

describe('limitesDosPontos e bairroDominante', () => {
  it('enquadra todos os pontos', () => {
    expect(limitesDosPontos([{ lat: -23.0, lng: -45.6 }, { lat: -22.9, lng: -45.4 }])).toEqual([[-23.0, -45.6], [-22.9, -45.4]])
  })

  it('sem pontos, mostra o Vale', () => {
    const [[a], [b]] = limitesDosPontos([])
    expect(a).toBeLessThan(b)
  })

  it('o bairro dominante é o mais frequente entre os clientes do ponto', () => {
    const mapa = new Map([['A', 'CENTRO'], ['B', 'CENTRO'], ['C', 'VILA']])
    expect(bairroDominante(['A', 'B', 'C'], mapa)).toBe('CENTRO')
    expect(bairroDominante(['Z'], mapa)).toBeNull()
  })
})
