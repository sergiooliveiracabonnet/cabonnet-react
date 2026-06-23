import { shortEquipe } from './osFormat'
import type { OSRow, DateFilter, Fornecedor, TipoEquipe, SlaLimits } from './types'

// OS concluída canonicamente: inclui QUALQUER fechamento formal.
// Usar para: revisitas, cohort, MTTR, "está essa OS encerrada?"
export const isConcluida = (s: string | undefined | null): boolean =>
  (s?.startsWith('Concluída') ?? false) || s === 'Atendimento/Finalizadas'

// OS executada REALMENTE por equipe de campo.
// Exclui fechamentos internos como "Concluída/Sem Execução" e "Baixa/Fechamento".
// Usar para: KPIs de performance, taxa de conclusão, métricas por fornecedor.
export const isExecucaoReal = (s: string | undefined | null): boolean =>
  s === 'Concluída' || s === 'Atendimento/Finalizadas'

// ─── Date Filter ─────────────────────────────────────────────────────────────

export function applyDateFilter(rows: OSRow[], dateFilter: DateFilter | null): OSRow[] {
  const minYear = new Date().getFullYear() - 1
  const yearFiltered = rows.filter(r => {
    const raw = r.datacadastro
    if (!raw) return true
    const dt = parseDate(raw)
    return !dt || dt.getFullYear() >= minYear
  })

  if (!dateFilter) return yearFiltered
  const { from, to, campo = 'datacadastro' } = dateFilter
  if (!from && !to) return yearFiltered
  return yearFiltered.filter(r => {
    const raw = r[campo as keyof OSRow] as string | undefined
    if (!raw) return true
    const dt = parseDate(raw)
    if (!dt) return true
    if (from && dt < from) return false
    if (to   && dt > to)   return false
    return true
  })
}

// ─── Core CSV Parsing ─────────────────────────────────────────────────────────

export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const dateOnly = s.split(' ')[0]
  const parts = dateOnly.split(/[/-]/)
  if (parts.length < 3) return null
  const [d, m, y] = parts.map(Number)
  if (!d || !m || !y || m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, m - 1, d)
  // Rejeita datas que rolaram (ex: 32/01 vira 01/02)
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return dt
}

export function parseDateTime(s: string | null | undefined): Date | null {
  if (!s) return null
  // split(' ') sem limite: espaços duplicados ou lixo à direita criam mais
  // de 2 segmentos — tratamos isso como entrada malformada em vez de ignorar
  // silenciosamente (mesma armadilha do truncamento detectada no parser Python).
  const segments = s.trim().split(' ').filter(Boolean)
  if (segments.length < 1 || segments.length > 2) return null
  const [datePart, timePart] = segments
  const parts = datePart.split(/[/-]/)
  if (parts.length < 3) return null
  const [d, m, y] = parts.map(Number)
  if (!d || !m || !y || m < 1 || m > 12 || d < 1 || d > 31) return null
  let hh = 0
  let mi = 0
  if (timePart) {
    const timeParts = timePart.split(':')
    if (timeParts.length !== 2) return null
    const [h, mn] = timeParts.map(Number)
    if (Number.isNaN(h) || Number.isNaN(mn) || h < 0 || h > 23 || mn < 0 || mn > 59) return null
    hh = h
    mi = mn
  }
  const dt = new Date(y, m - 1, d, hh, mi)
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return dt
}

function parseRow(line: string, sep: string): string[] {
  const r: string[] = []; let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; continue }
      inQ = !inQ; continue
    }
    if (c === sep && !inQ) { r.push(cur); cur = ''; continue }
    cur += c
  }
  r.push(cur)
  return r
}

function detectSep(first: string): string {
  let commas = 0, semis = 0, inQ = false
  for (const c of first) {
    if (c === '"') { inQ = !inQ; continue }
    if (!inQ) { if (c === ',') commas++; else if (c === ';') semis++ }
  }
  return semis > commas ? ';' : ','
}

// ─── Data Quality ─────────────────────────────────────────────────────────────

// numos válido = exatamente 7 dígitos.
function isValidNumos(v: string): boolean {
  return /^\d{7}$/.test((v || '').trim())
}

// Cidades atendidas — usada em parseCSV e buildOrdens
const _normCity = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()

const CIDADES_ATENDIDAS = new Set([
  'PINDAMONHANGABA',
  'TREMEMBE',
  'TAUBATE',
  'CACAPAVA',
  'SAO JOSE',
  'SAO JOSE DOS CAMPOS',
])
export const isCidadeValida = (c: string): boolean => CIDADES_ATENDIDAS.has(_normCity(c))

const EQUIPES_EXCLUIR = new Set([
  'ESTOQUE', 'COPE - RETIRADA', 'ATENDIMENTO',
  'REGUA DE COBRANCA', 'RÉGUA DE COBRANÇA',
  'MIGRADO', 'RECONEXAO AUTOMATICA', 'RECONEXÃO AUTOMÁTICA',
])
const SERVICOS_EXCLUIR = [
  'INADIMPLENCIA', 'INADIMPLÊNCIA', 'RECONEXAO AUTOMATICA',
  'RECONEXÃO AUTOMÁTICA', 'LIBERACAO DE CONFIANCA', 'LIBERAÇÃO DE CONFIANÇA',
  'ALTERACAO DE PROGRAMACAO', 'ALTERAÇÃO DE PROGRAMAÇÃO',
  'REGUA DE CONFIANCA', 'RÉGUA DE CONFIANÇA',
  'RETIRADA DE EQUIPAMENTO', 'CONTRATO - UPGRADE',
]

// Array augmentado com metadados de qualidade
type ParsedCSVResult = OSRow[] & { _discarded: number; _duplicados: number }

export function parseCSV(text: string): ParsedCSVResult {
  const empty = Object.assign([], { _discarded: 0, _duplicados: 0 }) as ParsedCSVResult
  const lines = (text || '').split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return empty

  const sep = detectSep(lines[0])
  const headers = parseRow(lines[0], sep).map(h =>
    h.trim().toLowerCase()
     .normalize('NFD').replace(/[̀-ͯ]/g, '')
     .replace(/\s+/g, '')
  )
  const mapped = lines.slice(1)
    .filter(l => l.trim())
    .map(l => {
      const vals = parseRow(l, sep)
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim() })
      if (obj['empresa(carteira)'] != null && obj['empresa'] == null) obj['empresa'] = obj['empresa(carteira)']
      if (obj['enderecoconexao']  != null && obj['logradouro'] == null) obj['logradouro'] = obj['enderecoconexao']
      if (obj['dataatendimento']  != null && obj['dataagendamento'] == null) obj['dataagendamento'] = obj['dataatendimento']
      return obj
    })

  const discarded  = mapped.filter(r => !isValidNumos(r['numos'] ?? '')).length
  const valid      = mapped.filter(r =>  isValidNumos(r['numos'] ?? ''))
  const _allNumos  = valid.map(r => r['numos'])
  const duplicados = _allNumos.length - new Set(_allNumos).size

  const result = valid.filter(r => {
    const eq = (r['nomedaequipe'] || '').toUpperCase().trim()
    const sv = (r['servico'] || '').toUpperCase().trim()
    if (!isCidadeValida(r['nomedacidade'] ?? '')) return false
    if (EQUIPES_EXCLUIR.has(eq)) return false
    if (SERVICOS_EXCLUIR.some(x => sv.includes(x))) return false
    const isTransfEndereco = sv.includes('TRANSF') && sv.includes('ENDERECO SINGLE')
    if (isTransfEndereco && eq.includes('COPE') && !isConcluida(r['descsituacao'])) return false
    return true
  }) as unknown as ParsedCSVResult

  result._discarded  = discarded
  result._duplicados = duplicados
  return result
}

// ─── SLA Limits ─────────────────────────────────────────────────────────────

const _SLA_DEFAULTS: SlaLimits = { INSTALACAO: 2, MANUTENCAO: 1, SERVICO: 2, VT24H: 1, VT48H: 2, VT08H: 1 }

export interface SlaResult {
  limite: number
  label:  string
}

export function getSlaLimite(
  tiposervico: string | undefined | null,
  servico: string | undefined | null,
  slaLimits: SlaLimits | null = null,
): SlaResult {
  const lim = slaLimits ?? _SLA_DEFAULTS
  const t = (tiposervico || '').toUpperCase().trim()
  const s = (servico     || '').toUpperCase().trim()
  if (s.includes('VT 24H') || s.includes('ASSISTENCIA - VT 24H')) return { limite: lim.VT24H ?? 1,    label: 'VT 24h' }
  if (s.includes('VT 08H') || s.includes('ASSISTENCIA - VT 08H')) return { limite: lim.VT08H ?? 1,    label: 'VT 8h' }
  if (s.includes('VT 48H'))   return { limite: lim.VT48H ?? 2,    label: 'VT 48h' }
  if (t.includes('INSTALAC')) return { limite: lim.INSTALACAO ?? 2, label: 'Instalação' }
  if (t.includes('MANUTENC')) return { limite: lim.MANUTENCAO ?? 1, label: 'Manutenção' }
  return { limite: lim.SERVICO ?? 2, label: 'Serviços' }
}

export function getVtPrazoHoras(servico: string | null | undefined): number | null {
  const s = (servico || '').toUpperCase()
  if (s.includes('VT 08H')) return 8
  if (s.includes('VT 24H')) return 24
  if (s.includes('VT 48H')) return 48
  return null
}

// ─── Classifiers ─────────────────────────────────────────────────────────────

export const isCOPE    = (r: Pick<OSRow, 'nomedaequipe'>): boolean => /COPE/i.test(r.nomedaequipe ?? '')
export const isReagend = (r: Pick<OSRow, 'nomedaequipe'>): boolean => /REAGEND/i.test(r.nomedaequipe ?? '')

const WES_CODES  = new Set(['F08', 'F11', 'F23', 'F36', 'F44'])
const INST_CODES = new Set(['F01', 'F04', 'F05', 'F07', 'F20', 'F45', 'F46', 'F47', 'F48', 'F49', 'F50'])
const THM_CODES  = new Set(['F12', 'F13', 'F14'])

export function getFornecedor(equipe: string | undefined | null): Fornecedor {
  const u = (equipe || '').toUpperCase()
  if (/COPE/i.test(u))     return 'INTERNO'
  if (/\bREDE\b/.test(u))  return 'REDE'
  if (/MANUTENC/.test(u))  return 'MANUTENCAO'
  const code = (u.match(/\bF\d{2,}\b/) || [])[0]
  if (code && WES_CODES.has(code))  return 'WES'
  if (code && INST_CODES.has(code)) return 'Instacable'
  if (code && THM_CODES.has(code))  return 'THM'
  if (/INSTALAC/.test(u))           return 'INSTALACAO'
  return 'OUTRO'
}

export function getEquipeTipo(equipe: string | undefined | null, tiposervico: string | undefined | null): TipoEquipe {
  const u = (equipe      || '').toUpperCase()
  const t = (tiposervico || '').toUpperCase()
  if (/\bREDE\b/.test(u))    return 'REDE'
  if (t.includes('INSTALAC')) return 'INSTALACAO'
  if (/MANUTENC/.test(u))    return 'MANUTENCAO'
  if (t.includes('MANUTENC')) return 'MANUTENCAO'
  return 'OUTRO'
}

// ─── Risk Score ──────────────────────────────────────────────────────────────

export function calcRiskScore(row: Partial<OSRow>): number {
  let s = 0
  if (row._slaCritico)       s += 40
  else if (row._slaExcedido) s += 25
  else if (row._slaSemAgend) s += 10
  const aging = row._aging ?? row._agingAbertura ?? 0
  if      (aging > 14) s += 30
  else if (aging >  7) s += 20
  else if (aging >  3) s += 10
  else if (aging >  1) s +=  4
  if (!row.nomedaequipe?.trim()) s += 15
  if (row._tipo === 'INSTALACAO') s += 5
  return Math.min(s, 100)
}

// ─── VT Priority Score ───────────────────────────────────────────────────────
// Ordena a fila VT por gravidade real, não só pelo relógio:
//   peso_tipo (08h=3 · 24h=2 · 48h=1)  — contrato mais curto é mais grave
//   × urgência (violado = 100 + horas de estouro · no prazo = % do prazo consumido)
//   × peso_situação (Reagendamento = 0.3, pois já há tratativa com o cliente)
export function calcVtPriorityScore(row: Partial<OSRow>): number {
  const prazo    = row._vtPrazoHoras
  const restante = row._vtHorasRestantes
  if (prazo == null || restante == null) return 0

  const pesoTipo = prazo <= 8 ? 3 : prazo <= 24 ? 2 : 1
  const urgencia = restante <= 0
    ? 100 + Math.abs(restante)
    : Math.max(0, (prazo - restante) / prazo) * 100
  const pesoSituacao = row._situacaoEfetiva === 'Reagendamento' ? 0.3 : 1
  return Math.round(pesoTipo * urgencia * pesoSituacao)
}

// ─── Row Enrichment ───────────────────────────────────────────────────────────

export function enrichRows(rows: OSRow[], slaLimits: SlaLimits | null = null): OSRow[] {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const hojeStr = `${dd}/${mm}/${now.getFullYear()}`

  const seen = new Set<string>()
  const unique: OSRow[] = []
  for (const r of rows) {
    if (!seen.has(r.numos as string)) { seen.add(r.numos as string); unique.push(r) }
  }

  return unique.map(r => {
    const row = { ...r } as unknown as OSRow

    if (row.nomecliente)  row.nomecliente  = row.nomecliente.trim().toUpperCase()
    if (row.nomedacidade) row.nomedacidade = row.nomedacidade.trim().toUpperCase()
    if (row.bairro)       row.bairro       = row.bairro.trim().toUpperCase()

    const dtAbertura = parseDate(row.datacadastro)
    const dtAgend    = parseDate(row.dataagendamento)
    // Para OS concluídas, congela o aging na data de encerramento real
    const dtFechamento = parseDate(row.dataexecucao || row.databaixa)
    const dtRef = (isConcluida(row.descsituacao) && dtFechamento) ? dtFechamento : now
    row._agingAbertura    = dtAbertura ? Math.max(0, Math.floor((dtRef.getTime() - dtAbertura.getTime()) / 86400000)) : null
    row._agingAgendamento = (dtAgend && dtAgend <= dtRef) ? Math.max(0, Math.floor((dtRef.getTime() - dtAgend.getTime()) / 86400000)) : null
    row._agingHoras       = dtAbertura ? Math.max(0, (dtRef.getTime() - dtAbertura.getTime()) / 3600000) : null

    const isAtiva = ['Atendimento', 'Pendente'].includes(row.descsituacao)
    row._aging = isAtiva ? row._agingAbertura : null

    const sla = getSlaLimite(row.tiposervico, row.servico, slaLimits)
    row._slaLimite    = sla.limite
    row._slaTipoLabel = sla.label

    const diasAgend = (dtAbertura && dtAgend)
      ? Math.max(0, Math.floor((dtAgend.getTime() - dtAbertura.getTime()) / 86400000))
      : null
    row._diasAteAgendamento = diasAgend

    if (diasAgend !== null) {
      row._slaExcedido = isAtiva && diasAgend > sla.limite
      row._slaSemAgend = false
    } else {
      row._slaExcedido = false
      row._slaSemAgend = isAtiva && row._agingAbertura != null && row._agingAbertura > sla.limite
    }

    row._slaCritico      = isAtiva && row._agingAbertura != null && row._agingAbertura > sla.limite * 2
    row._slaCriticoHoras = isAtiva && row._agingHoras != null && row._agingHoras > sla.limite * 24
    row._diasAcimaSLA    = row._slaCritico ? ((row._agingAbertura ?? 0) - sla.limite) : 0
    row._diasAteViolacao = row._slaCritico
      ? 0
      : (isAtiva && row._agingAbertura != null)
        ? Math.max(0, Math.floor(sla.limite * 2 - row._agingAbertura))
        : null
    row._fornecedor      = getFornecedor(row.nomedaequipe)
    row._tipo            = getEquipeTipo(row.nomedaequipe, row.tiposervico)

    const _srv  = (row.servico || '').toUpperCase()
    const _isVT = _srv.includes('VT')
    if      (row._tipo === 'REDE')                        row._categoria = 'REDE'
    else if (_isVT || row._tipo === 'MANUTENCAO')         row._categoria = 'VT_MANUTENCAO'
    else if (row._tipo === 'INSTALACAO')                  row._categoria = 'INSTALACAO'
    else                                                  row._categoria = 'SERVICO'

    const vtPrazoHoras = getVtPrazoHoras(row.servico)
    row._vtPrazoHoras = vtPrazoHoras
    if (vtPrazoHoras != null && isAtiva) {
      const dtAberturaPrecisa = parseDateTime(row.datacadastro)
      row._vtHorasRestantes = dtAberturaPrecisa
        ? vtPrazoHoras - Math.max(0, (dtRef.getTime() - dtAberturaPrecisa.getTime()) / 3600000)
        : null
    } else {
      row._vtHorasRestantes = null
    }
    row._vtViolado = row._vtHorasRestantes != null && row._vtHorasRestantes <= 0

    // Cumprimento de prazo VT (executadas): a execução ocorreu dentro do prazo contratual?
    // Mede o passado — alimenta o KPI de % cumprimento. null = não-VT ou ainda não executada.
    if (vtPrazoHoras != null) {
      const dtCadVt  = parseDateTime(row.datacadastro)
      const dtExecVt = parseDateTime(row.dataexecucao)
      row._vtCumpridaNoPrazo = (dtCadVt && dtExecVt)
        ? (dtExecVt.getTime() - dtCadVt.getTime()) / 3600000 <= vtPrazoHoras
        : null
    } else {
      row._vtCumpridaNoPrazo = null
    }

    if      (isCOPE(row)    && !isConcluida(row.descsituacao)) row._situacaoEfetiva = 'Pendente'
    else if (isReagend(row) && !isConcluida(row.descsituacao)) row._situacaoEfetiva = 'Reagendamento'
    else if (['INSTALACAO','MANUTENCAO','REDE'].includes(row._tipo) && row.nomedaequipe?.trim() && !isConcluida(row.descsituacao))
                                                               row._situacaoEfetiva = 'Atendimento'
    else                                                       row._situacaoEfetiva = row.descsituacao

    const _fechamento = (row.dataexecucao || row.databaixa || '').split(' ')[0]
    row._executadaHoje = !isCOPE(row) && !isReagend(row) && isExecucaoReal(row._situacaoEfetiva) && _fechamento === hojeStr
    row._riskScore       = calcRiskScore(row)
    row._vtPriorityScore = calcVtPriorityScore(row)

    // shortEquipe é usado apenas para exibição — não faz parte do OSRow,
    // mas manter compatibilidade com código JS que chama shortEquipe(r.nomedaequipe)
    void shortEquipe // importado para garantir que o módulo seja incluído no bundle

    return row
  })
}
