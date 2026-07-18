import { useState, useCallback, useEffect } from 'react'
import { Sparkles, X, Bookmark, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { usePicoAlertas, usePicoAlertasActions, type PicoAlerta } from '../../hooks/usePicoAlertas'
import { useJustificativasActions } from '../../hooks/useJustificativas'
import { ai } from '../../lib/api'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface JustificativaIA {
  causa_principal:     string
  impacto:             string
  contexto:            string
  acoes:               string[]
  recomendacao_gestao: string
}

// ─── Painel de um alerta (dentro do modal) ───────────────────────────────────

function AlertaPainel({
  alerta,
  onJustified,
  onDismiss,
}: {
  alerta:      PicoAlerta
  onJustified: () => void
  onDismiss:   () => void
}) {
  const { save }          = useJustificativasActions()
  const [contexto, setContexto]   = useState('')
  const [iaResult, setIaResult]   = useState<JustificativaIA | null>(null)
  const [iaLoading, setIaLoading] = useState(false)
  const [iaError,   setIaError]   = useState('')
  const [saving,    setSaving]    = useState(false)
  const [expanded,  setExpanded]  = useState(false)

  const gerarIA = useCallback(async () => {
    setIaLoading(true)
    setIaError('')
    try {
      const payload = {
        picosDia:        [{ date: alerta.data, count: alerta.count_os, zScore: alerta.zscore }],
        bairrosAnomalia: [],
        clustersAtivos:  [],
        osRede:          [],
        contexto:        { mediaAberturasDia: alerta.count_os },
        contexto_real:   contexto.trim() || undefined,
      }
      const res = await ai.justificativaBacklog(payload) as JustificativaIA
      setIaResult(res)
      setExpanded(true)
    } catch (e: unknown) {
      setIaError(e instanceof Error ? e.message : 'Erro ao chamar IA')
    } finally {
      setIaLoading(false)
    }
  }, [alerta, contexto])

  const salvarEFechar = useCallback(async () => {
    if (!iaResult) return
    setSaving(true)
    try {
      await save({
        data_pico:      alerta.data,
        periodo_inicio: alerta.data,
        periodo_fim:    alerta.data,
        count_os:       alerta.count_os,
        zscore:         alerta.zscore,
        contexto_real:  contexto.trim(),
        ia_result:      iaResult,
      })
      onJustified()
    } finally {
      setSaving(false)
    }
  }, [save, alerta, contexto, iaResult, onJustified])

  const fmt = (n: number) => n.toLocaleString('pt-BR')

  return (
    <div className="space-y-4">

      {/* Info do pico */}
      <div className="flex items-start gap-3 p-3 rounded-xl border border-red-500/20 bg-red-500/5">
        <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-body font-bold text-text">
            {fmt(alerta.count_os)} OS abertas em {alerta.data}
          </p>
          <p className="text-caption text-muted mt-0.5">
            Z-score {alerta.zscore}σ — volume {Math.round(alerta.zscore * 100 / 2)}% acima da média esperada
          </p>
        </div>
      </div>

      {/* Campo contexto */}
      <div className="space-y-1.5">
        <label className="text-caption font-bold uppercase tracking-[0.07em] text-muted">
          O que aconteceu neste dia? <span className="font-normal normal-case tracking-normal text-muted/50">(opcional)</span>
        </label>
        <textarea
          value={contexto}
          onChange={e => setContexto(e.target.value)}
          placeholder="Ex: Troca em massa de roteadores Zyxel contaminados…"
          rows={2}
          className="w-full rounded-xl border border-white/[0.08] bg-surface/30 px-3 py-2.5
                     text-label text-text placeholder:text-muted/40 resize-none
                     focus:outline-none focus:border-violet-500/40 transition-colors"
        />
      </div>

      {/* Botões */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={gerarIA}
          disabled={iaLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold text-label
                     transition-all disabled:opacity-50
                     border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20">
          <Sparkles size={12} className={iaLoading ? 'animate-pulse' : ''} />
          {iaLoading ? 'Gerando…' : iaResult ? 'Regerar' : 'Gerar Justificativa (IA)'}
        </button>
        {iaResult && (
          <button
            onClick={salvarEFechar}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold text-label
                       transition-all disabled:opacity-50
                       border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20">
            <Bookmark size={12} />
            {saving ? 'Salvando…' : 'Salvar e Fechar'}
          </button>
        )}
      </div>

      {iaError && (
        <p className="text-caption text-red-400 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">{iaError}</p>
      )}

      {/* Resultado IA expansível */}
      {iaResult && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-caption text-violet-300">
            <span className="flex items-center gap-1.5">
              <Sparkles size={11} />
              Resultado da análise
            </span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {expanded && (
            <div className="px-4 pb-4 space-y-2.5 text-label">
              <div>
                <p className="text-caption font-bold uppercase tracking-[0.07em] text-violet-400/70 mb-0.5">Causa Principal</p>
                <p className="text-text leading-relaxed">{iaResult.causa_principal}</p>
              </div>
              <div>
                <p className="text-caption font-bold uppercase tracking-[0.07em] text-muted mb-0.5">Impacto</p>
                <p className="text-text leading-relaxed">{iaResult.impacto}</p>
              </div>
              {iaResult.acoes?.length > 0 && (
                <div>
                  <p className="text-caption font-bold uppercase tracking-[0.07em] text-muted mb-1">Ações</p>
                  <ul className="space-y-0.5">
                    {iaResult.acoes.map((a, i) => (
                      <li key={i} className="flex gap-1.5 text-text"><span className="text-violet-400">•</span>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="pt-2 border-t border-violet-500/10">
                <p className="text-caption font-bold uppercase tracking-[0.07em] text-muted mb-0.5">Recomendação para Gestão</p>
                <p className="text-violet-200 font-medium">{iaResult.recomendacao_gestao}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ignorar */}
      <button
        onClick={onDismiss}
        className="text-caption text-muted/50 hover:text-muted transition-colors underline underline-offset-2">
        Ignorar este alerta
      </button>
    </div>
  )
}

// ─── Modal global ─────────────────────────────────────────────────────────────

export function PicoAlertaModal() {
  const { data: alertas = [] } = usePicoAlertas()
  const { dismiss, markJustified } = usePicoAlertasActions()

  // Índice do alerta sendo exibido (se houver múltiplos)
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(false)

  // Abre automaticamente quando chegam alertas pendentes
  useEffect(() => {
    if (alertas.length > 0) {
      setVisible(true)
      setIdx(0)
    }
  }, [alertas.length])

  if (!visible || alertas.length === 0) return null

  const alerta = alertas[Math.min(idx, alertas.length - 1)]

  const handleDismiss = async () => {
    await dismiss(alerta.id)
    if (alertas.length <= 1) setVisible(false)
    else setIdx(i => Math.max(0, i - 1))
  }

  const handleJustified = async () => {
    await markJustified(alerta.id)
    if (alertas.length <= 1) setVisible(false)
    else setIdx(i => Math.max(0, i - 1))
  }

  return (
    <>
      {/* Overlay suave */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      {/* Painel centralizado */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-lg pointer-events-auto animate-in fade-in zoom-in-95 duration-200">
          <div className="rounded-2xl border border-red-500/30 bg-card shadow-2xl shadow-black/60 overflow-hidden">

            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/[0.06] bg-red-500/5">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <div>
                  <p className="text-body font-bold text-text">Pico de OS Detectado — 17h</p>
                  <p className="text-caption text-muted mt-0.5">
                    Volume anômalo identificado automaticamente
                    {alertas.length > 1 && ` · ${idx + 1} de ${alertas.length}`}
                  </p>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="text-muted hover:text-text transition-colors flex-shrink-0 mt-0.5">
                <X size={16} />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="px-5 py-4">
              <AlertaPainel
                key={alerta.id}
                alerta={alerta}
                onJustified={handleJustified}
                onDismiss={handleDismiss}
              />
            </div>

            {/* Navegação entre alertas */}
            {alertas.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 pb-3">
                {alertas.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIdx(i)}
                    className="w-1.5 h-1.5 rounded-full transition-all"
                    style={{ background: i === idx ? '#ef4444' : '#374151' }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
