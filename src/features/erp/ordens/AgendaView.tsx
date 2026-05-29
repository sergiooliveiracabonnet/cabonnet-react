// @ts-nocheck
import { useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, CalendarDays,
  Package, Wrench, Network, AlertTriangle,
  Sunrise, Sunset, Sun,
} from 'lucide-react'
import { useERPRows } from '../useERPRows'
import { shortEquipe } from '../../../lib/osFormat'
import { TEAMS } from '../erpConstants'

// ── Date helpers ──────────────────────────────────────────────────────────────

const DAY_NAMES   = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const MONTH_NAMES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
const PERIOD_ORDER = ['manhã', 'tarde']

function getWeekStart(date) {
  const d = new Date(date)
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function getWeekDays(ws) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws)
    d.setDate(ws.getDate() + i)
    return d
  })
}

function toKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

function parseDate(raw) {
  if (!raw) return null
  const s = raw.trim().split(/[ T]/)[0]
  try {
    if (s.includes('/')) {
      const [d, m, y] = s.split('/')
      return new Date(+y, +m - 1, +d)
    }
    if (s.includes('-')) {
      const [y, m, d] = s.split('-')
      return new Date(+y, +m - 1, +d)
    }
  } catch { /* ignore */ }
  return null
}

// ── Tipo config ───────────────────────────────────────────────────────────────

const TIPO = {
  INSTALACAO: { Icon: Package, cls: 'text-blue-400'    },
  MANUTENCAO: { Icon: Wrench,  cls: 'text-orange-400'  },
  REDE:       { Icon: Network, cls: 'text-emerald-400' },
}

// ── Mini card ─────────────────────────────────────────────────────────────────

function MiniOSCard({ row }) {
  const t = TIPO[row._tipo] || { Icon: AlertTriangle, cls: 'text-muted' }
  const TIcon = t.Icon

  const slaCls = row._slaCritico  ? 'bg-red-500/20 text-red-400'
               : row._slaExcedido ? 'bg-orange-500/20 text-orange-400'
               : 'bg-surface/40 text-muted'
  const slaLabel = row._slaCritico ? 'Crítico' : row._slaExcedido ? 'SLA+' : 'OK'

  return (
    <div className="bg-elevated border border-border rounded-md px-2 py-1.5
                    hover:border-muted/30 transition-colors">
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <span className="font-mono text-[9px] text-primary/70">#{row.numos}</span>
        <span className={`text-[8px] font-bold px-1 rounded ${slaCls}`}>{slaLabel}</span>
      </div>
      <p className="text-[10px] font-medium text-text leading-tight truncate mb-0.5">
        {row.nomecliente || '—'}
      </p>
      <div className="flex items-center gap-1">
        <TIcon size={8} className={t.cls} />
        <span className="text-[9px] text-secondary truncate">
          {row.bairro || row.nomedacidade || '—'}
        </span>
      </div>
    </div>
  )
}

// ── Period mark ───────────────────────────────────────────────────────────────

function PeriodoMark({ periodo }) {
  const lc = (periodo || '').toLowerCase()
  const isManha = lc.includes('manh')
  const isTarde = lc.includes('tarde')
  const PIcon = isManha ? Sunrise : isTarde ? Sunset : Sun
  const cls   = isManha ? 'text-amber-400' : isTarde ? 'text-violet-400' : 'text-muted'
  const line  = isManha ? 'bg-amber-500/20' : isTarde ? 'bg-violet-500/20' : 'bg-surface'

  return (
    <div className="flex items-center gap-1 py-0.5">
      <PIcon size={8} className={cls} />
      <span className={`text-[8px] font-bold uppercase tracking-wider ${cls}`}>{periodo}</span>
      <div className={`flex-1 h-px ${line}`} />
    </div>
  )
}

// ── Agenda cell ───────────────────────────────────────────────────────────────

const MAX_CARDS = 3

function AgendaCell({ dayRows, isToday }) {
  const groups = useMemo(() => {
    if (!dayRows?.length) return []
    const map = {}
    for (const r of dayRows) {
      const p = (r.periodo || '').trim() || 'Sem período'
      ;(map[p] = map[p] || []).push(r)
    }
    return Object.entries(map).sort(([a], [b]) => {
      const ia = PERIOD_ORDER.indexOf(a.toLowerCase())
      const ib = PERIOD_ORDER.indexOf(b.toLowerCase())
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }, [dayRows])

  if (!dayRows?.length) {
    return (
      <div className={`min-h-[52px] flex items-center justify-center
                       ${isToday ? 'bg-primary/[0.03]' : ''}`}>
        <span className="text-[10px] text-white/[0.08]">—</span>
      </div>
    )
  }

  // Build flat item list capped at MAX_CARDS
  const items = []
  let cardCount = 0
  const showMarks = groups.length > 1

  for (const [periodo, periodoRows] of groups) {
    if (cardCount >= MAX_CARDS) break
    if (showMarks) items.push({ kind: 'mark', periodo })
    for (const row of periodoRows) {
      if (cardCount >= MAX_CARDS) break
      items.push({ kind: 'card', row })
      cardCount++
    }
  }

  const overflow = dayRows.length - cardCount

  return (
    <div className={`p-1.5 space-y-1 ${isToday ? 'bg-primary/[0.03]' : ''}`}>
      {items.map((item, idx) =>
        item.kind === 'mark'
          ? <PeriodoMark key={`m-${item.periodo}-${idx}`} periodo={item.periodo} />
          : <MiniOSCard  key={item.row.numos} row={item.row} />
      )}
      {overflow > 0 && (
        <div className="text-[9px] text-muted text-center py-0.5 font-medium">
          +{overflow} mais
        </div>
      )}
    </div>
  )
}

// ── Team row ──────────────────────────────────────────────────────────────────

const TIPO_ROW_ACCENT = {
  INSTALACAO: 'border-l-blue-500/40',
  MANUTENCAO: 'border-l-orange-500/40',
  REDE:       'border-l-emerald-500/40',
}

function TeamRow({ team, teamGrid, weekDayKeys, todayKey, isEven }) {
  const accent = TIPO_ROW_ACCENT[team.tipo] || 'border-l-white/10'

  return (
    <div className={`flex border-b border-border/50 border-l-2 ${accent}
                     ${isEven ? 'bg-surface/10' : ''}`}>
      {/* Team label — sticky left */}
      <div className="sticky left-0 z-10 w-40 flex-shrink-0 flex flex-col justify-center
                      px-3 py-2.5 border-r border-border bg-elevated">
        <p className="text-[11px] font-bold text-text leading-none">{team.code}</p>
        <p className="text-[9px] text-secondary mt-0.5">{team.leader}</p>
      </div>

      {/* Day cells */}
      {weekDayKeys.map(dayKey => (
        <div key={dayKey}
             className="w-40 flex-shrink-0 border-r border-border/50 min-h-[52px]">
          <AgendaCell
            dayRows={teamGrid[dayKey]}
            isToday={dayKey === todayKey}
          />
        </div>
      ))}
    </div>
  )
}

// ── AgendaView (main export) ──────────────────────────────────────────────────

export function AgendaView({ equipeFilter, tipoFilter }) {
  const { rows } = useERPRows()
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [hideEmpty, setHideEmpty] = useState(true)

  const weekDays    = useMemo(() => getWeekDays(weekStart), [weekStart])
  const weekDayKeys = useMemo(() => weekDays.map(toKey), [weekDays])
  const todayKey    = toKey(new Date())
  const isThisWeek  = toKey(weekStart) === toKey(getWeekStart(new Date()))

  // Build full grid: teamCode → dayKey → rows[]
  const fullGrid = useMemo(() => {
    const filtered = rows.filter(r => {
      if (equipeFilter && !r.nomedaequipe?.includes(equipeFilter)) return false
      if (tipoFilter   && r._tipo !== tipoFilter) return false
      return true
    })

    const map = {}
    filtered.forEach(row => {
      const date = parseDate(row.dataagendamento)
      if (!date) return
      const dayKey = toKey(date)
      if (!weekDayKeys.includes(dayKey)) return
      const code = shortEquipe(row.nomedaequipe || '').split(' - ')[0].trim()
      if (!map[code]) map[code] = {}
      ;(map[code][dayKey] = map[code][dayKey] || []).push(row)
    })
    return map
  }, [rows, equipeFilter, tipoFilter, weekDayKeys])

  const visibleTeams = useMemo(() => {
    const teams = tipoFilter
      ? TEAMS.filter(t => t.tipo === tipoFilter)
      : TEAMS
    if (!hideEmpty) return teams
    return teams.filter(t =>
      Object.values(fullGrid[t.code] || {}).some(arr => arr.length > 0)
    )
  }, [fullGrid, hideEmpty, tipoFilter])

  const totalWeek = useMemo(() =>
    Object.values(fullGrid).reduce((sum, tg) =>
      sum + Object.values(tg).reduce((s, arr) => s + arr.length, 0), 0),
    [fullGrid]
  )

  // Day totals (for header badge)
  const dayTotals = useMemo(() => {
    const map = {}
    weekDayKeys.forEach(k => {
      map[k] = visibleTeams.reduce(
        (s, t) => s + (fullGrid[t.code]?.[k]?.length ?? 0), 0
      )
    })
    return map
  }, [fullGrid, visibleTeams, weekDayKeys])

  function prevWeek() {
    setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })
  }
  function nextWeek() {
    setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })
  }

  const rangeLabel = `${weekDays[0].getDate()} ${MONTH_NAMES[weekDays[0].getMonth()]} — ` +
                     `${weekDays[6].getDate()} ${MONTH_NAMES[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">

      {/* ── Controls ── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Week navigation */}
          <div className="flex items-center gap-1 bg-elevated border border-border rounded-lg p-0.5">
            <button
              onClick={prevWeek}
              className="w-7 h-7 rounded-md flex items-center justify-center
                         text-secondary hover:text-text hover:bg-surface transition-colors"
              aria-label="Semana anterior"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              onClick={nextWeek}
              className="w-7 h-7 rounded-md flex items-center justify-center
                         text-secondary hover:text-text hover:bg-surface transition-colors"
              aria-label="Próxima semana"
            >
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Range + today */}
          <span className="text-[13px] font-semibold text-text">{rangeLabel}</span>
          {!isThisWeek && (
            <button
              onClick={() => setWeekStart(getWeekStart(new Date()))}
              className="text-[11px] text-primary px-2 py-1 rounded-md
                         hover:bg-primary/10 transition-colors"
            >
              Hoje
            </button>
          )}

          <span className="text-[11px] text-muted">· {totalWeek} OS agendadas</span>
        </div>

        {/* Toggle empty teams */}
        <button
          onClick={() => setHideEmpty(v => !v)}
          className={`text-[11px] px-3 py-1.5 rounded-lg border transition-all duration-150
                      ${hideEmpty
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-elevated text-secondary hover:text-text'}`}
        >
          {hideEmpty ? 'Só com OS' : 'Todas as equipes'}
        </button>
      </div>

      {/* ── Grid ── */}
      <div className="flex-1 overflow-auto rounded-xl border border-border min-h-0">

        {/* Sticky header */}
        <div className="flex sticky top-0 z-20 bg-elevated border-b border-border">
          {/* Corner */}
          <div className="sticky left-0 z-30 w-40 flex-shrink-0 bg-elevated
                          border-r border-border px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Equipe</p>
          </div>

          {/* Day columns */}
          {weekDays.map((day, i) => {
            const key = toKey(day)
            const isToday = key === todayKey
            const count   = dayTotals[key] ?? 0

            return (
              <div key={key}
                   className={`w-40 flex-shrink-0 border-r border-border/50 px-2 py-2 text-center
                               ${isToday ? 'bg-primary/[0.06]' : ''}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider
                               ${isToday ? 'text-primary' : 'text-muted'}`}>
                  {DAY_NAMES[i]}
                </p>
                <p className={`text-[16px] font-headline font-bold mt-0.5
                               ${isToday ? 'text-primary' : 'text-text'}`}>
                  {day.getDate()}
                </p>
                {count > 0 && (
                  <span className={`text-[9px] font-semibold
                                   ${isToday ? 'text-primary/60' : 'text-muted'}`}>
                    {count} OS
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Team rows */}
        {visibleTeams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <CalendarDays size={36} className="text-muted/30 mb-3" />
            <p className="text-sm text-muted">Nenhuma OS agendada nesta semana</p>
            <p className="text-[11px] text-muted/60 mt-1">
              Tente navegar para outra semana ou desativar o filtro
            </p>
          </div>
        ) : (
          visibleTeams.map((team, i) => (
            <TeamRow
              key={team.code}
              team={team}
              teamGrid={fullGrid[team.code] || {}}
              weekDayKeys={weekDayKeys}
              todayKey={todayKey}
              isEven={i % 2 === 0}
            />
          ))
        )}
      </div>
    </div>
  )
}
