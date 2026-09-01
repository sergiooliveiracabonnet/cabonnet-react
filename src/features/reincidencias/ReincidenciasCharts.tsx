import { ChartBar, ClockCounterClockwise, Wrench } from '@phosphor-icons/react'
import { Bar, BarChart, ChartTooltip, Grid, XAxis, YAxis } from '../../components/ui/bar-chart'
import type { AIReincidenciaAnalysis } from '../../hooks/useAIReincidencias'
import type { TeamRecurrenceRank } from './reincidenciasReport'

interface IntervalItem { faixa: string; total: number }

export function ReincidenciasCharts({ ranking, intervals, analysis }: {
  ranking: TeamRecurrenceRank[]
  intervals: IntervalItem[]
  analysis?: AIReincidenciaAnalysis | null
}) {
  // Já vem ordenada por volume no merge dos lotes.
  const causes = (analysis?.causas || []).slice(0, 7)
  return (
    <section aria-label="Análises gráficas de reincidência" className="grid grid-cols-1 gap-3 xl:grid-cols-3">
      <ChartCard icon={ChartBar} title="Equipes com maior reincidência" subtitle="Taxa atribuída à equipe do atendimento anterior">
        {ranking.length ? <>
          <div role="img" aria-label="Ranking das equipes por taxa de reincidência" className="h-[260px]">
            <BarChart data={ranking} layout="vertical" margin={{ top: 2, right: 18, left: 8, bottom: 0 }} accessibilityLayer>
              <Grid /><XAxis type="number" domain={[0, 'dataMax']} unit="%" /><YAxis type="category" dataKey="equipe" width={72} />
              <ChartTooltip suffix="%" formatter={(value: number) => `${value}%`} />
              <Bar dataKey="taxa" name="Taxa" fill="#fb923c" radius={[0, 4, 4, 0]} />
            </BarChart>
          </div>
          <DataList items={ranking.slice(0, 5).map(item => ({ label: item.equipe, value: `${item.taxa}% · ${item.reincidentes}/${item.base} clientes` }))} />
        </> : <Empty text="Sem equipes suficientes para calcular a taxa." />}
      </ChartCard>

      <ChartCard icon={Wrench} title="Principais causas" subtitle="Pareto classificado pela análise da IA">
        {causes.length ? <>
          <div role="img" aria-label="Principais causas das revisitas" className="h-[260px]">
            <BarChart data={causes} layout="vertical" margin={{ top: 2, right: 18, left: 8, bottom: 0 }} accessibilityLayer>
              <Grid /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="causa" width={108} tickFormatter={(value: string) => value.length > 18 ? `${value.slice(0, 17)}…` : value} />
              <ChartTooltip suffix=" pares" /><Bar dataKey="count" name="Pares" fill="#60a5fa" radius={[0, 4, 4, 0]} />
            </BarChart>
          </div>
          <DataList items={causes.slice(0, 5).map(item => ({ label: item.causa, value: `${item.count} · ${item.pct}%` }))} />
        </> : <Empty text="Gere a análise com IA para classificar as causas." />}
      </ChartCard>

      <ChartCard icon={ClockCounterClockwise} title="Intervalo entre visitas" subtitle="Quanto tempo levou para o cliente retornar">
        <div role="img" aria-label="Distribuição do intervalo entre visitas" className="h-[260px]">
          <BarChart data={intervals} margin={{ top: 8, right: 8, left: -10, bottom: 0 }} accessibilityLayer>
            <Grid /><XAxis dataKey="faixa" /><YAxis allowDecimals={false} /><ChartTooltip suffix=" pares" />
            <Bar dataKey="total" name="Pares" fill="#a78bfa" />
          </BarChart>
        </div>
        <DataList items={intervals.map(item => ({ label: item.faixa, value: String(item.total) }))} />
      </ChartCard>
    </section>
  )
}

function ChartCard({ icon: Icon, title, subtitle, children }: { icon: typeof ChartBar; title: string; subtitle: string; children: React.ReactNode }) {
  return <article className="min-w-0 rounded-xl border border-border bg-card p-4">
    <div className="flex items-start gap-2"><Icon size={17} className="mt-0.5 flex-shrink-0 text-primary" /><div><h2 className="text-body font-bold text-text">{title}</h2><p className="mt-0.5 text-caption text-secondary">{subtitle}</p></div></div>
    <div className="mt-3">{children}</div>
  </article>
}

function DataList({ items }: { items: Array<{ label: string; value: string }> }) {
  return <div className="mt-2 border-t border-border pt-2" aria-label="Valores do gráfico">{items.map(item => <div key={item.label} className="flex items-center justify-between gap-3 py-0.5 text-caption"><span className="truncate text-secondary">{item.label}</span><b className="whitespace-nowrap tabular-nums text-text">{item.value}</b></div>)}</div>
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed border-border bg-elevated/30 p-6 text-center text-label text-secondary">{text}</div>
}
