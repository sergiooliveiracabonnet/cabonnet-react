import type { AgendamentoHistoricoEntry } from '../../hooks/useAgendamentoHistorico'

export interface AgendamentoSequenceItem {
  label: string
  date: string | null
  equipe: string | null
  observacao: string | null
  isCurrent: boolean
}

interface BuildAgendamentoSequenceInput {
  dataatendimento?: string | null
  dataagendamento?: string | null
  equipeAgendada?: string | null
  historico: AgendamentoHistoricoEntry[]
  observacoesReagendamento?: string[]
}

const datePart = (value?: string | null) => (value ?? '').trim().split(/[ T]/)[0]
const teamKey = (value?: string | null) => (value ?? '').trim().toUpperCase()

const sameSchedule = (
  left: Pick<AgendamentoSequenceItem, 'date' | 'equipe'>,
  right: Pick<AgendamentoSequenceItem, 'date' | 'equipe'>,
) => datePart(left.date) === datePart(right.date) && teamKey(left.equipe) === teamKey(right.equipe)

export function buildAgendamentoSequence({
  dataatendimento,
  dataagendamento,
  equipeAgendada,
  historico,
  observacoesReagendamento = [],
}: BuildAgendamentoSequenceInput): AgendamentoSequenceItem[] {
  const orderedHistory = [...historico].sort((a, b) => a.ts - b.ts)
  const events: Array<Pick<AgendamentoSequenceItem, 'date' | 'equipe' | 'observacao'>> = []
  const firstPersistedTeam = orderedHistory[0]?.nomedaequipe || equipeAgendada || null

  if (dataatendimento?.trim()) {
    events.push({ date: dataatendimento, equipe: firstPersistedTeam, observacao: null })
  }

  for (const entry of orderedHistory) {
    const event = {
      date: entry.dataagendamento,
      equipe: entry.nomedaequipe,
      observacao: entry.observacoes || entry.observacaocritica || null,
    }
    if (!events.some(existing => sameSchedule(existing, event))) events.push(event)
  }

  if (dataagendamento?.trim()) {
    const current = { date: dataagendamento, equipe: equipeAgendada ?? null, observacao: null }
    if (!events.some(existing => sameSchedule(existing, current))) events.push(current)
  }

  const hasFirstSchedule = !!dataatendimento?.trim()
  return events.map((event, index) => ({
    ...event,
    label: hasFirstSchedule
      ? (index === 0 ? '1º Agendamento' : `Reagendamento ${index}`)
      : (index === 0 ? 'Agendamento' : `Reagendamento ${index}`),
    isCurrent: index === events.length - 1,
    observacao: event.observacao || (index > 0 ? observacoesReagendamento[index - 1] ?? null : null),
  }))
}
