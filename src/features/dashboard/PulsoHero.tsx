import { useState } from 'react'
import { Pulse, Sparkle, TrendDown, TrendUp, Lightning } from '@phosphor-icons/react'
import type { Pulso } from '../../lib/types'
import type { AINarrativeResult } from '../../hooks/useAINarrative'
import type { DashMover } from './DashboardTypes'

export interface AnomaliaContextType {
  total: number
  sla_pct: number
  criticas: number
  aging_med: number
}

type Tone = 'ok' | 'warn' | 'bad' | 'idle'

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-green', warn: 'text-yellow', bad: 'text-red', idle: 'text-muted',
}
const TONE_BAR: Record<Tone, string> = {
  ok: 'bg-green', warn: 'bg-yellow', bad: 'bg-red', idle: 'bg-muted',
}
const TONE_EDGE: Record<Tone, string> = {
  ok: 'border-l-green', warn: 'border-l-yellow', bad: 'border-l-red', idle: 'border-l-muted',
}
const TONE_BADGE: Record<Tone, string> = {
  ok: 'border-green/25 bg-green/[0.08] text-green',
  warn: 'border-yellow/25 bg-yellow/[0.08] text-yellow',
  bad: 'border-red/25 bg-red/[0.08] text-red',
  idle: 'border-white/[0.08] bg-surface/50 text-secondary',
}

const MICRO = 'text-caption font-bold uppercase tracking-[0.07em] text-muted'
const CELL = 'min-w-0 rounded-md border border-white/[0.06] bg-bg/35'

// Escala do trilho do MTTR: 10 dias cobre o pior caso operacional real sem
// espremer a faixa útil (0–5d) num canto invisível da barra.
const MTTR_ESCALA_DIAS = 10

const clampPct = (n: number) => Math.max(0, Math.min(100, n))
const fmt = (n: number) => n.toLocaleString('pt-BR')

interface Vital {
  id: string
  deltaId: string | null
  label: string
  nota: string | null
  valor: string
  tone: Tone
  pct: number
  alvoPct: number
  alvoLabel: string
}

/** Trilho de referência (bullet chart): posição do valor + marcador da meta.
 *  Sem ele "87%" só é legível para quem decorou os limiares. */
function VitalTrack({ pct, alvoPct, tone }: { pct: number; alvoPct: number; tone: Tone }) {
  return (
    <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-white/[0.07]" aria-hidden="true">
      <div className={`h-full rounded-pill transition-[width] duration-slow ${TONE_BAR[tone]}`} style={{ width: `${pct}%` }} />
      <span className="absolute inset-y-0 w-[2px] rounded-pill bg-text/55" style={{ left: `${alvoPct}%` }} />
    </div>
  )
}

/** Barra de fluxo em escala compartilhada.
 *  - `refPct`: marca a média histórica de entradas — mostra se o dia entrou
 *    acima ou abaixo do normal sem exigir cálculo mental.
 *  - `excedenteDe`: quando esta barra é a maior, o trecho que passa da outra
 *    ganha a cor do saldo. 46 vs 51 são barras quase iguais; o que decide é a
 *    diferença, então é a diferença que fica visível. */
function FluxoBar({ label, value, max, barClass, refPct, excedenteDe, excedenteClass }: {
  label: string
  value: number
  max: number
  barClass: string
  refPct?: number | null
  excedenteDe?: number | null
  excedenteClass?: string
}) {
  const pct = clampPct(max > 0 ? (value / max) * 100 : 0)
  const basePct = excedenteDe != null ? clampPct(max > 0 ? (excedenteDe / max) * 100 : 0) : pct
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <span className="w-[92px] flex-shrink-0 truncate text-caption text-secondary sm:w-[110px]">{label}</span>
      <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-white/[0.07]" aria-hidden="true">
        <span className={`absolute inset-y-0 left-0 rounded-pill transition-[width] duration-slow ${barClass}`} style={{ width: `${basePct}%` }} />
        {excedenteClass && pct > basePct && (
          <span className={`absolute inset-y-0 rounded-pill ${excedenteClass}`} style={{ left: `${basePct}%`, width: `${pct - basePct}%` }} />
        )}
        {refPct != null && <span className="absolute inset-y-0 w-[2px] rounded-pill bg-text/55" style={{ left: `${refPct}%` }} />}
      </span>
      <span className="w-9 flex-shrink-0 text-right text-title font-black tabular-nums text-text">{value}</span>
    </div>
  )
}

function SaldoCell({ label, valor, descricao, tone, icon: Icon }: {
  label: string
  valor: string
  descricao: string
  tone: Tone
  icon?: typeof TrendUp
}) {
  return (
    <div className={`${CELL} px-3 py-2.5`}>
      <p className="truncate text-caption font-semibold text-muted">{label}</p>
      <p className="mt-1 flex items-center gap-1.5">
        {Icon && <Icon size={14} className={`flex-shrink-0 ${TONE_TEXT[tone]}`} aria-hidden="true" />}
        <span className={`text-title font-black tabular-nums ${TONE_TEXT[tone]}`}>{valor}</span>
      </p>
      <p className="mt-0.5 truncate text-caption text-muted">{descricao}</p>
    </div>
  )
}

export function PulsoHero({ pulso, aiData, isLoadingAI, onRequestAI, mudancas = [] }: {
  pulso: Pulso
  aiData: AINarrativeResult | null | undefined
  isLoadingAI: boolean
  onRequestAI?: (obs: string) => void
  mudancas?: DashMover[]
}) {
  const [draftObs, setDraftObs] = useState('')
  const [showAIComposer, setShowAIComposer] = useState(false)
  const [showReanalysis, setShowReanalysis] = useState(false)

  const {
    narrativa = '',
    quickInsights = [],
    slaFila = 0,
    taxa = 0,
    mttr = 0,
    entradasHoje = 0,
    saidasHoje = 0,
    fluxoHoje = 0,
    entradaMediaDia = 0,
    backlogDias = null,
  } = pulso

  // Sinais vitais: as três componentes que antes viravam um score 0–100 único.
  //
  // deltaId é explícito de propósito. "SLA da Fila" é ESTOQUE (foto da fila
  // agora, vinda de allRows) e não tem versão "do período anterior" — o Δ que
  // buildMudancas calcula para 'sla' é de outra métrica, o SLA do PERÍODO
  // (fluxo, sobre `rows`). Casar os dois exibiria a variação de um número ao
  // lado do valor de outro. O Δ do SLA do período aparece no MudancasStrip,
  // com o rótulo correto.
  const deltaDe = (id: string | null) => (id ? mudancas.find(m => m.id === id) ?? null : null)
  const vitais: Vital[] = [
    {
      id: 'sla', deltaId: null, label: 'SLA da Fila', nota: 'agora',
      valor: `${slaFila}%`,
      tone: slaFila >= 90 ? 'ok' : slaFila >= 75 ? 'warn' : 'bad',
      pct: clampPct(slaFila), alvoPct: 90, alvoLabel: 'meta ≥ 90%',
    },
    {
      id: 'taxa', deltaId: 'taxa', label: 'Taxa Conclusão', nota: null,
      valor: `${taxa}%`,
      tone: taxa >= 80 ? 'ok' : taxa >= 60 ? 'warn' : 'bad',
      pct: clampPct(taxa), alvoPct: 80, alvoLabel: 'meta ≥ 80%',
    },
    {
      id: 'mttr', deltaId: 'mttr', label: 'MTTR', nota: null,
      valor: mttr > 0 ? `${mttr.toLocaleString('pt-BR')}d` : '—',
      tone: mttr === 0 ? 'idle' : mttr <= 2 ? 'ok' : mttr <= 5 ? 'warn' : 'bad',
      pct: clampPct((mttr / MTTR_ESCALA_DIAS) * 100),
      alvoPct: (2 / MTTR_ESCALA_DIAS) * 100, alvoLabel: 'alvo ≤ 2d',
    },
  ]

  // Veredito do painel: o operador precisa saber em 1 segundo se olha ou segue.
  const pior = vitais.find(v => v.tone === 'bad') ?? null
  const emAtencao = vitais.find(v => v.tone === 'warn') ?? null
  const veredito: { tone: Tone; texto: string; alvo: string | null } = pior
    ? { tone: 'bad', texto: 'Crítico', alvo: pior.label }
    : emAtencao
      ? { tone: 'warn', texto: 'Sob atenção', alvo: emAtencao.label }
      : { tone: 'ok', texto: 'Dentro das metas', alvo: null }

  const fluxoMax = Math.max(entradasHoje, saidasHoje, entradaMediaDia, 1)
  const mediaRefPct = entradaMediaDia > 0 ? clampPct((entradaMediaDia / fluxoMax) * 100) : null
  const saldoTone: Tone = fluxoHoje < 0 ? 'ok' : fluxoHoje > 0 ? 'warn' : 'idle'
  const backlogTone: Tone = backlogDias == null ? 'idle' : backlogDias > 3 ? 'warn' : 'ok'

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
      className={`h-full rounded-lg border border-border border-l-2 bg-card ${TONE_EDGE[veredito.tone]}`}
    >
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/[0.07] text-primary">
            <Pulse size={14} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="dashboard-pulse-title" className="text-body font-bold text-text">Pulso operacional</h2>
            <p className="text-caption text-muted">Leitura consolidada do período</p>
          </div>
        </div>
        <span
          data-testid="pulso-veredito"
          className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-pill border px-2.5 py-1 text-caption font-semibold ${TONE_BADGE[veredito.tone]}`}
        >
          <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-pill ${TONE_BAR[veredito.tone]}`} aria-hidden="true" />
          {veredito.texto}
          {veredito.alvo && <span className="hidden sm:inline">· {veredito.alvo}</span>}
        </span>
      </header>

      <div className="space-y-4 p-3 sm:p-4">
        {/* ── Sinais vitais — substituem o score 0–100 (média ponderada arbitrária
            que misturava estoque com fluxo e não indicava ação). Cada um traz a
            própria escala: valor, meta e período anterior visíveis sem hover. ── */}
        <div>
          <p className={`mb-2 ${MICRO}`}>Sinais vitais</p>
          <dl data-testid="pulso-vitais" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {vitais.map(v => {
              const m = deltaDe(v.deltaId)
              return (
                <div key={v.id} className={`${CELL} px-3 py-2.5`}>
                  <dt className="truncate text-caption font-semibold text-muted">
                    {v.label}{v.nota && <span className="ml-1 font-normal text-muted/60">· {v.nota}</span>}
                  </dt>
                  <dd className="mt-0.5">
                    <span className="flex items-baseline gap-2">
                      <span className={`text-display font-black tabular-nums ${TONE_TEXT[v.tone]}`}>{v.valor}</span>
                      {m && (
                        <span className={`inline-flex items-center gap-1 text-caption font-bold tabular-nums ${m.melhorou ? 'text-green' : 'text-red'}`}>
                          {m.delta > 0
                            ? <TrendUp   size={12} weight="bold" alt="alta" />
                            : <TrendDown size={12} weight="bold" alt="queda" />}
                          {fmt(Math.abs(m.delta))}{m.unidade}
                        </span>
                      )}
                    </span>
                    <VitalTrack pct={v.pct} alvoPct={v.alvoPct} tone={v.tone} />
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate text-caption text-muted">{v.alvoLabel}</span>
                      {m && (
                        <span className="flex-shrink-0 truncate text-caption tabular-nums text-muted">
                          antes {fmt(m.anterior)}{m.unidade}
                        </span>
                      )}
                    </span>
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>

        {/* ── Fluxo do dia — entradas e saídas na MESMA escala: a relação entre as
            duas é o que decide, não cada número isolado. ── */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className={MICRO}>Fluxo do dia</p>
            <p className="flex min-w-0 items-center gap-1.5 truncate text-caption text-muted">
              <span className="h-2.5 w-[2px] flex-shrink-0 rounded-pill bg-text/55" aria-hidden="true" />
              média {fmt(entradaMediaDia)} entradas/dia
            </p>
          </div>

          <div className={`${CELL} space-y-2 p-3`}>
            {/* O excedente sai da comparação das próprias barras (e não de
                fluxoHoje) para que o segmento colorido nunca contradiga o que
                as duas barras mostram. */}
            <FluxoBar
              label="Entradas hoje" value={entradasHoje} max={fluxoMax} barClass="bg-muted/70" refPct={mediaRefPct}
              excedenteDe={entradasHoje > saidasHoje ? saidasHoje : null} excedenteClass={TONE_BAR.warn}
            />
            <FluxoBar
              label="Concluídas hoje" value={saidasHoje} max={fluxoMax} barClass="bg-text/60"
              excedenteDe={saidasHoje > entradasHoje ? entradasHoje : null} excedenteClass={TONE_BAR.ok}
            />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <SaldoCell
              label="Saldo do dia"
              valor={fluxoHoje > 0 ? `+${fluxoHoje}` : `${fluxoHoje}`}
              tone={saldoTone}
              icon={fluxoHoje < 0 ? TrendDown : fluxoHoje > 0 ? TrendUp : undefined}
              descricao={fluxoHoje < 0 ? 'fila encolhendo' : fluxoHoje > 0 ? 'fila crescendo' : 'estável'}
            />
            {/* Backlog em dias de capacidade: "120 na fila" não decide nada;
                "3,2 dias no ritmo atual" decide se precisa de frente extra. */}
            <SaldoCell
              label="Backlog da fila"
              valor={backlogDias != null ? `${backlogDias.toLocaleString('pt-BR')}d` : '—'}
              tone={backlogTone}
              descricao={backlogDias != null ? 'no ritmo atual' : 'sem baixas p/ calcular'}
            />
          </div>
        </div>

        {/* ── Leitura operacional — camada interpretativa, depois dos números ── */}
        <div className={`${CELL} min-w-0 p-3`}>
          <div className="mb-2 flex items-center gap-2">
            <span className={MICRO}>Leitura operacional</span>
            {aiData && (
              <span className="inline-flex items-center gap-1 rounded-pill border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-caption font-bold text-primary/80">
                <Sparkle size={8} aria-hidden="true" /> IA
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
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-pill bg-red" />
                <p className="text-label leading-snug text-secondary"><strong className="text-red">Problema:</strong> {aiData.problema}</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-pill bg-yellow" />
                <p className="text-label leading-snug text-secondary"><strong className="text-yellow">Sugestão:</strong> {aiData.sugestao}</p>
              </div>
              <div className="flex items-start gap-2">
                <Lightning size={11} className="mt-0.5 flex-shrink-0 text-green" aria-hidden="true" />
                <p className="text-label font-semibold leading-snug text-text"><strong className="text-green">Ação:</strong> {aiData.acao}</p>
              </div>
            </div>
          ) : (
            <p className="max-w-[70ch] text-label leading-relaxed text-secondary">
              {narrativa || 'Aguardando dados suficientes para consolidar a leitura operacional.'}
            </p>
          )}

          {displayInsights.length > 0 && (
            <div className="mt-3 flex min-w-0 flex-nowrap gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
              {displayInsights.slice(0, 4).map((insight, index) => (
                <span
                  key={`${insight.text}-${index}`}
                  className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-pill border px-2.5 py-[5px] text-caption font-semibold ${insightClasses[insight.level] ?? insightClasses.cyan}`}
                >
                  {insight.ai
                    ? <Sparkle size={8} className="flex-shrink-0 opacity-70" aria-hidden="true" />
                    : <span className="h-1.5 w-1.5 flex-shrink-0 rounded-pill bg-current" />}
                  {insight.text}
                </span>
              ))}
            </div>
          )}

          {!aiData && onRequestAI && (
            <div className="mt-2">
              <button
                type="button"
                aria-expanded={showAIComposer}
                onClick={() => setShowAIComposer(current => !current)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-primary/20 px-2.5 py-1.5 text-caption font-semibold text-primary/75 transition-colors hover:border-primary/40 hover:bg-primary/[0.08] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:min-h-8"
              >
                <Sparkle size={11} aria-hidden="true" /> Enriquecer com IA
              </button>

              {showAIComposer && (
                <div className="mt-2 space-y-2 rounded-md border border-white/[0.06] bg-surface/30 p-2.5">
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
                    <Sparkle size={10} aria-hidden="true" /> Analisar contexto
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
                <Sparkle size={9} aria-hidden="true" /> Reanalisar com novo contexto
              </button>
              {showReanalysis && (
                <div className="mt-2 space-y-2 rounded-md border border-white/[0.06] bg-surface/30 p-2.5">
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
                    <Sparkle size={9} aria-hidden="true" /> Analisar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
