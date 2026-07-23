import { getEquipeTipo, parseDate } from '../transform'
import { contarRevisitasPorTipo, type RevisitaTipo } from './revisitaPorTipo'
import type { BacklogRow } from '../../hooks/useBacklog'

export interface BiGestaoTecnicaMesPoint {
  mes:        string
  label:      string
  instalacao: number
  manutencao: number
  servico:    number
}

export interface BiGestaoTecnicaPainel {
  totalInstalacao:      number
  totalManutencao:      number
  totalServico:         number
  totalGeral:           number
  taxaManutencaoPct:    number
  ostPorMes:            BiGestaoTecnicaMesPoint[]
  mediaDiasExecucao:    Record<RevisitaTipo, number>
  cumprimentoAgendaPct: Record<RevisitaTipo, number>
  revisitaPct:          Record<RevisitaTipo, number>
}

const MESES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function classificar(r: BacklogRow): RevisitaTipo | 'rede' {
  const tipo = getEquipeTipo(r.nomedaequipe, r.tiposervico)
  if (tipo === 'REDE')       return 'rede'
  if (tipo === 'INSTALACAO') return 'instalacao'
  if (tipo === 'MANUTENCAO') return 'manutencao'
  return 'servico'
}

function truncDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function mediaDiasDeExecucao(rows: BacklogRow[]): number {
  const horas = rows.map(r => Number(r.horas_resolucao)).filter(h => Number.isFinite(h) && h >= 0)
  if (!horas.length) return 0
  const media = horas.reduce((a, b) => a + b, 0) / horas.length
  return Math.round((media / 24) * 100) / 100
}

function cumprimentoAgenda(rows: BacklogRow[]): number {
  let total = 0
  let noPrazo = 0
  for (const r of rows) {
    const agend = parseDate(r.dataagendamento)
    const exec  = parseDate(r.dataexecucao)
    if (!agend || !exec) continue
    total++
    if (truncDay(exec) <= truncDay(agend)) noPrazo++
  }
  return total > 0 ? Math.round((noPrazo / total) * 100) : 0
}

export function buildBiGestaoTecnicaPainel(rows: BacklogRow[]): BiGestaoTecnicaPainel {
  const porTipo: Record<RevisitaTipo, BacklogRow[]> = { instalacao: [], manutencao: [], servico: [] }
  for (const r of rows) {
    const c = classificar(r)
    if (c === 'rede') continue
    porTipo[c].push(r)
  }

  const totalInstalacao = porTipo.instalacao.length
  const totalManutencao = porTipo.manutencao.length
  const totalServico    = porTipo.servico.length
  const totalGeral      = totalInstalacao + totalManutencao + totalServico

  const mesMap = new Map<string, { instalacao: number; manutencao: number; servico: number }>()
  for (const tipo of ['instalacao', 'manutencao', 'servico'] as const) {
    for (const r of porTipo[tipo]) {
      const dt = parseDate(r.datacadastro)
      if (!dt) continue
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      if (!mesMap.has(key)) mesMap.set(key, { instalacao: 0, manutencao: 0, servico: 0 })
      mesMap.get(key)![tipo]++
    }
  }
  const ostPorMes = [...mesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const [y, m] = key.split('-').map(Number)
      return { mes: key, label: `${MESES_LABEL[m - 1]} ${y}`, ...v }
    })

  // Cada contagem de revisita usa só as linhas já classificadas naquele tipo
  // (porTipo), nunca o array `rows` inteiro — senão o numerador mede uma
  // população diferente do denominador e o percentual pode passar de 100%
  // (ex: uma linha classificada REDE ou de outro tipo que carregue a flag
  // de revisita do tipo em questão).
  const revisitaInstalacao = contarRevisitasPorTipo(porTipo.instalacao).instalacao
  const revisitaManutencao = contarRevisitasPorTipo(porTipo.manutencao).manutencao
  const revisitaServico    = contarRevisitasPorTipo(porTipo.servico).servico

  return {
    totalInstalacao,
    totalManutencao,
    totalServico,
    totalGeral,
    taxaManutencaoPct: totalGeral > 0 ? Math.round((totalManutencao / totalGeral) * 100) : 0,
    ostPorMes,
    mediaDiasExecucao: {
      instalacao: mediaDiasDeExecucao(porTipo.instalacao),
      manutencao: mediaDiasDeExecucao(porTipo.manutencao),
      servico:    mediaDiasDeExecucao(porTipo.servico),
    },
    cumprimentoAgendaPct: {
      instalacao: cumprimentoAgenda(porTipo.instalacao),
      manutencao: cumprimentoAgenda(porTipo.manutencao),
      servico:    cumprimentoAgenda(porTipo.servico),
    },
    revisitaPct: {
      instalacao: totalInstalacao > 0 ? Math.round((revisitaInstalacao / totalInstalacao) * 100) : 0,
      manutencao: totalManutencao > 0 ? Math.round((revisitaManutencao / totalManutencao) * 100) : 0,
      servico:    totalServico    > 0 ? Math.round((revisitaServico    / totalServico)    * 100) : 0,
    },
  }
}
