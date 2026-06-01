import { useMemo, type ComponentType, type ReactNode } from 'react'
import { AlertTriangle, Users, MapPin } from 'lucide-react'
import { useOSDerived } from '../../../contexts/OSDataContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionLabel({ icon: Icon, color, children }: {
  icon: ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>
  color: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ background: color }} />
      <Icon size={12} style={{ color }} className="flex-shrink-0" />
      <span className="text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color }}>{children}</span>
    </div>
  )
}

function taxaColor(taxa: number): string {
  if (taxa >= 25) return '#f87171'
  if (taxa >= 15) return '#f97316'
  if (taxa >= 8)  return '#facc15'
  return '#4ade80'
}

function taxaLabel(taxa: number): string {
  if (taxa >= 25) return 'Crítico'
  if (taxa >= 15) return 'Alto'
  if (taxa >= 8)  return 'Médio'
  return 'OK'
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// ─── EquipeRow ────────────────────────────────────────────────────────────────

interface EqRow { equipe: string; total: number; taxa: number; revInst?: number; revManut?: number; totalBase?: number }

function EquipeRow({ rank, eq }: { rank: number; eq: EqRow }) {
  const color = taxaColor(eq.taxa)

  return (
    <tr className="border-b border-white/[0.04] hover:bg-surface/20 transition-colors">
      <td className="px-4 py-3 w-10">
        {rank <= 3 ? (
          <span className="font-mono font-black text-[13px]"
                style={{ color: ['#f87171','#f97316','#facc15'][rank-1] }}>#{rank}</span>
        ) : (
          <span className="font-mono text-[12px] text-muted">{rank}</span>
        )}
      </td>
      <td className="px-3 py-3">
        <p className="text-[12px] font-semibold text-text truncate max-w-[160px]">{eq.equipe}</p>
      </td>
      <td className="px-3 py-3 text-right">
        <p className="font-mono font-bold text-[18px] leading-none" style={{ color }}>{eq.total}</p>
        <p className="text-[9px] text-muted mt-0.5">revisitas</p>
      </td>
      <td className="px-3 py-3 text-right">
        <p className="font-mono font-bold text-[18px] leading-none" style={{ color }}>{eq.taxa}%</p>
        <div className="mt-1 h-1 w-14 ml-auto bg-surface/40 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, eq.taxa * 3)}%`, background: color }} />
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{ background: `${color}12`, borderColor: `${color}30`, color }}>
          {taxaLabel(eq.taxa)}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        <p className="text-[11px] text-muted">{eq.revInst}</p>
      </td>
      <td className="px-3 py-3 text-right">
        <p className="text-[11px] text-muted">{eq.revManut}</p>
      </td>
      <td className="px-3 py-3 text-right">
        <p className="text-[11px] text-muted">{eq.totalBase}</p>
      </td>
    </tr>
  )
}

// ─── QualidadePage ────────────────────────────────────────────────────────────

export default function QualidadePage() {
  const { derived, isLoading } = useOSDerived()
  const rev = derived?.revisitas

  const cronicos = useMemo(
    () => (rev?.cronicos ?? []).sort((a, b) => ((b as unknown as { count: number }).count ?? 0) - ((a as unknown as { count: number }).count ?? 0)).slice(0, 20),
    [rev]
  )

  const porCidade = useMemo(
    () => (rev?.porCidade ?? []).slice(0, 8),
    [rev]
  )

  if (isLoading || !rev) return (
    <div className="flex items-center justify-center py-24 gap-3 text-secondary text-sm">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      Carregando…
    </div>
  )

  const { taxa, totalRevisitas, revInst, revManut, revServ,
          custoEstimado, evitaveis, tempoMedio,
          tendencia, porEquipe } = rev


  return (
    <div className="space-y-4 max-w-[1600px]">

      {/* Header */}
      <div>
        <h1 className="text-[20px] font-headline font-bold text-text mb-0.5">Painel de Qualidade</h1>
        <p className="text-[12px] text-muted">
          Taxa de revisitas por equipe · clientes crônicos · impacto financeiro estimado
        </p>
      </div>

      {/* KPI hero row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Revisitas no período',
            value: totalRevisitas,
            sub: `Inst: ${revInst} · Manut: ${revManut} · Serv: ${revServ}`,
            color: totalRevisitas > 0 ? '#f97316' : '#4ade80',
          },
          {
            label: 'Taxa geral',
            value: `${taxa?.geral ?? 0}%`,
            sub: tendencia?.delta != null
              ? `${tendencia.delta > 0 ? '▲' : tendencia.delta < 0 ? '▼' : '–'} ${Math.abs(tendencia.delta)}% vs período anterior`
              : 'do total de OS',
            color: taxaColor(taxa?.geral ?? 0),
          },
          {
            label: 'Custo estimado',
            value: fmtBRL(custoEstimado ?? 0),
            sub: `R$180/revisita estimado · ${evitaveis?.pct ?? 0}% evitáveis`,
            color: '#c4b5fd',
          },
          {
            label: 'Tempo médio retorno',
            value: `${tempoMedio ?? 0}d`,
            sub: 'dias entre OS e revisita do cliente',
            color: '#22d3ee',
          },
        ].map((k, i) => (
          <div key={i}
               className="relative overflow-hidden rounded-xl border bg-card animate-card-enter"
               style={{ borderColor: `${k.color}22`, animationDelay: `${i * 60}ms` }}>
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: k.color }} />
            <div className="p-4">
              <p className="text-[11px] text-muted mb-2">{k.label}</p>
              <p className="font-mono font-black tabular-nums text-[28px] leading-none"
                 style={{ color: k.color }}>{k.value}</p>
              <p className="text-[10px] text-muted mt-1">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Taxa por tipo */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Taxa Instalação', value: taxa?.inst ?? 0, color: '#3b82f6', desc: 'clientes com revisita após inst.' },
          { label: 'Taxa Manutenção', value: taxa?.manut ?? 0, color: '#f97316', desc: 'clientes com 2ª manut. no mês' },
          { label: 'Taxa Serviço',   value: taxa?.serv ?? 0, color: '#c4b5fd', desc: 'clientes com serv. + manut.' },
        ].map((t, i) => {
          const cl = taxaColor(t.value)
          return (
            <div key={i}
                 className="relative overflow-hidden rounded-xl border bg-card animate-card-enter"
                 style={{ borderColor: `${cl}22`, animationDelay: `${240 + i * 60}ms` }}>
              <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: cl }} />
              <div className="p-4">
                <p className="text-[11px] text-muted mb-2">{t.label}</p>
                <p className="font-mono font-black text-[32px] leading-none tabular-nums"
                   style={{ color: cl }}>{t.value}%</p>
                <div className="mt-2 h-1.5 bg-surface/40 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                       style={{ width: `${Math.min(100, t.value * 3)}%`, background: cl }} />
                </div>
                <p className="text-[10px] text-muted mt-1">{t.desc}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Revisitas por equipe */}
      {porEquipe?.length > 0 && (
        <section className="space-y-2">
          <SectionLabel icon={Users} color="#f97316">Ranking — Revisitas por Equipe</SectionLabel>
          <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.05] bg-surface/10">
                    {['#','Equipe','Revisitas','Taxa','Status','Rev. Inst','Rev. Manut','Base'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-right first:text-left text-[10px]
                                              font-bold uppercase tracking-[0.05em] text-muted first:px-4">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porEquipe.map((eq, i) => (
                    <EquipeRow key={eq.equipe} rank={i + 1} eq={eq} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Cidades + Crônicos — lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Por cidade */}
        {porCidade.length > 0 && (
          <section className="space-y-2">
            <SectionLabel icon={MapPin} color="#22d3ee">Revisitas por Cidade</SectionLabel>
            <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
              <div className="divide-y divide-white/[0.04]">
                {(porCidade as unknown as { cidade: string; taxa: number; revisitas?: number; total?: number }[]).map(c => {
                  const cl   = taxaColor(c.taxa)
                  const rev  = c.revisitas ?? c.total ?? 0
                  const maxR = (porCidade[0] as unknown as { revisitas?: number; total?: number })?.revisitas ??
                               (porCidade[0] as unknown as { revisitas?: number; total?: number })?.total ?? 1
                  return (
                    <div key={c.cidade} className="flex items-center gap-3 px-4 py-3 hover:bg-surface/20 transition-colors">
                      <MapPin size={10} className="text-muted flex-shrink-0" />
                      <span className="text-[12px] font-semibold text-text w-32 flex-shrink-0 truncate">{c.cidade}</span>
                      <div className="flex-1 h-1.5 bg-surface/40 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.round(rev/maxR*100)}%`, background: cl }} />
                      </div>
                      <span className="font-mono font-bold text-[13px] w-8 text-right flex-shrink-0" style={{ color: cl }}>{rev}</span>
                      <span className="text-[10px] text-muted w-10 text-right flex-shrink-0">{c.taxa}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* Clientes crônicos */}
        {cronicos.length > 0 && (
          <section className="space-y-2">
            <SectionLabel icon={AlertTriangle} color="#f87171">
              Clientes Crônicos — {cronicos.length} com 3+ OS
            </SectionLabel>
            <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
              <div className="grid grid-cols-[1fr_48px_48px] gap-2 px-4 py-2
                              bg-surface/20 border-b border-white/[0.05]
                              text-[10px] font-bold uppercase tracking-[0.05em] text-muted">
                <span>Cliente</span>
                <span className="text-right">OS</span>
                <span className="text-right">Rev.</span>
              </div>
              <div className="divide-y divide-white/[0.04] max-h-72 overflow-y-auto">
                {(cronicos as unknown as { cliente?: string; nome?: string; count: number; revisitas?: number }[]).map(c => {
                  const danger = c.count >= 5 || (c.revisitas ?? 0) >= 2
                  const color  = danger ? '#f87171' : c.count >= 4 ? '#f97316' : '#facc15'
                  return (
                    <div key={c.cliente ?? c.nome}
                         className="grid grid-cols-[1fr_48px_48px] gap-2 px-4 py-2.5
                                    hover:bg-surface/20 transition-colors items-center">
                      <p className="text-[11.5px] font-medium text-text truncate">{c.cliente ?? c.nome}</p>
                      <p className="font-mono font-bold text-[13px] text-right" style={{ color }}>{c.count}</p>
                      <p className="font-mono text-[12px] text-right text-muted">{c.revisitas ?? '—'}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Nota metodológica */}
      <div className="rounded-xl border border-white/[0.08] bg-surface/20 px-4 py-3">
        <p className="text-[10px] text-muted/70 leading-relaxed">
          <strong className="text-muted">Metodologia:</strong> Revisita = cliente que teve instalação + manutenção no mesmo mês, ou 2+ manutenções no mesmo mês.
          Custo estimado de R$180/revisita (deslocamento + hora técnica). Taxa calculada sobre pares únicos cliente×mês.
          Crônicos = clientes com 3+ OS no período selecionado.
        </p>
      </div>
    </div>
  )
}
