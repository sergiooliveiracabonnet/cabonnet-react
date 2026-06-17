import type { ComponentType } from 'react'
import type { OSRow } from '../../lib/types'
import { isCOPE, isReagend, isExecucaoReal } from '../../lib/transform'

export type DrillRow = { title: string; rows: OSRow[]; color: string }
export type IconComp = ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>
export type EquipeEntry = { pendente: number; atendimento: number; concluida: number; total: number }

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
  const dt = _parseBR(r.dataexecucao || r.databaixa || r.datacadastro)
  if (!dt) return false
  if (from && dt < from) return false
  if (to) {
    const toEnd = new Date(to); toEnd.setHours(23, 59, 59, 999)
    if (dt > toEnd) return false
  }
  return true
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

// ─── Texto de produtividade (copiar para área de transferência) ────────────────
export interface CategoriaProdutividade {
  label:             string
  total:             number
  ativos:            number
  concluidos:        number
  cidadesAtivos:     { cidade: string; total: number }[]
  cidadesConcluidos: { cidade: string; total: number }[]
}

export function buildProdutividadeText(categorias: CategoriaProdutividade[], periodoLabel: string): string {
  const lines: string[] = [`📊 PRODUTIVIDADE — ${periodoLabel}`, '']
  for (const c of categorias) {
    lines.push(c.label)
    lines.push(`Total: ${c.total}  ·  Em aberto: ${c.ativos}  ·  Concluídas: ${c.concluidos}`)
    if (c.cidadesConcluidos.length) {
      lines.push('Concluídas por cidade:')
      for (const cc of c.cidadesConcluidos) lines.push(`  ${cc.cidade}: ${cc.total}`)
    }
    if (c.cidadesAtivos.length) {
      lines.push('Em aberto por cidade:')
      for (const ca of c.cidadesAtivos) lines.push(`  ${ca.cidade}: ${ca.total}`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

export function byEquipe(rows: OSRow[]): ({ equipe: string } & EquipeEntry)[] {
  const map: Record<string, EquipeEntry> = {}
  for (const r of rows) {
    if (!r.nomedaequipe?.trim()) continue
    const eq = (r.nomedaequipe || '').trim()
    if (!map[eq]) map[eq] = { pendente: 0, atendimento: 0, concluida: 0, total: 0 }
    const e = map[eq]
    e.total++
    if (r.descsituacao === 'Pendente')        e.pendente++
    else if (r.descsituacao === 'Atendimento') e.atendimento++
    else if (isExecucaoReal(r.descsituacao))   e.concluida++
  }
  return Object.entries(map)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([equipe, d]) => ({ equipe, ...d }))
}
