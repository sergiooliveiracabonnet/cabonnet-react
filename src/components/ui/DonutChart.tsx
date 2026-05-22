import { useState, useEffect, useMemo } from 'react'

const R  = 80
const SW = 20
const C  = 2 * Math.PI * R

interface DataPoint {
  name:  string
  value: number
}

interface Segment extends DataPoint {
  pct:        number
  arc:        number
  dashoffset: number
  color:      string
}

function buildSegments(data: DataPoint[], colors: string[], total: number): Segment[] {
  const gap = data.length > 1 ? (1.5 / 360) * C : 0
  let acc = 0
  return data.map((d, i) => {
    const frac     = total > 0 ? d.value / total : 0
    const allotted = frac * C
    const arc      = Math.max(allotted - gap, 0)
    acc += allotted
    return {
      name:       d.name,
      value:      d.value,
      pct:        Math.round(frac * 100),
      arc,
      dashoffset: C - (acc - allotted),
      color:      colors[i % colors.length] ?? '#64748b',
    }
  })
}

interface DonutChartProps {
  data?:        DataPoint[]
  colors?:      string[]
  onClick?:     (segment: Segment) => void
  centerLabel?: string
}

export function DonutChart({ data = [], colors = [], onClick, centerLabel = 'Total' }: DonutChartProps) {
  const [animReady, setAnimReady] = useState(false)
  const [hovered,   setHovered]   = useState<number | null>(null)

  const total    = useMemo(() => data.reduce((s, d) => s + (d.value || 0), 0), [data])
  const segments = useMemo(() => buildSegments(data, colors, total), [data, colors, total])

  useEffect(() => {
    setAnimReady(false)
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => setAnimReady(true))
      return () => cancelAnimationFrame(r2)
    })
    return () => cancelAnimationFrame(r1)
  }, [data])

  const cx = 110
  const cy = 110
  const hs = hovered != null ? segments[hovered] : null

  return (
    <div className="flex h-full w-full min-h-0">
      <div className="flex items-center justify-center" style={{ width: '52%', minWidth: 0 }}>
        <svg viewBox="0 0 220 220" style={{ width: '100%', height: '100%' }}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={SW} />
          <g transform={`rotate(-90, ${cx}, ${cy})`}>
            {segments.map((s, i) => {
              const isHov = hovered === i
              const isDim = hovered != null && !isHov
              return (
                <circle key={i}
                  cx={cx} cy={cy} r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={isHov ? SW + 4 : SW}
                  strokeDasharray={animReady ? `${s.arc} ${C - s.arc}` : `0 ${C}`}
                  strokeDashoffset={s.dashoffset}
                  strokeLinecap="round"
                  opacity={isDim ? 0.3 : 1}
                  style={{
                    transition: [`stroke-dasharray 0.6s ease ${i * 0.06}s`, 'stroke-width 0.2s ease', 'opacity 0.2s ease'].join(', '),
                    cursor: onClick ? 'pointer' : 'default',
                  }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onClick?.(s)}
                />
              )
            })}
          </g>
          <text x={cx} y={hs ? cy - 10 : cy - 7} textAnchor="middle" dominantBaseline="middle"
                fill={hs ? hs.color : 'rgb(228,238,255)'} fontSize={hs ? 22 : 27}
                fontFamily='"Outfit", sans-serif' fontWeight="700"
                style={{ transition: 'all 0.18s ease' }}>
            {hs ? hs.value : total}
          </text>
          <text x={cx} y={hs ? cy + 8 : cy + 11} textAnchor="middle" dominantBaseline="middle"
                fill={hs ? hs.color : 'rgba(100,120,166,0.75)'} fontSize={10}
                fontFamily='"Outfit", sans-serif' fontWeight="500"
                style={{ transition: 'all 0.18s ease' }}>
            {hs ? (hs.name.length > 13 ? hs.name.slice(0, 13) + '…' : hs.name) : centerLabel}
          </text>
          {hs && (
            <text x={cx} y={cy + 23} textAnchor="middle" dominantBaseline="middle"
                  fill={hs.color} fontSize={10} fontFamily='"Outfit", sans-serif'
                  fontWeight="600" opacity={0.75}>
              {hs.pct}%
            </text>
          )}
        </svg>
      </div>

      <div className="flex flex-col justify-center gap-1.5 py-2 pr-2 min-w-0" style={{ width: '48%' }}>
        {segments.map((s, i) => {
          const isHov = hovered === i
          const isDim = hovered != null && !isHov
          return (
            <button key={i}
              className="text-left w-full focus:outline-none cursor-pointer"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onClick?.(s)}
              style={{ opacity: isDim ? 0.35 : 1, transition: 'opacity 0.18s ease' }}
            >
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 rounded-sm" style={{ width: 10, height: 10, background: s.color }} />
                <span className="flex-1 min-w-0 truncate text-[11px] leading-none" style={{ color: 'rgba(160,176,214,0.75)' }}>
                  {s.name}
                </span>
                <span className="flex-shrink-0 text-[11px] font-mono font-semibold"
                      style={{ color: isHov ? s.color : 'rgba(100,120,166,0.85)', transition: 'color 0.18s ease' }}>
                  {s.pct}%
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
