import { MapPin, AlertTriangle } from 'lucide-react'
import type { BacklogData } from '../../../hooks/useBacklog'
import {
  filtrarRevisitasAtivas, filtrarRevisitaPorTipo, revisitaPorCidade, clientesCronicos,
  type RevisitaTipo,
} from '../../../lib/builders/revisitaPorTipo'
import { StatCard } from '../../../components/ui/StatCard'
import { SectionLabel } from '../../../components/ui/SectionLabel'

function taxaCor(taxa: number): string {
  if (taxa >= 15) return '#f87171'
  if (taxa >= 8)  return '#facc15'
  return '#4ade80'
}

function fmt(n: number): string { return n.toLocaleString('pt-BR') }

interface RevisitaTabProps {
  data: BacklogData | undefined
  tipo: RevisitaTipo
}

export function RevisitaTab({ data, tipo }: RevisitaTabProps) {
  if (!data) return null

  const rows            = data.rows
  const totalPeriodo     = data.kpis.total
  const ativas           = filtrarRevisitasAtivas(rows)
  const revisitasDoTipo  = filtrarRevisitaPorTipo(ativas, tipo)
  const taxa             = totalPeriodo > 0 ? Math.round((revisitasDoTipo.length / totalPeriodo) * 100) : 0
  const porCidade        = revisitaPorCidade(rows, tipo)
  const cronicos         = clientesCronicos(revisitasDoTipo)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard title="Revisitas no período" value={fmt(revisitasDoTipo.length)}
                  sub={`${taxa}% de ${fmt(totalPeriodo)} OS`}
                  tone={taxa >= 15 ? 'critical' : taxa >= 8 ? 'warning' : 'ok'} />
        <StatCard title="Cidades atingidas" value={fmt(porCidade.filter(c => c.rev > 0).length)} />
        <StatCard title="Clientes crônicos (2+)" value={fmt(cronicos.length)} tone="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="space-y-2">
          <SectionLabel icon={MapPin} color="#22d3ee">Por Cidade</SectionLabel>
          <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden divide-y divide-white/[0.04]">
            {porCidade.length === 0 && (
              <p className="px-4 py-6 text-caption text-muted text-center">Sem revisitas no período.</p>
            )}
            {porCidade.map(c => {
              const color = taxaCor(c.taxa)
              const maxC  = porCidade[0]?.rev ?? 1
              return (
                <div key={c.cidade} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-label font-semibold text-text w-32 flex-shrink-0 truncate">{c.cidade}</span>
                  <div className="flex-1 h-1.5 bg-surface/40 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                         style={{ width: `${maxC ? Math.round((c.rev / maxC) * 100) : 0}%`, background: color }} />
                  </div>
                  <span className="font-mono font-bold text-body w-8 text-right" style={{ color }}>{c.rev}</span>
                  <span className="text-caption text-muted w-9 text-right">{c.taxa}%</span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="space-y-2">
          <SectionLabel icon={AlertTriangle} color="#f87171">Crônicos — 2+ revisitas</SectionLabel>
          <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
            {cronicos.length === 0 && (
              <p className="px-4 py-6 text-caption text-muted text-center">Nenhum cliente crônico no período.</p>
            )}
            <div className="max-h-64 overflow-y-auto divide-y divide-white/[0.04]">
              {cronicos.map(c => {
                const color = c.count >= 4 ? '#f87171' : c.count >= 3 ? '#f97316' : '#facc15'
                return (
                  <div key={c.nome} className="flex items-center gap-2 px-4 py-2.5">
                    <p className="flex-1 text-[11.5px] text-text truncate">{c.nome}</p>
                    <span className="font-mono font-bold text-body" style={{ color }}>{c.count}×</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
