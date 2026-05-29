// @ts-nocheck
import { useMemo, useState } from 'react'
import {
  BarChart2, TrendingUp, Clock, AlertTriangle,
  Download, CheckCircle2, Printer, ChevronRight,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, ChartTooltip, Grid, Legend, Cell } from '../../../components/ui/bar-chart'
import { DonutChart } from '../../../components/ui/DonutChart'
import { useOSDerived } from '../../../contexts/OSDataContext'
import { TEAMS } from '../erpConstants'
import { shortEquipe, situacaoVariant } from '../../../lib/osFormat'
import { Modal } from '../../../components/ui/Modal'
import { Badge } from '../../../components/ui/Badge'

const RELO_COLORS = ['#60a5fa', '#fb923c', '#34d399', '#c4b5fd', '#f87171', '#facc15']

// ── Helpers ───────────────────────────────────────────────────────────────────

function exportCSV(filename, rows) {
  if (!rows.length) return
  const header = Object.keys(rows[0]).join(';')
  const body   = rows.map(r => Object.values(r).join(';')).join('\n')
  const blob   = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── OSListModal ───────────────────────────────────────────────────────────────

function OSListModal({ open, onClose, title, rows = [], color = '#3b82f6' }) {
  if (!open) return null
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="780px">
      <div className="flex flex-col" style={{ maxHeight: '72vh' }}>
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/[0.08] flex-shrink-0">
          <span className="text-[12px] font-semibold" style={{ color }}>
            {rows.length} {rows.length === 1 ? 'ordem' : 'ordens'}
          </span>
        </div>
        <div className="grid grid-cols-[80px_1fr_110px_110px_55px] gap-3 px-5 py-2
                        bg-surface/20 border-b border-white/[0.05] flex-shrink-0
                        text-[10px] font-bold uppercase tracking-[0.05em] text-muted">
          <span>OS #</span><span>Cliente</span><span>Cidade</span><span>Equipe</span>
          <span className="text-right">Aging</span>
        </div>
        <div className="overflow-y-auto flex-1">
          {rows.length === 0
            ? <div className="px-5 py-10 text-center text-[12px] text-muted">Nenhuma OS encontrada</div>
            : <div className="divide-y divide-white/[0.06]/50">
                {rows.map(r => {
                  const aging = r._agingAbertura ?? 0
                  const agClr = aging >= 6 ? '#f87171' : aging >= 3 ? '#f97316' : '#94a3b8'
                  return (
                    <div key={r.numos}
                         className="grid grid-cols-[80px_1fr_110px_110px_55px] gap-3
                                    px-5 py-2.5 items-center hover:bg-surface/20 transition-colors">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono font-bold text-[11px]" style={{ color }}>{r.numos}</span>
                        <Badge variant={situacaoVariant(r.descsituacao)} className="text-[9px] px-1.5 py-px w-fit">
                          {(r.descsituacao || '—').replace('Concluída/Sem Execução', 'S/Exec')}
                        </Badge>
                      </div>
                      <span className="text-[12px] font-semibold text-text truncate">{r.nomecliente || '—'}</span>
                      <span className="text-[11px] text-secondary truncate">{r.nomedacidade || '—'}</span>
                      <span className="text-[11px] text-muted truncate">{shortEquipe(r.nomedaequipe) || '—'}</span>
                      <span className="font-mono font-bold text-[12px] text-right" style={{ color: agClr }}>{aging}d</span>
                    </div>
                  )
                })}
              </div>}
        </div>
      </div>
    </Modal>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, subtitle, action, children, height = 'h-64' }) {
  return (
    <div className="bg-elevated border border-white/[0.08] rounded-xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] flex-shrink-0">
        <div>
          <p className="text-[13px] font-semibold text-text">{title}</p>
          {subtitle && <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={`${height} p-4`}>
        {children}
      </div>
    </div>
  )
}

// ── RelatoriosPage ────────────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const { rows, allRows, isLoading, derived } = useOSDerived()
  const [tipoFilter, setTipoFilter]       = useState('')
  const [periodoFilter, setPeriodoFilter] = useState('all')
  const [drill, setDrill]                 = useState(null) // { title, rows, color }

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
      ? agingRows.reduce((s, r) => s + r._agingAbertura, 0) / agingRows.length
      : 0
    return { total, criticas, semEquipe, avgAging }
  }, [filteredRows, allRows])

  // ── OS por equipe (top 10) ──
  const byTeam = useMemo(() => {
    const map = {}
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
    const AGING_FILL = ['rgba(52,211,153,0.65)', 'rgba(250,204,21,0.65)', 'rgba(251,146,60,0.65)', 'rgba(248,113,113,0.65)', 'rgba(248,113,113,0.8)']
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
    const map = {}
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
  const ranking = useMemo(() => {
    const map = {}
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
    const pct = v => execTotal > 0 ? Math.round((v / execTotal) * 100) : 0
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

  function exportPDF(theme) {
    const isDark = theme === 'dark'
    const c = isDark ? {
      bg:       '#06060a',
      surface:  '#0e0f16',
      card:     '#12131a',
      border:   'rgba(255,255,255,0.08)',
      border2:  'rgba(255,255,255,0.04)',
      text:     '#e8ecf5',
      secondary:'#a8b2cc',
      muted:    '#768296',
      primary:  '#3b82f6',
      green:    '#4ade80',
      red:      '#f87171',
      orange:   '#fb923c',
      yellow:   '#fbbf24',
    } : {
      bg:       '#f0f4f8',
      surface:  '#ffffff',
      card:     '#f8fafc',
      border:   'rgba(0,0,0,0.09)',
      border2:  'rgba(0,0,0,0.05)',
      text:     '#0f1722',
      secondary:'#334155',
      muted:    '#507282',
      primary:  '#0284c7',
      green:    '#16a34a',
      red:      '#dc2626',
      orange:   '#c2410c',
      yellow:   '#a16207',
    }

    const now        = new Date()
    const dateStr    = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    const timeStr    = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const periodLabel= periodoFilter === 'all' ? 'Todo o período' : periodoFilter === 'month' ? 'Últimos 30 dias' : 'Últimos 7 dias'
    const tipoLabel  = tipoFilter === '' ? 'Todos os tipos' : tipoFilter === 'INSTALACAO' ? 'Instalação' : tipoFilter === 'MANUTENCAO' ? 'Manutenção' : 'Rede'

    const tableRows = ranking.map((r, i) => {
      const slaColor    = r.sla >= 90 ? c.green : r.sla >= 75 ? c.orange : r.sla > 0 ? c.red : c.muted
      const criticasClr = r.criticas > 0 ? c.red : c.muted
      const agingColor  = r.avgAging >= 6 ? c.red : r.avgAging >= 3 ? c.orange : c.muted
      const leaderFmt   = r.leader ? r.leader.charAt(0) + r.leader.slice(1).toLowerCase() : '—'
      const instClr     = r.execInst   > 0 ? '#60a5fa' : c.muted
      const manutClr    = r.execManut  > 0 ? '#fb923c' : c.muted
      const servicoClr  = r.execServico> 0 ? '#34d399' : c.muted
      const sepStyle    = `border-left:1px solid ${c.border}`
      return `
        <tr>
          <td class="mono" style="color:${c.muted};font-size:11px">${i + 1}</td>
          <td>
            <div style="font-weight:700;color:${c.text};font-size:12px;letter-spacing:-0.01em">${r.code}</div>
            <div style="font-size:10px;color:${c.muted};margin-top:2px">${leaderFmt}</div>
          </td>
          <td class="mono" style="font-weight:${r.execInst   > 0 ? '800' : '400'};color:${instClr};font-size:13px;${sepStyle}">${r.execInst   > 0 ? r.execInst   : '—'}</td>
          <td class="mono" style="font-weight:${r.execManut  > 0 ? '800' : '400'};color:${manutClr};font-size:13px">${r.execManut  > 0 ? r.execManut  : '—'}</td>
          <td class="mono" style="font-weight:${r.execServico> 0 ? '800' : '400'};color:${servicoClr};font-size:13px">${r.execServico> 0 ? r.execServico: '—'}</td>
          <td class="mono" style="font-weight:800;color:${c.text};font-size:13px">${r.execInst + r.execManut + r.execServico || '—'}</td>
          <td class="mono" style="font-weight:700;color:${c.text};font-size:13px">${r.queue}</td>
          <td class="mono" style="font-weight:700;color:${slaColor};font-size:13px">${r.sla > 0 ? r.sla.toFixed(0) + '%' : '—'}</td>
          <td class="mono" style="font-weight:${r.criticas > 0 ? '700' : '400'};color:${criticasClr};font-size:13px">${r.criticas}</td>
          <td class="mono" style="color:${agingColor};font-size:12px">${r.avgAging.toFixed(1)}d</td>
        </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Ranking de Equipes — Cabonnet</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    background:${c.bg};color:${c.text};
    font-family:'Inter',system-ui,-apple-system,sans-serif;
    font-size:12px;font-optical-sizing:auto;
    font-feature-settings:"cv11" 1,"zero" 1,"ss01" 1;
    -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
    text-rendering:geometricPrecision;
    -webkit-print-color-adjust:exact;print-color-adjust:exact
  }
  @page{size:A4 landscape;margin:12mm 10mm}
  .mono{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1,"zero" 1,"ss01" 1;letter-spacing:-0.025em}
  .wrap{max-width:1060px;margin:0 auto;padding:20px 24px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
  .logo{font-size:22px;font-weight:900;letter-spacing:-0.5px;color:${c.primary};font-feature-settings:"cv11" 1}
  .logo-sub{font-size:10px;color:${c.muted};margin-top:3px;letter-spacing:1.2px;text-transform:uppercase}
  .hdr-right{text-align:right}
  .hdr-title{font-size:17px;font-weight:700;color:${c.text};letter-spacing:-0.02em}
  .hdr-sub{font-size:10px;color:${c.muted};margin-top:4px}
  .divider{height:2px;background:linear-gradient(90deg,${c.primary},${c.primary}55,transparent);border-radius:1px;margin-bottom:18px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
  .kpi{background:${c.surface};border:1px solid ${c.border};border-radius:10px;padding:12px 14px;position:relative;overflow:hidden}
  .kpi-bar{position:absolute;top:0;left:0;right:0;height:2px}
  .kpi-lbl{font-size:9px;color:${c.muted};text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;font-weight:600}
  .kpi-val{font-size:30px;font-weight:900;font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1,"zero" 1,"ss01" 1;letter-spacing:-0.04em;line-height:1}
  .chips{display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap}
  .chip-lbl{font-size:10px;color:${c.muted}}
  .chip{font-size:10px;border:1px solid ${c.border};border-radius:20px;padding:2px 10px;color:${c.secondary};background:${c.card}}
  .tbl-wrap{background:${c.surface};border:1px solid ${c.border};border-radius:12px;overflow:hidden}
  .tbl-hdr{padding:12px 16px 10px;border-bottom:1px solid ${c.border}}
  .tbl-hdr-title{font-size:13px;font-weight:700;color:${c.text};letter-spacing:-0.01em}
  .tbl-hdr-sub{font-size:10px;color:${c.muted};margin-top:2px}
  table{width:100%;border-collapse:collapse}
  thead tr{background:${c.card}}
  th{text-align:left;padding:9px 14px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:${c.muted};border-bottom:1px solid ${c.border}}
  td{padding:9px 14px;border-bottom:1px solid ${c.border2};vertical-align:middle}
  tr:last-child td{border-bottom:none}
  .footer{margin-top:14px;display:flex;justify-content:space-between;font-size:9px;color:${c.muted}}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div>
      <div class="logo">Cabonnet</div>
      <div class="logo-sub">ISP Operations · Vale do Paraíba</div>
    </div>
    <div class="hdr-right">
      <div class="hdr-title">Ranking de Equipes</div>
      <div class="hdr-sub">Desempenho consolidado · ${dateStr} às ${timeStr}</div>
    </div>
  </div>

  <div class="divider"></div>

  <div class="kpis">
    <div class="kpi">
      <div class="kpi-bar" style="background:${c.primary}"></div>
      <div class="kpi-lbl">Total de OS</div>
      <div class="kpi-val" style="color:${c.primary}">${kpis.total}</div>
    </div>
    <div class="kpi">
      <div class="kpi-bar" style="background:${c.red}"></div>
      <div class="kpi-lbl">SLA Vencido</div>
      <div class="kpi-val" style="color:${c.red}">${kpis.criticas}</div>
    </div>
    <div class="kpi">
      <div class="kpi-bar" style="background:${c.orange}"></div>
      <div class="kpi-lbl">Sem Equipe</div>
      <div class="kpi-val" style="color:${c.orange}">${kpis.semEquipe}</div>
    </div>
    <div class="kpi">
      <div class="kpi-bar" style="background:${c.green}"></div>
      <div class="kpi-lbl">Aging Médio</div>
      <div class="kpi-val" style="color:${c.green}">${kpis.avgAging.toFixed(1)}d</div>
    </div>
  </div>

  <div class="chips">
    <span class="chip-lbl">Filtros:</span>
    <span class="chip">${periodLabel}</span>
    <span class="chip">${tipoLabel}</span>
    <span class="chip">${ranking.length} equipe${ranking.length !== 1 ? 's' : ''}</span>
  </div>

  ${totals.execTotal > 0 ? `
  <div style="margin-bottom:16px;background:${c.surface};border:1px solid ${c.border};border-radius:12px;overflow:hidden">
    <div style="padding:12px 16px 10px;border-bottom:1px solid ${c.border}">
      <div style="font-size:13px;font-weight:700;color:${c.text}">Produção Consolidada do Período</div>
      <div style="font-size:10px;color:${c.muted};margin-top:2px">Total de OS executadas (concluídas) por tipo de serviço</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:12px 16px">
      <div style="background:${c.card};border:1px solid ${c.border};border-radius:10px;padding:12px 14px;position:relative;overflow:hidden">
        <div style="position:absolute;top:0;left:0;right:0;height:2px;background:rgba(255,255,255,0.2)"></div>
        <div style="font-size:9px;color:${c.muted};text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">Total Executado</div>
        <div class="mono" style="font-size:34px;font-weight:900;color:${c.text};line-height:1">${totals.execTotal}</div>
        <div style="font-size:9px;color:${c.muted};margin-top:6px">${ranking.length} equipes</div>
      </div>
      ${[
        { label: 'Instalações', value: totals.execInst,    pct: totals.pctInst,    color: '#60a5fa' },
        { label: 'Manutenções', value: totals.execManut,   pct: totals.pctManut,   color: '#fb923c' },
        { label: 'Serviços',    value: totals.execServico, pct: totals.pctServico, color: '#34d399' },
      ].map(s => `
        <div style="background:${c.card};border:1px solid ${s.color}30;border-radius:10px;padding:12px 14px;position:relative;overflow:hidden">
          <div style="position:absolute;top:0;left:0;right:0;height:2px;background:${s.color}"></div>
          <div style="font-size:9px;color:${c.muted};text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">${s.label}</div>
          <div class="mono" style="font-size:30px;font-weight:900;color:${s.color};line-height:1">${s.value}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
            <div style="flex:1;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;margin-right:8px">
              <div style="height:100%;width:${s.pct}%;background:${s.color};border-radius:2px"></div>
            </div>
            <span style="font-size:10px;font-weight:700;color:${s.color}">${s.pct}%</span>
          </div>
        </div>`).join('')}
    </div>
    <div style="padding:0 16px 12px">
      <div style="font-size:9px;color:${c.muted};text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">Proporção</div>
      <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;gap:1px">
        ${totals.pctInst    > 0 ? `<div style="width:${totals.pctInst}%;background:#60a5fa"></div>` : ''}
        ${totals.pctManut   > 0 ? `<div style="width:${totals.pctManut}%;background:#fb923c"></div>` : ''}
        ${totals.pctServico > 0 ? `<div style="width:${totals.pctServico}%;background:#34d399"></div>` : ''}
      </div>
    </div>
  </div>` : ''}

  <div class="tbl-wrap">
    <div class="tbl-hdr">
      <div class="tbl-hdr-title">Ranking de Equipes</div>
      <div class="tbl-hdr-sub">Ordenado por volume de OS na fila (maior → menor)</div>
    </div>
    <table>
      <thead>
        <tr>
          <th colspan="2"></th>
          <th colspan="4" style="text-align:center;color:${c.primary};font-size:9px;letter-spacing:1px;text-transform:uppercase;padding:6px 14px 4px;border-left:1px solid ${c.border}">Executadas no período</th>
          <th colspan="4"></th>
        </tr>
        <tr>
          <th>#</th>
          <th>Equipe / Líder</th>
          <th style="color:#60a5fa;border-left:1px solid ${c.border}">Instalação</th>
          <th style="color:#fb923c">Manutenção</th>
          <th style="color:#34d399">Serviço</th>
          <th style="color:${c.text}">Total</th>
          <th>OS na Fila</th>
          <th>SLA</th>
          <th>SLA Venc.</th>
          <th>Aging Médio</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
      <tfoot>
        <tr style="border-top:2px solid ${c.border};background:${isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)'}">
          <td colspan="2" style="padding:10px 14px;font-size:11px;font-weight:700;color:${c.text};text-transform:uppercase;letter-spacing:.5px">
            Total Geral <span style="font-weight:400;color:${c.muted};font-size:10px">· ${ranking.length} equipes</span>
          </td>
          <td class="mono" style="padding:10px 14px;font-weight:900;font-size:15px;color:#60a5fa;border-left:1px solid ${c.border}">${totals.execInst}</td>
          <td class="mono" style="padding:10px 14px;font-weight:900;font-size:15px;color:#fb923c">${totals.execManut}</td>
          <td class="mono" style="padding:10px 14px;font-weight:900;font-size:15px;color:#34d399">${totals.execServico}</td>
          <td class="mono" style="padding:10px 14px;font-weight:900;font-size:15px;color:${c.text}">${totals.execTotal}</td>
          <td class="mono" style="padding:10px 14px;font-weight:700;font-size:13px;color:${c.text}">${totals.queue}</td>
          <td class="mono" style="padding:10px 14px;font-weight:700;font-size:13px;color:${totals.avgSla >= 90 ? '#34d399' : totals.avgSla >= 75 ? '#fb923c' : '#f87171'}">${totals.avgSla > 0 ? totals.avgSla.toFixed(0) + '%' : '—'}</td>
          <td class="mono" style="padding:10px 14px;font-weight:700;font-size:13px;color:${totals.slaVenc > 0 ? '#f87171' : c.muted}">${totals.slaVenc}</td>
          <td class="mono" style="padding:10px 14px;font-weight:700;font-size:13px;color:${c.muted}">${totals.avgAging.toFixed(1)}d</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="footer">
    <span>Cabonnet ISP Dashboard — SJC · Caçapava · Taubaté · Tremembé · Pindamonhangaba</span>
    <span>Exportado em ${dateStr} às ${timeStr} · Tema ${isDark ? 'Escuro' : 'Claro'}</span>
  </div>
</div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400))</script>
</body>
</html>`

    const win = window.open('', '_blank', 'width=1000,height=720')
    if (!win) return
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  return (
    <div className="flex flex-col gap-5 p-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-headline font-bold text-text">Relatórios Operacionais</h1>
          <p className="text-[12px] text-secondary mt-0.5">Análise de desempenho · ERP</p>
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
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-150
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
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-150
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
          { label: 'SLA Vencido',  value: kpis.criticas,                  Icon: AlertTriangle, colorCls: 'text-red-400',     bgCls: 'bg-red-500/10',    rows: drillSlaVenc, color: '#f87171' },
          { label: 'Sem Equipe',   value: kpis.semEquipe,                 Icon: Clock,         colorCls: 'text-orange-400',  bgCls: 'bg-orange-500/10', rows: drillSemEq,   color: '#f97316' },
          { label: 'Aging Médio',  value: `${kpis.avgAging.toFixed(1)}d`, Icon: TrendingUp,    colorCls: 'text-emerald-400', bgCls: 'bg-emerald-500/10',rows: drillAging,   color: '#4ade80' },
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
                <p className="text-[11px] text-secondary mt-0.5">{k.label}</p>
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
                <p className="text-[13px] font-semibold text-text">Produção Consolidada do Período</p>
                <p className="text-[11px] text-muted mt-0.5">Total de OS executadas (concluídas) por tipo de serviço</p>
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4">
                {/* Total */}
                <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-card px-5 py-4
                                flex flex-col justify-between cursor-pointer hover:bg-surface/30 transition-colors"
                     onClick={() => setDrill({ title: `Total Executado — ${drillConcl.length} ordens`, rows: drillConcl, color: '#3b82f6' })}>
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-surface/200" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">Total Executado</p>
                  <p className="font-mono font-black tabular-nums leading-none text-text" style={{ fontSize: 'clamp(36px,4vw,48px)' }}>
                    {totals.execTotal}
                  </p>
                  <p className="text-[10px] text-muted mt-2">{ranking.length} equipes · período selecionado</p>
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
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">{s.label}</p>
                    <p className="font-mono font-black tabular-nums leading-none" style={{ fontSize: 'clamp(32px,3.5vw,42px)', color: s.color }}>
                      {s.value}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-[10px] text-muted">do total</p>
                      <span className="font-bold text-[12px]" style={{ color: s.color }}>{s.pct}%</span>
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
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted mb-2">Proporção da produção</p>
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
                    <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-muted">
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
                    <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
                    <Grid />
                    <ChartTooltip suffix="%" formatter={(v) => `SLA: ${v.toFixed(1)}%`} />
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
                <p className="text-[13px] font-semibold text-text">Ranking de Equipes</p>
                <p className="text-[11px] text-muted mt-0.5">Desempenho consolidado</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleExportRanking}
                  className="flex items-center gap-1.5 text-[11px] text-secondary hover:text-text
                             px-3 py-1.5 rounded-lg border border-white/[0.08] hover:border-muted/30
                             transition-colors"
                  title="Exportar tabela como CSV"
                >
                  <Download size={12} />
                  CSV
                </button>
                <button
                  onClick={() => exportPDF('dark')}
                  className="flex items-center gap-1.5 text-[11px] text-secondary hover:text-text
                             px-3 py-1.5 rounded-lg border border-white/[0.08] hover:border-muted/30
                             transition-colors"
                  title="Exportar PDF com tema escuro"
                >
                  <Printer size={12} />
                  PDF Escuro
                </button>
                <button
                  onClick={() => exportPDF('light')}
                  className="flex items-center gap-1.5 text-[11px] text-secondary hover:text-text
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
              <table className="w-full text-[12px]">
                <thead>
                  {/* Grupo "Executadas" */}
                  <tr className="border-b border-white/[0.03]">
                    <th colSpan={2} className="px-4 py-1" />
                    <th colSpan={4}
                        className="px-4 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest
                                   text-primary/70 border-l border-white/[0.08]">
                      Executadas no período
                    </th>
                    <th colSpan={4} className="px-4 py-1" />
                  </tr>
                  <tr className="border-b border-white/[0.05]">
                    {['#', 'Equipe'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted">
                        {h}
                      </th>
                    ))}
                    {[
                      { label: 'Instalação', color: '#60a5fa' },
                      { label: 'Manutenção', color: '#fb923c' },
                      { label: 'Serviço',    color: '#34d399' },
                    ].map((h, i) => (
                      <th key={h.label}
                          className={`text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider
                                      ${i === 0 ? 'border-l border-white/[0.08]' : ''}`}
                          style={{ color: h.color }}>
                        {h.label}
                      </th>
                    ))}
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-text">
                      Total
                    </th>
                    {['OS Fila', 'SLA', 'SLA Venc.', 'Aging Méd.'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted">
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
                        <p className="text-[10px] text-muted capitalize">
                          {r.leader.charAt(0) + r.leader.slice(1).toLowerCase()}
                        </p>
                      </td>
                      {/* ── Executadas ── */}
                      <td className="px-4 py-3 border-l border-white/[0.08]">
                        <span className={`font-mono font-bold tabular-nums ${r.execInst > 0 ? 'text-blue-400' : 'text-muted'}`}>
                          {r.execInst > 0 ? r.execInst : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-bold tabular-nums ${r.execManut > 0 ? 'text-orange-400' : 'text-muted'}`}>
                          {r.execManut > 0 ? r.execManut : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-bold tabular-nums ${r.execServico > 0 ? 'text-emerald-400' : 'text-muted'}`}>
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
                          ${r.sla >= 90 ? 'text-emerald-400' : r.sla >= 75 ? 'text-orange-400' : 'text-red-400'}`}>
                          {r.sla > 0 ? `${r.sla.toFixed(0)}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-bold tabular-nums ${r.criticas > 0 ? 'text-red-400' : 'text-muted'}`}>
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
                    <tr className="border-t-2 border-border bg-surface/20">
                      <td colSpan={2} className="px-4 py-3">
                        <span className="text-[11px] font-bold text-text uppercase tracking-wide">Total Geral</span>
                        <span className="text-[10px] text-muted ml-1.5">· {ranking.length} equipes</span>
                      </td>
                      <td className="px-4 py-3 border-l border-white/[0.08]">
                        <span className="font-mono font-black text-[15px] tabular-nums text-blue-400">{totals.execInst}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-black text-[15px] tabular-nums text-orange-400">{totals.execManut}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-black text-[15px] tabular-nums text-emerald-400">{totals.execServico}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-black text-[15px] tabular-nums text-text">{totals.execTotal}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-[13px] tabular-nums text-text">{totals.queue}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-bold text-[13px] tabular-nums
                          ${totals.avgSla >= 90 ? 'text-emerald-400' : totals.avgSla >= 75 ? 'text-orange-400' : 'text-red-400'}`}>
                          {totals.avgSla > 0 ? `${totals.avgSla.toFixed(0)}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-bold text-[13px] tabular-nums ${totals.slaVenc > 0 ? 'text-red-400' : 'text-muted'}`}>
                          {totals.slaVenc}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-[13px] tabular-nums text-muted">{totals.avgAging.toFixed(1)}d</span>
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

function Empty({ label = 'Sem dados' }) {
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-sm text-muted/40">{label}</p>
    </div>
  )
}
