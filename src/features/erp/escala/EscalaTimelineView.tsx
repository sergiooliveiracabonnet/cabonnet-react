import { useMemo, useState } from 'react'
import { CaretLeft, CaretRight, Clock, WarningCircle } from '@phosphor-icons/react'
import { useERPRows } from '../useERPRows'
import {
  getDay, MONTH_PT, SectionLabel, PlannerDrillModal,
  type DrillState, type WeekDay,
} from '../planner/PlannerComponents'
import { buildTimeline, TIMELINE_HOURS, type TeamTimeline } from './escalaTimeline'
import type { OSRow } from '../../../lib/types'

function HourCell({ rows, onClick }: { rows: OSRow[]; onClick: () => void }) {
  const count = rows.length
  if (count === 0) {
    return <td className="px-1.5 py-2 text-center border-r border-hairline last:border-r-0"><span className="text-caption text-muted/40">—</span></td>
  }
  const conflito = count > 1
  return (
    <td className="px-1.5 py-2 text-center border-r border-hairline last:border-r-0">
      <button
        onClick={onClick}
        title={rows.map(r => `${r.numos} · ${r.nomecliente || '—'} · ${r.nomedacidade || '—'}`).join('\n')}
        className={`w-full rounded-md px-1.5 py-1 text-caption font-mono font-bold tabular-nums transition-colors
                    flex items-center justify-center gap-1
                    ${conflito
                      ? 'bg-red/15 text-red border border-red/40 hover:bg-red/25'
                      : 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20'}`}
      >
        {conflito && <WarningCircle size={10} />}
        {count}
      </button>
    </td>
  )
}

export function EscalaTimelineView() {
  const { allRows, isLoading } = useERPRows()
  const [dayOffset, setDayOffset] = useState(0)
  const [drill, setDrill] = useState<DrillState | null>(null)

  const day: WeekDay = useMemo(() => getDay(dayOffset), [dayOffset])
  const teams: TeamTimeline[] = useMemo(() => buildTimeline(allRows, day.key), [allRows, day.key])

  const dayLabel = `${day.dow}, ${day.label} ${MONTH_PT[day.dt.getMonth()]}`
  const totalOS = teams.reduce((s, t) => s + t.total, 0)
  const conflitos = teams.reduce((s, t) =>
    s + TIMELINE_HOURS.filter(h => (t.porHora[h]?.length ?? 0) > 1).length, 0)

  const openDrill = (team: string, rows: OSRow[]) => setDrill({ team, day, rows })

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <SectionLabel icon={Clock} color="rgb(var(--c-primary))">
          Linha do tempo — 08h às 18h · 1h por OS
        </SectionLabel>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setDayOffset(p => p - 1)}
                  className="w-8 h-8 rounded-lg border border-subtle flex items-center justify-center
                             text-muted hover:text-text hover:border-muted/40 transition-all">
            <CaretLeft size={14} />
          </button>
          <span className="text-label font-semibold text-text px-1 min-w-48 text-center">
            {day.isToday ? `Hoje · ${dayLabel}` : dayLabel}
          </span>
          <button onClick={() => setDayOffset(p => p + 1)}
                  className="w-8 h-8 rounded-lg border border-subtle flex items-center justify-center
                             text-muted hover:text-text hover:border-muted/40 transition-all">
            <CaretRight size={14} />
          </button>
          {dayOffset !== 0 && (
            <button onClick={() => setDayOffset(0)}
                    className="text-caption text-primary hover:text-primary/80 border border-primary/30
                               rounded-lg px-2.5 py-1 transition-colors">
              Hoje
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'OS no dia',           value: totalOS,      color: 'rgb(var(--c-primary))' },
          { label: 'Equipes com OS',      value: teams.length, color: 'rgb(var(--c-green))' },
          { label: 'Conflitos de horário', value: conflitos,   color: conflitos > 0 ? 'rgb(var(--c-red))' : 'rgb(var(--c-green))' },
        ].map((k, i) => (
          <div key={i} className="relative overflow-hidden rounded-xl border bg-card" style={{ borderColor: `color-mix(in srgb, ${k.color} 13%, transparent)` }}>
            <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: k.color }} />
            <div className="p-4">
              <p className="text-caption text-muted mb-1.5">{k.label}</p>
              <p className="font-mono font-black tabular-nums text-readout leading-none" style={{ color: k.color }}>{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24 gap-3 text-secondary text-sm">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Carregando…
        </div>
      ) : teams.length === 0 ? (
        <div className="rounded-2xl border border-subtle bg-card px-4 py-12 text-center">
          <p className="text-body font-semibold text-text mb-1">Nenhuma OS agendada para este dia</p>
          <p className="text-caption text-muted">Navegue para outro dia para ver a carga das equipes</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-subtle bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-subtle bg-surface/30">
                  <th className="px-4 py-3 text-left text-caption font-bold uppercase tracking-label text-muted w-44">
                    Equipe
                  </th>
                  {TIMELINE_HOURS.map(h => (
                    <th key={h} className="px-1.5 py-3 text-center text-caption font-bold text-muted border-r border-hairline last:border-r-0">
                      {String(h).padStart(2, '0')}h
                    </th>
                  ))}
                  <th className="px-2 py-3 text-center text-caption font-bold uppercase tracking-label text-muted w-24">
                    Sem horário
                  </th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t, i) => (
                  <tr key={t.team} className="border-b border-subtle hover:bg-surface/30 transition-colors"
                      style={{ animationDelay: `${i * 20}ms` }}>
                    <td className="px-4 py-2 w-44">
                      <p className="text-label font-semibold text-text truncate">{t.team}</p>
                      <p className="text-caption text-muted">{t.total} OS</p>
                    </td>
                    {TIMELINE_HOURS.map(h => (
                      <HourCell key={h} rows={t.porHora[h] ?? []} onClick={() => openDrill(t.team, t.porHora[h] ?? [])} />
                    ))}
                    <td className="px-2 py-2 text-center w-24">
                      {t.semHorario.length > 0 ? (
                        <button
                          onClick={() => openDrill(t.team, t.semHorario)}
                          className="rounded-md px-2 py-1 text-caption font-mono font-bold tabular-nums
                                     bg-surface/60 text-muted border border-subtle hover:text-text transition-colors"
                        >
                          {t.semHorario.length}
                        </button>
                      ) : (
                        <span className="text-caption text-muted/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-caption text-muted flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-primary/20 border border-primary/40" /> 1 OS na hora
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-red/20 border border-red/40" /> 2+ OS — conflito de horário
        </span>
        <span>· Clique numa célula para ver as OS</span>
      </div>

      <PlannerDrillModal drill={drill} onClose={() => setDrill(null)} />
    </section>
  )
}
