import type { ComponentType, KeyboardEvent, ReactNode } from 'react'
import { Minus, TrendingUp, TrendingDown, Calendar } from 'lucide-react'

export type StatTone  = 'neutral' | 'critical' | 'warning' | 'ok' | 'info'
export type StatScope = 'aovivo' | 'periodo'
export type StatSize  = 'md' | 'sm' | 'inline'

export interface StatTrend { delta: number; pct?: number; higherIsBetter?: boolean }

// Cor só para status: tons semânticos apontam para os tokens de index.css.
const TONE_COLOR: Record<Exclude<StatTone, 'neutral'>, string> = {
  critical: 'rgb(var(--c-red))',
  warning:  'rgb(var(--c-orange))',
  ok:       'rgb(var(--c-green))',
  info:     'rgb(var(--c-primary))',
}

/** Converte o AccentColor legado para tone. Accents decorativos viram neutral. */
// eslint-disable-next-line react-refresh/only-export-components -- helper de mapeamento faz parte do contrato público do StatCard (usado pelas Tasks 4-6)
export function accentToTone(accent?: string): StatTone {
  switch (accent) {
    case 'red':    return 'critical'
    case 'orange':
    case 'yellow': return 'warning'
    case 'green':  return 'ok'
    default:       return 'neutral'
  }
}

export function TrendPill({ trend }: { trend?: StatTrend | null }) {
  const { delta, pct, higherIsBetter } = trend ?? {}
  if (delta == null) return null
  const positive = (delta > 0) === (higherIsBetter !== false)
  const color    = positive ? 'rgb(var(--c-green))' : 'rgb(var(--c-red))'
  const Icon     = delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-caption font-bold flex-shrink-0"
         style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`,
                  borderColor: `color-mix(in srgb, ${color} 20%, transparent)`, color }}>
      <Icon size={9} />
      {pct != null ? `${pct}%` : (delta > 0 ? `+${delta}` : delta)}
    </div>
  )
}

export interface StatCardProps {
  title:      string
  value:      ReactNode
  sub?:       string
  icon?:      ComponentType<{ size?: number; className?: string }>
  tone?:      StatTone
  trend?:     StatTrend | null
  scope?:     StatScope
  size?:      StatSize
  onClick?:   () => void
  delay?:     number
  className?: string
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

export function StatCard({
  title, value, sub, icon: Icon, tone = 'neutral', trend, scope,
  size = 'md', onClick, delay = 0, className = '',
}: StatCardProps) {
  const statusColor = tone !== 'neutral' ? TONE_COLOR[tone] : undefined
  // ok mantém o valor neutro (padrão aprovado do dashboard): a borda já sinaliza.
  const valColor = (tone === 'critical' || tone === 'warning' || tone === 'info')
    ? statusColor! : 'rgb(var(--c-text))'

  const interactive = onClick
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
        },
      }
    : {}

  if (size === 'inline') {
    return (
      <div className={`flex items-center gap-1.5 ${className}`} {...interactive}>
        <span className="text-caption font-bold uppercase tracking-[0.04em] text-muted">{title}:</span>
        <span className="text-body font-semibold tabular-nums" style={{ color: valColor }}>{value}</span>
      </div>
    )
  }

  if (size === 'sm') {
    return (
      <div
        {...interactive}
        style={{ animationDelay: `${delay}ms` }}
        className={`bg-bg rounded-lg p-3 text-center animate-card-enter
                    ${onClick ? `cursor-pointer ${FOCUS_RING}` : ''} ${className}`}
      >
        <p className="text-[22px] font-bold tabular-nums leading-none" style={{ color: valColor }}>{value}</p>
        <p className="text-caption text-muted mt-1 uppercase tracking-wide">{title}</p>
        {sub && <p className="text-caption text-muted mt-0.5">{sub}</p>}
      </div>
    )
  }

  return (
    <div
      {...interactive}
      style={{ animationDelay: `${delay}ms`,
               borderLeft: statusColor ? `2px solid ${statusColor}` : undefined }}
      className={`relative rounded-md border border-border bg-card p-4 animate-card-enter
                  transition-colors duration-150 hover:border-muted/40
                  ${onClick ? `cursor-pointer ${FOCUS_RING}` : ''} ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <span className="flex items-center gap-1.5 text-caption font-semibold text-secondary min-w-0">
          {Icon && <Icon size={12} className="text-muted flex-shrink-0" />}
          <span className="truncate">{title}</span>
        </span>
        {trend
          ? <TrendPill trend={trend} />
          : scope && (
            <span className="flex items-center gap-1 text-caption uppercase tracking-wide text-muted flex-shrink-0">
              {scope === 'aovivo'
                ? <><span className="w-1 h-1 rounded-full bg-green flex-shrink-0" /> Ao vivo</>
                : <><Calendar size={8} className="flex-shrink-0" /> Período</>}
            </span>
          )}
      </div>

      <p className="tabular-nums leading-none"
         style={{ fontSize: String(value).length > 4 ? '28px' : '34px',
                  fontWeight: 700, letterSpacing: '-0.03em', color: valColor }}>
        {value ?? '—'}
      </p>

      {sub && <p className="text-caption text-muted leading-snug mt-2">{sub}</p>}
    </div>
  )
}
