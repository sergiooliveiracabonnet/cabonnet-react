import type { KPI } from '../../lib/types'
import { TrendPill } from './DashboardKpiPrimitives'

const SLA_TIER = { ok: { cls: 'badge-green', label: 'No SLA' }, warn: { cls: 'badge-yellow', label: 'Atenção' }, crit: { cls: 'badge-red', label: 'Crítico' } }

export function FornecedorCard({ nome, total, concluidas, sla, cor, slaTrend }: {
  nome: string; total: number; concluidas: number; sla: number; cor: string
  slaTrend?: KPI['trend']
}) {
  const tier = sla >= 85 ? 'ok' : sla >= 65 ? 'warn' : 'crit'
  const t    = SLA_TIER[tier]

  return (
    <div className="rounded-md border border-border bg-card transition-colors duration-150
                    hover:border-muted/40 cursor-default"
         style={{ borderLeft: `2px solid ${cor}` }}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cor }} />
            <p className="text-[12.5px] font-bold text-text truncate">{nome}</p>
          </div>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2 ${t.cls}`}>
            {t.label}
          </span>
        </div>

        <div className="flex items-end justify-between mb-2.5">
          <div>
            <p className="font-mono font-black text-[28px] leading-none text-text">{total}</p>
            <p className="text-[11px] text-muted mt-0.5">OS abertas</p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5">
              <p className="font-mono font-bold text-[22px] leading-none"
                 style={{ color: cor }}>{sla}%</p>
              {slaTrend && <TrendPill trend={slaTrend} />}
            </div>
            <p className="text-[11px] text-muted mt-0.5">conclusão · vs. período anterior</p>
          </div>
        </div>

        <div className="h-1.5 bg-surface/40 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
               style={{ width: `${sla}%`, background: cor }} />
        </div>
        <p className="text-[10px] text-muted mt-1.5">{concluidas} concluídas</p>
      </div>
    </div>
  )
}
