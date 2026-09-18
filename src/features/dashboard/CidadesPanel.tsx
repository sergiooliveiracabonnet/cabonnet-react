import { useMemo } from 'react'
import { ArrowRight, MapPin } from '@phosphor-icons/react'
import type { OSRow } from '../../lib/types'
import { DashboardPanelHeader } from './DashboardKpiPrimitives'

export interface CapacidadeCidadeView {
  cidade:        string
  fila:          number
  frentes:       number
  entradasDia:   number
  saidasDia:     number
  saldoDia:      number          // + = fila cresce
  prodFrenteDia: number
  frentesEstabilizar: number
  frentesZerar:  number | null
  diasParaZerar: number | null
  status: 'ok' | 'atencao' | 'nao_zera'
}

const n = (v: number) => v.toLocaleString('pt-BR')

interface CidadeLinha {
  nome: string
  rows: OSRow[]
  criticas: number
  sla: number
  capacidade: CapacidadeCidadeView | null
}

/**
 * Fila + SLA + capacidade por cidade, numa linha só. Antes eram dois painéis
 * em abas diferentes (Operação: capacidade × demanda; Território: fila e SLA)
 * mostrando a MESMA cidade com colunas diferentes — obrigava trocar de aba
 * para comparar. Aqui "Taubaté" aparece uma vez, com tudo que decide alocação.
 */
export function CidadesPanel({ horizonte, capacidadeCidades, filaAtiva, onOpen, onOpenReport }: {
  horizonte: number
  capacidadeCidades: CapacidadeCidadeView[]
  filaAtiva: OSRow[]
  onOpen: (title: string, rows: OSRow[]) => void
  onOpenReport?: () => void
}) {
  const linhas = useMemo(() => {
    const filaPorCidade = new Map<string, { rows: OSRow[]; slaExc: number; criticas: number }>()
    for (const r of filaAtiva) {
      const nome = (r.nomedacidade || 'Sem cidade').trim()
      let e = filaPorCidade.get(nome)
      if (!e) { e = { rows: [], slaExc: 0, criticas: 0 }; filaPorCidade.set(nome, e) }
      e.rows.push(r)
      if (r._slaExcedido || r._slaSemAgend) e.slaExc++
      if (r._slaCritico) e.criticas++
    }
    const capacidadePorCidade = new Map(capacidadeCidades.map(c => [c.cidade, c]))
    const nomes = new Set([...filaPorCidade.keys(), ...capacidadePorCidade.keys()])

    return [...nomes]
      .map((nome): CidadeLinha => {
        const fila = filaPorCidade.get(nome)
        const rows = fila?.rows ?? []
        return {
          nome,
          rows,
          criticas: fila?.criticas ?? 0,
          sla: rows.length > 0 ? Math.round((rows.length - (fila?.slaExc ?? 0)) / rows.length * 100) : 100,
          capacidade: capacidadePorCidade.get(nome) ?? null,
        }
      })
      // Quem não zera primeiro, depois cidades sem dado de capacidade, por fila.
      .sort((a, b) => {
        const pa = a.capacidade?.status === 'nao_zera' ? 0 : a.capacidade ? 1 : 2
        const pb = b.capacidade?.status === 'nao_zera' ? 0 : b.capacidade ? 1 : 2
        return pa - pb || b.rows.length - a.rows.length
      })
  }, [filaAtiva, capacidadeCidades])

  if (!linhas.length) {
    return (
      <div className="h-full rounded-lg border border-border bg-card p-5 flex items-center justify-center">
        <p className="text-muted text-label">Sem fila nem execuções para dimensionar cidade</p>
      </div>
    )
  }

  const acumulando = capacidadeCidades.filter(c => c.status === 'nao_zera')
  const maxFila = Math.max(...linhas.map(l => l.rows.length), 1)

  return (
    <div className="h-full rounded-lg border border-border bg-card p-5">
      <DashboardPanelHeader
        icon={MapPin}
        color="#3b82f6"
        actionLabel="Abrir OS"
        meta={(
          <span className={`hidden sm:inline tabular-nums ${acumulando.length ? 'text-orange' : 'text-green'}`}>
            {acumulando.length ? `${acumulando.length} acumulando` : 'nenhuma acumulando'}
          </span>
        )}
      >
        Cidades — Fila, SLA e Capacidade
      </DashboardPanelHeader>

      <p className="mt-1 mb-3 text-caption text-muted">
        Entradas e saídas por dia corrido nos últimos 28 dias. &quot;+N frentes&quot; = o que
        falta para zerar a fila em {horizonte} dias, já absorvendo as novas entradas.
      </p>

      <div className="space-y-2">
        {linhas.map(l => {
          const cap = l.capacidade
          const cor = cap?.status === 'nao_zera' ? '#fb923c' : cap?.status === 'atencao' ? '#facc15' : '#4ade80'
          const slaCls = l.sla >= 90 ? 'text-green bg-green/10' : l.sla >= 75 ? 'text-yellow bg-yellow/10' : 'text-red bg-red/10'
          const wCrit = l.rows.length > 0 ? l.criticas / l.rows.length : 0
          const clicavel = l.rows.length > 0

          return (
            <button key={l.nome} type="button" disabled={!clicavel}
                    onClick={() => onOpen(`Fila — ${l.nome}`, l.rows)}
                    aria-label={`${l.nome}: ${l.rows.length} OS, ${l.criticas} críticas, SLA ${l.sla}%${clicavel ? '. Abrir OS' : ''}`}
                    title={`${l.nome}: ${l.rows.length} OS na fila · ${l.criticas} críticas · SLA ${l.sla}%${clicavel ? ' — clique para listar' : ''}`}
                    className="w-full rounded-md border border-border bg-bg/35 px-3 py-2.5 text-left
                               disabled:cursor-default"
                    style={{ borderLeft: `2px solid ${cor}` }}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-label font-semibold text-text truncate">{l.nome}</span>
                <span className="flex flex-shrink-0 items-center gap-2">
                  <span className="text-caption text-muted tabular-nums">
                    {n(l.rows.length)} na fila{cap ? ` · ${cap.frentes} ${cap.frentes === 1 ? 'frente' : 'frentes'}` : ''}
                  </span>
                  <span className={`text-caption font-bold rounded px-1.5 py-0.5 tabular-nums ${slaCls}`}>
                    {l.sla}%
                  </span>
                </span>
              </div>

              {l.rows.length > 0 && (
                <div className="mt-1.5 flex h-1.5 rounded-full bg-surface overflow-hidden"
                     style={{ width: `${Math.round(l.rows.length / maxFila * 100)}%`, minWidth: 8 }}>
                  {l.criticas > 0 && (
                    <div className="h-full flex-shrink-0" style={{ width: `${wCrit * 100}%`, background: 'rgb(248,113,113)' }} />
                  )}
                  <div className="h-full flex-1" style={{ background: 'rgba(59,130,246,.75)' }} />
                </div>
              )}

              {cap && (
                <>
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-caption tabular-nums">
                    <span className="text-muted">
                      entra <span className="font-semibold text-text">{n(cap.entradasDia)}</span>/d
                      {' · '}sai <span className="font-semibold text-text">{n(cap.saidasDia)}</span>/d
                    </span>
                    <span className="font-semibold" style={{ color: cor }}>
                      {cap.status === 'nao_zera'
                        ? `acumula +${n(cap.saldoDia)}/d`
                        : cap.diasParaZerar != null
                          ? `zera em ${n(cap.diasParaZerar)}d`
                          : 'estável'}
                    </span>
                  </div>

                  {cap.frentesZerar != null && cap.frentesZerar > 0 && (
                    <p className="mt-1 text-caption font-semibold" style={{ color: cor }}
                       title={`Produtividade medida: ${n(cap.prodFrenteDia)} OS por frente/dia corrido`}>
                      +{cap.frentesZerar} {cap.frentesZerar === 1 ? 'frente' : 'frentes'} para zerar em {horizonte}d
                      {cap.frentesEstabilizar > 0 && (
                        <span className="font-normal text-muted"> · {cap.frentesEstabilizar} só para parar de crescer</span>
                      )}
                    </p>
                  )}
                  {cap.frentesZerar == null && (
                    <p className="mt-1 text-caption text-muted">
                      Sem execuções recentes na cidade — não dá para dimensionar frente
                    </p>
                  )}
                </>
              )}
            </button>
          )
        })}
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
