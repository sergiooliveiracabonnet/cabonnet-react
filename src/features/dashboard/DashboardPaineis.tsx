import {
  TrendingUp, TrendingDown, ArrowUpRight, Zap, CheckCircle2, MapPin, Clock, Gauge, Target, AlertCircle,
} from 'lucide-react'
import type { OSRow, Pulso, ClusterAtivo, CampoSemaforo, PulsoMetaMes } from '../../lib/types'
import { SectionLabel } from './DashboardKpiPrimitives'
import type { ProjecaoRisco, ScoreTendencia, DashMover } from './DashboardTypes'

// Painel preditivo: OS que vão estourar o SLA nas próximas 24-48h (clicável → drill-down)
export function ProjecaoRiscoPanel({ proj, criticasAgora, onOpen }: {
  proj: ProjecaoRisco; criticasAgora: number; onOpen: (rows: OSRow[]) => void
}) {
  if (proj.proj24h === 0 && proj.proj48h === 0) return null
  const totalProj = proj.proj24h + proj.proj48h
  return (
    <button
      onClick={() => onOpen(proj.amostra)}
      className="w-full flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md bg-card border-l-2 border-l-orange border border-border
                 px-4 py-2.5 text-left hover:border-muted/40 transition-colors duration-fast"
    >
      <div className="flex items-center gap-2">
        <TrendingUp size={14} className="text-orange" />
        <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Projeção de risco</span>
      </div>
      <span className="text-[12px] text-secondary">
        <span className="font-semibold text-text tabular-nums">{criticasAgora}</span> críticas agora
        {' · '}<span className="font-semibold text-orange tabular-nums">+{proj.proj24h}</span> em ≤24h
        {' · '}<span className="font-semibold text-yellow tabular-nums">+{proj.proj48h}</span> em ≤48h
      </span>
      <span className="sm:ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-orange">
        {totalProj} em risco — ver OS <ArrowUpRight size={12} />
      </span>
    </button>
  )
}

// Faixa de trajetória: Δ do score do período + os fatores que mais mexeram nele
export function MudancasStrip({ tendencia, mudancas }: { tendencia: ScoreTendencia; mudancas: DashMover[] }) {
  if (tendencia.delta == null || mudancas.length === 0) return null
  const up   = tendencia.delta > 0
  const flat = tendencia.delta === 0
  const cor  = flat ? '#94a3b8' : up ? '#4ade80' : '#f87171'
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-card border border-border px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Tendência</span>
        <span className="text-[12px] font-semibold tabular-nums" style={{ color: cor }}>
          {flat ? '— estável' : `${up ? '↑' : '↓'} ${up ? '+' : ''}${tendencia.delta} pts`}
        </span>
        <span className="text-[10px] text-muted">vs período anterior · score do período {tendencia.atual}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <span className="text-[10px] text-muted">O que mudou:</span>
        {mudancas.map(m => (
          <span key={m.id}
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border tabular-nums
                        ${m.melhorou ? 'text-green bg-green/10 border-green/20' : 'text-red bg-red/10 border-red/20'}`}
            title={`${m.label}: ${m.anterior}${m.unidade} → ${m.atual}${m.unidade}`}>
            {m.melhorou ? '↑' : '↓'} {m.label} {m.atual}{m.unidade}
          </span>
        ))}
      </div>
    </div>
  )
}

export function AlertaTopoBanner({ clustersCount, anomaliasCount, onScrollClusters, onScrollAnomalias }: {
  clustersCount: number; anomaliasCount: number
  onScrollClusters?: () => void; onScrollAnomalias?: () => void
}) {
  if (!clustersCount && !anomaliasCount) return null
  return (
    <div className="flex items-center gap-3 flex-wrap rounded-xl border border-red/25 bg-red/[0.06] px-4 py-2.5">
      <AlertCircle size={13} className="text-red flex-shrink-0" />
      <span className="text-[12px] font-bold text-red">Atenção necessária:</span>
      {clustersCount > 0 && (
        <button
          onClick={onScrollClusters}
          className="text-[12px] text-text underline-offset-2 hover:underline hover:text-red transition-colors"
        >
          {clustersCount} cluster{clustersCount !== 1 ? 's' : ''} de falha detectado{clustersCount !== 1 ? 's' : ''}
        </button>
      )}
      {clustersCount > 0 && anomaliasCount > 0 && <span className="text-muted">·</span>}
      {anomaliasCount > 0 && (
        <button
          onClick={onScrollAnomalias}
          className="text-[12px] text-text underline-offset-2 hover:underline hover:text-red transition-colors"
        >
          {anomaliasCount} anomalia{anomaliasCount !== 1 ? 's' : ''} detectada{anomaliasCount !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}

export function ClustersBairroPanel({ clusters }: { clusters: ClusterAtivo[] }) {
  if (!clusters?.length) {
    return (
      <div className="rounded-lg border border-border border-l-2 border-l-green bg-card p-5">
        <SectionLabel icon={Zap} color="#4ade80">Clusters de Falha</SectionLabel>
        <div className="flex items-center gap-3 mt-4">
          <CheckCircle2 size={18} className="text-green flex-shrink-0" />
          <p className="text-[13px] text-green font-semibold">
            Nenhum cluster detectado — sem bairros com 4+ OS nas últimas 24h
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border border-l-2 border-l-red bg-card">
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <SectionLabel icon={Zap} color="#f87171">Clusters de Falha</SectionLabel>
          <span className="text-[10px] font-bold uppercase tracking-[0.05em] bg-red/15 text-red
                           border border-red/25 rounded-full px-2.5 py-1">
            ALERTA
          </span>
        </div>

        <p className="text-[13px] font-semibold text-text mb-1">
          {clusters.length} bairro{clusters.length !== 1 ? 's' : ''} com possível problema de infraestrutura
        </p>
        <p className="text-[11px] text-muted mb-4">4+ OS abertas no mesmo bairro nas últimas 24h</p>

        <div className="space-y-2">
          {clusters.map((cl, i) => (
            <div key={i} className="flex items-center gap-3 bg-red/[0.04] border border-red/[0.12]
                                    rounded-lg px-3 py-2.5">
              <MapPin size={11} className="text-red/60 flex-shrink-0" />
              <span className="text-[12px] font-semibold text-text flex-1 truncate">{cl.bairro}</span>
              <span className="text-[11px] text-muted">{cl.cidade}</span>
              <span className="font-mono text-[13px] font-bold text-red flex-shrink-0">{cl.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AgingPanel({ pulso }: { pulso: Pulso }) {
  const { agingDist } = pulso
  const agingTotals = agingDist as unknown as Record<string, number>
  const agingTotal  = Object.values(agingTotals).reduce((s, v) => s + v, 0)

  const agingEntries: { key: string; label: string; color: string }[] = [
    { key: '≤1d',  label: '≤ 1 dia',  color: '#4ade80' },
    { key: '2-3d', label: '2–3 dias', color: '#facc15' },
    { key: '4-7d', label: '4–7 dias', color: '#f97316' },
    { key: '8+d',  label: '8+ dias',  color: '#f87171' },
  ]

  if (!agingTotal) return (
    <div className="rounded-lg border border-border bg-card p-5 flex items-center justify-center">
      <p className="text-muted text-[12px]">Sem dados de aging</p>
    </div>
  )

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <SectionLabel icon={Clock} color="#3b82f6">Aging da Fila Ativa</SectionLabel>

      <div className="mt-4 space-y-3">
        {agingEntries.map(e => {
          const val = agingTotals[e.key] ?? 0
          const pct = agingTotal > 0 ? Math.round(val / agingTotal * 100) : 0
          return (
            <div key={e.key} className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: e.color }} />
              <span className="text-[11px] text-muted w-14 flex-shrink-0">{e.label}</span>
              <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                     style={{ width: `${pct}%`, background: e.color }} />
              </div>
              <span className="font-mono text-[12px] text-text font-semibold w-6 text-right flex-shrink-0">
                {val}
              </span>
              <span className="font-mono text-[10px] text-muted w-8 text-right flex-shrink-0">
                {pct}%
              </span>
            </div>
          )
        })}
      </div>

      {/* Stacked bar total */}
      <div className="mt-4 flex h-1.5 rounded-full overflow-hidden bg-surface/30">
        {agingEntries.map(e => {
          const val = agingTotals[e.key] ?? 0
          const pct = agingTotal > 0 ? Math.round(val / agingTotal * 100) : 0
          return pct > 0 ? (
            <div key={e.key} className="h-full" style={{ width: `${pct}%`, background: e.color }} />
          ) : null
        })}
      </div>
    </div>
  )
}

export function RitmoEquipesPanel({ semaforo }: { semaforo: CampoSemaforo[] }) {
  const comRitmo = semaforo.filter(e => e.ritmoHoje != null)
  const abaixo = comRitmo
    .filter(e => e.ritmoHoje!.status === 'abaixo')
    .sort((a, b) => (b.ritmoHoje!.baseline - b.ritmoHoje!.atual) - (a.ritmoHoje!.baseline - a.ritmoHoje!.atual))
    .slice(0, 3)
  const acima = comRitmo
    .filter(e => e.ritmoHoje!.status === 'acima')
    .sort((a, b) => (b.ritmoHoje!.atual - b.ritmoHoje!.baseline) - (a.ritmoHoje!.atual - a.ritmoHoje!.baseline))
    .slice(0, 3)

  if (!comRitmo.length) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-card p-5">
        <SectionLabel icon={Gauge} color="#22d3ee">Ritmo por Equipe — Hoje</SectionLabel>
        <div className="flex items-center justify-center py-8">
          <p className="text-muted text-[12px]">Ainda sem histórico de ritmo para comparar hoje</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <SectionLabel icon={Gauge} color="#22d3ee">Ritmo por Equipe — Hoje</SectionLabel>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-yellow/80 mb-2 flex items-center gap-1">
            <TrendingDown size={10} /> Abaixo do ritmo
          </p>
          {abaixo.length === 0 ? (
            <p className="text-[11px] text-muted/50">Nenhuma equipe abaixo da média</p>
          ) : (
            <div className="space-y-1.5">
              {abaixo.map(e => (
                <div key={e.nome} className="flex items-center justify-between text-[11px] gap-2">
                  <span className="text-text font-semibold truncate">{e.nome}</span>
                  <span className="font-mono text-yellow flex-shrink-0">
                    {e.ritmoHoje!.atual}/{e.ritmoHoje!.baseline}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-green/80 mb-2 flex items-center gap-1">
            <TrendingUp size={10} /> Acima do ritmo
          </p>
          {acima.length === 0 ? (
            <p className="text-[11px] text-muted/50">Nenhuma equipe acima da média</p>
          ) : (
            <div className="space-y-1.5">
              {acima.map(e => (
                <div key={e.nome} className="flex items-center justify-between text-[11px] gap-2">
                  <span className="text-text font-semibold truncate">{e.nome}</span>
                  <span className="font-mono text-green flex-shrink-0">
                    {e.ritmoHoje!.atual}/{e.ritmoHoje!.baseline}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function CidadesPanel({ cidades }: { cidades: { cidade: string; count: number }[] }) {
  const max = Math.max(...cidades.map(c => c.count), 1)
  return (
    <div className="rounded-lg border border-border border-l-2 border-l-red bg-card p-5">
      <SectionLabel icon={MapPin} color="#f87171">Top Cidades — OS Críticas</SectionLabel>
      <div className="mt-4 space-y-2.5">
        {cidades.map(c => (
          <div key={c.cidade} className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-text w-28 flex-shrink-0 truncate">{c.cidade}</span>
            <div className="flex-1 h-2 bg-surface/40 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                   style={{ width: `${Math.round(c.count / max * 100)}%`, background: '#f87171' }} />
            </div>
            <span className="font-mono text-[13px] font-bold text-red w-6 text-right flex-shrink-0">{c.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MetaMesCard({ meta }: { meta: PulsoMetaMes }) {
  if (meta.meta === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2.5">
          <Target size={14} className="text-muted" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-secondary">Meta do Mês</span>
        </div>
        <p className="text-[12px] text-muted/60 mt-3">
          {meta.concluidas} concluídas até agora · sem histórico dos 3 meses anteriores para definir uma meta
        </p>
      </div>
    )
  }

  const cor = meta.status === 'acima' ? '#4ade80' : meta.status === 'abaixo' ? '#facc15' : '#94a3b8'
  const pct = Math.min(100, meta.pct ?? 0)
  const diasLabel = meta.diasUteisRestantes === 1 ? '1 dia útil restante' : `${meta.diasUteisRestantes} dias úteis restantes`

  return (
    <div className="rounded-lg border border-border bg-card p-5" style={{ borderLeft: `2px solid ${cor}` }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <Target size={14} style={{ color: cor }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-secondary">Meta do Mês</span>
        </div>
        <span className="text-[11px] text-muted">{diasLabel}</span>
      </div>

      <div className="flex items-end gap-3 mb-2">
        <span className="font-mono font-black leading-none" style={{ fontSize: '32px', color: cor }}>
          {meta.pct}%
        </span>
        <span className="text-[12px] text-muted mb-1">
          {meta.concluidas} concluídas · meta ~{meta.meta} (média 3 meses)
        </span>
      </div>

      <div className="h-2 bg-surface rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
             style={{ width: `${pct}%`, background: cor }} />
      </div>

      {meta.projecaoFinal != null && (
        <p className="mt-2.5 text-[11px]" style={{ color: cor }}>
          {meta.status === 'acima' ? '↑ No ritmo atual' : meta.status === 'abaixo' ? '↓ No ritmo atual' : 'No ritmo atual'}:
          {' '}projeção de <strong>{meta.projecaoFinal}</strong> até o fim do mês
          {meta.status === 'abaixo' ? ' — abaixo da meta' : meta.status === 'acima' ? ' — acima da meta' : ''}
        </p>
      )}
    </div>
  )
}
