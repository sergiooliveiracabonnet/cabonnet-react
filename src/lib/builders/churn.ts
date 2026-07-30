import { isCOPE, isReagend, isExecucaoReal, parseDate } from '../transform'
import type { OSRow } from '../types'

// ─── Risco de churn por reincidência ──────────────────────────────────────────
// Manutenção repetida no mesmo cliente é o sinal mais barato de cancelamento
// que um ISP tem: o cliente já chamou, já esperou, já teve o serviço parado —
// e chamou de novo. A taxa agregada de revisita (builder `revisitas`) diz que
// existe retrabalho; aqui interessa QUEM, para dar tratativa antes de cancelar.
//
// Só conta MANUTENÇÃO: instalação repetida é crescimento, não retrabalho.
// Não há score 0–100 de propósito — o ranking é por visitas e por intervalo
// entre elas, dois números que o coordenador consegue conferir na hora.

const JANELA_DIAS   = 60
const MIN_VISITAS   = 2
const TOPO_PADRAO   = 12

export interface ClienteReincidente {
  chave:           string
  cliente:         string
  cidade:          string
  bairro:          string
  visitas:         number
  /** Dias médios entre visitas consecutivas. Menor = chamando com mais frequência. */
  intervaloMedio:  number
  diasDesdeUltima: number
  rows:            OSRow[]
}

export interface Churn {
  janelaDias:        number
  clientes:          ClienteReincidente[]
  totalReincidentes: number
  /** Clientes distintos com ao menos uma manutenção concluída na janela. */
  totalBase:         number
  pctReincidencia:   number
}

const DIA_MS = 86400000

export function buildChurn(allRows: OSRow[], topo = TOPO_PADRAO, now: Date = new Date()): Churn {
  const hoje  = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const corte = new Date(hoje)
  corte.setDate(corte.getDate() - JANELA_DIAS)

  const porCliente = new Map<string, { rows: OSRow[]; datas: Date[] }>()

  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r)) continue
    if (r._tipo !== 'MANUTENCAO') continue
    if (!isExecucaoReal(r.descsituacao)) continue

    const quando = parseDate((r.dataexecucao || r.databaixa || '').split(' ')[0])
    if (!quando || quando < corte) continue

    const chave = String(r.codigocliente || r.nomecliente || '').trim()
    if (!chave) continue

    let e = porCliente.get(chave)
    if (!e) { e = { rows: [], datas: [] }; porCliente.set(chave, e) }
    e.rows.push(r)
    e.datas.push(quando)
  }

  const totalBase = porCliente.size

  const clientes: ClienteReincidente[] = [...porCliente.entries()]
    .filter(([, e]) => e.rows.length >= MIN_VISITAS)
    .map(([chave, e]) => {
      const datas = [...e.datas].sort((a, b) => a.getTime() - b.getTime())
      let somaGaps = 0
      for (let i = 1; i < datas.length; i++) {
        somaGaps += (datas[i].getTime() - datas[i - 1].getTime()) / DIA_MS
      }
      const ultima = datas[datas.length - 1]
      const ref    = e.rows[0]
      return {
        chave,
        cliente: String(ref.nomecliente || chave).trim(),
        cidade:  (ref.nomedacidade || '').trim(),
        bairro:  (ref.bairro || '').trim(),
        visitas: e.rows.length,
        intervaloMedio:  Math.round(somaGaps / (datas.length - 1) * 10) / 10,
        diasDesdeUltima: Math.floor((hoje.getTime() - ultima.getTime()) / DIA_MS),
        rows: e.rows,
      }
    })
    // Mais visitas primeiro; empate vai para quem chama com menor intervalo;
    // depois para quem chamou mais recentemente (tratativa ainda é possível).
    .sort((a, b) =>
      b.visitas - a.visitas ||
      a.intervaloMedio - b.intervaloMedio ||
      a.diasDesdeUltima - b.diasDesdeUltima
    )

  return {
    janelaDias: JANELA_DIAS,
    clientes: clientes.slice(0, topo),
    totalReincidentes: clientes.length,
    totalBase,
    pctReincidencia: totalBase > 0 ? Math.round(clientes.length / totalBase * 100) : 0,
  }
}
