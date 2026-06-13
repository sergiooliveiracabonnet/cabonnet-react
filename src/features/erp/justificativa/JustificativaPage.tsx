import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import {
  Sparkles, Download, AlertTriangle, MapPin,
  TrendingUp, Zap, Bookmark, BookmarkCheck, Trash2, ChevronDown, ChevronUp, X,
} from 'lucide-react'
import { useOSDerived } from '../../../contexts/OSDataContext'
import { buildJustificativa, type JustificativaData, type PicoDia } from '../../../lib/builders/justificativa'
import { ai } from '../../../lib/api'
import { useJustificativas, useJustificativasActions, type JustificativaRecord } from '../../../hooks/useJustificativas'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('pt-BR')

function KpiChip({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-card px-4 py-3 flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted">{label}</span>
      <span className="font-mono font-bold text-[22px] tabular-nums" style={{ color }}>{value}</span>
    </div>
  )
}

// ─── Exportação CSV ───────────────────────────────────────────────────────────

function exportCsv(data: JustificativaData, historico: JustificativaRecord[]): void {
  function cell(v: string | number): string {
    const s = String(v ?? '')
    return s.includes(';') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines: string[] = ['Histórico de Justificativas', 'Data Pico;OS;Z-Score;Causa;Impacto;Contexto Real;Criado Em']
  for (const j of historico) {
    lines.push([j.data_pico, j.count_os, j.zscore ?? '', j.causa_principal, j.impacto, j.contexto_real, j.criado_em].map(cell).join(';'))
  }
  lines.push('', 'Picos de Abertura do Período', 'Data;Qtd;Z-Score')
  for (const p of data.picosDia) lines.push([p.date, p.count, p.zScore].map(cell).join(';'))
  lines.push('', 'Clusters Ativos', 'Bairro;Cidade;Total OS')
  for (const c of data.clustersAtivos) lines.push([c.bairro, c.cidade, c.total].map(cell).join(';'))

  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'justificativa-atrasos.csv'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface JustificativaIA {
  causa_principal:     string
  impacto:             string
  contexto:            string
  acoes:               string[]
  recomendacao_gestao: string
  cached?:             boolean
}

interface TimelineEntry { date: string; count: number; isPico: boolean; zScore?: number }

// ─── Timeline interativa ──────────────────────────────────────────────────────

function TimelineInterativa({
  entries, picosDia, savedDates, selectedDate, onSelect,
}: {
  entries:      TimelineEntry[]
  picosDia:     PicoDia[]
  savedDates:   Set<string>
  selectedDate: string | null
  onSelect:     (date: string, count: number) => void
}) {
  const max = Math.max(1, ...entries.map(e => e.count))
  const picoSet = new Map(picosDia.map(p => [p.date, p.zScore]))

  if (!entries.length) return <p className="text-[12px] text-muted py-4">Sem dados de abertura</p>

  return (
    <div className="flex items-end gap-0.5 h-28 overflow-x-auto pb-1 pr-2">
      {entries.map(e => {
        const isSel    = selectedDate === e.date
        const hasSaved = savedDates.has(e.date)
        const zScore   = picoSet.get(e.date)
        const barH     = Math.max(4, Math.round((e.count / max) * 96))
        const barColor = isSel     ? '#a78bfa' :
                         e.isPico  ? '#ef4444' :
                         hasSaved  ? '#22d3ee' : '#3b82f640'

        return (
          <button
            key={e.date}
            onClick={() => onSelect(e.date, e.count)}
            title={`${e.date}: ${e.count} aberturas${e.isPico ? ` (pico Z=${zScore}σ)` : ''}${hasSaved ? ' · justificado' : ''}`}
            className="relative flex flex-col items-center justify-end flex-shrink-0 group focus:outline-none"
            style={{ minWidth: '10px', height: '112px' }}
          >
            {/* Ícone de salvo */}
            {hasSaved && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 text-cyan-400" style={{ top: `${112 - barH - 14}px` }}>
                <BookmarkCheck size={8} />
              </div>
            )}
            <div
              className="rounded-t transition-all group-hover:opacity-80"
              style={{ width: '8px', height: `${barH}px`, background: barColor }}
            />
          </button>
        )
      })}
    </div>
  )
}

// ─── Painel de um dia (inline, abre ao clicar na barra) ───────────────────────

function PainelDia({
  date, count, pico, existente, periodo,
  onSaved, onDeleted, onClose,
}: {
  date:      string
  count:     number
  pico?:     PicoDia
  existente: JustificativaRecord | undefined
  periodo:   { inicio: string; fim: string }
  onSaved:   (r: JustificativaRecord) => void
  onDeleted: (id: number) => void
  onClose:   () => void
}) {
  const { save, remove } = useJustificativasActions()
  const [contextoReal, setContextoReal] = useState(existente?.contexto_real ?? '')
  const [iaResult,     setIaResult]     = useState<JustificativaIA | null>(
    existente ? {
      causa_principal:     existente.causa_principal,
      impacto:             existente.impacto,
      contexto:            existente.contexto_ia,
      acoes:               existente.acoes,
      recomendacao_gestao: existente.recomendacao,
    } : null
  )
  const [iaLoading,  setIaLoading]  = useState(false)
  const [iaError,    setIaError]    = useState('')
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState('')
  const [deleting,   setDeleting]   = useState(false)
  const [savedId,    setSavedId]    = useState<number | undefined>(existente?.id)
  const panelRef = useRef<HTMLDivElement>(null)

  // Sync quando `existente` muda (ex: mudança de seleção)
  useEffect(() => {
    setContextoReal(existente?.contexto_real ?? '')
    setSavedId(existente?.id)
    setIaResult(existente ? {
      causa_principal:     existente.causa_principal,
      impacto:             existente.impacto,
      contexto:            existente.contexto_ia,
      acoes:               existente.acoes,
      recomendacao_gestao: existente.recomendacao,
    } : null)
    setIaError('')
  }, [existente?.id, date])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [date])

  const gerarIA = useCallback(async () => {
    setIaLoading(true)
    setIaError('')
    try {
      const payload = {
        picosDia:     pico ? [pico] : [],
        bairrosAnomalia: [],
        clustersAtivos:  [],
        osRede:          [],
        contexto:        { mediaAberturasDia: count },
        contexto_real:   contextoReal.trim() || undefined,
      }
      const res = await ai.justificativaBacklog(payload) as JustificativaIA
      setIaResult(res)
    } catch (e: unknown) {
      setIaError(e instanceof Error ? e.message : 'Erro ao chamar IA')
    } finally {
      setIaLoading(false)
    }
  }, [pico, count, contextoReal])

  const salvar = useCallback(async () => {
    if (!iaResult) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await save({
        data_pico:      date,
        periodo_inicio: periodo.inicio,
        periodo_fim:    periodo.fim,
        count_os:       count,
        zscore:         pico?.zScore ?? null,
        contexto_real:  contextoReal.trim(),
        ia_result:      { ...iaResult, recomendacao_gestao: iaResult.recomendacao_gestao },
      })
      setSavedId(res.id)
      onSaved({
        id: res.id, data_pico: date,
        periodo_inicio: periodo.inicio, periodo_fim: periodo.fim,
        count_os: count, zscore: pico?.zScore ?? null,
        contexto_real: contextoReal.trim(),
        causa_principal: iaResult.causa_principal,
        impacto: iaResult.impacto,
        contexto_ia: iaResult.contexto,
        acoes: iaResult.acoes,
        recomendacao: iaResult.recomendacao_gestao,
        criado_em: new Date().toLocaleString('pt-BR'),
      })
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Erro ao salvar — tente novamente')
    } finally {
      setSaving(false)
    }
  }, [save, date, periodo, count, pico, contextoReal, iaResult, onSaved])

  const excluir = useCallback(async () => {
    if (!savedId) return
    setDeleting(true)
    setSaveError('')
    try {
      await remove(savedId)
      onDeleted(savedId)
      setSavedId(undefined)
      setIaResult(null)
      setContextoReal('')
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Erro ao excluir')
    } finally {
      setDeleting(false)
    }
  }, [remove, savedId, onDeleted])

  const isSaved = !!savedId

  return (
    <div ref={panelRef}
         className="rounded-2xl border bg-card p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200"
         style={{ borderColor: pico ? '#ef444440' : '#3b82f640' }}>

      {/* Cabeçalho do painel */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-[15px] text-text">{date}</span>
            <span className="font-mono text-[13px] text-muted">{fmt(count)} OS abertas</span>
            {pico && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                PICO · Z={pico.zScore}σ
              </span>
            )}
            {isSaved && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
                Salvo
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted">
            {isSaved ? 'Justificativa salva — edite e regere para atualizar.' : 'Informe o que aconteceu e gere a justificativa para a gestão.'}
          </p>
        </div>
        <button onClick={onClose} className="text-muted hover:text-text transition-colors flex-shrink-0">
          <X size={14} />
        </button>
      </div>

      {/* Campo contexto real */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted">
          O que aconteceu neste dia?
        </label>
        <textarea
          value={contextoReal}
          onChange={e => setContextoReal(e.target.value)}
          placeholder="Ex: OS abertas para troca de roteadores Zyxel com firmware defeituoso…"
          rows={2}
          className="w-full rounded-xl border border-white/[0.08] bg-surface/30 px-3 py-2.5
                     text-[12px] text-text placeholder:text-muted/40 resize-none
                     focus:outline-none focus:border-violet-500/40 transition-colors"
        />
      </div>

      {/* Botões de ação */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={gerarIA}
          disabled={iaLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold text-[12px]
                     transition-all disabled:opacity-50
                     border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20">
          <Sparkles size={13} className={iaLoading ? 'animate-pulse' : ''} />
          {iaLoading ? 'Gerando…' : iaResult ? 'Regerar com IA' : 'Gerar Justificativa (IA)'}
        </button>
        {iaResult && !isSaved && (
          <button
            onClick={salvar}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold text-[12px]
                       transition-all disabled:opacity-50
                       border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20">
            <Bookmark size={12} />
            {saving ? 'Salvando…' : 'Salvar no Histórico'}
          </button>
        )}
        {iaResult && isSaved && (
          <button
            onClick={salvar}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold text-[12px]
                       transition-all disabled:opacity-50
                       border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20">
            <BookmarkCheck size={12} />
            {saving ? 'Atualizando…' : 'Atualizar Histórico'}
          </button>
        )}
        {isSaved && (
          <button
            onClick={excluir}
            disabled={deleting}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px]
                       transition-all disabled:opacity-50
                       border-red-500/20 text-red-400/70 hover:text-red-400 hover:border-red-500/40">
            <Trash2 size={12} />
            {deleting ? 'Excluindo…' : 'Excluir'}
          </button>
        )}
      </div>

      {iaError && (
        <p className="text-[12px] text-red-400 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">{iaError}</p>
      )}
      {saveError && (
        <p className="text-[12px] text-red-400 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
          Erro ao salvar: {saveError}
        </p>
      )}

      {/* Resultado IA */}
      {iaResult && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Sparkles size={12} className="text-violet-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1 text-[12px]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-violet-400/70">Causa Principal</p>
                <p className="text-text leading-relaxed mt-0.5">{iaResult.causa_principal}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Impacto</p>
                  <p className="text-text leading-relaxed mt-0.5">{iaResult.impacto}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Contexto</p>
                  <p className="text-text leading-relaxed mt-0.5">{iaResult.contexto}</p>
                </div>
              </div>
              {iaResult.acoes?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted mb-1">Ações</p>
                  <ul className="space-y-0.5">
                    {iaResult.acoes.map((a, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-text">
                        <span className="text-violet-400 flex-shrink-0">•</span>{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="pt-2 border-t border-violet-500/10">
                <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Recomendação para Gestão</p>
                <p className="text-violet-200 font-medium leading-relaxed mt-0.5">{iaResult.recomendacao_gestao}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Card do histórico ────────────────────────────────────────────────────────

function HistoricoCard({ record, onDelete }: { record: JustificativaRecord; onDelete: (id: number) => void }) {
  const { remove } = useJustificativasActions()
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const excluir = async () => {
    setDeleting(true)
    await remove(record.id).catch(() => null)
    onDelete(record.id)
    setDeleting(false)
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Data badge */}
        <div className="flex-shrink-0 rounded-lg border border-white/[0.08] bg-surface/30 px-2.5 py-1.5 text-center min-w-[52px]">
          <p className="font-mono font-bold text-[11px] text-primary">{record.data_pico.slice(5)}</p>
          <p className="font-mono text-[10px] text-muted">{record.data_pico.slice(0, 4)}</p>
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] text-muted">{fmt(record.count_os)} OS</span>
            {record.zscore != null && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                Z={record.zscore}σ
              </span>
            )}
          </div>
          <p className="text-[12px] text-text leading-snug line-clamp-2">{record.causa_principal}</p>
          {record.contexto_real && (
            <p className="text-[11px] text-muted/70 line-clamp-1 italic">"{record.contexto_real}"</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg text-muted hover:text-text transition-colors">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button
            onClick={excluir}
            disabled={deleting}
            className="p-1.5 rounded-lg text-muted/50 hover:text-red-400 transition-colors disabled:opacity-30">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.05] px-4 py-3 space-y-3 bg-surface/10 text-[12px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted mb-0.5">Impacto</p>
              <p className="text-text leading-relaxed">{record.impacto || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted mb-0.5">Contexto</p>
              <p className="text-text leading-relaxed">{record.contexto_ia || '—'}</p>
            </div>
          </div>
          {record.acoes?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted mb-1">Ações</p>
              <ul className="space-y-0.5">
                {record.acoes.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-text">
                    <span className="text-violet-400 flex-shrink-0">•</span>{a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="pt-2 border-t border-white/[0.05]">
            <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted mb-0.5">Recomendação para Gestão</p>
            <p className="text-violet-200 leading-relaxed">{record.recomendacao || '—'}</p>
          </div>
          <p className="text-[10px] text-muted/50">Salvo em {record.criado_em}</p>
        </div>
      )}
    </div>
  )
}

// ─── JustificativaPage ───────────────────────────────────────────────────────

export default function JustificativaPage() {
  const { rows, allRows, isLoading, error } = useOSDerived()
  const { data: historico = [], refetch: refetchHistorico, error: historicoError } = useJustificativas()

  const data = useMemo<JustificativaData>(
    () => buildJustificativa(rows, allRows),
    [rows, allRows],
  )

  // Linha do tempo completa (todos os dias)
  const timelineAll = useMemo<TimelineEntry[]>(() => {
    const picoSet = new Set(data.picosDia.map(p => p.date))
    const picoMap = new Map(data.picosDia.map(p => [p.date, p.zScore]))
    const diaCnt  = new Map<string, number>()
    for (const r of rows) {
      const d = (r.datacadastro || '').split(' ')[0]
      if (d) diaCnt.set(d, (diaCnt.get(d) ?? 0) + 1)
    }
    return [...diaCnt.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count, isPico: picoSet.has(date), zScore: picoMap.get(date) }))
  }, [rows, data.picosDia])

  // Dias com justificativa salva
  const savedDates   = useMemo(() => new Set(historico.map(j => j.data_pico)), [historico])
  const savedByDate  = useMemo(() => new Map(historico.map(j => [j.data_pico, j])), [historico])

  // Seleção de dia na timeline
  const [selectedDate,  setSelectedDate]  = useState<string | null>(null)
  const [selectedCount, setSelectedCount] = useState(0)
  const selectedPico = data.picosDia.find(p => p.date === selectedDate)

  const handleSelectDate = useCallback((date: string, count: number) => {
    setSelectedDate(prev => prev === date ? null : date)
    setSelectedCount(count)
  }, [])

  const handleSaved = useCallback(() => {
    refetchHistorico()
  }, [refetchHistorico])

  const handleDeleted = useCallback(() => {
    refetchHistorico()
  }, [refetchHistorico])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="ml-3 text-[13px] text-muted">Carregando dados…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-[12px] text-red-400">
        Erro ao carregar OS: {String(error)}
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[18px] font-bold text-text">Justificativa de Atrasos</h1>
          <p className="text-[12px] text-muted mt-0.5">
            Clique em qualquer barra para registrar o que aconteceu naquele dia e gerar a justificativa para a gestão
          </p>
        </div>
        <button
          onClick={() => exportCsv(data, historico)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08]
                     bg-surface/40 text-[12px] text-muted hover:text-text transition-colors">
          <Download size={11} />
          Exportar CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiChip label="Picos de abertura"    value={data.picosDia.length}        color="#ef4444" />
        <KpiChip label="Justificativas salvas" value={historico.length}            color="#22d3ee" />
        <KpiChip label="OS REDE no período"   value={fmt(data.totalRede)}         color="#c084fc" />
        <KpiChip label="Média aberturas/dia"  value={`${data.mediaAberturas}/d`}  color="#94a3b8" />
      </div>

      {/* Timeline interativa */}
      <section className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-[3px] h-4 rounded-full bg-blue-500 flex-shrink-0" />
            <TrendingUp size={12} className="text-blue-400" />
            <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">
              Aberturas por Dia — clique para justificar
            </span>
          </div>
          <div className="flex items-center gap-3 ml-auto text-[10px] text-muted flex-wrap">
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500" /> Pico anômalo</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-cyan-400" /> Com justificativa</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-violet-400" /> Selecionado</span>
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
          <TimelineInterativa
            entries={timelineAll}
            picosDia={data.picosDia}
            savedDates={savedDates}
            selectedDate={selectedDate}
            onSelect={handleSelectDate}
          />
          {data.picosDia.length === 0 && (
            <p className="text-[12px] text-muted mt-2">Nenhum pico detectado no período atual.</p>
          )}
        </div>
      </section>

      {/* Painel inline do dia selecionado */}
      {selectedDate && (
        <PainelDia
          key={selectedDate}
          date={selectedDate}
          count={selectedCount}
          pico={selectedPico}
          existente={savedByDate.get(selectedDate)}
          periodo={{ inicio: timelineAll[0]?.date ?? '', fim: timelineAll[timelineAll.length - 1]?.date ?? '' }}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {/* Histórico de justificativas */}
      {historicoError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[12px] text-red-400 flex items-start justify-between gap-3">
          <span>Erro ao carregar histórico: {(historicoError as Error).message}</span>
          <button onClick={() => refetchHistorico()} className="text-red-400/70 hover:text-red-400 flex-shrink-0 underline">
            Tentar novamente
          </button>
        </div>
      )}

      {historico.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-[3px] h-4 rounded-full bg-cyan-500 flex-shrink-0" />
            <BookmarkCheck size={12} className="text-cyan-400" />
            <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">
              Histórico de Justificativas — {historico.length} registro{historico.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {historico.map(j => (
              <HistoricoCard key={j.id} record={j} onDelete={handleDeleted} />
            ))}
          </div>
        </section>
      )}

      {historico.length === 0 && !selectedDate && (
        <div className="rounded-xl border border-white/[0.05] bg-surface/10 p-6 text-center space-y-1">
          <Bookmark size={20} className="mx-auto text-muted/40" />
          <p className="text-[12px] text-muted">Nenhuma justificativa salva ainda.</p>
          <p className="text-[11px] text-muted/60">Clique em uma barra da timeline para começar.</p>
        </div>
      )}

      {/* Tabelas auxiliares */}
      {(data.picosDia.length > 0 || data.clustersAtivos.length > 0 || data.bairrosAnomalia.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">

          {/* Picos */}
          {data.picosDia.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={11} className="text-red-400" />
                <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Dias com Volume Anômalo</span>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-white/[0.05] bg-surface/10">
                      {['Data','OS','Z-Score',''].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.picosDia.map(p => (
                      <tr key={p.date}
                          onClick={() => handleSelectDate(p.date, p.count)}
                          className="border-b border-white/[0.03] hover:bg-surface/10 transition-colors cursor-pointer">
                        <td className="px-3 py-2 font-mono text-text">{p.date}</td>
                        <td className="px-3 py-2 font-mono font-bold text-red-400">{fmt(p.count)}</td>
                        <td className="px-3 py-2 font-mono text-amber-400">{p.zScore}σ</td>
                        <td className="px-3 py-2">
                          {savedDates.has(p.date)
                            ? <BookmarkCheck size={11} className="text-cyan-400" />
                            : <Bookmark size={11} className="text-muted/30" />
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Clusters */}
          {data.clustersAtivos.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <MapPin size={11} className="text-orange-400" />
                <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Clusters Ativos por Bairro</span>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-white/[0.05] bg-surface/10">
                      {['Bairro','Cidade','OS Ativas','REDE'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.clustersAtivos.slice(0, 15).map((c, i) => (
                      <tr key={i} className="border-b border-white/[0.03] hover:bg-surface/10 transition-colors">
                        <td className="px-3 py-2 text-text">{c.bairro}</td>
                        <td className="px-3 py-2 text-muted">{c.cidade}</td>
                        <td className="px-3 py-2 font-mono font-bold text-orange-400">{c.total}</td>
                        <td className="px-3 py-2 font-mono">
                          {c.redeTotal > 0 ? <span className="text-purple-400 font-bold">{c.redeTotal}</span> : <span className="text-muted/30">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* OS REDE */}
          {data.osRedePorDia.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap size={11} className="text-purple-400" />
                <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted">OS REDE por Dia</span>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden max-h-52 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0">
                    <tr className="border-b border-white/[0.05] bg-card">
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-muted">Data</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-muted">OS REDE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.osRedePorDia.filter(d => d.count > 0).sort((a, b) => b.count - a.count).slice(0, 15).map(d => (
                      <tr key={d.date} className="border-b border-white/[0.03]">
                        <td className="px-3 py-1.5 font-mono text-muted">{d.date}</td>
                        <td className="px-3 py-1.5 font-mono font-bold text-purple-400">{d.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Bairros SLA */}
          {data.bairrosAnomalia.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={11} className="text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted">Bairros com SLA Anômalo</span>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-white/[0.05] bg-surface/10">
                      {['Bairro','Total','SLA Exc.','%'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.bairrosAnomalia.map(b => (
                      <tr key={b.bairro} className="border-b border-white/[0.03] hover:bg-surface/10 transition-colors">
                        <td className="px-3 py-2 text-text">{b.bairro}</td>
                        <td className="px-3 py-2 font-mono text-muted">{b.total}</td>
                        <td className="px-3 py-2 font-mono text-amber-400">{b.slaExc}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 h-1.5 bg-surface/40 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-amber-500" style={{ width: `${b.ratePct}%` }} />
                            </div>
                            <span className="font-mono font-bold text-amber-400 text-[10px]">{b.ratePct}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

    </div>
  )
}
