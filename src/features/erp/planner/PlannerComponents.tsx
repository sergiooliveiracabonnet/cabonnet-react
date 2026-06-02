import { useState, useMemo, type ComponentType } from 'react'
import { Package, Wrench, Radio, X, CheckCircle2, Clock } from 'lucide-react'
import type { OSRow } from '../../../lib/types'
import { shortEquipe, situacaoVariant } from '../../../lib/osFormat'
import { isCOPE, isReagend, isConcluida } from '../../../lib/transform'
import { Badge } from '../../../components/ui/Badge'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type IconComp = ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>

export interface WeekDay {
  dt: Date; key: string; label: string; dow: string
  isToday: boolean; isWeekend: boolean; isPast: boolean
}
export interface TeamSchedule { team: string; schedule: Record<string, OSRow[]>; weekTotal: number }
export interface DrillState   { team: string; day: WeekDay; rows: OSRow[] }

// ─── Constantes ───────────────────────────────────────────────────────────────

export const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const MONTH_PT  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function parseAgendDate(r: OSRow): Date | null {
  const raw = (r.dataagendamento || '').split(' ')[0]
  if (!raw || !raw.includes('/')) return null
  const [d, m, y] = raw.split('/')
  if (!d || !m || !y) return null
  return new Date(+y, +m - 1, +d)
}

export function toKey(dt: Date | null): string {
  if (!dt) return ''
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${dt.getFullYear()}`
}

export function getWeekDays(weekOffset = 0): WeekDay[] {
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

export function buildPlanner(allRows: OSRow[], days: WeekDay[]): TeamSchedule[] {
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
    .map(([team, schedule]) => ({
      team, schedule,
      weekTotal: days.reduce((s, d) => s + (schedule[d.key]?.length || 0), 0),
    }))
    .filter(t => t.weekTotal > 0)
    .sort((a, b) => b.weekTotal - a.weekTotal)
}

export function tipoIcon(r: OSRow): { color: string; Icon: IconComp | null } {
  if (r._tipo === 'INSTALACAO') return { color: '#3b82f6', Icon: Package }
  if (r._tipo === 'MANUTENCAO') return { color: '#f97316', Icon: Wrench  }
  if (r._tipo === 'REDE')       return { color: '#c4b5fd', Icon: Radio   }
  return { color: '#64748b', Icon: null }
}

export function loadColor(count: number): string | null {
  if (count === 0) return null
  if (count <= 2)  return '#4ade80'
  if (count <= 4)  return '#facc15'
  if (count <= 7)  return '#f97316'
  return '#f87171'
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

export function SectionLabel({ icon: Icon, color, children }: { icon: IconComp; color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ background: color }} />
      <Icon size={12} style={{ color }} className="flex-shrink-0" />
      <span className="text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color }}>{children}</span>
    </div>
  )
}

// ─── OsRowItem ────────────────────────────────────────────────────────────────

export function OsRowItem({ r }: { r: OSRow }) {
  const { color, Icon } = tipoIcon(r)
  const concl = isConcluida(r.descsituacao)
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.04]
                     last:border-b-0 hover:bg-surface/20 transition-colors
                     ${concl ? 'opacity-80' : ''}`}>
      <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
           style={{ background: `${color}22` }}>
        {Icon && <Icon size={11} style={{ color }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold text-primary">{r.numos}</span>
          <span className="text-[11px] text-text truncate flex-1">{r.nomecliente || '—'}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted">{r.nomedacidade || '—'}</span>
          {r.tiposervico && (
            <><span className="text-muted/40">·</span><span className="text-[10px] text-muted truncate">{r.tiposervico}</span></>
          )}
        </div>
      </div>
      <Badge variant={situacaoVariant(r.descsituacao)} className="text-[9px] px-1.5 py-px flex-shrink-0">
        {r.descsituacao ?? '—'}
      </Badge>
    </div>
  )
}

// ─── PlannerDrillModal ────────────────────────────────────────────────────────

export function PlannerDrillModal({ drill, onClose }: { drill: DrillState | null; onClose: () => void }) {
  if (!drill) return null
  const { team, day, rows } = drill
  const pending   = rows.filter(r => !isConcluida(r.descsituacao))
  const concluded = rows.filter(r =>  isConcluida(r.descsituacao))
  const total = rows.length
  const nPending = pending.length; const nConcluded = concluded.length

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-elevated border border-white/[0.08] rounded-2xl shadow-2xl
                      w-full max-w-[560px] max-h-[80vh] flex flex-col overflow-hidden">

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
              {nPending   > 0 && <span className="flex items-center gap-1 text-yellow font-semibold"><Clock size={11}/>{nPending}</span>}
              {nConcluded > 0 && <span className="flex items-center gap-1 text-green  font-semibold"><CheckCircle2 size={11}/>{nConcluded}</span>}
            </div>
            <button onClick={onClose}
                    className="w-7 h-7 rounded-lg flex items-center justify-center
                               text-muted hover:text-text hover:bg-surface transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
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

        <div className="px-5 py-3 border-t border-white/[0.08] flex items-center justify-between">
          <span className="text-[11px] text-muted">{total} OS agendadas neste dia</span>
          <button onClick={onClose} className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── PlannerCell ──────────────────────────────────────────────────────────────

export function PlannerCell({ rows = [] as OSRow[], isPast, _isToday: _isToday = false, isWeekend, onClick }: {
  rows?: OSRow[]; isPast: boolean; _isToday?: boolean; isWeekend: boolean; onClick: () => void
}) {
  const count = rows.length
  const color = loadColor(count)
  const [hover, setHover] = useState(false)

  const tipos = useMemo(() => {
    const inst  = rows.filter(r => r._tipo === 'INSTALACAO').length
    const manut = rows.filter(r => r._tipo === 'MANUTENCAO').length
    const other = count - inst - manut
    return { inst, manut, other }
  }, [count, rows])

  const nConcl   = rows.filter(r => isConcluida(r.descsituacao)).length
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
    <td className={`relative px-2 py-2 border-r border-white/[0.08] last:border-r-0 w-[100px]
                    ${isPast ? 'opacity-60' : ''} ${isWeekend ? 'bg-surface/20' : ''} cursor-pointer group`}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}>
      <div className="flex flex-col items-center gap-1">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-mono font-black text-[17px] tabular-nums
                        group-hover:scale-110 transition-transform duration-150"
             style={{ background: `${color}2e`, border: `1px solid ${color}66`, color: color ?? undefined }}>
          {count}
        </div>
        <div className="flex items-center gap-0.5">
          {tipos.inst  > 0 && <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" title={`${tipos.inst} inst`} />}
          {tipos.manut > 0 && <div className="w-1.5 h-1.5 rounded-full bg-[#f97316]" title={`${tipos.manut} manut`} />}
          {tipos.other > 0 && <div className="w-1.5 h-1.5 rounded-full bg-[#64748b]" title={`${tipos.other} serviços`} />}
        </div>
        {count > 0 && (
          <div className="w-8 h-1 rounded-full overflow-hidden bg-surface flex">
            {nConcl > 0 && (
              <div className="h-full bg-green/60 transition-all duration-500"
                   style={{ width: `${(nConcl / count) * 100}%` }} />
            )}
          </div>
        )}
      </div>

      {hover && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2
                        bg-elevated border border-white/[0.08] rounded-xl shadow-xl
                        min-w-[200px] max-w-[260px] p-3 pointer-events-none">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-text">{count} OS</span>
            <div className="flex gap-2 text-[9px]">
              {nPending > 0 && <span className="text-yellow flex items-center gap-0.5"><Clock size={9}/>{nPending}</span>}
              {nConcl   > 0 && <span className="text-green  flex items-center gap-0.5"><CheckCircle2 size={9}/>{nConcl}</span>}
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
            {rows.length > 5  && <p className="text-[9px] text-muted/60 pt-0.5">+{rows.length - 5} OS · clique para ver todas</p>}
            {rows.length <= 5 && <p className="text-[9px] text-primary/60 pt-1 text-center">Clique para ver detalhes</p>}
          </div>
        </div>
      )}
    </td>
  )
}
