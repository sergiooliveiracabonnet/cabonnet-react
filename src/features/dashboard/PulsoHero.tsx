import { useState } from 'react'
import { Sparkles, Zap, Activity } from 'lucide-react'
import { GaugeChart } from '../../components/ui/GaugeChart'
import { StatCard } from '../../components/ui/StatCard'
import type { Pulso } from '../../lib/types'
import type { AINarrativeResult } from '../../hooks/useAINarrative'
import type { ScoreTendencia } from './DashboardTypes'
import type { FluxoEvolucao } from './FluxoOSPanel'

export interface AnomaliaContextType {
  total:     number
  sla_pct:   number
  criticas:  number
  aging_med: number
}

export function PulsoHero({ pulso, aiData, isLoadingAI, onRequestAI, target, tendencia, evolucao }: {
  pulso: Pulso; aiData: AINarrativeResult | null | undefined; isLoadingAI: boolean; onRequestAI?: (obs: string) => void; target?: number
  tendencia?: ScoreTendencia
  evolucao: FluxoEvolucao
}) {
  const [draftObs, setDraftObs] = useState('')
  const [showReanalysis, setShowReanalysis] = useState(false)

  const {
    score = 0, scoreLabel = '—', scoreBreakdown = [], narrativa = '', quickInsights = [],
    entradasHoje = 0, saidasHoje = 0, fluxoHoje = 0, entradaMediaDia = 0,
    metaMes = { concluidas: 0, meta: 0, pct: null, diasUteisRestantes: 0, diasUteisTotal: 0, projecaoFinal: null, status: 'neutro' as const },
  } = pulso

  const scoreColor =
    score >= 85 ? '#4ade80' :
    score >= 65 ? '#facc15' : '#f87171'

  const weakestId = scoreBreakdown.length > 0
    ? [...scoreBreakdown].sort((a, b) => a.value - b.value)[0].id
    : null

  type DisplayInsight = { level: string; text: string; ai?: boolean }
  const displayNarrative = narrativa
  const displayInsights: DisplayInsight[] = aiData?.insights?.length
    ? aiData.insights.map(text => ({ level: 'cyan', text, ai: true }))
    : quickInsights

  const INSIGHT_CLS = {
    red:    'bg-red/10 text-red border-red/25',
    orange: 'bg-orange/10 text-orange border-orange/25',
    yellow: 'bg-yellow/10 text-yellow border-yellow/25',
    green:  'bg-green/10 text-green border-green/25',
    cyan:   'bg-cyan/10 text-cyan border-cyan/25',
  } as Record<string, string>

  // Fluxo do dia — 4 tiles compactos; sparkline dos últimos 14 dias onde a série existe
  const saldoSparkline = evolucao.abertas.map((v, i) => v - evolucao.concluidas[i])
  const projecaoOk = metaMes.projecaoFinal != null && metaMes.meta > 0 && metaMes.projecaoFinal >= metaMes.meta

  return (
    <div
      className="rounded-lg card-anchor"
      style={{ borderLeft: `2px solid ${scoreColor}` }}
    >
      <div className="p-5 space-y-4">
        {/* Main row */}
        <div className="flex items-start gap-6 flex-wrap">

          {/* Gauge + breakdown em popover (hover/foco) */}
          <div className="group relative flex flex-col items-center gap-1.5 flex-shrink-0">
            <div
              role="button"
              tabIndex={scoreBreakdown.length > 0 ? 0 : undefined}
              aria-label="Detalhar composição do score"
              aria-describedby={scoreBreakdown.length > 0 ? "score-breakdown-popover" : undefined}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <GaugeChart value={score} target={target} color={scoreColor} label={scoreLabel} size={100} />
            </div>
            <span className="text-caption font-bold uppercase tracking-[0.06em]"
                  style={{ color: `${scoreColor}99` }}>
              Score
            </span>
            {tendencia?.delta != null && tendencia.delta !== 0 && (
              <span className={`inline-flex items-center gap-1 text-caption font-bold tabular-nums
                                px-2 py-0.5 rounded-full border
                                ${tendencia.delta > 0
                                  ? 'text-green bg-green/[0.07] border-green/20'
                                  : 'text-red bg-red/[0.07] border-red/20'}`}
                    title={`Score do período anterior: ${tendencia.anterior}`}>
                {tendencia.delta > 0 ? '▲' : '▼'} {tendencia.delta > 0 ? '+' : ''}{tendencia.delta} vs anterior
              </span>
            )}

            {scoreBreakdown.length > 0 && (
              <div
                id="score-breakdown-popover"
                role="tooltip"
                className="hidden group-hover:flex group-focus-within:flex flex-col gap-2
                           absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[150px] z-20
                           rounded-lg border border-border bg-elevated p-3 shadow-xl"
              >
                {scoreBreakdown.map(item => {
                  const isWeakest = item.id === weakestId
                  const cor = item.value >= 85 ? '#4ade80' : item.value >= 65 ? '#facc15' : '#f87171'
                  return (
                    <div key={item.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-caption ${isWeakest ? 'font-bold text-text' : 'text-muted'}`}>
                          {item.label}{isWeakest ? ' ⚠' : ''}
                        </span>
                        <span className="text-caption font-mono font-semibold" style={{ color: cor }}>
                          {item.value}
                        </span>
                      </div>
                      <div className="h-1 bg-surface/40 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                             style={{ width: `${Math.min(100, Math.max(0, item.value))}%`, background: cor }} />
                      </div>
                    </div>
                  )
                })}
                <span className="text-caption text-muted/70 leading-tight">
                  Peso: SLA 45% · Taxa 35% · MTTR 20%
                </span>
              </div>
            )}
          </div>

          {/* Narrativa + fluxo do dia */}
          <div className="flex-1 min-w-[240px] flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Activity size={10} className="text-muted" />
                <span className="text-caption font-bold uppercase tracking-[0.07em] text-muted">
                  Análise Operacional
                </span>
                {aiData && (
                  <span className="inline-flex items-center gap-1 text-caption font-bold text-primary/80
                                   bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">
                    <Sparkles size={7} /> IA
                  </span>
                )}
              </div>

              {!isLoadingAI && !aiData && onRequestAI ? (
                <div className="space-y-2">
                  <textarea
                    value={draftObs}
                    onChange={e => setDraftObs(e.target.value)}
                    placeholder="Contexto opcional para a IA: ex. tivemos queda de energia hoje, o que pode justificar menor fluxo de atendimentos."
                    rows={2}
                    className="w-full text-caption text-secondary placeholder:text-muted/50
                               bg-surface/60 border border-white/[0.08] rounded-lg px-3 py-2
                               resize-none focus:outline-none focus:border-primary/30
                               leading-relaxed"
                  />
                  <button
                    onClick={() => onRequestAI(draftObs)}
                    className="flex items-center gap-1.5 text-caption font-semibold text-primary/70 hover:text-primary
                               px-3 py-1.5 rounded-lg border border-primary/20 hover:border-primary/40 hover:bg-primary/[0.08]
                               transition-all duration-fast"
                  >
                    <Sparkles size={11} /> Analisar com IA
                  </button>
                </div>
              ) : isLoadingAI && !aiData ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="h-2 bg-surface rounded animate-pulse w-16" />
                    <div className="h-3 bg-surface rounded animate-pulse w-full" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2 bg-surface rounded animate-pulse w-16" />
                    <div className="h-3 bg-surface rounded animate-pulse w-5/6" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2 bg-surface rounded animate-pulse w-16" />
                    <div className="h-3 bg-surface rounded animate-pulse w-4/5" />
                  </div>
                </div>
              ) : aiData?.problema ? (
                <div className="space-y-2.5">
                  {/* Problema */}
                  <div className="flex gap-2.5 items-start">
                    <span className="mt-[3px] flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red" />
                    <div>
                      <p className="text-caption font-bold uppercase tracking-[0.08em] text-red/70 mb-0.5">Problema</p>
                      <p className="text-label text-secondary leading-snug">{aiData.problema}</p>
                    </div>
                  </div>
                  {/* Sugestão */}
                  <div className="flex gap-2.5 items-start">
                    <span className="mt-[3px] flex-shrink-0 w-1.5 h-1.5 rounded-full bg-yellow" />
                    <div>
                      <p className="text-caption font-bold uppercase tracking-[0.08em] text-yellow/70 mb-0.5">Sugestão</p>
                      <p className="text-label text-secondary leading-snug">{aiData.sugestao}</p>
                    </div>
                  </div>
                  {/* Ação */}
                  <div className="flex gap-2.5 items-start">
                    <Zap size={10} className="mt-[2px] flex-shrink-0 text-green" />
                    <div>
                      <p className="text-caption font-bold uppercase tracking-[0.08em] text-green/70 mb-0.5">Ação Imediata</p>
                      <p className="text-label font-semibold text-text leading-snug">{aiData.acao}</p>
                    </div>
                  </div>

                  {/* Reanalisar */}
                  {onRequestAI && !showReanalysis && (
                    <button
                      onClick={() => setShowReanalysis(true)}
                      className="mt-1 flex items-center gap-1 text-caption text-muted/60 hover:text-primary
                                 transition-colors duration-fast"
                    >
                      <Sparkles size={9} /> Reanalisar com novo contexto
                    </button>
                  )}
                  {showReanalysis && onRequestAI && (
                    <div className="pt-1 space-y-1.5 border-t border-white/[0.05]">
                      <textarea
                        value={draftObs}
                        onChange={e => setDraftObs(e.target.value)}
                        placeholder="Novo contexto para a IA..."
                        rows={2}
                        className="w-full text-caption text-secondary placeholder:text-muted/50
                                   bg-surface/60 border border-white/[0.08] rounded-lg px-3 py-2
                                   resize-none focus:outline-none focus:border-primary/30
                                   leading-relaxed"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { onRequestAI(draftObs); setShowReanalysis(false) }}
                          className="flex items-center gap-1 text-caption font-semibold text-primary/70 hover:text-primary
                                     px-2.5 py-1 rounded-md border border-primary/20 hover:border-primary/40
                                     hover:bg-primary/[0.08] transition-all duration-fast"
                        >
                          <Sparkles size={9} /> Analisar
                        </button>
                        <button
                          onClick={() => setShowReanalysis(false)}
                          className="text-caption text-muted/60 hover:text-muted px-2 py-1 transition-colors duration-fast"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-label text-secondary leading-[1.7]">
                  {displayNarrative || 'Carregando análise operacional…'}
                </p>
              )}
            </div>

            {/* Fluxo do dia — 4 tiles compactos */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-auto">
              <StatCard
                size="sm" title="Entradas hoje" value={entradasHoje}
                sub={`média ${entradaMediaDia.toLocaleString('pt-BR')}/dia`}
                sparkline={evolucao.abertas}
              />
              <StatCard
                size="sm" title="Concluídas hoje" value={saidasHoje}
                sub="hoje"
                sparkline={evolucao.concluidas}
              />
              <StatCard
                size="sm" title="Saldo do dia" value={fluxoHoje}
                tone={fluxoHoje < 0 ? 'ok' : fluxoHoje > 0 ? 'warning' : 'neutral'}
                sub={fluxoHoje < 0 ? 'fila encolhendo' : fluxoHoje > 0 ? 'fila crescendo' : 'estável'}
                sparkline={saldoSparkline}
              />
              <StatCard
                size="sm" title="Projeção do mês"
                value={metaMes.projecaoFinal != null ? metaMes.projecaoFinal.toLocaleString('pt-BR') : '—'}
                tone={metaMes.projecaoFinal != null && metaMes.meta > 0 ? (projecaoOk ? 'ok' : 'warning') : 'neutral'}
                sub={metaMes.meta > 0 ? `meta ${metaMes.meta}${projecaoOk ? ' ✓' : ''}` : undefined}
              />
            </div>
          </div>
        </div>

        {/* Insight pills */}
        {displayInsights.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-3 border-t border-white/[0.05]">
            {displayInsights.map((ins, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1.5 text-caption font-semibold
                            px-2.5 py-[5px] rounded-full border ${INSIGHT_CLS[ins.level] ?? INSIGHT_CLS.cyan}`}
              >
                {ins.ai
                  ? <Sparkles size={8} className="flex-shrink-0 opacity-70" />
                  : <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                }
                {ins.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
