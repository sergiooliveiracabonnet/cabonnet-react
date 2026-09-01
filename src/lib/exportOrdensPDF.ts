import jsPDF from 'jspdf'
import { shortEquipe } from './osFormat'
import { isConcluida } from './transform'
import type { OSRow } from './types'
import { drawPDFHeader } from './pdfBrand'
import { truncateTextToWidth } from './pdfTableLayout'

type RGB = readonly [number, number, number]

// ── Palette ───────────────────────────────────────────────────────────────
const DARK:   RGB = [255, 255, 255]
const CARD:   RGB = [255, 255, 255]
const CARD2:  RGB = [255, 255, 255]
const BORDER: RGB = [209, 213, 219]
const ACCENT: RGB = [17,  24,  39]
const GREEN:  RGB = [34,  197, 94]
const YELLOW: RGB = [234, 179, 8]
const ORANGE: RGB = [249, 115, 22]
const RED:    RGB = [239, 68,  68]
const CYAN:   RGB = [6,   182, 212]
const TEXT:   RGB = [17,  24,  39]
const SUB:    RGB = [55, 65, 81]
const MUTED:  RGB = [107, 114, 128]

// ── Page geometry ─────────────────────────────────────────────────────────
const PW   = 297   // landscape A4 width
const PH   = 210   // landscape A4 height
const ML   = 12    // left margin
const MR   = 12    // right margin
const CW   = PW - ML - MR   // 273mm usable width
const ROW_H  = 6
const HDR_H  = 8
const FOOT_H = 10

// ── Columns: { x, w, h } ─────────────────────────────────────────────────
// x positions (ML=12 → last col ends at 285 = 297-12) ✓
const COLS = [
  { x: 12,  w: 18, h: 'Nº OS' },
  { x: 30,  w: 10, h: 'Dias', align: 'center' as const },
  { x: 40,  w: 18, h: 'Risco', align: 'center' as const },
  { x: 58,  w: 42, h: 'Cliente' },
  { x: 100, w: 25, h: 'Cidade' },
  { x: 125, w: 21, h: 'Bairro' },
  { x: 146, w: 39, h: 'Endereço' },
  { x: 185, w: 25, h: 'Tipo' },
  { x: 210, w: 25, h: 'Equipe' },
  { x: 235, w: 32, h: 'Situação', align: 'center' as const },
  { x: 267, w: 18, h: 'Agd.', align: 'center' as const },
]

let _doc!: jsPDF
let _y!: number
let _generatedAt!: Date

// ── Page helpers ──────────────────────────────────────────────────────────

function _newPage() {
  _doc.addPage()
  _y = 0
  _pageStrip()
  _tableHeader()
}

function _checkY(need = ROW_H) {
  if (_y + need > PH - FOOT_H - 2) _newPage()
}

// Thin accent bar + dark header strip on each table page
function _pageStrip() {
  _y = drawPDFHeader(_doc, {
    reportType: 'Relatório de Ordens de Serviço',
    pageWidth: PW,
    margin: ML,
    generatedAt: _generatedAt,
  })
}

function _tableHeader() {
  // Navy band
  _doc.setDrawColor(...BORDER)
  _doc.setLineWidth(0.25)
  _doc.rect(ML, _y, CW, HDR_H, 'S')
  // Column labels
  _doc.setFont('helvetica', 'bold')
  _doc.setFontSize(6.5)
  _doc.setTextColor(...ACCENT)
  COLS.forEach(c => {
    const x = c.align === 'center' ? c.x + c.w / 2 : c.x + 2
    _doc.text(c.h, x, _y + 5.4, c.align === 'center' ? { align: 'center' } : undefined)
  })
  _y += HDR_H
}

// ── Text helpers ──────────────────────────────────────────────────────────

function _t(val: unknown, max: number): string {
  if (val == null || val === '') return '—'
  const s = String(val)
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function _fit(val: unknown, col: ColEntry, padding = 4): string {
  const fallback = val == null || val === '' ? '—' : val
  return truncateTextToWidth(fallback, col.w - padding, value => _doc.getTextWidth(value))
}

function _agingColor(v: number): RGB {
  if (v >= 6) return RED
  if (v >= 3) return YELLOW
  return GREEN
}

function _sitColor(sit: string | null | undefined): RGB {
  if (!sit) return MUTED
  const s = sit.toLowerCase()
  if (s.startsWith('concluída') && !s.includes('sem')) return GREEN
  if (s.includes('sem exec'))  return MUTED
  if (s.includes('finaliz'))   return CYAN
  if (s.includes('reagend'))   return ORANGE
  if (s.includes('atend'))     return CYAN
  return YELLOW
}

function _sitLabel(sit: string | null | undefined): string {
  if (!sit) return '—'
  const map: Record<string, string> = {
    'Concluída':               'Concluída',
    'Concluída/Sem Execução':  'Sem Execução',
    'Atendimento/Finalizadas': 'Finalizada',
    'Reagendamento':           'Reagend.',
    'Atendimento':             'Atend.',
    'Pendente':                'Pendente',
  }
  return map[sit] ?? _t(sit, 13)
}

type ColEntry = { x: number; w: number; h?: string }

// Filled rect pill with centered white text
function _pill(label: string, color: RGB, col: ColEntry): void {
  const pillH  = 4
  const pillY  = _y + (ROW_H - pillH) / 2
  const prevSz = _doc.getFontSize()
  _doc.setFontSize(5.8)
  const tw     = _doc.getTextWidth(label)
  const pillW  = Math.min(tw + 5, col.w - 3)
  _doc.setDrawColor(color[0], color[1], color[2])
  _doc.setLineWidth(0.2)
  _doc.rect(col.x + 1.5, pillY, pillW, pillH, 'S')
  _doc.setFont('helvetica', 'bold')
  _doc.setTextColor(color[0], color[1], color[2])
  _doc.text(label, col.x + 1.5 + pillW / 2, pillY + 2.95, { align: 'center' })
  _doc.setFontSize(prevSz)
}

// ── Cover KPI tile ────────────────────────────────────────────────────────

function _kpiTile(x: number, y: number, w: number, h: number, label: string, value: number, color: RGB): void {
  _doc.setDrawColor(...BORDER)
  _doc.setLineWidth(0.25)
  _doc.rect(x, y, w, h, 'S')
  _doc.setFont('helvetica', 'bold')
  _doc.setFontSize(22)
  _doc.setTextColor(color[0], color[1], color[2])
  _doc.text(String(value), x + w / 2, y + h * 0.63, { align: 'center' })
  _doc.setFont('helvetica', 'normal')
  _doc.setFontSize(6)
  _doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  _doc.text(label.toUpperCase(), x + w / 2, y + h - 5, { align: 'center' })
}

// ── Main export ───────────────────────────────────────────────────────────

export function exportOrdensPDF(rows: OSRow[], filename: string): void {
  _doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const now      = new Date()
  _generatedAt = now
  const dateStr  = now.toLocaleDateString('pt-BR')
  const timeStr  = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const today    = now.toISOString().slice(0, 10)

  // KPIs from rows
  const total      = rows.length
  const criticas   = rows.filter(r => (r._aging ?? 0) >= 6).length
  const agendHoje  = rows.filter(r => (r.dataagendamento ?? '').startsWith(today)).length
  const concluidas = rows.filter(r => isConcluida(r._situacaoEfetiva)).length
  const semEquipe  = rows.filter(r => !r.nomedaequipe).length
  const pendentes  = rows.filter(r => r._situacaoEfetiva === 'Pendente').length

  // ── COVER PAGE ─────────────────────────────────────────────────────────
  _doc.setFillColor(...DARK)
  _doc.rect(0, 0, PW, PH, 'F')
  drawPDFHeader(_doc, { reportType: 'Relatório de Ordens de Serviço', pageWidth: PW, margin: ML, generatedAt: now })

  _doc.setFont('helvetica', 'bold')
  _doc.setFontSize(30)
  _doc.setTextColor(...TEXT)
  _doc.text('ORDENS DE SERVIÇO', 22, 52)

  _doc.setFont('helvetica', 'normal')
  _doc.setFontSize(9.5)
  _doc.setTextColor(...SUB)
  _doc.text('Relatório de Exportação', 22, 61)

  // Divider
  _doc.setFillColor(...BORDER)
  _doc.rect(22, 66, 110, 0.4, 'F')

  // Meta info
  _doc.setFont('helvetica', 'normal')
  _doc.setFontSize(8)
  _doc.setTextColor(...MUTED)
  _doc.text(`Gerado em ${dateStr} às ${timeStr}`, 22, 74)
  _doc.setTextColor(...SUB)
  _doc.setFont('helvetica', 'bold')
  _doc.setFontSize(8.5)
  _doc.text(`${total} ordens de serviço`, 22, 82)

  // Secondary stats (right of divider area)
  _doc.setFont('helvetica', 'normal')
  _doc.setFontSize(7)
  _doc.setTextColor(...MUTED)
  const stats = [
    `Pendentes: ${pendentes}`,
    `Concluídas: ${concluidas}`,
    `Sem equipe: ${semEquipe}`,
  ]
  stats.forEach((s, si) => _doc.text(s, 155, 74 + si * 8))

  // ── KPI tiles (4 tiles, centered) ──
  const tileW = 52, tileH = 38, tileGap = 6, tileY = 108
  const tileX = (PW - (4 * tileW + 3 * tileGap)) / 2
  _kpiTile(tileX,                         tileY, tileW, tileH, 'Total OS',     total,     ACCENT)
  _kpiTile(tileX + (tileW + tileGap),     tileY, tileW, tileH, 'Críticas ≥6d', criticas,  RED)
  _kpiTile(tileX + 2 * (tileW + tileGap), tileY, tileW, tileH, 'Agend. Hoje',  agendHoje, GREEN)
  _kpiTile(tileX + 3 * (tileW + tileGap), tileY, tileW, tileH, 'Concluídas',   concluidas,CYAN)

  // Bottom bar
  _doc.setDrawColor(...BORDER)
  _doc.line(ML, PH - 14, PW - MR, PH - 14)
  _doc.setFont('helvetica', 'bold')
  _doc.setFontSize(7)
  _doc.setTextColor(...MUTED)
  _doc.text('Cabonnet ISP  ·  Sistema de Gestão Operacional', PW - MR, PH - 5.5, { align: 'right' })

  // ── TABLE PAGES ────────────────────────────────────────────────────────
  _doc.addPage()
  _y = 0
  _pageStrip()
  _tableHeader()

  rows.forEach((row, i) => {
    _checkY(ROW_H)

    // Alternating row backgrounds
    _doc.setFillColor(...(i % 2 === 0 ? CARD : CARD2))
    _doc.rect(ML, _y, CW, ROW_H, 'F')

    // Left edge severity bar (2mm wide, full row height)
    const aging = row._aging ?? 0
    _doc.setFillColor(..._agingColor(aging))
    _doc.rect(ML, _y, 2.5, ROW_H, 'F')

    const yT = _y + ROW_H * 0.7   // vertical text baseline

    // Nº OS — accent bold
    _doc.setFont('helvetica', 'bold')
    _doc.setFontSize(6.5)
    _doc.setTextColor(...ACCENT)
    _doc.text(_fit(row.numos, COLS[0], 6), COLS[0].x + 4, yT)

    // Aging — color-coded, bold
    _doc.setTextColor(..._agingColor(aging))
    _doc.setFontSize(6)
    _doc.text(_fit(`${aging}d`, COLS[1]), COLS[1].x + COLS[1].w / 2, yT, { align: 'center' })

    // Risco — muted normal
    _doc.setFont('helvetica', 'normal')
    _doc.setFontSize(6.5)
    _doc.setTextColor(...SUB)
    const _risco = row._riskScore != null ? String(row._riskScore) : ''
    _doc.text(_fit(_risco, COLS[2]), COLS[2].x + COLS[2].w / 2, yT, { align: 'center' })

    // Cliente — white bold
    _doc.setFont('helvetica', 'bold')
    _doc.setTextColor(...TEXT)
    _doc.text(_fit(row.nomecliente, COLS[3]), COLS[3].x + 2, yT)

    // Cidade
    _doc.setFont('helvetica', 'normal')
    _doc.setTextColor(...SUB)
    _doc.text(_fit(row.nomedacidade, COLS[4]), COLS[4].x + 2, yT)

    // Bairro
    _doc.text(_fit(row.bairro, COLS[5]), COLS[5].x + 2, yT)

    // Endereço
    _doc.text(_fit(row.logradouro, COLS[6]), COLS[6].x + 2, yT)

    // Tipo
    _doc.text(_fit(row.tiposervico, COLS[7]), COLS[7].x + 2, yT)

    // Equipe — slightly brighter
    _doc.setFont('helvetica', 'bold')
    _doc.setTextColor(...TEXT)
    _doc.text(_fit(shortEquipe(row.nomedaequipe ?? ''), COLS[8]), COLS[8].x + 2, yT)

    // Situação — filled color pill
    const sit = row._situacaoEfetiva ?? ''
    _pill(_sitLabel(sit), _sitColor(sit), COLS[9])

    // Agendamento — small muted
    _doc.setFont('helvetica', 'normal')
    _doc.setFontSize(5.8)
    _doc.setTextColor(...MUTED)
    const agend = (row.dataagendamento ?? '').slice(0, 10) || '—'
    _doc.text(_fit(agend, COLS[10]), COLS[10].x + COLS[10].w / 2, yT, { align: 'center' })

    // Row bottom separator
    _doc.setFillColor(...BORDER)
    _doc.rect(ML, _y + ROW_H - 0.3, CW, 0.3, 'F')

    _y += ROW_H
  })

  // ── Footer: page numbers on all table pages ────────────────────────────
  const nPages = (_doc.internal as unknown as { getNumberOfPages(): number }).getNumberOfPages()
  for (let p = 2; p <= nPages; p++) {
    _doc.setPage(p)
    const tableP = p - 1
    const tableT = nPages - 1
    // Footer divider
    _doc.setFillColor(...BORDER)
    _doc.rect(ML, PH - FOOT_H, CW, 0.4, 'F')
    // Branding
    _doc.setFont('helvetica', 'normal')
    _doc.setFontSize(6.5)
    _doc.setTextColor(...MUTED)
    _doc.text(`Cabonnet ISP  ·  Ordens de Serviço  ·  ${dateStr}`, ML, PH - 5.5)
    // Page number
    _doc.setFont('helvetica', 'bold')
    _doc.setTextColor(...SUB)
    _doc.text(`${tableP} / ${tableT}`, PW - MR, PH - 5.5, { align: 'right' })
  }

  _doc.save(filename)
}
