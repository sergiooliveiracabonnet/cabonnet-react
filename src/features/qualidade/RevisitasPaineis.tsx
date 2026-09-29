import type { ReactNode } from 'react'
import { UsersThree, ChartBar, Timer } from '@phosphor-icons/react'
import { DashboardPanelHeader } from '../dashboard/DashboardKpiPrimitives'

export interface RevisitasView {
  taxa:       { geral: number }
  totalRevisitas: number
  tempoMedio: number
  porEquipe:  { equipe: string; revInst: number; revManut: number; revServ: number; total: number; totalBase: number; taxa: number }[]
  diasDist:   Record<string, number>
  intervalo:  { labels: string[]; values: number[] }
  tendencia:  { delta: number; prevTaxa: number }
}

function PanelShell({ children }: { children: ReactNode }) {
  return <div className="h-full rounded-lg border border-border bg-card p-5">{children}</div>
}

function Bar({ pct, className }: { pct: number; className: string }) {
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-border/60">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

/** Quem mais gera retorno: taxa = revisitas / OS da equipe no período. */
export function RevisitasEquipePanel({ porEquipe }: { porEquipe: RevisitasView['porEquipe'] }) {
  const maxTaxa = Math.max(1, ...porEquipe.map(e => e.taxa))
  return (
    <PanelShell>
      <DashboardPanelHeader icon={UsersThree} color="rgb(var(--c-orange))" meta={<span className="hidden sm:inline">top {porEquipe.length}</span>}>
        Revisitas por Equipe
      </DashboardPanelHeader>
      <p className="mt-1 mb-3 text-caption text-muted">
        Retornos gerados por cada frente sobre as OS que ela executou. Ordenado por volume de retorno.
      </p>
      {!porEquipe.length ? (
        <p className="py-6 text-center text-label text-muted">Nenhuma revisita no período</p>
      ) : (
        <ul className="space-y-2">
          {porEquipe.map(e => (
            <li key={e.equipe} className="flex items-center gap-3"
                title={`${e.equipe}: ${e.total} revisitas em ${e.totalBase} OS (Inst. ${e.revInst} · Manut. ${e.revManut} · Serv. ${e.revServ})`}>
              <span className="w-24 flex-shrink-0 truncate text-caption font-semibold text-secondary">{e.equipe}</span>
              <Bar pct={e.taxa / maxTaxa * 100} className="bg-orange" />
              <span className="w-20 flex-shrink-0 text-right text-caption tabular-nums text-muted">
                <strong className="text-text">{e.taxa}%</strong> · {e.total}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  )
}

/** Revisitas por mês de execução, mais o delta de taxa contra o período anterior. */
export function RevisitasTendenciaPanel({ intervalo, tendencia, taxaGeral }: {
  intervalo: RevisitasView['intervalo']; tendencia: RevisitasView['tendencia']; taxaGeral: number
}) {
  const max = Math.max(1, ...intervalo.values)
  const { delta } = tendencia
  const melhorou = delta < 0
  return (
    <PanelShell>
      <DashboardPanelHeader
        icon={ChartBar}
        color="rgb(var(--c-primary))"
        meta={(
          <span className={`text-caption font-bold tabular-nums ${delta === 0 ? 'text-muted' : melhorou ? 'text-green' : 'text-red'}`}>
            {delta === 0 ? 'estável' : `${delta > 0 ? '+' : ''}${delta} p.p.`}
          </span>
        )}
      >
        Tendência de Revisitas
      </DashboardPanelHeader>
      <p className="mt-1 mb-3 text-caption text-muted">
        Taxa atual de {taxaGeral}% (período anterior: {tendencia.prevTaxa}%). Barras: revisitas por mês de execução.
      </p>
      {!intervalo.labels.length ? (
        <p className="py-6 text-center text-label text-muted">Sem histórico suficiente</p>
      ) : (
        <ul className="space-y-2">
          {intervalo.labels.map((label, i) => (
            <li key={label} className="flex items-center gap-3">
              <span className="w-14 flex-shrink-0 text-caption font-semibold text-secondary">{label}</span>
              <Bar pct={intervalo.values[i] / max * 100} className="bg-primary" />
              <span className="w-10 flex-shrink-0 text-right text-caption font-bold tabular-nums text-text">{intervalo.values[i]}</span>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  )
}

const FAIXA_TOM: Record<string, string> = { '1-7': 'bg-red', '8-14': 'bg-orange', '15-20': 'bg-yellow', '21-30': 'bg-green' }

/** Em quantos dias o cliente volta: retorno rápido aponta serviço mal resolvido. */
export function RevisitasIntervaloPanel({ diasDist, tempoMedio, total }: {
  diasDist: RevisitasView['diasDist']; tempoMedio: number; total: number
}) {
  const faixas = Object.entries(diasDist)
  const rapidas = diasDist['1-7'] ?? 0
  return (
    <PanelShell>
      <DashboardPanelHeader
        icon={Timer}
        color="rgb(var(--c-purple))"
        meta={<span className="text-caption tabular-nums text-muted">média {tempoMedio}d</span>}
      >
        Intervalo até o Retorno
      </DashboardPanelHeader>
      <p className="mt-1 mb-3 text-caption text-muted">
        {total > 0
          ? `${Math.round(rapidas / total * 100)}% das revisitas acontecem em até 7 dias — sinal de serviço não resolvido na primeira visita.`
          : 'Nenhuma revisita no período.'}
      </p>
      {total > 0 && (
        <ul className="space-y-2">
          {faixas.map(([faixa, n]) => (
            <li key={faixa} className="flex items-center gap-3">
              <span className="w-14 flex-shrink-0 text-caption font-semibold text-secondary">{faixa}d</span>
              <Bar pct={n / total * 100} className={FAIXA_TOM[faixa] ?? 'bg-primary'} />
              <span className="w-16 flex-shrink-0 text-right text-caption tabular-nums text-muted">
                <strong className="text-text">{n}</strong> · {Math.round(n / total * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  )
}
