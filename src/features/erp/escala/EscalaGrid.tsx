import { useMemo, useState } from 'react'
import { CaretLeft, CaretRight, Rows, Plus, X, CopySimple } from '@phosphor-icons/react'
import { FilterSelect } from '../../../components/ui/FilterSelect'
import { MONTH_PT, SectionLabel, type WeekDay } from '../planner/PlannerComponents'
import {
  ESCALA_EQUIPES, EMPRESA_LABEL, EMPRESA_COLOR, STATUS_OPTIONS, buildStatusMap,
  type EscalaEquipe, type CellValue,
} from './escalaConstants'
import type { EscalaItem } from '../../../lib/api'

const STATUS_SELECT_OPTIONS = STATUS_OPTIONS.map(s => ({ value: s, label: s }))

function EscalaCell({
  equipe, day, value, onChange, onFillWeek,
}: {
  equipe: EscalaEquipe
  day:    WeekDay
  value:  CellValue
  onChange:   (patch: Partial<CellValue>) => void
  onFillWeek: () => void
}) {
  const [addingSecond, setAddingSecond] = useState(false)
  const showLocal2 = !!value.local2 || addingSecond

  return (
    <td className={`px-3 py-3 border-r border-hairline last:border-r-0 align-top ${day.isWeekend ? 'bg-surface/10' : ''}`}>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <FilterSelect
            className="flex-1"
            value={value.local1}
            onChange={v => {
              if (!v) setAddingSecond(false)
              onChange(v ? { local1: v } : { local1: '', local2: '' })
            }}
            options={STATUS_SELECT_OPTIONS}
            placeholder="—"
            ariaLabel={`${equipe.codigo} — Local 1 — ${day.label}`}
          />
          {value.local1 && !showLocal2 && (
            <button
              onClick={() => setAddingSecond(true)}
              title="Adicionar um segundo local neste dia"
              aria-label="Adicionar um segundo local neste dia"
              className="w-6 h-6 flex-shrink-0 rounded-md border border-subtle flex items-center justify-center
                         text-muted hover:text-primary hover:border-primary/40 transition-colors"
            >
              <Plus size={11} />
            </button>
          )}
          {value.local1 && (
            <button
              onClick={onFillWeek}
              title={`Preencher a semana toda com "${value.local1}" para ${equipe.codigo}`}
              aria-label="Preencher a semana toda com este local"
              className="w-6 h-6 flex-shrink-0 rounded-md border border-subtle flex items-center justify-center
                         text-muted hover:text-primary hover:border-primary/40 transition-colors"
            >
              <CopySimple size={11} />
            </button>
          )}
        </div>

        {showLocal2 && (
          <div className="flex items-center gap-1.5">
            <FilterSelect
              className="flex-1 opacity-70"
              value={value.local2}
              onChange={v => onChange({ local2: v })}
              options={STATUS_SELECT_OPTIONS}
              placeholder="—"
              ariaLabel={`${equipe.codigo} — Local 2 — ${day.label}`}
            />
            <button
              onClick={() => { setAddingSecond(false); onChange({ local2: '' }) }}
              title="Remover segundo local"
              aria-label="Remover segundo local"
              className="w-6 h-6 flex-shrink-0 rounded-md border border-subtle flex items-center justify-center
                         text-muted hover:text-red hover:border-red/40 transition-colors"
            >
              <X size={11} />
            </button>
          </div>
        )}
      </div>
    </td>
  )
}

export function EscalaGrid({
  days, weekOffset, onWeekOffsetChange, items, isLoading, onChangeStatus,
}: {
  days:                WeekDay[]
  weekOffset:          number
  onWeekOffsetChange:  (offset: number | ((p: number) => number)) => void
  items:               EscalaItem[]
  isLoading:           boolean
  onChangeStatus:      (body: { team_code: string; dia: string; local1?: string; local2?: string }) => void
}) {
  const statusMap = useMemo(() => buildStatusMap(items), [items])

  const weekLabel = (() => {
    const first = days[0]; const last = days[6]
    return `${first.label} – ${last.label} ${MONTH_PT[last.dt.getMonth()]}`
  })()

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <SectionLabel icon={Rows} color="#3b82f6">
          Grade semanal — {ESCALA_EQUIPES.length} equipes
        </SectionLabel>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => onWeekOffsetChange(p => p - 1)}
                  className="w-8 h-8 rounded-lg border border-subtle flex items-center justify-center
                             text-muted hover:text-text hover:border-muted/40 transition-all">
            <CaretLeft size={14} />
          </button>
          <span className="text-label font-semibold text-text px-1 min-w-40 text-center">
            {weekOffset === 0 ? `Semana atual · ${weekLabel}` : weekOffset > 0 ? `+${weekOffset}sem · ${weekLabel}` : `${weekOffset}sem · ${weekLabel}`}
          </span>
          <button onClick={() => onWeekOffsetChange(p => p + 1)}
                  className="w-8 h-8 rounded-lg border border-subtle flex items-center justify-center
                             text-muted hover:text-text hover:border-muted/40 transition-all">
            <CaretRight size={14} />
          </button>
          {weekOffset !== 0 && (
            <button onClick={() => onWeekOffsetChange(0)}
                    className="text-caption text-primary hover:text-primary/80 border border-primary/30
                               rounded-lg px-2.5 py-1 transition-colors">
              Hoje
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-subtle bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-subtle bg-surface/30">
                <th className="px-4 py-3 text-left text-caption font-bold uppercase tracking-label text-muted w-44">
                  Equipe
                </th>
                {days.map(d => (
                  <th key={d.key}
                      className={`px-3 py-3 text-center text-caption font-bold border-r border-hairline last:border-r-0 w-56
                                  ${d.isToday ? 'text-primary' : d.isWeekend ? 'text-muted/70' : 'text-muted'}
                                  ${d.isWeekend ? 'bg-surface/10' : ''}`}>
                    <div>{d.dow}</div>
                    <div className={`text-caption font-normal mt-0.5 ${d.isToday ? 'text-primary/70' : ''}`}>{d.label}</div>
                    {d.isToday && <div className="w-1 h-1 rounded-full bg-primary mx-auto mt-0.5" />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-label text-muted">Carregando…</td></tr>
              ) : (
                ESCALA_EQUIPES.map((equipe, i) => (
                  <tr key={equipe.codigo}
                      className="border-b border-subtle hover:bg-surface/30 transition-colors"
                      style={{ animationDelay: `${i * 20}ms` }}>
                    <td className="px-4 py-3 w-44 border-l-4" style={{ borderLeftColor: EMPRESA_COLOR[equipe.empresa] }}>
                      <p className="text-label font-semibold text-text truncate">{equipe.codigo}{equipe.tecnico ? ` — ${equipe.tecnico}` : ''}</p>
                      <p className="text-caption text-muted truncate">{EMPRESA_LABEL[equipe.empresa]} · {equipe.clusterBase}</p>
                    </td>
                    {days.map(d => {
                      const value = statusMap.get(`${equipe.codigo}|${d.key}`) ?? { local1: '', local2: '' }
                      return (
                        <EscalaCell
                          key={d.key}
                          equipe={equipe}
                          day={d}
                          value={value}
                          onChange={patch => onChangeStatus({
                            team_code: equipe.codigo,
                            dia:       d.key,
                            local1:    patch.local1 ?? value.local1,
                            local2:    patch.local2 ?? value.local2,
                          })}
                          onFillWeek={() => {
                            for (const dd of days) {
                              onChangeStatus({
                                team_code: equipe.codigo,
                                dia:       dd.key,
                                local1:    value.local1,
                                local2:    value.local2,
                              })
                            }
                          }}
                        />
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-4 text-caption text-muted flex-wrap">
        {Object.entries(EMPRESA_LABEL).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: EMPRESA_COLOR[key as keyof typeof EMPRESA_COLOR] }} />{label}
          </span>
        ))}
      </div>
    </section>
  )
}
