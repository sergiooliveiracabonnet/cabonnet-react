import { type ComponentType } from 'react'
import { Package, Wrench, Broadcast, X, CheckCircle, Clock } from '@phosphor-icons/react'
import type { OSRow } from '../../../lib/types'
import { situacaoVariant } from '../../../lib/osFormat'
import { isConcluida } from '../../../lib/transform'
import { Badge } from '../../../components/ui/Badge'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type IconComp = ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>

export interface WeekDay {
  dt: Date; key: string; label: string; dow: string
  isToday: boolean; isWeekend: boolean; isPast: boolean
}
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

/** Um único dia (hoje + offset), no mesmo formato de getWeekDays — usado por
 *  visões que navegam dia a dia em vez de semana a semana (ex: linha do tempo). */
export function getDay(dayOffset = 0): WeekDay {
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(today); d.setDate(today.getDate() + dayOffset)
  return {
    dt: d, key: toKey(d),
    label: `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`,
    dow: DAY_NAMES[d.getDay()],
    isToday: toKey(d) === toKey(today),
    isWeekend: d.getDay() === 0 || d.getDay() === 6,
    isPast: d < today,
  }
}

export function tipoIcon(r: OSRow): { color: string; Icon: IconComp | null } {
  if (r._tipo === 'INSTALACAO') return { color: '#3b82f6', Icon: Package }
  if (r._tipo === 'MANUTENCAO') return { color: '#f97316', Icon: Wrench  }
  if (r._tipo === 'REDE')       return { color: '#c4b5fd', Icon: Broadcast   }
  return { color: '#64748b', Icon: null }
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

export function SectionLabel({ icon: Icon, color, children }: { icon: IconComp; color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ background: color }} />
      <Icon size={12} style={{ color }} className="flex-shrink-0" />
      <span className="text-caption font-bold uppercase tracking-label" style={{ color }}>{children}</span>
    </div>
  )
}

// ─── OsRowItem ────────────────────────────────────────────────────────────────

export function OsRowItem({ r }: { r: OSRow }) {
  const { color, Icon } = tipoIcon(r)
  const concl = isConcluida(r.descsituacao)
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-hairline
                     last:border-b-0 hover:bg-surface/20 transition-colors
                     ${concl ? 'opacity-80' : ''}`}>
      <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
           style={{ background: `${color}22` }}>
        {Icon && <Icon size={11} style={{ color }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-caption font-bold text-primary">{r.numos}</span>
          <span className="text-caption text-text truncate flex-1">{r.nomecliente || '—'}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-caption text-muted">{r.nomedacidade || '—'}</span>
          {r.tiposervico && (
            <><span className="text-muted/40">·</span><span className="text-caption text-muted truncate">{r.tiposervico}</span></>
          )}
        </div>
      </div>
      <Badge variant={situacaoVariant(r.descsituacao)} className="text-caption px-1.5 py-px flex-shrink-0">
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
      <div className="relative bg-elevated border border-subtle rounded-2xl shadow-2xl
                      w-full max-w-[560px] max-h-[80vh] flex flex-col overflow-hidden">

        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-subtle">
          <div>
            <p className="text-title font-bold text-text leading-tight">{team}</p>
            <p className="text-caption text-muted mt-0.5">
              {day.dow}, {day.label}
              {day.isToday && <span className="ml-2 text-primary font-semibold">· Hoje</span>}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-2 text-caption">
              {nPending   > 0 && <span className="flex items-center gap-1 text-yellow font-semibold"><Clock size={11}/>{nPending}</span>}
              {nConcluded > 0 && <span className="flex items-center gap-1 text-green  font-semibold"><CheckCircle size={11}/>{nConcluded}</span>}
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
                <span className="text-caption font-bold uppercase tracking-label text-yellow">
                  Pendentes / Em atendimento ({nPending})
                </span>
              </div>
              {pending.map(r => <OsRowItem key={r.numos} r={r} />)}
            </div>
          )}
          {concluded.length > 0 && (
            <div>
              <div className={`px-4 pb-1.5 flex items-center gap-2 ${pending.length > 0 ? 'pt-3 border-t border-subtle mt-1' : 'pt-3'}`}>
                <CheckCircle size={10} className="text-green" />
                <span className="text-caption font-bold uppercase tracking-label text-green">
                  Concluídas ({nConcluded})
                </span>
              </div>
              {concluded.map(r => <OsRowItem key={r.numos} r={r} />)}
            </div>
          )}
          {total === 0 && (
            <p className="text-center text-label text-muted py-10">Nenhuma OS para este dia</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-subtle flex items-center justify-between">
          <span className="text-caption text-muted">{total} OS agendadas neste dia</span>
          <button onClick={onClose} className="text-caption font-semibold text-primary hover:text-primary/80 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
