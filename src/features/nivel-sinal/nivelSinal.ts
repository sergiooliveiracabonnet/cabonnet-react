import { CLUSTER_DE_CIDADE } from '../../lib/clusters'
export type SignalSeverity = 'Crítico' | 'Atenção' | 'Normal' | '—'

export interface SignalRow {
  cidade: string
  bairro: string
  olt: string
  tipo: string
  slot: string
  pon: string
  onu: string
  cliente: string
  codigo: string
  situacao: string
  pppoe: string
  serial: string
  modelo: string
  status: string
  classificacao: SignalSeverity
  rx: number | null
  tx: number | null
  oltRx: number | null
  distancia: number | null
  temperatura: number | null
  causa: string
  cidadeCliente: string
  /** A linha entrou no recorte de alerta de RX do CSV (coluna "Alerta RX"). */
  alertaRx: boolean
}

export interface SignalFilters {
  query?: string
  cidade?: string
  olt?: string
  pon?: string
  slot?: string
  tipo?: string
  situacao?: string
  severities?: SignalSeverity[]
  offline?: boolean
  hotspotsOnly?: boolean
}

export interface SignalHotspot {
  key: string
  olt: string
  pon: string
  cidade: string
  bairro: string
  total: number
  criticos: number
  concentracao: number
  rxMediano: number | null
  piorRx: number | null
  /** Maior temperatura entre as ONUs da PON - troco degradado costuma esquentar. */
  tempMax: number | null
  nivel: 'alto' | 'medio'
  score: number
}

export interface HistogramBin {
  start: number
  end: number
  total: number
  rows: SignalRow[]
  label: string
  /** Bin de ponta: recolhe tudo que cai fora da faixa, entao o rotulo e ≤ / ≥. */
  overflow: boolean
}

export type SignalSortKey = keyof SignalRow
export type SortDirection = 'asc' | 'desc'

// Fonte única: CLUSTERS em config.py, espelhado em lib/clusters.ts.
const VALID_CITIES = new Set(Object.keys(CLUSTER_DE_CIDADE))

const normalizeText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()

function parseNumber(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDistance(value: string): number | null {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function clientName(client: string, onuClient: string) {
  if (client.trim()) return client.trim()
  return onuClient.trim().replace(/_zone_.*$/i, '').replace(/_authd_.*$/i, '').replace(/_descr_.*$/i, '')
    .replace(/^\d+\s*_?-_?\s*/, '').replace(/_/g, ' ').trim() || '—'
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  const sampleLines = text.split(/\r?\n/, 100)
  const maxSemicolons = Math.max(0, ...sampleLines.map(line => (line.match(/;/g) ?? []).length))
  const maxCommas = Math.max(0, ...sampleLines.map(line => (line.match(/,/g) ?? []).length))
  const separator = maxSemicolons > maxCommas ? ';' : ','
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; continue }
      quoted = !quoted
    } else if ((char === ';' || char === ',') && !quoted) {
      if (char === separator) { row.push(cell); cell = ''; continue }
      cell += char
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(value => value.trim())) rows.push(row)
      row = []
    } else cell += char
  }
  row.push(cell)
  if (row.some(value => value.trim())) rows.push(row)
  return rows
}

const namedNeighborhood = (value: string) => {
  const trimmed = value.trim()
  return trimmed && trimmed !== '-' && trimmed !== '--' ? trimmed : ''
}

const addressTokens = (value: string) => normalizeText(value).replace(/[^A-Z0-9]+/g, ' ')

/** A régua é nossa: o CSV não traz coluna de classificação confiável. */
export function severityFromRx(rx: number | null): SignalSeverity {
  if (rx == null) return '—'
  if (rx <= -27) return 'Crítico'
  if (rx <= -25) return 'Atenção'
  return 'Normal'
}

function severity(value: string, rx: number | null, isRxAlert = false): SignalSeverity {
  const normalized = normalizeText(value)
  if (normalized.includes('CRIT')) return 'Crítico'
  if (normalized.includes('ATEN')) return 'Atenção'
  if (normalized.includes('NORMAL')) return 'Normal'
  const byRx = severityFromRx(rx)
  if (byRx === 'Crítico' || byRx === 'Atenção') return byRx
  if (isRxAlert) return 'Atenção'
  return '—'
}

export function parseSignalCsv(text: string, options: { includeNonAlerts?: boolean } = {}): SignalRow[] {
  const parsedRows = parseCsvRows(text.replace(/^\uFEFF/, ''))
  const headerIndex = parsedRows.findIndex(row => {
    const names = new Set(row.map(normalizeText))
    return names.has('CIDADE') && names.has('OLT') && names.has('RX DBM')
  })
  if (headerIndex < 0) return []
  const header = parsedRows[headerIndex] ?? []
  let rows = parsedRows.slice(headerIndex + 1)
  if (!header.length || !rows.length) return []
  const indexes = new Map(header.map((name, index) => [normalizeText(name), index]))
  const get = (row: string[], name: string) => (row[indexes.get(normalizeText(name)) ?? -1] ?? '').trim()
  const getAny = (row: string[], ...names: string[]) => {
    for (const name of names) {
      if (indexes.has(normalizeText(name))) return get(row, name)
    }
    return ''
  }
  const hasRxAlert = indexes.has('ALERTA RX')
  if (hasRxAlert && !options.includeNonAlerts) rows = rows.filter(row => normalizeText(get(row, 'Alerta RX')) === 'SIM')

  const scopedRows = rows.filter(row => VALID_CITIES.has(normalizeText(get(row, 'Cidade'))))
  const neighborhoods = new Map<string, Map<string, number>>()
  // Normaliza cada bairro uma vez so: antes o normalizeText rodava por candidato,
  // por linha - O(linhas x bairros) de trabalho redundante em 23 mil linhas.
  const knownNeighborhoods = [...new Set(scopedRows.map(row => namedNeighborhood(getAny(row, 'Bairro', 'Setor/Bairro'))).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map(value => ({ value, token: addressTokens(value) }))
  const inferNeighborhood = (clientOnu: string) => {
    if (!knownNeighborhoods.length) return ''
    const address = addressTokens(clientOnu)
    return knownNeighborhoods.find(item => address.includes(item.token))?.value ?? ''
  }
  scopedRows.forEach(row => {
    const bairro = namedNeighborhood(getAny(row, 'Bairro', 'Setor/Bairro')) || inferNeighborhood(get(row, 'Cliente ONU'))
    if (!bairro) return
    const pon = get(row, 'PON')
    const key = `${get(row, 'OLT')}|${get(row, 'Slot') || pon.split('/')[0] || ''}|${pon}`
    const counts = neighborhoods.get(key) ?? new Map<string, number>()
    counts.set(bairro, (counts.get(bairro) ?? 0) + 1); neighborhoods.set(key, counts)
  })

  return scopedRows.map(row => {
    const cidade = get(row, 'Cidade')
    const rx = parseNumber(get(row, 'RX dBm'))
    const rowHasRxAlert = hasRxAlert && normalizeText(get(row, 'Alerta RX')) === 'SIM'
    const pon = get(row, 'PON')
    const slot = get(row, 'Slot') || pon.split('/')[0] || ''
    const ponLocation = `${get(row, 'OLT')}|${slot}|${pon}`
    const inferredBairro = [...(neighborhoods.get(ponLocation)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0]
    return {
      cidade, bairro: namedNeighborhood(getAny(row, 'Bairro', 'Setor/Bairro')) || inferredBairro || '—', olt: get(row, 'OLT') || '—', tipo: get(row, 'Tipo') || '—',
      slot, pon: pon || '—', onu: get(row, 'ONU ID'),
      cliente: clientName(getAny(row, 'Cliente', 'Cliente iManager'), get(row, 'Cliente ONU')), codigo: get(row, 'Código'),
      situacao: get(row, 'Situação') || '—', pppoe: get(row, 'PPPoE'), serial: get(row, 'Serial'),
      modelo: get(row, 'Modelo') || '—', status: get(row, 'Status') || '—',
      classificacao: severity(get(row, 'Classificação'), rx, rowHasRxAlert), rx, tx: parseNumber(get(row, 'TX dBm')),
      oltRx: parseNumber(get(row, 'OLT RX dBm')), distancia: parseDistance(getAny(row, 'Distância', 'Distância m')),
      temperatura: parseNumber(getAny(row, 'Temperatura C', 'Temperatura')),
      causa: get(row, 'Down Cause') || '—',
      cidadeCliente: get(row, 'Cidade Cliente') || '—',
      // Sem a coluna "Alerta RX" o CSV inteiro e o recorte - e o que o filtro acima faz.
      alertaRx: hasRxAlert ? rowHasRxAlert : true,
    }
  })
}

export function signalSummary(rows: SignalRow[]) {
  return {
    total: rows.length,
    criticos: rows.filter(row => row.classificacao === 'Crítico').length,
    // "Atenção" e a classificação Atenção, nao "tudo que nao e Crítico" - senao
    // Normal e — entram na conta e o KPI infla.
    atencao: rows.filter(row => row.classificacao === 'Atenção').length,
    outros: rows.filter(row => row.classificacao !== 'Crítico' && row.classificacao !== 'Atenção').length,
    offline: rows.filter(row => normalizeText(row.status) !== 'ONLINE').length,
    pons: new Set(rows.map(row => `${row.olt}|${row.slot}|${row.pon}`)).size,
  }
}

/** Recorte de alerta de RX dentro de um snapshot completo do CSV. */
export const alertRows = (rows: SignalRow[]) => rows.filter(row => row.alertaRx)

export const signalPonKey = (row: Pick<SignalRow, 'olt' | 'pon'>) => `${row.olt} · ${row.pon}`

export function buildHotspots(rows: SignalRow[]): SignalHotspot[] {
  const groups = new Map<string, SignalRow[]>()
  rows.forEach(row => {
    const key = signalPonKey(row)
    const items = groups.get(key) ?? []
    items.push(row); groups.set(key, items)
  })
  return [...groups.entries()].flatMap(([key, items]) => {
    const criticos = items.filter(item => item.classificacao === 'Crítico').length
    const concentracao = items.length ? criticos / items.length : 0
    if (criticos < 4 || concentracao < 0.3) return []
    const rxs = items.map(item => item.rx).filter((value): value is number => value != null).sort((a, b) => a - b)
    const temps = items.map(item => item.temperatura).filter((value): value is number => value != null)
    const bairros = new Map<string, number>()
    items.forEach(item => bairros.set(item.bairro, (bairros.get(item.bairro) ?? 0) + 1))
    const bairro = [...bairros.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
    return [{
      key, olt: items[0].olt, pon: items[0].pon, cidade: items[0].cidade, bairro,
      total: items.length, criticos, concentracao, rxMediano: rxs.length ? rxs[Math.floor(rxs.length / 2)] : null,
      piorRx: rxs[0] ?? null, tempMax: temps.length ? Math.max(...temps) : null,
      nivel: criticos >= 8 && concentracao >= 0.45 ? 'alto' : 'medio',
      score: criticos * concentracao,
    } satisfies SignalHotspot]
  }).sort((a, b) => b.criticos - a.criticos || b.concentracao - a.concentracao || b.total - a.total)
}

export function buildHistogram(rows: SignalRow[], min = -38, max = -24, step = 0.5): HistogramBin[] {
  const count = Math.round((max - min) / step)
  const bins: HistogramBin[] = Array.from({ length: count }, (_, index) => {
    const start = min + index * step
    const overflow = index === 0 || index === count - 1
    return {
      start, end: start + step, total: 0, rows: [] as SignalRow[], overflow,
      // As pontas recolhem tudo que cai fora da faixa; anunciar uma faixa fechada
      // ali seria mentira sobre onde os piores sinais realmente estao.
      label: index === 0
        ? `≤ ${(start + step).toFixed(1)}`
        : overflow ? `≥ ${start.toFixed(1)}` : `${start.toFixed(1)} a ${(start + step).toFixed(1)}`,
    }
  })
  rows.forEach(row => {
    if (row.rx == null) return
    const index = Math.min(count - 1, Math.max(0, Math.floor((row.rx - min) / step)))
    bins[index].total++
    bins[index].rows.push(row)
  })
  return bins
}

export function groupBySeverity(rows: SignalRow[], keyFn: (row: SignalRow) => string, limit?: number) {
  const groups = new Map<string, { key: string; total: number; criticos: number; atencao: number; rows: SignalRow[] }>()
  rows.forEach(row => {
    const key = keyFn(row)
    if (!key || key === '—') return
    const group = groups.get(key) ?? { key, total: 0, criticos: 0, atencao: 0, rows: [] }
    group.total++; group.rows.push(row)
    if (row.classificacao === 'Crítico') group.criticos++
    else group.atencao++
    groups.set(key, group)
  })
  const sorted = [...groups.values()].sort((a, b) => b.total - a.total)
  return limit ? sorted.slice(0, limit) : sorted
}

export function rankedCounts(rows: SignalRow[], keyFn: (row: SignalRow) => string, limit: number, skip: string[] = []) {
  const groups = new Map<string, SignalRow[]>()
  rows.forEach(row => {
    const key = keyFn(row)
    if (!key || skip.includes(key)) return
    const items = groups.get(key) ?? []
    items.push(row); groups.set(key, items)
  })
  const total = [...groups.values()].reduce((sum, items) => sum + items.length, 0)
  return [...groups.entries()].map(([key, items]) => ({ key, total: items.length, pct: total ? items.length / total * 100 : 0, rows: items }))
    .sort((a, b) => b.total - a.total).slice(0, limit)
}

export function filterSignals(rows: SignalRow[], filters: SignalFilters, hotspotKeys = new Set<string>()) {
  const query = filters.query?.trim().toLocaleLowerCase('pt-BR') ?? ''
  return rows.filter(row => {
    if (filters.cidade && row.cidade !== filters.cidade) return false
    if (filters.olt && row.olt !== filters.olt) return false
    if (filters.pon && signalPonKey(row) !== filters.pon) return false
    if (filters.slot && row.slot !== filters.slot) return false
    if (filters.tipo && row.tipo !== filters.tipo) return false
    if (filters.situacao && row.situacao !== filters.situacao) return false
    if (filters.severities?.length && !filters.severities.includes(row.classificacao)) return false
    if (filters.offline && normalizeText(row.status) === 'ONLINE') return false
    if (filters.hotspotsOnly && !hotspotKeys.has(signalPonKey(row))) return false
    if (query && ![row.cliente, row.serial, row.pppoe, row.bairro, row.codigo, row.onu, row.pon].join(' ').toLocaleLowerCase('pt-BR').includes(query)) return false
    return true
  })
}

export function sortSignals(rows: SignalRow[], key: SignalSortKey, direction: SortDirection) {
  const multiplier = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const left = a[key], right = b[key]
    if (left == null || left === '') return 1
    if (right == null || right === '') return -1
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * multiplier
    return String(left).localeCompare(String(right), 'pt-BR', { numeric: true, sensitivity: 'base' }) * multiplier
  })
}

export function buildAIContext(rows: SignalRow[], filters: SignalFilters) {
  const resumo = signalSummary(rows)
  const validRx = rows.map(row => row.rx).filter((value): value is number => value != null)
  const aggregate = (groups: ReturnType<typeof groupBySeverity>) => groups.map(group => ({
    nome: group.key, total: group.total, criticos: group.criticos, atencao: group.atencao,
  }))
  return {
    filtros: {
      cidade: filters.cidade || 'todas', olt: filters.olt || 'todas', pon: filters.pon || 'todas',
      slot: filters.slot || 'todos', fabricante: filters.tipo || 'todos', situacao: filters.situacao || 'todas',
      severidades: filters.severities ?? [], offline: Boolean(filters.offline), apenas_hotspots: Boolean(filters.hotspotsOnly),
    },
    resumo,
    rx: {
      medio: validRx.length ? Number((validRx.reduce((sum, value) => sum + value, 0) / validRx.length).toFixed(2)) : null,
      pior: validRx.length ? Math.min(...validRx) : null,
      distribuicao: buildHistogram(rows).filter(bin => bin.total).map(bin => ({ faixa: `${bin.start.toFixed(1)} a ${bin.end.toFixed(1)}`, total: bin.total })),
    },
    por_cidade: aggregate(groupBySeverity(rows, row => row.cidade, 5)),
    por_olt: aggregate(groupBySeverity(rows, row => row.olt, 12)),
    hotspots: buildHotspots(rows).slice(0, 12).map(item => ({
      olt: item.olt, pon: item.pon, cidade: item.cidade, bairro: item.bairro, total: item.total,
      criticos: item.criticos, concentracao_pct: Number((item.concentracao * 100).toFixed(1)), rx_mediano: item.rxMediano, pior_rx: item.piorRx,
    })),
    causas: rankedCounts(rows, row => row.status.toLocaleLowerCase('pt-BR') !== 'online' ? row.status : row.causa, 6)
      .map(item => ({ nome: item.key, total: item.total, pct: Number(item.pct.toFixed(1)) })),
    modelos: rankedCounts(rows, row => row.modelo, 6, ['—']).map(item => ({ nome: item.key, total: item.total, pct: Number(item.pct.toFixed(1)) })),
  }
}
