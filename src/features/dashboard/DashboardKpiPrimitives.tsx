import type { ReactNode } from 'react'
import { Minus, TrendingUp, TrendingDown, Calendar } from 'lucide-react'
import type { KPI } from '../../lib/types'
import type { IconComp } from './DashboardTypes'

export function SectionLabel({ icon: Icon, color, children }: {
  icon: IconComp; color: string; children: ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[3px] h-3.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <Icon size={12} className="flex-shrink-0 text-muted" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-secondary">
        {children}
      </span>
    </div>
  )
}

export function TrendPill({ trend }: { trend: KPI['trend'] }) {
  const { delta, pct, higherIsBetter } = trend ?? {}
  if (delta == null) return null
  const positive = (delta > 0) === (higherIsBetter !== false)
  const color    = positive ? '#4ade80' : '#f87171'
  const Icon     = delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold flex-shrink-0"
         style={{ background: `${color}12`, borderColor: `${color}30`, color }}>
      <Icon size={9} />
      {pct != null ? `${pct}%` : (delta > 0 ? `+${delta}` : delta)}
    </div>
  )
}

export function BentoKPICard({ kpi, icon: Icon, delay = 0, onClick, scope }: {
  kpi: KPI; icon: IconComp | undefined; delay?: number; onClick?: () => void
  scope?: 'aovivo' | 'periodo'
}) {
  const { title, value, sub, accent, trend } = kpi
  // Neutro por padrão; a cor só aparece quando o accent representa status real.
  const status = accent === 'red' ? 'crit' : accent === 'orange' ? 'warn' : accent === 'green' ? 'ok' : 'neutral'
  const statusColor = status === 'crit' ? 'rgb(var(--c-red))'
                    : status === 'warn' ? 'rgb(var(--c-orange))'
                    : status === 'ok'   ? 'rgb(var(--c-green))' : ''
  const valColor = status === 'crit' ? 'rgb(var(--c-red))'
                 : status === 'warn' ? 'rgb(var(--c-orange))' : 'rgb(var(--c-text))'

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={e => e.key === 'Enter' && onClick?.()}
      style={{ animationDelay: `${delay}ms`, borderLeft: statusColor ? `2px solid ${statusColor}` : undefined }}
      className={`relative rounded-md border border-border bg-card p-4 animate-card-enter
                  transition-colors duration-150 hover:border-muted/40
                  ${onClick ? 'cursor-pointer' : ''}`}
    >
      {/* Label + trend/scope */}
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-secondary min-w-0">
          {Icon && <Icon size={12} className="text-muted flex-shrink-0" />}
          <span className="truncate">{title}</span>
        </span>
        {trend
          ? <TrendPill trend={trend} />
          : scope && (
            <span className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted flex-shrink-0">
              {scope === 'aovivo'
                ? <><span className="w-1 h-1 rounded-full bg-green flex-shrink-0" /> Ao vivo</>
                : <><Calendar size={8} className="flex-shrink-0" /> Período</>}
            </span>
          )}
      </div>

      {/* Value */}
      <p className="tabular-nums leading-none"
         style={{
           fontSize: String(value).length > 4 ? '28px' : '34px',
           fontWeight: 700, letterSpacing: '-0.03em', color: valColor,
         }}>
        {value}
      </p>

      {/* Sub */}
      <p className="text-[11px] text-muted leading-snug mt-2">{sub}</p>
    </div>
  )
}
