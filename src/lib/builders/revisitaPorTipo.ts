import type { BacklogRow } from '../../hooks/useBacklog'
import { getEquipeTipo } from '../transform'

export type RevisitaTipo = 'instalacao' | 'manutencao' | 'servico'

const FLAG_KEY: Record<RevisitaTipo, 'revisita_inst' | 'revisita_manut' | 'revisita_serv'> = {
  instalacao: 'revisita_inst', manutencao: 'revisita_manut', servico: 'revisita_serv',
}

export function isRevisitaAtiva(r: BacklogRow): boolean {
  return Number(r.recorrencia) > 0
}

export function filtrarRevisitasAtivas(rows: BacklogRow[]): BacklogRow[] {
  return rows.filter(isRevisitaAtiva)
}

export function filtrarRevisitaPorTipo(rows: BacklogRow[], tipo: RevisitaTipo): BacklogRow[] {
  return rows.filter(r => isRevisitaAtiva(r) && Number(r[FLAG_KEY[tipo]]) === 1)
}

export function contarRevisitasPorTipo(rows: BacklogRow[]): Record<RevisitaTipo, number> {
  return {
    instalacao: rows.filter(r => isRevisitaAtiva(r) && Number(r.revisita_inst) === 1).length,
    manutencao: rows.filter(r => isRevisitaAtiva(r) && Number(r.revisita_manut) === 1).length,
    servico:    rows.filter(r => isRevisitaAtiva(r) && Number(r.revisita_serv) === 1).length,
  }
}

function rowMatchesTipo(r: BacklogRow, tipo: RevisitaTipo): boolean {
  const classificado = getEquipeTipo(r.nomedaequipe, r.tiposervico)
  if (tipo === 'instalacao') return classificado === 'INSTALACAO'
  if (tipo === 'manutencao') return classificado === 'MANUTENCAO'
  return classificado !== 'INSTALACAO' && classificado !== 'MANUTENCAO' && classificado !== 'REDE'
}

export function contarTotalPorTipo(rows: BacklogRow[], tipo: RevisitaTipo): number {
  return rows.filter(r => rowMatchesTipo(r, tipo)).length
}

export interface RevisitaCidadeRow { cidade: string; rev: number; total: number; taxa: number }

export function revisitaPorCidade(allRows: BacklogRow[], tipo: RevisitaTipo): RevisitaCidadeRow[] {
  const m: Record<string, { rev: number; total: number }> = {}
  for (const r of allRows.filter(row => rowMatchesTipo(row, tipo))) {
    const c = r.nomedacidade || 'Sem cidade'
    if (!m[c]) m[c] = { rev: 0, total: 0 }
    m[c].total++
    if (isRevisitaAtiva(r) && Number(r[FLAG_KEY[tipo]]) === 1) m[c].rev++
  }
  return Object.entries(m)
    .map(([cidade, v]) => ({ cidade, ...v, taxa: v.total ? Math.round((v.rev / v.total) * 100) : 0 }))
    .sort((a, b) => b.rev - a.rev)
}

export interface RevisitaClienteCronico { nome: string; count: number }

export function clientesCronicos(rowsFiltradas: BacklogRow[], minCount = 2): RevisitaClienteCronico[] {
  const cnt: Record<string, { nome: string; count: number }> = {}
  for (const r of rowsFiltradas) {
    const k = String(r.codigocliente || r.nomecliente)
    if (!cnt[k]) cnt[k] = { nome: r.nomecliente, count: 0 }
    cnt[k].count++
  }
  return Object.values(cnt)
    .filter(c => c.count >= minCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
}
