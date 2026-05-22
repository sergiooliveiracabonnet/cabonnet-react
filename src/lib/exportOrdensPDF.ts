// @ts-nocheck
import jsPDF from 'jspdf'
import { shortEquipe } from './osFormat'
import { isConcluida } from './transform'

// ── Palette ───────────────────────────────────────────────────────────────
const DARK   = [8,   15,  30]
const NAVY   = [12,  20,  38]
const CARD   = [18,  28,  50]
const CARD2  = [22,  34,  58]
const BORDER = [32,  45,  72]
const ACCENT = [14,  165, 233]
const GREEN  = [34,  197, 94]
const YELLOW = [234, 179, 8]
const ORANGE = [249, 115, 22]
const RED    = [239, 68,  68]
const CYAN   = [6,   182, 212]
const WHITE  = [255, 255, 255]
const TEXT   = [226, 232, 240]
const SUB    = [148, 163, 184]
const MUTED  = [100, 116, 139]

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
  { x: 12,  w: 18, h: 'Nº OS'    },   // → 30
  { x: 30,  w: 9,  h: 'Dias'     },   // → 39
  { x: 39,  w: 20, h: 'Risco'    },   // → 59
  { x: 59,  w: 44, h: 'Cliente'  },   // → 103
  { x: 103, w: 26, h: 'Cidade'   },   // → 129
  { x: 129, w: 22, h: 'Bairro'   },   // → 151
  { x: 151, w: 42, h: 'Endereço' },   // → 193
  { x: 193, w: 26, h: 'Tipo'     },   // → 219
  { x: 219, w: 26, h: 'Equipe'   },   // → 245
  { x: 245, w: 30, h: 'Situação' },   // → 275
  { x: 275, w: 10, h: 'Agd.'     },   // → 285
]

let _doc, _y

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
  _doc.setFillColor(...NAVY)
  _doc.rect(0, 0, PW, 11, 'F')
  _doc.setFillColor(...ACCENT)
  _doc.rect(0, 11, PW, 1.2, 'F')
  _doc.setFont('helvetica', 'bold')
  _doc.setFontSize(5.8)
  _doc.setTextColor(...MUTED)
  _doc.text('CABONNET ISP  ·  ORDENS DE SERVIÇO', ML, 7.5)
  _y = 14
}

function _tableHeader() {
  // Navy band
  _doc.setFillColor(...NAVY)
  _doc.rect(ML, _y, CW, HDR_H, 'F')
  // Left accent stripe
  _doc.setFillColor(...ACCENT)
  _doc.rect(ML, _y, 2.5, HDR_H, 'F')
  // Column labels
  _doc.setFont('helvetica', 'bold')
  _doc.setFontSize(6.5)
  _doc.setTextColor(...ACCENT)
  COLS.forEach(c => _doc.text(c.h, c.x + (c === COLS[0] ? 4.5 : 2), _y + 5.4))
  _y += HDR_H
}

// ── Text helpers ──────────────────────────────────────────────────────────

function _t(val, max) {
  if (val == null || val === '') return '—'
  const s = String(val)
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function _agingColor(v) {
  if (v >= 6) return RED
  if (v >= 3) return YELLOW
  return GREEN
}

function _sitColor(sit) {
  if (!sit) return MUTED
  const s = sit.toLowerCase()
  if (s.startsWith('concluída') && !s.includes('sem')) return GREEN
  if (s.includes('sem exec'))  return MUTED
  if (s.includes('finaliz'))   return CYAN
  if (s.includes('reagend'))   return ORANGE
  if (s.includes('atend'))     return CYAN
  return YELLOW
}

function _sitLabel(sit) {
  if (!sit) return '—'
  const map = {
    'Concluída':               'Concluída',
    'Concluída/Sem Execução':  'Sem Execução',
    'Atendimento/Finalizadas': 'Finalizada',
    'Reagendamento':           'Reagend.',
    'Atendimento':             'Atend.',
    'Pendente':                'Pendente',
  }
  return map[sit] ?? _t(sit, 13)
}

// Filled rect pill with centered white text
function _pill(label, color, col) {
  const pillH  = 4
  const pillY  = _y + (ROW_H - pillH) / 2
  const prevSz = _doc.getFontSize()
  _doc.setFontSize(5.8)
  const tw     = _doc.getTextWidth(label)
  const pillW  = Math.min(tw + 5, col.w - 3)
  _doc.setFillColor(...color)
  _doc.rect(col.x + 1.5, pillY, pillW, pillH, 'F')
  _doc.setFont('helvetica', 'bold')
  _doc.setTextColor(...WHITE)
  _doc.text(label, col.x + 1.5 + pillW / 2, pillY + 2.95, { align: 'center' })
  _doc.setFontSize(prevSz)
}

// ── Cover KPI tile ────────────────────────────────────────────────────────

function _kpiTile(x, y, w, h, label, value, color) {
  // Background
  _doc.setFillColor(...CARD)
  _doc.rect(x, y, w, h, 'F')
  // Top accent bar
  _doc.setFillColor(...color)
  _doc.rect(x, y, w, 2.5, 'F')
  // Large value
  _doc.setFont('helvetica', 'bold')
  _doc.setFontSize(22)
  _doc.setTextColor(...color)
  _doc.text(String(value), x + w / 2, y + h * 0.63, { align: 'center' })
  // Label
  _doc.setFont('helvetica', 'normal')
  _doc.setFontSize(6)
  _doc.setTextColor(...MUTED)
  _doc.text(label.toUpperCase(), x + w / 2, y + h - 5, { align: 'center' })
}

// ── Main export ───────────────────────────────────────────────────────────

export function exportOrdensPDF(rows, filename) {
  _doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const now      = new Date()
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

  // Top accent bar (4mm)
  _doc.setFillColor(...ACCENT)
  _doc.rect(0, 0, PW, 4, 'F')

  // Left vertical accent stripe (3mm)
  _doc.setFillColor(...ACCENT)
  _doc.rect(0, 4, 3, PH - 4, 'F')

  // ── Brand / title block ──
  _doc.setFont('helvetica', 'bold')
  _doc.setFontSize(8.5)
  _doc.setTextColor(...ACCENT)
  _doc.text('CABONNET ISP', 22, 26)

  _doc.setFont('helvetica', 'bold')
  _doc.setFontSize(30)
  _doc.setTextColor(...WHITE)
  _doc.text('ORDENS DE SERVIÇO', 22, 45)

  _doc.setFont('helvetica', 'normal')
  _doc.setFontSize(9.5)
  _doc.setTextColor(...SUB)
  _doc.text('Relatório de Exportação', 22, 54)

  // Divider
  _doc.setFillColor(...BORDER)
  _doc.rect(22, 59, 110, 0.4, 'F')

  // Meta info
  _doc.setFont('helvetica', 'normal')
  _doc.setFontSize(8)
  _doc.setTextColor(...MUTED)
  _doc.text(`Gerado em ${dateStr} às ${timeStr}`, 22, 66)
  _doc.setTextColor(...SUB)
  _doc.setFont('helvetica', 'bold')
  _doc.setFontSize(8.5)
  _doc.text(`${total} ordens de serviço`, 22, 74)

  // Secondary stats (right of divider area)
  _doc.setFont('helvetica', 'normal')
  _doc.setFontSize(7)
  _doc.setTextColor(...MUTED)
  const stats = [
    `Pendentes: ${pendentes}`,
    `Concluídas: ${concluidas}`,
    `Sem equipe: ${semEquipe}`,
  ]
  stats.forEach((s, si) => _doc.text(s, 155, 66 + si * 8))

  // ── KPI tiles (4 tiles, centered) ──
  const tileW = 52, tileH = 38, tileGap = 6, tileY = 88
  const tileX = (PW - (4 * tileW + 3 * tileGap)) / 2
  _kpiTile(tileX,                         tileY, tileW, tileH, 'Total OS',     total,     ACCENT)
  _kpiTile(tileX + (tileW + tileGap),     tileY, tileW, tileH, 'Críticas ≥6d', criticas,  RED)
  _kpiTile(tileX + 2 * (tileW + tileGap), tileY, tileW, tileH, 'Agend. Hoje',  agendHoje, GREEN)
  _kpiTile(tileX + 3 * (tileW + tileGap), tileY, tileW, tileH, 'Concluídas',   concluidas,CYAN)

  // Bottom bar
  _doc.setFillColor(...NAVY)
  _doc.rect(0, PH - 14, PW, 14, 'F')
  _doc.setFillColor(...ACCENT)
  _doc.rect(0, PH - 14, PW, 1.2, 'F')
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
    _doc.text(_t(row.numos, 10), COLS[0].x + 4, yT)

    // Aging — color-coded, bold
    _doc.setTextColor(..._agingColor(aging))
    _doc.setFontSize(6)
    _doc.text(`${aging}d`, COLS[1].x + 2, yT)

    // Risco — muted normal
    _doc.setFont('helvetica', 'normal')
    _doc.setFontSize(6.5)
    _doc.setTextColor(...SUB)
    _doc.text(_t(row._risco, 13), COLS[2].x + 2, yT)

    // Cliente — white bold
    _doc.setFont('helvetica', 'bold')
    _doc.setTextColor(...TEXT)
    _doc.text(_t(row.nomecliente, 27), COLS[3].x + 2, yT)

    // Cidade
    _doc.setFont('helvetica', 'normal')
    _doc.setTextColor(...SUB)
    _doc.text(_t(row.nomedacidade, 17), COLS[4].x + 2, yT)

    // Bairro
    _doc.text(_t(row.bairro, 14), COLS[5].x + 2, yT)

    // Endereço
    _doc.text(_t(row.logradouro, 26), COLS[6].x + 2, yT)

    // Tipo
    _doc.text(_t(row.tiposervico, 15), COLS[7].x + 2, yT)

    // Equipe — slightly brighter
    _doc.setFont('helvetica', 'bold')
    _doc.setTextColor(...TEXT)
    _doc.text(_t(shortEquipe(row.nomedaequipe ?? ''), 13), COLS[8].x + 2, yT)

    // Situação — filled color pill
    const sit = row._situacaoEfetiva ?? ''
    _pill(_sitLabel(sit), _sitColor(sit), COLS[9])

    // Agendamento — small muted
    _doc.setFont('helvetica', 'normal')
    _doc.setFontSize(5.8)
    _doc.setTextColor(...MUTED)
    const agend = (row.dataagendamento ?? '').slice(0, 10) || '—'
    _doc.text(agend, COLS[10].x + 1, yT)

    // Row bottom separator
    _doc.setFillColor(...BORDER)
    _doc.rect(ML, _y + ROW_H - 0.3, CW, 0.3, 'F')

    _y += ROW_H
  })

  // ── Footer: page numbers on all table pages ────────────────────────────
  const nPages = _doc.internal.getNumberOfPages()
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
