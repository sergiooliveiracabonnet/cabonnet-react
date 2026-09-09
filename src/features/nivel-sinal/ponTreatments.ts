import type { SignalHotspot } from './nivelSinal'
import type { PonMedicao } from './ponMedicoes'

export type PonTreatmentAction = 'tratada' | 'reaberta'

/** Foto dos números da PON no instante do OK — o CSV seguinte não a altera. */
export interface PonTreatmentSnapshot {
  olt: string
  pon: string
  cidade: string
  bairro: string
  total: number
  criticos: number
  concentracao: number
  rxMediano: number | null
  piorRx: number | null
  tempMax: number | null
  nivel: SignalHotspot['nivel']
}

/** Estado atual de uma PON: o último evento do log manda. */
export interface PonTreatment {
  pon_key: string
  action: PonTreatmentAction
  snapshot: PonTreatmentSnapshot
  created_at: string
  created_by: string
  treated_count: number
  reopened_count: number
  /** Potência por cliente da PON — sobrevive aos ciclos e é editável depois. */
  medicoes: PonMedicao[]
}

export interface TreatedPon extends PonTreatment {
  /** A PON ainda bate o critério de hotspot no CSV carregado agora? */
  aindaCritica: boolean
  atual: SignalHotspot | null
}

export function snapshotFromHotspot(hotspot: SignalHotspot): PonTreatmentSnapshot {
  return {
    olt: hotspot.olt, pon: hotspot.pon, cidade: hotspot.cidade, bairro: hotspot.bairro,
    total: hotspot.total, criticos: hotspot.criticos, concentracao: hotspot.concentracao,
    rxMediano: hotspot.rxMediano, piorRx: hotspot.piorRx, tempMax: hotspot.tempMax, nivel: hotspot.nivel,
  }
}

export const isTreated = (treatment: PonTreatment | undefined) => treatment?.action === 'tratada'

export function treatmentsByKey(items: PonTreatment[]): Map<string, PonTreatment> {
  return new Map(items.map(item => [item.pon_key, item]))
}

export function treatedPonKeys(items: PonTreatment[]): Set<string> {
  return new Set(items.filter(item => item.action === 'tratada').map(item => item.pon_key))
}

/**
 * Separa a fila de pendência das PONs já tratadas. A tratada sai da pendência
 * mesmo que o CSV atual ainda a acuse — só volta por reabertura manual.
 */
export function splitHotspots(hotspots: SignalHotspot[], treated: Set<string>) {
  return {
    pendentes: hotspots.filter(hotspot => !treated.has(hotspot.key)),
    tratadas: hotspots.filter(hotspot => treated.has(hotspot.key)),
  }
}

/**
 * Lista da aba "PONs tratadas", cruzada com o CSV carregado: mostra quais
 * tratativas não pegaram sem reabrir nada sozinho.
 */
export function buildTreatedPons(items: PonTreatment[], hotspots: SignalHotspot[]): TreatedPon[] {
  const current = new Map(hotspots.map(hotspot => [hotspot.key, hotspot]))
  return items
    .filter(item => item.action === 'tratada')
    .map(item => ({ ...item, aindaCritica: current.has(item.pon_key), atual: current.get(item.pon_key) ?? null }))
    .sort((a, b) =>
      Number(b.aindaCritica) - Number(a.aindaCritica)
      || b.reopened_count - a.reopened_count
      || b.created_at.localeCompare(a.created_at))
}

/** Quanto do cadastro de potências da PON já foi preenchido. */
export function medicoesProgresso(item: Pick<PonTreatment, 'medicoes'>) {
  const medicoes = item.medicoes ?? []
  const preenchidas = medicoes.filter(medicao => medicao.rx_depois != null).length
  return { total: medicoes.length, preenchidas, pendentes: medicoes.length - preenchidas }
}

export function treatedSummary(treated: TreatedPon[]) {
  return {
    total: treated.length,
    aindaCriticas: treated.filter(item => item.aindaCritica).length,
    normalizadas: treated.filter(item => !item.aindaCritica).length,
    reincidentes: treated.filter(item => item.reopened_count > 0).length,
    potenciasPendentes: treated.filter(item => medicoesProgresso(item).pendentes > 0).length,
  }
}
