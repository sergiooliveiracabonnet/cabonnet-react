import jsPDF from 'jspdf'
import { drawPDFHeader } from '../../lib/pdfBrand'
import { truncateTextToWidth } from '../../lib/pdfTableLayout'
import { medicoesProgresso, treatedSummary, type TreatedPon } from './ponTreatments'

type RGB = readonly [number, number, number]

const TEXT:   RGB = [17,  24,  39]
const SUB:    RGB = [55,  65,  81]
const MUTED:  RGB = [107, 114, 128]
const BORDER: RGB = [209, 213, 219]
const GREEN:  RGB = [22,  101, 52]
const RED:    RGB = [153, 27,  27]
const ORANGE: RGB = [154, 52,  18]

const PW = 210, ML = 15, MR = 15
const CW = PW - ML - MR
const ROW_H = 15
const RODAPE_Y = 290
const FIM_CONTEUDO = 275

// Larguras somam CW (180mm) — mesma ordem de colunas da tabela em tela.
const COLS = [
  { x: ML,       w: 22, h: 'PON / OLT' },
  { x: ML + 22,  w: 24, h: 'Cidade / bairro' },
  { x: ML + 46,  w: 36, h: 'No momento do OK' },
  { x: ML + 82,  w: 26, h: 'Tratada em' },
  { x: ML + 108, w: 20, h: 'Ciclos' },
  { x: ML + 128, w: 24, h: 'Potências' },
  { x: ML + 152, w: 28, h: 'Situação atual' },
]

const formatMoment = (value: string) => {
  const parsed = new Date(value.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('pt-BR')
}

function line(doc: jsPDF, text: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: RGB; maxWidth?: number } = {}) {
  const { size = 7, bold = false, color = TEXT, maxWidth } = opts
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(size)
  doc.setTextColor(...color)
  const value = maxWidth ? truncateTextToWidth(text, maxWidth, t => doc.getTextWidth(t)) : text
  doc.text(value, x, y)
}

/** Exporta a lista de PONs tratadas (aba "PONs tratadas" do Nível de Sinal) — mesma
 *  foto do momento do OK confrontada com o CSV atual que aparece na tabela em tela. */
export function exportPonsTratadasPDF(treated: TreatedPon[], hasCsv: boolean, filename = `pons-tratadas-${new Date().toISOString().slice(0, 10)}.pdf`): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const now = new Date()
  const summary = treatedSummary(treated)
  let page = 1
  let y = 0

  const addHeader = () => {
    y = drawPDFHeader(doc, { reportType: 'Nível de Sinal — PONs Tratadas', pageWidth: PW, margin: ML, generatedAt: now }) + 4
  }
  const footer = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(`Página ${page}`, PW - MR, RODAPE_Y, { align: 'right' })
  }
  const newPage = () => { footer(); doc.addPage(); page++; addHeader(); tableHeader() }
  const ensure = (altura: number = ROW_H) => { if (y + altura > FIM_CONTEUDO) newPage() }

  function tableHeader() {
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.25)
    doc.rect(ML, y, CW, 7, 'S')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...TEXT)
    COLS.forEach(c => doc.text(c.h, c.x + 2, y + 4.8))
    y += 7
  }

  addHeader()

  // Resumo — mesmos números dos StatCards da tela.
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...TEXT)
  doc.text('PONs tratadas', ML, y); y += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...SUB)
  const resumo = [
    `${summary.total} tratada${summary.total === 1 ? '' : 's'}`,
    `${summary.aindaCriticas} ainda crítica${summary.aindaCriticas === 1 ? '' : 's'}`,
    `${summary.normalizadas} normalizada${summary.normalizadas === 1 ? '' : 's'}`,
    `${summary.potenciasPendentes} com potência pendente`,
    `${summary.reincidentes} reincidente${summary.reincidentes === 1 ? '' : 's'}`,
  ].join('  ·  ')
  doc.text(resumo, ML, y); y += 8

  if (!treated.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
    doc.text('Nenhuma PON tratada no filtro atual.', ML, y)
    doc.save(filename)
    return
  }

  tableHeader()

  treated.forEach((item, index) => {
    ensure(ROW_H)
    if (index % 2 === 0) { doc.setFillColor(249, 250, 251); doc.rect(ML, y, CW, ROW_H, 'F') }

    const y1 = y + 5, y2 = y + 10.5

    // PON / OLT
    line(doc, item.snapshot.pon, COLS[0].x + 2, y1, { bold: true, size: 7.5, maxWidth: COLS[0].w - 3 })
    line(doc, item.snapshot.olt, COLS[0].x + 2, y2, { color: MUTED, size: 6.3, maxWidth: COLS[0].w - 3 })

    // Cidade / bairro
    line(doc, item.snapshot.cidade || '—', COLS[1].x + 2, y1, { size: 7, maxWidth: COLS[1].w - 3 })
    line(doc, item.snapshot.bairro || '—', COLS[1].x + 2, y2, { color: MUTED, size: 6.3, maxWidth: COLS[1].w - 3 })

    // No momento do OK
    const rx = item.snapshot.rxMediano?.toFixed(1) ?? '—'
    const temp = item.snapshot.tempMax != null ? ` · ${item.snapshot.tempMax.toFixed(0)}°C máx` : ''
    line(doc, `${item.snapshot.criticos} críticas de ${item.snapshot.total} · ${(item.snapshot.concentracao * 100).toFixed(0)}%`, COLS[2].x + 2, y1, { size: 6.8, maxWidth: COLS[2].w - 3 })
    line(doc, `RX med. ${rx}${temp}`, COLS[2].x + 2, y2, { color: MUTED, size: 6.3, maxWidth: COLS[2].w - 3 })

    // Tratada em
    line(doc, formatMoment(item.created_at), COLS[3].x + 2, y1, { size: 7, maxWidth: COLS[3].w - 3 })
    line(doc, item.created_by || 'sem usuário', COLS[3].x + 2, y2, { color: MUTED, size: 6.3, maxWidth: COLS[3].w - 3 })

    // Ciclos
    line(doc, `${item.treated_count}× tratada`, COLS[4].x + 2, y1, { size: 6.8, maxWidth: COLS[4].w - 3 })
    if (item.reopened_count) line(doc, `${item.reopened_count}× reaberta`, COLS[4].x + 2, y2, { color: ORANGE, size: 6.3, maxWidth: COLS[4].w - 3 })

    // Potências
    const prog = medicoesProgresso(item)
    if (prog.total) {
      line(doc, `${prog.preenchidas}/${prog.total} medidas`, COLS[5].x + 2, y1, { size: 6.8, maxWidth: COLS[5].w - 3 })
      line(doc, prog.pendentes ? `${prog.pendentes} sem potência` : 'cadastro completo', COLS[5].x + 2, y2, { color: prog.pendentes ? ORANGE : MUTED, size: 6.3, maxWidth: COLS[5].w - 3 })
    } else {
      line(doc, 'sem clientes registrados', COLS[5].x + 2, y1, { color: MUTED, size: 6.3, maxWidth: COLS[5].w - 3 })
    }

    // Situação no CSV atual
    if (!hasCsv) {
      line(doc, 'sem CSV carregado', COLS[6].x + 2, y1, { color: MUTED, size: 6.5, maxWidth: COLS[6].w - 3 })
    } else if (item.aindaCritica) {
      line(doc, 'Ainda crítica', COLS[6].x + 2, y1, { bold: true, color: RED, size: 6.8, maxWidth: COLS[6].w - 3 })
      if (item.atual) line(doc, `${item.atual.criticos} críticas`, COLS[6].x + 2, y2, { color: RED, size: 6.3, maxWidth: COLS[6].w - 3 })
    } else {
      line(doc, 'Normalizada', COLS[6].x + 2, y1, { bold: true, color: GREEN, size: 6.8, maxWidth: COLS[6].w - 3 })
    }

    doc.setDrawColor(...BORDER); doc.setLineWidth(0.2)
    doc.line(ML, y + ROW_H, ML + CW, y + ROW_H)
    y += ROW_H
  })

  footer()
  doc.save(filename)
}
