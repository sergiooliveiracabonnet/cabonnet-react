import { useState } from 'react'
import { AlertCircle, ChevronDown, Sparkles } from 'lucide-react'
import { useAIAnomalias } from '../../hooks/useAIAnomalias'
import type { AnomaliasData } from '../../lib/types'
import type { AnomaliaContextType } from './PulsoHero'

const PRIORIDADE_STYLE = {
  alta:  { color: '#f87171', bg: 'rgba(248,113,113,0.08)',   border: 'rgba(248,113,113,0.25)'   },
  média: { color: '#facc15', bg: 'rgba(250,204,21,0.08)',   border: 'rgba(250,204,21,0.25)'   },
  baixa: { color: '#4ade80', bg: 'rgba(74,222,128,0.08)',   border: 'rgba(74,222,128,0.25)'   },
}

export function AnomaliaSection({ anomalias, contexto }: {
  anomalias: AnomaliasData; contexto: AnomaliaContextType
}) {
  const { total = 0, picosDia = [], bairrosAnomalia = [], equipesAnomalia = [] } = anomalias ?? {}
  const [open, setOpen] = useState(total > 0)
  const [aiEnabled, setAiEnabled] = useState(false)

  type HookAnomItem = { zScore: number; [k: string]: unknown }
  const { data: rcaData, isLoading: rcaLoading } = useAIAnomalias({
    picosDia:        picosDia        as unknown as HookAnomItem[],
    bairrosAnomalia: bairrosAnomalia as unknown as HookAnomItem[],
    equipesAnomalia: equipesAnomalia as unknown as HookAnomItem[],
    contexto,
    enabled: aiEnabled,
  })

  const pri    = rcaData?.prioridade ?? 'média'
  const priSty = PRIORIDADE_STYLE[pri] ?? PRIORIDADE_STYLE['média']

  return (
    <div className="relative overflow-hidden rounded-2xl border border-yellow/20 bg-card">
      <div className="absolute top-0 left-0 right-0 h-[2px]"
           style={{ background: 'linear-gradient(90deg, transparent, rgba(250,204,21,0.5), transparent)' }} />

      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface/15 transition-colors"
      >
        <AlertCircle size={14} className="text-yellow flex-shrink-0" />
        <span className="font-semibold text-[13px] text-text flex-1">Detecções Automáticas</span>
        <span className="text-[10px] font-mono bg-yellow/10 text-yellow border border-yellow/20 rounded-full px-2.5 py-1">
          {total} anomalia{total !== 1 ? 's' : ''}
        </span>
        <ChevronDown size={13} className={`text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-yellow/[0.10]">
          <p className="text-[11px] text-muted/70 pt-3">
            Padrões fora do normal detectados via Z-score nos dados do período selecionado.
          </p>

          {picosDia.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-2">Picos de Abertura</p>
              <div className="space-y-2">
                {picosDia.map(p => (
                  <div key={p.date} className="flex items-center gap-3 text-[12px] bg-surface/20 rounded-lg px-3 py-2">
                    <span className="font-mono text-primary w-22 flex-shrink-0">{p.date}</span>
                    <span className="font-mono font-bold text-text">{p.count} OS</span>
                    <span className="text-muted ml-auto">Z: <span className="text-yellow font-mono">{p.zScore}σ</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bairrosAnomalia.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-2">Bairros com SLA Anômalo</p>
              <div className="space-y-2">
                {bairrosAnomalia.map(b => (
                  <div key={b.bairro} className="flex items-center gap-3 text-[12px] bg-surface/20 rounded-lg px-3 py-2">
                    <span className="text-text font-semibold flex-1 min-w-0 truncate">{b.bairro}</span>
                    <span className="font-mono font-bold text-red">{b.ratePct}%</span>
                    <span className="text-muted">{b.slaExc}/{b.total}</span>
                    <span className="text-muted ml-auto">Z: <span className="text-yellow font-mono">{b.zScore}σ</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {equipesAnomalia.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-2">Equipes com Aging Elevado</p>
              <div className="space-y-2">
                {equipesAnomalia.map(e => (
                  <div key={e.nome} className="flex items-center gap-3 text-[12px] bg-surface/20 rounded-lg px-3 py-2">
                    <span className="text-text font-semibold flex-1 min-w-0 truncate">{e.nome}</span>
                    <span className="font-mono font-bold text-orange">{e.agingMed}d</span>
                    <span className="text-muted">{e.count} OS</span>
                    <span className="text-muted ml-auto">Z: <span className="text-yellow font-mono">{e.zScore}σ</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Análise de Causa Raiz (Claude) ── */}
          <div className="border-t border-white/[0.08] pt-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={12} className="text-primary/70" />
                <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">Análise de Causa Raiz</p>
              </div>
              {!aiEnabled && (
                <button
                  onClick={() => setAiEnabled(true)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-primary/70 hover:text-primary
                             px-3 py-1.5 rounded-lg border border-primary/20 hover:border-primary/40 hover:bg-primary/[0.08]
                             transition-all duration-fast"
                >
                  <Sparkles size={11} /> Analisar com IA
                </button>
              )}
            </div>

            {rcaLoading && (
              <div className="flex items-center gap-2 text-[11px] text-muted/60 py-2">
                <div className="w-3 h-3 rounded-full border border-primary/40 border-t-primary animate-spin" />
                Analisando anomalias...
              </div>
            )}

            {rcaData && (
              <div className="space-y-3">
                <div className="rounded-lg px-3 py-2.5 text-[12px] leading-relaxed text-text/80 italic"
                     style={{ background: priSty.bg, border: `1px solid ${priSty.border}` }}>
                  <span className="not-italic font-semibold mr-1.5"
                        style={{ color: priSty.color }}>
                    [{pri.charAt(0).toUpperCase() + pri.slice(1)}]
                  </span>
                  {rcaData.causa_raiz}
                </div>

                {rcaData.acoes?.length > 0 && (
                  <div className="space-y-1.5">
                    {rcaData.acoes.map((acao, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px] text-text/70">
                        <span className="text-primary/60 font-mono flex-shrink-0 mt-0.5">{i + 1}.</span>
                        <span>{acao}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
