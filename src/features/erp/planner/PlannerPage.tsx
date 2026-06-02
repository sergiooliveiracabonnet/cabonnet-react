import { useMemo, useState, type ComponentType } from 'react'
import { CalendarDays, MapPin, ChevronLeft, ChevronRight, Package, Wrench, Radio, X, CheckCircle2, Clock, Target } from 'lucide-react'
import { useERPRows } from '../useERPRows'
import { useERPStore } from '../../../store/erpStore'
import { useIsGestor } from '../../../hooks/useRole'
import { shortEquipe, situacaoVariant } from '../../../lib/osFormat'
import { isCOPE, isReagend, isConcluida } from '../../../lib/transform'
import { Badge } from '../../../components/ui/Badge'
import type { OSRow } from '../../../lib/types'

type IconComp = ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>

interface WeekDay {
  dt: Date; key: string; label: string; dow: string
  isToday: boolean; isWeekend: boolean; isPast: boolean
}
interface TeamSchedule { team: string; schedule: Record<string, OSRow[]>; weekTotal: number }
interface DrillState   { team: string; day: WeekDay; rows: OSRow[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTH_PT  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function parseAgendDate(r: OSRow): Date | null {
  const raw = (r.dataagendamento || '').split(' ')[0]
  if (!raw || !raw.includes('/')) return null
  const [d, m, y] = raw.split('/')
  if (!d || !m || !y) return null
  return new Date(+y, +m - 1, +d)
}

function toKey(dt: Date | null): string {
  if (!dt) return ''
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${dt.getFullYear()}`
}

function getWeekDays(weekOffset = 0) {
  const today = new Date(); today.setHours(0,0,0,0)
  const dow   = today.getDay()
  const mon   = new Date(today)
  mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + weekOffset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i)
    return {
      dt: d, key: toKey(d),
      label: `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`,
      dow: DAY_NAMES[d.getDay()],
      isToday: toKey(d) === toKey(today),
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      isPast: d < today,
    }
  })
}

function buildPlanner(allRows: OSRow[], days: WeekDay[]): TeamSchedule[] {
  const keySet = new Set(days.map(d => d.key))
  const base   = allRows.filter(r => !isCOPE(r) && !isReagend(r))

  const teamMap = new Map<string, Record<string, OSRow[]>>()
  for (const r of base) {
    const dt = parseAgendDate(r)
    if (!dt) continue
    const key = toKey(dt)
    if (!keySet.has(key)) continue
    const team = shortEquipe(r.nomedaequipe) || 'Sem equipe'
    if (!teamMap.has(team)) teamMap.set(team, {})
    const td = teamMap.get(team)!
    if (!td[key]) td[key] = []
    td[key].push(r)
  }

  for (const r of base) {
    const team = shortEquipe(r.nomedaequipe) || 'Sem equipe'
    if (!teamMap.has(team)) teamMap.set(team, {})
  }

  return [...teamMap.entries()]
    .map(([team, schedule]: [string, Record<string, OSRow[]>]) => {
      const weekTotal = days.reduce((s: number, d: WeekDay) => s + (schedule[d.key]?.length || 0), 0)
      return { team, schedule, weekTotal }
    })
    .filter(t => t.weekTotal > 0)
    .sort((a, b) => b.weekTotal - a.weekTotal)
}

function tipoIcon(r: OSRow): { color: string; Icon: IconComp | null } {
  if (r._tipo === 'INSTALACAO') return { color: '#3b82f6', Icon: Package }
  if (r._tipo === 'MANUTENCAO') return { color: '#f97316', Icon: Wrench  }
  if (r._tipo === 'REDE')       return { color: '#c4b5fd', Icon: Radio   }
  return { color: '#64748b', Icon: null }
}

function loadColor(count: number): string | null {
  if (count === 0) return null
  if (count <= 2)  return '#4ade80'
  if (count <= 4)  return '#facc15'
  if (count <= 7)  return '#f97316'
  return '#f87171'
}

function SectionLabel({ icon: Icon, color, children }: { icon: IconComp; color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ background: color }} />
      <Icon size={12} style={{ color }} className="flex-shrink-0" />
      <span className="text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color }}>{children}</span>
    </div>
  )
}

// ─── Drill Modal ──────────────────────────────────────────────────────────────

function PlannerDrillModal({ drill, onClose }: { drill: DrillState | null; onClose: () => void }) {
  if (!drill) return null
  const { team, day, rows } = drill

  // Pendentes/em atendimento no topo — concluídas embaixo
  const pending   = (rows as OSRow[]).filter(r => !isConcluida(r.descsituacao))
  const concluded = (rows as OSRow[]).filter(r =>  isConcluida(r.descsituacao))

  const total      = rows.length
  const nPending   = pending.length
  const nConcluded = concluded.length

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-elevated border border-white/[0.08] rounded-2xl shadow-2xl
                      w-full max-w-[560px] max-h-[80vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/[0.08]">
          <div>
            <p className="text-[14px] font-bold text-text leading-tight">{team}</p>
            <p className="text-[11px] text-muted mt-0.5">
              {day.dow}, {day.label}
              {day.isToday && <span className="ml-2 text-primary font-semibold">· Hoje</span>}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-2 text-[11px]">
              {nPending > 0 && (
                <span className="flex items-center gap-1 text-yellow font-semibold">
                  <Clock size={11} /> {nPending}
                </span>
              )}
              {nConcluded > 0 && (
                <span className="flex items-center gap-1 text-green font-semibold">
                  <CheckCircle2 size={11} /> {nConcluded}
                </span>
              )}
            </div>
            <button onClick={onClose}
                    className="w-7 h-7 rounded-lg flex items-center justify-center
                               text-muted hover:text-text hover:bg-surface transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">

          {/* Pendentes */}
          {pending.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                <Clock size={10} className="text-yellow" />
                <span className="text-[9px] font-bold uppercase tracking-[0.06em] text-yellow">
                  Pendentes / Em atendimento ({nPending})
                </span>
              </div>
              {pending.map(r => <OsRowItem key={r.numos} r={r} />)}
            </div>
          )}

          {/* Concluídas */}
          {concluded.length > 0 && (
            <div>
              <div className={`px-4 pb-1.5 flex items-center gap-2 ${pending.length > 0 ? 'pt-3 border-t border-white/[0.08] mt-1' : 'pt-3'}`}>
                <CheckCircle2 size={10} className="text-green" />
                <span className="text-[9px] font-bold uppercase tracking-[0.06em] text-green">
                  Concluídas ({nConcluded})
                </span>
              </div>
              {concluded.map(r => <OsRowItem key={r.numos} r={r} />)}
            </div>
          )}

          {total === 0 && (
            <p className="text-center text-[12px] text-muted py-10">Nenhuma OS para este dia</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.08] flex items-center justify-between">
          <span className="text-[11px] text-muted">{total} OS agendadas neste dia</span>
          <button onClick={onClose}
                  className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

function OsRowItem({ r }: { r: OSRow }) {
  const { color, Icon } = tipoIcon(r)
  const concl = isConcluida(r.descsituacao)
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.04]
                     last:border-b-0 hover:bg-surface/20 transition-colors
                     ${concl ? 'opacity-80' : ''}`}>
      {/* Tipo icon */}
      <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
           style={{ background: `${color}22` }}>
        {Icon && <Icon size={11} style={{ color }} />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold text-primary">{r.numos}</span>
          <span className="text-[11px] text-text truncate flex-1">{r.nomecliente || '—'}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted">{r.nomedacidade || '—'}</span>
          {r.tiposervico && (
            <>
              <span className="text-muted/40">·</span>
              <span className="text-[10px] text-muted truncate">{r.tiposervico}</span>
            </>
          )}
        </div>
      </div>

      {/* Status */}
      <Badge variant={situacaoVariant(r.descsituacao)} className="text-[9px] px-1.5 py-px flex-shrink-0">
        {r.descsituacao ?? '—'}
      </Badge>
    </div>
  )
}

// ─── Cell ─────────────────────────────────────────────────────────────────────

function PlannerCell({ rows = [] as OSRow[], isPast, _isToday: _isToday = false, isWeekend, onClick }: {
  rows?: OSRow[]; isPast: boolean; _isToday?: boolean; isWeekend: boolean; onClick: () => void
}) {
  const count = rows.length
  const color = loadColor(count)
  const [hover, setHover] = useState(false)

  const tipos = useMemo(() => {
    const inst  = rows.filter((r: OSRow) => r._tipo === 'INSTALACAO').length
    const manut = rows.filter((r: OSRow) => r._tipo === 'MANUTENCAO').length
    const other = count - inst - manut
    return { inst, manut, other }
  }, [count, rows])

  const nConcl   = rows.filter((r: OSRow) => isConcluida(r.descsituacao)).length
  const nPending = count - nConcl

  if (count === 0) {
    return (
      <td className={`px-2 py-2 text-center border-r border-white/[0.08] last:border-r-0 w-[100px]
                      ${isPast ? 'opacity-40' : ''} ${isWeekend ? 'bg-surface/20' : ''}`}>
        <span className="text-[10px] text-muted/60">—</span>
      </td>
    )
  }

  return (
    <td
      className={`relative px-2 py-2 border-r border-white/[0.08] last:border-r-0 w-[100px]
                  ${isPast ? 'opacity-60' : ''} ${isWeekend ? 'bg-surface/20' : ''}
                  cursor-pointer group`}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Count bubble */}
      <div className="flex flex-col items-center gap-1">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-mono font-black text-[17px] tabular-nums
                        group-hover:scale-110 transition-transform duration-150"
             style={{ background: `${color}2e`, border: `1px solid ${color}66`, color: color ?? undefined }}>
          {count}
        </div>

        {/* Tipo mini dots */}
        <div className="flex items-center gap-0.5">
          {tipos.inst  > 0 && <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" title={`${tipos.inst} inst`} />}
          {tipos.manut > 0 && <div className="w-1.5 h-1.5 rounded-full bg-[#f97316]" title={`${tipos.manut} manut`} />}
          {tipos.other > 0 && <div className="w-1.5 h-1.5 rounded-full bg-[#64748b]" title={`${tipos.other} serviços`} />}
        </div>

        {/* Mini status bar (pendentes vs concluídas) */}
        {count > 0 && (
          <div className="w-8 h-1 rounded-full overflow-hidden bg-surface flex">
            {nConcl > 0 && (
              <div className="h-full bg-green/60 transition-all duration-500"
                   style={{ width: `${(nConcl / count) * 100}%` }} />
            )}
          </div>
        )}
      </div>

      {/* Hover tooltip preview */}
      {hover && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2
                        bg-elevated border border-white/[0.08] rounded-xl shadow-xl
                        min-w-[200px] max-w-[260px] p-3 pointer-events-none">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-text">{count} OS</span>
            <div className="flex gap-2 text-[9px]">
              {nPending  > 0 && <span className="text-yellow flex items-center gap-0.5"><Clock size={9}/>{nPending}</span>}
              {nConcl    > 0 && <span className="text-green  flex items-center gap-0.5"><CheckCircle2 size={9}/>{nConcl}</span>}
            </div>
          </div>
          <div className="space-y-1">
            {rows.slice(0, 5).map(r => {
              const { color: tc } = tipoIcon(r)
              const concl = isConcluida(r.descsituacao)
              return (
                <div key={r.numos} className={`flex items-center gap-2 text-[10px] ${concl ? 'opacity-60' : ''}`}>
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tc }} />
                  <span className="text-text truncate flex-1">{r.nomecliente || r.numos}</span>
                  <span className="text-muted flex-shrink-0">{concl ? '✓' : r.nomedacidade || '—'}</span>
                </div>
              )
            })}
            {rows.length > 5 && (
              <p className="text-[9px] text-muted/60 pt-0.5">+{rows.length - 5} OS · clique para ver todas</p>
            )}
            {rows.length <= 5 && (
              <p className="text-[9px] text-primary/60 pt-1 text-center">Clique para ver detalhes</p>
            )}
          </div>
        </div>
      )}
    </td>
  )
}

// ─── PlannerPage ──────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const { allRows, isLoading }                              = useERPRows()
  const { metaEquipeDiaria, setMetaEquipeDiaria }           = useERPStore()
  const isGestor                                            = useIsGestor()
  const [weekOffset, setWeekOffset] = useState(0)
  const [drill, setDrill]           = useState<DrillState | null>(null)
  const [editMeta, setEditMeta]     = useState(false)

  const days  = useMemo(() => getWeekDays(weekOffset), [weekOffset])
  const teams = useMemo(() => buildPlanner(allRows, days), [allRows, days])

  const totalSemana  = teams.reduce((s, t) => s + t.weekTotal, 0)
  const cidades      = useMemo(() => {
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

      {/* Header + navegação de semana */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-headline font-bold text-text mb-0.5">Planner Semanal</h1>
          <p className="text-[12px] text-muted">Clique em qualquer célula para ver as OS daquele dia</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => isGestor && setEditMeta(v => !v)}
            disabled={!isGestor}
            title={!isGestor ? 'Apenas gestores podem definir metas' : undefined}
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl border transition-all disabled:opacity-40 disabled:cursor-not-allowed
                        ${editMeta ? 'bg-primary/15 border-primary/40 text-primary' : 'border-white/[0.08] text-secondary hover:text-text'}`}
          >
            <Target size={12} /> {editMeta ? 'Concluir' : 'Definir Metas'}
          </button>
          <button onClick={() => setWeekOffset(p => p - 1)}
                  className="w-8 h-8 rounded-lg border border-white/[0.08] flex items-center justify-center
                             text-muted hover:text-text hover:border-muted/40 transition-all">
            <ChevronLeft size={14} />
          </button>
          <span className="text-[12px] font-semibold text-text px-1 min-w-[160px] text-center">
            {weekOffset === 0 ? `Semana atual · ${weekLabel}` : weekOffset > 0 ? `+${weekOffset}sem · ${weekLabel}` : `${weekOffset}sem · ${weekLabel}`}
          </span>
          <button onClick={() => setWeekOffset(p => p + 1)}
                  className="w-8 h-8 rounded-lg border border-white/[0.08] flex items-center justify-center
                             text-muted hover:text-text hover:border-muted/40 transition-all">
            <ChevronRight size={14} />
          </button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)}
                    className="text-[10px] text-primary hover:text-primary/80 border border-primary/30
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
          { label: 'Equipes ativas',   value: teams.length,   color: '#4ade80' },
          { label: 'Equipes sem OS',   value: equipesSemOS,   color: equipesSemOS > 0 ? '#facc15' : '#4ade80' },
          { label: 'Cidades cobertas', value: cidades.length, color: '#c4b5fd' },
        ].map((k, i) => (
          <div key={i}
               className="relative overflow-hidden rounded-xl border bg-card animate-card-enter"
               style={{ borderColor: `${k.color}22`, animationDelay: `${i * 50}ms` }}>
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: k.color }} />
            <div className="p-4">
              <p className="text-[11px] text-muted mb-1.5">{k.label}</p>
              <p className="font-mono font-black tabular-nums text-[28px] leading-none"
                 style={{ color: k.color }}>{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Carga diária */}
      <div className="rounded-xl border border-white/[0.08] bg-card p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-3">
          Carga total por dia
        </p>
        <div className="flex gap-2">
          {loadDays.map(d => {
            const pct   = maxDayLoad > 0 ? (d.total / maxDayLoad) * 100 : 0
            const color = d.isToday ? '#3b82f6' : d.isWeekend ? '#374151' : '#3b82f6'
            return (
              <div key={d.key} className="flex-1 flex flex-col items-center">
                {/* Número — zona fixa 16px */}
                <span className="h-4 flex items-end pb-0.5 text-[9px] font-mono text-muted tabular-nums">
                  {d.total > 0 ? d.total : ''}
                </span>
                {/* Barra — zona fixa 40px, cresce de baixo */}
                <div className="h-10 w-full flex items-end">
                  <div className="w-full rounded-sm transition-all duration-700"
                       style={{
                         height: `${Math.max(d.total > 0 ? 8 : 2, pct * 0.4)}px`,
                         background: d.total > 0 ? color : 'rgba(255,255,255,0.04)',
                       }} />
                </div>
                {/* Labels — zona fixa */}
                <span className={`text-[9px] font-bold mt-1 ${d.isToday ? 'text-primary' : 'text-muted'}`}>
                  {d.dow}
                </span>
                <span className="text-[8px] text-muted/70">{d.label}</span>
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
          <div className="flex items-center gap-3 text-[10px] text-muted">
            {[['#4ade80','1-2'],['#facc15','3-4'],['#f97316','5-7'],['#f87171','8+']].map(([c,l]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ background: c }} />{l}
              </span>
            ))}
          </div>
        </div>

        {teams.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-card px-4 py-12 text-center">
            <p className="text-[13px] font-semibold text-text mb-1">Nenhuma OS agendada para esta semana</p>
            <p className="text-[11px] text-muted">Navegue para outra semana ou verifique os agendamentos</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-surface/30">
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.05em]
                                   text-muted w-[160px] flex-shrink-0">
                      Equipe
                    </th>
                    {days.map(d => (
                      <th key={d.key}
                          className={`px-2 py-3 text-center text-[10px] font-bold
                                      border-r border-white/[0.04] last:border-r-0 w-[100px]
                                      ${d.isToday ? 'text-primary' : d.isWeekend ? 'text-muted/70' : 'text-muted'}
                                      ${d.isWeekend ? 'bg-surface/10' : ''}`}>
                        <div>{d.dow}</div>
                        <div className={`text-[9px] font-normal mt-0.5 ${d.isToday ? 'text-primary/70' : ''}`}>
                          {d.label}
                        </div>
                        {d.isToday && (
                          <div className="w-1 h-1 rounded-full bg-primary mx-auto mt-0.5" />
                        )}
                      </th>
                    ))}
                    {editMeta && (
                      <th className="px-3 py-3 text-center text-[10px] font-bold uppercase
                                     tracking-[0.05em] text-muted w-[70px]">
                        Meta/sem
                      </th>
                    )}
                    <th className="px-3 py-3 text-right text-[10px] font-bold uppercase
                                   tracking-[0.05em] text-muted w-[80px]">
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
                                       text-[11px] font-mono text-text text-center outline-none
                                       focus:border-primary/50 transition-colors"
                          />
                        </td>
                      )}
                      <td className="px-3 py-3 text-right w-[80px]">
                        {(() => {
                          const meta = metaEquipeDiaria[t.team] ?? 0
                          const pct  = meta > 0 ? Math.round((t.weekTotal / meta) * 100) : null
                          const color = pct == null ? 'text-text'
                                      : pct >= 100 ? 'text-green' : pct >= 70 ? 'text-yellow' : 'text-red'
                          return (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className={`font-mono font-bold text-[14px] ${color}`}>{t.weekTotal}</span>
                              {meta > 0 && pct !== null && (
                                <div className="w-10 h-1 rounded-full overflow-hidden bg-surface">
                                  <div className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? '#4ade80' : pct >= 70 ? '#facc15' : '#f87171' }} />
                                </div>
                              )}
                              {meta > 0 && pct !== null && (
                                <span className={`text-[9px] font-mono ${color}`}>{pct}%</span>
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
              <div key={cidade}
                   className="flex items-center gap-2 bg-card border border-white/[0.08]
                              rounded-xl px-3 py-2">
                <MapPin size={10} className="text-muted" />
                <span className="text-[11.5px] font-semibold text-text">{cidade}</span>
                <span className="font-mono text-[11px] text-primary font-bold">{cnt}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Legenda */}
      <div className="flex items-center gap-4 text-[10px] text-muted flex-wrap">
        {[['#3b82f6','Instalação'], ['#f97316','Manutenção'], ['#64748b','Serviço']].map(([c,l]) => (
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

      {/* Modal de detalhe */}
      <PlannerDrillModal drill={drill} onClose={() => setDrill(null)} />
    </div>
  )
}
