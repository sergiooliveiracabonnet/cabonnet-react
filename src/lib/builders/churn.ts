import { isCOPE, isReagend, isExecucaoReal, isForaDeRevisita, parseDate } from '../transform'
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
    if (isCOPE(r) || isReagend(r) || isForaDeRevisita(r)) continue
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
// dias corridos, o ERP abriu a OS específica de pós-venda "ASSISTENCIA -
// PRIMEIRA CONEXAO 30 DIAS" (não conta qualquer OS que caia no período — só
// esse serviço, que é o que o ERP usa pra marcar retorno de instalação
// recente). A janela `range`/60 dias (mesma de buildChurn) só decide QUAIS
// instalações entram na listagem; os 30 dias fixos definem o que conta como
// revisita dela — não se misturam. Regra confirmada pela operação em 2026-09-27.
const JANELA_REVISITA_INSTALACAO_DIAS = 30
const SERVICO_REVISITA_INSTALACAO = 'PRIMEIRA CONEXAO'

function isRevisitaPrimeiraConexao(row: OSRow): boolean {
  return (row.servico || '').toUpperCase().includes(SERVICO_REVISITA_INSTALACAO)
}

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
    // A conexão de uma transferência de endereço é INSTALACAO PRINCIPAL no ERP,
    // mas não é instalação nova — e a desconexão do endereço antigo não é retorno.
    if (isCOPE(r) || isReagend(r) || isForaDeRevisita(r)) continue
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
          isRevisitaPrimeiraConexao(e.row) &&
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

// ─── Revisita de manutenção (Relatório de Reincidências) ──────────────────
// Regra de negócio confirmada pela operação em 2026-09-27, só pra esse
// relatório dedicado — o painel "Risco de Churn" do Dashboard continua na
// regra antiga (buildChurn: 2+ manutenções concluídas na janela).
// Gatilho: uma VT (qualquer tipo — 08h/24h/48h) ABERTA em até 30 dias depois
// da EXECUÇÃO da OS anterior do mesmo cliente, qualquer tipo que ela seja
// (outra VT, instalação, o que for). Mesma convenção de datas da revisita de
// instalação: ancora na execução da OS de origem, mede pela abertura da VT.
const JANELA_REVISITA_MANUTENCAO_DIAS = 30

function isVT(row: OSRow): boolean {
  return (row.servico || '').toUpperCase().includes('VT')
}

export function buildManutencaoRevisitaChurn(allRows: OSRow[], topo = TOPO_PADRAO, now: Date = new Date(), range: { from: Date; to: Date } | null = null): Churn {
  const hoje  = range ? new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate())
                      : new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const corte = range ? new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate())
                      : (() => { const c = new Date(hoje); c.setDate(c.getDate() - JANELA_DIAS); return c })()
  const janelaDias = range ? Math.max(1, Math.round((hoje.getTime() - corte.getTime()) / DIA_MS)) : JANELA_DIAS

  // Todas as execuções reais por cliente, qualquer tipo — a OS anterior à VT
  // pode ser outra VT, uma instalação, o que vier antes.
  const execByClient = new Map<string, { row: OSRow; exec: Date; abertura: Date | null }[]>()
  const clientesNaBase = new Set<string>()
  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r) || isForaDeRevisita(r)) continue
    if (!isExecucaoReal(r.descsituacao)) continue
    const exec = parseDate((r.dataexecucao || r.databaixa || '').split(' ')[0])
    if (!exec) continue
    const chave = String(r.codigocliente || r.nomecliente || '').trim()
    if (!chave) continue
    if (exec >= corte && exec <= hoje) clientesNaBase.add(chave)
    const abertura = parseDate((r.datacadastro || '').split(' ')[0])
    if (!execByClient.has(chave)) execByClient.set(chave, [])
    execByClient.get(chave)!.push({ row: r, exec, abertura })
  }

  const porCliente = new Map<string, { rows: OSRow[]; datas: Date[] }>()

  for (const [chave, execs] of execByClient) {
    const sorted = [...execs].sort((a, b) => a.exec.getTime() - b.exec.getTime())
    const envolvidos = new Set<number>()
    for (let i = 1; i < sorted.length; i++) {
      const atual = sorted[i]
      if (!isVT(atual.row) || !atual.abertura) continue
      const anterior = sorted[i - 1]
      const gap = atual.abertura.getTime() - anterior.exec.getTime()
      if (gap <= 0 || gap > JANELA_REVISITA_MANUTENCAO_DIAS * DIA_MS) continue
      if (atual.exec < corte || atual.exec > hoje) continue
      envolvidos.add(i - 1)
      envolvidos.add(i)
    }
    if (!envolvidos.size) continue

    const indices = [...envolvidos].sort((a, b) => a - b)
    porCliente.set(chave, { rows: indices.map(i => sorted[i].row), datas: indices.map(i => sorted[i].exec) })
  }

  const totalBase = clientesNaBase.size

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
