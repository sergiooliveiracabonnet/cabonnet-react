import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CIDADES_ATENDIDAS, CLUSTERS, CLUSTER_DE_CIDADE, CLUSTER_KEYS,
  cidadesDoFiltro, clusterDaCidade, clusterDaEquipe, isCidadeValida, matchesCluster, normCity,
} from './clusters'

/**
 * O front tem cópia do mapa de clusters. A cópia equivalente do mapa de
 * operadoras já ficou para trás uma vez e o Fechamento saiu sem três frentes.
 * Em vez de repetir as cidades aqui — o que só criaria mais uma cópia para
 * dessincronizar — o teste lê o CLUSTERS do backend, que é a fonte da verdade.
 */
function clustersDoBackend(): Record<string, { cidades: Record<string, string>; operadoras: string[]; prefixo: string }> {
  const py = readFileSync('cabonnet/config.py', 'utf8')
  const bloco = py.slice(py.indexOf('CLUSTERS = {'), py.indexOf('# Grafias alternativas'))
  const saida: Record<string, { cidades: Record<string, string>; operadoras: string[]; prefixo: string }> = {}
  for (const m of bloco.matchAll(/^ {4}"(\w+)": \{$/gm)) {
    const inicio = m.index as number
    const proximo = bloco.indexOf('\n    "', inicio + 1)
    const corpo = bloco.slice(inicio, proximo === -1 ? undefined : proximo)
    const cidades: Record<string, string> = {}
    const trechoCidades = corpo.slice(corpo.indexOf('"cidades"'), corpo.indexOf('"operadoras"'))
    for (const c of trechoCidades.matchAll(/"([A-Z ]+)":\s*"([^"]+)"/g)) {
      if (c[1] !== 'cidades') cidades[c[1]] = c[2]
    }
    saida[m[1]] = {
      cidades,
      operadoras: [...(corpo.match(/"operadoras":\s*\[([^\]]+)\]/)?.[1] ?? '').matchAll(/"(\w+)"/g)].map(o => o[1]),
      prefixo: corpo.match(/"prefixo_equipe":\s*"([^"]+)"/)?.[1] ?? '',
    }
  }
  return saida
}

describe('espelho de CLUSTERS contra o backend', () => {
  const backend = clustersDoBackend()

  it('encontrou os dois clusters no config.py', () => {
    expect(Object.keys(backend).sort()).toEqual(['ADAMANTINA', 'VALE'])
  })

  it('tem exatamente os mesmos clusters do backend', () => {
    expect([...CLUSTER_KEYS].sort()).toEqual(Object.keys(backend).sort())
  })

  for (const key of ['VALE', 'ADAMANTINA'] as const) {
    it(`${key}: cidades, nomes de exibição, prefixo e operadoras batem com o backend`, () => {
      expect(CLUSTERS[key].cidades).toEqual(backend[key].cidades)
      expect(CLUSTERS[key].operadoras).toEqual(backend[key].operadoras)
      expect(CLUSTERS[key].prefixoEquipe).toBe(backend[key].prefixo)
    })
  }
})

describe('clusterDaCidade', () => {
  it('resolve as 12 cidades atendidas', () => {
    expect(Object.keys(CIDADES_ATENDIDAS)).toHaveLength(12)
    expect(Object.keys(CLUSTERS.VALE.cidades)).toHaveLength(5)
    expect(Object.keys(CLUSTERS.ADAMANTINA.cidades)).toHaveLength(7)
  })

  it('ignora acento e caixa', () => {
    expect(clusterDaCidade('Lucélia')).toBe('ADAMANTINA')
    expect(clusterDaCidade('  taubaté ')).toBe('VALE')
    expect(clusterDaCidade('Mariápolis')).toBe('ADAMANTINA')
  })

  it('aceita as grafias alternativas de São José dos Campos', () => {
    expect(clusterDaCidade('SAO JOSE')).toBe('VALE')
    expect(clusterDaCidade('SJCAMPOS')).toBe('VALE')
  })

  it('é Osvaldo com V, como está no ERP — não Oswaldo', () => {
    expect(clusterDaCidade('Osvaldo Cruz')).toBe('ADAMANTINA')
    expect(clusterDaCidade('Oswaldo Cruz')).toBeNull()
  })

  it('rejeita cidade de fora do recorte', () => {
    expect(clusterDaCidade('Presidente Prudente')).toBeNull()
    expect(isCidadeValida('Jacareí')).toBe(false)
  })
})

describe('matchesCluster', () => {
  it('TODOS aceita qualquer cidade atendida e nada além', () => {
    expect(matchesCluster('Taubaté', 'TODOS')).toBe(true)
    expect(matchesCluster('Adamantina', 'TODOS')).toBe(true)
    expect(matchesCluster('Presidente Prudente', 'TODOS')).toBe(false)
  })

  it('isola um cluster do outro', () => {
    expect(matchesCluster('Taubaté', 'VALE')).toBe(true)
    expect(matchesCluster('Taubaté', 'ADAMANTINA')).toBe(false)
    expect(matchesCluster('Lucélia', 'ADAMANTINA')).toBe(true)
    expect(matchesCluster('Lucélia', 'VALE')).toBe(false)
  })
})

describe('clusterDaEquipe', () => {
  it('separa pelo prefixo, não pelo número da frente', () => {
    // As duas são "F01": sem o prefixo, Adamantina cairia na lista do Vale.
    expect(clusterDaEquipe('03- VAL - INSTALACAO F01')).toBe('VALE')
    expect(clusterDaEquipe('05 - ADA - INSTALACAO F 01')).toBe('ADAMANTINA')
  })

  it('cobre as demais formas de equipe de Adamantina', () => {
    expect(clusterDaEquipe('05 - ADA - MANUTENCAO F 07')).toBe('ADAMANTINA')
    expect(clusterDaEquipe('05 - ADA - INSTALACAO FCT 05')).toBe('ADAMANTINA')
    expect(clusterDaEquipe('05 - ADA - REDE F 01')).toBe('ADAMANTINA')
    expect(clusterDaEquipe('05 - ADA - RETIRADA 01')).toBe('ADAMANTINA')
  })

  it('devolve null para equipe sem prefixo de cluster', () => {
    expect(clusterDaEquipe('COPE - INSTALACAO')).toBeNull()
    expect(clusterDaEquipe('01 - TUP - RETIRADA')).toBeNull()
    expect(clusterDaEquipe('')).toBeNull()
    expect(clusterDaEquipe(null)).toBeNull()
  })
})

describe('helpers de exibição', () => {
  it('normCity remove acento, caixa e espaço', () => {
    expect(normCity(' Inúbia Paulista ')).toBe('INUBIA PAULISTA')
  })

  it('cidadesDoFiltro devolve os nomes de exibição do recorte', () => {
    expect(cidadesDoFiltro('ADAMANTINA')).toContain('Flórida Paulista')
    expect(cidadesDoFiltro('ADAMANTINA')).not.toContain('Taubaté')
    expect(cidadesDoFiltro('TODOS')).toHaveLength(12)
  })

  it('CLUSTER_DE_CIDADE cobre canônicas e aliases', () => {
    expect(Object.keys(CLUSTER_DE_CIDADE)).toHaveLength(14)
  })
})
