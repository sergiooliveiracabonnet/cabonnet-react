import type { CidadeSaude, OSRow } from '../types'

export type CidadeTipoFilter = 'TODOS' | 'INSTALACAO' | 'MANUTENCAO' | 'OUTRO'

export function filterCidadesRows(rows: OSRow[], cidade: string, tipo: CidadeTipoFilter): OSRow[] {
  return rows.filter(row => {
    if (cidade && (row.nomedacidade || '').trim() !== cidade) return false
    if (tipo === 'TODOS') return row._tipo !== 'REDE'
    if (tipo === 'OUTRO') return row._tipo !== 'INSTALACAO' && row._tipo !== 'MANUTENCAO' && row._tipo !== 'REDE'
    return row._tipo === tipo
  })
}

export function buildCidadesExecutiveSummary(saude: CidadeSaude[]) {
  const comFila = saude.filter(item => item.fila > 0)
  const prioritaria = [...comFila].sort((a, b) => {
    if (a.backlogDias == null && b.backlogDias != null) return -1
    if (a.backlogDias != null && b.backlogDias == null) return 1
    return (b.backlogDias ?? 0) - (a.backlogDias ?? 0) || b.criticas - a.criticas
  })[0] ?? null

  return {
    prioritaria,
    acumulando: comFila.filter(item => item.deltaShare >= 5).length,
    criticas: comFila.reduce((total, item) => total + item.criticas, 0),
    semEquipe: comFila.reduce((total, item) => total + item.semEq, 0),
  }
}
