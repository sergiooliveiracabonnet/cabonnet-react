import type { SignalRow } from './nivelSinal'

export const SIGNAL_OCCURRENCES_STORAGE_KEY = 'cabonnet-sinal-ocorrencias-v2'
export const OCCURRENCE_STATUSES = ['Aberto', 'Em atendimento', 'Aguardando material', 'Concluído'] as const
export type OccurrenceStatus = typeof OCCURRENCE_STATUSES[number]

export interface SignalOccurrence {
  id: string
  sourceKey: string
  source: 'csv'
  date: string
  updatedAt: string
  client: string
  city: string
  region: string
  before: number
  current: number
  after: number | null
  team: string
  status: OccurrenceStatus
  note: string
  resolution: string
  severity: 'Crítico' | 'Atenção'
  olt: string
  slot: string
  pon: string
  onu: string
  serial: string
  code: string
  pppoe: string
  detections: number
  missedSnapshots: number
}

const invalidIdentifier = new Set(['', '-', '—', '--', 'N/A', 'NA', 'NULL', 'NULO'])
const validIdentifier = (value: string) => {
  const normalized = value.trim().toUpperCase()
  return invalidIdentifier.has(normalized) ? '' : normalized
}

export function signalOccurrenceKey(row: SignalRow) {
  const serial = validIdentifier(row.serial)
  const code = validIdentifier(row.codigo)
  const pppoe = validIdentifier(row.pppoe)
  if (serial) return `serial:${serial}`
  if (code) return `codigo:${code}`
  if (pppoe) return `pppoe:${pppoe}`
  return `porta:${[row.olt, row.slot, row.pon, row.onu].map(value => validIdentifier(value) || '?').join('|')}`
}

const isAlert = (row: SignalRow) => row.classificacao === 'Crítico' || row.classificacao === 'Atenção'

export function syncSignalOccurrences(current: SignalOccurrence[], rows: SignalRow[], importedAt: string): SignalOccurrence[] {
  const snapshot = new Map(rows.map(row => [signalOccurrenceKey(row), row]))
  const alerts = new Map(rows.filter(row => isAlert(row) && row.rx != null).map(row => [signalOccurrenceKey(row), row]))
  const activeKeys = new Set(current.filter(item => item.status !== 'Concluído').map(item => item.sourceKey))
  const next = current.map(item => {
    if (item.status === 'Concluído') return item
    const alert = alerts.get(item.sourceKey)
    if (alert) return { ...item, current: alert.rx as number, severity: alert.classificacao as 'Crítico' | 'Atenção', updatedAt: importedAt, detections: item.detections + 1, missedSnapshots: 0 }
    const corrected = snapshot.get(item.sourceKey)
    if (!corrected || corrected.rx == null || isAlert(corrected)) return { ...item, missedSnapshots: item.missedSnapshots + 1 }
    return {
      ...item, status: 'Concluído' as const, after: corrected?.rx ?? null, updatedAt: importedAt,
      resolution: 'Correção detectada no CSV', note: item.note || 'Potência normalizada em uma nova importação.',
    }
  })

  alerts.forEach((row, sourceKey) => {
    if (activeKeys.has(sourceKey)) return
    next.unshift({
      id: crypto.randomUUID(), sourceKey, source: 'csv', date: importedAt, updatedAt: importedAt,
      client: row.cliente, city: row.cidade, region: row.bairro, before: row.rx as number, current: row.rx as number,
      after: null, team: '', status: 'Aberto', note: '', resolution: '',
      severity: row.classificacao as 'Crítico' | 'Atenção', olt: row.olt, slot: row.slot, pon: row.pon, onu: row.onu,
      serial: row.serial, code: row.codigo, pppoe: row.pppoe, detections: 1, missedSnapshots: 0,
    })
  })
  return next
}
