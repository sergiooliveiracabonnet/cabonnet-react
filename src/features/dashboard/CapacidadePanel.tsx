import { Users } from 'lucide-react'
import { DashboardPanelHeader } from './DashboardKpiPrimitives'

export interface CapacidadeCidadeView {
  cidade:        string
  fila:          number
  frentes:       number
  entradasDia:   number
  saidasDia:     number
  saldoDia:      number
  prodFrenteDia: number
  frentesEstabilizar: number
  frentesZerar:  number | null
  diasParaZerar: number | null
  status: 'ok' | 'atencao' | 'nao_zera'
}

const n = (v: number) => v.toLocaleString('pt-BR')

/**
 * Capacidade × demanda por cidade. Responde a pergunta de alocação — "onde
 * falta frente?" — em vez de só mostrar o tamanho da fila.
 */
export function CapacidadePanel({ horizonte, cidades }: {
  horizonte: number
  cidades: CapacidadeCidadeView[]
}) {
  if (!cidades.length) {
    return (
      <div className="h-full rounded-lg border border-border bg-card p-5 flex items-center justify-center">
        <p className="text-muted text-label">Sem fila nem execuções para dimensionar capacidade</p>
      </div>
    )
  }

  const acumulando = cidades.filter(c => c.status === 'nao_zera')

  return (
    <div className="h-full rounded-lg border border-border bg-card p-5">
      <DashboardPanelHeader
        icon={Users}
        color="#22d3ee"
        meta={(
          <span className={`hidden sm:inline tabular-nums ${acumulando.length ? 'text-orange' : 'text-green'}`}>
            {acumulando.length ? `${acumulando.length} acumulando` : 'nenhuma acumulando'}
          </span>
        )}
      >
        Capacidade × Demanda por Cidade
      </DashboardPanelHeader>

      <p className="mt-1 mb-3 text-caption text-muted">
        Entradas e saídas por dia corrido nos últimos 28 dias. &quot;+N frentes&quot; = o que
        falta para zerar a fila em {horizonte} dias, já absorvendo as novas entradas.
      </p>

      <div className="space-y-2">
        {cidades.map(c => {
          const cor = c.status === 'nao_zera' ? '#fb923c' : c.status === 'atencao' ? '#facc15' : '#4ade80'
          return (
            <div key={c.cidade}
                 className="rounded-md border border-border bg-bg/35 px-3 py-2.5"
                 style={{ borderLeft: `2px solid ${cor}` }}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-label font-semibold text-text truncate">{c.cidade}</span>
                <span className="text-caption text-muted tabular-nums flex-shrink-0">
                  {n(c.fila)} na fila · {c.frentes} {c.frentes === 1 ? 'frente' : 'frentes'}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-caption tabular-nums">
                <span className="text-muted">
                  entra <span className="font-semibold text-text">{n(c.entradasDia)}</span>/d
                  {' · '}sai <span className="font-semibold text-text">{n(c.saidasDia)}</span>/d
                </span>
                <span className="font-semibold" style={{ color: cor }}>
                  {c.status === 'nao_zera'
                    ? `acumula +${n(c.saldoDia)}/d`
                    : c.diasParaZerar != null
                      ? `zera em ${n(c.diasParaZerar)}d`
                      : 'estável'}
                </span>
              </div>

              {/* Só mostra pedido de frente quando há déficit de fato */}
              {c.frentesZerar != null && c.frentesZerar > 0 && (
                <p className="mt-1.5 text-caption font-semibold" style={{ color: cor }}
                   title={`Produtividade medida: ${n(c.prodFrenteDia)} OS por frente/dia corrido`}>
                  +{c.frentesZerar} {c.frentesZerar === 1 ? 'frente' : 'frentes'} para zerar em {horizonte}d
                  {c.frentesEstabilizar > 0 && (
                    <span className="font-normal text-muted">
                      {' '}· {c.frentesEstabilizar} só para parar de crescer
                    </span>
                  )}
                </p>
              )}
              {c.frentesZerar == null && (
                <p className="mt-1.5 text-caption text-muted">
                  Sem execuções recentes na cidade — não dá para dimensionar frente
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
