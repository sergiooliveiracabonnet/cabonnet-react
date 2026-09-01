import { shortEquipe } from '../osFormat'
import { isConcluida, parseDate } from '../transform'
import type { OSRow } from '../types'

export { shortEquipe as shortName }

export function avg(arr: number[]): number {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
}

// O score composto (SLA 45% + taxa 35% + MTTR 20%, com MTTR convertido por
// `100 - mttr*8`) foi removido. Nenhum dos pesos nem o fator 8 tinham base
// empírica, e o número misturava estoque com fluxo: ninguém agia sobre "72".
// Onde ele existia — Pulso, fornecedores, equipes — as componentes passaram a
// ser reportadas direto, cada uma na própria unidade.

// ─── SLA — predicado único de violação ────────────────────────────────────────
// Sempre conta a partir da abertura da OS: aging (congelado na baixa para
// concluídas) contra o limite do tipo de serviço. Agendamento é só informativo.

export function estourouSLA(r: OSRow): boolean {
  return r._agingAbertura != null && r._agingAbertura > r._slaLimite
}

/** % das OS do conjunto que NÃO estouraram o SLA (100 se vazio). */
export function slaPeriodoPct(rows: OSRow[]): number {
  if (rows.length === 0) return 100
  let breach = 0
  for (const r of rows) if (estourouSLA(r)) breach++
  return Math.round((rows.length - breach) / rows.length * 100)
}

// ─── MTTR — mediana (P50) e P90 em dias fracionários ─────────────────────────
// Mediana em vez de média: a média é dominada pela cauda de OS antigas.
// Dias fracionários em vez de floor: OS resolvida no mesmo dia não conta 0d.

export interface MttrStats { p50: number; p90: number; n: number }

export function mttrStats(rows: OSRow[]): MttrStats {
  const times: number[] = []
  for (const r of rows) {
    if (!isConcluida(r.descsituacao)) continue
    const ab = parseDate(r.datacadastro)
    const bx = parseDate(r.databaixa) || parseDate(r.dataexecucao)
    if (!ab || !bx) continue
    const d = (bx.getTime() - ab.getTime()) / 86400000
    if (d >= 0 && d <= 90) times.push(d)
  }
  if (times.length === 0) return { p50: 0, p90: 0, n: 0 }
  times.sort((a, b) => a - b)
  const q = (p: number) => times[Math.min(times.length - 1, Math.floor(times.length * p))]
  const round1 = (v: number) => Math.round(v * 10) / 10
  return { p50: round1(q(0.5)), p90: round1(q(0.9)), n: times.length }
}

/** MTTR do conjunto — mediana (P50) em dias fracionários, 1 casa decimal. */
export function calcMTTR(rows: OSRow[]): number {
  return mttrStats(rows).p50
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
  sla:        number   // % de OS do período dentro do prazo (estourouSLA) — NÃO é taxa de conclusão
  conclPct:   number   // % de OS do período concluídas (throughput)
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
