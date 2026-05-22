import type { ComponentType, MouseEventHandler, ReactNode } from 'react'

const ACCENT_COLOR = {
  primary:   { hex: '#0ea5e9', text: 'text-primary',   icon: 'icon-container-primary',   glow: 'card-glow-primary'   },
  green:     { hex: '#22c55e', text: 'text-green',     icon: 'icon-container-green',     glow: 'card-glow-green'     },
  red:       { hex: '#ef4444', text: 'text-red',       icon: 'icon-container-red',       glow: 'card-glow-red'       },
  yellow:    { hex: '#eab308', text: 'text-yellow',    icon: 'icon-container-yellow',    glow: 'card-glow-yellow'    },
  orange:    { hex: '#f97316', text: 'text-orange',    icon: 'icon-container-orange',    glow: 'card-glow-orange'    },
  cyan:      { hex: '#06b6d4', text: 'text-cyan',      icon: 'icon-container-cyan',      glow: 'card-glow-cyan'      },
  purple:    { hex: '#a78bfa', text: 'text-purple',    icon: 'icon-container-purple',    glow: 'card-glow-purple'    },
  teal:      { hex: '#14b8a6', text: 'text-teal',      icon: 'icon-container-teal',      glow: 'card-glow-teal'      },
  secondary: { hex: '#64748b', text: 'text-secondary', icon: 'icon-container-secondary', glow: 'card-glow-secondary' },
} as const

type Accent = keyof typeof ACCENT_COLOR

interface Trend {
  delta:          number
  pct?:           number
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

export function KPICard({ title, value, sub, accent = 'primary', icon: Icon, onClick, trend, className = '' }: KPICardProps) {
  const c = ACCENT_COLOR[accent as Accent] ?? ACCENT_COLOR.primary

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl border border-white/[0.07]
                  bg-card card-shine ${c.glow} hover-lift
                  transition-all duration-normal animate-card-enter
                  ${onClick ? 'cursor-pointer active:scale-[.98]' : ''}
                  ${className}`}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, ${c.hex}00 0%, ${c.hex}cc 35%, ${c.hex}cc 65%, ${c.hex}00 100%)` }}
      />
      <div
        className="absolute left-0 top-[2px] bottom-0 w-[2px]"
        style={{ background: `linear-gradient(180deg, ${c.hex}88 0%, ${c.hex}00 100%)` }}
      />
      {value != null && (
        <div
          className="kpi-ghost-num absolute right-3 top-1/2 -translate-y-1/2 text-[72px]"
          style={{ color: c.hex }}
          aria-hidden="true"
        >
          {value}
        </div>
      )}
      <div className="relative px-5 pt-4 pb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          {title && (
            <p className="text-[10px] font-black uppercase tracking-[1.8px] text-muted leading-none pt-px">
              {title}
            </p>
          )}
          {Icon && (
            <div className={`w-8 h-8 rounded-lg ${c.icon} flex items-center justify-center flex-shrink-0 -mt-0.5`}>
              <Icon size={14} className={c.text} />
            </div>
          )}
        </div>
        <p
          className={`number-display text-[38px] leading-none mb-1 ${c.text}`}
          style={{ textShadow: `0 0 32px ${c.hex}40` }}
        >
          {value ?? '—'}
        </p>
        {trend && <TrendTag trend={trend} />}
        {sub && (
          <p className="text-[11px] text-muted/75 mt-1.5 leading-snug font-medium">{sub}</p>
        )}
      </div>
    </div>
  )
}

function TrendTag({ trend }: { trend: Trend }) {
  const { delta, pct, higherIsBetter = true } = trend
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted mt-2
                       bg-white/[0.04] border border-white/[0.06] rounded-full px-2.5 py-0.5 font-medium">
        — igual ao período anterior
      </span>
    )
  }
  const up   = delta > 0
  const good = higherIsBetter ? up : !up
  const cls  = good
    ? 'text-green bg-green/[0.10] border-green/[0.20]'
    : 'text-red bg-red/[0.10] border-red/[0.20]'
  const arrow = up ? '↑' : '↓'
  const label = pct != null ? `${pct}%` : String(Math.abs(delta))

  return (
    <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold mt-2
                      border rounded-full px-2.5 py-0.5 ${cls}`}>
      {arrow} {label} vs período ant.
    </span>
  )
}
