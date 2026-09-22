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

export function buildChurn(allRows: OSRow[], topo = TOPO_PADRAO, now: Date = new Date(), range: { from: Date; to: Date } | null = null): Churn {
  // Painel do dashboard: janela fixa de 60 dias a partir de agora, para mostrar
  // risco atual independente do filtro de data selecionado. Relatório dedicado
  // (Reincidências): recebe `range` com o período escolhido no filtro global.
  const hoje  = range ? new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate())
                      : new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const corte = range ? new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate())
                      : (() => { const c = new Date(hoje); c.setDate(c.getDate() - JANELA_DIAS); return c })()
  const janelaDias = range ? Math.max(1, Math.round((hoje.getTime() - corte.getTime()) / DIA_MS)) : JANELA_DIAS

  const porCliente = new Map<string, { rows: OSRow[]; datas: Date[] }>()

  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r)) continue
    if (r._tipo !== 'MANUTENCAO') continue
    if (!isExecucaoReal(r.descsituacao)) continue

    const quando = parseDate((r.dataexecucao || r.databaixa || '').split(' ')[0])
    if (!quando || quando < corte) continue
    if (range && quando > hoje) continue

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
    janelaDias,
    clientes: clientes.slice(0, topo),
    totalReincidentes: clientes.length,
    totalBase,
    pctReincidencia: totalBase > 0 ? Math.round(clientes.length / totalBase * 100) : 0,
  }
}

// ─── Revisita de instalação ────────────────────────────────────────────────
// Gatilho diferente do churn de manutenção: não é "2+ visitas do mesmo tipo",
// é a instalação em si — cliente instalado e, dentro de uma janela fixa de 30
// dias corridos, precisou de QUALQUER outra OS executada (outra instalação,
// manutenção, o que for). A janela `range`/60 dias (mesma de buildChurn) só
// decide QUAIS instalações entram na listagem; os 30 dias fixos definem o que
// conta como revisita dela — não se misturam.
const JANELA_REVISITA_INSTALACAO_DIAS = 30

export function buildInstallChurn(allRows: OSRow[], topo = TOPO_PADRAO, now: Date = new Date(), range: { from: Date; to: Date } | null = null): Churn {
  const hoje  = range ? new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate())
                      : new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const corte = range ? new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate())
                      : (() => { const c = new Date(hoje); c.setDate(c.getDate() - JANELA_DIAS); return c })()
  const janelaDias = range ? Math.max(1, Math.round((hoje.getTime() - corte.getTime()) / DIA_MS)) : JANELA_DIAS

  // Todas as execuções reais por cliente, qualquer tipo — a revisita de
  // instalação pode ser outra instalação, uma manutenção, o que vier depois.
  const execByClient = new Map<string, { row: OSRow; data: Date }[]>()
  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r)) continue
    if (!isExecucaoReal(r.descsituacao)) continue
    const quando = parseDate((r.dataexecucao || r.databaixa || '').split(' ')[0])
    if (!quando) continue
    const chave = String(r.codigocliente || r.nomecliente || '').trim()
    if (!chave) continue
    if (!execByClient.has(chave)) execByClient.set(chave, [])
    execByClient.get(chave)!.push({ row: r, data: quando })
  }

  let totalBase = 0
  const porCliente = new Map<string, { rows: OSRow[]; datas: Date[] }>()

  for (const [chave, execs] of execByClient) {
    const sorted = [...execs].sort((a, b) => a.data.getTime() - b.data.getTime())
    const installsNaJanela = sorted.filter(e => e.row._tipo === 'INSTALACAO' && e.data >= corte && e.data <= hoje)
    if (!installsNaJanela.length) continue
    totalBase++

    // Marca a instalação e toda execução seguinte dentro de 30 dias dela —
    // um cliente com mais de uma instalação na janela pode acumular vários
    // grupos; o drill-down mostra tudo junto, como o buildChurn já faz.
    const envolvidos = new Set<number>()
    for (const install of installsNaJanela) {
      const idxInstall = sorted.indexOf(install)
      const revisitasDaInstalacao = sorted
        .map((e, idx) => ({ e, idx }))
        .filter(({ e, idx }) => idx !== idxInstall &&
          e.data.getTime() > install.data.getTime() &&
          (e.data.getTime() - install.data.getTime()) <= JANELA_REVISITA_INSTALACAO_DIAS * DIA_MS)
      if (!revisitasDaInstalacao.length) continue
      envolvidos.add(idxInstall)
      revisitasDaInstalacao.forEach(({ idx }) => envolvidos.add(idx))
    }
    if (!envolvidos.size) continue

    const indices = [...envolvidos].sort((a, b) => a - b)
    porCliente.set(chave, { rows: indices.map(i => sorted[i].row), datas: indices.map(i => sorted[i].data) })
  }

  const clientes: ClienteReincidente[] = [...porCliente.entries()]
    .map(([chave, e]) => {
      const datas = [...e.datas].sort((a, b) => a.getTime() - b.getTime())
      let somaGaps = 0
      for (let i = 1; i < datas.length; i++) somaGaps += (datas[i].getTime() - datas[i - 1].getTime()) / DIA_MS
      const ultima = datas[datas.length - 1]
      const ref    = e.rows[0]
      return {
        chave,
        cliente: String(ref.nomecliente || chave).trim(),
        cidade:  (ref.nomedacidade || '').trim(),
        bairro:  (ref.bairro || '').trim(),
        visitas: e.rows.length,
        intervaloMedio:  Math.round(somaGaps / Math.max(1, datas.length - 1) * 10) / 10,
        diasDesdeUltima: Math.floor((hoje.getTime() - ultima.getTime()) / DIA_MS),
        rows: e.rows,
      }
    })
    .sort((a, b) =>
      b.visitas - a.visitas ||
      a.intervaloMedio - b.intervaloMedio ||
      a.diasDesdeUltima - b.diasDesdeUltima
    )

  return {
    janelaDias,
    clientes: clientes.slice(0, topo),
    totalReincidentes: clientes.length,
    totalBase,
    pctReincidencia: totalBase > 0 ? Math.round(clientes.length / totalBase * 100) : 0,
  }
}
