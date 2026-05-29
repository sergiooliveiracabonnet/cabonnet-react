import type { ComponentType, MouseEventHandler, ReactNode } from 'react'

// Hex alinhado aos tokens --c-* do index.css para uso eventual em SVG/canvas
const ACCENT_COLOR = {
  primary:   { hex: '#3b82f6', text: 'text-primary',   icon: 'icon-container-primary',   glow: 'card-glow-primary'   },
  green:     { hex: '#4ade80', text: 'text-green',     icon: 'icon-container-green',     glow: 'card-glow-green'     },
  red:       { hex: '#f87171', text: 'text-red',       icon: 'icon-container-red',       glow: 'card-glow-red'       },
  yellow:    { hex: '#facc15', text: 'text-yellow',    icon: 'icon-container-yellow',    glow: 'card-glow-yellow'    },
  orange:    { hex: '#fb923c', text: 'text-orange',    icon: 'icon-container-orange',    glow: 'card-glow-orange'    },
  cyan:      { hex: '#22d3ee', text: 'text-cyan',      icon: 'icon-container-cyan',      glow: 'card-glow-cyan'      },
  purple:    { hex: '#c4b5fd', text: 'text-purple',    icon: 'icon-container-purple',    glow: 'card-glow-purple'    },
  teal:      { hex: '#2dd4bf', text: 'text-teal',      icon: 'icon-container-teal',      glow: 'card-glow-teal'      },
  secondary: { hex: '#71717a', text: 'text-secondary', icon: 'icon-container-secondary', glow: 'card-glow-secondary' },
} as const

type Accent = keyof typeof ACCENT_COLOR

interface Trend {
  delta:           number
  pct?:            number
  higherIsBetter?: boolean
}

interface KPICardProps {
  title?:    string
  value?:    ReactNode
  sub?:      string
  accent?:   Accent | string
  icon?:     ComponentType<{ size?: number; className?: string }>
  onClick?:  MouseEventHandler<HTMLDivElement>
  trend?:    Trend
  className?: string
}

export function KPICard({
  title, value, sub, accent = 'primary',
  icon: Icon, onClick, trend, className = '',
}: KPICardProps) {
  const c = ACCENT_COLOR[accent as Accent] ?? ACCENT_COLOR.primary

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-xl bg-card border border-border p-5
                  ${c.glow} transition-colors duration-150
                  ${onClick ? 'cursor-pointer hover:bg-card-high active:scale-[.99]' : ''}
                  ${className}`}
    >
      {/* Header — label + icon */}
      <div className="flex items-center justify-between mb-3">
        {title && (
          <span className="text-[11px] font-medium text-muted leading-none">
            {title}
          </span>
        )}
        {Icon && (
          <div className={`w-7 h-7 rounded-lg ${c.icon} flex items-center justify-center flex-shrink-0`}>
            <Icon size={13} className={c.text} />
          </div>
        )}
      </div>

      {/* Value */}
      <p className={`number-display text-[28px] leading-none tracking-tight ${c.text}`}>
        {value ?? '—'}
      </p>

      {/* Footer — sub + trend */}
      {(sub || trend) && (
        <div className="flex items-center justify-between gap-2 mt-2.5">
          {sub && (
            <p className="text-[12px] text-muted leading-snug truncate">{sub}</p>
          )}
          {trend && <TrendTag trend={trend} />}
        </div>
      )}
    </div>
  )
}

function TrendTag({ trend }: { trend: Trend }) {
  const { delta, pct, higherIsBetter = true } = trend

  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium
                       text-muted bg-border/40 rounded-full px-2 py-0.5 flex-shrink-0">
        — igual
      </span>
    )
  }

  const up   = delta > 0
  const good = higherIsBetter ? up : !up
  const cls  = good
    ? 'text-green bg-green/10'
    : 'text-red bg-red/10'
  const arrow = up ? '↑' : '↓'
  const label = pct != null ? `${pct > 0 ? '+' : ''}${pct}%` : `${up ? '+' : ''}${delta}`

  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold
                      rounded-full px-2 py-0.5 flex-shrink-0 tabular-nums ${cls}`}>
      {arrow} {label}
    </span>
  )
}
