import type { OSRow } from '../../../lib/types'
import { isExecucaoReal, isFilaAtiva, parseDate } from '../../../lib/transform'
import { shortEquipe } from '../../../lib/osFormat'

export interface ReportFilters {
  period?: 'all' | '7d' | '30d'
  dateField?: 'datacadastro' | 'dataagendamento' | 'dataexecucao'
  tipo?: string
  cidade?: string
  equipe?: string
  situacao?: string
}

export function filterReportRows(rows: OSRow[], filters: ReportFilters, now = new Date()) {
  const since = filters.period === '7d' ? 7 : filters.period === '30d' ? 30 : null
  const lower = since == null ? null : new Date(now.getFullYear(), now.getMonth(), now.getDate() - since + 1)
  const upper = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  const field = filters.dateField ?? 'datacadastro'
  return rows.filter(row => {
    if (filters.tipo && row._tipo !== filters.tipo) return false
    if (filters.cidade && row.nomedacidade.trim() !== filters.cidade) return false
    if (filters.equipe && shortEquipe(row.nomedaequipe).split(' - ')[0].trim() !== filters.equipe) return false
    if (filters.situacao && row.descsituacao !== filters.situacao) return false
    if (lower) {
      const raw = field === 'dataexecucao' ? (row.dataexecucao || row.databaixa) : row[field]
      const date = parseDate(raw)
      if (!date || date < lower || date > upper) return false
    }
    return true
  })
}

export function buildReportMetrics(rows: OSRow[]) {
  const active = rows.filter(row => isFilaAtiva(row.descsituacao))
  const executed = rows.filter(row => isExecucaoReal(row.descsituacao))
  const production = { total: executed.length, instalacao: 0, manutencao: 0, servico: 0, rede: 0 }
  executed.forEach(row => {
    if (row._tipo === 'INSTALACAO') production.instalacao++
    else if (row._tipo === 'MANUTENCAO') production.manutencao++
    else if (row._tipo === 'REDE') production.rede++
    else production.servico++
  })
  const slaVencido = active.filter(row => row._slaExcedido || row._slaSemAgend).length
  const aging = active.flatMap(row => row._agingAbertura == null ? [] : [row._agingAbertura])
  return {
    total: rows.length,
    active,
    executed,
    production,
    slaVencido,
    semEquipe: active.filter(row => !row.nomedaequipe?.trim()).length,
    agingMedio: aging.length ? aging.reduce((sum, value) => sum + value, 0) / aging.length : 0,
    slaFilaPct: active.length ? Math.round((active.length - slaVencido) / active.length * 100) : 0,
  }
}
