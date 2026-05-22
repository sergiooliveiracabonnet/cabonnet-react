/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ResponsiveContainer,
  LineChart as Rc,
  Line as RcLine,
  AreaChart as RcArea,
  Area as RcAreaSeries,
} from 'recharts'

export { XAxis, YAxis, Grid, Legend, ChartTooltip, Cell } from './bar-chart'

export function LineChart({ data, margin, onClick, children, ...rest }: any) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Rc
        data={data}
        margin={margin ?? { top: 4, right: 8, left: 0, bottom: 0 }}
        onClick={onClick}
        style={onClick ? { cursor: 'pointer' } : undefined}
        {...rest}
      >
        {children}
      </Rc>
    </ResponsiveContainer>
  )
}

export function Line({ strokeWidth = 2, dot = false, activeDot = { r: 4 }, type = 'monotone', ...props }: any) {
  return <RcLine strokeWidth={strokeWidth} dot={dot} activeDot={activeDot} type={type} {...props} />
}

export function AreaChart({ data, margin, onClick, children, ...rest }: any) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RcArea
        data={data}
        margin={margin ?? { top: 4, right: 8, left: 0, bottom: 0 }}
        onClick={onClick}
        style={onClick ? { cursor: 'pointer' } : undefined}
        {...rest}
      >
        {children}
      </RcArea>
    </ResponsiveContainer>
  )
}

export function Area({ strokeWidth = 2, dot = false, activeDot = { r: 4 }, fillOpacity = 0.15, type = 'monotone', ...props }: any) {
  return <RcAreaSeries strokeWidth={strokeWidth} dot={dot} activeDot={activeDot} fillOpacity={fillOpacity} type={type} {...props} />
}
