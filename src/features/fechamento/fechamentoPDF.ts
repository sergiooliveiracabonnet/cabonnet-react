import { jsPDF } from 'jspdf'
import { shortEquipe } from '../../lib/osFormat'
import type { OSRow } from '../../lib/types'
import type { FechamentoStats } from './fechamentoUtils'

type RGB = readonly [number, number, number]
type CellAlign = 'left' | 'right' | 'center' | 'justify'
type PDFCell = string | { v: string; align?: CellAlign }
type ColorMap = Record<number, RGB>

// ── Palette ────────────────────────────────────────────────────────────────────
const C: Record<string, RGB> = {
  navy:   [15,  23,  42],
  accent: [14, 165, 233],
  green:  [16, 185, 129],
  yellow: [245,158,  11],
  orange: [249,115,  22],
  red:    [239, 68,  68],
  purple: [139, 92, 246],
  muted:  [100,116, 139],
  border: [226,232, 240],
  bg:     [248,250, 252],
  white:  [255,255, 255],
  teal:   [8,  145, 178],
}

const SLA_MIN = 80

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDataAt(r: OSRow): string {
  const d = r.dataexecucao || r.databaixa || r.dataagendamento || ''
  if (!d) return '—'
  const m = String(d).match(/(\d{2})\/(\d{2})\/(\d{2,4})/)
  return m ? `${m[1]}/${m[2]}/${m[3].slice(-2)}` : String(d).slice(0, 8)
}

function cat4(r: OSRow): string {
  const t = (r.tiposervico || '').toUpperCase()
  if (t.includes('INSTALACAO') || t.includes('INSTALAÇÃO')) return 'INSTALAÇÃO'
  if (t.includes('MANUTENCAO') || t.includes('MANUTENÇÃO') || t.includes('VT') || t.includes('VISITA')) return 'MANUTENÇÃO'
  if (t.includes('SERVICO') || t.includes('SERVIÇO')) return 'SERVIÇO'
  return 'OUTROS'
}

function subServ(r: OSRow): string {
  const s = (r.servico || '').toUpperCase()
  if (s.includes('TROCA') && s.includes('EQUIP'))                              return 'TROCA DE EQUIPAMENTO'
  if (s.includes('TRANSF') || (s.includes('ENDERE') && !s.includes('TROCA'))) return 'TRANSFERÊNCIA DE ENDEREÇO'
  if (s.includes('CONFIG') && (s.includes('ROTE') || s.includes('ROUTER')))   return 'CONFIGURAÇÃO DE ROTEADOR'
  if (s.includes('CABEAMENTO') || (s.includes('TROCA') && s.includes('CAB'))) return 'TROCA DE CABEAMENTO'
  if (s.includes('CONNECT HOME') || s.includes('CONNECT HOMI'))                return 'CONNECT HOME'
  if ((s.includes('MUDANCA') || s.includes('MUDANÇA')) && s.includes('PONTO')) return 'MUDANÇA DE PONTO'
  const raw = (r.servico || 'Outros').trim()
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const dateOnly = s.split(' ')[0]
  const parts = dateOnly.split(/[/\\]/)
  if (parts.length < 3) return null
  const [d, m, y] = parts.map(Number)
  if (!d || !m || !y || m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, m - 1, d)
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return dt
}

function minDate(arr: OSRow[]): Date | null {
  return arr.reduce<Date | null>((m, r) => {
    const d = parseDate(r.dataexecucao) || parseDate(r.databaixa) || parseDate(r.dataagendamento)
    return (d && (!m || d < m)) ? d : m
  }, null)
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════════

export function generateFechamentoPDF({ rows, rede, stats, statsRede, periodoLabel }: {
  rows: OSRow[]; rede: OSRow[]
  stats: FechamentoStats; statsRede: FechamentoStats | null
  periodoLabel: string
}): jsPDF {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W    = 210, M = 16, CW = W - M * 2
  let   y    = M, page = 1, _ri = 0

  // ── Drawing helpers ─────────────────────────────────────────────────────────
  const _f = (c: RGB) => doc.setFillColor(...c)
  const _t = (c: RGB) => doc.setTextColor(...c)
  const _d = (c: RGB) => doc.setDrawColor(...c)
  const _b = (s?: number) => { doc.setFont('helvetica', 'bold');   if (s) doc.setFontSize(s) }
  const _n = (s?: number) => { doc.setFont('helvetica', 'normal'); if (s) doc.setFontSize(s) }
  const _line = (x1: number, y1: number, x2: number, y2: number, w?: number, color?: RGB) => {
    _d(color || C.border); doc.setLineWidth(w || 0.2); doc.line(x1, y1, x2, y2)
  }

  const _footer = () => {
    _line(M, 283, W - M, 283, 0.2, C.border)
    _n(6.5); _t(C.muted); doc.text('Cabonnet  ·  Gestão de Ordens de Serviço', M, 287)
    _b(6.5); _t(C.navy);  doc.text('Página ' + page, W - M, 287, { align: 'right' })
  }
  const _newPage = () => { _footer(); doc.addPage(); page++; y = M }
  const _checkY  = (n: number) => { if (y + n > 278) _newPage() }

  const _section = (title: string, color?: RGB) => {
    _checkY(14)
    _line(M, y, W - M, y, 0.2, C.border); y += 5
    _b(8.5); _t(color || C.navy); doc.text(title, M, y); y += 8
  }

  const _renderCells = (cells: PDFCell[], cols: number[]) => {
    cells.forEach((cell, i) => {
      const colW  = i < cols.length - 1 ? cols[i + 1] - cols[i] : CW - cols[i]
      const align = typeof cell === 'object' && cell.align ? cell.align : 'left'
      const txt   = typeof cell === 'object' ? String(cell.v) : String(cell)
      const x     = M + cols[i]
      if      (align === 'right')  doc.text(txt, x + colW - 1.5, y, { align: 'right' })
      else if (align === 'center') doc.text(txt, x + colW / 2,   y, { align: 'center' })
      else                         doc.text(txt.slice(0, Math.floor(colW / 2.1)), x, y)
    })
  }

  const _tHead = (cells: PDFCell[], cols: number[]) => {
    _checkY(11)
    _f(C.bg); doc.rect(M, y - 7, CW, 9.5, 'F')
    _line(M, y - 7,   W - M, y - 7,   0.15, C.border)
    _line(M, y + 2.5, W - M, y + 2.5, 0.3,  C.navy)
    _b(6.5); _t(C.navy); _renderCells(cells, cols); y += 5.5
  }

  const _tRow = (cells: PDFCell[], cols: number[], colorMap?: ColorMap) => {
    _checkY(8); _ri++
    if (_ri % 2 === 0) { _f(C.bg); doc.rect(M, y - 5.5, CW, 7.5, 'F') }
    _line(M, y + 2, W - M, y + 2, 0.1, C.border)
    _n(7.5)
    cells.forEach((cell, i) => {
      const colW  = i < cols.length - 1 ? cols[i + 1] - cols[i] : CW - cols[i]
      const align = typeof cell === 'object' && cell.align ? cell.align : 'left'
      const txt   = typeof cell === 'object' ? String(cell.v) : String(cell)
      const clr   = colorMap?.[i] ?? C.navy
      _t(clr)
      const x     = M + cols[i]
      if      (align === 'right')  doc.text(txt, x + colW - 1.5, y, { align: 'right' })
      else if (align === 'center') doc.text(txt, x + colW / 2,   y, { align: 'center' })
      else                         doc.text(txt.slice(0, Math.floor(colW / 2.2)), x, y)
    })
    y += 7.5
  }

  const _bar = (bx: number, by: number, bw: number, bh: number, pct: number, color: RGB) => {
    _f(C.border); doc.rect(bx, by, bw, bh, 'F')
    if (pct > 0) { _f(color); doc.rect(bx, by, Math.max(1, bw * pct / 100), bh, 'F') }
  }

  const _kpiCard = (kx: number, ky: number, kw: number, kh: number, value: number | string, label: string, color: RGB) => {
    _d(C.border); doc.setLineWidth(0.2); doc.rect(kx, ky, kw, kh, 'S')
    _b(18); _t(color); doc.text(String(value), kx + kw / 2, ky + kh / 2 + 2.5, { align: 'center' })
    _n(5.5); _t(C.muted); doc.text(label.toUpperCase(), kx + kw / 2, ky + kh - 3, { align: 'center' })
  }

  // ── CAPA ────────────────────────────────────────────────────────────────────
  _f(C.navy); doc.rect(0, 0, W, 22, 'F')
  _b(11); _t(C.white); doc.text('CABONNET', M, 10)
  _n(7.5); _t([180, 210, 230] as const); doc.text('Gestão de Ordens de Serviço', M, 16.5)
  _b(7);  _t(C.white); doc.text('RELATÓRIO DE FECHAMENTO OPERACIONAL', W - M, 10, { align: 'right' })
  _n(6.5); _t([160, 195, 215] as const); doc.text(periodoLabel, W - M, 16.5, { align: 'right' })
  _f(C.accent); doc.rect(0, 22, W, 1.8, 'F')
  y = 34

  _n(7); _t(C.muted); doc.text('Gerado em ' + new Date().toLocaleString('pt-BR') + '  ·  ' + periodoLabel, M, y)
  y += 10

  const kpis = [
    { v: stats.total,      l: 'Total de OS',  c: C.accent  },
    { v: stats.concluidas, l: 'Concluídas',   c: C.green   },
    { v: stats.semExec,    l: 'Sem Execução', c: C.orange  },
    { v: stats.pendentes,  l: 'Pendentes',    c: C.yellow  },
  ]
  const kW = (CW - (kpis.length - 1) * 4) / kpis.length, kH = 24
  kpis.forEach((k, i) => { _kpiCard(M + i * (kW + 4), y, kW, kH, k.v, k.l, k.c) })
  y += kH + 8

  const taxaGeral  = stats.total > 0 ? Math.round(stats.concluidas / stats.total * 100) : 0
  const taxaCorG   = taxaGeral >= SLA_MIN ? C.green : taxaGeral >= SLA_MIN - 20 ? C.yellow : C.red
  _n(7); _t(C.muted); doc.text('Taxa geral de conclusão:', M, y)
  _bar(M + 54, y - 3.5, CW - 67, 4, taxaGeral, taxaCorG)
  _b(9); _t(taxaCorG); doc.text(taxaGeral + '%', W - M, y, { align: 'right' })
  y += 12

  _line(M, y, W - M, y, 0.2, C.border); y += 5
  _b(7); _t(C.navy); doc.text('CONTEÚDO', M, y); y += 5
  const idx = ['1. Ranking de Equipes', '2. Produtividade por Cidade', '3. Produtividade por Tipo de OS', '4. Clientes Atendidos']
  if (statsRede) idx.push('5. Rede — Bloco Independente')
  const mid = Math.ceil(idx.length / 2)
  idx.forEach((s, i) => {
    const col = i < mid ? 0 : 1, row = i < mid ? i : i - mid
    _n(7.5); _t(C.navy); doc.text(s, M + col * (CW / 2), y + row * 6.5)
  })
  y += mid * 6.5 + 4
  _footer(); doc.addPage(); page++; y = M

  // ── 1 · RANKING DE EQUIPES ──────────────────────────────────────────────────
  _section('1. RANKING DE EQUIPES — PRODUTIVIDADE')
  const ECOLS = [0, 7, 60, 76, 92, 108, 130]
  _ri = 0
  _tHead([
    { v: '#', align: 'center' }, 'EQUIPE',
    { v: 'EXEC.',  align: 'center' }, { v: 'S/EX.', align: 'center' },
    { v: 'PEND.',  align: 'center' }, { v: 'SLA V.', align: 'center' },
    { v: 'TAXA %', align: 'center' },
  ], ECOLS)
  Object.entries(stats.byEquipe)
    .map(([eq, d]) => { const tot = d.exec + d.semExec + d.pend; return { eq, ...d, taxa: tot > 0 ? Math.round(d.exec / tot * 100) : 0 } })
    .sort((a, b) => b.exec - a.exec).slice(0, 30)
    .forEach((e, i) => {
      const tc = e.taxa >= SLA_MIN ? C.green : e.taxa >= SLA_MIN - 15 ? C.yellow : C.red
      _tRow([
        String(i + 1), e.eq.slice(0, 26),
        { v: String(e.exec),                            align: 'center' },
        { v: String(e.semExec),                         align: 'center' },
        { v: String(e.pend),                            align: 'center' },
        { v: e.slaVenc > 0 ? String(e.slaVenc) : '—',  align: 'center' },
        { v: e.taxa + '%',                              align: 'center' },
      ], ECOLS, { 0: C.muted, 2: C.green, 3: C.orange, 4: C.yellow, 5: e.slaVenc > 0 ? C.red : C.muted, 6: tc })
    })

  // ── 2 · PRODUTIVIDADE POR CIDADE ────────────────────────────────────────────
  y += 4; _section('2. PRODUTIVIDADE POR CIDADE')
  const CCOLS = [0, 56, 72, 88, 104, 124]
  _ri = 0
  _tHead([
    'CIDADE',
    { v: 'EXEC.',  align: 'center' }, { v: 'S/EX.',   align: 'center' },
    { v: 'PEND.',  align: 'center' }, { v: 'SLA V.',  align: 'center' },
    { v: 'TAXA %', align: 'center' },
  ], CCOLS)
  Object.entries(stats.byCidade)
    .filter(([, d]) => d.exec + d.semExec > 0)
    .map(([cidade, d]) => { const tot = d.exec + d.semExec + d.pend; return { cidade, ...d, taxa: tot > 0 ? Math.round(d.exec / tot * 100) : 0 } })
    .sort((a, b) => b.exec - a.exec)
    .forEach(c => {
      const tc = c.taxa >= SLA_MIN ? C.green : c.taxa >= SLA_MIN - 20 ? C.yellow : C.red
      _tRow([
        c.cidade.slice(0, 28),
        { v: String(c.exec),                           align: 'center' },
        { v: String(c.semExec),                        align: 'center' },
        { v: String(c.pend),                           align: 'center' },
        { v: c.slaVenc > 0 ? String(c.slaVenc) : '—', align: 'center' },
        { v: c.taxa + '%',                             align: 'center' },
      ], CCOLS, { 1: C.green, 2: C.orange, 3: C.yellow, 4: c.slaVenc > 0 ? C.red : C.muted, 5: tc })
    })

  // ── 3 · PRODUTIVIDADE POR TIPO DE OS ────────────────────────────────────────
  y += 4; _section('3. PRODUTIVIDADE POR TIPO DE OS')
  const TIPO_ORDEM = ['Instalação', 'Manutenção', 'Serviço', 'Outros']
  const TIPO_CORES: Record<string, RGB> = { Instalação: C.accent, Manutenção: C.green, Serviço: C.purple, Outros: C.muted }
  const TCOLS = [0, 40, 58, 76, 94, 114]
  _ri = 0
  _tHead([
    'TIPO',
    { v: 'EXEC.',    align: 'center' }, { v: 'S/EX.', align: 'center' },
    { v: 'PEND.',    align: 'center' }, { v: 'SLA V.', align: 'center' },
    { v: 'TAXA %',   align: 'center' },
  ], TCOLS)
  TIPO_ORDEM.filter(t => stats.byTipo[t]).forEach(t => {
    const d = stats.byTipo[t], tot = d.exec + d.semExec + d.pend
    const taxa = tot > 0 ? Math.round(d.exec / tot * 100) : 0
    const tc   = taxa >= SLA_MIN ? C.green : taxa >= SLA_MIN - 20 ? C.yellow : C.red
    _tRow([
      t,
      { v: String(d.exec),                           align: 'center' },
      { v: String(d.semExec),                        align: 'center' },
      { v: String(d.pend),                           align: 'center' },
      { v: d.slaVenc > 0 ? String(d.slaVenc) : '—', align: 'center' },
      { v: taxa + '%',                               align: 'center' },
    ], TCOLS, { 0: TIPO_CORES[t] || C.muted, 1: C.green, 2: C.orange, 3: C.yellow, 4: d.slaVenc > 0 ? C.red : C.muted, 5: tc })
  })

  // ── 4 · CLIENTES ATENDIDOS ──────────────────────────────────────────────────
  y += 4; _section('4. CLIENTES ATENDIDOS — POR EQUIPE E CATEGORIA')
  const atendidas = rows.filter(r => r.descsituacao === 'Concluída')
  const SERV4_ORDEM = ['TROCA DE EQUIPAMENTO', 'TRANSFERÊNCIA DE ENDEREÇO', 'CONFIGURAÇÃO DE ROTEADOR', 'TROCA DE CABEAMENTO', 'CONNECT HOME', 'MUDANÇA DE PONTO']
  const CAT4_COR: Record<string, RGB>    = { 'INSTALAÇÃO': C.accent, 'MANUTENÇÃO': C.green, 'SERVIÇO': C.purple, 'OUTROS': C.muted }

  if (atendidas.length) {
    atendidas.sort((a, b) => {
      const da = parseDate(a.dataexecucao) || parseDate(a.databaixa) || parseDate(a.dataagendamento)
      const db = parseDate(b.dataexecucao) || parseDate(b.databaixa) || parseDate(b.dataagendamento)
      return (da?.getTime() ?? 0) - (db?.getTime() ?? 0)
    })

    interface EqData { INSTALAÇÃO?: OSRow[]; MANUTENÇÃO?: OSRow[]; OUTROS?: OSRow[]; SERVIÇO?: Record<string, OSRow[]> }
    const porEquipe: Record<string, EqData> = {}
    const eqTotais:  Record<string, number> = {}
    atendidas.forEach(r => {
      const eq  = r.nomedaequipe || '(sem equipe)'
      const cat = cat4(r)
      if (!porEquipe[eq]) { porEquipe[eq] = {}; eqTotais[eq] = 0 }
      eqTotais[eq]++
      if (cat === 'SERVIÇO') {
        const sub = subServ(r)
        if (!porEquipe[eq]['SERVIÇO']) porEquipe[eq]['SERVIÇO'] = {}
        if (!porEquipe[eq]['SERVIÇO']![sub]) porEquipe[eq]['SERVIÇO']![sub] = []
        porEquipe[eq]['SERVIÇO']![sub].push(r)
      } else {
        const catKey = cat as 'INSTALAÇÃO' | 'MANUTENÇÃO' | 'OUTROS'
        if (!porEquipe[eq][catKey]) porEquipe[eq][catKey] = []
        porEquipe[eq][catKey]!.push(r)
      }
    })

    const equipes = Object.keys(porEquipe).sort((a, b) =>
      (shortEquipe(a) || a).localeCompare(shortEquipe(b) || b)
    )

    const ACOLS = [0, 18, 68, 112, 148]

    const _catBlock = (catLabel: string, lista: OSRow[], cor: RGB) => {
      _checkY(30)
      _f(C.bg);           doc.rect(M + 4, y - 6, CW - 4, 8, 'F')
      _f(cor || C.muted); doc.rect(M + 4, y - 6, 2, 8, 'F')
      _b(7.5); _t(cor || C.muted); doc.text(catLabel, M + 9, y)
      _n(7);   _t(C.muted); doc.text(String(lista.length) + ' OS', W - M, y, { align: 'right' })
      y += 12; _ri = 0
      _tHead(['OS', 'CLIENTE', 'SERVIÇO', 'CIDADE', { v: 'DT. ATEND.', align: 'center' }], ACOLS)
      lista.forEach((r: OSRow) => {
        _tRow([
          String(r.numos || '—'),
          (r.nomecliente  || '—').slice(0, 24),
          (r.servico      || '—').slice(0, 20),
          (r.nomedacidade || '—').slice(0, 18),
          { v: fmtDataAt(r), align: 'center' },
        ], ACOLS, { 0: C.accent, 3: C.muted, 4: C.muted })
      })
      y += 4
    }

    equipes.forEach(eq => {
      const catData = porEquipe[eq]
      const eqAbrev = shortEquipe(eq) || eq
      const totalEq = eqTotais[eq]

      _checkY(52)
      _f(C.navy); doc.rect(M, y - 10, CW, 13, 'F')
      _b(9); _t(C.white); doc.text(eqAbrev.toUpperCase(), M + 5, y)
      _n(7); _t([180, 200, 220] as const)
      const eqFull = eq.length > eqAbrev.length ? eq : ''
      if (eqFull) doc.text(eqFull.slice(0, 60), M + 5 + doc.getTextWidth(eqAbrev.toUpperCase()) + 6, y)
      doc.text(String(totalEq) + ' OS concluídas', W - M, y, { align: 'right' })
      _line(M, y + 3, W - M, y + 3, 0.8, C.accent)
      y += 12

      interface Bloco { label: string; rows: OSRow[]; cor: RGB; min: Date | null }
      const blocos: Bloco[] = []
      ;(['INSTALAÇÃO', 'MANUTENÇÃO', 'OUTROS'] as const).forEach(cat => {
        if (catData[cat]?.length) blocos.push({ label: cat, rows: catData[cat]!, cor: CAT4_COR[cat], min: minDate(catData[cat]!) })
      })
      if (catData['SERVIÇO']) {
        const subData = catData['SERVIÇO']
        const known   = SERV4_ORDEM.filter(s => subData[s])
        const outros  = Object.keys(subData).filter(s => !SERV4_ORDEM.includes(s)).sort()
        ;[...known, ...outros].forEach(sub => {
          blocos.push({ label: `SERVIÇOS — ${sub.toUpperCase()}`, rows: subData[sub]!, cor: CAT4_COR['SERVIÇO'], min: minDate(subData[sub]!) })
        })
      }
      blocos.sort((a, b) => (a.min?.getTime() ?? 0) - (b.min?.getTime() ?? 0))
      blocos.forEach(b => _catBlock(b.label, b.rows, b.cor))
      y += 5
    })
  }

  // ── REDE — Bloco independente ───────────────────────────────────────────────
  if (statsRede && rede.length) {
    _footer(); doc.addPage(); page++; y = 0
    _f(C.teal); doc.rect(0, 0, W, 18, 'F')
    _f(C.accent); doc.rect(0, 18, W, 1.5, 'F')
    _b(10); _t(C.white); doc.text('REDE — BLOCO INDEPENDENTE', M, 11)
    _n(7); _t([200, 240, 248] as unknown as RGB); doc.text(periodoLabel, W - M, 11, { align: 'right' })
    y = 28

    const kpisR = [
      { v: statsRede.total,      l: 'Total OS',   c: C.accent },
      { v: statsRede.concluidas, l: 'Concluídas', c: C.green  },
      { v: statsRede.semExec,    l: 'Sem Exec.',  c: C.orange },
      { v: statsRede.pendentes,  l: 'Pendentes',  c: C.yellow },
      { v: statsRede.slaVenc,    l: 'SLA Venc.',  c: statsRede.slaVenc > 0 ? C.red : C.green },
    ]
    const rkW = (CW - 16) / 5, rkH = 22
    kpisR.forEach((k, i) => { _kpiCard(M + i * (rkW + 4), y, rkW, rkH, k.v, k.l, k.c) })
    y += rkH + 10

    _section('EQUIPES DE REDE — PRODUTIVIDADE', C.teal)
    const RECOLS = [0, 7, 60, 74, 88, 103, 117, 138]
    _ri = 0
    _tHead(['#', 'EQUIPE', 'EXEC.', 'S/EX.', 'PEND.', 'SLA V.', 'TAXA %'], RECOLS)
    Object.entries(statsRede.byEquipe)
      .map(([eq, d]) => { const tot = d.exec + d.semExec + d.pend; return { eq, ...d, taxa: tot > 0 ? Math.round(d.exec / tot * 100) : 0 } })
      .sort((a, b) => b.exec - a.exec)
      .forEach((e, i) => {
        const tc = e.taxa >= SLA_MIN ? C.green : e.taxa >= SLA_MIN - 15 ? C.yellow : C.red
        _tRow([
          String(i + 1), e.eq.slice(0, 26),
          { v: String(e.exec),    align: 'center' },
          { v: String(e.semExec), align: 'center' },
          { v: String(e.pend),    align: 'center' },
          { v: e.slaVenc > 0 ? String(e.slaVenc) : '—', align: 'center' },
          { v: e.taxa + '%', align: 'center' },
        ], RECOLS, { 0: C.muted, 2: C.green, 3: C.orange, 4: C.yellow, 5: e.slaVenc > 0 ? C.red : C.muted, 6: tc })
      })
    y += 4

    _section('PRODUTIVIDADE POR CIDADE — REDE', C.teal)
    const RCCOLS = [0, 52, 66, 80, 94, 110, 126]
    _ri = 0
    _tHead(['CIDADE', 'EXEC.', 'S/EX.', 'PEND.', 'SLA V.', 'TAXA %'], RCCOLS)
    Object.entries(statsRede.byCidade)
      .filter(([, d]) => d.exec + d.semExec > 0)
      .map(([cidade, d]) => { const tot = d.exec + d.semExec + d.pend; return { cidade, ...d, taxa: tot > 0 ? Math.round(d.exec / tot * 100) : 0 } })
      .sort((a, b) => b.exec - a.exec)
      .forEach(c => {
        const tc = c.taxa >= SLA_MIN ? C.green : c.taxa >= SLA_MIN - 20 ? C.yellow : C.red
        _tRow([
          c.cidade.slice(0, 25),
          { v: String(c.exec),    align: 'center' },
          { v: String(c.semExec), align: 'center' },
          { v: String(c.pend),    align: 'center' },
          { v: c.slaVenc > 0 ? String(c.slaVenc) : '—', align: 'center' },
          { v: c.taxa + '%',      align: 'center' },
        ], RCCOLS, { 1: C.green, 2: C.orange, 3: C.yellow, 4: c.slaVenc > 0 ? C.red : C.muted, 5: tc })
      })
    y += 4

    const rConcl = rede.filter(r => r.descsituacao === 'Concluída')
      .sort((a, b) => {
        const da = parseDate(a.dataexecucao) || parseDate(a.databaixa) || parseDate(a.dataagendamento)
        const db = parseDate(b.dataexecucao) || parseDate(b.databaixa) || parseDate(b.dataagendamento)
        return (da?.getTime() ?? 0) - (db?.getTime() ?? 0)
      })
    if (rConcl.length) {
      _section('CLIENTES ATENDIDOS — REDE', C.teal)
      const RACOLS = [0, 19, 75, 138]
      let lastCid: string | null = null
      _ri = 0
      rConcl.forEach(r => {
        const cidade = (r.nomedacidade || '(sem cidade)').trim()
        if (cidade !== lastCid) {
          _checkY(22)
          _f(C.bg); doc.rect(M, y, CW, 9, 'F')
          _line(M, y, W - M, y, 0.15, C.border)
          _b(8.5); _t(C.navy)
          doc.text(doc.splitTextToSize(cidade.toUpperCase(), CW - 24)[0], M + 3, y + 6)
          const totR = rConcl.filter(x => (x.nomedacidade || '').trim() === cidade).length
          _n(7); _t(C.muted); doc.text(String(totR) + ' OS', W - M, y + 6, { align: 'right' })
          _line(M, y + 9, W - M, y + 9, 0.3, C.teal)
          y += 13; _ri = 0
          _tHead(['OS', 'CLIENTE', 'SERVIÇO', 'EQUIPE'], RACOLS)
          lastCid = cidade
        }
        _tRow([
          String(r.numos || '—'),
          (r.nomecliente || '—').slice(0, 26),
          (r.servico     || '—').slice(0, 28),
          (shortEquipe(r.nomedaequipe) || '—').slice(0, 18),
        ], RACOLS, { 0: C.teal })
      })
    }
  }

  _footer()
  return doc
}
