import { useMemo, useState, useCallback } from 'react'
import {
  Download, AlertTriangle, MapPin, TrendingUp, Zap, Bookmark, BookmarkCheck,
} from 'lucide-react'
import { useOSDerived } from '../../../contexts/OSDataContext'
import { buildJustificativa, type JustificativaData } from '../../../lib/builders/justificativa'
import { useJustificativas } from '../../../hooks/useJustificativas'
import {
  fmt, KpiChip, exportCsv, TimelineInterativa, PainelDia, HistoricoCard, type TimelineEntry,
} from './JustificativaComponents'

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
