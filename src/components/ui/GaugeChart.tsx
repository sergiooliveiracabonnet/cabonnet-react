import type { CSSProperties } from 'react'

const START_DEG = 150
const SWEEP_DEG = 240

function polar(deg: number, r: number, cx: number, cy: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

interface GaugeChartProps {
  value?:     number
  max?:       number
  color?:     string
  size?:      number
  label?:     string
  style?:     CSSProperties
  className?: string
}

export function GaugeChart({ value = 0, max = 100, color = '#0ea5e9', size = 96, label, style, className = '' }: GaugeChartProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const r   = size * 0.38
  const cx  = size / 2
  const cy  = size / 2
  const sw  = size * 0.065

  const ts = polar(START_DEG, r, cx, cy)
  const te = polar(START_DEG + SWEEP_DEG, r, cx, cy)
  const ve = polar(START_DEG + SWEEP_DEG * (pct / 100), r, cx, cy)

  const trackPath = [`M ${ts.x.toFixed(2)} ${ts.y.toFixed(2)}`, `A ${r} ${r} 0 1 1 ${te.x.toFixed(2)} ${te.y.toFixed(2)}`].join(' ')
  const vSweep    = SWEEP_DEG * (pct / 100)
  const vLarge    = vSweep > 180 ? 1 : 0
  const arcPath   = pct > 0.5
    ? [`M ${ts.x.toFixed(2)} ${ts.y.toFixed(2)}`, `A ${r} ${r} 0 ${vLarge} 1 ${ve.x.toFixed(2)} ${ve.y.toFixed(2)}`].join(' ')
    : null

  const fontSize = Math.round(size * 0.27)

  return (
    <div className={`flex-shrink-0 flex flex-col items-center gap-1.5 ${className}`} style={style}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
        <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={sw} strokeLinecap="round" />
        {arcPath && (
          <path d={arcPath} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 5px ${color}55)` }} />
        )}
        <text
          x={cx} y={cy + fontSize * 0.15}
          textAnchor="middle" dominantBaseline="middle"
          fill={color} fontSize={fontSize} fontWeight="800"
          fontFamily="Inter, system-ui, sans-serif"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
        </text>
      </svg>
      {label && (
        <span className="text-[10px] font-black uppercase tracking-[1.2px]" style={{ color }}>
          {label}
        </span>
      )}
    </div>
  )
}
