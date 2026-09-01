import { useMemo, useState } from 'react'
import { ChartBar, TrendUp, Clock, Warning, CaretRight, DownloadSimple, FileText } from '@phosphor-icons/react'
import type { OSRow } from '../../../lib/types'

interface DrillState { title: string; rows: OSRow[]; color?: string }

import { BarChart, Bar, XAxis, YAxis, ChartTooltip, Grid, Legend, Cell } from '../../../components/ui/bar-chart'
import { DonutChart } from '../../../components/ui/DonutChart'
import { PageHeader } from '../../../components/ui/PageHeader'
import { useOSDerived } from '../../../contexts/OSDataContext'
import { TEAMS } from '../erpConstants'
import { shortEquipe } from '../../../lib/osFormat'
import { isExecucaoReal, isFilaAtiva } from '../../../lib/transform'
import OSDrawer from '../../ordens/OSDrawer'
import { useUIStore } from '../../../store/uiStore'
import { exportCSV } from './relatoriosUtils'
import { printRelatoriosPDF } from './relatoriosPDF'
import { buildReportMetrics, filterReportRows } from './relatoriosBuilder'


// ── Helpers ───────────────────────────────────────────────────────────────────
import { OSListModal, Section, Empty } from './RelatoriosComponents'

export default function RelatoriosPage() {
  const { rows, isLoading } = useOSDerived()
  const { theme } = useUIStore()
  const [tipoFilter, setTipoFilter]       = useState('')
  const [periodoFilter, setPeriodoFilter] = useState('all')
  const [dateField, setDateField] = useState<'datacadastro' | 'dataagendamento' | 'dataexecucao'>('datacadastro')
  const [cidadeFilter, setCidadeFilter] = useState('')
  const [equipeFilter, setEquipeFilter] = useState('')
  const [situacaoFilter, setSituacaoFilter] = useState('')
  const [drill, setDrill]                 = useState<DrillState | null>(null)
  const [drawerOS, setDrawerOS] = useState<OSRow | null>(null)

  // Filtered rows
  const filteredRows = useMemo(() => {
    return filterReportRows(rows, {
      period: periodoFilter === 'week' ? '7d' : periodoFilter === 'month' ? '30d' : 'all',
      dateField, tipo: tipoFilter, cidade: cidadeFilter, equipe: equipeFilter, situacao: situacaoFilter,
    })
  }, [rows, tipoFilter, periodoFilter, dateField, cidadeFilter, equipeFilter, situacaoFilter])

  const metrics = useMemo(() => buildReportMetrics(filteredRows), [filteredRows])
  const cidades = useMemo(() => [...new Set(rows.map(r => r.nomedacidade.trim()).filter(Boolean))].sort(), [rows])
  const equipes = useMemo(() => [...new Set(rows.map(r => shortEquipe(r.nomedaequipe).split(' - ')[0].trim()).filter(Boolean))].sort(), [rows])
  const situacoes = useMemo(() => [...new Set(rows.map(r => r.descsituacao).filter(Boolean))].sort(), [rows])

  // ── Métricas globais ──
  const kpis = useMemo(() => {
    return { total: metrics.total, criticas: metrics.slaVencido, semEquipe: metrics.semEquipe, avgAging: metrics.agingMedio }
  }, [metrics])

  // ── OS por equipe (top 10) ──
  const byTeam = useMemo(() => {
    const map: Record<string, { queue: number; criticas: number }> = {}
    filteredRows.forEach(r => {
      if (!r.nomedaequipe) return
      if (!isFilaAtiva(r.descsituacao)) return
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
    return byTeam
      .map(([name, entry]) => ({ name, value: entry.queue ? Math.round((entry.queue - entry.criticas) / entry.queue * 100) : 0 }))
      .sort((a, b) => a.value - b.value)
      .slice(0, 12)
      .map(e => ({
        ...e,
        fill: e.value >= 90 ? 'rgba(52,211,153,0.65)' : e.value >= 75 ? 'rgba(251,146,60,0.65)' : 'rgba(248,113,113,0.65)',
      }))
  }, [byTeam])

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
      value: filteredRows.filter(r => { const a = r._aging; return isFilaAtiva(r.descsituacao) && a != null && a >= b.min && a <= b.max }).length,
      fill: AGING_FILLS[i],
    }))
  }, [filteredRows])

  // ── Ranking de produtividade das equipes ──
  type RankEntry = { code: string; leader: string; tipo: string; queue: number; criticas: number; agingSum: number; agingCount: number; execInst: number; execManut: number; execServico: number; execRede: number }
  const ranking = useMemo(() => {
    const map: Record<string, RankEntry> = {}
    filteredRows.forEach(r => {
      const code = shortEquipe(r.nomedaequipe).split(' - ')[0].trim() || 'Sem equipe'
      const team = TEAMS.find(t => t.code === code)
      if (!map[code]) map[code] = {
        code, leader: team?.leader ?? 'Não cadastrado', tipo: team?.tipo ?? 'OUTRO',
        queue: 0, criticas: 0, agingSum: 0, agingCount: 0,
        execInst: 0, execManut: 0, execServico: 0, execRede: 0,
      }
      if (isFilaAtiva(r.descsituacao)) {
        map[code].queue++
        if (r._slaExcedido || r._slaSemAgend) map[code].criticas++
        if (r._agingAbertura != null) { map[code].agingSum += r._agingAbertura; map[code].agingCount++ }
      }
      if (isExecucaoReal(r.descsituacao)) {
        if (r._tipo === 'INSTALACAO')      map[code].execInst++
        else if (r._tipo === 'MANUTENCAO') map[code].execManut++
        else if (r._tipo === 'REDE')        map[code].execRede++
        else                               map[code].execServico++
      }
    })
    return Object.values(map)
      .map(e => ({
        ...e,
        avgAging: e.agingCount > 0 ? e.agingSum / e.agingCount : 0,
        sla: e.queue > 0 ? Math.round((e.queue - e.criticas) / e.queue * 100) : 0,
      }))
      .sort((a, b) => b.queue - a.queue)
  }, [filteredRows])

  const totals = useMemo(() => {
    const { instalacao: execInst, manutencao: execManut, servico: execServico, rede: execRede, total: execTotal } = metrics.production
    const queue = metrics.active.length
    const slaVenc = metrics.slaVencido
    const avgSla = metrics.slaFilaPct
    const avgAging = metrics.agingMedio
    const pct = (v: number) => execTotal > 0 ? Math.round((v / execTotal) * 100) : 0
    return { execInst, execManut, execServico, execRede, execTotal, queue, slaVenc, avgSla, avgAging,
             pctInst: pct(execInst), pctManut: pct(execManut), pctServico: pct(execServico), pctRede: pct(execRede) }
  }, [metrics])

  // ── Row sets para drill-down ──────────────────────────────────────────────
  const drillTotal    = filteredRows
  const drillSlaVenc  = useMemo(() =>
    filteredRows.filter(r => isFilaAtiva(r.descsituacao) && (r._slaExcedido || r._slaSemAgend)),
    [filteredRows])
  const drillSemEq    = useMemo(() => filteredRows.filter(r => isFilaAtiva(r.descsituacao) && !r.nomedaequipe), [filteredRows])
  const drillAging    = useMemo(() =>
    [...filteredRows].filter(r => isFilaAtiva(r.descsituacao) && r._agingAbertura != null)
      .sort((a, b) => (b._agingAbertura ?? 0) - (a._agingAbertura ?? 0)),
    [filteredRows])
  const drillConcl    = useMemo(() => filteredRows.filter(r => isExecucaoReal(r.descsituacao)), [filteredRows])
  const drillConclInst= useMemo(() => drillConcl.filter(r => r._tipo === 'INSTALACAO'),                 [drillConcl])
  const drillConclMt  = useMemo(() => drillConcl.filter(r => r._tipo === 'MANUTENCAO'),                 [drillConcl])
  const drillConclRede= useMemo(() => drillConcl.filter(r => r._tipo === 'REDE'),                       [drillConcl])
  const drillConclSv  = useMemo(() => drillConcl.filter(r => !['INSTALACAO', 'MANUTENCAO', 'REDE'].includes(r._tipo)), [drillConcl])

  const exportRows = () => ranking.map((entry, index) => ({
    Posicao: index + 1, Equipe: entry.code, Lider: entry.leader,
    Instalacoes: entry.execInst, Manutencoes: entry.execManut, Servicos: entry.execServico, Rede: entry.execRede,
    TotalExecutado: entry.execInst + entry.execManut + entry.execServico + entry.execRede,
    FilaAtual: entry.queue, SLAFila: `${entry.sla}%`, SLAVencido: entry.criticas, AgingMedio: entry.avgAging.toFixed(1),
  }))

  return (
    <div className="flex flex-col gap-5 p-6">

      {/* ── Header ── */}
      <PageHeader
        title="Relatórios Operacionais"
        description="Prévia exportável · todos os indicadores respeitam os filtros abaixo"
        actions={<>
          <button type="button" onClick={() => exportCSV(`relatorio-operacional-${new Date().toISOString().slice(0, 10)}.csv`, exportRows())}
            disabled={!ranking.length} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-white/[0.08] bg-elevated px-3 text-label font-semibold text-secondary transition-colors hover:bg-surface/40 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            <DownloadSimple size={15} /> CSV
          </button>
          <button type="button" onClick={() => printRelatoriosPDF(theme, ranking, totals, kpis, periodoFilter, tipoFilter, [
            `Data: ${dateField === 'datacadastro' ? 'cadastro' : dateField === 'dataagendamento' ? 'agendamento' : 'execução/baixa'}`,
            cidadeFilter ? `Cidade: ${cidadeFilter}` : 'Todas as cidades', equipeFilter ? `Equipe: ${equipeFilter}` : 'Todas as equipes', situacaoFilter ? `Situação: ${situacaoFilter}` : 'Todas as situações',
          ])}
            disabled={!ranking.length} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 text-label font-semibold text-white transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            <FileText size={15} /> PDF
          </button>
        </>}
      />

      {/* ── Filtros ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Filtro de período */}
        <div className="flex gap-1 bg-elevated border border-white/[0.08] rounded-lg p-0.5">
          {[
            { value: 'all',   label: 'Período global' },
            { value: 'month', label: 'Últimos 30 dias' },
            { value: 'week',  label: 'Últimos 7 dias'  },
          ].map(opt => (
            <button
              type="button" aria-pressed={periodoFilter === opt.value}
              key={opt.value}
              onClick={() => setPeriodoFilter(opt.value)}
              className={`min-h-11 cursor-pointer px-3 py-1.5 rounded-md text-caption font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
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
            { value: 'OUTRO',      label: 'Serviço'    },
          ].map(opt => (
            <button
              type="button" aria-pressed={tipoFilter === opt.value}
              key={opt.value}
              onClick={() => setTipoFilter(opt.value)}
              className={`min-h-11 cursor-pointer px-3 py-1.5 rounded-md text-caption font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                ${tipoFilter === opt.value
                  ? 'bg-primary/20 text-primary'
                  : 'text-secondary hover:text-text hover:bg-surface/40'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="text-caption text-muted">Data
          <select value={dateField} onChange={event => setDateField(event.target.value as typeof dateField)}
            className="ml-2 min-h-11 rounded-lg border border-white/[0.08] bg-elevated px-3 text-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            <option value="datacadastro">Cadastro</option><option value="dataagendamento">Agendamento</option><option value="dataexecucao">Execução/baixa</option>
          </select>
        </label>
        {[{ label: 'Cidade', value: cidadeFilter, set: setCidadeFilter, options: cidades }, { label: 'Equipe', value: equipeFilter, set: setEquipeFilter, options: equipes }, { label: 'Situação', value: situacaoFilter, set: setSituacaoFilter, options: situacoes }].map(filter => (
          <label key={filter.label} className="text-caption text-muted">{filter.label}
            <select value={filter.value} onChange={event => filter.set(event.target.value)}
              className="ml-2 min-h-11 max-w-44 rounded-lg border border-white/[0.08] bg-elevated px-3 text-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              <option value="">Todos</option>{filter.options.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ))}
        {(tipoFilter || periodoFilter !== 'all' || cidadeFilter || equipeFilter || situacaoFilter) && (
          <button type="button" onClick={() => { setTipoFilter(''); setPeriodoFilter('all'); setCidadeFilter(''); setEquipeFilter(''); setSituacaoFilter('') }}
            className="min-h-11 cursor-pointer rounded-lg px-3 text-caption font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Limpar filtros</button>
        )}
      </div>

      {/* Modal drill-down */}
      <OSListModal
        open={!!drill}
        onClose={() => setDrill(null)}
        title={drill?.title ?? ''}
        rows={drill?.rows ?? []}
        color={drill?.color ?? '#3b82f6'}
        onOS={row => { setDrill(null); setDrawerOS(row) }}
      />
      <OSDrawer os={drawerOS} onClose={() => setDrawerOS(null)} />

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total de OS',  value: kpis.total,                     Icon: ChartBar,     colorCls: 'text-primary',     bgCls: 'bg-primary/10',    rows: drillTotal,   color: '#3b82f6' },
          { label: 'SLA Vencido',  value: kpis.criticas,                  Icon: Warning, colorCls: 'text-red',     bgCls: 'bg-red/10',    rows: drillSlaVenc, color: '#f87171' },
          { label: 'Sem Equipe',   value: kpis.semEquipe,                 Icon: Clock,         colorCls: 'text-orange',  bgCls: 'bg-orange/10', rows: drillSemEq,   color: '#f97316' },
          { label: 'Aging Médio',  value: `${kpis.avgAging.toFixed(1)}d`, Icon: TrendUp,    colorCls: 'text-green', bgCls: 'bg-green/10',rows: drillAging,   color: '#4ade80' },
        ].map(k => {
          const KIcon = k.Icon
          return (
            <button type="button" key={k.label}
                 className="bg-elevated border border-white/[0.08] rounded-xl px-4 py-3
                            flex min-h-20 items-center gap-3 cursor-pointer text-left hover:bg-surface/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                 onClick={() => setDrill({ title: `${k.label} — ${k.rows.length} ordens`, rows: k.rows, color: k.color })}>
              <div className={`w-9 h-9 rounded-lg ${k.bgCls} flex items-center justify-center flex-shrink-0`}>
                <KIcon size={16} className={k.colorCls} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-mono font-black tabular-nums text-[26px] leading-none text-text">{k.value}</p>
                <p className="text-caption text-secondary mt-0.5">{k.label}</p>
              </div>
              <CaretRight size={13} className="text-muted flex-shrink-0" />
            </button>
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
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 p-4">
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
                  { label: 'Rede',        value: totals.execRede,    pct: totals.pctRede,    color: '#c4b5fd', rows: drillConclRede },
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
                  {totals.pctRede    > 0 && <div className="transition-all duration-700" style={{ width: `${totals.pctRede}%`,    background: '#c4b5fd' }} title={`Rede ${totals.pctRede}%`} />}
                </div>
                <div className="flex items-center gap-5 mt-2">
                  {[
                    { label: 'Instalações', color: '#60a5fa', pct: totals.pctInst    },
                    { label: 'Manutenções', color: '#fb923c', pct: totals.pctManut   },
                    { label: 'Serviços',    color: '#34d399', pct: totals.pctServico },
                    { label: 'Rede',        color: '#c4b5fd', pct: totals.pctRede    },
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
                      <Bar dataKey="OS na Fila" fill="rgba(99,102,241,0.6)" name="OS na Fila" onClick={(data: Record<string, unknown>) => setDrill({ title: `Fila da equipe ${data.name}`, rows: filteredRows.filter(r => isFilaAtiva(r.descsituacao) && shortEquipe(r.nomedaequipe).split(' - ')[0].trim() === data.name) })} />
                      <Bar dataKey="Críticas" fill="rgba(248,113,113,0.55)" name="Críticas" onClick={(data: Record<string, unknown>) => setDrill({ title: `SLA vencido · ${data.name}`, rows: filteredRows.filter(r => isFilaAtiva(r.descsituacao) && (r._slaExcedido || r._slaSemAgend) && shortEquipe(r.nomedaequipe).split(' - ')[0].trim() === data.name) })} />
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
                    onClick={entry => { const tipo = entry.name === 'Instalação' ? 'INSTALACAO' : entry.name === 'Manutenção' ? 'MANUTENCAO' : entry.name === 'Rede' ? 'REDE' : 'OUTRO'; setDrill({ title: entry.name, rows: filteredRows.filter(r => r._tipo === tipo) }) }}
                  />
                )
                : <Empty />}
            </Section>
          </div>

          {/* ── Gráficos linha 2 ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            <Section title="SLA da Fila por Equipe" subtitle="Percentual das OS ativas ainda dentro do prazo" height="h-64">
              {slaData.length > 0
                ? (
                  <BarChart data={slaData}>
                    <Bar dataKey="value" name="SLA %" onClick={(data: Record<string, unknown>) => setDrill({ title: `Fila da equipe ${data.name}`, rows: filteredRows.filter(r => isFilaAtiva(r.descsituacao) && shortEquipe(r.nomedaequipe).split(' - ')[0].trim() === data.name) })}>
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
                    <Bar dataKey="value" name="OS" onClick={(data: Record<string, unknown>) => { const band = agingData.find(item => item.name === data.name); if (!band) return; const defs: Record<string, [number, number]> = { '0–3d': [0, 3], '4–7d': [4, 7], '8–14d': [8, 14], '15–30d': [15, 30], '>30d': [31, Infinity] }; const range = defs[band.name]; setDrill({ title: `Aging ${band.name}`, rows: filteredRows.filter(r => isFilaAtiva(r.descsituacao) && r._aging != null && r._aging >= range[0] && r._aging <= range[1]) }) }}>
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

          <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-elevated">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] px-5 py-4">
              <div><p className="text-body font-semibold text-text">Prévia do relatório por equipe</p><p className="mt-0.5 text-caption text-muted">Inclui equipes não cadastradas e OS sem equipe · clique para detalhar</p></div>
              <span className="rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-1 text-caption font-semibold text-primary">{ranking.length} linhas</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-label">
                <thead className="bg-surface/30 text-caption font-bold uppercase tracking-wide text-muted">
                  <tr>{['Equipe / líder', 'Instalação', 'Manutenção', 'Serviço', 'Rede', 'Executadas', 'Fila', 'SLA fila', 'Vencidas', 'Aging'].map(label => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {ranking.map(entry => {
                    const teamRows = filteredRows.filter(row => (shortEquipe(row.nomedaequipe).split(' - ')[0].trim() || 'Sem equipe') === entry.code)
                    const executed = entry.execInst + entry.execManut + entry.execServico + entry.execRede
                    return (
                      <tr key={entry.code} tabIndex={0} role="button" aria-label={`Detalhar equipe ${entry.code}, ${teamRows.length} ordens`}
                        onClick={() => setDrill({ title: `Equipe ${entry.code} · ${teamRows.length} ordens`, rows: teamRows })}
                        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDrill({ title: `Equipe ${entry.code} · ${teamRows.length} ordens`, rows: teamRows }) } }}
                        className="cursor-pointer transition-colors hover:bg-surface/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50">
                        <td className="px-4 py-3"><p className="font-bold text-text">{entry.code}</p><p className="text-caption text-muted">{entry.leader}</p></td>
                        <td className="px-4 py-3 font-mono text-blue-400">{entry.execInst}</td><td className="px-4 py-3 font-mono text-orange">{entry.execManut}</td>
                        <td className="px-4 py-3 font-mono text-green">{entry.execServico}</td><td className="px-4 py-3 font-mono text-purple-400">{entry.execRede}</td>
                        <td className="px-4 py-3 font-mono font-bold text-text">{executed}</td><td className="px-4 py-3 font-mono text-text">{entry.queue}</td>
                        <td className="px-4 py-3 font-mono text-text">{entry.queue ? `${entry.sla}%` : '—'}</td><td className="px-4 py-3 font-mono text-red">{entry.criticas}</td>
                        <td className="px-4 py-3 font-mono text-muted">{entry.avgAging.toFixed(1)}d</td>
                      </tr>
                    )
                  })}
                  {!ranking.length && <tr><td colSpan={10} className="px-4 py-10 text-center text-muted">Nenhuma equipe encontrada no recorte.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

        </>
      )}
    </div>
  )
}
