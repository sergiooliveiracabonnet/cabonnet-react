import { useMemo } from 'react'
import { Wrench, Home, Star, Layers } from 'lucide-react'
import type { BacklogData } from '../../../hooks/useBacklog'
import type { Vt24hStats } from '../../../lib/builders/vt24h'
import { buildBiGestaoTecnicaPainel } from '../../../lib/builders/biGestaoTecnicaPainel'
import { StatCard } from '../../../components/ui/StatCard'
import { SectionLabel } from '../../../components/ui/SectionLabel'
import { BarChart, Bar, XAxis, YAxis, Grid, ChartTooltip, Legend } from '../../../components/ui/bar-chart'

function fmt(n: number): string { return n.toLocaleString('pt-BR') }

const TIPO_TITULO: Record<'instalacao' | 'manutencao' | 'servico', string> = {
  instalacao: 'Instalação',
  manutencao: 'Manutenção',
  servico:    'Serviço',
}

interface PainelTabProps {
  data:  BacklogData | undefined
  vt24h: Vt24hStats
}

export function PainelTab({ data, vt24h }: PainelTabProps) {
  const painel = useMemo(() => buildBiGestaoTecnicaPainel(data?.rows ?? []), [data])

  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Total Manutenção" value={fmt(painel.totalManutencao)} icon={Wrench} />
        <StatCard title="Total Instalação" value={fmt(painel.totalInstalacao)} icon={Home} />
        <StatCard title="Total Serviço"    value={fmt(painel.totalServico)}    icon={Star} />
        <StatCard title="Total OS Geral"   value={fmt(painel.totalGeral)}      icon={Layers} />
      </div>

      {painel.ostPorMes.length > 0 && (
        <section className="space-y-2">
          <SectionLabel icon={Layers} color="#c4b5fd">Total de OS por Mês</SectionLabel>
          <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
            <div style={{ height: 260 }}>
              <BarChart data={painel.ostPorMes}>
                <Grid />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <ChartTooltip />
                <Legend />
                <Bar dataKey="instalacao" name="Instalação" fill="#3b82f6" />
                <Bar dataKey="manutencao" name="Manutenção" fill="#f97316" />
                <Bar dataKey="servico"    name="Serviço"    fill="#facc15" />
              </BarChart>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['instalacao', 'manutencao', 'servico'] as const).map(tipo => (
          <section key={tipo} className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3">
            <h3 className="text-label font-semibold text-text">{TIPO_TITULO[tipo]}</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[18px] font-bold tabular-nums text-text">{painel.mediaDiasExecucao[tipo]}d</p>
                <p className="text-caption text-muted mt-0.5">Média execução</p>
              </div>
              <div>
                <p className="text-[18px] font-bold tabular-nums text-text">{painel.cumprimentoAgendaPct[tipo]}%</p>
                <p className="text-caption text-muted mt-0.5">Cumpr. agenda</p>
              </div>
              <div>
                <p className="text-[18px] font-bold tabular-nums text-text">{painel.revisitaPct[tipo]}%</p>
                <p className="text-caption text-muted mt-0.5">Revisita</p>
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-xl border border-white/[0.08] bg-card p-4 space-y-3 max-w-md">
        <h3 className="text-label font-semibold text-text">VT24H</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[18px] font-bold tabular-nums" style={{ color: '#4ade80' }}>{fmt(vt24h.executouPrazo)}</p>
            <p className="text-caption text-muted mt-0.5">Executou no prazo</p>
          </div>
          <div>
            <p className="text-[18px] font-bold tabular-nums" style={{ color: '#f87171' }}>{fmt(vt24h.executouForaPrazo)}</p>
            <p className="text-caption text-muted mt-0.5">Fora do prazo</p>
          </div>
          <div>
            <p className="text-[18px] font-bold tabular-nums text-text">{vt24h.pctPrazo}%</p>
            <p className="text-caption text-muted mt-0.5">% no prazo</p>
          </div>
        </div>
      </section>

      <StatCard title="Taxa Manutenção" value={`${painel.taxaManutencaoPct}%`} tone="warning" size="sm" className="max-w-[200px]" />
    </div>
  )
}
