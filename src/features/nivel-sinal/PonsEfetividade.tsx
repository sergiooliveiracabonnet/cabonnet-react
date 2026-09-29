import { Fragment, useMemo } from 'react'
import { ArrowRight, ChartLineUp, CheckCircle, Gauge, TrendUp, WarningCircle, WaveSine } from '@phosphor-icons/react'
import { Card } from '../../components/ui/Card'
import { StatCard } from '../../components/ui/StatCard'
import { Bar, BarChart, Cell, ChartTooltip, Grid, XAxis, YAxis } from '../../components/ui/bar-chart'
import { Line, LineChart } from '../../components/ui/line-chart'
import { distribuicaoGanho, efetividadePor, efetividadeResumo, evolucaoSemanal, matrizTransicao, ponsQueMenosMelhoraram } from './ponEfetividade'
import type { TreatedPon } from './ponTreatments'

const pct = (value: number) => `${(value * 100).toFixed(0)}%`
const db = (value: number | null) => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')} dB`

const COR = { bom: 'rgb(var(--c-sinal-bom))', atencao: 'rgb(var(--c-sinal-atencao))', critico: 'rgb(var(--c-sinal-critico))' }
const tomFaixa = { ruim: COR.critico, neutro: COR.atencao, bom: COR.bom }
const corNivel = { 'Crítico': COR.critico, 'Atenção': COR.atencao, Normal: COR.bom } as const

export function PonsEfetividade({ treated }: { treated: TreatedPon[] }) {
  const resumo = useMemo(() => efetividadeResumo(treated), [treated])
  const matriz = useMemo(() => matrizTransicao(treated), [treated])
  const faixas = useMemo(() => distribuicaoGanho(treated), [treated])
  const olts = useMemo(() => efetividadePor(treated, 'olt'), [treated])
  const cidades = useMemo(() => efetividadePor(treated, 'cidade'), [treated])
  const semanas = useMemo(() => evolucaoSemanal(treated), [treated])
  const piores = useMemo(() => ponsQueMenosMelhoraram(treated), [treated])

  if (!resumo.medidos) return <Card className="p-5">
    <h2 className="text-body font-semibold text-text">Efetividade das manutenções</h2>
    <p className="mt-1 text-caption text-muted">Preencha a Nova Potência dos clientes das PONs tratadas (botão “Potências”) para medir o quanto o sinal melhorou.</p>
  </Card>

  const niveis = ['Crítico', 'Atenção', 'Normal'] as const
  const maxCelula = Math.max(1, ...matriz.map(item => item.total))
  const ganhoOlts = olts.map(item => ({ ...item, label: item.nome }))

  return <section aria-label="Efetividade das manutenções" className="space-y-4">
    <div>
      <h2 className="text-body font-semibold text-text">Efetividade das manutenções</h2>
      <p className="mt-0.5 text-caption text-muted">Compara a potência de cada cliente antes da tratativa com a Nova Potência medida depois. Só entram clientes com as duas leituras.</p>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard palette="sinal" title="Ganho médio" value={db(resumo.ganhoMedio)} icon={TrendUp}
        tone={(resumo.ganhoMedio ?? 0) > 0 ? 'ok' : 'warning'} sub={`mediana ${db(resumo.ganhoMediano)}`} />
      <StatCard palette="sinal" title="Clientes que melhoraram" value={pct(resumo.taxaMelhora)} icon={ChartLineUp}
        tone={resumo.taxaMelhora >= 0.7 ? 'ok' : 'warning'} sub={`${resumo.melhoraram} de ${resumo.medidos} medidos · ${resumo.pioraram} pioraram`} />
      <StatCard palette="sinal" title="Críticos recuperados" value={resumo.criticosAntes ? pct(resumo.taxaRecuperacao) : '—'} icon={CheckCircle}
        tone={resumo.taxaRecuperacao >= 0.7 ? 'ok' : 'warning'} sub={`${resumo.recuperados} de ${resumo.criticosAntes} saíram do crítico`} />
      <StatCard palette="sinal" title="Críticos: antes → depois" value={`${resumo.criticosAntes} → ${resumo.criticosDepois}`} icon={WarningCircle}
        tone={resumo.criticosDepois < resumo.criticosAntes ? 'ok' : 'critical'} sub="clientes medidos em nível crítico" />
      <StatCard palette="sinal" title="Cobertura de medição" value={pct(resumo.cobertura)} icon={WaveSine}
        tone={resumo.cobertura >= 0.8 ? 'ok' : 'warning'} sub={`${resumo.medidos} de ${resumo.clientes} clientes · ${resumo.ponsNormalizadas}/${resumo.ponsAvaliadas} PONs normalizadas`} />
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <h3 className="text-label font-semibold text-text">Antes → depois da manutenção</h3>
        <p className="mb-3 text-caption text-muted">Quantos clientes mudaram de nível de sinal. A diagonal é quem ficou onde estava.</p>
        <div className="grid gap-1.5 text-center text-caption" style={{ gridTemplateColumns: "auto repeat(3, 1fr)" }}>
          <span />
          {niveis.map(nivel => <span key={nivel} className="pb-1 text-muted">depois: {nivel}</span>)}
          {niveis.map(de => <Fragment key={de}>
            <span className="flex items-center pr-2 text-left text-muted">antes: {de}</span>
            {niveis.map(para => {
              const total = matriz.find(item => item.de === de && item.para === para)?.total ?? 0
              return <span key={para} className="flex h-14 items-center justify-center rounded-lg text-body font-semibold tabular-nums text-text"
                style={{ background: `color-mix(in srgb, ${corNivel[para]} ${Math.round((total / maxCelula) * 55)}%, transparent)`, border: '1px solid rgb(var(--c-border, 128 128 128) / 0.3)' }}>
                {total}
              </span>
            })}
          </Fragment>)}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-label font-semibold text-text">Distribuição do ganho por cliente</h3>
        <p className="mb-3 text-caption text-muted">Quantos dB cada cliente ganhou (Nova Potência − potência de antes).</p>
        <div className="h-52">
          <BarChart data={faixas}>
            <Grid />
            <XAxis dataKey="faixa" />
            <YAxis allowDecimals={false} />
            <ChartTooltip suffix=" clientes" />
            <Bar dataKey="total" name="Clientes">
              {faixas.map(faixa => <Cell key={faixa.faixa} fill={tomFaixa[faixa.tom]} />)}
            </Bar>
          </BarChart>
        </div>
      </Card>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <h3 className="text-label font-semibold text-text">Evolução semanal</h3>
        <p className="mb-3 text-caption text-muted">Ganho médio (dB) das PONs tratadas em cada semana. Passe o mouse para ver quantas PONs foram.</p>
        {semanas.length < 2 ? <p className="py-10 text-center text-caption text-muted">A evolução aparece com pelo menos duas semanas de tratativas.</p>
          : <div className="h-52">
            <LineChart data={semanas}>
              <Grid />
              <XAxis dataKey="semana" />
              <YAxis unit=" dB" width={48} />
              <ChartTooltip formatter={(value: number | null) => db(value)} />
              <Line dataKey="ganhoMedio" name="Ganho médio" stroke={COR.bom} dot connectNulls />
            </LineChart>
          </div>}
      </Card>

      <Card className="p-4">
        <h3 className="text-label font-semibold text-text">Ganho médio por OLT</h3>
        <p className="mb-3 text-caption text-muted">Onde as manutenções rendem mais — e onde rendem menos.</p>
        <div style={{ height: Math.max(120, ganhoOlts.length * 32 + 24) }}>
          <BarChart data={ganhoOlts} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <Grid horizontal={false} vertical />
            <XAxis type="number" unit=" dB" />
            <YAxis type="category" dataKey="label" width={90} />
            <ChartTooltip formatter={(value: number) => db(value)} />
            <Bar dataKey="ganhoMedio" name="Ganho médio">
              {ganhoOlts.map(item => <Cell key={item.nome} fill={item.ganhoMedio > 0 ? COR.bom : COR.critico} />)}
            </Bar>
          </BarChart>
        </div>
      </Card>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-label font-semibold text-text">Por cidade</h3>
        </div>
        <table className="w-full text-left text-label">
          <thead className="bg-surface/70 text-caption uppercase tracking-wide text-muted"><tr>
            {['Cidade', 'PONs', 'Medidos', 'Ganho médio', 'Ficaram normais'].map(titulo => <th key={titulo} className="px-4 py-2 font-semibold">{titulo}</th>)}
          </tr></thead>
          <tbody>{cidades.map(item => <tr key={item.nome} className="border-t border-border">
            <td className="px-4 py-2 text-text">{item.nome}</td>
            <td className="px-4 py-2 tabular-nums text-secondary">{item.pons}</td>
            <td className="px-4 py-2 tabular-nums text-secondary">{item.medidos}</td>
            <td className={`px-4 py-2 tabular-nums font-semibold ${item.ganhoMedio > 0 ? 'text-sinal-bom' : 'text-sinal-critico'}`}>{db(item.ganhoMedio)}</td>
            <td className="px-4 py-2 tabular-nums text-secondary">{pct(item.taxaNormal)}</td>
          </tr>)}</tbody>
        </table>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Gauge size={15} className="text-sinal-atencao" />
          <h3 className="text-label font-semibold text-text">Tratativas que menos ajudaram</h3>
        </div>
        <ul className="divide-y divide-border">
          {piores.map(item => <li key={item.pon_key} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0">
              <span className="block truncate font-mono font-semibold text-text">{item.pon}</span>
              <span className="text-caption text-muted">{item.olt} · {item.cidade}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className={`block tabular-nums font-semibold ${(item.ganhoMedio ?? 0) > 0 ? 'text-sinal-atencao' : 'text-sinal-critico'}`}>{db(item.ganhoMedio)}</span>
              <span className="flex items-center justify-end gap-1 text-caption tabular-nums text-muted">
                {item.criticosAntes} <ArrowRight size={10} /> {item.criticosDepois} críticos · {item.medidos} medidos
              </span>
            </span>
          </li>)}
        </ul>
      </Card>
    </div>
  </section>
}
