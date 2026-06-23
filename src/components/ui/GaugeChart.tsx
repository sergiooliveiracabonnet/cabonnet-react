import type { CSSProperties } from 'react'

const START_DEG = 150
const SWEEP_DEG = 240

function polar(deg: number, r: number, cx: number, cy: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function isLight(): boolean {
  return document.documentElement.classList.contains('light')
}

interface GaugeChartProps {
  value?:     number
  max?:       number
  target?:    number
  color?:     string
  size?:      number
  label?:     string
  style?:     CSSProperties
  className?: string
}

export function GaugeChart({ value = 0, max = 100, target, color = '#3b82f6', size = 96, label, style, className = '' }: GaugeChartProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const r   = size * 0.38
  const cx  = size / 2
  const cy  = size / 2
  const sw  = size * 0.065

  const ts = polar(START_DEG, r, cx, cy)
  const te = polar(START_DEG + SWEEP_DEG, r, cx, cy)
  const ve = polar(START_DEG + SWEEP_DEG * (pct / 100), r, cx, cy)

  const trackPath = [
    `M ${ts.x.toFixed(2)} ${ts.y.toFixed(2)}`,
    `A ${r} ${r} 0 1 1 ${te.x.toFixed(2)} ${te.y.toFixed(2)}`,
  ].join(' ')

  const vSweep  = SWEEP_DEG * (pct / 100)
  const vLarge  = vSweep > 180 ? 1 : 0
  const arcPath = pct > 0.5
    ? [`M ${ts.x.toFixed(2)} ${ts.y.toFixed(2)}`, `A ${r} ${r} 0 ${vLarge} 1 ${ve.x.toFixed(2)} ${ve.y.toFixed(2)}`].join(' ')
    : null

  const fontSize   = Math.round(size * 0.27)
  const trackColor = isLight() ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)'

  // Marca de meta (alvo) sobre o arco
  const hasTarget = target != null
  const tgtPct    = hasTarget ? Math.min(100, Math.max(0, (target! / max) * 100)) : 0
  const tgtDeg    = START_DEG + SWEEP_DEG * (tgtPct / 100)
  const tIn       = polar(tgtDeg, r - sw, cx, cy)
  const tOut      = polar(tgtDeg, r + sw, cx, cy)
  const tgtColor  = isLight() ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.6)'

  return (
    <div className={`flex-shrink-0 flex flex-col items-center gap-1.5 ${className}`} style={style}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
        {/* Track */}
        <path
          d={trackPath}
          fill="none"
          stroke={trackColor}
          strokeWidth={sw}
          strokeLinecap="round"
        />
        {/* Value arc */}
        {arcPath && (
          <path
            d={arcPath}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
          />
        )}
        {/* Meta (alvo) */}
        {hasTarget && (
          <line
            x1={tIn.x.toFixed(2)} y1={tIn.y.toFixed(2)}
            x2={tOut.x.toFixed(2)} y2={tOut.y.toFixed(2)}
            stroke={tgtColor}
            strokeWidth={Math.max(1.5, sw * 0.5)}
            strokeLinecap="round"
          >
            <title>Meta: {target}</title>
          </line>
        )}
        {/* Center value */}
        <text
          x={cx} y={cy + fontSize * 0.15}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontSize={fontSize}
          fontWeight="700"
          fontFamily="Inter, system-ui, sans-serif"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
        </text>
      </svg>
      {label && (
        <span className="text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color }}>
          {label}
        </span>
      )}
    </div>
  )
}
