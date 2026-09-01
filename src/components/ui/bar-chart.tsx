 
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

const FONT = '"Inter", system-ui, sans-serif'
const TICK = '#71717a'  /* zinc-500 — legível em ambos os temas */

function isLight(): boolean {
  return document.documentElement.classList.contains('light')
}

function tipStyle() {
  const light = isLight()
  return {
    background:   light ? 'rgba(255,255,255,0.98)' : 'rgba(19,19,21,0.97)',
    border:       light ? '1px solid #E4E4E7'      : '1px solid #27272A',
    borderRadius: 8,
    padding:      '8px 12px',
    fontSize:     11,
    fontFamily:   FONT,
    boxShadow:    light
      ? '0 4px 16px rgba(0,0,0,.10)'
      : '0 4px 16px rgba(0,0,0,.50)',
  }
}

function tipLabelColor() { return isLight() ? '#71717a' : '#71717a' }
function tipValueColor() { return isLight() ? '#09090b' : '#fafafa' }
function gridColor()     { return isLight() ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }

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

const TICK_STYLE = { fill: TICK, fontSize: 11, fontFamily: FONT }

export function XAxis({ ...props }: any) {
  return <RcX tick={TICK_STYLE} axisLine={false} tickLine={false} {...props} />
}

export function YAxis({ ...props }: any) {
  return <RcY tick={TICK_STYLE} axisLine={false} tickLine={false} width={32} {...props} />
}

export function ChartTooltip({ suffix, formatter, ...props }: any) {
  return <Tooltip content={<Tip suffix={suffix} formatter={formatter} />} cursor={{ fill: 'rgba(255,255,255,.04)' }} {...props} />
}

export function Legend({ ...props }: any) {
  return (
    <RcLegend
      wrapperStyle={{ color: TICK, fontSize: 11, fontFamily: FONT }}
      iconSize={10}
      {...props}
    />
  )
}

export { RcCell as Cell }
