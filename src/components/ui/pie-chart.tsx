 
import {
  ResponsiveContainer,
  PieChart as Rc,
  Pie as RcPie,
  Cell,
  Tooltip,
  Legend as RcLegend,
} from 'recharts'

export { Cell }

import { chartTooltip, token } from '../../lib/chartTheme'

const FONT = '"Inter", system-ui, sans-serif'

function Tip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { name, value, payload: entry } = payload[0]
  const pct = Math.round((entry?.percent ?? 0) * 100)
  const t   = chartTooltip()
  return (
    <div style={{
      background:   t.background,
      border:       t.border,
      borderRadius: t.borderRadius,
      padding:      '8px 12px',
      fontSize:     11,
      fontFamily:   FONT,
      boxShadow:    t.boxShadow,
    }}>
      <p style={{ color: t.valueColor }}>
        <span style={{ color: t.labelColor }}>{name}: </span>
        {value} OS ({pct}%)
      </p>
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
      wrapperStyle={{ color: token('text-muted'), fontSize: 11, fontFamily: FONT }}
      iconSize={10}
      {...props}
    />
  )
}
