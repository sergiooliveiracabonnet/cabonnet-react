import jsPDF from 'jspdf'
import { drawPDFHeader } from '../../lib/pdfBrand'
import { truncateTextToWidth } from '../../lib/pdfTableLayout'
import { clientesMedidos, efetividadeResumo } from './ponEfetividade'
import { severityFromRx } from './nivelSinal'
import { medicoesProgresso, type TreatedPon } from './ponTreatments'

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
const RODAPE_Y = 203
const FIM_CONTEUDO = 196

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

/** Resumido: por PON, só os detalhes e o gráfico antes/depois. Detalhado: cada PON com todos os
 *  clientes medidos e o gráfico de como era antes e como ficou depois da manutenção. */
export function exportPonsTratadasPDF(treated: TreatedPon[], modo: ModoPonsTratadasPDF = 'resumido',
  filename = `pons-tratadas-${modo}-${hoje()}.pdf`): void {
  if (modo === 'detalhado') exportDetalhado(treated, filename)
  else exportResumido(treated, filename)
}

function exportResumido(treated: TreatedPon[], filename: string): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const now = new Date()
  let page = 1
  let y = 0

  const footer = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(`Página ${page}`, PW - MR, RODAPE_Y, { align: 'right' })
  }
  const addHeader = () => {
    y = drawPDFHeader(doc, { reportType: 'Nível de Sinal — PONs Tratadas', pageWidth: PW, margin: ML, generatedAt: now }) + 4
  }

  addHeader()

  if (!treated.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
    doc.text('Nenhuma PON tratada no filtro atual.', ML, y)
    doc.save(filename)
    return
  }

  treated.forEach(item => {
    if (y + 8 + CHART_H + 6 > FIM_CONTEUDO) { footer(); doc.addPage(); page++; addHeader() }
    drawPonHeader(doc, y, item, false)
    y += 8

    const topo = y + 2
    const clientes = clientesMedidos(item)
    const contar = (pick: (c: typeof clientes[number]) => number) =>
      NIVEIS.map(nivel => clientes.filter(c => severityFromRx(pick(c)) === nivel.nome).length)
    if (clientes.length) drawChart(doc, ML + 4, topo, 120, contar(c => c.rx_antes), contar(c => c.rx_depois))
    else line(doc, 'Sem clientes com potência de antes e depois medidas.', ML + 4, topo + 8, { size: 7.5, color: MUTED })

    const snap = item.snapshot
    const prog = medicoesProgresso(item)
    const rotulo = item.situacao === 'sem-dados' ? 'Sem clientes' : item.situacao === 'critica' ? 'Ainda crítica' : item.situacao === 'atencao' ? 'Em atenção' : 'Normalizada'
    const corSituacao = item.situacao === 'critica' ? RED : item.situacao === 'atencao' ? ORANGE : item.situacao === 'normalizada' ? GREEN : MUTED
    const ganhoMedio = clientes.length ? clientes.reduce((sum, c) => sum + c.ganho, 0) / clientes.length : null
    const detalhes: [string, string, RGB][] = [
      ['Total de clientes', String(snap.total), TEXT],
      ['Inicialmente', `${snap.criticos} críticas de ${snap.total} · ${(snap.concentracao * 100).toFixed(0)}%`, TEXT],
      ['RX mediano', `${snap.rxMediano?.toFixed(1) ?? '—'} dBm${snap.tempMax != null ? ` · ${snap.tempMax.toFixed(0)}°C máx` : ''}`, TEXT],
      ['Ciclos', `${item.treated_count}× tratada${item.reopened_count ? ` · ${item.reopened_count}× reaberta` : ''}`, item.reopened_count ? ORANGE : TEXT],
      ['Potências', prog.total ? `${prog.preenchidas}/${prog.total} medidas` : 'sem clientes registrados', prog.pendentes ? ORANGE : TEXT],
      ['Ganho médio', ganhoMedio == null ? '—' : fmtGanho(ganhoMedio), ganhoMedio == null ? MUTED : ganhoMedio > 0 ? GREEN : RED],
      ['Situação atual', rotulo, corSituacao],
    ]
    detalhes.forEach(([nome, valor, cor], i) => {
      const iy = topo + 5 + i * 4.8
      line(doc, nome, ML + 140, iy, { size: 7.5, color: MUTED })
      line(doc, valor, ML + 182, iy, { size: 8, bold: true, color: cor, maxWidth: 80 })
    })
    y += CHART_H + 6
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

/** Barras horizontais de nível antes × depois da manutenção, na mesma escala. */
function drawChart(doc: jsPDF, x: number, top: number, w: number, antes: number[], depois: number[]) {
  const total = Math.max(1, antes.reduce((a, b) => a + b, 0))
  const gap = 10, clusterW = (w - gap) / 2, labelW = 14, valueW = 8
  const barMax = clusterW - labelW - valueW
  const rowH = 6.6, barH = 4.4
  const clusters = [
    { titulo: 'Antes da manutenção', dados: antes, ox: x },
    { titulo: 'Após a manutenção', dados: depois, ox: x + clusterW + gap },
  ]
  clusters.forEach(({ titulo, dados, ox }) => {
    line(doc, titulo, ox, top + 3, { bold: true, size: 7.5, color: SUB })
    dados.forEach((valor, i) => {
      const ry = top + 7 + i * rowH
      const bw = valor ? Math.max(0.8, (valor / total) * barMax) : 0
      line(doc, NIVEIS[i].nome, ox, ry + 3.3, { size: 6.5, color: MUTED })
      if (bw > 0) { doc.setFillColor(...NIVEIS[i].cor); doc.rect(ox + labelW, ry, bw, barH, 'F') }
      line(doc, String(valor), ox + labelW + bw + 1.5, ry + 3.3, { bold: true, size: 7.5 })
    })
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.3)
    doc.line(ox + labelW, top + 6, ox + labelW, top + 7 + NIVEIS.length * rowH - 1)
  })
}

function drawPonHeader(doc: jsPDF, y: number, item: TreatedPon, continuacao: boolean) {
  doc.setFillColor(229, 231, 235); doc.rect(ML, y, CW, 8, 'F')
  line(doc, `PON ${item.snapshot.pon} · ${item.snapshot.olt}${continuacao ? ' (continuação)' : ''}`, ML + 3, y + 5.4, { bold: true, size: 9.5, maxWidth: 100 })
  line(doc, `${item.snapshot.cidade || '—'} · ${item.snapshot.bairro || '—'}  |  tratada em ${formatMoment(item.created_at)} por ${item.created_by || 'sem usuário'}`,
    ML + 105, y + 5.4, { size: 7.5, color: SUB, maxWidth: CW - 108 })
}

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

    const cabecalhoPon = (continuacao: boolean) => { drawPonHeader(doc, y, item, continuacao); y += 8 }
    cabecalhoPon(false)

    // Gráfico à esquerda, indicadores à direita.
    const topo = y + 2
    drawChart(doc, ML + 4, topo, 120, antes, depois)
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
