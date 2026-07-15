import { useMemo, useState } from 'react'
import { CalendarDays, MapPin, ChevronLeft, ChevronRight, Target, Sparkles } from 'lucide-react'
import { useERPRows }  from '../useERPRows'
import { useERPStore } from '../../../store/erpStore'
import { useIsGestor } from '../../../hooks/useRole'
import { shortEquipe } from '../../../lib/osFormat'
import { isCOPE, isReagend } from '../../../lib/transform'
import { useAIPlanner } from '../../../hooks/useAIPlanner'
import {
  SectionLabel, PlannerDrillModal, PlannerCell,
  getWeekDays, buildPlanner, MONTH_PT,
  type DrillState,
} from './PlannerComponents'

export default function PlannerPage() {
  const { allRows, isLoading }                    = useERPRows()
  const { metaEquipeDiaria, setMetaEquipeDiaria } = useERPStore()
  const isGestor                                  = useIsGestor()
  const [weekOffset, setWeekOffset] = useState(0)
  const [drill, setDrill]           = useState<DrillState | null>(null)
  const [editMeta, setEditMeta]     = useState(false)
  const [aiEnabled, setAiEnabled]   = useState(false)

  const days  = useMemo(() => getWeekDays(weekOffset), [weekOffset])
  const teams = useMemo(() => buildPlanner(allRows, days), [allRows, days])

  const totalSemana = teams.reduce((s, t) => s + t.weekTotal, 0)

  const cidades = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of teams)
      for (const dayRows of Object.values(t.schedule))
        for (const r of dayRows) {
          const c = (r.nomedacidade || '').trim()
          if (c) map[c] = (map[c] || 0) + 1
        }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [teams])

  const equipesSemOS = useMemo(() => {
    const inPlan = new Set(teams.map(t => t.team))
    const all    = new Set(
      allRows
        .filter(r => !isCOPE(r) && !isReagend(r) && r.nomedaequipe?.trim())
        .map(r => shortEquipe(r.nomedaequipe))
    )
    return [...all].filter(e => !inPlan.has(e)).length
  }, [allRows, teams])

  const aiEquipes = useMemo(() =>
    teams.map(t => ({
      nome:         t.team,
      total_semana: t.weekTotal,
      por_dia:      Object.fromEntries(
        days.map(d => [d.key, t.schedule[d.key]?.length ?? 0])
      ),
    }))
  , [teams, days])

  const aiDias = useMemo(() => days.map(d => d.key), [days])

  const metaGlobal = useMemo(() => {
    const vals = Object.values(metaEquipeDiaria).filter(v => v > 0)
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
  }, [metaEquipeDiaria])

  const { data: aiData, isFetching: aiLoading } = useAIPlanner({
    equipes:     aiEquipes,
    meta_diaria: metaGlobal,
    dias:        aiDias,
    enabled:     aiEnabled,
  })

  const weekLabel = (() => {
    const first = days[0]; const last = days[6]
    return `${first.label} – ${last.label} ${MONTH_PT[last.dt.getMonth()]}`
  })()

  const loadDays = days.map(d => ({
    ...d,
    total: teams.reduce((s, t) => s + (t.schedule[d.key]?.length || 0), 0),
  }))
  const maxDayLoad = Math.max(...loadDays.map(d => d.total), 1)

  if (isLoading) return (
    <div className="flex items-center justify-center py-24 gap-3 text-secondary text-sm">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      Carregando…
    </div>
  )

  return (
    <div className="space-y-4 max-w-[1600px]">

      {/* Header + navegação */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-headline font-bold text-text mb-0.5">Planner Semanal</h1>
          <p className="text-label text-muted">Clique em qualquer célula para ver as OS daquele dia</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => isGestor && setEditMeta(v => !v)}
            disabled={!isGestor}
            title={!isGestor ? 'Apenas gestores podem definir metas' : undefined}
            className={`flex items-center gap-1.5 text-caption font-semibold px-3 py-1.5 rounded-xl border transition-all disabled:opacity-40 disabled:cursor-not-allowed
                        ${editMeta ? 'bg-primary/15 border-primary/40 text-primary' : 'border-white/[0.08] text-secondary hover:text-text'}`}>
            <Target size={12} /> {editMeta ? 'Concluir' : 'Definir Metas'}
          </button>
          <button onClick={() => setWeekOffset(p => p - 1)}
                  className="w-8 h-8 rounded-lg border border-white/[0.08] flex items-center justify-center
                             text-muted hover:text-text hover:border-muted/40 transition-all">
            <ChevronLeft size={14} />
          </button>
          <span className="text-label font-semibold text-text px-1 min-w-[160px] text-center">
            {weekOffset === 0 ? `Semana atual · ${weekLabel}` : weekOffset > 0 ? `+${weekOffset}sem · ${weekLabel}` : `${weekOffset}sem · ${weekLabel}`}
          </span>
          <button onClick={() => setWeekOffset(p => p + 1)}
                  className="w-8 h-8 rounded-lg border border-white/[0.08] flex items-center justify-center
                             text-muted hover:text-text hover:border-muted/40 transition-all">
            <ChevronRight size={14} />
          </button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)}
                    className="text-caption text-primary hover:text-primary/80 border border-primary/30
                               rounded-lg px-2.5 py-1 transition-colors">
              Hoje
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'OS na semana',     value: totalSemana,    color: '#3b82f6'  },
          { label: 'Equipes ativas',   value: teams.length,   color: '#4ade80'  },
          { label: 'Equipes sem OS',   value: equipesSemOS,   color: equipesSemOS > 0 ? '#facc15' : '#4ade80' },
          { label: 'Cidades cobertas', value: cidades.length, color: '#c4b5fd'  },
        ].map((k, i) => (
          <div key={i}
               className="relative overflow-hidden rounded-xl border bg-card animate-card-enter"
               style={{ borderColor: `${k.color}22`, animationDelay: `${i * 50}ms` }}>
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: k.color }} />
            <div className="p-4">
              <p className="text-caption text-muted mb-1.5">{k.label}</p>
              <p className="font-mono font-black tabular-nums text-display leading-none" style={{ color: k.color }}>{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Carga diária */}
      <div className="rounded-xl border border-white/[0.08] bg-card p-4">
        <p className="text-caption font-bold uppercase tracking-[0.06em] text-muted mb-3">Carga total por dia</p>
        <div className="flex gap-2">
          {loadDays.map(d => {
            const pct   = maxDayLoad > 0 ? (d.total / maxDayLoad) * 100 : 0
            const color = d.isToday ? '#3b82f6' : d.isWeekend ? '#374151' : '#3b82f6'
            return (
              <div key={d.key} className="flex-1 flex flex-col items-center">
                <span className="h-4 flex items-end pb-0.5 text-caption font-mono text-muted tabular-nums">
                  {d.total > 0 ? d.total : ''}
                </span>
                <div className="h-10 w-full flex items-end">
                  <div className="w-full rounded-sm transition-all duration-700"
                       style={{ height: `${Math.max(d.total > 0 ? 8 : 2, pct * 0.4)}px`, background: d.total > 0 ? color : 'rgba(255,255,255,0.04)' }} />
                </div>
                <span className={`text-caption font-bold mt-1 ${d.isToday ? 'text-primary' : 'text-muted'}`}>{d.dow}</span>
                <span className="text-caption text-muted/70">{d.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Grade principal */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionLabel icon={CalendarDays} color="#3b82f6">
            Grade — {teams.length} equipes com OS na semana
          </SectionLabel>
          <div className="flex items-center gap-3 text-caption text-muted">
            {[['#4ade80','1-2'],['#facc15','3-4'],['#f97316','5-7'],['#f87171','8+']].map(([c,l]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ background: c }} />{l}
              </span>
            ))}
          </div>
        </div>

        {teams.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-card px-4 py-12 text-center">
            <p className="text-body font-semibold text-text mb-1">Nenhuma OS agendada para esta semana</p>
            <p className="text-caption text-muted">Navegue para outra semana ou verifique os agendamentos</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-surface/30">
                    <th className="px-4 py-3 text-left text-caption font-bold uppercase tracking-[0.05em] text-muted w-[160px]">
                      Equipe
                    </th>
                    {days.map(d => (
                      <th key={d.key}
                          className={`px-2 py-3 text-center text-caption font-bold border-r border-white/[0.04] last:border-r-0 w-[100px]
                                      ${d.isToday ? 'text-primary' : d.isWeekend ? 'text-muted/70' : 'text-muted'}
                                      ${d.isWeekend ? 'bg-surface/10' : ''}`}>
                        <div>{d.dow}</div>
                        <div className={`text-caption font-normal mt-0.5 ${d.isToday ? 'text-primary/70' : ''}`}>{d.label}</div>
                        {d.isToday && <div className="w-1 h-1 rounded-full bg-primary mx-auto mt-0.5" />}
                      </th>
                    ))}
                    {editMeta && (
                      <th className="px-3 py-3 text-center text-caption font-bold uppercase tracking-[0.05em] text-muted w-[70px]">
                        Meta/sem
                      </th>
                    )}
                    <th className="px-3 py-3 text-right text-caption font-bold uppercase tracking-[0.05em] text-muted w-[80px]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t, i) => (
                    <tr key={t.team}
                        className="border-b border-white/[0.08] hover:bg-surface/30 transition-colors"
                        style={{ animationDelay: `${i * 30}ms` }}>
                      <td className="px-4 py-3 w-[160px]">
                        <p className="text-[11.5px] font-semibold text-text truncate">{t.team}</p>
                      </td>
                      {days.map(d => (
                        <PlannerCell
                          key={d.key}
                          rows={t.schedule[d.key] || []}
                          isPast={d.isPast}
                          _isToday={d.isToday}
                          isWeekend={d.isWeekend}
                          onClick={() => {
                            const rows = t.schedule[d.key] || []
                            if (rows.length === 0) return
                            setDrill({ team: t.team, day: d, rows })
                          }}
                        />
                      ))}
                      {editMeta && (
                        <td className="px-3 py-3 text-center w-[70px]">
                          <input
                            type="number" min={0} max={200}
                            value={metaEquipeDiaria[t.team] ?? ''}
                            placeholder="—"
                            onChange={e => setMetaEquipeDiaria(t.team, Number(e.target.value))}
                            onClick={e => e.stopPropagation()}
                            className="w-14 bg-surface border border-white/[0.08] rounded-md px-1.5 py-1
                                       text-caption font-mono text-text text-center outline-none
                                       focus:border-primary/50 transition-colors"
                          />
                        </td>
                      )}
                      <td className="px-3 py-3 text-right w-[80px]">
                        {(() => {
                          const meta  = metaEquipeDiaria[t.team] ?? 0
                          const pct   = meta > 0 ? Math.round((t.weekTotal / meta) * 100) : null
                          const color = pct == null ? 'text-text' : pct >= 100 ? 'text-green' : pct >= 70 ? 'text-yellow' : 'text-red'
                          return (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className={`font-mono font-bold text-body ${color}`}>{t.weekTotal}</span>
                              {meta > 0 && pct !== null && (
                                <div className="w-10 h-1 rounded-full overflow-hidden bg-surface">
                                  <div className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? '#4ade80' : pct >= 70 ? '#facc15' : '#f87171' }} />
                                </div>
                              )}
                              {meta > 0 && pct !== null && (
                                <span className={`text-caption font-mono ${color}`}>{pct}%</span>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Cidades cobertas */}
      {cidades.length > 0 && (
        <section className="space-y-2">
          <SectionLabel icon={MapPin} color="#c4b5fd">Cidades cobertas na semana</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {cidades.map(([cidade, cnt]: [string, number]) => (
              <div key={cidade} className="flex items-center gap-2 bg-card border border-white/[0.08] rounded-xl px-3 py-2">
                <MapPin size={10} className="text-muted" />
                <span className="text-[11.5px] font-semibold text-text">{cidade}</span>
                <span className="font-mono text-caption text-primary font-bold">{cnt}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── AI Planner — apenas para gestores ── */}
      {isGestor && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={13} className="text-primary/70" />
              <span className="text-caption font-bold text-primary/80 uppercase tracking-wide">
                Sugestao de balanceamento
              </span>
            </div>
            {!aiEnabled && (
              <button
                onClick={() => setAiEnabled(true)}
                className="flex items-center gap-1.5 text-caption font-semibold text-primary/70 hover:text-primary
                           px-3 py-1.5 rounded-lg border border-primary/20 hover:border-primary/40 hover:bg-primary/[0.08]
                           transition-all duration-fast"
              >
                <Sparkles size={11} /> Analisar com IA
              </button>
            )}
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
            {!aiEnabled ? (
              <p className="text-label text-muted/50 italic">Clique em "Analisar com IA" para gerar sugestão de balanceamento.</p>
            ) : aiLoading && !aiData ? (
              <p className="text-label text-muted animate-pulse">Consultando IA…</p>
            ) : !aiData ? (
              <p className="text-label text-muted">
                {teams.length >= 2
                  ? 'Sem sugestão disponível para esta semana.'
                  : 'São necessárias ao menos 2 equipes com OS para gerar sugestão.'}
              </p>
            ) : (
              <div className="space-y-3">
                {aiData.narrativa && (
                  <p className="text-label text-secondary leading-relaxed">{aiData.narrativa}</p>
                )}
                {aiData.sugestoes.length > 0 && (
                  <div className="space-y-2">
                    {aiData.sugestoes.map((s, i) => (
                      <div key={i} className="flex items-start gap-3 bg-card border border-white/[0.08] rounded-lg px-3 py-2.5">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-caption font-bold text-primary">{i + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-label font-semibold text-text">{s.equipe}</p>
                          <p className="text-caption text-secondary mt-0.5">{s.acao}</p>
                        </div>
                        <p className="text-caption text-muted text-right max-w-[160px] flex-shrink-0">{s.impacto}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Legenda */}
      <div className="flex items-center gap-4 text-caption text-muted flex-wrap">
        {[['#3b82f6','Instalação'],['#f97316','Manutenção'],['#64748b','Serviço']].map(([c,l]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{l}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-6 h-1 rounded-full bg-surface overflow-hidden flex">
            <span className="w-1/2 h-full bg-green/60" />
          </span>
          barra verde = % concluída
        </span>
        <span>· Clique na célula para ver as OS</span>
      </div>

      <PlannerDrillModal drill={drill} onClose={() => setDrill(null)} />
    </div>
  )
}
