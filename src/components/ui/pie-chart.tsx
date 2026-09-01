 
import {
  ResponsiveContainer,
  PieChart as Rc,
  Pie as RcPie,
  Cell,
  Tooltip,
  Legend as RcLegend,
} from 'recharts'

export { Cell }

const FONT = '"Inter", system-ui, sans-serif'
const TICK = '#71717a'

function isLight(): boolean {
  return document.documentElement.classList.contains('light')
}

function Tip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { name, value, payload: entry } = payload[0]
  const pct   = Math.round((entry?.percent ?? 0) * 100)
  const light = isLight()
  return (
    <div style={{
      background:   light ? 'rgba(255,255,255,0.98)' : 'rgba(19,19,21,0.97)',
      border:       light ? '1px solid #E4E4E7'      : '1px solid #27272A',
      borderRadius: 8,
      padding:      '8px 12px',
      fontSize:     11,
      fontFamily:   FONT,
      boxShadow:    light ? '0 4px 16px rgba(0,0,0,.10)' : '0 4px 16px rgba(0,0,0,.50)',
    }}>
      <p style={{ color: light ? '#09090b' : '#fafafa' }}>
        <span style={{ color: TICK }}>{name}: </span>
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
      wrapperStyle={{ color: TICK, fontSize: 11, fontFamily: FONT }}
      iconSize={10}
      {...props}
    />
  )
}
