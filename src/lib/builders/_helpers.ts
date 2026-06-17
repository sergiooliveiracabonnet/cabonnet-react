import { shortEquipe } from '../osFormat'
import { isConcluida, parseDate } from '../transform'
import type { OSRow } from '../types'

export { shortEquipe as shortName }

export function avg(arr: number[]): number {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
}

export function calcMTTR(rows: OSRow[]): number {
  const times: number[] = []
  for (const r of rows) {
    if (!isConcluida(r.descsituacao)) continue
    const ab = parseDate(r.datacadastro)
    const bx = parseDate(r.databaixa) || parseDate(r.dataexecucao)
    if (!ab || !bx) continue
    const d = Math.floor((bx.getTime() - ab.getTime()) / 86400000)
    if (d >= 0 && d <= 90) times.push(d)
  }
  return avg(times)
}

export function scoreComposto(sla: number, conclPct: number, mttr: number): number {
  const mttrScore = Math.max(0, 100 - mttr * 8)
  return Math.min(100, Math.round(sla * 0.45 + mttrScore * 0.35 + conclPct * 0.20))
}

export function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = arr.reduce((a, b) => a + b, 0) / arr.length
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
}

export function topN(map: Map<string, number>, n = 10): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}

export interface FornCard {
  nome:       string
  total:      number
  concluidas: number
  sla:        number
  cor:        string
  slaTrend?:  { delta: number; pct: number; higherIsBetter: boolean } | null
}

export const FORN_CFG: Record<string, { label: string; cor: string }> = {
  WES:        { label: 'WES',        cor: '#c4b5fd' },
  Instacable: { label: 'Instacable', cor: '#facc15' },
  THM:        { label: 'THM',        cor: '#22d3ee' },
  REDE:       { label: 'Rede',       cor: '#4ade80' },
  MANUTENCAO: { label: 'Manutenção', cor: '#f97316' },
  INSTALACAO: { label: 'Instalação', cor: '#3b82f6' },
  INTERNO:    { label: 'Interno',    cor: '#94a3b8' },
}
