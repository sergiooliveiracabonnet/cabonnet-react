import { buildInstallChurn, buildManutencaoRevisitaChurn, isAssistencia, isVT, type ClienteBase, type ClienteReincidente } from '../../lib/builders/churn'
import { isCOPE, isReagend, parseDate } from '../../lib/transform'
import type { OSRow } from '../../lib/types'
import { chaveDaCidade, equipeDaOS, gruposDeBairro, opcoesDeCidade, sortedClientRows } from '../reincidencias/reincidenciasReport'

// ─── Leitura mensal por cidade ────────────────────────────────────────────────
// Responde às perguntas da diretoria: quanto cada cidade melhorou ou piorou no mês
// e de onde veio a variação. Três indicadores (VTs abertas, revisita de manutenção,
// revisita de instalação), cada um comparado com o mês anterior e aberto em
// "contribuições": quantas OS a mais ou a menos cada bairro, equipe ou motivo trouxe.
// Mostra ONDE e COM QUEM a variação aconteceu; o que foi feito para causá-la
// (uma ação, um treinamento) não está no ERP.

export interface Periodo { id: string; label: string; from: Date; to: Date; parcial?: boolean }

/** Motivo de abertura e ação da equipe por OS (vem de /api/os-motivos). */
export type MotivosPorOS = Record<string, { motivo: string; acao: string }>

export interface Contribuicao { key: string; label: string; atual: number; anterior: number; delta: number }

export interface BlocoVT {
  atual: number
  anterior: number
  delta: number
  /** Variação percentual; null sem mês anterior. */
  pct: number | null
  porBairro: Contribuicao[]
  porMotivo: Contribuicao[]
  /** % das VTs executadas no mês que cumpriram o prazo; null sem VT executada. */
  noPrazoAtual: number | null
  noPrazoAnterior: number | null
}

export interface BlocoRevisita {
  reincAtual: number
  reincAnterior: number
  baseAtual: number
  baseAnterior: number
  taxaAtual: number | null
  taxaAnterior: number | null
  /** Variação da taxa em pontos percentuais. */
  deltaPP: number | null
  /** Quantos reincidentes a mais (ou a menos) vieram só de atender mais (ou menos) clientes. */
  efeitoBase: number | null
  /** O resto da variação: a taxa piorou ou melhorou. */
  efeitoTaxa: number | null
  revisitasAtual: number
  revisitasAnterior: number
  porEquipe: Contribuicao[]
  porBairro: Contribuicao[]
  porAcaoOrigem: Contribuicao[]
  porMotivoRetorno: Contribuicao[]
}

export type Tom = 'piora' | 'melhora' | 'neutro'
export interface Frase { tom: Tom; texto: string }

export interface PontoTendencia { id: string; label: string; vts: number; taxaManut: number | null; taxaInst: number | null; parcial: boolean }

export interface LeituraCidade {
  key: string
  cidade: string
  vt: BlocoVT
  manut: BlocoRevisita
  inst: BlocoRevisita
  saldo: Tom
  /** O selo explicado: quais indicadores melhoraram, pioraram ou ficaram estáveis. */
  porqueSaldo: string
  frases: { vt: Frase[]; manut: Frase[]; inst: Frase[] }
  tendencia: PontoTendencia[]
}

export interface LeituraMensal {
  atual: Periodo
  anterior: Periodo
  /** Todas as cidades somadas, para a linha de total e a abertura do PDF. */
  geral: LeituraCidade
  cidades: LeituraCidade[]
  /** Quantas OS dos dois meses tiveram o texto lido (motivo/ação). */
  cobertura: { lidas: number; total: number }
}

// Mudanças menores que isso são "estável": não vale explicar ruído.
const LIMIAR_VT_PCT = 5
const LIMIAR_PP = 0.5
const MIN_DELTA_CONTRIBUICAO = 2

// Abaixo disso a variação é mais sorte do que tendência: o texto avisa e não conta no saldo.
const MIN_BASE_TAXA = 30
const MIN_VTS = 20

const TODAS = '__todas__'

// chaveDaCidade normaliza acento e caixa; com dezenas de milhares de OS, vale guardar.
const cacheCidade = new Map<string, string>()
const cidadeDe = (nome: string | null | undefined): string => {
  const k = nome ?? ''
  let v = cacheCidade.get(k)
  if (v === undefined) { v = chaveDaCidade(k); cacheCidade.set(k, v) }
  return v
}

const dataDe = (raw: unknown): Date | null => parseDate(String(raw || '').split(' ')[0])
const dentro = (d: Date | null, p: Periodo) => !!d && d >= p.from && d <= p.to
const umaCasa = (n: number) => Math.round(n * 10) / 10
const pct = (parte: number, todo: number): number | null => (todo ? umaCasa(parte / todo * 100) : null)

/** VT aberta no período: assistência do tipo VT, pela data de cadastro. */
export function vtsAbertas(allRows: OSRow[], p: Periodo): OSRow[] {
  return allRows.filter(r => isAssistencia(r) && isVT(r) && !isCOPE(r) && !isReagend(r) && dentro(dataDe(r.datacadastro), p))
}

/** VTs executadas no período, por cidade: quantas foram medidas e quantas cumpriram o prazo. */
function prazoPorCidade(allRows: OSRow[], p: Periodo): Map<string, { ok: number; n: number }> {
  const m = new Map<string, { ok: number; n: number }>()
  const somar = (k: string, ok: boolean) => { const e = m.get(k) ?? { ok: 0, n: 0 }; e.n++; if (ok) e.ok++; m.set(k, e) }
  for (const r of allRows) {
    if (r._vtCumpridaNoPrazo === null || r._vtCumpridaNoPrazo === undefined || !isAssistencia(r) || !isVT(r)) continue
    if (!dentro(dataDe(r.dataexecucao), p)) continue
    somar(cidadeDe(r.nomedacidade), r._vtCumpridaNoPrazo)
    somar(TODAS, r._vtCumpridaNoPrazo)
  }
  return m
}

/** Conta ocorrências por chave nos dois meses e ordena pela variação. */
export function comparar(atual: Array<{ key: string; label: string }>, anterior: Array<{ key: string; label: string }>): Contribuicao[] {
  const m = new Map<string, Contribuicao>()
  const somar = (lista: Array<{ key: string; label: string }>, campo: 'atual' | 'anterior') => {
    for (const { key, label } of lista) {
      const c = m.get(key) ?? { key, label, atual: 0, anterior: 0, delta: 0 }
      c[campo]++
      m.set(key, c)
    }
  }
  somar(atual, 'atual')
  somar(anterior, 'anterior')
  return [...m.values()]
    .map(c => ({ ...c, delta: c.atual - c.anterior }))
    .sort((a, b) => b.delta - a.delta || b.atual - a.atual || a.label.localeCompare(b.label, 'pt-BR'))
}

/** Bairro de cada item, com a unificação de grafias do relatório de reincidências. */
function porBairro<T extends ClienteBase>(atual: T[], anterior: T[]): Contribuicao[] {
  const grupos = gruposDeBairro({ a: atual, p: anterior })
  const marcar = (id: 'a' | 'p') => grupos.flatMap(g => (g.itens[id] ?? []).map(() => ({ key: g.key, label: g.label })))
  return comparar(marcar('a'), marcar('p'))
}

const comoItem = (r: OSRow): ClienteBase => ({ chave: r.numos, cliente: '', cidade: (r.nomedacidade || '').trim(), bairro: (r.bairro || '').trim(), rows: [r] })

/** Cada revisita (retorno) com a OS de origem: a visita imediatamente anterior do cliente. */
function paresDeRevisita(clientes: ClienteReincidente[]): Array<{ cliente: ClienteReincidente; origem: OSRow; retorno: OSRow }> {
  return clientes.flatMap(cliente => {
    const rows = sortedClientRows(cliente.rows)
    return rows.slice(1).map((retorno, i) => ({ cliente, origem: rows[i], retorno }))
  })
}

interface DadosMes {
  vts: OSRow[]
  manut: { clientes: ClienteReincidente[]; base: ClienteBase[] }
  inst: { clientes: ClienteReincidente[]; base: ClienteBase[] }
  /** % das VTs executadas no mês que cumpriram o prazo (da cidade, ou de todas). */
  noPrazo: number | null
  prazo: Map<string, { ok: number; n: number }>
}

// O mesmo mês serve à lista de OS a ler e à leitura em si: calcula uma vez por conjunto de OS.
const cacheMeses = new WeakMap<OSRow[], Map<string, DadosMes>>()

function dadosDoMes(allRows: OSRow[], p: Periodo): DadosMes {
  const chave = `${p.from.getTime()}-${p.to.getTime()}`
  let porMes = cacheMeses.get(allRows)
  if (!porMes) { porMes = new Map(); cacheMeses.set(allRows, porMes) }
  const pronto = porMes.get(chave)
  if (pronto) return pronto
  const range = { from: p.from, to: p.to }
  const m = buildManutencaoRevisitaChurn(allRows, Number.POSITIVE_INFINITY, new Date(), range)
  const i = buildInstallChurn(allRows, Number.POSITIVE_INFINITY, new Date(), range)
  const prazo = prazoPorCidade(allRows, p)
  const total = prazo.get(TODAS)
  const dados: DadosMes = {
    vts: vtsAbertas(allRows, p),
    manut: { clientes: m.clientes, base: m.baseClientes ?? [] },
    inst: { clientes: i.clientes, base: i.baseClientes ?? [] },
    noPrazo: total ? pct(total.ok, total.n) : null,
    prazo,
  }
  porMes.set(chave, dados)
  return dados
}

function filtrarCidade(d: DadosMes, cidade: string): DadosMes {
  if (cidade === TODAS) return d
  const daCidade = <T extends { cidade: string }>(l: T[]) => l.filter(x => cidadeDe(x.cidade) === cidade)
  const prazo = d.prazo.get(cidade)
  return {
    vts: d.vts.filter(r => cidadeDe(r.nomedacidade) === cidade),
    manut: { clientes: daCidade(d.manut.clientes), base: daCidade(d.manut.base) },
    inst: { clientes: daCidade(d.inst.clientes), base: daCidade(d.inst.base) },
    noPrazo: prazo ? pct(prazo.ok, prazo.n) : null,
    prazo: d.prazo,
  }
}

function blocoVT(a: DadosMes, p: DadosMes, motivos: MotivosPorOS): BlocoVT {
  const motivo = (r: OSRow) => motivos[r.numos]?.motivo
  const marcarMotivo = (l: OSRow[]) => l.filter(r => motivo(r)).map(r => ({ key: motivo(r)!, label: motivo(r)! }))
  const delta = a.vts.length - p.vts.length
  return {
    atual: a.vts.length,
    anterior: p.vts.length,
    delta,
    pct: p.vts.length ? umaCasa(delta / p.vts.length * 100) : null,
    porBairro: porBairro(a.vts.map(comoItem), p.vts.map(comoItem)),
    porMotivo: comparar(marcarMotivo(a.vts), marcarMotivo(p.vts)),
    noPrazoAtual: a.noPrazo,
    noPrazoAnterior: p.noPrazo,
  }
}

function blocoRevisita(a: { clientes: ClienteReincidente[]; base: ClienteBase[] }, p: { clientes: ClienteReincidente[]; base: ClienteBase[] }, motivos: MotivosPorOS): BlocoRevisita {
  const taxaAtual = pct(a.clientes.length, a.base.length)
  const taxaAnterior = pct(p.clientes.length, p.base.length)
  const paresA = paresDeRevisita(a.clientes)
  const paresP = paresDeRevisita(p.clientes)
  const equipe = (pares: typeof paresA) => pares.map(x => equipeDaOS(x.origem)).filter(e => e && e !== '—').map(e => ({ key: e, label: e }))
  const acao = (pares: typeof paresA) => pares.map(x => motivos[x.origem.numos]?.acao).filter((v): v is string => !!v).map(v => ({ key: v, label: v }))
  const motivoRet = (pares: typeof paresA) => pares.map(x => motivos[x.retorno.numos]?.motivo).filter((v): v is string => !!v).map(v => ({ key: v, label: v }))

  let efeitoBase: number | null = null
  let efeitoTaxa: number | null = null
  if (p.base.length && a.base.length) {
    efeitoBase = Math.round((a.base.length - p.base.length) * (p.clientes.length / p.base.length))
    efeitoTaxa = (a.clientes.length - p.clientes.length) - efeitoBase
  }
  return {
    reincAtual: a.clientes.length,
    reincAnterior: p.clientes.length,
    baseAtual: a.base.length,
    baseAnterior: p.base.length,
    taxaAtual, taxaAnterior,
    deltaPP: taxaAtual !== null && taxaAnterior !== null ? umaCasa(taxaAtual - taxaAnterior) : null,
    efeitoBase, efeitoTaxa,
    revisitasAtual: paresA.length,
    revisitasAnterior: paresP.length,
    porEquipe: comparar(equipe(paresA), equipe(paresP)),
    porBairro: porBairro(a.clientes, p.clientes),
    porAcaoOrigem: comparar(acao(paresA), acao(paresP)),
    porMotivoRetorno: comparar(motivoRet(paresA), motivoRet(paresP)),
  }
}

// ─── Frases ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('pt-BR')
const fmt1 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const sinal = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : '0')
export const sinalPP = (n: number) => (n > 0 ? `+${fmt1(n)}` : n < 0 ? `−${fmt1(Math.abs(n))}` : '0,0')

/** As que andaram na mesma direção da variação total, das maiores para as menores. */
export function puxaram(lista: Contribuicao[], direcao: number, max = 3): Contribuicao[] {
  return lista
    .filter(c => (direcao > 0 ? c.delta >= MIN_DELTA_CONTRIBUICAO : c.delta <= -MIN_DELTA_CONTRIBUICAO))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, max)
}

const listar = (l: Contribuicao[]) => l.map(c => `${c.label} ${sinal(c.delta)}`).join(', ')

/** Quanto do movimento bruto na mesma direção (só as altas, ou só as quedas) os itens explicam. */
function concentracao(destaque: Contribuicao[], todos: Contribuicao[], direcao: number): number {
  const bruto = Math.abs(todos.filter(c => (direcao > 0 ? c.delta > 0 : c.delta < 0)).reduce((s, c) => s + c.delta, 0))
  return bruto ? Math.round(Math.abs(destaque.reduce((s, c) => s + c.delta, 0)) / bruto * 100) : 0
}

const plural = (n: number, um: string, varios: string) => `${fmt(n)} ${Math.abs(n) === 1 ? um : varios}`

const poucasVTs = (v: BlocoVT) => Math.max(v.atual, v.anterior) < MIN_VTS

function frasesVT(v: BlocoVT, mesAnterior: string): Frase[] {
  if (!v.atual && !v.anterior) return []
  const frases: Frase[] = []
  const tom: Tom = v.pct === null || Math.abs(v.pct) < LIMIAR_VT_PCT || poucasVTs(v) ? 'neutro' : v.delta > 0 ? 'piora' : 'melhora'
  frases.push({
    tom,
    texto: v.delta === 0
      ? `${fmt(v.atual)} VTs abertas, o mesmo número de ${mesAnterior}.`
      : `${fmt(v.atual)} VTs abertas, ${sinal(v.delta)}${v.pct !== null ? ` (${sinalPP(v.pct)}%)` : ''} contra ${mesAnterior}${tom === 'neutro' ? ': praticamente estável' : ''}.`,
  })
  if (tom !== 'neutro') {
    const bairros = puxaram(v.porBairro, v.delta)
    if (bairros.length) {
      const parte = concentracao(bairros, v.porBairro, v.delta)
      const direcao = v.delta > 0 ? 'alta' : 'queda'
      frases.push({
        tom,
        texto: parte >= 60
          ? `A ${direcao} ficou concentrada em ${listar(bairros)}: ${parte}% de tudo o que ${v.delta > 0 ? 'subiu' : 'caiu'} nos bairros.`
          : `A ${direcao} veio espalhada pelos bairros; os maiores foram ${listar(bairros)}.`,
      })
    }
    const motivos = puxaram(v.porMotivo, v.delta)
    if (motivos.length) frases.push({ tom, texto: `Por motivo de abertura: ${listar(motivos)}.` })
    const contramao = puxaram(v.porBairro, -v.delta, 2)
    if (contramao.length) frases.push({ tom: tom === 'piora' ? 'melhora' : 'piora', texto: `Na direção contrária: ${listar(contramao)}.` })
  }
  if (v.noPrazoAtual !== null && v.noPrazoAnterior !== null) {
    const d = umaCasa(v.noPrazoAtual - v.noPrazoAnterior)
    frases.push({ tom: Math.abs(d) < 2 ? 'neutro' : d > 0 ? 'melhora' : 'piora', texto: `VTs atendidas no prazo: ${fmt1(v.noPrazoAtual)}% (${sinalPP(d)} pp).` })
  }
  return frases
}

function frasesRevisita(r: BlocoRevisita, mesAnterior: string, comAcao: boolean, rotuloEquipe: string): Frase[] {
  if (!r.baseAtual && !r.baseAnterior) return []
  if (r.taxaAtual === null) return [{ tom: 'neutro', texto: 'Sem clientes atendidos no mês para calcular a taxa.' }]
  const frases: Frase[] = []
  const pouca = r.baseAtual < MIN_BASE_TAXA
  const estavel = r.deltaPP !== null && Math.abs(r.deltaPP) < LIMIAR_PP
  const tom: Tom = r.deltaPP === null || estavel || pouca ? 'neutro' : r.deltaPP > 0 ? 'piora' : 'melhora'
  frases.push({
    tom,
    texto: `Taxa de ${fmt1(r.taxaAtual)}%${r.deltaPP !== null ? ` (${sinalPP(r.deltaPP)} pp contra ${mesAnterior})` : ''}: ${plural(r.reincAtual, 'cliente reincidente', 'clientes reincidentes')} de ${fmt(r.baseAtual)} atendidos${estavel ? '; praticamente estável' : ''}.`,
  })
  if (pouca) {
    frases.push({ tom: 'neutro', texto: `Base pequena (${plural(r.baseAtual, 'cliente atendido', 'clientes atendidos')}): um caso a mais ou a menos muda muito a taxa.` })
    return frases
  }
  const dReinc = r.reincAtual - r.reincAnterior
  if (r.efeitoBase !== null && r.efeitoTaxa !== null && dReinc !== 0 && r.efeitoBase !== 0) {
    frases.push({
      tom: 'neutro',
      texto: `Reincidentes ${sinal(dReinc)} contra ${mesAnterior}: ${sinal(r.efeitoBase)} pelo volume de atendidos (${r.baseAtual > r.baseAnterior ? 'maior' : 'menor'}) e ${sinal(r.efeitoTaxa)} pela taxa.`,
    })
  }
  const dRev = r.revisitasAtual - r.revisitasAnterior
  if (tom !== 'neutro' && dRev !== 0) {
    const equipes = puxaram(r.porEquipe, dRev)
    if (equipes.length) frases.push({ tom, texto: `${rotuloEquipe}: ${listar(equipes)} (revisitas).` })
    const bairros = puxaram(r.porBairro, dRev)
    if (bairros.length) frases.push({ tom, texto: `Bairros: ${listar(bairros)} (clientes reincidentes).` })
  }
  if (comAcao) {
    const totalAcoes = r.porAcaoOrigem.reduce((s, c) => s + c.atual, 0)
    const topo = [...r.porAcaoOrigem].sort((a, b) => b.atual - a.atual).filter(c => c.atual > 0).slice(0, 2)
    if (totalAcoes >= 5 && topo.length) {
      frases.push({ tom: 'neutro', texto: `Na visita que antecedeu a revisita, a equipe registrou principalmente: ${topo.map(c => `${c.label} (${Math.round(c.atual / totalAcoes * 100)}%)`).join(', ')}.` })
    }
  }
  const motivos = puxaram(r.porMotivoRetorno, dRev, 2)
  if (tom !== 'neutro' && motivos.length) frases.push({ tom, texto: `Motivo do retorno: ${listar(motivos)}.` })
  return frases
}

/** Saldo do mês: cada indicador que mudou de verdade vota. */
function saldoDe(vt: BlocoVT, manut: BlocoRevisita, inst: BlocoRevisita): Tom {
  const s = votos(vt, manut, inst).reduce((soma, v) => soma + (v.tom === 'piora' ? 1 : v.tom === 'melhora' ? -1 : 0), 0)
  return s > 0 ? 'piora' : s < 0 ? 'melhora' : 'neutro'
}

/** O que cada indicador disse no mês — a base do saldo e da sua explicação. */
function votos(vt: BlocoVT, manut: BlocoRevisita, inst: BlocoRevisita): Array<{ tom: Tom; texto: string }> {
  const lista: Array<{ tom: Tom; texto: string }> = []
  if (vt.atual || vt.anterior) {
    const mudou = vt.pct !== null && Math.abs(vt.pct) >= LIMIAR_VT_PCT && !poucasVTs(vt)
    const aviso = !mudou && poucasVTs(vt) ? ', poucas VTs' : ''
    lista.push({ tom: mudou ? (vt.delta > 0 ? 'piora' : 'melhora') : 'neutro', texto: `VTs abertas (${vt.pct === null ? sinal(vt.delta) : `${sinalPP(vt.pct)}%`}${aviso})` })
  }
  for (const [nome, r] of [['revisita de manutenção', manut], ['revisita de instalação', inst]] as const) {
    if (r.deltaPP === null) continue
    const mudou = Math.abs(r.deltaPP) >= LIMIAR_PP && r.baseAtual >= MIN_BASE_TAXA
    const aviso = !mudou && r.baseAtual < MIN_BASE_TAXA && Math.abs(r.deltaPP) >= LIMIAR_PP ? `, base pequena: ${plural(r.baseAtual, 'atendido', 'atendidos')}` : ''
    lista.push({ tom: mudou ? (r.deltaPP > 0 ? 'piora' : 'melhora') : 'neutro', texto: `${nome} (${sinalPP(r.deltaPP)} pp${aviso})` })
  }
  return lista
}

/** O selo explicado: "Melhoraram: VTs abertas (−35,1%). Piorou: revisita de instalação (+1,3 pp). Estável: …". */
export function explicarSaldo(vt: BlocoVT, manut: BlocoRevisita, inst: BlocoRevisita): string {
  const v = votos(vt, manut, inst)
  const grupo = (tom: Tom, um: string, varios: string) => {
    const l = v.filter(x => x.tom === tom)
    if (!l.length) return ''
    const texto = l.map(x => x.texto).join(', ')
    return `${l.length === 1 ? um : varios}: ${texto.charAt(0).toUpperCase()}${texto.slice(1)}.`
  }
  return [grupo('melhora', 'Melhorou', 'Melhoraram'), grupo('piora', 'Piorou', 'Pioraram'), grupo('neutro', 'Sem mudança relevante', 'Sem mudança relevante')].filter(Boolean).join(' ')
}

/** OS cujo texto interessa para motivo/ação: VTs dos dois meses e as OS das revisitas. */
export function osParaLer(allRows: OSRow[], periodos: Periodo[]): string[] {
  const numos = new Set<string>()
  for (const p of periodos) {
    const d = dadosDoMes(allRows, p)
    d.vts.forEach(r => numos.add(r.numos))
    for (const c of [...d.manut.clientes, ...d.inst.clientes]) c.rows.forEach(r => numos.add(r.numos))
  }
  return [...numos]
}

/**
 * Leitura do mês `meses[0]` contra `meses[1]`; os demais (até 6) entram só na tendência.
 * `meses` vai do mais recente para o mais antigo.
 */
export function buildLeituraMensal(allRows: OSRow[], meses: Periodo[], motivos: MotivosPorOS = {}): LeituraMensal {
  const [atual, anterior] = meses
  const dados = meses.map(p => dadosDoMes(allRows, p))
  const [a, p] = dados

  const nomes = opcoesDeCidade([...a.vts, ...p.vts].map(r => r.nomedacidade)
    .concat([...a.manut.base, ...p.manut.base, ...a.inst.base, ...p.inst.base].map(c => c.cidade)))

  const montar = (key: string, cidade: string): LeituraCidade => {
    const da = filtrarCidade(a, key)
    const dp = filtrarCidade(p, key)
    const vt = blocoVT(da, dp, motivos)
    const manut = blocoRevisita(da.manut, dp.manut, motivos)
    const inst = blocoRevisita(da.inst, dp.inst, motivos)
    const saldo = saldoDe(vt, manut, inst)
    const tendencia = meses.map((m, i): PontoTendencia => {
      const d = filtrarCidade(dados[i], key)
      return { id: m.id, label: m.label, parcial: !!m.parcial, vts: d.vts.length, taxaManut: pct(d.manut.clientes.length, d.manut.base.length), taxaInst: pct(d.inst.clientes.length, d.inst.base.length) }
    }).reverse()
    return {
      key, cidade, vt, manut, inst,
      saldo,
      porqueSaldo: explicarSaldo(vt, manut, inst),
      frases: {
        vt: frasesVT(vt, anterior.label),
        manut: frasesRevisita(manut, anterior.label, true, 'Equipe da visita anterior à revisita'),
        inst: frasesRevisita(inst, anterior.label, false, 'Equipe da instalação ou da visita anterior'),
      },
      tendencia,
    }
  }

  const cidades = nomes.map(o => montar(o.value, o.label))
    .sort((x, y) => (y.vt.atual + y.manut.baseAtual) - (x.vt.atual + x.manut.baseAtual))

  const lidasDe = (l: OSRow[]) => l.filter(r => motivos[r.numos]).length
  const todasVTs = [...a.vts, ...p.vts]
  return {
    atual, anterior,
    geral: montar(TODAS, 'Todas as cidades'),
    cidades,
    cobertura: { lidas: lidasDe(todasVTs), total: todasVTs.length },
  }
}
