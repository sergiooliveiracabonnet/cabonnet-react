import { ArrowRight, UserMinus } from '@phosphor-icons/react'
import type { OSRow } from '../../lib/types'
import { DashboardPanelHeader } from './DashboardKpiPrimitives'

export interface ClienteReincidenteView {
  chave:           string
  cliente:         string
  cidade:          string
  bairro:          string
  visitas:         number
  intervaloMedio:  number
  diasDesdeUltima: number
  rows:            OSRow[]
}

/**
 * Clientes com manutenção reincidente — o sinal mais barato de risco de
 * cancelamento que um ISP tem. A taxa agregada de revisita diz que existe
 * retrabalho; aqui aparece QUEM, para dar tratativa antes de perder o cliente.
 */
export function ChurnPanel({ janelaDias, clientes, totalReincidentes, totalBase, pctReincidencia, onOpen, onOpenReport }: {
  janelaDias:        number
  clientes:          ClienteReincidenteView[]
  totalReincidentes: number
  totalBase:         number
  pctReincidencia:   number
  onOpen: (title: string, rows: OSRow[]) => void
  onOpenReport?: () => void
}) {
  if (!clientes.length) {
    return (
      <div className="h-full rounded-lg border border-border border-l-2 border-l-green bg-card p-5">
        <DashboardPanelHeader icon={UserMinus} color="#4ade80">Risco de Churn — Reincidência</DashboardPanelHeader>
        <p className="mt-3 text-body font-semibold text-green">
          Nenhum cliente com manutenção repetida nos últimos {janelaDias} dias
        </p>
      </div>
    )
  }

  return (
    <div className="h-full rounded-lg border border-border border-l-2 border-l-orange bg-card p-5">
      <DashboardPanelHeader
        icon={UserMinus}
        color="#fb923c"
        actionLabel="Abrir OS"
        meta={<span className="hidden sm:inline tabular-nums">{pctReincidencia}% da base</span>}
      >
        Risco de Churn — Reincidência
      </DashboardPanelHeader>

      <p className="mt-1 mb-3 text-caption text-muted">
        <span className="font-semibold text-orange tabular-nums">{totalReincidentes}</span> de{' '}
        <span className="tabular-nums">{totalBase}</span> clientes atendidos chamaram manutenção
        2× ou mais em {janelaDias} dias.
      </p>

      <div className="space-y-1">
        {clientes.map(c => (
          <button
            key={c.chave}
            type="button"
            onClick={() => onOpen(`${c.cliente} — ${c.visitas} manutenções em ${janelaDias}d`, c.rows)}
            aria-label={`${c.cliente}, ${c.visitas} manutenções, intervalo médio ${c.intervaloMedio} dias. Abrir OS`}
            title={`${c.cliente} · ${c.cidade}${c.bairro ? ` / ${c.bairro}` : ''} · última há ${c.diasDesdeUltima}d`}
            className="group grid w-full min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md
                       border-0 bg-transparent px-1.5 py-1 text-left transition-colors duration-200
                       hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60
                       motion-reduce:transition-none"
          >
            <span className="min-w-0">
              <span className="block truncate text-caption font-semibold text-secondary transition-colors group-hover:text-text">
                {c.cliente}
              </span>
              <span className="block truncate text-caption text-muted">
                {c.cidade}{c.bairro ? ` · ${c.bairro}` : ''} · última há {c.diasDesdeUltima}d
              </span>
            </span>
            <span className="flex flex-shrink-0 items-baseline gap-2 tabular-nums">
              <span className="rounded px-1.5 py-0.5 text-caption font-bold text-orange bg-orange/10">
                {c.visitas}×
              </span>
              <span className="text-caption text-muted" title="Intervalo médio entre chamados">
                ~{c.intervaloMedio.toLocaleString('pt-BR')}d
              </span>
            </span>
          </button>
        ))}
      </div>
      {onOpenReport && (
        <button type="button" onClick={onOpenReport}
          className="mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 text-label font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
          Ver relatório completo <ArrowRight size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
