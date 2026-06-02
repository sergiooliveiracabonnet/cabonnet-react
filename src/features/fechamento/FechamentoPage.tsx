import { useState, useMemo, useEffect, useRef } from 'react'
import { FileText, Download, Printer, ChevronRight } from 'lucide-react'
import { useOSDerived } from '../../contexts/OSDataContext'
import {
  ABA_LABEL, SLA_MIN,
  getPeriodDates, getPeriodoNome,
  filterRows, calcStats, isRede,
  exportRelatorioCSV,
  type TeamStats, type CidadeStats, type FechamentoStats,
} from './fechamentoUtils'
import { generateFechamentoPDF } from './fechamentoPDF'
import { useFechamentoAutomation, type FechamentoSnapshot } from './useFechamentoAutomation'
import type { OSRow } from '../../lib/types'

const ABAS     = ['global', 'instacable', 'wes', 'thm', 'rede']
const PERIODOS = [
  { key: 'diario',        label: 'Hoje'          },
  { key: 'ontem',         label: 'Ontem'         },
  { key: 'semanal',       label: '7 dias'        },
  { key: 'quinzenal',     label: '15 dias'       },
  { key: 'mensal',        label: 'Mês atual'     },
  { key: 'fechamento',    label: 'Fechamento'    },
  { key: 'personalizado', label: 'Personalizado' },
]

const TIPO_COR:    Record<string, string> = { Instalação: 'text-primary', Manutenção: 'text-green', Serviço: 'text-purple', Outros: 'text-muted' }
const TIPO_BORDER: Record<string, string> = { Instalação: 'border-primary', Manutenção: 'border-green', Serviço: 'border-purple', Outros: 'border-muted' }

function taxaCor(taxa: number): string {
  if (taxa >= SLA_MIN)      return 'text-green'
  if (taxa >= SLA_MIN - 15) return 'text-yellow'
  return 'text-red'
}

export default function FechamentoPage() {
  const { allRows, isLoading } = useOSDerived()

  const [aba,        setAba]        = useState('global')
  const [periodo,    setPeriodo]    = useState('mensal')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  const { from, to } = useMemo(() => {
    const cf = customFrom ? new Date(customFrom + 'T00:00:00') : null
    const ct = customTo   ? new Date(customTo   + 'T23:59:59') : null
    return getPeriodDates(periodo, cf, ct)
  }, [periodo, customFrom, customTo])

  const periodoNome = useMemo(() => getPeriodoNome(periodo), [periodo])

  const fmtDate = (d: Date | null): string => d ? d.toLocaleDateString('pt-BR') : '—'
  const periodoLabel = `${ABA_LABEL[aba]} · ${periodoNome} (${fmtDate(from)} – ${fmtDate(to)})`

  const { rows, rede, stats, statsRede } = useMemo(() => {
    const filtered = filterRows(allRows, { aba, from, to })
    let rows: OSRow[], rede: OSRow[]
    if (aba === 'rede') {
      rows = []; rede = filtered
    } else if (aba === 'global') {
      rows = filtered.filter(r => !isRede(r))
      rede = filtered.filter(r =>  isRede(r))
    } else {
      rows = filtered; rede = []
    }
    const stats     = calcStats(rows.length ? rows : filtered, aba)
    const statsRede = rede.length ? calcStats(rede, 'rede') : null
    return { rows, rede, stats, statsRede }
  }, [allRows, aba, from, to])

  const pdfDataRef = useRef<FechamentoSnapshot | null>(null)
  useEffect(() => {
    pdfDataRef.current = { rows, rede, stats, statsRede, periodoLabel }
  }, [rows, rede, stats, statsRede, periodoLabel])

  useFechamentoAutomation(pdfDataRef, isLoading, setAba, setPeriodo)

  function handleExportCSV() {
    exportRelatorioCSV(rows, rede, stats, statsRede, periodoLabel)
  }

  function handleExportPDF() {
    const doc   = generateFechamentoPDF({ rows, rede, stats, statsRede, periodoLabel })
    const fname = `relatorio-cabonnet-${new Date().toISOString().slice(0, 10)}.pdf`
    doc.save(fname)
  }

  function handlePrint() {
    window.print()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Cabeçalho ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <FileText size={16} className="text-primary flex-shrink-0" />
        <h2 className="font-headline text-xl font-semibold text-text">Relatório de Fechamento</h2>
        <span className="text-[11px] text-muted">— fechamento operacional por período e escopo</span>
      </div>

      {/* ── Toolbar: Período ── */}
      <div className="bg-card border border-white/[0.08] rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PERIODOS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-fast
                ${periodo === p.key
                  ? 'bg-primary text-white'
                  : 'bg-bg text-secondary border border-white/[0.08] hover:bg-surface/40 hover:text-text'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {periodo === 'personalizado' && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-2 py-1.5 rounded-md text-[11px] bg-bg border border-white/[0.08] text-text focus:outline-none focus:border-primary"
            />
            <ChevronRight size={12} className="text-muted" />
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="px-2 py-1.5 rounded-md text-[11px] bg-bg border border-white/[0.08] text-text focus:outline-none focus:border-primary"
            />
          </div>
        )}

        {/* ── Escopo ── */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/[0.08]">
          {ABAS.map(a => (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-fast
                ${aba === a
                  ? 'bg-surface text-text border border-muted/40'
                  : 'text-secondary hover:bg-surface/30 hover:text-text'}`}
            >
              {ABA_LABEL[a]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Relatório ── */}
      {aba === 'rede' && rede.length > 0 ? (
        <RedeBlock rows={rede} stats={stats} periodoLabel={periodoLabel} isMain />
      ) : (
        <>
          <KPIHeader stats={stats} periodoLabel={periodoLabel} onCSV={handleExportCSV} onPDF={handleExportPDF} onPrint={handlePrint} />

          <Section title="Ranking de Equipes — Produtividade">
            <EquipesTable byEquipe={stats.byEquipe} />
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Produtividade por Cidade">
              <CidadesChart byCidade={stats.byCidade} />
            </Section>
            <Section title="Produtividade por Tipo de OS">
              <TiposCards byTipo={stats.byTipo} />
            </Section>
          </div>

          {statsRede && rede.length > 0 && (
            <RedeBlock rows={rede} stats={statsRede} periodoLabel={periodoLabel} />
          )}
        </>
      )}

      {/* Botões de exportação flutuantes */}
      <div className="flex gap-2 justify-end pt-2">
        <button
          onClick={handleExportPDF}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold
                     bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all"
        >
          <FileText size={13} /> PDF
        </button>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold
                     bg-card border border-white/[0.08] text-secondary hover:text-text hover:bg-surface/40 transition-all"
        >
          <Download size={13} /> CSV
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold
                     bg-card border border-white/[0.08] text-secondary hover:text-text hover:bg-surface/40 transition-all"
        >
          <Printer size={13} /> Imprimir
        </button>
      </div>

    </div>
  )
}

// ── KPI Header ─────────────────────────────────────────────────────────────────
function KPIHeader({ stats, periodoLabel, onCSV, onPDF, onPrint }: {
  stats: FechamentoStats; periodoLabel: string
  onCSV: () => void; onPDF: () => void; onPrint: () => void
}) {
  const kpis = [
    { label: 'Total OS',     value: stats.total,      cls: 'text-primary' },
    { label: 'Concluídas',   value: stats.concluidas, cls: 'text-green'   },
    { label: 'Sem Execução', value: stats.semExec,    cls: 'text-orange'  },
    { label: 'Pendentes',    value: stats.pendentes,  cls: 'text-yellow'  },
    { label: 'SLA Vencidas', value: stats.slaVenc,    cls: stats.slaVenc > 0 ? 'text-red' : 'text-green' },
  ]
  return (
    <div className="bg-card border border-white/[0.08] rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <p className="text-[13px] font-semibold text-text">Relatório de Fechamento Operacional</p>
          <p className="text-[11px] text-muted mt-0.5">{periodoLabel}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={onPDF}   className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all">
            <FileText size={12} /> PDF
          </button>
          <button onClick={onCSV}   className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-bg border border-white/[0.08] text-secondary hover:text-text transition-all">
            <Download size={12} /> CSV
          </button>
          <button onClick={onPrint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-bg border border-white/[0.08] text-secondary hover:text-text transition-all">
            <Printer size={12} /> Imprimir
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="bg-bg rounded-lg p-3 text-center">
            <p className={`text-2xl font-bold font-mono leading-none ${k.cls}`}>{k.value}</p>
            <p className="text-[10px] text-muted mt-1 uppercase tracking-wide">{k.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, children, borderColor }: { title: string; children: React.ReactNode; borderColor?: string }) {
  return (
    <div className={`bg-card border rounded-xl p-5 ${borderColor ? `border-${borderColor}` : 'border-white/[0.08]'}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-4">{title}</p>
      {children}
    </div>
  )
}

// ── Equipes table ──────────────────────────────────────────────────────────────
function EquipesTable({ byEquipe }: { byEquipe: Record<string, TeamStats> }) {
  const equipes = Object.entries(byEquipe)
    .map(([eq, d]) => {
      const totalOp = d.exec + d.semExec + d.pend
      const taxa = totalOp > 0 ? Math.round(d.exec / totalOp * 100) : 0
      return { eq, ...d, totalOp, taxa }
    })
    .sort((a, b) => b.exec - a.exec)

  if (!equipes.length) {
    return <p className="text-[12px] text-muted">Sem dados para o período.</p>
  }

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-white/[0.08]">
            <th className="px-2 py-2 text-center text-[10px] font-bold text-muted uppercase w-8">#</th>
            <th className="px-2 py-2 text-left   text-[10px] font-bold text-muted uppercase">Equipe</th>
            <th className="px-2 py-2 text-center text-[10px] font-bold text-muted uppercase">Exec.</th>
            <th className="px-2 py-2 text-center text-[10px] font-bold text-muted uppercase">S/Exec</th>
            <th className="px-2 py-2 text-center text-[10px] font-bold text-muted uppercase">Pend.</th>
            <th className="px-2 py-2 text-center text-[10px] font-bold text-muted uppercase">SLA Venc.</th>
            <th className="px-2 py-2 text-center text-[10px] font-bold text-muted uppercase">Taxa</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {equipes.map((e, i) => (
            <tr key={e.eq} className="hover:bg-surface/20">
              <td className="px-2 py-2 text-center text-[11px]">{i < 3 ? medals[i] : i + 1}</td>
              <td className="px-2 py-2 font-semibold text-text">{e.eq}</td>
              <td className="px-2 py-2 text-center font-bold text-green">{e.exec}</td>
              <td className="px-2 py-2 text-center text-orange">{e.semExec || '—'}</td>
              <td className="px-2 py-2 text-center text-yellow">{e.pend || '—'}</td>
              <td className={`px-2 py-2 text-center font-semibold ${e.slaVenc > 0 ? 'text-red' : 'text-muted'}`}>
                {e.slaVenc || '—'}
              </td>
              <td className={`px-2 py-2 text-center font-bold ${taxaCor(e.taxa)}`}>{e.taxa}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Cidades chart (bar rows) ───────────────────────────────────────────────────
function CidadesChart({ byCidade }: { byCidade: Record<string, CidadeStats> }) {
  const cidades = Object.entries(byCidade)
    .filter(([, d]) => d.exec + d.semExec > 0)
    .map(([cidade, d]) => {
      const totalOp = d.exec + d.semExec + d.pend
      const taxa = totalOp > 0 ? Math.round(d.exec / totalOp * 100) : 0
      return { cidade, ...d, totalOp, taxa }
    })
    .sort((a, b) => b.exec - a.exec)

  if (!cidades.length) {
    return <p className="text-[12px] text-muted">Sem dados para o período.</p>
  }

  const maxExec = Math.max(...cidades.map(c => c.exec), 1)

  return (
    <div className="space-y-2.5">
      {cidades.map(c => {
        const barW = Math.round(c.exec / maxExec * 100)
        const tc = taxaCor(c.taxa)
        return (
          <div key={c.cidade}>
            <div className="flex justify-between items-baseline mb-1 gap-2">
              <span className="text-[11px] font-semibold text-text truncate max-w-[140px]" title={c.cidade}>
                {c.cidade}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0 text-[10px]">
                <span className="font-bold text-green">{c.exec}</span>
                {c.pend    > 0 && <span className="text-yellow">{c.pend} pend</span>}
                {c.slaVenc > 0 && <span className="text-red font-semibold">{c.slaVenc} SLA</span>}
                <span className={`font-bold ${tc}`}>{c.taxa}%</span>
              </div>
            </div>
            <div className="h-1.5 bg-surface rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${tc === 'text-green' ? 'bg-green' : tc === 'text-yellow' ? 'bg-yellow' : 'bg-red'}`}
                style={{ width: `${barW}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tipos cards ────────────────────────────────────────────────────────────────
function TiposCards({ byTipo }: { byTipo: Record<string, TeamStats> }) {
  const ORDEM = ['Instalação', 'Manutenção', 'Serviço', 'Outros']
  const tipos = ORDEM.filter(t => byTipo[t]).map(t => {
    const d = byTipo[t]
    const totalOp = d.exec + d.semExec + d.pend
    const taxa = totalOp > 0 ? Math.round(d.exec / totalOp * 100) : 0
    return { tipo: t, ...d, totalOp, taxa }
  })

  if (!tipos.length) {
    return <p className="text-[12px] text-muted">Sem dados para o período.</p>
  }

  return (
    <div className="space-y-3">
      {tipos.map(t => {
        const tc = taxaCor(t.taxa)
        return (
          <div key={t.tipo} className={`bg-bg rounded-lg p-3 border-l-2 ${TIPO_BORDER[t.tipo] ?? 'border-muted'}`}>
            <div className="flex justify-between items-center mb-2">
              <span className={`text-[11px] font-bold ${TIPO_COR[t.tipo] ?? 'text-muted'}`}>{t.tipo}</span>
              <span className={`text-[13px] font-bold ${tc}`}>{t.taxa}%</span>
            </div>
            <div className="flex gap-4 flex-wrap">
              <Stat label="Exec."   value={t.exec}    cls="text-green" />
              <Stat label="Pend."   value={t.pend}    cls="text-yellow" />
              <Stat label="S/Exec"  value={t.semExec} cls="text-orange" />
              {t.slaVenc > 0 && <Stat label="SLA Venc." value={t.slaVenc} cls="text-red" />}
            </div>
            <div className="mt-2 h-1 bg-surface rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${tc === 'text-green' ? 'bg-green' : tc === 'text-yellow' ? 'bg-yellow' : 'bg-red'}`}
                style={{ width: `${t.taxa}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="text-center">
      <p className={`text-base font-bold leading-none ${cls}`}>{value}</p>
      <p className="text-[9px] text-muted mt-0.5">{label}</p>
    </div>
  )
}

// ── Rede block ─────────────────────────────────────────────────────────────────
function RedeBlock({ rows, stats, periodoLabel, isMain = false }: {
  rows: OSRow[]; stats: FechamentoStats; periodoLabel: string; isMain?: boolean
}) {
  const kpisRede = [
    { label: 'Total OS',     value: stats.total,      cls: 'text-cyan'   },
    { label: 'Concluídas',   value: stats.concluidas, cls: 'text-green'  },
    { label: 'Sem Execução', value: stats.semExec,    cls: 'text-orange' },
    { label: 'Pendentes',    value: stats.pendentes,  cls: 'text-yellow' },
    { label: 'SLA Vencidas', value: stats.slaVenc,    cls: stats.slaVenc > 0 ? 'text-red' : 'text-green' },
  ]

  return (
    <div className="bg-card border-2 border-cyan/40 rounded-xl p-5 space-y-4">
      {isMain && (
        <div className="mb-1">
          <p className="text-[13px] font-semibold text-text">Relatório — Rede</p>
          <p className="text-[11px] text-muted mt-0.5">{periodoLabel}</p>
        </div>
      )}

      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-cyan mb-3">
          Rede — Bloco Independente
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {kpisRede.map(k => (
            <div key={k.label} className="bg-bg rounded-lg p-3 text-center">
              <p className={`text-xl font-bold font-mono leading-none ${k.cls}`}>{k.value}</p>
              <p className="text-[10px] text-muted mt-1 uppercase tracking-wide">{k.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-3">Equipes de Rede</p>
        <EquipesTable byEquipe={stats.byEquipe} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-3">Produtividade por Cidade</p>
          <CidadesChart byCidade={stats.byCidade} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted mb-3">Clientes Atendidos</p>
          <ClientesRedeList rows={rows} />
        </div>
      </div>
    </div>
  )
}

// ── Clientes atendidos (Rede) ──────────────────────────────────────────────────
function ClientesRedeList({ rows }: { rows: OSRow[] }) {
  const concl = rows
    .filter(r => r.descsituacao === 'Concluída')
    .sort((a, b) => {
      const da = new Date(a.dataexecucao || a.databaixa || a.dataagendamento || 0)
      const db = new Date(b.dataexecucao || b.databaixa || b.dataagendamento || 0)
      return da.getTime() - db.getTime()
    })

  if (!concl.length) {
    return <p className="text-[12px] text-muted">Nenhuma OS concluída.</p>
  }

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
      {concl.map((r, i) => {
        const raw = r.dataexecucao || r.databaixa || r.dataagendamento || ''
        const m   = String(raw).match(/(\d{2})\/(\d{2})\/(\d{2,4})/)
        const dt  = m ? `${m[1]}/${m[2]}/${m[3].slice(-2)}` : (raw ? String(raw).slice(0, 8) : '—')
        return (
          <div key={i} className="flex gap-2 items-center bg-bg rounded px-2 py-1.5 text-[11px]">
            <span className="font-bold text-cyan flex-shrink-0">{r.numos || '—'}</span>
            <span className="text-text truncate flex-1">{r.nomecliente || '—'}</span>
            <span className="text-muted flex-shrink-0 text-[10px]">{r.nomedacidade || ''}</span>
            <span className="text-muted flex-shrink-0 text-[10px]">{dt}</span>
          </div>
        )
      })}
    </div>
  )
}
