import type { ClienteBase, ClienteReincidente } from '../../lib/builders/churn'
import { isCOPE, isExecucaoReal, isForaDeRevisita, isReagend, parseDate, parseDateTime } from '../../lib/transform'
import type { OSRow } from '../../lib/types'
import { shortEquipe } from '../../lib/osFormat'

export interface ReincidenciaFilters { fornecedor: string; equipe: string; cidade: string }

export function summarizeOSObservation(raw: string): string {
  const text = raw.replace(/\r\n?/g, '\n').trim()
  if (!text) return ''

  const isStructured = /Informações da Execução:|\bProcedimentos:|\bLOCALIZAÇÃO\b|\([X ]\)/i.test(text)
  if (!isStructured) return text

  const firstBlock = text.split(/\n\s*\n/).map(block => block.trim()).find(Boolean) || ''
  const execution = text.match(/Informações da Execução:\s*[\s\S]*?\bObs:\s*([^\n]*)(?:\n|$)/i)?.[1]?.trim() || ''
  const parts = []
  if (firstBlock) parts.push(`Motivo da abertura: ${firstBlock.replace(/\s+/g, ' ')}`)
  if (execution) parts.push(`O que foi feito: ${execution}`)
  return parts.join('\n') || 'Sem informação essencial registrada'
}

export function getOSObservation(row: OSRow): string {
  const value = row.observacoes || row.observacaocritica || row.obs || row.observacao || row.nota || row.descricaoobs || row.descricao_obs
  return summarizeOSObservation(String(value || '')) || 'Sem observação registrada'
}

export function executionDate(row: OSRow): Date | null {
  return parseDateTime(row.dataexecucao || row.databaixa || '')
}

export function sortedClientRows(rows: OSRow[]): OSRow[] {
  return [...rows].sort((a, b) => (executionDate(a)?.getTime() ?? 0) - (executionDate(b)?.getTime() ?? 0))
}

export function filterReincidentes<T extends { rows: OSRow[] }>(clientes: T[], filters: ReincidenciaFilters): T[] {
  return clientes.filter(cliente => {
    const fornecedorOk = !filters.fornecedor || cliente.rows.some(row => row._fornecedor === filters.fornecedor)
    const equipeOk = !filters.equipe || cliente.rows.some(row => shortEquipe(row.nomedaequipe).startsWith(filters.equipe))
    const cidadeOk = !filters.cidade || cliente.rows.some(row => row.nomedacidade === filters.cidade)
    return fornecedorOk && equipeOk && cidadeOk
  })
}

export function mergeOSObservations(clientes: ClienteReincidente[], details: Record<string, { observacoes: string; observacaocritica: string }> = {}): ClienteReincidente[] {
  return clientes.map(cliente => ({
    ...cliente,
    rows: cliente.rows.map(row => ({ ...row, ...(details[row.numos] || {}) })),
  }))
}

export interface ReincidenciaPair {
  tipo: string; nomecliente: string; nomedacidade: string
  chave_cliente: string; equipe_orig: string; equipe_rev: string
  numos_orig: string; servico_orig: string; obs_orig: string
  numos_rev: string; servico_rev: string; obs_rev: string; dias_entre: number
}

export function buildReincidenciaPairs(clientes: ClienteReincidente[]): ReincidenciaPair[] {
  return clientes.flatMap(cliente => {
    const rows = sortedClientRows(cliente.rows)
    return rows.slice(1).map((current, index) => {
      const previous = rows[index]
      const prevDate = executionDate(previous)?.getTime() ?? 0
      const currDate = executionDate(current)?.getTime() ?? 0
      return {
        tipo: 'manutencao', nomecliente: cliente.cliente, nomedacidade: cliente.cidade,
        chave_cliente: cliente.chave, equipe_orig: shortEquipe(previous.nomedaequipe).split(' - ')[0], equipe_rev: shortEquipe(current.nomedaequipe).split(' - ')[0],
        numos_orig: previous.numos, servico_orig: String(previous.servico || previous.tiposervico || ''), obs_orig: getOSObservation(previous),
        numos_rev: current.numos, servico_rev: String(current.servico || current.tiposervico || ''), obs_rev: getOSObservation(current),
        dias_entre: Math.max(0, Math.round((currDate - prevDate) / 86400000)),
      }
    })
  })
}

export interface TeamRecurrenceRank {
  equipe: string; reincidentes: number; revisitas: number; base: number; taxa: number
}

export function buildTeamRecurrenceRanking(clientes: ClienteReincidente[], baseRows: OSRow[], now = new Date(), range: { from: Date; to: Date } | null = null, tipoBase: 'MANUTENCAO' | 'INSTALACAO' = 'MANUTENCAO'): TeamRecurrenceRank[] {
  const upper = range ? new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate()) : null
  const cutoff = range ? new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate())
    : (() => { const c = new Date(now.getFullYear(), now.getMonth(), now.getDate()); c.setDate(c.getDate() - 60); return c })()
  const baseByTeam = new Map<string, Set<string>>()
  for (const row of baseRows) {
    if (isCOPE(row) || isReagend(row) || isForaDeRevisita(row) || row._tipo !== tipoBase || !isExecucaoReal(row.descsituacao)) continue
    const date = parseDate((row.dataexecucao || row.databaixa || '').split(' ')[0])
    if (!date || date < cutoff) continue
    if (upper && date > upper) continue
    const equipe = shortEquipe(row.nomedaequipe).split(' - ')[0]
    const client = String(row.codigocliente || row.nomecliente || '').trim()
    if (!equipe || equipe === '—' || !client) continue
    if (!baseByTeam.has(equipe)) baseByTeam.set(equipe, new Set())
    baseByTeam.get(equipe)!.add(client)
  }

  const byTeam = new Map<string, { clients: Set<string>; pairs: number }>()
  for (const pair of buildReincidenciaPairs(clientes)) {
    if (!pair.equipe_orig || pair.equipe_orig === '—') continue
    if (!byTeam.has(pair.equipe_orig)) byTeam.set(pair.equipe_orig, { clients: new Set(), pairs: 0 })
    const entry = byTeam.get(pair.equipe_orig)!
    entry.clients.add(pair.chave_cliente)
    entry.pairs++
  }
  return [...byTeam].map(([equipe, entry]) => {
    const base = baseByTeam.get(equipe)?.size || 0
    return { equipe, reincidentes: entry.clients.size, revisitas: entry.pairs, base, taxa: base ? Math.round(entry.clients.size / base * 100) : 0 }
  }).sort((a, b) => b.taxa - a.taxa || b.reincidentes - a.reincidentes || a.equipe.localeCompare(b.equipe)).slice(0, 10)
}

export function buildIntervalDistribution(pairs: Pick<ReincidenciaPair, 'dias_entre'>[]) {
  const bands = [
    { faixa: '0–3d', min: 0, max: 3 }, { faixa: '4–7d', min: 4, max: 7 },
    { faixa: '8–15d', min: 8, max: 15 }, { faixa: '16–30d', min: 16, max: 30 },
    { faixa: '31–60d', min: 31, max: 60 },
  ]
  return bands.map(band => ({ faixa: band.faixa, total: pairs.filter(pair => pair.dias_entre >= band.min && pair.dias_entre <= band.max).length }))
}

// ─── Resumo por bairro ────────────────────────────────────────────────────────
// "CENTRO" existe nas cinco cidades — agrupar só pelo nome do bairro misturaria
// clientes de cidades diferentes, por isso a chave é cidade + bairro.
export type DiagnosticoBairro = 'rede' | 'execucao' | 'misto' | 'poucos'

export interface BairroResumo {
  key: string
  bairro: string
  cidade: string
  /** Nome para o gráfico: o bairro, com a cidade ao lado só quando o nome se repete. */
  label: string
  clientes: ClienteReincidente[]
  nClientes: number
  /** Retornos: cada OS depois da primeira do cliente (mesma contagem dos pares do relatório). */
  nRevisitas: number
  /** Todas as OS envolvidas (origem + retornos) — a mesma contagem do card "OS envolvidas":
   *  a soma de nOS de todos os bairros fecha com ele. */
  nOS: number
  /** Participação no total de OS envolvidas do filtro. */
  pct: number
  /** Clientes atendidos no bairro no período (reincidentes ou não); 0 se a base não foi informada. */
  nBase: number
  /** Reincidentes ÷ atendidos, em %, com uma casa. null sem base. */
  taxa: number | null
  /** OS do mesmo bairro no período anterior; null sem comparação. */
  nOSAnterior: number | null
  /** nOS − nOSAnterior; null sem comparação. */
  delta: number | null
  /** Quem fez a visita de origem de cada revisita, do mais ao menos citado. */
  equipes: Array<{ equipe: string; n: number }>
  diagnostico: DiagnosticoBairro
  equipeDominante: string | null
  /** Parcela das revisitas cuja origem foi da equipe dominante (0–1). */
  shareDominante: number
}

export interface BairroOpcoes {
  /** Clientes atendidos no período (denominador da taxa). */
  base?: ClienteBase[]
  /** Reincidentes do período anterior, já com os mesmos filtros. */
  anterior?: ClienteReincidente[]
}

const SEM_BAIRRO = 'Sem bairro'

// O cadastro escreve o mesmo bairro de jeitos diferentes ("VITORIA VALE" e
// "VITÓRIA VALE"), então a chave ignora acento, caixa, pontuação e espaços sobrando.
const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

// O ERP corta o nome do bairro em 20 caracteres ("RESIDENCIAL ESPERANC"): um nome
// com exatamente esse tamanho pode ser a versão cortada de um bairro maior.
const LIMITE_BAIRRO_ERP = 20

// Diagnóstico rede × execução (indício, não prova). Com poucas revisitas não há
// padrão para ler. Concentrado numa equipe = execução; espalhado por várias
// equipes, em vários clientes = o problema é do lugar (rede).
const MIN_REVISITAS_DIAGNOSTICO = 4
const SHARE_EXECUCAO = 0.6
const SHARE_REDE_MAX = 0.5
const MIN_EQUIPES_REDE = 3
const MIN_CLIENTES_REDE = 3

export const cidadeCurta = (cidade: string): string => {
  const base = normalizar(cidade)
  if (base === 'PINDAMONHANGABA') return 'Pinda'
  if (base === 'SAO JOSE DOS CAMPOS') return 'SJC'
  return cidade.trim() ? cidade.trim().charAt(0).toUpperCase() + cidade.trim().slice(1).toLowerCase() : '—'
}

type Origem = 'rev' | 'base' | 'ant'
interface GrupoBairro {
  cidadeKey: string
  bairroKey: string
  variantesBairro: Map<string, number>
  variantesCidade: Map<string, number>
  itens: Record<Origem, Array<ClienteBase | ClienteReincidente>>
}

const maisUsado = (variantes: Map<string, number>): string =>
  [...variantes].sort((a, b) =>
    b[1] - a[1] ||
    Number(/[À-ÿ]/.test(b[0])) - Number(/[À-ÿ]/.test(a[0])) ||  // empate: a grafia com acento
    b[0].length - a[0].length)[0][0]

function somar(destino: Map<string, number>, origem: Map<string, number>) {
  for (const [nome, n] of origem) destino.set(nome, (destino.get(nome) ?? 0) + n)
}

function juntar(destino: GrupoBairro, origem: GrupoBairro) {
  for (const o of ['rev', 'base', 'ant'] as Origem[]) destino.itens[o].push(...origem.itens[o])
  somar(destino.variantesBairro, origem.variantesBairro)
  somar(destino.variantesCidade, origem.variantesCidade)
}

const equipeDaOS = (row: OSRow): string => shortEquipe(row.nomedaequipe).split(' - ')[0].trim()

/** Quem fez a visita anterior a cada revisita — a mesma atribuição do ranking de equipes. */
function contarEquipesDeOrigem(clientes: ClienteReincidente[]): Array<{ equipe: string; n: number }> {
  const contagem = new Map<string, number>()
  for (const cliente of clientes) {
    const rows = sortedClientRows(cliente.rows)
    for (let i = 1; i < rows.length; i++) {
      const equipe = equipeDaOS(rows[i - 1])
      if (!equipe || equipe === '—') continue
      contagem.set(equipe, (contagem.get(equipe) ?? 0) + 1)
    }
  }
  return [...contagem].map(([equipe, n]) => ({ equipe, n })).sort((a, b) => b.n - a.n || a.equipe.localeCompare(b.equipe))
}

function diagnosticar(equipes: Array<{ equipe: string; n: number }>, nClientes: number): { diagnostico: DiagnosticoBairro; equipeDominante: string | null; shareDominante: number } {
  const total = equipes.reduce((s, e) => s + e.n, 0)
  const topo = equipes[0]
  const share = topo && total ? topo.n / total : 0
  if (total < MIN_REVISITAS_DIAGNOSTICO) return { diagnostico: 'poucos', equipeDominante: topo?.equipe ?? null, shareDominante: share }
  if (share >= SHARE_EXECUCAO) return { diagnostico: 'execucao', equipeDominante: topo.equipe, shareDominante: share }
  if (equipes.length >= MIN_EQUIPES_REDE && share <= SHARE_REDE_MAX && nClientes >= MIN_CLIENTES_REDE) return { diagnostico: 'rede', equipeDominante: topo.equipe, shareDominante: share }
  return { diagnostico: 'misto', equipeDominante: topo.equipe, shareDominante: share }
}

export function buildBairroSummary(clientes: ClienteReincidente[], { base = [], anterior }: BairroOpcoes = {}): BairroResumo[] {
  const brutos = new Map<string, GrupoBairro>()
  const adicionar = (item: ClienteBase | ClienteReincidente, origem: Origem) => {
    const bairro = item.bairro.trim() || SEM_BAIRRO
    const cidade = item.cidade.trim()
    const cidadeKey = normalizar(cidade)
    const bairroKey = normalizar(bairro) || normalizar(SEM_BAIRRO)
    const key = `${cidadeKey}|${bairroKey}`
    const grupo: GrupoBairro = brutos.get(key) ?? { cidadeKey, bairroKey, variantesBairro: new Map(), variantesCidade: new Map(), itens: { rev: [], base: [], ant: [] } }
    grupo.itens[origem].push(item)
    grupo.variantesBairro.set(bairro, (grupo.variantesBairro.get(bairro) ?? 0) + 1)
    grupo.variantesCidade.set(cidade, (grupo.variantesCidade.get(cidade) ?? 0) + 1)
    brutos.set(key, grupo)
  }
  clientes.forEach(c => adicionar(c, 'rev'))
  base.forEach(c => adicionar(c, 'base'))
  anterior?.forEach(c => adicionar(c, 'ant'))

  // Une o nome cortado ao completo — só quando há um único candidato na mesma cidade.
  for (const [key, corte] of [...brutos]) {
    if (corte.bairroKey.length !== LIMITE_BAIRRO_ERP) continue
    const candidatos = [...brutos.values()].filter(g =>
      g !== corte && g.cidadeKey === corte.cidadeKey && g.bairroKey.length > LIMITE_BAIRRO_ERP && g.bairroKey.startsWith(corte.bairroKey))
    if (candidatos.length !== 1) continue
    juntar(candidatos[0], corte)
    brutos.delete(key)
  }

  // Só entram os bairros com revisita agora; a base e o período anterior só medem.
  const grupos = [...brutos].filter(([, g]) => g.itens.rev.length > 0)
  const nomeRepetido = new Map<string, number>()
  const nomes = new Map<string, { bairro: string; cidade: string }>()
  for (const [key, g] of grupos) {
    const nome = { bairro: maisUsado(g.variantesBairro), cidade: maisUsado(g.variantesCidade) }
    nomes.set(key, nome)
    nomeRepetido.set(nome.bairro, (nomeRepetido.get(nome.bairro) ?? 0) + 1)
  }

  const totalOS = clientes.reduce((sum, c) => sum + c.rows.length, 0)
  const osDe = (lista: Array<ClienteBase | ClienteReincidente>) => lista.reduce((sum, c) => sum + c.rows.length, 0)

  return grupos.map(([key, g]): BairroResumo => {
    const revs = g.itens.rev as ClienteReincidente[]
    const { bairro, cidade } = nomes.get(key)!
    const nClientes = revs.length
    // Todo reincidente é cliente atendido: a base nunca fica abaixo dele.
    const nBase = base.length ? Math.max(g.itens.base.length, nClientes) : 0
    const nOS = osDe(revs)
    const nOSAnterior = anterior ? osDe(g.itens.ant) : null
    const equipes = contarEquipesDeOrigem(revs)
    return {
      key, bairro, cidade,
      label: (nomeRepetido.get(bairro) ?? 0) > 1 ? `${bairro} · ${cidadeCurta(cidade)}` : bairro,
      clientes: [...revs].sort((a, b) => b.visitas - a.visitas || a.cliente.localeCompare(b.cliente)),
      nClientes,
      nRevisitas: revs.reduce((sum, c) => sum + Math.max(0, c.rows.length - 1), 0),
      nOS,
      pct: totalOS ? Math.round(nOS / totalOS * 100) : 0,
      nBase,
      taxa: nBase ? Math.round(nClientes / nBase * 1000) / 10 : null,
      nOSAnterior,
      delta: nOSAnterior === null ? null : nOS - nOSAnterior,
      equipes,
      ...diagnosticar(equipes, nClientes),
    }
  }).sort((a, b) => b.nOS - a.nOS || b.nClientes - a.nClientes || a.label.localeCompare(b.label))
}

/** Período imediatamente anterior ao filtrado: o mês civil anterior quando o filtro é
 *  um mês inteiro, senão a mesma quantidade de dias logo antes. */
export function periodoAnterior(range: { from: Date; to: Date }): { from: Date; to: Date } {
  const from = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate())
  const to = new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate())
  const fimDoMes = new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate()
  if (from.getDate() === 1 && from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth() && to.getDate() === fimDoMes) {
    return { from: new Date(from.getFullYear(), from.getMonth() - 1, 1), to: new Date(from.getFullYear(), from.getMonth(), 0) }
  }
  const dias = Math.round((to.getTime() - from.getTime()) / 86400000) + 1
  return { from: new Date(from.getFullYear(), from.getMonth(), from.getDate() - dias), to: new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1) }
}

export const DIAGNOSTICO_LABEL: Record<DiagnosticoBairro, string> = {
  rede: 'Indício de rede', execucao: 'Indício de execução', misto: 'Padrão misto', poucos: 'Poucos casos',
}

/** Frase curta que justifica o selo — sempre como indício, nunca como veredito. */
export function explicarDiagnostico(b: BairroResumo): string {
  const share = Math.round(b.shareDominante * 100)
  switch (b.diagnostico) {
    case 'rede':
      return `${b.equipes.length} equipes diferentes fizeram a visita de origem e nenhuma passa de ${share}% das revisitas: o problema parece do lugar (rede, CTO), não de uma equipe.`
    case 'execucao':
      return `${b.equipeDominante} fez a visita de origem em ${share}% das revisitas: o problema parece de execução dessa equipe.`
    case 'misto':
      return `Sem padrão claro: ${b.equipeDominante} lidera com ${share}% das revisitas, entre ${b.equipes.length} ${b.equipes.length === 1 ? 'equipe' : 'equipes'}.`
    default:
      return 'Menos de 4 revisitas no bairro: pouco para dizer se é rede ou execução.'
  }
}

/** "▲ +5", "▼ −3" ou "= 0"; vazio sem período anterior. */
export function formatarDelta(delta: number | null): string {
  if (delta === null) return ''
  if (delta > 0) return `▲ +${delta}`
  if (delta < 0) return `▼ −${Math.abs(delta)}`
  return '= 0'
}
