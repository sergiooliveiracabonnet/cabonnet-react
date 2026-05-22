/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ResponsiveContainer,
  PieChart as Rc,
  Pie as RcPie,
  Cell,
  Tooltip,
  Legend as RcLegend,
} from 'recharts'

export { Cell }

function Tip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { name, value, payload: entry } = payload[0]
  const pct = Math.round((entry?.percent ?? 0) * 100)
  return (
    <div style={{
      background: 'rgba(8,16,36,0.95)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 6, padding: '8px 10px', fontSize: 11, fontFamily: '"Outfit", sans-serif',
    }}>
      <p style={{ color: '#8fa8c8' }}>{name}: <span style={{ color: '#c5d6ea' }}>{value} OS ({pct}%)</span></p>
    </div>
  )
}

export function PieChart({ children, ...rest }: any) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Rc {...rest}>{children}</Rc>
    </ResponsiveContainer>
  )
}

export function Pie({ innerRadius = '55%', outerRadius = '80%', paddingAngle = 2, onClick, ...props }: any) {
  return (
    <RcPie
      innerRadius={innerRadius}
      outerRadius={outerRadius}
      paddingAngle={paddingAngle}
      cursor={onClick ? 'pointer' : undefined}
      onClick={onClick}
      {...props}
    />
  )
}

export function ChartTooltip(props: any) {
  return <Tooltip content={<Tip />} {...props} />
}

export function Legend({ ...props }: any) {
  return (
    <RcLegend
      layout="vertical"
      align="right"
      verticalAlign="middle"
      wrapperStyle={{ color: '#8fa8c8', fontSize: 11, fontFamily: '"Outfit", sans-serif' }}
      iconSize={10}
      {...props}
    />
  )
}
