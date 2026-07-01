import { isExecucaoReal } from '../transform'
import type { OSRow } from '../types'

// Fila de prioridade para OS que não são VT/Manutenção (instalação, serviço, rede).
// VT já tem fila própria (buildVT) por ter prazo contratual em horas (08h/24h/48h);
// aqui a urgência vem do SLA em dias (_slaLimite/_slaCritico/_slaExcedido) e do
// _riskScore genérico já calculado para toda OS em enrichRows — não é um score novo.

const naoVT = (r: OSRow) => r._categoria !== 'VT_MANUTENCAO'
const isAtiva = (r: OSRow) => r.descsituacao === 'Pendente' || r.descsituacao === 'Atendimento'

export interface FilaGeralCarga {
  nome:      string
  total:     number   // OS em aberto atribuídas a este grupo
  criticas:  number   // _slaCritico (> 2× o limite do SLA)
  excedidas: number   // _slaExcedido ou _slaSemAgend, mas ainda não crítico
}

export interface FilaGeralCumprimento {
  total:   number          // OS concluídas com SLA aferível no período
  noPrazo: number          // fechadas dentro do prazo (aging na baixa ≤ limite)
  fora:    number
  pct:     number | null   // % dentro do prazo (0–100, 1 casa); null sem amostra
  prevPct: number | null
  deltaPp: number | null
}

function pctNoPrazo(rows: OSRow[]): { total: number; noPrazo: number; pct: number | null } {
  const aferiveis = rows.filter(r => naoVT(r) && isExecucaoReal(r.descsituacao) && r._slaLimite != null && r._agingAbertura != null)
  const total     = aferiveis.length
  const noPrazo   = aferiveis.filter(r => (r._agingAbertura ?? 0) <= (r._slaLimite ?? Infinity)).length
  const pct       = total === 0 ? null : Math.round((noPrazo / total) * 1000) / 10
  return { total, noPrazo, pct }
}

function agregarCarga(filaAberta: OSRow[], chave: (r: OSRow) => string): FilaGeralCarga[] {
  const mapa = new Map<string, FilaGeralCarga>()
  for (const r of filaAberta) {
    const nome = chave(r) || '—'
    const c = mapa.get(nome) ?? { nome, total: 0, criticas: 0, excedidas: 0 }
    c.total++
    if      (r._slaCritico) c.criticas++
    else if (r._slaExcedido || r._slaSemAgend) c.excedidas++
    mapa.set(nome, c)
  }
  return [...mapa.values()].sort((a, b) =>
    b.criticas - a.criticas || b.excedidas - a.excedidas || b.total - a.total,
  )
}

export function buildFilaGeral(
  rows: OSRow[],
  revisitaRows: OSRow[],
  prevRevisitaRows: OSRow[],
): {
  cumprimento:     FilaGeralCumprimento
  cargaFornecedor: FilaGeralCarga[]
  cargaCidade:     FilaGeralCarga[]
} {
  const atual    = pctNoPrazo(revisitaRows)
  const anterior = pctNoPrazo(prevRevisitaRows)

  const deltaPp = (atual.pct != null && anterior.pct != null)
    ? Math.round((atual.pct - anterior.pct) * 10) / 10
    : null

  const filaAberta = rows.filter(r => naoVT(r) && isAtiva(r))

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
  }
}
