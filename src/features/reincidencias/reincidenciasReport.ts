import type { ClienteReincidente } from '../../lib/builders/churn'
import { isCOPE, isExecucaoReal, isReagend, parseDate, parseDateTime } from '../../lib/transform'
import type { OSRow } from '../../lib/types'
import { shortEquipe } from '../../lib/osFormat'

export interface ReincidenciaFilters { fornecedor: string; equipe: string }

export function summarizeOSObservation(raw: string): string {
  const text = raw.replace(/\r\n?/g, '\n').trim()
  if (!text) return ''

  const isStructured = /Informações da Execução:|\bProcedimentos:|\bLOCALIZAÇÃO\b|\([X ]\)/i.test(text)
  if (!isStructured) return text

  const firstBlock = text.split(/\n\s*\n/).map(block => block.trim()).find(Boolean) || ''
  const execution = text.match(/Informações da Execução:\s*[\s\S]*?\bObs:\s*([^\n]*)(?:\n|$)/i)?.[1]?.trim() || ''
  const parts = []
  if (firstBlock) parts.push(`Motivo da abertura: ${firstBlock.replace(/\s+/g, ' ')}`)
  if (execution) parts.push(`O que foi feito: ${execution}`)
  return parts.join('\n') || 'Sem informação essencial registrada'
}

export function getOSObservation(row: OSRow): string {
  const value = row.observacoes || row.observacaocritica || row.obs || row.observacao || row.nota || row.descricaoobs || row.descricao_obs
  return summarizeOSObservation(String(value || '')) || 'Sem observação registrada'
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

export function mergeOSObservations(clientes: ClienteReincidente[], details: Record<string, { observacoes: string; observacaocritica: string }> = {}): ClienteReincidente[] {
  return clientes.map(cliente => ({
    ...cliente,
    rows: cliente.rows.map(row => ({ ...row, ...(details[row.numos] || {}) })),
  }))
}

export interface ReincidenciaPair {
  tipo: string; nomecliente: string; nomedacidade: string
  chave_cliente: string; equipe_orig: string; equipe_rev: string
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
        chave_cliente: cliente.chave, equipe_orig: shortEquipe(previous.nomedaequipe).split(' - ')[0], equipe_rev: shortEquipe(current.nomedaequipe).split(' - ')[0],
        numos_orig: previous.numos, servico_orig: String(previous.servico || previous.tiposervico || ''), obs_orig: getOSObservation(previous),
        numos_rev: current.numos, servico_rev: String(current.servico || current.tiposervico || ''), obs_rev: getOSObservation(current),
        dias_entre: Math.max(0, Math.round((currDate - prevDate) / 86400000)),
      }
    })
  })
}

export interface TeamRecurrenceRank {
  equipe: string; reincidentes: number; revisitas: number; base: number; taxa: number
}

export function buildTeamRecurrenceRanking(clientes: ClienteReincidente[], baseRows: OSRow[], now = new Date()): TeamRecurrenceRank[] {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  cutoff.setDate(cutoff.getDate() - 60)
  const baseByTeam = new Map<string, Set<string>>()
  for (const row of baseRows) {
    if (isCOPE(row) || isReagend(row) || row._tipo !== 'MANUTENCAO' || !isExecucaoReal(row.descsituacao)) continue
    const date = parseDate((row.dataexecucao || row.databaixa || '').split(' ')[0])
    if (!date || date < cutoff) continue
    const equipe = shortEquipe(row.nomedaequipe).split(' - ')[0]
    const client = String(row.codigocliente || row.nomecliente || '').trim()
    if (!equipe || equipe === '—' || !client) continue
    if (!baseByTeam.has(equipe)) baseByTeam.set(equipe, new Set())
    baseByTeam.get(equipe)!.add(client)
  }

  const byTeam = new Map<string, { clients: Set<string>; pairs: number }>()
  for (const pair of buildReincidenciaPairs(clientes)) {
    if (!pair.equipe_orig || pair.equipe_orig === '—') continue
    if (!byTeam.has(pair.equipe_orig)) byTeam.set(pair.equipe_orig, { clients: new Set(), pairs: 0 })
    const entry = byTeam.get(pair.equipe_orig)!
    entry.clients.add(pair.chave_cliente)
    entry.pairs++
  }
  return [...byTeam].map(([equipe, entry]) => {
    const base = baseByTeam.get(equipe)?.size || 0
    return { equipe, reincidentes: entry.clients.size, revisitas: entry.pairs, base, taxa: base ? Math.round(entry.clients.size / base * 100) : 0 }
  }).sort((a, b) => b.taxa - a.taxa || b.reincidentes - a.reincidentes || a.equipe.localeCompare(b.equipe)).slice(0, 10)
}

export function buildIntervalDistribution(pairs: Pick<ReincidenciaPair, 'dias_entre'>[]) {
  const bands = [
    { faixa: '0–3d', min: 0, max: 3 }, { faixa: '4–7d', min: 4, max: 7 },
    { faixa: '8–15d', min: 8, max: 15 }, { faixa: '16–30d', min: 16, max: 30 },
    { faixa: '31–60d', min: 31, max: 60 },
  ]
  return bands.map(band => ({ faixa: band.faixa, total: pairs.filter(pair => pair.dias_entre >= band.min && pair.dias_entre <= band.max).length }))
}
