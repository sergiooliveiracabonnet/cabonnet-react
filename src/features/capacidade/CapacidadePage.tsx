import { useState, useMemo } from 'react'
import { BarChart2, Target, AlertCircle, Sparkles, Clock, Zap } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, ChartTooltip, Grid, Legend } from '../../components/ui/bar-chart'
import { useOSDerived } from '../../contexts/OSDataContext'
import { useUIStore } from '../../store/uiStore'
import { useERPStore } from '../../store/erpStore'
import { buildCapacidade } from '../../lib/builders'
import { shortEquipe } from '../../lib/osFormat'
import { SectionTitle } from '../../components/ui/SectionTitle'
import { ChartCard } from '../../components/ui/ChartCard'
import { useAICapacidade } from '../../hooks/useAICapacidade'

const SEMAFORO_CFG = {
  ok:      { border: 'border-green/20',  value: 'text-green',  badge: 'OK'      },
  atencao: { border: 'border-yellow/30', value: 'text-yellow', badge: 'Atenção' },
  critico: { border: 'border-red/30',    value: 'text-red',    badge: 'Crítico' },
}

export default function CapacidadePage() {
  const [_modo,     _setModo]     = useState('hoje')
  const [metaInst,  setMetaInst]  = useState(25)
  const [metaManut, setMetaManut] = useState(35)
  const [metaServ,  setMetaServ]  = useState(20)

  const { rows, allRows } = useOSDerived()
  const { dateFilter }               = useUIStore()
  const { equipeIndisponivel }       = useERPStore()

  // Filtra rows excluindo equipes marcadas como indisponíveis
  const rowsDisponiveis = useMemo(() => {
    const codes = Object.keys(equipeIndisponivel)
    if (!codes.length) return rows
    return rows.filter(r => {
      const code = shortEquipe(r.nomedaequipe || '').split(' - ')[0].trim()
      return !equipeIndisponivel[code]
    })
  }, [rows, equipeIndisponivel])

  const nIndisponiveis = useMemo(
    () => Object.keys(equipeIndisponivel).length,
    [equipeIndisponivel]
  )


  const { executivo, hipoteses, cobertura, equipes: _equipes, semaforo, projecao } = useMemo(
    () => buildCapacidade(rowsDisponiveis, { metaInst, metaManut, metaServ, dateFilter }, allRows),
    [rowsDisponiveis, allRows, metaInst, metaManut, metaServ, dateFilter]
  )

  const aiCapacidadeInput = useMemo(() => ({
    fila:           executivo.fila,
    ritmo_dia:      parseFloat((executivo.total / Math.max(1, 30)).toFixed(1)),
    meta_dia:       metaInst + metaManut + metaServ,
    dias_previstos: executivo.prev,
    equipes_ativas: _equipes.filter(e => e.fila > 0).length,
    por_tipo:       {
      Instalação: cobertura[0]?.value ?? 0,
      Manutenção: cobertura[1]?.value ?? 0,
      Serviços:   cobertura[2]?.value ?? 0,
    },
  }), [executivo, metaInst, metaManut, metaServ, _equipes, cobertura])

  const { data: aiCapacidade, isLoading: aiLoading } = useAICapacidade(aiCapacidadeInput)

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <BarChart2 size={16} className="text-primary" />
        <h2 className="font-headline text-xl font-semibold text-text">Capacidade Operacional</h2>
      </div>

      {/* Aviso equipes indisponíveis */}
      {nIndisponiveis > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow/[0.07] border border-yellow/[0.20] text-[11px] text-yellow">
          <AlertCircle size={13} className="flex-shrink-0" />
          <span>
            <strong>{nIndisponiveis}</strong> equipe{nIndisponiveis > 1 ? 's' : ''} indisponível{nIndisponiveis > 1 ? 'eis' : ''} excluída{nIndisponiveis > 1 ? 's' : ''} da projeção —
            gerencie em <strong>ERP → Equipes</strong>
          </span>
        </div>
      )}

      {/* Painel executivo */}
      <div className="bg-card border border-white/[0.08] rounded-xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-6">
          <div className="flex-1 min-w-[200px]">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-2">Situação do Dia</p>
            <p className="text-[12px] leading-[1.8] text-secondary border-l-[3px] border-primary pl-3">
              {executivo.narrativa ?? 'Carregando...'}
            </p>
          </div>
          <div className="flex gap-4 flex-wrap flex-shrink-0">
            {[
              { label: 'Total executado', value: executivo.total, color: 'text-green',   sub: 'OS concluídas' },
              { label: 'Fila total',      value: executivo.fila,  color: 'text-yellow',  sub: 'OS em aberto' },
              { label: 'Previsão fila',   value: executivo.prev,  color: 'text-primary', sub: 'dias p/ zerar' },
            ].map((b) => (
              <div key={b.label} className="text-center p-3 bg-surface border border-white/[0.08] rounded-xl min-w-[110px]">
                <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-muted mb-1">{b.label}</p>
                <p className={`font-headline font-bold text-[32px] leading-none ${b.color}`}>{b.value ?? '—'}</p>
                <p className="text-[11px] text-muted mt-1">{b.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── AI Capacidade ─────────────────────────────────────────────────── */}
      {(aiLoading || aiCapacidade) && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-primary" />
            <span className="text-[11px] font-bold text-primary/80 uppercase tracking-wide">
              Diagnóstico de Capacidade · IA
            </span>
            {aiLoading && (
              <span className="text-[10px] text-muted animate-pulse ml-auto">Analisando…</span>
            )}
          </div>
          {aiCapacidade && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {aiCapacidade.diagnostico && (
                <div className="flex gap-2.5">
                  <AlertCircle size={14} className="text-red flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-red/70 mb-0.5">Diagnóstico</p>
                    <p className="text-[12px] text-secondary leading-relaxed">{aiCapacidade.diagnostico}</p>
                  </div>
                </div>
              )}
              {aiCapacidade.projecao && (
                <div className="flex gap-2.5">
                  <Clock size={14} className="text-yellow flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-yellow/70 mb-0.5">Projeção</p>
                    <p className="text-[12px] text-secondary leading-relaxed">{aiCapacidade.projecao}</p>
                  </div>
                </div>
              )}
              {aiCapacidade.recomendacao && (
                <div className="flex gap-2.5">
                  <Zap size={14} className="text-green flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-green/70 mb-0.5">Recomendação</p>
                    <p className="text-[12px] text-secondary leading-relaxed">{aiCapacidade.recomendacao}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hipóteses */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {hipoteses.map((h, i) => (
          <div key={i} className="bg-card border border-white/[0.08] rounded-xl p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-primary mb-2">❓ {h.pergunta}</p>
            <p className="text-[12px] font-bold text-text">{h.resposta ?? '—'}</p>
          </div>
        ))}
      </div>

      {/* Metas */}
      <div className="bg-card border border-white/[0.08] rounded-xl p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-4 flex items-center gap-2">
          <Target size={12} /> Configurar Metas Diárias
        </p>
        <div className="flex flex-wrap gap-4">
          {[
            { label: 'Meta Instalação', value: metaInst, set: setMetaInst },
            { label: 'Meta Manutenção', value: metaManut, set: setMetaManut },
            { label: 'Meta Serviços',   value: metaServ,  set: setMetaServ },
          ].map(({ label, value, set }) => (
            <label key={label} className="flex flex-col gap-1">
              <span className="text-[11px] text-muted font-semibold">{label}</span>
              <input
                type="number" min={1} max={200} value={value}
                onChange={e => set(Number(e.target.value))}
                className="w-20 bg-surface border border-white/[0.08] rounded-md px-2 py-1 text-[13px] font-mono text-text text-center outline-none focus:border-primary/50"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Cobertura */}
      <SectionTitle icon={BarChart2}>Cobertura de Metas por Tipo</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cobertura.map((c) => (
          <div key={c.label} className="bg-card border border-white/[0.08] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-text">{c.label}</p>
              <span className="font-mono text-[11px] font-bold" style={{ color: c.cor }}>{c.pct}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xl font-bold text-text">{c.value}</span>
              <span className="text-[11px] text-muted">/ meta {c.meta}</span>
            </div>
            <div className="mt-2 h-1.5 bg-surface rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, c.pct)}%`, background: c.cor }} />
            </div>
          </div>
        ))}
      </div>

      {/* Semáforo equipes */}
      <SectionTitle icon={BarChart2}>Semáforo de Execução por Equipe</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {semaforo.map((e) => {
          const cfg = (SEMAFORO_CFG as Record<string, typeof SEMAFORO_CFG.critico>)[e.status] ?? SEMAFORO_CFG.critico
          return (
            <div key={e.nome} className={`bg-card border rounded-xl p-3 ${cfg.border}`}>
              <p className="text-[11px] font-semibold text-text truncate">{e.nome}</p>
              <p className={`font-mono font-bold text-xl mt-1 ${cfg.value}`}>
                {e.value}
              </p>
              <p className="text-[11px] text-muted">meta {e.meta} · <span className="sr-only">{cfg.badge}</span></p>
            </div>
          )
        })}
      </div>

      {/* Projeção */}
      <SectionTitle icon={BarChart2}>Projeção de Fila por Equipe</SectionTitle>

      {/* Gráfico de fila vs. ritmo */}
      {projecao.length > 0 ? (
        <ChartCard title="Fila Atual vs. Ritmo Diário por Equipe" dot="#3b82f6" height="h-64">
          <BarChart data={projecao.map(p => ({ name: p.equipe, Fila: p.fila, 'Ritmo/dia': p.ritmo }))}>
            <Bar dataKey="Fila" fill="rgba(59,130,246,0.7)" name="Fila" />
            <Bar dataKey="Ritmo/dia" fill="rgba(74,222,128,0.7)" name="Ritmo/dia" />
            <XAxis dataKey="name" />
            <YAxis />
            <Grid />
            <ChartTooltip />
            <Legend />
          </BarChart>
        </ChartCard>
      ) : (
        <div className="bg-card border border-white/[0.08] rounded-xl p-6 text-center">
          <p className="text-muted text-[12px]">Sem dados de equipes no período</p>
        </div>
      )}

      {/* Tabela de projeção */}
      <div className="bg-card border border-white/[0.08] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-white/[0.08] bg-surface">
                {['Equipe','Fila','OS/dia (período)','Dias p/ Zerar'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-[11px] font-bold text-muted uppercase tracking-[0.04em]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {projecao.map((p) => (
                <tr key={p.equipe} className="text-secondary hover:bg-primary/[0.04]">
                  <td className="px-4 py-2 font-semibold text-text">{p.equipe}</td>
                  <td className="px-4 py-2 font-mono">{p.fila}</td>
                  <td className="px-4 py-2 font-mono text-green">{p.ritmo}</td>
                  <td className="px-4 py-2 font-mono text-yellow">{p.dias}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
