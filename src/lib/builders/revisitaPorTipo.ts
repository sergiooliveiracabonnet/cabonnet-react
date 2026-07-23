import type { BacklogRow } from '../../hooks/useBacklog'

export type RevisitaTipo = 'instalacao' | 'manutencao' | 'servico'

const FLAG_KEY: Record<RevisitaTipo, 'revisita_inst' | 'revisita_manut' | 'revisita_serv'> = {
  instalacao: 'revisita_inst',
  manutencao: 'revisita_manut',
  servico:    'revisita_serv',
}

export function isRevisitaAtiva(r: BacklogRow): boolean {
  return Number(r.revisita_inst) === 1 || Number(r.revisita_manut) === 1 || Number(r.revisita_serv) === 1
}

export function filtrarRevisitasAtivas(rows: BacklogRow[]): BacklogRow[] {
  return rows.filter(isRevisitaAtiva)
}

export function filtrarRevisitaPorTipo(rows: BacklogRow[], tipo: RevisitaTipo): BacklogRow[] {
  const flag = FLAG_KEY[tipo]
  return rows.filter(r => Number(r[flag]) === 1)
}

export function contarRevisitasPorTipo(rows: BacklogRow[]): Record<RevisitaTipo, number> {
  return {
    instalacao: rows.filter(r => Number(r.revisita_inst)  === 1).length,
    manutencao: rows.filter(r => Number(r.revisita_manut) === 1).length,
    servico:    rows.filter(r => Number(r.revisita_serv)  === 1).length,
  }
}

export interface RevisitaCidadeRow { cidade: string; rev: number; total: number; taxa: number }

export function revisitaPorCidade(allRows: BacklogRow[], tipo: RevisitaTipo): RevisitaCidadeRow[] {
  const flag = FLAG_KEY[tipo]
  const m: Record<string, { rev: number; total: number }> = {}
  for (const r of allRows) {
    const c = r.nomedacidade || 'Sem cidade'
    if (!m[c]) m[c] = { rev: 0, total: 0 }
    m[c].total++
    if (Number(r[flag]) === 1) m[c].rev++
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
