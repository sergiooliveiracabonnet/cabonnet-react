import type { RevisitaMotivoItem } from '../api'
import type { RevisitJourney } from '../../hooks/useRevisitJourneys'
import { inferRevisitCause, type CauseLevel } from './revisitCause'

export type RevisitTipo = 'instalacao' | 'servico' | 'manutencao'

/** Mesma ordem das abas do BI Gestão Técnica. */
export const REVISIT_TIPOS: { tipo: RevisitTipo; label: string }[] = [
  { tipo: 'instalacao', label: 'Instalação' },
  { tipo: 'servico',    label: 'Serviço'    },
  { tipo: 'manutencao', label: 'Manutenção' },
]

export interface RevisitReasonItem {
  revisitOs: string
  originOs: string | null
  category: string
  level: CauseLevel
  confidence: number
  occurrence: string
  city: string
  team: string
  /** null quando a linha oficial não trouxe nenhuma das três flags. */
  tipo: RevisitTipo | null
}

export interface RevisitReasonTipo {
  tipo: RevisitTipo
  label: string
  count: number
  pct: number
  categories: RevisitReasonCategory[]
}

export interface RevisitReasonCategory {
  category: string
  count: number
  pct: number
  confirmed: number
  probable: number
  occurrences: string[]
}

export interface RevisitReasonScope {
  total: number
  confirmed: number
  probable: number
  undetermined: number
  coveragePct: number
  categories: RevisitReasonCategory[]
  byTipo: RevisitReasonTipo[]
}

export interface RevisitReasonCity extends RevisitReasonScope {
  city: string
  /** Motivo dominante da cidade — o "o que mais impacta aqui". */
  topCategory: string | null
  topCount: number
  topPct: number
}

export interface RevisitReasonsSummary extends RevisitReasonScope {
  items: RevisitReasonItem[]
  byCity: RevisitReasonCity[]
}

function tipoDaRevisita(row: RevisitJourney['revisit']): RevisitTipo | null {
  if (Number(row?.revisita_inst) === 1) return 'instalacao'
  if (Number(row?.revisita_serv) === 1) return 'servico'
  if (Number(row?.revisita_manut) === 1) return 'manutencao'
  return null
}

function evidenceTexts(journey: RevisitJourney): string[] {
  return [
    journey.revisit.observacao,
    journey.revisit.motivocancelamento,
    journey.revisit.motivoreagendamento,
    journey.origin?.observacao,
    journey.origin?.motivocancelamento,
    journey.origin?.motivoreagendamento,
  ].map(value => String(value ?? '').trim()).filter(Boolean)
}

export function buildRevisitReasonsSummary(journeys: RevisitJourney[], motives: RevisitaMotivoItem[]): RevisitReasonsSummary {
  const motiveByOs = new Map(motives.map(item => [String(item.numos), item.motivo]))
  const items = journeys.map<RevisitReasonItem>(journey => {
    const texts = evidenceTexts(journey)
    const cause = inferRevisitCause({ manualReason: motiveByOs.get(journey.revisit_os), texts })
    return {
      revisitOs: journey.revisit_os,
      originOs: journey.origin_os,
      category: cause.category,
      level: cause.level,
      confidence: cause.confidence,
      occurrence: cause.evidence[0] ?? texts[0] ?? '',
      city: journey.revisit.nomedacidade || 'Sem cidade',
      team: journey.revisit.equipeexecutou || journey.revisit.nomedaequipe || 'Sem equipe',
      tipo: tipoDaRevisita(journey.revisit),
    }
  })

  return { ...summarizeReasonItems(items), items, byCity: summarizeByCity(items) }
}

/** Consolida um subconjunto qualquer de itens. O percentual é sempre relativo
 *  ao subconjunto recebido — é isso que deixa o recorte por cidade responder
 *  "o que mais impacta ESTA cidade" em vez de repetir o ranking geral. */
export function summarizeReasonItems(items: RevisitReasonItem[]): RevisitReasonScope {
  const total = items.length
  const categories = groupCategories(items)
  const confirmed = items.filter(item => item.level === 'confirmed').length
  const probable = items.filter(item => item.level === 'probable').length
  const undetermined = total - confirmed - probable
  return {
    total,
    confirmed,
    probable,
    undetermined,
    coveragePct: total ? Math.round((confirmed + probable) / total * 100) : 0,
    categories,
    byTipo: groupTipos(items),
  }
}

function groupCategories(items: RevisitReasonItem[]): RevisitReasonCategory[] {
  const grouped = new Map<string, RevisitReasonCategory>()
  for (const item of items) {
    const group = grouped.get(item.category) ?? { category: item.category, count: 0, pct: 0, confirmed: 0, probable: 0, occurrences: [] }
    group.count++
    if (item.level === 'confirmed') group.confirmed++
    if (item.level === 'probable') group.probable++
    if (item.occurrence && group.occurrences.length < 5 && !group.occurrences.includes(item.occurrence)) group.occurrences.push(item.occurrence)
    grouped.set(item.category, group)
  }
  const total = items.length
  return [...grouped.values()]
    .map(group => ({ ...group, pct: total ? Math.round(group.count / total * 100) : 0 }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
}

/** Os três tipos sempre voltam, inclusive zerados: cidade sem revisita de
 *  instalação é informação, não ausência dela. O percentual do tipo é sobre o
 *  escopo (cidade ou geral); o das categorias, dentro do próprio tipo. */
function groupTipos(items: RevisitReasonItem[]): RevisitReasonTipo[] {
  const total = items.length
  return REVISIT_TIPOS.map(({ tipo, label }) => {
    const doTipo = items.filter(item => item.tipo === tipo)
    return {
      tipo,
      label,
      count: doTipo.length,
      pct: total ? Math.round(doTipo.length / total * 100) : 0,
      categories: groupCategories(doTipo),
    }
  })
}

function summarizeByCity(items: RevisitReasonItem[]): RevisitReasonCity[] {
  const byCity = new Map<string, RevisitReasonItem[]>()
  for (const item of items) {
    const bucket = byCity.get(item.city)
    if (bucket) bucket.push(item)
    else byCity.set(item.city, [item])
  }
  return [...byCity.entries()]
    .map(([city, cityItems]) => {
      const scope = summarizeReasonItems(cityItems)
      const top = scope.categories[0]
      return {
        city,
        ...scope,
        topCategory: top?.category ?? null,
        topCount: top?.count ?? 0,
        topPct: top?.pct ?? 0,
      }
    })
    .sort((a, b) => b.total - a.total || a.city.localeCompare(b.city))
}
