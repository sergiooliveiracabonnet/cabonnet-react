import { isCOPE, isReagend, isExecucaoReal, parseDate } from '../transform'
import type { OSRow } from '../types'

// ─── Coorte de resolução ──────────────────────────────────────────────────────
// Responde "estamos ficando mais rápidos?" sem a armadilha da taxa de conclusão:
// agrupa as OS pela SEMANA DE ABERTURA e mede, dentro de cada safra, quantas
// foram resolvidas em até D+1, D+2, D+3 e D+7.
//
// Por que por safra e não por período de execução: um período de execução mistura
// OS abertas ontem com OS abertas há dois meses, então "melhorou" pode ser só
// mudança na composição da fila. A safra compara sempre o mesmo tipo de coisa.

export const COORTE_BUCKETS = [1, 2, 3, 7] as const

// Além de 90 dias é quase certo que a data está suja (baixa retroativa em massa,
// OS reaberta). Mesmo corte usado em mttrStats.
const MAX_DIAS_RESOLUCAO = 90

export interface CoorteLinha {
  chave:      number            // timestamp da segunda-feira, para ordenação
  label:      string            // 'DD/MM' da segunda-feira
  total:      number            // OS abertas na semana
  resolvidas: number            // quantas já foram concluídas (em qualquer prazo)
  /** % resolvidas até D+bucket. null = a safra ainda não tem idade para responder. */
  pct:        (number | null)[]
  /**
   * % resolvidas dentro do SLA da PRÓPRIA OS. As colunas D+n usam dias absolutos
   * e são a leitura do cliente ("esperei 3 dias"); esta é a leitura contratual —
   * manutenção tem 1 dia de limite e instalação 2, então a mesma coluna D+2
   * significa "no prazo" para uma e "atrasado" para a outra.
   */
  pctNoPrazo: number | null
}

export interface Coorte {
  buckets: number[]
  linhas:  CoorteLinha[]
}

/** Segunda-feira da semana da data informada (semana seg–dom). */
export function inicioSemana(d: Date): Date {
  const x   = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = x.getDay()                      // 0 = domingo
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow))
  return x
}

const DIA_MS = 86400000

export function buildCoorte(allRows: OSRow[], semanas = 8, now: Date = new Date()): Coorte {
  const hoje   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const limite = new Date(hoje)
  limite.setDate(limite.getDate() - semanas * 7)

  const grupos = new Map<number, {
    inicio: Date; total: number; dias: number[]
    noPrazo: number; slaMax: number
  }>()

  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r) || r._tipo === 'REDE') continue
    const abertura = parseDate(r.datacadastro)
    if (!abertura || abertura < limite) continue

    const inicio = inicioSemana(abertura)
    const chave  = inicio.getTime()
    let g = grupos.get(chave)
    if (!g) {
      g = { inicio, total: 0, dias: [], noPrazo: 0, slaMax: 0 }
      grupos.set(chave, g)
    }
    g.total++
    // Guarda o maior limite da safra: a coluna "no prazo" só fecha quando até a
    // OS de SLA mais folgado já teve chance de vencer.
    if (r._slaLimite > g.slaMax) g.slaMax = r._slaLimite

    if (!isExecucaoReal(r.descsituacao)) continue
    const baixa = parseDate(r.databaixa) || parseDate(r.dataexecucao)
    if (!baixa) continue
    const dias = Math.floor((baixa.getTime() - abertura.getTime()) / DIA_MS)
    if (dias < 0 || dias > MAX_DIAS_RESOLUCAO) continue
    g.dias.push(dias)
    if (dias <= r._slaLimite) g.noPrazo++
  }

  const linhas: CoorteLinha[] = [...grupos.values()]
    .map(g => {
      // A safra cobre [inicio, inicio+6]. A OS aberta no último dia da semana só
      // teve chance de fechar em D+n depois de inicio+6+n. Antes disso o bucket
      // mediria imaturidade da safra, não velocidade — por isso vira null.
      const idadeDoFim = Math.floor((hoje.getTime() - g.inicio.getTime()) / DIA_MS) - 6
      const pct = COORTE_BUCKETS.map(d => {
        if (idadeDoFim < d || g.total === 0) return null
        return Math.round(g.dias.filter(x => x <= d).length / g.total * 100)
      })
      const pctNoPrazo = (idadeDoFim < g.slaMax || g.total === 0)
        ? null
        : Math.round(g.noPrazo / g.total * 100)
      const dd = String(g.inicio.getDate()).padStart(2, '0')
      const mm = String(g.inicio.getMonth() + 1).padStart(2, '0')
      return {
        chave: g.inicio.getTime(),
        label: `${dd}/${mm}`,
        total: g.total,
        resolvidas: g.dias.length,
        pct,
        pctNoPrazo,
      }
    })
    .sort((a, b) => b.chave - a.chave)

  return { buckets: [...COORTE_BUCKETS], linhas }
}
