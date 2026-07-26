import { useState } from 'react'
import { Activity, Sparkles, Zap } from 'lucide-react'
import { GaugeChart } from '../../components/ui/GaugeChart'
import type { Pulso } from '../../lib/types'
import type { AINarrativeResult } from '../../hooks/useAINarrative'
import type { ScoreTendencia } from './DashboardTypes'
import type { FluxoEvolucao } from './FluxoOSPanel'

export interface AnomaliaContextType {
  total: number
  sla_pct: number
  criticas: number
  aging_med: number
}

interface FlowMetricProps {
  title: string
  mobileTitle: string
  value: string | number
  sub?: string
  tone?: 'neutral' | 'ok' | 'warning'
}

function FlowMetric({ title, mobileTitle, value, sub, tone = 'neutral' }: FlowMetricProps) {
  const valueClass = tone === 'ok' ? 'text-green' : tone === 'warning' ? 'text-orange' : 'text-text'

  return (
    <div className="min-w-0 rounded-md border border-white/[0.06] bg-bg/35 px-3 py-2.5">
      <p className="truncate text-caption font-semibold text-muted">
        <span className="sm:hidden">{mobileTitle}</span>
        <span className="hidden sm:inline">{title}</span>
      </p>
      <p className={`mt-1 text-title font-black tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-caption text-muted">{sub}</p>}
    </div>
  )
}

export function PulsoHero({ pulso, aiData, isLoadingAI, onRequestAI, target, tendencia, evolucao }: {
  pulso: Pulso
  aiData: AINarrativeResult | null | undefined
  isLoadingAI: boolean
  onRequestAI?: (obs: string) => void
  target?: number
  tendencia?: ScoreTendencia
  evolucao: FluxoEvolucao
}) {
  const [draftObs, setDraftObs] = useState('')
  const [showAIComposer, setShowAIComposer] = useState(false)
  const [showReanalysis, setShowReanalysis] = useState(false)

  // A tendência completa vive em FluxoOSPanel. Aqui mostramos só o estado corrente.
  void evolucao

  const {
    score = 0,
    scoreLabel = '—',
    scoreBreakdown = [],
    narrativa = '',
    quickInsights = [],
    entradasHoje = 0,
    saidasHoje = 0,
    fluxoHoje = 0,
    entradaMediaDia = 0,
    metaMes = {
      concluidas: 0,
      meta: 0,
      pct: null,
      diasUteisRestantes: 0,
      diasUteisTotal: 0,
      projecaoFinal: null,
      status: 'neutro' as const,
    },
  } = pulso

  const scoreColor = score >= 85 ? '#4ade80' : score >= 65 ? '#facc15' : '#f87171'
  const weakestId = scoreBreakdown.length > 0
    ? [...scoreBreakdown].sort((a, b) => a.value - b.value)[0].id
    : null
  const projecaoOk = metaMes.projecaoFinal != null && metaMes.meta > 0 && metaMes.projecaoFinal >= metaMes.meta

  type DisplayInsight = { level: string; text: string; ai?: boolean }
  const displayInsights: DisplayInsight[] = aiData?.insights?.length
    ? aiData.insights.map(text => ({ level: 'cyan', text, ai: true }))
    : quickInsights

  const insightClasses: Record<string, string> = {
    red: 'border-red/25 bg-red/10 text-red',
    orange: 'border-orange/25 bg-orange/10 text-orange',
    yellow: 'border-yellow/25 bg-yellow/10 text-yellow',
    green: 'border-green/25 bg-green/10 text-green',
    cyan: 'border-cyan/25 bg-cyan/10 text-cyan',
  }

  return (
    <section
      aria-labelledby="dashboard-pulse-title"
      className="h-full rounded-lg border border-border bg-card"
      style={{ borderLeft: `2px solid ${scoreColor}` }}
    >
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/[0.07] text-primary">
            <Activity size={14} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="dashboard-pulse-title" className="text-body font-bold text-text">Pulso operacional</h2>
            <p className="text-caption text-muted">Leitura consolidada do período</p>
          </div>
        </div>
        <span
          className="rounded-full border px-2.5 py-1 text-caption font-bold tabular-nums"
          style={{ color: scoreColor, borderColor: `${scoreColor}33`, background: `${scoreColor}0d` }}
        >
          {scoreLabel}
        </span>
      </header>

      <div className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-[84px_minmax(0,1fr)] items-start gap-3 sm:gap-4">
          <div className="group relative flex flex-col items-center gap-1">
            <div
              role="button"
              tabIndex={scoreBreakdown.length > 0 ? 0 : undefined}
              aria-label="Detalhar composição do score"
              aria-describedby={scoreBreakdown.length > 0 ? 'score-breakdown-popover' : undefined}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <GaugeChart value={score} target={target} color={scoreColor} label={scoreLabel} size={84} />
            </div>
            {tendencia?.delta != null && tendencia.delta !== 0 && (
              <dl
                data-testid="score-periodo-anterior"
                className="mt-0.5 w-full border-t border-white/[0.07] pt-1 text-center tabular-nums"
                title={`Score do período anterior: ${tendencia.anterior}`}
              >
                <dt className="text-[9px] font-semibold uppercase leading-none tracking-[0.06em] text-muted">
                  Anterior
                </dt>
                <dd className="mt-1 flex items-baseline justify-center gap-1 whitespace-nowrap leading-none">
                  <span className="font-mono text-label font-bold text-secondary">
                    {tendencia.anterior ?? '—'}
                  </span>
                  <span className={`text-caption font-bold ${
                    tendencia.delta > 0 ? 'text-green' : 'text-red'
                  }`}>
                    {tendencia.delta > 0 ? '↑' : '↓'} {tendencia.delta > 0 ? '+' : ''}{tendencia.delta}
                  </span>
                </dd>
              </dl>
            )}

            {scoreBreakdown.length > 0 && (
              <div
                id="score-breakdown-popover"
                role="tooltip"
                className="absolute left-1/2 top-full z-20 mt-2 hidden w-[160px] -translate-x-1/2 flex-col gap-2 rounded-lg border border-border bg-elevated p-3 shadow-xl group-hover:flex group-focus-within:flex"
              >
                {scoreBreakdown.map(item => {
                  const isWeakest = item.id === weakestId
                  const color = item.value >= 85 ? '#4ade80' : item.value >= 65 ? '#facc15' : '#f87171'

                  return (
                    <div key={item.id}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className={`text-caption ${isWeakest ? 'font-bold text-text' : 'text-muted'}`}>
                          {item.label}{isWeakest ? ' · menor' : ''}
                        </span>
                        <span className="text-caption font-mono font-semibold" style={{ color }}>{item.value}</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-surface/40">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(100, Math.max(0, item.value))}%`, background: color }}
                        />
                      </div>
                    </div>
                  )
                })}
                <span className="text-caption leading-tight text-muted/70">Peso: SLA 45% · Taxa 35% · MTTR 20%</span>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-caption font-bold uppercase tracking-[0.07em] text-muted">Leitura operacional</span>
              {aiData && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-caption font-bold text-primary/80">
                  <Sparkles size={8} aria-hidden="true" /> IA
                </span>
              )}
            </div>

            {isLoadingAI && !aiData ? (
              <div className="space-y-2" aria-label="Analisando contexto">
                <div className="h-3 w-full animate-pulse rounded bg-surface" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-surface" />
                <div className="h-3 w-3/5 animate-pulse rounded bg-surface" />
              </div>
            ) : aiData?.problema ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red" />
                  <p className="text-label leading-snug text-secondary"><strong className="text-red">Problema:</strong> {aiData.problema}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-yellow" />
                  <p className="text-label leading-snug text-secondary"><strong className="text-yellow">Sugestão:</strong> {aiData.sugestao}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Zap size={11} className="mt-0.5 flex-shrink-0 text-green" aria-hidden="true" />
                  <p className="text-label font-semibold leading-snug text-text"><strong className="text-green">Ação:</strong> {aiData.acao}</p>
                </div>
              </div>
            ) : (
              <p className="text-label leading-relaxed text-secondary">
                {narrativa || 'Aguardando dados suficientes para consolidar a leitura operacional.'}
              </p>
            )}

            {!aiData && onRequestAI && (
              <div className="mt-2">
                <button
                  type="button"
                  aria-expanded={showAIComposer}
                  onClick={() => setShowAIComposer(current => !current)}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-primary/20 px-2.5 py-1.5 text-caption font-semibold text-primary/75 transition-colors hover:border-primary/40 hover:bg-primary/[0.08] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:min-h-8"
                >
                  <Sparkles size={11} aria-hidden="true" /> Enriquecer com IA
                </button>

                {showAIComposer && (
                  <div className="mt-2 space-y-2 rounded-md border border-white/[0.06] bg-bg/30 p-2.5">
                    <textarea
                      value={draftObs}
                      onChange={event => setDraftObs(event.target.value)}
                      placeholder="Contexto opcional para a IA: ex. tivemos queda de energia hoje, o que pode justificar menor fluxo de atendimentos."
                      rows={2}
                      className="w-full resize-none rounded-md border border-white/[0.08] bg-surface/60 px-3 py-2 text-caption leading-relaxed text-secondary placeholder:text-muted/50 focus:border-primary/30 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => onRequestAI(draftObs)}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-primary/20 px-3 py-1.5 text-caption font-semibold text-primary/80 transition-colors hover:border-primary/40 hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:min-h-8"
                    >
                      <Sparkles size={10} aria-hidden="true" /> Analisar contexto
                    </button>
                  </div>
                )}
              </div>
            )}

            {aiData && onRequestAI && (
              <div className="mt-2">
                <button
                  type="button"
                  aria-expanded={showReanalysis}
                  onClick={() => setShowReanalysis(current => !current)}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-caption text-muted transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:min-h-8"
                >
                  <Sparkles size={9} aria-hidden="true" /> Reanalisar com novo contexto
                </button>
                {showReanalysis && (
                  <div className="mt-2 space-y-2 rounded-md border border-white/[0.06] bg-bg/30 p-2.5">
                    <textarea
                      value={draftObs}
                      onChange={event => setDraftObs(event.target.value)}
                      placeholder="Novo contexto para a IA..."
                      rows={2}
                      className="w-full resize-none rounded-md border border-white/[0.08] bg-surface/60 px-3 py-2 text-caption text-secondary placeholder:text-muted/50 focus:border-primary/30 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => { onRequestAI(draftObs); setShowReanalysis(false) }}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md border border-primary/20 px-2.5 py-1 text-caption font-semibold text-primary/80 hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:min-h-8"
                    >
                      <Sparkles size={9} aria-hidden="true" /> Analisar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <FlowMetric title="Entradas hoje" mobileTitle="Entradas" value={entradasHoje} sub={`média ${entradaMediaDia.toLocaleString('pt-BR')}/dia`} />
          <FlowMetric title="Concluídas hoje" mobileTitle="Concluídas" value={saidasHoje} sub="hoje" />
          <FlowMetric
            title="Saldo do dia"
            mobileTitle="Saldo"
            value={fluxoHoje}
            tone={fluxoHoje < 0 ? 'ok' : fluxoHoje > 0 ? 'warning' : 'neutral'}
            sub={fluxoHoje < 0 ? 'fila encolhendo' : fluxoHoje > 0 ? 'fila crescendo' : 'estável'}
          />
          <FlowMetric
            title="Projeção do mês"
            mobileTitle="Projeção"
            value={metaMes.projecaoFinal != null ? metaMes.projecaoFinal.toLocaleString('pt-BR') : '—'}
            tone={metaMes.projecaoFinal != null && metaMes.meta > 0 ? (projecaoOk ? 'ok' : 'warning') : 'neutral'}
            sub={metaMes.meta > 0 ? `meta ${metaMes.meta}${projecaoOk ? ' · no ritmo' : ''}` : undefined}
          />
        </div>

        {displayInsights.length > 0 && (
          <div className="flex min-w-0 flex-nowrap gap-1.5 overflow-x-auto border-t border-white/[0.05] pt-3 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {displayInsights.slice(0, 4).map((insight, index) => (
              <span
                key={`${insight.text}-${index}`}
                className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-[5px] text-caption font-semibold ${insightClasses[insight.level] ?? insightClasses.cyan}`}
              >
                {insight.ai
                  ? <Sparkles size={8} className="flex-shrink-0 opacity-70" aria-hidden="true" />
                  : <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current" />}
                {insight.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
