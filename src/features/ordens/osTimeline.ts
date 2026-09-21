import type { AgendamentoHistoricoEntry } from '../../hooks/useAgendamentoHistorico'

export interface AgendamentoSequenceItem {
  label: string
  date: string | null
  equipe: string | null
  observacao: string | null
  isCurrent: boolean
  /** Momento em que o polling (cache.py) detectou a troca — quando a ação
   *  aconteceu de fato, não a data/hora para a qual a OS foi agendada (`date`,
   *  que muitas vezes vem sem hora, só a data). Nulo nos dois eventos
   *  sintéticos (1º atendimento e agendamento atual), que vêm direto da OS, não
   *  do histórico persistido. */
  registradoEm: string | null
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

// `ts` é epoch em segundos (Python datetime.now().timestamp(), tz local
// correta) — usa os getters locais do Date, não toISOString/fmtDate, senão a
// exibição vira UTC e volta a errar o horário por 3h.
function formatRegistradoEm(ts: number | null | undefined): string | null {
  if (!ts) return null
  const date = new Date(ts * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

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
  const events: Array<Pick<AgendamentoSequenceItem, 'date' | 'equipe' | 'observacao' | 'registradoEm'>> = []
  const firstPersistedTeam = orderedHistory[0]?.nomedaequipe || equipeAgendada || null

  if (dataatendimento?.trim()) {
    events.push({ date: dataatendimento, equipe: firstPersistedTeam, observacao: null, registradoEm: null })
  }

  for (const entry of orderedHistory) {
    const event = {
      date: entry.dataagendamento,
      equipe: entry.nomedaequipe,
      observacao: entry.observacoes || entry.observacaocritica || null,
      registradoEm: formatRegistradoEm(entry.ts),
    }
    if (!events.some(existing => sameSchedule(existing, event))) events.push(event)
  }

  if (dataagendamento?.trim()) {
    const current = { date: dataagendamento, equipe: equipeAgendada ?? null, observacao: null, registradoEm: null }
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
