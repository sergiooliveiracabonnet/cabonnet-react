import { isExecucaoReal, parseDate } from '../transform'
import type { OSRow } from '../types'

// Fila de prioridade única para toda OS ativa — VT (prazo em horas) e o resto
// (instalação/manutenção/serviço/rede, SLA em dias) num só critério de urgência.
// Antes eram duas páginas/builders separados (buildVT + buildFilaGeral) com
// carga, cumprimento e ordenação cada um no seu canto; unificado aqui.

export interface FilaCarga { nome: string; total: number; violadas: number; criticas: number }
export interface FilaCumprimento {
  total:   number
  noPrazo: number
  fora:    number
  pct:     number | null
  prevPct: number | null
  deltaPp: number | null
}
export interface FilaTendenciaDia { dia: string; label: string; total: number; violadas: number }

const isAtiva = (r: OSRow) => r.descsituacao === 'Pendente' || r.descsituacao === 'Atendimento'

export type UrgenciaTier = 'violado' | 'atencao' | 'ok'

// Nível de urgência de qualquer OS — VT usa o prazo em horas (_vtHorasRestantes),
// as demais usam o SLA em dias já calculado (_slaCritico/_slaExcedido). É o que
// ordena a fila e agrega a carga; exportado para o Central de Ação reusar o
// mesmo critério em vez de duplicar a lógica.
export function filaUrgenciaTier(r: OSRow): UrgenciaTier {
  if (r._vtPrazoHoras != null) {
    if (r._vtViolado) return 'violado'
    if ((r._vtHorasRestantes ?? 99) <= 2) return 'atencao'
    return 'ok'
  }
  if (r._slaCritico) return 'violado'
  if (r._slaExcedido || r._slaSemAgend) return 'atencao'
  return 'ok'
}

// Score só usado para desempate DENTRO do mesmo tier — VT e não-VT não são
// comparáveis diretamente (escalas diferentes: prioridade VT pesa tipo de
// contrato × horas consumidas; risco geral pesa SLA em dias × aging × equipe).
export function filaUrgenciaScore(r: OSRow): number {
  return r._vtPrazoHoras != null ? (r._vtPriorityScore ?? 0) : (r._riskScore ?? 0)
}

function cumpridaNoPrazo(r: OSRow): boolean | null {
  if (r._vtPrazoHoras != null) return r._vtCumpridaNoPrazo
  if (!isExecucaoReal(r.descsituacao) || r._slaLimite == null || r._agingAbertura == null) return null
  return r._agingAbertura <= r._slaLimite
}

function pctNoPrazo(rows: OSRow[]): { total: number; noPrazo: number; pct: number | null } {
  const aferiveis = rows
    .map(r => ({ r, ok: cumpridaNoPrazo(r) }))
    .filter((x): x is { r: OSRow; ok: boolean } => x.ok != null)
  const total   = aferiveis.length
  const noPrazo = aferiveis.filter(x => x.ok).length
  const pct     = total === 0 ? null : Math.round((noPrazo / total) * 1000) / 10
  return { total, noPrazo, pct }
}

function agregarCarga(filaAberta: OSRow[], chave: (r: OSRow) => string): FilaCarga[] {
  const mapa = new Map<string, FilaCarga>()
  for (const r of filaAberta) {
    const nome = chave(r) || '—'
    const c = mapa.get(nome) ?? { nome, total: 0, violadas: 0, criticas: 0 }
    c.total++
    const tier = filaUrgenciaTier(r)
    if      (tier === 'violado') c.violadas++
    else if (tier === 'atencao') c.criticas++
    mapa.set(nome, c)
  }
  return [...mapa.values()].sort((a, b) =>
    b.violadas - a.violadas || b.criticas - a.criticas || b.total - a.total,
  )
}

function sameYMD(a: Date | null, b: Date): boolean {
  return a != null
    && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function buildTendencia(allRows: OSRow[], dias = 7): FilaTendenciaDia[] {
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  const executadas = allRows
    .map(r => ({ ok: cumpridaNoPrazo(r), dt: parseDate(r.dataexecucao) }))
    .filter((x): x is { ok: boolean; dt: Date | null } => x.ok != null)

  const out: FilaTendenciaDia[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const day = new Date(base)
    day.setDate(day.getDate() - i)
    const doDia = executadas.filter(x => sameYMD(x.dt, day))
    const dd = String(day.getDate()).padStart(2, '0')
    const mm = String(day.getMonth() + 1).padStart(2, '0')
    out.push({
      dia:      `${dd}/${mm}/${day.getFullYear()}`,
      label:    `${dd}/${mm}`,
      total:    doDia.length,
      violadas: doDia.filter(x => !x.ok).length,
    })
  }
  return out
}

export function buildFila(
  rows: OSRow[],
  revisitaRows: OSRow[],
  prevRevisitaRows: OSRow[],
  allRevisitaRows: OSRow[] = [],
): {
  cumprimento:     FilaCumprimento
  cargaFornecedor: FilaCarga[]
  cargaCidade:     FilaCarga[]
  tendencia:       FilaTendenciaDia[]
} {
  const atual    = pctNoPrazo(revisitaRows)
  const anterior = pctNoPrazo(prevRevisitaRows)

  const deltaPp = (atual.pct != null && anterior.pct != null)
    ? Math.round((atual.pct - anterior.pct) * 10) / 10
    : null

  const filaAberta = rows.filter(isAtiva)

  return {
    cumprimento: {
      total:   atual.total,
      noPrazo: atual.noPrazo,
      fora:    atual.total - atual.noPrazo,
      pct:     atual.pct,
      prevPct: anterior.pct,
      deltaPp,
    },
    cargaFornecedor: agregarCarga(filaAberta, r => r._fornecedor),
    cargaCidade:     agregarCarga(filaAberta, r => r.nomedacidade),
    tendencia:       buildTendencia(allRevisitaRows),
  }
}
