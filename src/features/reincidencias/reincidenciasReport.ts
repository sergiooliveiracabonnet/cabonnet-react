import type { ClienteReincidente } from '../../lib/builders/churn'
import { parseDateTime } from '../../lib/transform'
import type { OSRow } from '../../lib/types'
import { shortEquipe } from '../../lib/osFormat'

export interface ReincidenciaFilters { fornecedor: string; equipe: string }

export function getOSObservation(row: OSRow): string {
  const value = row.observacoes || row.obs || row.observacao || row.nota || row.descricaoobs || row.descricao_obs
  return String(value || '').trim() || 'Sem observação registrada'
}

export function executionDate(row: OSRow): Date | null {
  return parseDateTime(row.dataexecucao || row.databaixa || '')
}

export function sortedClientRows(rows: OSRow[]): OSRow[] {
  return [...rows].sort((a, b) => (executionDate(a)?.getTime() ?? 0) - (executionDate(b)?.getTime() ?? 0))
}

export function filterReincidentes(clientes: ClienteReincidente[], filters: ReincidenciaFilters): ClienteReincidente[] {
  return clientes.filter(cliente => {
    const fornecedorOk = !filters.fornecedor || cliente.rows.some(row => row._fornecedor === filters.fornecedor)
    const equipeOk = !filters.equipe || cliente.rows.some(row => shortEquipe(row.nomedaequipe).startsWith(filters.equipe))
    return fornecedorOk && equipeOk
  })
}

export interface ReincidenciaPair {
  tipo: string; nomecliente: string; nomedacidade: string
  numos_orig: string; servico_orig: string; obs_orig: string
  numos_rev: string; servico_rev: string; obs_rev: string; dias_entre: number
}

export function buildReincidenciaPairs(clientes: ClienteReincidente[]): ReincidenciaPair[] {
  return clientes.flatMap(cliente => {
    const rows = sortedClientRows(cliente.rows)
    return rows.slice(1).map((current, index) => {
      const previous = rows[index]
      const prevDate = executionDate(previous)?.getTime() ?? 0
      const currDate = executionDate(current)?.getTime() ?? 0
      return {
        tipo: 'manutencao', nomecliente: cliente.cliente, nomedacidade: cliente.cidade,
        numos_orig: previous.numos, servico_orig: String(previous.servico || previous.tiposervico || ''), obs_orig: getOSObservation(previous),
        numos_rev: current.numos, servico_rev: String(current.servico || current.tiposervico || ''), obs_rev: getOSObservation(current),
        dias_entre: Math.max(0, Math.round((currDate - prevDate) / 86400000)),
      }
    })
  })
}
