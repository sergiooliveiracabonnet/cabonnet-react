/**
 * Clusters regionais — espelho de CLUSTERS em cabonnet/config.py.
 *
 * O ERP é multi-operação (9.705 cidades cadastradas, das quais só estas são
 * Cabonnet), então a lista de cidades é o que recorta o que entra no app.
 *
 * clusters.test.ts lê o config.py e trava este arquivo contra ele — o mapa de
 * operadoras já dessincronizou no passado e as abas do Fechamento passaram a
 * excluir frentes em silêncio. Não repetir aqui.
 */

export type ClusterKey = 'VALE' | 'ADAMANTINA'
export type ClusterFilter = ClusterKey | 'TODOS'

export interface Cluster {
  label: string
  /** Prefixo que identifica as equipes do cluster em `nomedaequipe`. */
  prefixoEquipe: string
  /** chave normalizada (sem acento, maiúscula) → nome de exibição */
  cidades: Record<string, string>
  operadoras: string[]
}

export const CLUSTERS: Record<ClusterKey, Cluster> = {
  VALE: {
    label: 'Vale do Paraíba',
    prefixoEquipe: '- VAL -',
    cidades: {
      'SAO JOSE DOS CAMPOS': 'São José dos Campos',
      'CACAPAVA': 'Caçapava',
      'TAUBATE': 'Taubaté',
      'TREMEMBE': 'Tremembé',
      'PINDAMONHANGABA': 'Pindamonhangaba',
    },
    operadoras: ['INSTACABLE', 'WES', 'THM'],
  },
  ADAMANTINA: {
    label: 'Adamantina',
    prefixoEquipe: '- ADA -',
    cidades: {
      'ADAMANTINA': 'Adamantina',
      'OSVALDO CRUZ': 'Osvaldo Cruz',
      'LUCELIA': 'Lucélia',
      'MARIAPOLIS': 'Mariápolis',
      'INUBIA PAULISTA': 'Inúbia Paulista',
      'FLORIDA PAULISTA': 'Flórida Paulista',
      'PACAEMBU': 'Pacaembu',
    },
    operadoras: ['ADA'],
  },
}

/** Grafias alternativas que o ERP devolve, por cidade canônica. */
export const CIDADE_ALIASES: Record<string, string[]> = {
  'SAO JOSE DOS CAMPOS': ['SAO JOSE', 'SJCAMPOS'],
}

export const CLUSTER_KEYS = Object.keys(CLUSTERS) as ClusterKey[]

export const normCity = (value: string): string =>
  (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()

/** chave normalizada → cluster, incluindo os aliases. */
export const CLUSTER_DE_CIDADE: Record<string, ClusterKey> = (() => {
  const mapa: Record<string, ClusterKey> = {}
  for (const key of CLUSTER_KEYS) {
    for (const cidade of Object.keys(CLUSTERS[key].cidades)) mapa[cidade] = key
  }
  for (const [canonica, alternativas] of Object.entries(CIDADE_ALIASES)) {
    for (const alias of alternativas) mapa[alias] = mapa[canonica]
  }
  return mapa
})()

/** chave normalizada → nome de exibição (só as canônicas). */
export const CIDADES_ATENDIDAS: Record<string, string> = Object.fromEntries(
  CLUSTER_KEYS.flatMap(key => Object.entries(CLUSTERS[key].cidades)),
)

export const clusterDaCidade = (cidade: string): ClusterKey | null =>
  CLUSTER_DE_CIDADE[normCity(cidade)] ?? null

export const isCidadeValida = (cidade: string): boolean => clusterDaCidade(cidade) !== null

/** Filtro do seletor global. 'TODOS' não descarta nada de cidade atendida. */
export const matchesCluster = (cidade: string, filtro: ClusterFilter): boolean =>
  filtro === 'TODOS' ? isCidadeValida(cidade) : clusterDaCidade(cidade) === filtro

/**
 * Cluster pelo prefixo da equipe. As frentes se repetem entre clusters
 * (o Vale tem F01 e Adamantina tem F 01), então o prefixo é o que distingue —
 * nunca o número da frente sozinho.
 */
export function clusterDaEquipe(nomedaequipe: string | null | undefined): ClusterKey | null {
  const equipe = (nomedaequipe || '').toUpperCase()
  for (const key of CLUSTER_KEYS) {
    if (equipe.includes(CLUSTERS[key].prefixoEquipe)) return key
  }
  return null
}

export const clusterLabel = (filtro: ClusterFilter): string =>
  filtro === 'TODOS' ? 'Todos os clusters' : CLUSTERS[filtro].label

/** Nomes de exibição das cidades do recorte, para rodapés e prompts. */
export const cidadesDoFiltro = (filtro: ClusterFilter): string[] =>
  (filtro === 'TODOS' ? CLUSTER_KEYS : [filtro]).flatMap(key => Object.values(CLUSTERS[key].cidades))
