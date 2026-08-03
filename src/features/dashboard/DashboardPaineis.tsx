import { useMemo } from 'react'
import { Lightning, CheckCircle, MapPin, Clock, Gauge, Target, WarningCircle, Stack, Package, Pulse } from '@phosphor-icons/react'
import type { OSRow, Pulso, ClusterAtivo, CampoSemaforo, PulsoMetaMes, KPI } from '../../lib/types'
import { TrendPill } from '../../components/ui/StatCard'
import { DashboardPanelHeader, SectionLabel } from './DashboardKpiPrimitives'
import type { DashMover, DashFornCard } from './DashboardTypes'

// Faixa de trajetória: o que mudou vs período anterior, ordenado por variação
// relativa. Sem score sintético — cada componente responde por si.
export function MudancasStrip({ mudancas }: { mudancas: DashMover[] }) {
  if (mudancas.length === 0) return null
  const destaque = mudancas[0]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-card border border-border px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-caption font-bold uppercase tracking-[0.07em] text-muted">O que mais mudou</span>
        <span className={`text-label font-semibold tabular-nums ${destaque.melhorou ? 'text-green' : 'text-red'}`}>
          {destaque.label} {destaque.melhorou ? '↑' : '↓'} {Math.abs(destaque.delta)}{destaque.unidade}
        </span>
        <span className="text-caption text-muted">vs período anterior</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        {mudancas.map(m => (
          <span key={m.id}
            className={`inline-flex items-center gap-1 text-caption font-semibold px-2 py-0.5 rounded-full border tabular-nums
                        ${m.melhorou ? 'text-green bg-green/10 border-green/20' : 'text-red bg-red/10 border-red/20'}`}
            title={`${m.label}: ${m.anterior}${m.unidade} → ${m.atual}${m.unidade} (${m.variacao}% de variação)`}>
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
      <WarningCircle size={13} className="text-red flex-shrink-0" />
      <span className="text-label font-bold text-red">Atenção necessária:</span>
      {clustersCount > 0 && (
        <button
          onClick={onScrollClusters}
          className="text-label text-text underline-offset-2 hover:underline hover:text-red transition-colors"
        >
          {clustersCount} cluster{clustersCount !== 1 ? 's' : ''} de falha detectado{clustersCount !== 1 ? 's' : ''}
        </button>
      )}
      {clustersCount > 0 && anomaliasCount > 0 && <span className="text-muted">·</span>}
      {anomaliasCount > 0 && (
        <button
          onClick={onScrollAnomalias}
          className="text-label text-text underline-offset-2 hover:underline hover:text-red transition-colors"
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
      <div className="h-full rounded-lg border border-border border-l-2 border-l-green bg-card p-5">
        <SectionLabel icon={Lightning} color="#4ade80">Clusters de Falha</SectionLabel>
        <div className="flex items-center gap-3 mt-4">
          <CheckCircle size={18} className="text-green flex-shrink-0" />
          <p className="text-body text-green font-semibold">
            Nenhum cluster detectado — sem bairros com 4+ OS de manutenção nas últimas 24h
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full rounded-lg border border-border border-l-2 border-l-red bg-card">
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <SectionLabel icon={Lightning} color="#f87171">Clusters de Falha</SectionLabel>
          <span className="text-caption font-bold uppercase tracking-[0.05em] bg-red/15 text-red
                           border border-red/25 rounded-full px-2.5 py-1">
            ALERTA
          </span>
        </div>

        <p className="text-body font-semibold text-text mb-1">
          {clusters.length} bairro{clusters.length !== 1 ? 's' : ''} com possível problema de infraestrutura
        </p>
        <p className="text-caption text-muted mb-4">4+ OS de manutenção abertas no mesmo bairro nas últimas 24h</p>

        <div className="space-y-2">
          {clusters.map((cl, i) => (
            <div key={i} className="flex items-center gap-3 bg-red/[0.04] border border-red/[0.12]
                                    rounded-lg px-3 py-2.5">
              <MapPin size={11} className="text-red/60 flex-shrink-0" />
              <span className="text-label font-semibold text-text flex-1 truncate">{cl.bairro}</span>
              <span className="text-caption text-muted">{cl.cidade}</span>
              <span className="font-mono text-body font-bold text-red flex-shrink-0">{cl.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AgingPanel({ pulso, filaAtiva, onOpen }: {
  pulso: Pulso
  filaAtiva?: OSRow[]
  onOpen?: (title: string, rows: OSRow[]) => void
}) {
  const { agingDist, backlogDias } = pulso
  const agingTotals = agingDist as unknown as Record<string, number>
  const agingTotal  = Object.values(agingTotals).reduce((s, v) => s + v, 0)

  // Buckets relativos ao SLA de cada OS (aging ÷ limite) — mesma régua do
  // buildDashboard para os cliques baterem com os números. Vermelho = 2× SLA.
  const ratioDe = (r: OSRow) => (r._slaLimite > 0 ? (r._aging ?? 0) / r._slaLimite : (r._aging ?? 0))
  const agingEntries: { key: string; label: string; color: string; hot?: boolean; match: (r: OSRow) => boolean }[] = [
    { key: 'ok',        label: '< 50% SLA', color: 'rgb(34,197,94)',       match: r => ratioDe(r) < 0.5 },
    { key: 'limite',    label: '50–100%',   color: 'rgb(59,130,246)',      match: r => ratioDe(r) >= 0.5 && ratioDe(r) <= 1 },
    { key: 'estourado', label: 'Estourado', color: 'rgb(251,146,60)',      match: r => ratioDe(r) > 1 && ratioDe(r) <= 2 },
    { key: 'critico',   label: '2× SLA',    color: 'rgb(248,113,113)', hot: true, match: r => ratioDe(r) > 2 },
  ]

  if (!agingTotal) return (
    <div className="h-full rounded-lg border border-border bg-card p-5 flex items-center justify-center">
      <p className="text-muted text-label">Sem dados de aging</p>
    </div>
  )

  const criticas = agingTotals['critico'] ?? 0
  const riscoTotal = (agingTotals['estourado'] ?? 0) + criticas
  const abrirBucket = (e: typeof agingEntries[number]) => {
    if (!onOpen || !filaAtiva) return
    onOpen(`SLA ${e.label} — OS na fila`, filaAtiva.filter(r => r._aging != null && e.match(r)))
  }

  return (
    <div className="h-full rounded-lg border border-border bg-card p-5">
      <DashboardPanelHeader
        icon={Clock}
        color="#3b82f6"
        actionLabel={onOpen && filaAtiva ? 'Abrir OS' : undefined}
        meta={(
          <span className="hidden tabular-nums sm:inline">
          {agingTotal} abertas
          {backlogDias != null && <> · ≈ <span className="font-semibold text-text">{backlogDias.toLocaleString('pt-BR')}d</span> de fila</>}
          </span>
        )}
      >
        Fila Ativa — Prazo Consumido
      </DashboardPanelHeader>

      <div className="mt-4 flex items-center justify-between gap-3 text-caption">
        <span className="text-muted">Distribuição da fila</span>
        <span className={`font-semibold tabular-nums ${riscoTotal > 0 ? 'text-orange' : 'text-green'}`}>
          {riscoTotal} em risco
        </span>
      </div>

      <div
        className="mt-2 flex h-3 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border"
        role="img"
        aria-label={`Distribuição de ${agingTotal} OS por consumo do SLA`}
      >
        {agingEntries.map(e => {
          const val = agingTotals[e.key] ?? 0
          const pct = agingTotal > 0 ? val / agingTotal * 100 : 0
          return pct > 0 ? (
            <span key={e.key} data-sla-segment={e.key} style={{ width: `${pct}%`, background: e.color }} aria-hidden="true" />
          ) : null
        })}
      </div>

      <div className="mt-3 space-y-1">
        {agingEntries.map(e => {
          const val = agingTotals[e.key] ?? 0
          const pct = agingTotal > 0 ? Math.round(val / agingTotal * 100) : 0
          return (
            <button key={e.key} type="button" onClick={() => abrirBucket(e)}
                    className="group grid min-h-11 w-full cursor-pointer grid-cols-[88px_minmax(60px,1fr)_36px_34px]
                               items-center gap-2 rounded-md border-0 bg-transparent px-1.5 text-left
                               transition-colors duration-200 hover:bg-elevated focus-visible:outline-none focus-visible:ring-2
                               focus-visible:ring-primary/60 motion-reduce:transition-none"
                    aria-label={`SLA ${e.label}: ${val} OS, ${pct}% da fila. Abrir OS`}
                    title={`${e.label}: ${val} OS (${pct}%) — % do prazo de SLA já consumido · clique para listar`}>
              <span className={`flex items-center gap-2 text-caption font-semibold ${e.hot ? 'text-red' : 'text-secondary'}`}>
                <span className="h-2 w-2 flex-shrink-0 rounded-sm" style={{ background: e.color }} aria-hidden="true" />
                {e.label}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border">
                <span
                  className="block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${pct}%`, background: e.color }}
                  role="progressbar"
                  aria-label={`${e.label}: ${pct}% da fila`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                />
              </span>
              <span className={`text-right text-label font-bold tabular-nums ${e.hot ? 'text-red' : 'text-text'}`}>{val}</span>
              <span className="text-right text-caption text-muted tabular-nums">{pct}%</span>
            </button>
          )
        })}
      </div>

      {criticas > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-caption text-muted">
          <WarningCircle size={11} className="text-red flex-shrink-0" />
          <span><span className="text-red font-semibold tabular-nums">{criticas} OS além de 2× o SLA</span> — priorizar hoje</span>
        </p>
      )}
    </div>
  )
}

// Pareto da fila ativa por tipo de serviço — responde "a fila é feita DE QUÊ?"
// Concentração alta num tipo → decisão de alocação (rede vs frente de campo).
export function ParetoServicoPanel({ filaAtiva, onOpen }: {
  filaAtiva: OSRow[]
  onOpen: (title: string, rows: OSRow[]) => void
}) {
  const grupos = useMemo(() => {
    const map = new Map<string, OSRow[]>()
    for (const r of filaAtiva) {
      const nome = (r.servico || '').trim() || 'Sem descrição'
      const arr = map.get(nome)
      if (arr) arr.push(r)
      else map.set(nome, [r])
    }
    return [...map.entries()]
      .map(([nome, rows]) => ({ nome, rows }))
      .sort((a, b) => b.rows.length - a.rows.length)
  }, [filaAtiva])

  const total = filaAtiva.length
  if (total === 0) {
    return (
      <div className="h-full rounded-lg border border-border bg-card p-5 flex items-center justify-center">
        <p className="text-muted text-label">Fila vazia — sem composição para analisar</p>
      </div>
    )
  }

  const top    = grupos.slice(0, 6)
  const resto  = grupos.slice(6)
  const maxVal = top[0]?.rows.length ?? 1

  return (
    <div className="h-full rounded-lg border border-border bg-card p-5">
      <DashboardPanelHeader
        icon={Stack}
        color="#3b82f6"
        actionLabel="Abrir OS"
      >
        Composição da Fila — Tipo de Serviço
      </DashboardPanelHeader>

      <div className="mt-2">
        {top.map(g => {
          const pct = Math.round(g.rows.length / total * 100)
          return (
            <button key={g.nome} type="button"
                    onClick={() => onOpen(`Fila — ${g.nome}`, g.rows)}
                    aria-label={`${g.nome}: ${g.rows.length} OS, ${pct}% da fila. Abrir OS`}
                    className="w-full grid grid-cols-[minmax(0,1.1fr)_30px_1fr_34px] items-center gap-3 py-2
                               border-b border-border/60 last:border-b-0 bg-transparent border-x-0 border-t-0
                               cursor-pointer group text-left"
                    title={`${g.nome}: ${g.rows.length} OS (${pct}%) — clique para listar`}>
              <span className="text-caption font-semibold text-secondary truncate group-hover:text-text transition-colors">
                {g.nome}
              </span>
              <span className="text-label font-bold text-right tabular-nums">{g.rows.length}</span>
              <div className="h-2 rounded-full bg-surface">
                <div className="h-full rounded-full transition-all duration-700 group-hover:brightness-125"
                     style={{ width: `${Math.round(g.rows.length / maxVal * 100)}%`, background: 'rgba(59,130,246,.75)' }} />
              </div>
              <span className="text-caption text-muted text-right tabular-nums">{pct}%</span>
            </button>
          )
        })}
        {resto.length > 0 && (
          <button type="button"
                  onClick={() => onOpen('Fila — Outros serviços', resto.flatMap(g => g.rows))}
                  className="w-full text-left text-[10.5px] text-muted hover:text-secondary pt-2 bg-transparent border-0 cursor-pointer">
            + {resto.length} outros tipos ({resto.reduce((s, g) => s + g.rows.length, 0)} OS) — ver todas
          </button>
        )}
      </div>
    </div>
  )
}

// Fornecedores — SLA do período em linhas, mesmo padrão visual de Cidades/Pareto
export function FornecedoresPanel({ fornecedores, onOpen }: {
  fornecedores: (DashFornCard & { slaTrend?: KPI['trend'] })[]
  onOpen: (fornecedor: string) => void
}) {
  if (!fornecedores.length) return null
  const maxTotal = Math.max(...fornecedores.map(f => f.total), 1)

  return (
    <div className="h-full rounded-lg border border-border bg-card p-5">
      <DashboardPanelHeader
        icon={Package}
        color="#c4b5fd"
        actionLabel="Abrir OS"
      >
        Fornecedores — SLA do Período
      </DashboardPanelHeader>

      <div className="mt-2">
        {fornecedores.map(f => {
          const tier = f.sla >= 85 ? 'text-green bg-green/10' : f.sla >= 65 ? 'text-yellow bg-yellow/10' : 'text-red bg-red/10'
          return (
            <button key={f.nome}
                 type="button"
                 onClick={() => onOpen(f.nome)}
                 aria-label={`Fornecedor ${f.nome}: ${f.total} OS, SLA ${f.sla}%. Abrir OS`}
                 className="group w-full grid grid-cols-[minmax(0,1.1fr)_30px_1fr_auto] items-center gap-3 py-2 border-b border-border/60 last:border-b-0 border-x-0 border-t-0 bg-transparent text-left cursor-pointer"
                 title={`${f.nome}: ${f.total} OS no período · SLA ${f.sla}% dentro do prazo · ${f.concluidas} concluídas (${f.conclPct ?? '—'}%)`}>
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: f.cor }} />
                <span className="text-caption font-semibold text-secondary truncate transition-colors group-hover:text-text">{f.nome}</span>
              </span>
              <span className="text-label font-bold text-right tabular-nums">{f.total}</span>
              <div className="h-2 rounded-full bg-surface">
                <div className="h-full rounded-full transition-all duration-700"
                     style={{ width: `${Math.round(f.total / maxTotal * 100)}%`, background: f.cor }} />
              </div>
              <span className="flex items-center gap-1.5 justify-end min-w-[76px]">
                <span className={`text-caption font-bold rounded px-1.5 py-0.5 tabular-nums ${tier}`}>{f.sla}%</span>
                {f.slaTrend && <TrendPill trend={f.slaTrend} />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Cidades do Vale — fila, parcela crítica e SLA por município.
// SLA agregado esconde variação local; aqui cada cidade responde por si.
export function CidadesValePanel({ filaAtiva, onOpen }: {
  filaAtiva: OSRow[]
  onOpen: (title: string, rows: OSRow[]) => void
}) {
  const cidades = useMemo(() => {
    const map = new Map<string, { rows: OSRow[]; slaExc: number; criticas: number }>()
    for (const r of filaAtiva) {
      const nome = (r.nomedacidade || 'Sem cidade').trim()
      let e = map.get(nome)
      if (!e) { e = { rows: [], slaExc: 0, criticas: 0 }; map.set(nome, e) }
      e.rows.push(r)
      if (r._slaExcedido || r._slaSemAgend) e.slaExc++
      if (r._slaCritico) e.criticas++
    }
    return [...map.entries()]
      .map(([nome, e]) => ({
        nome, ...e,
        sla: e.rows.length > 0 ? Math.round((e.rows.length - e.slaExc) / e.rows.length * 100) : 100,
      }))
      .sort((a, b) => b.rows.length - a.rows.length)
  }, [filaAtiva])

  if (cidades.length === 0) return null
  const maxFila = Math.max(...cidades.map(c => c.rows.length), 1)

  return (
    <div className="h-full rounded-lg border border-border bg-card p-5">
      <DashboardPanelHeader
        icon={MapPin}
        color="#3b82f6"
        actionLabel="Abrir OS"
      >
        Cidades do Vale — Fila e SLA
      </DashboardPanelHeader>

      <div className="mt-2">
        {cidades.map(c => {
          const slaCls = c.sla >= 90 ? 'text-green bg-green/10'
                       : c.sla >= 75 ? 'text-yellow bg-yellow/10'
                       : 'text-red bg-red/10'
          const wTotal = Math.round(c.rows.length / maxFila * 100)
          const wCrit  = c.rows.length > 0 ? c.criticas / c.rows.length : 0
          return (
            <button key={c.nome} type="button"
                    onClick={() => onOpen(`Fila — ${c.nome}`, c.rows)}
                    aria-label={`${c.nome}: ${c.rows.length} OS, ${c.criticas} críticas, SLA ${c.sla}%. Abrir OS`}
                    className="w-full grid grid-cols-[minmax(0,1.1fr)_30px_1fr_44px] items-center gap-3 py-2
                               border-b border-border/60 last:border-b-0 bg-transparent border-x-0 border-t-0
                               cursor-pointer group text-left"
                    title={`${c.nome}: ${c.rows.length} OS na fila · ${c.criticas} críticas · SLA ${c.sla}% — clique para listar`}>
              <span className="text-caption font-semibold text-secondary truncate group-hover:text-text transition-colors">
                {c.nome}
              </span>
              <span className="text-label font-bold text-right tabular-nums">{c.rows.length}</span>
              <div className="flex h-2 rounded-full bg-surface overflow-hidden" style={{ width: `${wTotal}%`, minWidth: 8 }}>
                {c.criticas > 0 && (
                  <div className="h-full flex-shrink-0" style={{ width: `${wCrit * 100}%`, background: 'rgb(248,113,113)' }} />
                )}
                <div className="h-full flex-1" style={{ background: 'rgba(59,130,246,.75)' }} />
              </div>
              <span className={`text-caption font-bold text-center rounded px-1.5 py-0.5 tabular-nums ${slaCls}`}>
                {c.sla}%
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function RitmoEquipesPanel({ semaforo, onOpen }: {
  semaforo: CampoSemaforo[]
  onOpen: (equipe: string) => void
}) {
  const comRitmo = semaforo.filter(e => e.ritmoHoje != null)

  if (!comRitmo.length) {
    return (
      <div className="h-full rounded-lg border border-border bg-card p-5">
        <SectionLabel icon={Gauge} color="#22d3ee">Ritmo por Equipe — Hoje</SectionLabel>
        <div className="flex items-center justify-center py-8">
          <p className="text-muted text-label">Ainda sem histórico de ritmo para comparar hoje</p>
        </div>
      </div>
    )
  }

  // Maior desvio primeiro (quem mais precisa de atenção), depois maior volume
  const equipes = [...comRitmo]
    .sort((a, b) => {
      const da = Math.abs(a.ritmoHoje!.atual - a.ritmoHoje!.baseline)
      const db = Math.abs(b.ritmoHoje!.atual - b.ritmoHoje!.baseline)
      return db - da || b.ritmoHoje!.atual - a.ritmoHoje!.atual
    })
    .slice(0, 6)
  const escala = Math.max(...equipes.map(e => Math.max(e.ritmoHoje!.atual, e.ritmoHoje!.baseline)), 1) * 1.15

  return (
    <div className="h-full rounded-lg border border-border bg-card p-5">
      <DashboardPanelHeader
        icon={Gauge}
        color="#22d3ee"
        actionLabel="Abrir OS"
      >
        Ritmo por Equipe — Hoje
      </DashboardPanelHeader>

      <div className="mt-2">
        {equipes.map(e => {
          const r      = e.ritmoHoje!
          const abaixo = r.status === 'abaixo'
          return (
            <button key={e.nome}
                 type="button"
                 onClick={() => onOpen(e.nome)}
                 aria-label={`Equipe ${e.nome}: ${r.atual} hoje, baseline ${r.baseline}. Abrir OS`}
                 className="group w-full grid grid-cols-[96px_1fr_58px] items-center gap-3 py-2 border-b border-border/60 last:border-b-0 border-x-0 border-t-0 bg-transparent text-left cursor-pointer"
                 title={`${e.nome}: ${r.atual} hoje · baseline ${r.baseline}`}>
              <span className="text-caption font-semibold text-secondary truncate transition-colors group-hover:text-text">{e.nome}</span>
              <div className="relative h-2 rounded-full bg-surface">
                <div className="absolute -top-[3px] -bottom-[3px] border-l-[1.5px] border-dashed border-muted/60"
                     style={{ left: `${Math.min(100, r.baseline / escala * 100)}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                     style={{
                       width: `${Math.min(100, r.atual / escala * 100)}%`,
                       background: abaixo ? 'rgb(var(--c-orange))' : 'rgb(var(--c-primary))',
                     }} />
              </div>
              <span className="text-label font-bold text-right tabular-nums">
                {r.atual}<span className="text-muted font-medium">/{r.baseline}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}


export function MetaMesCard({ meta }: { meta: PulsoMetaMes }) {
  if (meta.meta === 0) {
    return (
      <div className="h-full rounded-lg border border-border bg-card p-5">
        <SectionLabel icon={Target} color="#94a3b8">Meta do Mês</SectionLabel>
        <p className="text-label text-muted/60 mt-3">
          {meta.concluidas} concluídas até agora · sem execuções suficientes para dimensionar a capacidade
        </p>
      </div>
    )
  }

  const cor = meta.status === 'acima' ? '#4ade80' : meta.status === 'abaixo' ? '#facc15' : '#94a3b8'
  const pct = Math.min(100, meta.pct ?? 0)
  const diasLabel = meta.diasUteisRestantes === 1 ? '1 dia útil restante' : `${meta.diasUteisRestantes} dias úteis restantes`

  return (
    <div className="h-full rounded-lg border border-border bg-card p-5" style={{ borderLeft: `2px solid ${cor}` }}>
      <div className="mb-3">
        <DashboardPanelHeader icon={Target} color={cor} meta={diasLabel}>
          Meta do Mês
        </DashboardPanelHeader>
      </div>

      <div className="flex items-end gap-3 mb-2">
        <span className="font-mono font-black leading-none" style={{ fontSize: '32px', color: cor }}>
          {meta.pct}%
        </span>
        <span className="text-label text-muted mb-1">
          {meta.concluidas} concluídas · meta {meta.meta}
        </span>
      </div>

      <div className="h-2 bg-surface rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
             style={{ width: `${pct}%`, background: cor }} />
      </div>

      {/* Meta sem lastro vira número de enfeite: mostra de onde ela sai */}
      {meta.frentes > 0 && (
        <p className="mt-2 text-caption text-muted/70 tabular-nums"
           title="Capacidade instalada: frentes que executaram OS nos últimos 7 dias × mediana de OS por frente/dia (60 dias) × dias úteis do mês">
          {meta.frentes} frentes × {meta.prodFrenteDia.toLocaleString('pt-BR')} OS/frente/dia × {meta.diasUteisTotal} dias úteis
        </p>
      )}

      {meta.projecaoFinal != null && (
        <p className="mt-2.5 text-caption" style={{ color: cor }}>
          {meta.status === 'acima' ? '↑ No ritmo atual' : meta.status === 'abaixo' ? '↓ No ritmo atual' : 'No ritmo atual'}:
          {' '}projeção de <strong>{meta.projecaoFinal}</strong> até o fim do mês
          {meta.status === 'abaixo' ? ' — abaixo da meta' : meta.status === 'acima' ? ' — acima da meta' : ''}
        </p>
      )}
    </div>
  )
}

// Qualidade do período — indicadores que antes viviam sempre-visíveis no Hero
// (SLA/MTTR/Aging/Revisitas). Mesmo cálculo, agora como painel de Nível 5.
export function QualidadePeriodoCard({ pulso, taxaRevisitas }: { pulso: Pulso; taxaRevisitas?: number | null }) {
  const { slaFila, slaAtingimento, mttr, mttrP90, agingMed, semAgendamento } = pulso

  type MiniStat = { label: string; value: string; sub?: string; hint?: string; warn: boolean; danger: boolean }
  const stats: MiniStat[] = [
    { label: 'SLA da Fila',  value: `${slaFila}%`, hint: 'Estoque: % da fila atual ainda dentro do prazo',
      warn: slaFila < 90, danger: slaFila < 75 },
    { label: 'SLA Atendido', value: slaAtingimento != null ? `${slaAtingimento}%` : '—',
      sub: 'das concluídas', hint: 'Fluxo: % das OS concluídas no período entregues dentro do SLA',
      warn: slaAtingimento != null && slaAtingimento < 90, danger: slaAtingimento != null && slaAtingimento < 75 },
    { label: 'MTTR',         value: mttr > 0 ? `${mttr.toLocaleString('pt-BR')}d` : '—',
      sub: mttrP90 > 0 ? `P90 ${mttrP90.toLocaleString('pt-BR')}d` : undefined,
      hint: 'Mediana do tempo abertura → baixa das concluídas · P90 = cauda',
      warn: mttr > 2, danger: mttr > 5 },
    { label: 'Aging Médio',  value: agingMed > 0 ? `${agingMed.toLocaleString('pt-BR')}d` : '—',
      warn: agingMed > 3, danger: agingMed > 7 },
    { label: 'Sem Agend.',   value: String(semAgendamento),
      warn: semAgendamento > 5, danger: semAgendamento > 20 },
    { label: 'Revisitas',    value: taxaRevisitas != null ? `${taxaRevisitas.toLocaleString('pt-BR')}%` : '—',
      sub: 'reincidência', hint: 'Clientes com nova manutenção no mesmo mês — retrabalho',
      warn: taxaRevisitas != null && taxaRevisitas > 8, danger: taxaRevisitas != null && taxaRevisitas > 15 },
  ]

  return (
    <div className="h-full rounded-lg border border-border bg-card p-5">
      <SectionLabel icon={Pulse} color="#a78bfa">Qualidade do Período</SectionLabel>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
        {stats.map(s => (
          <div key={s.label} title={s.hint}
               className="flex flex-col border border-border rounded-md bg-bg/40 px-3 py-2">
            <p className="text-caption font-semibold uppercase tracking-[0.04em] text-muted">{s.label}</p>
            <p className={`font-bold text-[18px] leading-none tabular-nums tracking-tight mt-1
                           ${s.danger ? 'text-red' : s.warn ? 'text-yellow' : 'text-text'}`}>
              {s.value}
            </p>
            {s.sub && <p className="text-caption text-muted/70 mt-0.5 leading-none">{s.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
