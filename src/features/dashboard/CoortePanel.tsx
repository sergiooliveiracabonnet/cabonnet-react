import { CalendarBlank } from '@phosphor-icons/react'
import { DashboardPanelHeader } from './DashboardKpiPrimitives'

export interface CoorteLinhaView {
  chave:      number
  label:      string
  total:      number
  resolvidas: number
  pct:        (number | null)[]
  pctNoPrazo: number | null
}

// Verde só a partir de 80%: resolver 60% das OS dentro do prazo não é "ok".
function corDoPct(pct: number): string {
  if (pct >= 80) return 'rgb(74,222,128)'
  if (pct >= 60) return 'rgb(250,204,21)'
  if (pct >= 40) return 'rgb(251,146,60)'
  return 'rgb(248,113,113)'
}

/**
 * Coorte de resolução: cada linha é uma safra de abertura, cada coluna é
 * "resolvidas até D+n". Diferente da taxa de conclusão, aqui a comparação entre
 * linhas é justa — todas medem o mesmo tipo de coisa na mesma idade.
 */
export function CoortePanel({ buckets, linhas }: { buckets: number[]; linhas: CoorteLinhaView[] }) {
  if (!linhas.length) {
    return (
      <div className="h-full rounded-lg border border-border bg-card p-5 flex items-center justify-center">
        <p className="text-muted text-label">Sem safras suficientes para montar a coorte</p>
      </div>
    )
  }

  return (
    <div className="h-full rounded-lg border border-border bg-card p-5">
      <DashboardPanelHeader
        icon={CalendarBlank}
        color="#a78bfa"
        meta={<span className="hidden sm:inline">{linhas.length} semanas</span>}
      >
        Coorte de Resolução — por semana de abertura
      </DashboardPanelHeader>

      <p className="mt-1 mb-3 text-caption text-muted">
        % das OS abertas na semana resolvidas em até D+n (leitura do cliente) e
        dentro do SLA de cada OS (leitura contratual). Célula vazia = a safra ainda
        não tem idade para responder aquela janela.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[380px] border-collapse">
          <thead>
            <tr>
              <th className="text-left text-caption font-semibold uppercase tracking-[0.05em] text-muted pb-2 pr-2">
                Semana
              </th>
              <th className="text-right text-caption font-semibold uppercase tracking-[0.05em] text-muted pb-2 px-2">
                OS
              </th>
              {buckets.map(d => (
                <th key={d} className="text-center text-caption font-semibold uppercase tracking-[0.05em] text-muted pb-2 px-1">
                  D+{d}
                </th>
              ))}
              <th className="text-center text-caption font-semibold uppercase tracking-[0.05em] text-muted pb-2 pl-3 border-l border-border"
                  title="% resolvidas dentro do SLA da própria OS — manutenção vence em 1 dia, instalação em 2">
                No prazo
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.chave} className="border-t border-border/60">
                <td className="py-1.5 pr-2 text-caption font-semibold text-secondary whitespace-nowrap">{l.label}</td>
                <td className="py-1.5 px-2 text-right text-caption tabular-nums text-muted">{l.total}</td>
                {l.pct.map((p, i) => (
                  <td key={buckets[i]} className="py-1.5 px-1">
                    {p == null ? (
                      <div className="h-6 rounded-sm border border-dashed border-border/70"
                           title={`Safra ainda não tem ${buckets[i]} dia(s) de idade`} />
                    ) : (
                      <div
                        className="flex h-6 items-center justify-center rounded-sm text-caption font-bold tabular-nums text-[#09090b]"
                        style={{ background: corDoPct(p) }}
                        title={`${l.label}: ${p}% das ${l.total} OS resolvidas em até ${buckets[i]} dia(s)`}
                      >
                        {p}%
                      </div>
                    )}
                  </td>
                ))}
                <td className="py-1.5 pl-3 border-l border-border">
                  {l.pctNoPrazo == null ? (
                    <div className="h-6 rounded-sm border border-dashed border-border/70"
                         title="Safra ainda não venceu o maior SLA dela" />
                  ) : (
                    <div className="flex h-6 items-center justify-center rounded-sm text-caption font-bold tabular-nums text-[#09090b]"
                         style={{ background: corDoPct(l.pctNoPrazo) }}
                         title={`${l.label}: ${l.pctNoPrazo}% das ${l.total} OS resolvidas dentro do SLA de cada uma`}>
                      {l.pctNoPrazo}%
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
