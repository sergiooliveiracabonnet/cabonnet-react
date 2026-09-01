import { isCOPE, isReagend, isExecucaoReal, parseDate } from '../transform'
import type { OSRow } from '../types'

// ─── Capacidade × Demanda por cidade ──────────────────────────────────────────
// "Taubaté tem 120 na fila" não decide nada. "Taubaté acumula 3 OS/dia e
// precisaria de +2 frentes só para parar de crescer" decide alocação.
//
// Entradas e saídas são medidas por DIA DE CALENDÁRIO na mesma janela, não por
// dia útil. Cliente abre OS no domingo, equipe não executa — dividir um pelos
// 7 dias e outro pelos 6 dias úteis compararia bases diferentes e faria a
// operação parecer mais capaz do que é.

const JANELA_DIAS        = 28   // entradas e saídas — mesma janela, mesma base
const JANELA_FRENTES_DIAS = 14  // capacidade instalada corrente

export interface CapacidadeCidade {
  cidade:        string
  fila:          number
  frentes:       number
  entradasDia:   number
  saidasDia:     number
  saldoDia:      number          // + = fila cresce
  prodFrenteDia: number
  /** Frentes adicionais só para as saídas empatarem com as entradas. */
  frentesEstabilizar: number
  /** Frentes adicionais para zerar a fila dentro do horizonte, absorvendo as entradas. */
  frentesZerar:  number | null
  /** No ritmo atual; null quando a fila não zera porque entra mais do que sai. */
  diasParaZerar: number | null
  status: 'ok' | 'atencao' | 'nao_zera'
}

export interface Capacidade {
  horizonte: number
  cidades:   CapacidadeCidade[]
}

interface Acc {
  fila: number
  entradas: number
  saidas: number
  frentes: Set<string>
}

export function buildCapacidade(allRows: OSRow[], horizonte = 7, now: Date = new Date()): Capacidade {
  const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const corteJanela  = new Date(hoje); corteJanela.setDate(corteJanela.getDate() - JANELA_DIAS)
  const corteFrentes = new Date(hoje); corteFrentes.setDate(corteFrentes.getDate() - JANELA_FRENTES_DIAS)

  const porCidade = new Map<string, Acc>()
  const acc = (c: string): Acc => {
    let e = porCidade.get(c)
    if (!e) { e = { fila: 0, entradas: 0, saidas: 0, frentes: new Set() }; porCidade.set(c, e) }
    return e
  }

  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r) || r._tipo === 'REDE') continue
    const cidade = (r.nomedacidade || 'Sem cidade').trim()

    if (['Pendente', 'Atendimento'].includes(r.descsituacao)) acc(cidade).fila++

    const abertura = parseDate(r.datacadastro)
    if (abertura && abertura >= corteJanela) acc(cidade).entradas++

    if (!isExecucaoReal(r.descsituacao)) continue
    const baixa = parseDate((r.dataexecucao || r.databaixa || '').split(' ')[0])
    if (!baixa || baixa < corteJanela) continue
    const e = acc(cidade)
    e.saidas++
    const equipe = (r.nomedaequipe || '').trim()
    if (equipe && baixa >= corteFrentes) e.frentes.add(equipe)
  }

  const cidades: CapacidadeCidade[] = [...porCidade.entries()]
    .filter(([, e]) => e.fila > 0 || e.saidas > 0)
    .map(([cidade, e]) => {
      const r1 = (v: number) => Math.round(v * 10) / 10
      // Taxas diárias em 2 casas: com 1 casa, cidade pequena (Tremembé) vira
      // "0,0 entra / 0,0 sai" e o painel não diz nada.
      const r2 = (v: number) => Math.round(v * 100) / 100
      const entradasDia = e.entradas / JANELA_DIAS
      const saidasDia   = e.saidas   / JANELA_DIAS
      const saldoDia    = entradasDia - saidasDia
      const frentes     = e.frentes.size
      const prodFrenteDia = frentes > 0 ? saidasDia / frentes : 0

      // Sem produtividade medida não dá para dimensionar frente — devolve null
      // em vez de inventar um número.
      const frentesPara = (deficit: number): number | null => {
        if (deficit <= 0) return 0
        if (prodFrenteDia <= 0) return null
        return Math.ceil(deficit / prodFrenteDia)
      }

      const frentesEstabilizar = frentesPara(saldoDia) ?? 0
      const frentesZerar = frentesPara(e.fila / horizonte + entradasDia - saidasDia)
      const diasParaZerar = saldoDia < 0 ? r1(e.fila / -saldoDia) : null

      const status: CapacidadeCidade['status'] =
        saldoDia > 0                                 ? 'nao_zera'
        : diasParaZerar != null && diasParaZerar > horizonte ? 'atencao'
        : 'ok'

      return {
        cidade,
        fila: e.fila,
        frentes,
        entradasDia:   r2(entradasDia),
        saidasDia:     r2(saidasDia),
        saldoDia:      r2(saldoDia),
        prodFrenteDia: r1(prodFrenteDia),
        frentesEstabilizar,
        frentesZerar,
        diasParaZerar,
        status,
      }
    })
    // Quem não zera primeiro, depois quem demora mais, depois a maior fila
    .sort((a, b) =>
      (a.status === 'nao_zera' ? 0 : 1) - (b.status === 'nao_zera' ? 0 : 1) ||
      (b.diasParaZerar ?? 0) - (a.diasParaZerar ?? 0) ||
      b.fila - a.fila
    )

  return { horizonte, cidades }
}
