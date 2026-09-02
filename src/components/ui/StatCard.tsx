import type { ComponentType, KeyboardEvent, ReactNode } from 'react'
import { Minus, TrendUp, TrendDown, Calendar } from '@phosphor-icons/react'
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const w = 64, h = 20, pad = 2
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const x = (i: number) => pad + (i * (w - pad * 2)) / (data.length - 1)
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2)
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="mt-2" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export type StatTone  = 'neutral' | 'critical' | 'warning' | 'ok' | 'info'
export type StatScope = 'aovivo' | 'periodo'
export type StatSize  = 'md' | 'sm' | 'inline'

export interface StatTrend { delta: number; pct?: number; higherIsBetter?: boolean }

// Cor só para status: tons semânticos apontam para os tokens de index.css.
const TONE_COLOR: Record<Exclude<StatTone, 'neutral'>, string> = {
  critical: 'rgb(var(--red))',
  warning:  'rgb(var(--orange))',
  ok:       'rgb(var(--green))',
  info:     'rgb(var(--blue))',
}

type KpiCategory = 'orange' | 'blue' | 'green' | 'yellow'

const KPI_ORDER: KpiCategory[] = ['orange', 'blue', 'green', 'yellow']

// Claro: preenchimento sólido, com a tinta que passa no WCAG (branco reprova em
// verde e amarelo). Escuro: tint + borda + glow, tinta sempre --text.
const KPI_FILL: Record<KpiCategory, string> = {
  orange: 'bg-orange text-kpi-ink-orange dark:bg-orange/25 dark:text-text dark:border dark:border-orange dark:shadow-[0_0_20px_rgb(var(--orange)/.08)]',
  blue:   'bg-blue   text-kpi-ink-blue   dark:bg-blue/25   dark:text-text dark:border dark:border-blue   dark:shadow-[0_0_20px_rgb(var(--blue)/.08)]',
  green:  'bg-green  text-kpi-ink-green  dark:bg-green/25  dark:text-text dark:border dark:border-green  dark:shadow-[0_0_20px_rgb(var(--green)/.08)]',
  yellow: 'bg-yellow text-kpi-ink-yellow dark:bg-yellow/25 dark:text-text dark:border dark:border-yellow dark:shadow-[0_0_20px_rgb(var(--yellow)/.06)]',
}

const KPI_NEUTRAL = 'bg-surface-2 text-text border border-border'

const TONE_BADGE: Record<Exclude<StatTone, 'neutral'>, { label: string; cls: string }> = {
  critical: { label: 'Crítico', cls: 'bg-red/15    text-red    border-red/30'    },
  warning:  { label: 'Atenção', cls: 'bg-yellow/15 text-yellow border-yellow/30' },
  ok:       { label: 'OK',      cls: 'bg-green/15  text-green  border-green/30'  },
  info:     { label: 'Info',    cls: 'bg-blue/15   text-blue   border-blue/30'   },
}

function ToneBadge({ tone }: { tone: StatTone }) {
  if (tone === 'neutral') return null
  const { label, cls } = TONE_BADGE[tone]
  return (
    <span className={`rounded-pill border px-1.5 py-0.5 text-caption font-semibold ${cls}`}>
      {label}
    </span>
  )
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
  const color    = positive ? 'rgb(var(--green))' : 'rgb(var(--red))'
  const Icon     = delta === 0 ? Minus : delta > 0 ? TrendUp : TrendDown
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
  title:      ReactNode
  value:      ReactNode
  sub?:       string
  icon?:      ComponentType<{ size?: number; className?: string }>
  tone?:      StatTone
  trend?:     StatTrend | null
  scope?:     StatScope
  size?:      StatSize
  outlined?:  boolean
  onClick?:   () => void
  delay?:     number
  className?: string
  sparkline?: number[]
  /** Posição no grid de KPIs. Define a cor do card (laranja→azul→verde→amarelo,
   *  ciclando). Sem index, o card fica neutro. */
  index?:     number
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

export function StatCard({
  title, value, sub, icon: Icon, tone = 'neutral', trend, scope,
  size = 'md', outlined = false, onClick, delay = 0, className = '', sparkline, index,
}: StatCardProps) {
  const statusColor = tone !== 'neutral' ? TONE_COLOR[tone] : undefined
  // ok mantém o valor neutro (padrão aprovado do dashboard): a borda já sinaliza.
  const valColor = (tone === 'critical' || tone === 'warning' || tone === 'info')
    ? statusColor! : 'rgb(var(--text))'

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
      <div className={`flex items-center gap-1.5 ${onClick ? `cursor-pointer ${FOCUS_RING}` : ''} ${className}`} {...interactive}>
        <span className="text-caption font-bold uppercase tracking-[0.04em] text-muted">{title}:</span>
        <span className="text-body font-semibold tabular-nums" style={{ color: valColor }}>{value ?? '—'}</span>
      </div>
    )
  }

  if (size === 'sm') {
    return (
      <div
        data-ui="stat-card"
        {...interactive}
        style={{
          animationDelay: `${delay}ms`,
          borderLeft: outlined && statusColor ? `2px solid ${statusColor}` : undefined,
        }}
        className={`metric-panel relative min-h-[104px] rounded-lg p-3 text-center animate-card-enter flex flex-col justify-center
                    ${outlined
                      ? 'border border-border bg-card shadow-[0_8px_24px_rgba(0,0,0,0.14)] transition-colors duration-200 hover:border-primary/30'
                      : 'bg-bg'}
                    ${onClick ? `cursor-pointer ${FOCUS_RING}` : ''} ${className}`}
      >
        <p className="text-[22px] font-bold tabular-nums leading-none" style={{ color: valColor }}>{value ?? '—'}</p>
        <p className="text-caption text-muted mt-1 uppercase tracking-wide">{title}</p>
        {sub && <p className="text-caption text-muted mt-0.5">{sub}</p>}
        {sparkline && sparkline.length > 1 && (
          <div className="flex justify-center">
            <Sparkline data={sparkline} color={valColor} />
          </div>
        )}
      </div>
    )
  }

  const fill = index == null ? KPI_NEUTRAL : KPI_FILL[KPI_ORDER[index % KPI_ORDER.length]]

  return (
    <div
      data-ui="stat-card"
      {...interactive}
      style={{ animationDelay: `${delay}ms` }}
      className={`relative min-h-[112px] rounded-xl p-4 animate-card-enter ${fill}
                  transition-colors duration-150
                  ${onClick ? `cursor-pointer ${FOCUS_RING}` : ''} ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <span className="flex items-center gap-1.5 text-label font-medium opacity-80 min-w-0">
          {Icon && <Icon size={12} className="flex-shrink-0" />}
          <span className="truncate">{title}</span>
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <ToneBadge tone={tone} />
          {trend
            ? <TrendPill trend={trend} />
            : scope && (
              <span className="flex items-center gap-1 text-caption uppercase tracking-wide opacity-80 flex-shrink-0">
                {scope === 'aovivo'
                  ? <><span className="w-1 h-1 rounded-full bg-green flex-shrink-0" /> Ao vivo</>
                  : <><Calendar size={8} className="flex-shrink-0" /> Período</>}
              </span>
            )}
        </div>
      </div>

      <p className="text-display font-bold tabular-nums leading-none">
        {value ?? '—'}
      </p>

      {sub && <p className="text-caption opacity-70 leading-snug mt-2">{sub}</p>}

      {sparkline && sparkline.length > 1 && <Sparkline data={sparkline} color="currentColor" />}
    </div>
  )
}
