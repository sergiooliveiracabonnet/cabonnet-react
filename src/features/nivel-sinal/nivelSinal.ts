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
  causa: string
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
  nivel: 'alto' | 'medio'
  score: number
}

export type SignalSortKey = keyof SignalRow
export type SortDirection = 'asc' | 'desc'

const VALID_CITIES = new Set(['CACAPAVA', 'PINDAMONHANGABA', 'SAO JOSE DOS CAMPOS', 'TAUBATE', 'TREMEMBE'])

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
  const firstLine = text.slice(0, Math.max(0, text.search(/\r?\n/))) || text
  const separator = firstLine.includes(';') ? ';' : ','
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

function severity(value: string, rx: number | null): SignalSeverity {
  const normalized = normalizeText(value)
  if (normalized.includes('CRIT')) return 'Crítico'
  if (normalized.includes('ATEN')) return 'Atenção'
  if (normalized.includes('NORMAL')) return 'Normal'
  if (rx != null && rx <= -30) return 'Crítico'
  if (rx != null && rx <= -25) return 'Atenção'
  return '—'
}

export function parseSignalCsv(text: string): SignalRow[] {
  const [header = [], ...rows] = parseCsvRows(text.replace(/^\uFEFF/, ''))
  if (!header.length || !rows.length) return []
  const indexes = new Map(header.map((name, index) => [normalizeText(name), index]))
  const get = (row: string[], name: string) => (row[indexes.get(normalizeText(name)) ?? -1] ?? '').trim()

  const scopedRows = rows.filter(row => VALID_CITIES.has(normalizeText(get(row, 'Cidade'))))
  const neighborhoods = new Map<string, Map<string, number>>()
  const knownNeighborhoods = [...new Set(scopedRows.map(row => get(row, 'Bairro')).filter(value => value && value !== '-' && value !== '--'))]
    .sort((a, b) => b.length - a.length)
  scopedRows.forEach(row => {
    const rawBairro = get(row, 'Bairro')
    const address = normalizeText(get(row, 'Cliente ONU')).replace(/[^A-Z0-9]+/g, ' ')
    const bairro = rawBairro && rawBairro !== '-' && rawBairro !== '--'
      ? rawBairro
      : knownNeighborhoods.find(value => address.includes(normalizeText(value).replace(/[^A-Z0-9]+/g, ' ')))
    if (!bairro) return
    const key = `${get(row, 'OLT')}|${get(row, 'Slot')}|${get(row, 'PON')}`
    const counts = neighborhoods.get(key) ?? new Map<string, number>()
    counts.set(bairro, (counts.get(bairro) ?? 0) + 1); neighborhoods.set(key, counts)
  })

  return scopedRows.map(row => {
    const cidade = get(row, 'Cidade')
    const rx = parseNumber(get(row, 'RX dBm'))
    const ponLocation = `${get(row, 'OLT')}|${get(row, 'Slot')}|${get(row, 'PON')}`
    const inferredBairro = [...(neighborhoods.get(ponLocation)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0]
    const bairro = get(row, 'Bairro')
    return {
      cidade, bairro: bairro && bairro !== '-' && bairro !== '--' ? bairro : inferredBairro || '—', olt: get(row, 'OLT') || '—', tipo: get(row, 'Tipo') || '—',
      slot: get(row, 'Slot'), pon: get(row, 'PON') || '—', onu: get(row, 'ONU ID'),
      cliente: clientName(get(row, 'Cliente'), get(row, 'Cliente ONU')), codigo: get(row, 'Código'),
      situacao: get(row, 'Situação') || '—', pppoe: get(row, 'PPPoE'), serial: get(row, 'Serial'),
      modelo: get(row, 'Modelo') || '—', status: get(row, 'Status') || '—',
      classificacao: severity(get(row, 'Classificação'), rx), rx, tx: parseNumber(get(row, 'TX dBm')),
      oltRx: parseNumber(get(row, 'OLT RX dBm')), distancia: parseDistance(get(row, 'Distância')),
      causa: get(row, 'Down Cause') || '—',
    }
  })
}

export function signalSummary(rows: SignalRow[]) {
  return {
    total: rows.length,
    criticos: rows.filter(row => row.classificacao === 'Crítico').length,
    atencao: rows.filter(row => row.classificacao !== 'Crítico').length,
    offline: rows.filter(row => normalizeText(row.status) !== 'ONLINE').length,
    pons: new Set(rows.map(row => `${row.olt}|${row.slot}|${row.pon}`)).size,
  }
}

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
    const bairros = new Map<string, number>()
    items.forEach(item => bairros.set(item.bairro, (bairros.get(item.bairro) ?? 0) + 1))
    const bairro = [...bairros.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
    return [{
      key, olt: items[0].olt, pon: items[0].pon, cidade: items[0].cidade, bairro,
      total: items.length, criticos, concentracao, rxMediano: rxs.length ? rxs[Math.floor(rxs.length / 2)] : null,
      piorRx: rxs[0] ?? null, nivel: criticos >= 8 && concentracao >= 0.45 ? 'alto' : 'medio',
      score: criticos * concentracao,
    } satisfies SignalHotspot]
  }).sort((a, b) => b.score - a.score || b.criticos - a.criticos)
}

export function buildHistogram(rows: SignalRow[], min = -34, max = -24, step = 0.5) {
  const count = Math.round((max - min) / step)
  const bins = Array.from({ length: count }, (_, index) => ({
    start: min + index * step, end: min + (index + 1) * step, total: 0, rows: [] as SignalRow[],
  }))
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
