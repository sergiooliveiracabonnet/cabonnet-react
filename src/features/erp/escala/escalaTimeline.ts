import type { OSRow } from '../../../lib/types'
import { shortEquipe } from '../../../lib/osFormat'
import { isCOPE, isReagend } from '../../../lib/transform'
import { parseAgendDate, toKey } from '../planner/PlannerComponents'

// Janela de atendimento ao cliente: 08h–18h, cada OS ocupa exatamente 1 hora —
// por isso o slot é o próprio horário de início (08 cobre 08:00–09:00, etc.).
export const TIMELINE_START_HOUR = 8
export const TIMELINE_END_HOUR   = 18
export const TIMELINE_HOURS = Array.from(
  { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR },
  (_, i) => TIMELINE_START_HOUR + i,
)

export interface TeamTimeline {
  team:       string
  porHora:    Record<number, OSRow[]>
  semHorario: OSRow[]
  total:      number
}

// horaatendimento não é campo tipado em OSRow (chega via CSV bruto, index
// signature), então validamos a forma em vez de confiar no tipo.
function horaDe(r: OSRow): number | null {
  const raw = r.horaatendimento
  if (typeof raw !== 'string') return null
  const m = raw.trim().match(/^(\d{1,2}):/)
  if (!m) return null
  const h = Number(m[1])
  return Number.isFinite(h) ? h : null
}

/** Agrupa as OS de um dia por equipe e depois por hora de atendimento — para
 *  ver, hora a hora, se a carga de uma equipe está dentro da janela 08h–18h
 *  (cada OS = 1h) ou se duas OS caíram na mesma hora (conflito de agenda). */
export function buildTimeline(allRows: OSRow[], dayKey: string): TeamTimeline[] {
  const rows = allRows.filter(r =>
    !isCOPE(r) && !isReagend(r) && toKey(parseAgendDate(r)) === dayKey
  )

  const byTeam = new Map<string, TeamTimeline>()
  for (const r of rows) {
    const team = shortEquipe(r.nomedaequipe) || 'Sem equipe'
    let t = byTeam.get(team)
    if (!t) { t = { team, porHora: {}, semHorario: [], total: 0 }; byTeam.set(team, t) }

    const hour = horaDe(r)
    if (hour === null || hour < TIMELINE_START_HOUR || hour >= TIMELINE_END_HOUR) {
      t.semHorario.push(r)
    } else {
      (t.porHora[hour] ??= []).push(r)
    }
    t.total += 1
  }

  return [...byTeam.values()].sort((a, b) => b.total - a.total)
}
