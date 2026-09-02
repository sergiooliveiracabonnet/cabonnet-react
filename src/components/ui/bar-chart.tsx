 
import {
  ResponsiveContainer,
  BarChart as Rc,
  Bar as RcBar,
  CartesianGrid,
  XAxis as RcX,
  YAxis as RcY,
  Tooltip,
  Legend as RcLegend,
  Cell as RcCell,
} from 'recharts'
import type { ReactNode } from 'react'
import { chartAxis, chartTooltip, token } from '../../lib/chartTheme'

const FONT = '"Inter", system-ui, sans-serif'

function tipStyle() {
  const t = chartTooltip()
  return {
    background:   t.background,
    border:       t.border,
    borderRadius: t.borderRadius,
    padding:      '8px 12px',
    fontSize:     11,
    fontFamily:   FONT,
    boxShadow:    t.boxShadow,
  }
}

function tipLabelColor() { return chartTooltip().labelColor }
function tipValueColor() { return chartTooltip().valueColor }
function gridColor()     { return chartAxis().grid }

interface TipProps {
  active?:    boolean
  payload?:   any[]
  label?:     string
  suffix?:    string
  formatter?: (value: any, name: any) => ReactNode
}

function Tip({ active, payload, label, suffix = ' OS', formatter }: TipProps) {
  if (!active || !payload?.length) return null
  return (
    <div style={tipStyle()}>
      <p style={{ color: tipLabelColor(), marginBottom: payload.length > 1 ? 4 : 0 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: tipValueColor() }}>
          {payload.length > 1 ? `${p.name}: ` : ''}
          {formatter ? formatter(p.value, p.name) : `${p.value}${suffix}`}
        </p>
      ))}
    </div>
  )
}

export function BarChart({ data, layout = 'horizontal', margin, onClick, children, ...rest }: any) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Rc data={data} layout={layout} margin={margin ?? { top: 4, right: 8, left: 0, bottom: 0 }} onClick={onClick} {...rest}>
        {children}
      </Rc>
    </ResponsiveContainer>
  )
}

export function Bar({ radius = 4, onClick, ...props }: any) {
  return <RcBar radius={radius} cursor={onClick ? 'pointer' : undefined} onClick={onClick} {...props} />
}

export function Grid({ ...props }: any) {
  return <CartesianGrid stroke={gridColor()} strokeDasharray="0" vertical={false} {...props} />
}

function tickStyle() { return { fill: token('text-muted'), fontSize: 11, fontFamily: FONT } }

export function XAxis({ ...props }: any) {
  return <RcX tick={tickStyle()} axisLine={false} tickLine={false} {...props} />
}

export function YAxis({ ...props }: any) {
  return <RcY tick={tickStyle()} axisLine={false} tickLine={false} width={32} {...props} />
}

export function ChartTooltip({ suffix, formatter, ...props }: any) {
  return <Tooltip content={<Tip suffix={suffix} formatter={formatter} />} cursor={{ fill: 'rgba(255,255,255,.04)' }} {...props} />
}

export function Legend({ ...props }: any) {
  return (
    <RcLegend
      wrapperStyle={{ color: token('text-muted'), fontSize: 11, fontFamily: FONT }}
      iconSize={10}
      {...props}
    />
  )
}

export { RcCell as Cell }
