/* eslint-disable @typescript-eslint/no-explicit-any */
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

const TICK       = '#4a6480'
const GRID       = 'rgba(255,255,255,.04)'
const TICK_STYLE = { fill: TICK, fontSize: 11, fontFamily: '"Outfit", sans-serif' }

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
    <div style={{
      background: 'rgba(8,16,36,0.95)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 6, padding: '8px 10px', fontSize: 11, fontFamily: '"Outfit", sans-serif',
    }}>
      <p style={{ color: '#8fa8c8', marginBottom: payload.length > 1 ? 4 : 0 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: '#c5d6ea' }}>
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
  return <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} {...props} />
}

export function XAxis({ ...props }: any) {
  return <RcX tick={TICK_STYLE} axisLine={false} tickLine={false} {...props} />
}

export function YAxis({ ...props }: any) {
  return <RcY tick={TICK_STYLE} axisLine={false} tickLine={false} width={36} {...props} />
}

export function ChartTooltip({ suffix = ' OS', formatter, ...props }: any) {
  return (
    <Tooltip
      content={({ active, payload, label }: any) => (
        <Tip active={active} payload={payload as any} label={String(label ?? '')} suffix={suffix} formatter={formatter} />
      )}
      cursor={{ fill: 'rgba(255,255,255,0.03)' }}
      {...props}
    />
  )
}

export function Legend({ ...props }: any) {
  return (
    <RcLegend
      wrapperStyle={{ color: '#94a3b8', fontSize: 11, fontFamily: '"Outfit", sans-serif' }}
      iconSize={10}
      {...props}
    />
  )
}

export { RcCell as Cell }
