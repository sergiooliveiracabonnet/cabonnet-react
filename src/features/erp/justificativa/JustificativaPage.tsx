import { useMemo, useState, useCallback } from 'react'
import { Sparkles, Download, AlertTriangle, MapPin, TrendingUp, Zap } from 'lucide-react'
import { useOSDerived } from '../../../contexts/OSDataContext'
import { buildJustificativa, type JustificativaData } from '../../../lib/builders/justificativa'
import { ai } from '../../../lib/api'

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

function exportCsv(data: JustificativaData): void {
  function cell(v: string | number): string {
    const s = String(v)
    return s.includes(';') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const sections: string[] = ['Picos de Abertura', 'Data;Qtd Abertas;Z-Score']
  for (const p of data.picosDia) sections.push([p.date, p.count, p.zScore].map(cell).join(';'))
  sections.push('', 'Bairros com SLA Anômalo', 'Bairro;Total OS;SLA Excedido;% SLA Exc.')
  for (const b of data.bairrosAnomalia) sections.push([b.bairro, b.total, b.slaExc, b.ratePct + '%'].map(cell).join(';'))
  sections.push('', 'Clusters Ativos (≥3 OS)', 'Bairro;Cidade;Total OS Ativas;OS REDE')
  for (const c of data.clustersAtivos) sections.push([c.bairro, c.cidade, c.total, c.redeTotal].map(cell).join(';'))
  sections.push('', 'OS REDE por Dia (Rompimentos)', 'Data;OS REDE')
  for (const r of data.osRedePorDia) sections.push([r.date, r.count].map(cell).join(';'))

  const blob = new Blob(['﻿' + sections.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'justificativa-atrasos.csv'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Subcomponente: Linha do Tempo de Aberturas ───────────────────────────────

interface TimelineEntry { date: string; count: number; isPico: boolean; zScore?: number }

function TimelineBar({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) return <p className="text-[12px] text-muted py-4">Sem dados de abertura</p>
  const max = Math.max(1, ...entries.map(e => e.count))
  return (
    <div className="flex items-end gap-0.5 h-24 overflow-x-auto pb-1">
      {entries.map(e => (
        <div key={e.date} className="flex flex-col items-center gap-0.5 flex-shrink-0" style={{ minWidth: '8px' }}
             title={`${e.date}: ${e.count} aberturas${e.isPico ? ` (pico Z=${e.zScore})` : ''}`}>
          <div
            className="rounded-t transition-all"
            style={{
              width:      '8px',
              height:     `${Math.max(3, Math.round((e.count / max) * 88))}px`,
              background: e.isPico ? '#ef4444' : '#3b82f660',
            }}
          />
        </div>
      ))}
    </div>
  )
}

// ─── Resposta da IA de justificativa ─────────────────────────────────────────

interface JustificativaIA {
  causa_principal:       string
  impacto:               string
  contexto:              string
  acoes:                 string[]
  recomendacao_gestao:   string
  cached?:               boolean
}

// ─── JustificativaPage ───────────────────────────────────────────────────────

export default function JustificativaPage() {
  const { rows, allRows, isLoading, error } = useOSDerived()

  const data = useMemo<JustificativaData>(
    () => buildJustificativa(rows, allRows),
    [rows, allRows],
  )

  // Linha do tempo completa
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

  const [iaResult,  setIaResult]  = useState<JustificativaIA | null>(null)
  const [iaLoading, setIaLoading] = useState(false)
  const [iaError,   setIaError]   = useState('')

  const analisar = useCallback(async () => {
    setIaLoading(true)
    setIaError('')
    try {
      const payload = {
        picosDia:        data.picosDia,
        bairrosAnomalia: data.bairrosAnomalia,
        clustersAtivos:  data.clustersAtivos.slice(0, 15),
        osRede:          data.osRedePorDia.filter(d => d.count > 0).slice(0, 10),
        contexto:        {
          mediaAberturasDia: data.mediaAberturas,
          totalRede:         data.totalRede,
        },
      }
      const res = await ai.justificativaBacklog(payload) as JustificativaIA
      setIaResult(res)
    } catch (e: unknown) {
      setIaError(e instanceof Error ? e.message : 'Erro ao chamar IA')
    } finally {
      setIaLoading(false)
    }
  }, [data])

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
    <div className="space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[18px] font-bold text-text">Justificativa de Atrasos</h1>
          <p className="text-[12px] text-muted mt-0.5">
            Análise de picos de abertura, clusters geográficos e evidências de rompimento — período atual
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportCsv(data)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08]
                       bg-surface/40 text-[12px] text-muted hover:text-text transition-colors">
            <Download size={11} />
            Exportar CSV
          </button>
          <button
            onClick={analisar}
            disabled={iaLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold text-[12px]
                       transition-all disabled:opacity-50
                       border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20">
            <Sparkles size={13} className={iaLoading ? 'animate-pulse' : ''} />
            {iaLoading ? 'Gerando justificativa…' : iaResult ? 'Regerar com IA' : 'Gerar Justificativa (IA)'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiChip label="Picos de abertura" value={data.picosDia.length}        color="#ef4444" />
        <KpiChip label="Clusters ativos"   value={data.clustersAtivos.length}  color="#f97316" />
        <KpiChip label="OS REDE no período" value={fmt(data.totalRede)}        color="#c084fc" />
        <KpiChip label="Média aberturas/dia" value={`${data.mediaAberturas}/d`} color="#22d3ee" />
      </div>

      {/* Narrativa IA */}
      {iaError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[12px] text-red-400">
          {iaError}
        </div>
      )}
      {iaResult && (
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5 space-y-4">
          <div className="flex items-start gap-2">
            <Sparkles size={14} className="text-violet-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-3 flex-1">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-violet-400/70 mb-0.5">Causa Principal</p>
                <p className="text-[13px] font-semibold text-text">{iaResult.causa_principal}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted mb-0.5">Impacto Operacional</p>
                  <p className="text-[12px] text-text leading-relaxed">{iaResult.impacto}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted mb-0.5">Contexto</p>
                  <p className="text-[12px] text-text leading-relaxed">{iaResult.contexto}</p>
                </div>
              </div>
              {iaResult.acoes?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted mb-1.5">Ações Tomadas / Em Curso</p>
                  <ul className="space-y-1">
                    {iaResult.acoes.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-text">
                        <span className="text-violet-400 flex-shrink-0 mt-0.5">•</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="pt-2 border-t border-violet-500/10">
                <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted mb-0.5">Recomendação para Gestão</p>
                <p className="text-[12px] text-violet-200 leading-relaxed font-medium">{iaResult.recomendacao_gestao}</p>
              </div>
            </div>
          </div>
          {iaResult.cached && <p className="text-[10px] text-muted">Resultado em cache</p>}
        </div>
      )}

      {/* Linha do tempo de aberturas */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-[3px] h-4 rounded-full bg-blue-500 flex-shrink-0" />
          <TrendingUp size={12} className="text-blue-400" />
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Linha do Tempo de Aberturas</span>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-card p-4 space-y-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-red-500" />
              <span className="text-[11px] text-muted">Pico (Z &gt; 2σ)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: '#3b82f660' }} />
              <span className="text-[11px] text-muted">Dia normal</span>
            </div>
          </div>
          <TimelineBar entries={timelineAll} />
          {data.picosDia.length === 0 && (
            <p className="text-[12px] text-muted">Nenhum pico detectado no período atual.</p>
          )}
        </div>
      </section>

      {/* Picos */}
      {data.picosDia.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-[3px] h-4 rounded-full bg-red-500 flex-shrink-0" />
            <AlertTriangle size={12} className="text-red-400" />
            <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-red-400">
              Picos de Abertura — Dias com Volume Anômalo
            </span>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.05] bg-surface/10">
                  {['Data','Aberturas','Z-Score','Severidade'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.picosDia.map(p => (
                  <tr key={p.date} className="border-b border-white/[0.03] hover:bg-surface/10 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-text">{p.date}</td>
                    <td className="px-4 py-2.5 font-mono font-bold text-red-400">{fmt(p.count)}</td>
                    <td className="px-4 py-2.5 font-mono text-amber-400">{p.zScore}σ</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-0.5">
                        {Array.from({ length: Math.min(5, Math.floor(p.zScore)) }, (_, i) => (
                          <div key={i} className="w-2 h-2 rounded-sm bg-red-500" />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Clusters por bairro */}
        {data.clustersAtivos.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-[3px] h-4 rounded-full bg-orange-500 flex-shrink-0" />
              <MapPin size={12} className="text-orange-400" />
              <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">
                Clusters Ativos por Bairro
              </span>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-white/[0.05] bg-surface/10">
                    {['Bairro','Cidade','OS Ativas','REDE'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.clustersAtivos.slice(0, 20).map((c, i) => (
                    <tr key={i} className="border-b border-white/[0.03] hover:bg-surface/10 transition-colors">
                      <td className="px-4 py-2 text-text">{c.bairro}</td>
                      <td className="px-4 py-2 text-muted">{c.cidade}</td>
                      <td className="px-4 py-2 font-mono font-bold text-orange-400">{c.total}</td>
                      <td className="px-4 py-2 font-mono">
                        {c.redeTotal > 0
                          ? <span className="text-purple-400 font-bold">{c.redeTotal}</span>
                          : <span className="text-muted/40">—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* OS REDE por dia */}
        {data.osRedePorDia.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-[3px] h-4 rounded-full bg-purple-500 flex-shrink-0" />
              <Zap size={12} className="text-purple-400" />
              <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">
                OS REDE por Dia — Evidência de Rompimento
              </span>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
              <div className="flex items-end gap-0.5 h-24 px-4 pb-3 pt-4 overflow-x-auto">
                {(() => {
                  const max = Math.max(1, ...data.osRedePorDia.map(d => d.count))
                  return data.osRedePorDia.map(d => (
                    <div key={d.date} title={`${d.date}: ${d.count} REDE`}
                         className="flex flex-col items-center justify-end flex-shrink-0" style={{ minWidth: '10px' }}>
                      <div className="rounded-t bg-purple-500/60"
                           style={{ width: '8px', height: `${Math.max(3, Math.round((d.count / max) * 72))}px` }} />
                    </div>
                  ))
                })()}
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-white/[0.05] bg-surface/10 sticky top-0">
                      <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-muted">Data</th>
                      <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-muted">OS REDE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.osRedePorDia.filter(d => d.count > 0).sort((a, b) => b.count - a.count).slice(0, 15).map(d => (
                      <tr key={d.date} className="border-b border-white/[0.03]">
                        <td className="px-4 py-1.5 font-mono text-muted">{d.date}</td>
                        <td className="px-4 py-1.5 font-mono font-bold text-purple-400">{d.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Bairros SLA anômalo */}
      {data.bairrosAnomalia.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-[3px] h-4 rounded-full bg-amber-500 flex-shrink-0" />
            <AlertTriangle size={12} className="text-amber-400" />
            <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">
              Bairros com SLA Anômalo — Prioridade de Atenção
            </span>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.05] bg-surface/10">
                  {['Bairro','Total OS','SLA Exc.','% SLA Exc.','Z-Score'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.bairrosAnomalia.map(b => (
                  <tr key={b.bairro} className="border-b border-white/[0.03] hover:bg-surface/10 transition-colors">
                    <td className="px-4 py-2 text-text">{b.bairro}</td>
                    <td className="px-4 py-2 font-mono text-muted">{b.total}</td>
                    <td className="px-4 py-2 font-mono text-amber-400">{b.slaExc}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-surface/40 rounded-full overflow-hidden" style={{ maxWidth: '80px' }}>
                          <div className="h-full rounded-full bg-amber-500" style={{ width: `${b.ratePct}%` }} />
                        </div>
                        <span className="font-mono font-bold text-amber-400">{b.ratePct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono text-muted">{b.zScore}σ</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data.picosDia.length === 0 && data.clustersAtivos.length === 0 && data.totalRede === 0 && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-[12px] text-emerald-400 text-center">
          Nenhuma anomalia detectada no período atual.
        </div>
      )}

    </div>
  )
}
