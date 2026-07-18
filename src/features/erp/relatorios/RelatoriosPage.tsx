import { useMemo, useState } from 'react'
import {
  BarChart2, TrendingUp, Clock, AlertTriangle,
  Download, Printer, ChevronRight,
} from 'lucide-react'
import type { OSRow } from '../../../lib/types'

interface DrillState { title: string; rows: OSRow[]; color?: string }

import { BarChart, Bar, XAxis, YAxis, ChartTooltip, Grid, Legend, Cell } from '../../../components/ui/bar-chart'
import { DonutChart } from '../../../components/ui/DonutChart'
import { useOSDerived } from '../../../contexts/OSDataContext'
import { TEAMS } from '../erpConstants'
import { shortEquipe } from '../../../lib/osFormat'


// ── Helpers ───────────────────────────────────────────────────────────────────
import { OSListModal, Section, Empty } from './RelatoriosComponents'
import { exportCSV } from './relatoriosUtils'
import { printRelatoriosPDF } from './relatoriosPDF'

export default function RelatoriosPage() {
  const { rows, allRows, isLoading, derived } = useOSDerived()
  const [tipoFilter, setTipoFilter]       = useState('')
  const [periodoFilter, setPeriodoFilter] = useState('all')
  const [drill, setDrill]                 = useState<DrillState | null>(null)

  const semaforo = useMemo(() => derived?.sla?.semaforo ?? [], [derived])

  // Filtered rows
  const filteredRows = useMemo(() => {
    let r = tipoFilter ? rows.filter(row => row._tipo === tipoFilter) : rows
    if (periodoFilter === 'week')  r = r.filter(row => (row._aging ?? 0) <= 7)
    if (periodoFilter === 'month') r = r.filter(row => (row._aging ?? 0) <= 30)
    return r
  }, [rows, tipoFilter, periodoFilter])

  // ── Métricas globais ──
  const kpis = useMemo(() => {
    const total     = filteredRows.length
    const criticas  = allRows.filter(r => ['Pendente','Atendimento'].includes(r.descsituacao) && (r._slaExcedido || r._slaSemAgend)).length
    const semEquipe = filteredRows.filter(r => !r.nomedaequipe).length
    const agingRows = filteredRows.filter(r => r._agingAbertura != null)
    const avgAging  = agingRows.length > 0
      ? agingRows.reduce((s, r) => s + (r._agingAbertura ?? 0), 0) / agingRows.length
      : 0
    return { total, criticas, semEquipe, avgAging }
  }, [filteredRows, allRows])

  // ── OS por equipe (top 10) ──
  const byTeam = useMemo(() => {
    const map: Record<string, { queue: number; criticas: number }> = {}
    filteredRows.forEach(r => {
      if (!r.nomedaequipe) return
      const code = shortEquipe(r.nomedaequipe).split(' - ')[0].trim()
      if (!map[code]) map[code] = { queue: 0, criticas: 0 }
      map[code].queue++
      if (r._slaExcedido || r._slaSemAgend) map[code].criticas++
    })
    return Object.entries(map)
      .sort((a, b) => b[1].queue - a[1].queue)
      .slice(0, 12)
  }, [filteredRows])

  const teamBarData = useMemo(
    () => byTeam.map(([name, m]) => ({ name, 'OS na Fila': m.queue, 'Críticas': m.criticas })),
    [byTeam]
  )

  // ── SLA por equipe ──
  const slaData = useMemo(() => {
    return semaforo
      .map(s => ({ name: shortEquipe(s.nome).split(' - ')[0].trim(), value: s.sla ?? 0 }))
      .filter(e => e.value > 0)
      .sort((a, b) => a.value - b.value)
      .slice(0, 12)
      .map(e => ({
        ...e,
        fill: e.value >= 90 ? 'rgba(52,211,153,0.65)' : e.value >= 75 ? 'rgba(251,146,60,0.65)' : 'rgba(248,113,113,0.65)',
      }))
  }, [semaforo])

  // ── Distribuição por tipo ──
  const tipoData = useMemo(() => {
    const inst  = filteredRows.filter(r => r._tipo === 'INSTALACAO').length
    const manut = filteredRows.filter(r => r._tipo === 'MANUTENCAO').length
    const rede  = filteredRows.filter(r => r._tipo === 'REDE').length
    const outro = filteredRows.length - inst - manut - rede
    const result = [
      { name: 'Instalação', value: inst  },
      { name: 'Manutenção', value: manut },
      { name: 'Rede',       value: rede  },
    ]
    if (outro > 0) result.push({ name: 'Serviço', value: outro })
    return result
  }, [filteredRows])

  const TIPO_COLORS = ['rgba(96,165,250,0.8)', 'rgba(251,146,60,0.8)', 'rgba(52,211,153,0.8)', 'rgba(148,163,184,0.6)']

  // ── Distribuição por aging ──
  const agingData = useMemo(() => {
    const AGING_FILLS = ['rgba(52,211,153,0.65)', 'rgba(250,204,21,0.65)', 'rgba(251,146,60,0.65)', 'rgba(248,113,113,0.65)', 'rgba(248,113,113,0.8)']
    const bands = [
      { label: '0–3d',   min: 0,  max: 3          },
      { label: '4–7d',   min: 4,  max: 7          },
      { label: '8–14d',  min: 8,  max: 14         },
      { label: '15–30d', min: 15, max: 30         },
      { label: '>30d',   min: 31, max: Infinity   },
    ]
    return bands.map((b, i) => ({
      name: b.label,
      value: filteredRows.filter(r => { const a = r._aging ?? 0; return a >= b.min && a <= b.max }).length,
      fill: AGING_FILLS[i],
    }))
  }, [filteredRows])

  // Snapshot atual: OS ativas com SLA vencido por equipe (independe do filtro de período)
  const slaVencMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of allRows) {
      if (!['Pendente', 'Atendimento'].includes(r.descsituacao)) continue
      if (!(r._slaExcedido || r._slaSemAgend)) continue
      if (!r.nomedaequipe) continue
      const code = shortEquipe(r.nomedaequipe).split(' - ')[0].trim()
      map[code] = (map[code] ?? 0) + 1
    }
    return map
  }, [allRows])

  // ── Ranking de produtividade das equipes ──
  type RankEntry = { code: string; leader: string; tipo: string; queue: number; agingSum: number; agingCount: number; execInst: number; execManut: number; execServico: number }
  const ranking = useMemo(() => {
    const map: Record<string, RankEntry> = {}
    filteredRows.forEach(r => {
      if (!r.nomedaequipe) return
      const code = shortEquipe(r.nomedaequipe).split(' - ')[0].trim()
      const team = TEAMS.find(t => t.code === code)
      if (!team) return
      if (!map[code]) map[code] = {
        code, leader: team.leader, tipo: team.tipo,
        queue: 0, agingSum: 0, agingCount: 0,
        execInst: 0, execManut: 0, execServico: 0,
      }
      map[code].queue++
      if (r._agingAbertura != null) { map[code].agingSum += r._agingAbertura; map[code].agingCount++ }
      if (r.descsituacao === 'Concluída') {
        if (r._tipo === 'INSTALACAO')      map[code].execInst++
        else if (r._tipo === 'MANUTENCAO') map[code].execManut++
        else                               map[code].execServico++
      }
    })
    return Object.values(map)
      .map(e => ({
        ...e,
        criticas: slaVencMap[e.code] ?? 0,
        avgAging: e.agingCount > 0 ? e.agingSum / e.agingCount : 0,
        sla: semaforo.find(s => shortEquipe(s.nome).split(' - ')[0].trim() === e.code)?.sla ?? 0,
      }))
      .sort((a, b) => b.queue - a.queue)
  }, [filteredRows, semaforo, slaVencMap])

  const totals = useMemo(() => {
    const execInst    = ranking.reduce((s, r) => s + r.execInst,    0)
    const execManut   = ranking.reduce((s, r) => s + r.execManut,   0)
    const execServico = ranking.reduce((s, r) => s + r.execServico, 0)
    const execTotal   = execInst + execManut + execServico
    const queue       = ranking.reduce((s, r) => s + r.queue,       0)
    const slaVenc     = ranking.reduce((s, r) => s + r.criticas,    0)
    const slaEntries  = ranking.filter(r => r.sla > 0)
    const avgSla      = slaEntries.length > 0
      ? slaEntries.reduce((s, r) => s + r.sla, 0) / slaEntries.length : 0
    const totalAgingSum   = ranking.reduce((s, r) => s + r.agingSum,   0)
    const totalAgingCount = ranking.reduce((s, r) => s + r.agingCount, 0)
    const avgAging        = totalAgingCount > 0 ? totalAgingSum / totalAgingCount : 0
    const pct = (v: number) => execTotal > 0 ? Math.round((v / execTotal) * 100) : 0
    return { execInst, execManut, execServico, execTotal, queue, slaVenc, avgSla, avgAging,
             pctInst: pct(execInst), pctManut: pct(execManut), pctServico: pct(execServico) }
  }, [ranking])

  // ── Row sets para drill-down ──────────────────────────────────────────────
  const drillTotal    = filteredRows
  const drillSlaVenc  = useMemo(() =>
    allRows.filter(r => ['Pendente','Atendimento'].includes(r.descsituacao) && (r._slaExcedido || r._slaSemAgend)),
    [allRows])
  const drillSemEq    = useMemo(() => filteredRows.filter(r => !r.nomedaequipe), [filteredRows])
  const drillAging    = useMemo(() =>
    [...filteredRows].filter(r => r._agingAbertura != null)
      .sort((a, b) => (b._agingAbertura ?? 0) - (a._agingAbertura ?? 0)),
    [filteredRows])
  const drillConcl    = useMemo(() => filteredRows.filter(r => r.descsituacao === 'Concluída'), [filteredRows])
  const drillConclInst= useMemo(() => drillConcl.filter(r => r._tipo === 'INSTALACAO'),                 [drillConcl])
  const drillConclMt  = useMemo(() => drillConcl.filter(r => r._tipo === 'MANUTENCAO'),                 [drillConcl])
  const drillConclSv  = useMemo(() => drillConcl.filter(r => r._tipo !== 'INSTALACAO' && r._tipo !== 'MANUTENCAO'), [drillConcl])

  function handleExportRanking() {
    exportCSV('ranking_equipes.csv', ranking.map(r => ({
      Equipe: r.code,
      Líder: r.leader,
      'Exec. Instalação': r.execInst,
      'Exec. Manutenção': r.execManut,
      'Exec. Serviço': r.execServico,
      'Exec. Total': r.execInst + r.execManut + r.execServico,
      'OS na Fila': r.queue,
      'SLA %': r.sla.toFixed(1),
      'SLA Vencido': r.criticas,
      'Aging Médio (d)': r.avgAging.toFixed(1),
    })))
  }

  function exportPDF(theme: string) {
    printRelatoriosPDF(theme, ranking, totals, kpis, periodoFilter, tipoFilter)
  }

  return (
    <div className="flex flex-col gap-5 p-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-headline font-bold text-text">Relatórios Operacionais</h1>
          <p className="text-label text-secondary mt-0.5">Análise de desempenho · ERP</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Filtro de período */}
          <div className="flex gap-1 bg-elevated border border-white/[0.08] rounded-lg p-0.5">
            {[
              { value: 'all',   label: 'Tudo'          },
              { value: 'month', label: 'Últimos 30 dias' },
              { value: 'week',  label: 'Últimos 7 dias'  },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriodoFilter(opt.value)}
                className={`px-3 py-1.5 rounded-md text-caption font-medium transition-all duration-150
                  ${periodoFilter === opt.value
                    ? 'bg-primary/20 text-primary'
                    : 'text-secondary hover:text-text hover:bg-surface/40'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Filtro de tipo */}
          <div className="flex gap-1 bg-elevated border border-white/[0.08] rounded-lg p-0.5">
            {[
              { value: '',           label: 'Todos'      },
              { value: 'INSTALACAO', label: 'Instalação' },
              { value: 'MANUTENCAO', label: 'Manutenção' },
              { value: 'REDE',       label: 'Rede'       },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setTipoFilter(opt.value)}
                className={`px-3 py-1.5 rounded-md text-caption font-medium transition-all duration-150
                  ${tipoFilter === opt.value
                    ? 'bg-primary/20 text-primary'
                    : 'text-secondary hover:text-text hover:bg-surface/40'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Modal drill-down */}
      <OSListModal
        open={!!drill}
        onClose={() => setDrill(null)}
        title={drill?.title ?? ''}
        rows={drill?.rows ?? []}
        color={drill?.color ?? '#3b82f6'}
      />

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total de OS',  value: kpis.total,                     Icon: BarChart2,     colorCls: 'text-primary',     bgCls: 'bg-primary/10',    rows: drillTotal,   color: '#3b82f6' },
          { label: 'SLA Vencido',  value: kpis.criticas,                  Icon: AlertTriangle, colorCls: 'text-red',     bgCls: 'bg-red/10',    rows: drillSlaVenc, color: '#f87171' },
          { label: 'Sem Equipe',   value: kpis.semEquipe,                 Icon: Clock,         colorCls: 'text-orange',  bgCls: 'bg-orange/10', rows: drillSemEq,   color: '#f97316' },
          { label: 'Aging Médio',  value: `${kpis.avgAging.toFixed(1)}d`, Icon: TrendingUp,    colorCls: 'text-green', bgCls: 'bg-green/10',rows: drillAging,   color: '#4ade80' },
        ].map(k => {
          const KIcon = k.Icon
          return (
            <div key={k.label}
                 className="bg-elevated border border-white/[0.08] rounded-xl px-4 py-3
                            flex items-center gap-3 cursor-pointer hover:bg-surface/30 transition-colors"
                 onClick={() => setDrill({ title: `${k.label} — ${k.rows.length} ordens`, rows: k.rows, color: k.color })}>
              <div className={`w-9 h-9 rounded-lg ${k.bgCls} flex items-center justify-center flex-shrink-0`}>
                <KIcon size={16} className={k.colorCls} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-mono font-black tabular-nums text-[26px] leading-none text-text">{k.value}</p>
                <p className="text-caption text-secondary mt-0.5">{k.label}</p>
              </div>
              <ChevronRight size={13} className="text-muted flex-shrink-0" />
            </div>
          )
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24 gap-3 text-secondary text-sm">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Carregando dados…
        </div>
      ) : (
        <>
          {/* ── Produção Consolidada ── */}
          {totals.execTotal > 0 && (
            <div className="bg-elevated border border-white/[0.08] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.08]">
                <p className="text-body font-semibold text-text">Produção Consolidada do Período</p>
                <p className="text-caption text-muted mt-0.5">Total de OS executadas (concluídas) por tipo de serviço</p>
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4">
                {/* Total */}
                <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-card px-5 py-4
                                flex flex-col justify-between cursor-pointer hover:bg-surface/30 transition-colors"
                     onClick={() => setDrill({ title: `Total Executado — ${drillConcl.length} ordens`, rows: drillConcl, color: '#3b82f6' })}>
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-surface/200" />
                  <p className="text-caption font-bold uppercase tracking-widest text-muted mb-2">Total Executado</p>
                  <p className="font-mono font-black tabular-nums leading-none text-text" style={{ fontSize: 'clamp(36px,4vw,48px)' }}>
                    {totals.execTotal}
                  </p>
                  <p className="text-caption text-muted mt-2">{ranking.length} equipes · período selecionado</p>
                </div>

                {/* Por tipo */}
                {[
                  { label: 'Instalações', value: totals.execInst,    pct: totals.pctInst,    color: '#60a5fa', rows: drillConclInst },
                  { label: 'Manutenções', value: totals.execManut,   pct: totals.pctManut,   color: '#fb923c', rows: drillConclMt  },
                  { label: 'Serviços',    value: totals.execServico, pct: totals.pctServico, color: '#34d399', rows: drillConclSv  },
                ].map(s => (
                  <div key={s.label}
                       className="relative overflow-hidden rounded-xl border bg-card px-5 py-4
                                  flex flex-col justify-between cursor-pointer hover:bg-surface/30 transition-colors"
                       style={{ borderColor: `${s.color}25` }}
                       onClick={() => setDrill({ title: `${s.label} Executadas — ${s.rows.length} ordens`, rows: s.rows, color: s.color })}>
                    <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: s.color }} />
                    <p className="text-caption font-bold uppercase tracking-widest text-muted mb-2">{s.label}</p>
                    <p className="font-mono font-black tabular-nums leading-none" style={{ fontSize: 'clamp(32px,3.5vw,42px)', color: s.color }}>
                      {s.value}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-caption text-muted">do total</p>
                      <span className="font-bold text-label" style={{ color: s.color }}>{s.pct}%</span>
                    </div>
                    <div className="mt-1.5 h-1 bg-surface rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                           style={{ width: `${s.pct}%`, background: s.color, boxShadow: `0 0 6px ${s.color}60` }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Barra de proporção */}
              <div className="px-5 pb-5">
                <p className="text-caption font-bold uppercase tracking-widest text-muted mb-2">Proporção da produção</p>
                <div className="flex h-3 rounded-full overflow-hidden gap-px">
                  {totals.pctInst    > 0 && <div className="transition-all duration-700" style={{ width: `${totals.pctInst}%`,    background: '#60a5fa' }} title={`Instalações ${totals.pctInst}%`} />}
                  {totals.pctManut   > 0 && <div className="transition-all duration-700" style={{ width: `${totals.pctManut}%`,   background: '#fb923c' }} title={`Manutenções ${totals.pctManut}%`} />}
                  {totals.pctServico > 0 && <div className="transition-all duration-700" style={{ width: `${totals.pctServico}%`, background: '#34d399' }} title={`Serviços ${totals.pctServico}%`} />}
                </div>
                <div className="flex items-center gap-5 mt-2">
                  {[
                    { label: 'Instalações', color: '#60a5fa', pct: totals.pctInst    },
                    { label: 'Manutenções', color: '#fb923c', pct: totals.pctManut   },
                    { label: 'Serviços',    color: '#34d399', pct: totals.pctServico },
                  ].map(s => (
                    <span key={s.label} className="flex items-center gap-1.5 text-caption text-muted">
                      <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                      {s.label} <span className="font-semibold" style={{ color: s.color }}>{s.pct}%</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Gráficos linha 1 ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            <div className="lg:col-span-2">
              <Section title="OS por Equipe" subtitle="Volume na fila e ordens críticas" height="h-64">
                {byTeam.length > 0
                  ? (
                    <BarChart data={teamBarData}>
                      <Bar dataKey="OS na Fila" fill="rgba(99,102,241,0.6)" name="OS na Fila" />
                      <Bar dataKey="Críticas" fill="rgba(248,113,113,0.55)" name="Críticas" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Grid />
                      <ChartTooltip />
                      <Legend />
                    </BarChart>
                  )
                  : <Empty />}
              </Section>
            </div>

            <Section title="Distribuição por Tipo" subtitle="Proporção de OS por serviço" height="h-64">
              {filteredRows.length > 0
                ? (
                  <DonutChart
                    data={tipoData}
                    colors={TIPO_COLORS}
                    centerLabel="OS"
                  />
                )
                : <Empty />}
            </Section>
          </div>

          {/* ── Gráficos linha 2 ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            <Section title="SLA por Equipe" subtitle="Percentual de atendimento no prazo" height="h-64">
              {slaData.length > 0
                ? (
                  <BarChart data={slaData}>
                    <Bar dataKey="value" name="SLA %">
                      {slaData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                    <Grid />
                    <ChartTooltip suffix="%" formatter={(v: number) => `SLA: ${v.toFixed(1)}%`} />
                  </BarChart>
                )
                : <Empty label="Sem dados de SLA" />}
            </Section>

            <Section title="Distribuição de Aging" subtitle="OS por faixa de dias na fila" height="h-64">
              {filteredRows.length > 0
                ? (
                  <BarChart data={agingData}>
                    <Bar dataKey="value" name="OS">
                      {agingData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Grid />
                    <ChartTooltip />
                  </BarChart>
                )
                : <Empty />}
            </Section>
          </div>

          {/* ── Ranking de equipes ── */}
          <div className="bg-elevated border border-white/[0.08] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
              <div>
                <p className="text-body font-semibold text-text">Ranking de Equipes</p>
                <p className="text-caption text-muted mt-0.5">Desempenho consolidado</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleExportRanking}
                  className="flex items-center gap-1.5 text-caption text-secondary hover:text-text
                             px-3 py-1.5 rounded-lg border border-white/[0.08] hover:border-muted/30
                             transition-colors"
                  title="Exportar tabela como CSV"
                >
                  <Download size={12} />
                  CSV
                </button>
                <button
                  onClick={() => exportPDF('dark')}
                  className="flex items-center gap-1.5 text-caption text-secondary hover:text-text
                             px-3 py-1.5 rounded-lg border border-white/[0.08] hover:border-muted/30
                             transition-colors"
                  title="Exportar PDF com tema escuro"
                >
                  <Printer size={12} />
                  PDF Escuro
                </button>
                <button
                  onClick={() => exportPDF('light')}
                  className="flex items-center gap-1.5 text-caption text-secondary hover:text-text
                             px-3 py-1.5 rounded-lg border border-white/[0.08] hover:border-muted/30
                             transition-colors"
                  title="Exportar PDF com tema claro"
                >
                  <Printer size={12} />
                  PDF Claro
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-label">
                <thead>
                  {/* Grupo "Executadas" */}
                  <tr className="border-b border-white/[0.03]">
                    <th colSpan={2} className="px-4 py-1" />
                    <th colSpan={4}
                        className="px-4 py-1.5 text-center text-caption font-bold uppercase tracking-widest
                                   text-primary/70 border-l border-white/[0.08]">
                      Executadas no período
                    </th>
                    <th colSpan={4} className="px-4 py-1" />
                  </tr>
                  <tr className="border-b border-white/[0.05]">
                    {['#', 'Equipe'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-caption font-bold uppercase tracking-wider text-muted">
                        {h}
                      </th>
                    ))}
                    {[
                      { label: 'Instalação', color: '#60a5fa' },
                      { label: 'Manutenção', color: '#fb923c' },
                      { label: 'Serviço',    color: '#34d399' },
                    ].map((h, i) => (
                      <th key={h.label}
                          className={`text-left px-4 py-3 text-caption font-bold uppercase tracking-wider
                                      ${i === 0 ? 'border-l border-white/[0.08]' : ''}`}
                          style={{ color: h.color }}>
                        {h.label}
                      </th>
                    ))}
                    <th className="text-left px-4 py-3 text-caption font-bold uppercase tracking-wider text-text">
                      Total
                    </th>
                    {['OS Fila', 'SLA', 'SLA Venc.', 'Aging Méd.'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-caption font-bold uppercase tracking-wider text-muted">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr key={r.code}
                        className="border-b border-white/[0.04] hover:bg-surface/20 transition-colors">
                      <td className="px-4 py-3 text-muted font-mono">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-text">{r.code}</p>
                        <p className="text-caption text-muted capitalize">
                          {r.leader.charAt(0) + r.leader.slice(1).toLowerCase()}
                        </p>
                      </td>
                      {/* ── Executadas ── */}
                      <td className="px-4 py-3 border-l border-white/[0.08]">
                        <span className={`font-mono font-bold tabular-nums ${r.execInst > 0 ? 'text-primary' : 'text-muted'}`}>
                          {r.execInst > 0 ? r.execInst : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-bold tabular-nums ${r.execManut > 0 ? 'text-orange' : 'text-muted'}`}>
                          {r.execManut > 0 ? r.execManut : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-bold tabular-nums ${r.execServico > 0 ? 'text-green' : 'text-muted'}`}>
                          {r.execServico > 0 ? r.execServico : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-black tabular-nums text-text">
                          {r.execInst + r.execManut + r.execServico || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold tabular-nums text-text">{r.queue}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-bold tabular-nums
                          ${r.sla >= 90 ? 'text-green' : r.sla >= 75 ? 'text-orange' : 'text-red'}`}>
                          {r.sla > 0 ? `${r.sla.toFixed(0)}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-bold tabular-nums ${r.criticas > 0 ? 'text-red' : 'text-muted'}`}>
                          {r.criticas}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold tabular-nums text-muted">{r.avgAging.toFixed(1)}d</span>
                      </td>
                    </tr>
                  ))}
                  {ranking.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-muted text-sm">
                        Nenhuma equipe com OS atribuída
                      </td>
                    </tr>
                  )}
                </tbody>
                {ranking.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-white/[0.08] bg-surface/20">
                      <td colSpan={2} className="px-4 py-3">
                        <span className="text-caption font-bold text-text uppercase tracking-wide">Total Geral</span>
                        <span className="text-caption text-muted ml-1.5">· {ranking.length} equipes</span>
                      </td>
                      <td className="px-4 py-3 border-l border-white/[0.08]">
                        <span className="font-mono font-black text-title tabular-nums text-primary">{totals.execInst}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-black text-title tabular-nums text-orange">{totals.execManut}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-black text-title tabular-nums text-green">{totals.execServico}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-black text-title tabular-nums text-text">{totals.execTotal}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-body tabular-nums text-text">{totals.queue}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-bold text-body tabular-nums
                          ${totals.avgSla >= 90 ? 'text-green' : totals.avgSla >= 75 ? 'text-orange' : 'text-red'}`}>
                          {totals.avgSla > 0 ? `${totals.avgSla.toFixed(0)}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-bold text-body tabular-nums ${totals.slaVenc > 0 ? 'text-red' : 'text-muted'}`}>
                          {totals.slaVenc}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-body tabular-nums text-muted">{totals.avgAging.toFixed(1)}d</span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

        </>
      )}
    </div>
  )
}