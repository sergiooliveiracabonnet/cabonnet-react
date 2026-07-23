import { getFornecedor } from '../transform'
import type { Fornecedor } from '../types'
import type { BacklogData, BacklogRow } from '../../hooks/useBacklog'

export interface BiTecnicaFiltros {
  cidade:     string
  fornecedor: string
  equipe:     string
}

export const FILTROS_VAZIOS: BiTecnicaFiltros = { cidade: '', fornecedor: '', equipe: '' }

export function opcoesCidade(rows: BacklogRow[]): string[] {
  return [...new Set(rows.map(r => r.nomedacidade).filter(Boolean))].sort()
}

export function opcoesFornecedor(rows: BacklogRow[]): Fornecedor[] {
  return [...new Set(rows.map(r => getFornecedor(r.nomedaequipe)))].sort()
}

export function opcoesEquipe(rows: BacklogRow[]): string[] {
  return [...new Set(rows.map(r => r.nomedaequipe).filter(Boolean))].sort()
}

export function filtrarBacklogRows(data: BacklogData, filtros: BiTecnicaFiltros): BacklogData {
  const rows = data.rows.filter(r =>
    (!filtros.cidade     || r.nomedacidade === filtros.cidade) &&
    (!filtros.fornecedor || getFornecedor(r.nomedaequipe) === filtros.fornecedor) &&
    (!filtros.equipe     || r.nomedaequipe === filtros.equipe)
  )
  return { ...data, rows, kpis: { ...data.kpis, total: rows.length } }
}
