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

const VALID_CITIES = new Set(['CACAPAVA', 'PINDAMONHANGABA', 'SAO JOSE DOS CAMPOS', 'TAUBATE', 'TREMEMBE'])

const normalizeText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()

function parseNumber(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; continue }
      quoted = !quoted
    } else if ((char === ';' || char === ',') && !quoted) {
      const separator = text.split(/\r?\n/, 1)[0].includes(';') ? ';' : ','
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

  return rows.flatMap(row => {
    const cidade = get(row, 'Cidade')
    if (!VALID_CITIES.has(normalizeText(cidade))) return []
    const rx = parseNumber(get(row, 'RX dBm'))
    return [{
      cidade, bairro: get(row, 'Bairro') || '—', olt: get(row, 'OLT') || '—', tipo: get(row, 'Tipo') || '—',
      slot: get(row, 'Slot'), pon: get(row, 'PON') || '—', onu: get(row, 'ONU ID'),
      cliente: get(row, 'Cliente') || get(row, 'Cliente ONU') || '—', codigo: get(row, 'Código'),
      situacao: get(row, 'Situação') || '—', pppoe: get(row, 'PPPoE'), serial: get(row, 'Serial'),
      modelo: get(row, 'Modelo') || '—', status: get(row, 'Status') || '—',
      classificacao: severity(get(row, 'Classificação'), rx), rx, tx: parseNumber(get(row, 'TX dBm')),
      oltRx: parseNumber(get(row, 'OLT RX dBm')), distancia: parseNumber(get(row, 'Distância')),
      causa: get(row, 'Down Cause') || '—',
    }]
  })
}

export function signalSummary(rows: SignalRow[]) {
  return {
    total: rows.length,
    criticos: rows.filter(row => row.classificacao === 'Crítico').length,
    atencao: rows.filter(row => row.classificacao === 'Atenção').length,
    offline: rows.filter(row => normalizeText(row.status) !== 'ONLINE').length,
    pons: new Set(rows.map(row => `${row.olt}|${row.slot}|${row.pon}`)).size,
  }
}
