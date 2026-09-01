import type { ComponentType } from 'react'
import type { OSRow } from '../../lib/types'
import { isCOPE, isReagend, isExecucaoReal } from '../../lib/transform'
import { estourouSLA } from '../../lib/builders/_helpers'
import { shortEquipe } from '../../lib/osFormat'

export type DrillRow = { title: string; rows: OSRow[]; color: string }
export type IconComp = ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>
export type EquipeEntry = { pendente: number; atendimento: number; concluida: number; total: number; criticas: number; slaPct: number }

// ─── Predicates (used in GerencialPage) ───────────────────────────────────────
export const isInst    = (r: OSRow) => r._categoria === 'INSTALACAO'
export const isVTManut = (r: OSRow) => r._categoria === 'VT_MANUTENCAO'
export const isServico = (r: OSRow) => r._categoria === 'SERVICO'
export const isAtend   = (r: OSRow) => r.descsituacao === 'Atendimento'
export const isAtivo   = (r: OSRow) => ['Pendente','Atendimento'].includes(r.descsituacao)
export const skip      = (r: OSRow) => isCOPE(r) || isReagend(r)

// ─── Date helpers ──────────────────────────────────────────────────────────────
export function _parseBR(s: string | null | undefined): Date | null {
  if (!s) return null
  const p = s.split(' ')[0].split('/')
  if (p.length < 3) return null
  const dt = new Date(+p[2], +p[1] - 1, +p[0])
  return isNaN(dt.getTime()) ? null : dt
}

export function _isExecNoPeriodo(r: OSRow, from: Date | null | undefined, to: Date | null | undefined): boolean {
  // Sem data de execução/baixa a OS fica FORA do recorte — o fallback antigo
  // para datacadastro inflava as "executadas no período" com execuções de
  // data desconhecida (cadastrada no mês ≠ executada no mês).
  const dt = _parseBR(r.dataexecucao || r.databaixa)
  if (!dt) return false
  if (from && dt < from) return false
  if (to) {
    const toEnd = new Date(to); toEnd.setHours(23, 59, 59, 999)
    if (dt > toEnd) return false
  }
  return true
}

// Em Rota = na rua HOJE. OS em "Atendimento" com agendamento futuro está
// atribuída, mas não está na rua agora — entra num grupo separado.
export function isAgendadaFutura(r: OSRow): boolean {
  const dt = _parseBR(r.dataagendamento)
  if (!dt) return false
  const fimHoje = new Date(); fimHoje.setHours(23, 59, 59, 999)
  return dt > fimHoje
}

// ─── Aggregate helpers ─────────────────────────────────────────────────────────
export function byCidade(rows: OSRow[]): { cidade: string; total: number }[] {
  const map: Record<string, number> = {}
  for (const r of rows) {
    const c = (r.nomedacidade || '(sem cidade)').trim()
    map[c] = (map[c] ?? 0) + 1
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([cidade, total]) => ({ cidade, total }))
}

// Recebe as MESMAS bases dos KPIs da seção: ativas (fila do filtro) e
// concluídas por data de execução — antes a coluna "Concl." usava outra janela
// (data de cadastro) e a soma da tabela não batia com o card logo acima.
// Chave = shortEquipe, a mesma usada no drill-down (nome cru quebrava o clique).
export function byEquipe(ativas: OSRow[], concluidas: OSRow[]): ({ equipe: string } & EquipeEntry)[] {
  const map: Record<string, EquipeEntry & { breach: number }> = {}
  const acc = (r: OSRow) => {
    if (!r.nomedaequipe?.trim()) return null
    const eq = shortEquipe(r.nomedaequipe) || r.nomedaequipe.trim()
    if (!map[eq]) map[eq] = { pendente: 0, atendimento: 0, concluida: 0, total: 0, criticas: 0, slaPct: 100, breach: 0 }
    return map[eq]
  }
  for (const r of ativas) {
    const e = acc(r)
    if (!e) continue
    e.total++
    if (r.descsituacao === 'Pendente')         e.pendente++
    else if (r.descsituacao === 'Atendimento') e.atendimento++
    if (r._slaCritico)  e.criticas++
    if (estourouSLA(r)) e.breach++
  }
  for (const r of concluidas) {
    const e = acc(r)
    if (!e || !isExecucaoReal(r.descsituacao)) continue
    e.total++
    e.concluida++
    if (estourouSLA(r)) e.breach++
  }
  return Object.entries(map)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([equipe, { breach, ...d }]) => ({
      equipe, ...d,
      slaPct: d.total > 0 ? Math.round((d.total - breach) / d.total * 100) : 100,
    }))
}
