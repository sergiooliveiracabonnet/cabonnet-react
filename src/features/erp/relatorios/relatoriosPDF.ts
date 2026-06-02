export interface PDFRankEntry {
  code: string; leader: string; tipo: string
  queue: number; execInst: number; execManut: number; execServico: number
  criticas: number; avgAging: number; sla: number
}

export interface PDFKpis {
  total: number; criticas: number; semEquipe: number; avgAging: number
}

export interface PDFTotals {
  execInst: number; execManut: number; execServico: number; execTotal: number
  queue: number; slaVenc: number; avgSla: number; avgAging: number
  pctInst: number; pctManut: number; pctServico: number
}

export function printRelatoriosPDF(
  theme:        string,
  ranking:      PDFRankEntry[],
  totals:       PDFTotals,
  kpis:         PDFKpis,
  periodoFilter: string,
  tipoFilter:   string,
): void {
  const isDark = theme === 'dark'
  const c = isDark ? {
    bg: '#06060a', surface: '#0e0f16', card: '#12131a',
    border: 'rgba(255,255,255,0.08)', border2: 'rgba(255,255,255,0.04)',
    text: '#e8ecf5', secondary: '#a8b2cc', muted: '#768296',
    primary: '#3b82f6', green: '#4ade80', red: '#f87171', orange: '#fb923c', yellow: '#fbbf24',
  } : {
    bg: '#f0f4f8', surface: '#ffffff', card: '#f8fafc',
    border: 'rgba(0,0,0,0.09)', border2: 'rgba(0,0,0,0.05)',
    text: '#0f1722', secondary: '#334155', muted: '#507282',
    primary: '#0284c7', green: '#16a34a', red: '#dc2626', orange: '#c2410c', yellow: '#a16207',
  }

  const now         = new Date()
  const dateStr     = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const timeStr     = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const periodLabel = periodoFilter === 'all' ? 'Todo o período' : periodoFilter === 'month' ? 'Últimos 30 dias' : 'Últimos 7 dias'
  const tipoLabel   = tipoFilter === '' ? 'Todos os tipos' : tipoFilter === 'INSTALACAO' ? 'Instalação' : tipoFilter === 'MANUTENCAO' ? 'Manutenção' : 'Rede'

  const tableRows = ranking.map((r, i) => {
    const slaColor    = r.sla >= 90 ? c.green : r.sla >= 75 ? c.orange : r.sla > 0 ? c.red : c.muted
    const criticasClr = r.criticas > 0 ? c.red : c.muted
    const agingColor  = r.avgAging >= 6 ? c.red : r.avgAging >= 3 ? c.orange : c.muted
    const leaderFmt   = r.leader ? r.leader.charAt(0) + r.leader.slice(1).toLowerCase() : '—'
    const instClr     = r.execInst   > 0 ? '#60a5fa' : c.muted
    const manutClr    = r.execManut  > 0 ? '#fb923c' : c.muted
    const servicoClr  = r.execServico > 0 ? '#34d399' : c.muted
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
        <td class="mono" style="font-weight:${r.execServico > 0 ? '800' : '400'};color:${servicoClr};font-size:13px">${r.execServico > 0 ? r.execServico : '—'}</td>
        <td class="mono" style="font-weight:800;color:${c.text};font-size:13px">${r.execInst + r.execManut + r.execServico || '—'}</td>
        <td class="mono" style="font-weight:700;color:${c.text};font-size:13px">${r.queue}</td>
        <td class="mono" style="font-weight:700;color:${slaColor};font-size:13px">${r.sla > 0 ? r.sla.toFixed(0) + '%' : '—'}</td>
        <td class="mono" style="font-weight:${r.criticas > 0 ? '700' : '400'};color:${criticasClr};font-size:13px">${r.criticas}</td>
        <td class="mono" style="color:${agingColor};font-size:12px">${r.avgAging.toFixed(1)}d</td>
      </tr>`
  }).join('')

  const producaoSection = totals.execTotal > 0 ? `
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
  </div>` : ''

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
  body{background:${c.bg};color:${c.text};font-family:'Inter',system-ui,-apple-system,sans-serif;font-size:12px;font-optical-sizing:auto;font-feature-settings:"cv11" 1,"zero" 1,"ss01" 1;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:geometricPrecision;-webkit-print-color-adjust:exact;print-color-adjust:exact}
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
    <div class="kpi"><div class="kpi-bar" style="background:${c.primary}"></div><div class="kpi-lbl">Total de OS</div><div class="kpi-val" style="color:${c.primary}">${kpis.total}</div></div>
    <div class="kpi"><div class="kpi-bar" style="background:${c.red}"></div><div class="kpi-lbl">SLA Vencido</div><div class="kpi-val" style="color:${c.red}">${kpis.criticas}</div></div>
    <div class="kpi"><div class="kpi-bar" style="background:${c.orange}"></div><div class="kpi-lbl">Sem Equipe</div><div class="kpi-val" style="color:${c.orange}">${kpis.semEquipe}</div></div>
    <div class="kpi"><div class="kpi-bar" style="background:${c.green}"></div><div class="kpi-lbl">Aging Médio</div><div class="kpi-val" style="color:${c.green}">${kpis.avgAging.toFixed(1)}d</div></div>
  </div>
  <div class="chips">
    <span class="chip-lbl">Filtros:</span>
    <span class="chip">${periodLabel}</span>
    <span class="chip">${tipoLabel}</span>
    <span class="chip">${ranking.length} equipe${ranking.length !== 1 ? 's' : ''}</span>
  </div>
  ${producaoSection}
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
          <th>#</th><th>Equipe / Líder</th>
          <th style="color:#60a5fa;border-left:1px solid ${c.border}">Instalação</th>
          <th style="color:#fb923c">Manutenção</th><th style="color:#34d399">Serviço</th>
          <th style="color:${c.text}">Total</th><th>OS na Fila</th><th>SLA</th><th>SLA Venc.</th><th>Aging Médio</th>
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
