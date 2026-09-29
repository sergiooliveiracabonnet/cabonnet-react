import jsPDF from 'jspdf'
import { drawPDFHeader } from '../../lib/pdfBrand'
import { truncateTextToWidth } from '../../lib/pdfTableLayout'
import { clientesMedidos, efetividadeResumo } from './ponEfetividade'
import { severityFromRx } from './nivelSinal'
import { medicoesProgresso, treatedSummary, type TreatedPon } from './ponTreatments'

type RGB = readonly [number, number, number]

const TEXT:   RGB = [17,  24,  39]
const SUB:    RGB = [55,  65,  81]
const MUTED:  RGB = [107, 114, 128]
const BORDER: RGB = [209, 213, 219]
const GREEN:  RGB = [22,  101, 52]
const RED:    RGB = [153, 27,  27]
const ORANGE: RGB = [154, 52,  18]

// Paisagem A4.
const PW = 297, ML = 12, MR = 12
const CW = PW - ML - MR
const ROW_H = 15
const RODAPE_Y = 203
const FIM_CONTEUDO = 196

// Larguras somam CW (273mm) — mesma ordem de colunas da tabela em tela.
const COL_DEFS = [
  { w: 35, h: 'PON / OLT' }, { w: 37, h: 'Cidade / bairro' }, { w: 55, h: 'No momento do OK' },
  { w: 39, h: 'Tratada em' }, { w: 31, h: 'Ciclos' }, { w: 37, h: 'Potências' }, { w: 39, h: 'Situação atual' },
]
const COLS = COL_DEFS.reduce<{ x: number; w: number; h: string }[]>((acc, col) =>
  [...acc, { x: acc.length ? acc[acc.length - 1].x + acc[acc.length - 1].w : ML, ...col }], [])

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
 *  foto do momento do OK cruzada com a Nova Potência de cada cliente que aparece na tabela em tela. */
export type ModoPonsTratadasPDF = 'resumido' | 'detalhado'

const hoje = () => new Date().toISOString().slice(0, 10)

/** Resumido: uma linha por PON (igual à tabela em tela). Detalhado: cada PON com todos os
 *  clientes medidos e o gráfico de como era antes e como ficou depois da manutenção. */
export function exportPonsTratadasPDF(treated: TreatedPon[], modo: ModoPonsTratadasPDF = 'resumido',
  filename = `pons-tratadas-${modo}-${hoje()}.pdf`): void {
  if (modo === 'detalhado') exportDetalhado(treated, filename)
  else exportResumido(treated, filename)
}

function exportResumido(treated: TreatedPon[], filename: string): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
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
    `${summary.emAtencao} em atenção`,
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

    // Situação no CSV atual — cruza a Nova Potência (ou a de antes, sem medição) de cada cliente
    if (item.situacao === 'sem-dados') {
      line(doc, 'sem clientes', COLS[6].x + 2, y1, { color: MUTED, size: 6.5, maxWidth: COLS[6].w - 3 })
    } else {
      const cor = item.situacao === 'critica' ? RED : item.situacao === 'atencao' ? ORANGE : GREEN
      const rotulo = item.situacao === 'critica' ? 'Ainda crítica' : item.situacao === 'atencao' ? 'Em atenção' : 'Normalizada'
      line(doc, rotulo, COLS[6].x + 2, y1, { bold: true, color: cor, size: 6.8, maxWidth: COLS[6].w - 3 })
      const { criticos, atencao, melhorados } = item.resumoSituacao
      line(doc, `${criticos} crít. · ${atencao} aten. · ${melhorados} melh.`, COLS[6].x + 2, y2, { color: cor, size: 6, maxWidth: COLS[6].w - 3 })
    }

    doc.setDrawColor(...BORDER); doc.setLineWidth(0.2)
    doc.line(ML, y + ROW_H, ML + CW, y + ROW_H)
    y += ROW_H
  })

  footer()
  doc.save(filename)
}

// ── Detalhado ────────────────────────────────────────────────────────────────

const BAR_RED: RGB = [220, 38, 38]
const BAR_ORANGE: RGB = [234, 138, 20]
const BAR_GREEN: RGB = [22, 163, 74]
const NIVEIS = [
  { nome: 'Crítico', cor: BAR_RED },
  { nome: 'Atenção', cor: BAR_ORANGE },
  { nome: 'Normal', cor: BAR_GREEN },
] as const

// Larguras somam CW (273mm).
const DET_COLS = [
  { w: 78, h: 'Cliente' }, { w: 26, h: 'Código' }, { w: 50, h: 'ONU / Serial' },
  { w: 24, h: 'RX antes' }, { w: 24, h: 'RX depois' }, { w: 21, h: 'Ganho' },
  { w: 25, h: 'Nível antes' }, { w: 25, h: 'Nível depois' },
]
const DET_X = DET_COLS.reduce<number[]>((acc, _col, i) => [...acc, i ? acc[i - 1] + DET_COLS[i - 1].w : ML], [])
const DET_ROW = 5.4
const CHART_H = 36

const fmtDb = (v: number) => v.toFixed(2).replace('.', ',')
const fmtGanho = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')} dB`
const corNivel = (nivel: string): RGB => nivel === 'Crítico' ? RED : nivel === 'Atenção' ? ORANGE : GREEN

function exportDetalhado(treated: TreatedPon[], filename: string): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const now = new Date()
  let page = 1
  let y = 0

  const footer = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(`Página ${page}`, PW - MR, RODAPE_Y, { align: 'right' })
  }
  const addHeader = () => {
    y = drawPDFHeader(doc, { reportType: 'Nível de Sinal — PONs Tratadas (detalhado)', pageWidth: PW, margin: ML, generatedAt: now }) + 4
  }
  const newPage = () => { footer(); doc.addPage(); page++; addHeader() }

  const clientTableHeader = () => {
    doc.setFillColor(243, 244, 246); doc.rect(ML, y, CW, 6, 'F')
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.25); doc.rect(ML, y, CW, 6, 'S')
    DET_COLS.forEach((col, i) => line(doc, col.h, DET_X[i] + 2, y + 4.2, { bold: true, size: 6.8 }))
    y += 6
  }

  /** Barras de nível antes × depois da manutenção, na mesma escala. */
  const drawChart = (x: number, top: number, w: number, antes: number[], depois: number[]) => {
    const total = Math.max(1, antes.reduce((a, b) => a + b, 0))
    const barsTop = top + 4, barsH = 20
    const clusterW = (w - 8) / 2
    const clusters = [
      { titulo: 'Antes da manutenção', dados: antes, ox: x },
      { titulo: 'Após a manutenção', dados: depois, ox: x + clusterW + 8 },
    ]
    clusters.forEach(({ titulo, dados, ox }) => {
      const slot = clusterW / 3, barW = slot - 6
      dados.forEach((valor, i) => {
        const h = valor ? Math.max(0.8, (valor / total) * barsH) : 0
        const bx = ox + i * slot + 3
        doc.setFillColor(...NIVEIS[i].cor)
        if (h > 0) doc.rect(bx, barsTop + barsH - h, barW, h, 'F')
        line(doc, String(valor), bx + barW / 2 - String(valor).length * 0.9, barsTop + barsH - h - 1.2, { bold: true, size: 7.5 })
        line(doc, NIVEIS[i].nome, bx + barW / 2 - NIVEIS[i].nome.length * 0.8, barsTop + barsH + 3.6, { size: 6, color: MUTED })
      })
      doc.setDrawColor(...BORDER); doc.setLineWidth(0.3); doc.line(ox, barsTop + barsH, ox + clusterW, barsTop + barsH)
      line(doc, titulo, ox + clusterW / 2 - titulo.length * 1.05, barsTop + barsH + 8.4, { bold: true, size: 7.5, color: SUB })
    })
  }

  addHeader()
  const resumo = efetividadeResumo(treated)
  const comMedicao = treated.filter(item => clientesMedidos(item).length)
  const semMedicao = treated.length - comMedicao.length

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...TEXT)
  doc.text('PONs tratadas — efetividade das manutenções', ML, y); y += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...SUB)
  const partes = resumo.medidos
    ? [
      `${comMedicao.length} PON${comMedicao.length === 1 ? '' : 's'} com clientes medidos`,
      `${resumo.medidos} cliente${resumo.medidos === 1 ? '' : 's'} medido${resumo.medidos === 1 ? '' : 's'}`,
      `ganho médio ${fmtGanho(resumo.ganhoMedio ?? 0)}`,
      `${(resumo.taxaMelhora * 100).toFixed(0)}% melhoraram`,
      `críticos ${resumo.criticosAntes} > ${resumo.criticosDepois}`,
    ]
    : ['Nenhum cliente com potência de antes e depois medidas.']
  doc.text(partes.join('  ·  '), ML, y); y += 4.5
  doc.setFontSize(7); doc.setTextColor(...MUTED)
  const aviso = semMedicao ? ` ${semMedicao} PON${semMedicao === 1 ? '' : 's'} sem nenhuma medição não aparece${semMedicao === 1 ? '' : 'm'} abaixo.` : ''
  doc.text(`ONUs sem potência (antes ou depois) foram desconsideradas.${aviso}`, ML, y)
  y += 7

  if (!comMedicao.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
    doc.text(treated.length ? 'Nenhuma PON tratada tem cliente com potência medida.' : 'Nenhuma PON tratada no filtro atual.', ML, y)
    doc.save(filename)
    return
  }

  comMedicao.forEach(item => {
    const clientes = clientesMedidos(item).sort((a, b) => a.rx_antes - b.rx_antes || a.cliente.localeCompare(b.cliente, 'pt-BR'))
    type Cliente = typeof clientes[number]
    const contar = (pick: (c: Cliente) => number) =>
      NIVEIS.map(nivel => clientes.filter(c => severityFromRx(pick(c)) === nivel.nome).length)
    const antes = contar(c => c.rx_antes), depois = contar(c => c.rx_depois)
    const ganhoMedio = clientes.reduce((sum, c) => sum + c.ganho, 0) / clientes.length
    const rxMedio = (pick: (c: Cliente) => number) => clientes.reduce((sum, c) => sum + pick(c), 0) / clientes.length

    if (y + 8 + CHART_H + 4 + 6 + DET_ROW * 2 > FIM_CONTEUDO) newPage()

    const cabecalhoPon = (continuacao: boolean) => {
      doc.setFillColor(229, 231, 235); doc.rect(ML, y, CW, 8, 'F')
      line(doc, `PON ${item.snapshot.pon} · ${item.snapshot.olt}${continuacao ? ' (continuação)' : ''}`, ML + 3, y + 5.4, { bold: true, size: 9.5, maxWidth: 100 })
      line(doc, `${item.snapshot.cidade || '—'} · ${item.snapshot.bairro || '—'}  |  tratada em ${formatMoment(item.created_at)} por ${item.created_by || 'sem usuário'}`,
        ML + 105, y + 5.4, { size: 7.5, color: SUB, maxWidth: CW - 108 })
      y += 8
    }
    cabecalhoPon(false)

    // Gráfico à esquerda, indicadores à direita.
    const topo = y + 2
    drawChart(ML + 4, topo, 120, antes, depois)
    const kx = ML + 140
    const indicadores: [string, string, RGB][] = [
      ['Clientes medidos', String(clientes.length), TEXT],
      ['Ganho médio', fmtGanho(ganhoMedio), ganhoMedio > 0 ? GREEN : RED],
      ['RX médio', `${fmtDb(rxMedio(c => c.rx_antes))} > ${fmtDb(rxMedio(c => c.rx_depois))} dBm`, TEXT],
      ['Críticos', `${antes[0]} > ${depois[0]}`, depois[0] < antes[0] ? GREEN : depois[0] > antes[0] ? RED : TEXT],
      ['Normais', `${antes[2]} > ${depois[2]}  (${((depois[2] / clientes.length) * 100).toFixed(0)}% após)`, TEXT],
      ['Melhoraram / pioraram', `${clientes.filter(c => c.ganho > 0).length} / ${clientes.filter(c => c.ganho < 0).length}`, TEXT],
    ]
    indicadores.forEach(([rotulo, valor, cor], i) => {
      const iy = topo + 6 + i * 5.2
      line(doc, rotulo, kx, iy, { size: 7.5, color: MUTED })
      line(doc, valor, kx + 42, iy, { size: 8, bold: true, color: cor, maxWidth: 80 })
    })
    y += CHART_H + 4

    clientTableHeader()
    clientes.forEach((cliente, index) => {
      if (y + DET_ROW > FIM_CONTEUDO) { newPage(); cabecalhoPon(true); clientTableHeader() }
      if (index % 2 === 0) { doc.setFillColor(249, 250, 251); doc.rect(ML, y, CW, DET_ROW, 'F') }
      const ty = y + 3.8
      const nA = severityFromRx(cliente.rx_antes), nD = severityFromRx(cliente.rx_depois)
      line(doc, cliente.cliente || '—', DET_X[0] + 2, ty, { size: 7, maxWidth: DET_COLS[0].w - 3 })
      line(doc, cliente.codigo || '—', DET_X[1] + 2, ty, { size: 7, maxWidth: DET_COLS[1].w - 3 })
      line(doc, [cliente.onu, cliente.serial].filter(Boolean).join(' · ') || '—', DET_X[2] + 2, ty, { size: 6.6, color: SUB, maxWidth: DET_COLS[2].w - 3 })
      line(doc, fmtDb(cliente.rx_antes), DET_X[3] + 2, ty, { size: 7 })
      line(doc, fmtDb(cliente.rx_depois), DET_X[4] + 2, ty, { size: 7, bold: true })
      line(doc, fmtGanho(cliente.ganho), DET_X[5] + 2, ty, { size: 7, bold: true, color: cliente.ganho > 0 ? GREEN : cliente.ganho < 0 ? RED : MUTED })
      line(doc, nA, DET_X[6] + 2, ty, { size: 6.8, bold: true, color: corNivel(nA) })
      line(doc, nD, DET_X[7] + 2, ty, { size: 6.8, bold: true, color: corNivel(nD) })
      doc.setDrawColor(...BORDER); doc.setLineWidth(0.15); doc.line(ML, y + DET_ROW, ML + CW, y + DET_ROW)
      y += DET_ROW
    })
    y += 6
  })

  footer()
  doc.save(filename)
}
