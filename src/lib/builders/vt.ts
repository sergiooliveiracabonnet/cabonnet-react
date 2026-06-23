import { parseDate } from '../transform'
import type { OSRow } from '../types'

export interface VTCumprimento {
  total:   number          // VT executadas com prazo aferível no período
  noPrazo: number          // executadas dentro do prazo contratual
  fora:    number          // executadas fora do prazo
  pct:     number | null   // % no prazo (0–100, 1 casa); null sem amostra
  prevPct: number | null   // % no prazo do período anterior
  deltaPp: number | null   // variação em pontos percentuais (atual − anterior)
}

export interface VTCarga {
  nome:     string
  total:    number   // VT abertas atribuídas a este grupo
  violadas: number   // já passaram do prazo
  criticas: number   // ≤ 2h restantes (ainda no prazo)
}

export interface VTTendenciaDia {
  dia:      string   // DD/MM/YYYY
  label:    string   // DD/MM
  total:    number   // VT executadas no dia
  violadas: number   // executadas fora do prazo
}

function sameYMD(a: Date | null, b: Date): boolean {
  return a != null
    && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function buildTendencia(allRevisita: OSRow[], dias = 7): VTTendenciaDia[] {
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  const vt = allRevisita
    .filter(r => r._vtCumpridaNoPrazo != null)
    .map(r => ({ d: parseDate(r.dataexecucao), violada: r._vtCumpridaNoPrazo === false }))

  const out: VTTendenciaDia[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const day = new Date(base)
    day.setDate(day.getDate() - i)
    const doDia = vt.filter(x => sameYMD(x.d, day))
    const dd = String(day.getDate()).padStart(2, '0')
    const mm = String(day.getMonth() + 1).padStart(2, '0')
    out.push({
      dia:      `${dd}/${mm}/${day.getFullYear()}`,
      label:    `${dd}/${mm}`,
      total:    doDia.length,
      violadas: doDia.filter(x => x.violada).length,
    })
  }
  return out
}

function pctNoPrazo(rows: OSRow[]): { total: number; noPrazo: number; pct: number | null } {
  const aferiveis = rows.filter(r => r._vtCumpridaNoPrazo != null)
  const total     = aferiveis.length
  const noPrazo   = aferiveis.filter(r => r._vtCumpridaNoPrazo === true).length
  const pct       = total === 0 ? null : Math.round((noPrazo / total) * 1000) / 10
  return { total, noPrazo, pct }
}

function agregarCarga(filaAberta: OSRow[], chave: (r: OSRow) => string): VTCarga[] {
  const mapa = new Map<string, VTCarga>()
  for (const r of filaAberta) {
    const nome = chave(r) || '—'
    const c = mapa.get(nome) ?? { nome, total: 0, violadas: 0, criticas: 0 }
    c.total++
    if (r._vtViolado) c.violadas++
    else if ((r._vtHorasRestantes ?? 99) <= 2) c.criticas++
    mapa.set(nome, c)
  }
  return [...mapa.values()].sort((a, b) =>
    b.violadas - a.violadas || b.criticas - a.criticas || b.total - a.total,
  )
}

export function buildVT(
  rows: OSRow[],
  revisitaRows: OSRow[],
  prevRevisitaRows: OSRow[],
  allRevisitaRows: OSRow[] = [],
): {
  cumprimento: VTCumprimento
  cargaFornecedor: VTCarga[]
  cargaCidade: VTCarga[]
  tendencia: VTTendenciaDia[]
} {
  const atual    = pctNoPrazo(revisitaRows)
  const anterior = pctNoPrazo(prevRevisitaRows)

  const deltaPp = (atual.pct != null && anterior.pct != null)
    ? Math.round((atual.pct - anterior.pct) * 10) / 10
    : null

  // Fila de carga: VT em aberto com prazo ativo (mesmo critério da tabela da página)
  const filaAberta = rows.filter(r => r._vtPrazoHoras != null && r._vtHorasRestantes != null)

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
