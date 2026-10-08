import jsPDF from 'jspdf'
import { drawPDFHeader } from '../../lib/pdfBrand'
import { fmtDate, shortEquipe } from '../../lib/osFormat'
import { DIAGNOSTICO_LABEL, buildResumoPorCidade, cidadeCurta, explicarDiagnostico, getOSObservation, sortedClientRows, type BairroResumo, type DiagnosticoBairro } from './reincidenciasReport'

type RGB = [number, number, number]
interface Estilo { size: number; bold: boolean; color: RGB }

const INK: RGB = [17, 24, 39]
const BODY: RGB = [55, 65, 81]
const MUTED: RGB = [107, 114, 128]
const AZUL: RGB = [30, 64, 175]
const LARANJA: RGB = [194, 65, 12]
const VERMELHO: RGB = [185, 28, 28]
const VERDE: RGB = [21, 128, 61]
const FIO: RGB = [226, 232, 240]
const FUNDO: RGB = [245, 247, 250]
const TRILHA: RGB = [229, 233, 240]

// Cor de cada diagnóstico: as únicas cores do relatório além do azul das barras.
const COR_DIAGNOSTICO: Record<DiagnosticoBairro, RGB> = { rede: AZUL, execucao: LARANJA, misto: [100, 116, 139], poucos: [203, 213, 225] }

const TIPO = {
  manchete: { size: 11.5, bold: true,  color: INK }   as Estilo,
  titulo:   { size: 10,   bold: true,  color: INK }   as Estilo,
  secao:    { size: 8,    bold: true,  color: MUTED } as Estilo,
  destaque: { size: 8.5,  bold: true,  color: INK }   as Estilo,
  corpo:    { size: 8.5,  bold: false, color: BODY }  as Estilo,
  legenda:  { size: 7.5,  bold: false, color: MUTED } as Estilo,
  numero:   { size: 15,   bold: true,  color: INK }   as Estilo,
}

const PT_TO_MM = 0.3528
const ENTRELINHA = 1.36
const alturaLinha = (size: number) => size * ENTRELINHA * PT_TO_MM
const BASE = 0.74
const RODAPE_Y = 290
const FIM_CONTEUDO = 275

const TOPO_BARRAS = 8
const TOPO_ONDE_AGIR = 5
const TOPO_DETALHE = 5

const pct1 = (valor: number) => valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

// Helvetica do PDF não tem ▲ ▼ nem o sinal de menos tipográfico: variação em ASCII, colorida.
export const deltaPDF = (delta: number | null): string => (delta === null ? '' : delta > 0 ? `+${delta}` : delta < 0 ? `-${Math.abs(delta)}` : '0')
const corDelta = (delta: number | null): RGB => (delta === null || delta === 0 ? MUTED : delta > 0 ? VERMELHO : VERDE)

export interface BairroPDFOpcoes {
  /** "Revisita de manutenção" ou "Revisita de instalação". */
  tipo: string
  filtros: string[]
  /** Período filtrado, já formatado ("01/09/2026 a 30/09/2026"); vazio se não houver. */
  periodo?: string
  /** Clientes atendidos no período (com os mesmos filtros): denominador da taxa geral. */
  totalBase?: number
  /** OS envolvidas no período anterior; null sem comparação. */
  totalOSAnterior?: number | null
  /** Clientes atendidos por cidade (chave da cidade → quantidade), para a taxa de cada cidade. */
  basePorCidade?: Record<string, number>
}

/** Frases de leitura calculadas só dos números — sem IA, para o PDF sair igual toda vez. */
export function leituraPorBairro(resumo: BairroResumo[]): string[] {
  if (!resumo.length) return []
  const totalOS = resumo.reduce((s, b) => s + b.nOS, 0)
  const top3 = resumo.slice(0, 3)
  const frases = [
    `${plural(top3.length, 'bairro concentra', 'bairros concentram')} ${Math.round(top3.reduce((s, b) => s + b.nOS, 0) / totalOS * 100)}% das OS: ${top3.map(b => b.label).join(', ')}.`,
  ]
  const cidades = buildResumoPorCidade(resumo)
  if (cidades.length >= 2) {
    frases.push(`Por cidade: ${cidades.slice(0, 4).map(c => `${c.cidade} ${c.nOS} OS (${c.pct}%)`).join(', ')}${cidades.length > 4 ? ` e mais ${cidades.length - 4}` : ''}.`)
  }
  const comVolta = resumo.filter(b => b.nClientes >= 2)
  if (comVolta.length) {
    const pior = [...comVolta].sort((a, b) => b.nOS / b.nClientes - a.nOS / a.nClientes || b.nOS - a.nOS)[0]
    frases.push(`Quem mais volta: ${pior.label} tem ${pct1(pior.nOS / pior.nClientes)} OS por cliente (${pior.nOS} OS em ${plural(pior.nClientes, 'cliente', 'clientes')}).`)
  }
  const pulverizados = resumo.filter(b => b.nClientes === 1).length
  if (pulverizados) frases.push(`${plural(pulverizados, 'bairro tem', 'bairros têm')} um único cliente reincidente: o problema ali é de caso, não de região.`)
  return frases
}

/** Ações por tipo de indício, só para os bairros que mais pesam. Sempre sugestão. */
export function acoesSugeridas(resumo: BairroResumo[]): string[] {
  const grandes = resumo.slice(0, 8)
  const acoes: string[] = []
  grandes.filter(b => b.diagnostico === 'rede').slice(0, 1).forEach(b => acoes.push(
    `Rede em ${b.label}: ${b.equipes.length} equipes na origem, nenhuma acima de ${Math.round(b.shareDominante * 100)}%. Medir as CTOs e acionar a Engenharia de Rede.`))
  grandes.filter(b => b.diagnostico === 'execucao').slice(0, 1).forEach(b => acoes.push(
    `Execução em ${b.label}: ${b.equipeDominante} fez ${Math.round(b.shareDominante * 100)}% das origens. Auditar o fechamento e conversar com a terceira.`))
  const piorando = resumo.slice(0, TOPO_ONDE_AGIR).filter(b => b.delta !== null && b.delta >= 3).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0]
  if (piorando) acoes.push(`Piorando: ${piorando.label} subiu ${piorando.delta} OS contra o período anterior (${piorando.nOSAnterior} para ${piorando.nOS}).`)
  if (!acoes.length) acoes.push('Sem padrão claro de rede ou de execução nos maiores bairros: revisar os casos um a um.')
  return acoes.slice(0, 3)
}

export function exportBairrosPDF(resumo: BairroResumo[], { tipo, filtros, periodo, totalBase = 0, totalOSAnterior = null, basePorCidade = {} }: BairroPDFOpcoes) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = 210, margin = 15, usable = width - margin * 2
  let page = 1, y = 0
  const reportType = `${tipo} — Análise por bairro`

  const addHeader = () => { y = drawPDFHeader(doc, { reportType, pageWidth: width, margin }) + 4 }
  const footer = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(`Página ${page}`, width - margin, RODAPE_Y, { align: 'right' })
  }
  const novaPagina = () => { footer(); doc.addPage(); page++; addHeader() }
  const ensure = (altura: number) => { if (y + altura > FIM_CONTEUDO) novaPagina() }
  const aplicar = (e: Estilo) => { doc.setFont('helvetica', e.bold ? 'bold' : 'normal'); doc.setFontSize(e.size); doc.setTextColor(...e.color) }
  const escrever = (texto: string, estilo: Estilo, { indent = 0, gap = 1.6 } = {}) => {
    const lh = alturaLinha(estilo.size)
    aplicar(estilo)
    const linhas: string[] = doc.splitTextToSize(texto, usable - indent)
    linhas.forEach(linha => { ensure(lh); aplicar(estilo); doc.text(linha, margin + indent, y + lh * BASE); y += lh })
    y += gap
  }
  const secao = (texto: string) => { y += 1.5; escrever(texto.toUpperCase(), TIPO.secao, { gap: 1 }) }
  const cortar = (texto: string, estilo: Estilo, largura: number): string => {
    aplicar(estilo)
    if (doc.getTextWidth(texto) <= largura) return texto
    let corte = texto
    while (corte.length > 1 && doc.getTextWidth(`${corte}…`) > largura) corte = corte.slice(0, -1)
    return `${corte.trimEnd()}…`
  }

  doc.setLineHeightFactor(ENTRELINHA)
  addHeader()

  const totalOS = resumo.reduce((s, b) => s + b.nOS, 0)
  const totalClientes = resumo.reduce((s, b) => s + b.nClientes, 0)
  const totalRevisitas = resumo.reduce((s, b) => s + b.nRevisitas, 0)
  const top3 = resumo.slice(0, 3).reduce((s, b) => s + b.nOS, 0)
  const nomeArquivo = `reincidencias-por-bairro-${new Date().toISOString().slice(0, 10)}.pdf`

  escrever([periodo, ...filtros].filter(Boolean).join(' · '), TIPO.legenda, { gap: 3 })
  if (!resumo.length) {
    escrever('Nenhuma revisita encontrada para os filtros selecionados.', TIPO.manchete)
    footer(); doc.save(nomeArquivo)
    return
  }

  // ── Manchete: o bairro que pede decisão, com taxa, tendência e indício.
  const lider = resumo[0]
  const partes = [`${lider.label} lidera com ${lider.nOS} OS (${lider.pct}% do total)`]
  if (lider.taxa !== null) partes.push(`taxa de revisita de ${pct1(lider.taxa)}%`)
  if (lider.delta !== null && lider.delta !== 0) partes.push(`${lider.delta > 0 ? 'subiu' : 'caiu'} ${Math.abs(lider.delta)} OS contra o período anterior`)
  if (lider.diagnostico === 'rede' || lider.diagnostico === 'execucao') partes.push(DIAGNOSTICO_LABEL[lider.diagnostico].toLowerCase())
  escrever(`${partes.join(', ')}.`, TIPO.manchete, { gap: 3 })

  // ── Quatro números. O segundo e o terceiro trazem a comparação e a base.
  ensure(22)
  const taxaGeral = totalBase ? totalClientes / totalBase * 100 : null
  const deltaGeral = totalOSAnterior === null ? null : totalOS - totalOSAnterior
  const indicadores: Array<{ valor: string; rotulo: string; extra?: { texto: string; cor: RGB } }> = [
    { valor: String(resumo.length), rotulo: 'bairros com revisita' },
    { valor: String(totalOS), rotulo: 'OS envolvidas', extra: deltaGeral === null ? undefined : { texto: `${deltaPDF(deltaGeral)} vs período anterior`, cor: corDelta(deltaGeral) } },
    { valor: taxaGeral === null ? '—' : `${pct1(taxaGeral)}%`, rotulo: 'taxa de revisita', extra: totalBase ? { texto: `${totalClientes} de ${totalBase} atendidos`, cor: MUTED } : undefined },
    { valor: `${Math.round(top3 / totalOS * 100)}%`, rotulo: 'das OS nos 3 maiores' },
  ]
  const caixa = (usable - 3 * 3) / 4
  indicadores.forEach((ind, i) => {
    const x = margin + i * (caixa + 3)
    doc.setFillColor(...FUNDO); doc.roundedRect(x, y, caixa, 19, 2, 2, 'F')
    aplicar(TIPO.numero); doc.text(ind.valor, x + 3, y + 8)
    aplicar(TIPO.legenda); doc.text(ind.rotulo, x + 3, y + 12.6)
    if (ind.extra) { aplicar({ ...TIPO.legenda, bold: true, color: ind.extra.cor }); doc.text(ind.extra.texto, x + 3, y + 16.4) }
  })
  y += 23

  // ── Quadrante: onde pesa mais. X = clientes atendidos, Y = taxa; tamanho = OS; cor = indício.
  const comTaxa = resumo.filter(b => b.taxa !== null && b.nBase > 0)
  if (comTaxa.length >= 2) {
    ensure(78)
    secao('Onde agir: volume atendido x taxa de revisita')
    const topoQ = y
    const qx = margin + 9, qw = 92, qh = 50
    const maxX = Math.max(...comTaxa.map(b => b.nBase)) * 1.1
    const maxY = Math.max(...comTaxa.map(b => b.taxa as number), taxaGeral ?? 0) * 1.15
    const px = (v: number) => qx + v / maxX * qw
    const py = (v: number) => topoQ + qh - v / maxY * qh
    doc.setDrawColor(...FIO); doc.setLineWidth(0.2); doc.rect(qx, topoQ, qw, qh)
    // Linhas de referência: taxa geral e a mediana de clientes atendidos.
    const medianaX = [...comTaxa].map(b => b.nBase).sort((a, b) => a - b)[Math.floor(comTaxa.length / 2)]
    doc.setDrawColor(...MUTED); doc.setLineWidth(0.15)
    if (taxaGeral !== null) doc.line(qx, py(taxaGeral), qx + qw, py(taxaGeral))
    doc.line(px(medianaX), topoQ, px(medianaX), topoQ + qh)
    aplicar(TIPO.legenda)
    doc.text('taxa geral', qx + 1, (taxaGeral !== null ? py(taxaGeral) : topoQ) - 0.8)
    doc.text('0', qx - 1.2, topoQ + qh, { align: 'right' }); doc.text(`${Math.round(maxY)}%`, qx - 1.2, topoQ + 2.5, { align: 'right' })
    doc.text('clientes atendidos no bairro', qx + qw / 2, topoQ + qh + 4.4, { align: 'center' })
    doc.text('taxa', margin, topoQ + qh / 2)
    const maxOS = Math.max(...comTaxa.map(b => b.nOS))
    const rotulados = new Set(resumo.slice(0, 5).map(b => b.key))
    // Maiores primeiro: bolhas pequenas ficam por cima e não somem atrás das grandes.
    ;[...comTaxa].sort((a, b) => b.nOS - a.nOS).forEach(b => {
      const r = 1.1 + 2.6 * Math.sqrt(b.nOS / maxOS)
      doc.setFillColor(...COR_DIAGNOSTICO[b.diagnostico]); doc.circle(px(b.nBase), py(b.taxa as number), r, 'F')
    })
    // Rótulos dos maiores: tenta ao lado da bolha e, se bater em outro rótulo, sobe ou desce; sem lugar, omite.
    const ocupados: Array<{ x0: number; x1: number; y: number }> = []
    resumo.filter(b => rotulados.has(b.key) && b.taxa !== null && b.nBase > 0).forEach(b => {
      aplicar({ ...TIPO.legenda, color: INK })
      const texto = cortar(b.label, TIPO.legenda, 26)
      const w = doc.getTextWidth(texto)
      const r = 1.1 + 2.6 * Math.sqrt(b.nOS / maxOS)
      const direita = px(b.nBase) + r + 0.8 + w < qx + qw
      const x0 = direita ? px(b.nBase) + r + 0.8 : px(b.nBase) - r - 0.8 - w
      for (const desloque of [0, -3, 3, -6, 6]) {
        const yy = py(b.taxa as number) + 0.9 + desloque
        if (yy < topoQ + 2 || yy > topoQ + qh - 1) continue
        if (ocupados.some(o => Math.abs(o.y - yy) < 2.8 && o.x0 < x0 + w && x0 < o.x1)) continue
        ocupados.push({ x0, x1: x0 + w, y: yy })
        doc.text(texto, x0, yy)
        break
      }
    })
    // Legenda das cores.
    let lx = qx
    ;(['rede', 'execucao', 'misto', 'poucos'] as DiagnosticoBairro[]).forEach(d => {
      doc.setFillColor(...COR_DIAGNOSTICO[d]); doc.circle(lx + 1, topoQ + qh + 8.6, 1, 'F')
      aplicar(TIPO.legenda); doc.text(DIAGNOSTICO_LABEL[d], lx + 3, topoQ + qh + 9.4)
      lx += 3 + doc.getTextWidth(DIAGNOSTICO_LABEL[d]) + 3
    })

    // Lista "onde agir" ao lado: os maiores, com taxa, variação e indício.
    const lxL = qx + qw + 8, larguraL = width - margin - lxL
    let ly = topoQ
    resumo.slice(0, TOPO_ONDE_AGIR).forEach(b => {
      const alturaItem = 11.6
      doc.setFillColor(...FUNDO); doc.roundedRect(lxL, ly, larguraL, alturaItem - 1.2, 1.5, 1.5, 'F')
      doc.setFillColor(...COR_DIAGNOSTICO[b.diagnostico]); doc.rect(lxL, ly, 1.2, alturaItem - 1.2, 'F')
      aplicar(TIPO.destaque); doc.text(cortar(b.label, TIPO.destaque, larguraL - 6), lxL + 3, ly + 3.8)
      aplicar(TIPO.legenda)
      const linha2 = `${b.nOS} OS${b.taxa !== null ? ` · taxa ${pct1(b.taxa)}%` : ''}`
      doc.text(linha2, lxL + 3, ly + 7.2)
      if (b.delta !== null) { aplicar({ ...TIPO.legenda, bold: true, color: corDelta(b.delta) }); doc.text(deltaPDF(b.delta), lxL + 3 + doc.getTextWidth(linha2) + 2, ly + 7.2) }
      aplicar({ ...TIPO.legenda, bold: true, color: COR_DIAGNOSTICO[b.diagnostico] === COR_DIAGNOSTICO.poucos ? MUTED : COR_DIAGNOSTICO[b.diagnostico] })
      doc.text(cortar(`${DIAGNOSTICO_LABEL[b.diagnostico]}${b.diagnostico === 'execucao' && b.equipeDominante ? ` · ${b.equipeDominante}` : ''}`, TIPO.legenda, larguraL - 6), lxL + 3, ly + 9.9)
      ly += alturaItem
    })
    y = topoQ + qh + 11
  }

  // ── Leitura e ações sugeridas.
  secao('Leitura')
  leituraPorBairro(resumo).forEach(frase => escrever(`• ${frase}`, TIPO.corpo, { gap: 0.8 }))
  y += 1.5
  secao('Ações sugeridas (indícios a confirmar em campo)')
  acoesSugeridas(resumo).forEach(a => escrever(`• ${a}`, TIPO.corpo, { gap: 0.8 }))
  y += 2

  // ── Barras horizontais: a mesma medida (OS) da tela, com a variação.
  const topo = resumo.slice(0, TOPO_BARRAS)
  ensure(10 + topo.length * 5.6)
  secao(`OS envolvidas por bairro (${topo.length} maiores)`)
  const larguraRotulo = 62, larguraValor = 40, larguraBarra = usable - larguraRotulo - larguraValor - 4
  const alturaBarra = 5.6
  const maximo = Math.max(1, ...topo.map(b => b.nOS))
  topo.forEach(b => {
    ensure(alturaBarra + 1)
    aplicar(TIPO.corpo); doc.text(cortar(b.label, TIPO.corpo, larguraRotulo - 2), margin, y + 3.9)
    doc.setFillColor(...TRILHA); doc.roundedRect(margin + larguraRotulo, y + 1, larguraBarra, 3.4, 1, 1, 'F')
    doc.setFillColor(...AZUL); doc.roundedRect(margin + larguraRotulo, y + 1, Math.max(1.2, larguraBarra * b.nOS / maximo), 3.4, 1, 1, 'F')
    const xv = margin + larguraRotulo + larguraBarra + 4
    aplicar(TIPO.destaque); doc.text(`${b.nOS} OS`, xv, y + 3.9)
    if (b.delta !== null) { aplicar({ ...TIPO.legenda, bold: true, color: corDelta(b.delta) }); doc.text(deltaPDF(b.delta), xv + 13, y + 3.9) }
    aplicar(TIPO.legenda); doc.text(`${plural(b.nClientes, 'cliente', 'clientes')} · ${b.pct}%`, width - margin, y + 3.9, { align: 'right' })
    y += alturaBarra
  })

  // ── Anexo: com mais de uma cidade, abre com o quadro por cidade.
  novaPagina()
  const porCidade = buildResumoPorCidade(resumo, basePorCidade)
  if (porCidade.length >= 2) {
    secao(`Por cidade (${porCidade.length})`)
    const colsC = [
      { titulo: 'Cidade', x: margin, w: 46, alinha: 'left' as const },
      { titulo: 'Bairros', x: margin + 46, w: 20, alinha: 'right' as const },
      { titulo: 'OS', x: margin + 66, w: 14, alinha: 'right' as const },
      { titulo: 'Var.', x: margin + 80, w: 14, alinha: 'right' as const },
      { titulo: 'Clientes', x: margin + 94, w: 18, alinha: 'right' as const },
      { titulo: 'Atend.', x: margin + 112, w: 18, alinha: 'right' as const },
      { titulo: 'Taxa', x: margin + 130, w: 18, alinha: 'right' as const },
      { titulo: '% das OS', x: margin + 148, w: 20, alinha: 'right' as const },
    ]
    const cel = (texto: string, col: typeof colsC[number], yy: number) =>
      col.alinha === 'right' ? doc.text(texto, col.x + col.w - 1, yy, { align: 'right' }) : doc.text(texto, col.x + 1, yy)
    ensure(8 + (porCidade.length + 2) * 5.4)
    doc.setFillColor(...FUNDO); doc.rect(margin, y, usable, 6, 'F')
    aplicar({ ...TIPO.secao, color: INK }); colsC.forEach(c => cel(c.titulo, c, y + 4.1)); y += 6
    porCidade.forEach((c, i) => {
      if (i % 2) { doc.setFillColor(250, 251, 252); doc.rect(margin, y, usable, 5.4, 'F') }
      aplicar(TIPO.destaque); cel(cortar(c.cidade, TIPO.destaque, colsC[0].w - 2), colsC[0], y + 3.8)
      aplicar(TIPO.corpo); cel(String(c.nBairros), colsC[1], y + 3.8)
      aplicar(TIPO.destaque); cel(String(c.nOS), colsC[2], y + 3.8)
      if (c.delta !== null) { aplicar({ ...TIPO.corpo, bold: true, color: corDelta(c.delta) }); cel(deltaPDF(c.delta), colsC[3], y + 3.8) }
      aplicar(TIPO.corpo)
      cel(String(c.nClientes), colsC[4], y + 3.8)
      cel(c.nBase ? String(c.nBase) : '—', colsC[5], y + 3.8)
      cel(c.taxa !== null ? `${pct1(c.taxa)}%` : '—', colsC[6], y + 3.8)
      cel(`${c.pct}%`, colsC[7], y + 3.8)
      y += 5.4
    })
    doc.setDrawColor(...INK); doc.setLineWidth(0.2); doc.line(margin, y, width - margin, y)
    y += 7
  }
  const cols = [
    { titulo: 'Bairro', x: margin, w: 46, alinha: 'left' as const },
    { titulo: 'Cidade', x: margin + 46, w: 20, alinha: 'left' as const },
    { titulo: 'OS', x: margin + 66, w: 12, alinha: 'right' as const },
    { titulo: 'Var.', x: margin + 78, w: 13, alinha: 'right' as const },
    { titulo: 'Clientes', x: margin + 91, w: 17, alinha: 'right' as const },
    { titulo: 'Atend.', x: margin + 108, w: 15, alinha: 'right' as const },
    { titulo: 'Taxa', x: margin + 123, w: 15, alinha: 'right' as const },
    { titulo: 'Indício', x: margin + 140, w: 40, alinha: 'left' as const },
  ]
  const celula = (texto: string, col: typeof cols[number], yy: number) =>
    col.alinha === 'right' ? doc.text(texto, col.x + col.w - 1, yy, { align: 'right' }) : doc.text(texto, col.x + 1, yy)
  const cabecalhoTabela = () => {
    doc.setFillColor(...FUNDO); doc.rect(margin, y, usable, 6, 'F')
    aplicar({ ...TIPO.secao, color: INK })
    cols.forEach(c => celula(c.titulo, c, y + 4.1))
    y += 6
  }
  secao('Todos os bairros')
  cabecalhoTabela()
  resumo.forEach((b, i) => {
    if (y + 5.4 > FIM_CONTEUDO) { novaPagina(); cabecalhoTabela() }
    if (i % 2) { doc.setFillColor(250, 251, 252); doc.rect(margin, y, usable, 5.4, 'F') }
    aplicar(TIPO.corpo)
    celula(cortar(b.label, TIPO.corpo, cols[0].w - 2), cols[0], y + 3.8)
    celula(cortar(cidadeCurta(b.cidade), TIPO.corpo, cols[1].w - 2), cols[1], y + 3.8)
    aplicar(TIPO.destaque); celula(String(b.nOS), cols[2], y + 3.8)
    if (b.delta !== null) { aplicar({ ...TIPO.corpo, bold: true, color: corDelta(b.delta) }); celula(deltaPDF(b.delta), cols[3], y + 3.8) }
    aplicar(TIPO.corpo)
    celula(String(b.nClientes), cols[4], y + 3.8)
    celula(b.nBase ? String(b.nBase) : '—', cols[5], y + 3.8)
    celula(b.taxa !== null ? `${pct1(b.taxa)}%` : '—', cols[6], y + 3.8)
    celula(cortar(`${DIAGNOSTICO_LABEL[b.diagnostico]}${b.diagnostico === 'execucao' && b.equipeDominante ? ` · ${b.equipeDominante}` : ''}`, TIPO.corpo, cols[7].w - 2), cols[7], y + 3.8)
    y += 5.4
  })
  aplicar(TIPO.destaque)
  ensure(7)
  doc.setDrawColor(...INK); doc.setLineWidth(0.2); doc.line(margin, y, width - margin, y)
  celula('Total', cols[0], y + 4.4); celula(String(totalOS), cols[2], y + 4.4)
  if (deltaGeral !== null) celula(deltaPDF(deltaGeral), cols[3], y + 4.4)
  celula(String(totalClientes), cols[4], y + 4.4)
  if (totalBase) { celula(String(totalBase), cols[5], y + 4.4); celula(`${pct1(totalClientes / totalBase * 100)}%`, cols[6], y + 4.4) }
  y += 7
  aplicar(TIPO.legenda)
  escrever(`${totalRevisitas} revisitas (OS depois da primeira de cada cliente) em ${plural(totalClientes, 'cliente', 'clientes')}. Var. = OS contra o período anterior. Atend. = clientes atendidos no bairro no período; taxa = clientes reincidentes ÷ atendidos. Indício de rede ou execução vem de quem fez a visita de origem: é uma leitura dos números, não um laudo.`, TIPO.legenda, { gap: 5 })

  // ── Ordens dos maiores bairros.
  const detalhe = resumo.slice(0, TOPO_DETALHE)
  ensure(46)
  escrever(`Ordens dos ${plural(detalhe.length, 'maior bairro', 'maiores bairros')}`, TIPO.titulo, { gap: 2.4 })
  detalhe.forEach(b => {
    ensure(22)
    doc.setFillColor(...FUNDO); doc.roundedRect(margin, y, usable, 11, 2, 2, 'F')
    aplicar({ size: 9.5, bold: true, color: INK }); doc.text(`${b.label} · ${b.nOS} OS`, margin + 3, y + 4.6)
    aplicar(TIPO.legenda)
    doc.text(`${b.cidade || '—'} · ${plural(b.nClientes, 'cliente', 'clientes')} · ${plural(b.nRevisitas, 'revisita', 'revisitas')} · ${b.pct}% das OS · ${DIAGNOSTICO_LABEL[b.diagnostico]}`, margin + 3, y + 8.8)
    y += 14
    escrever(explicarDiagnostico(b), TIPO.legenda, { indent: 2, gap: 1.6 })
    b.clientes.forEach(cliente => {
      ensure(16)
      escrever(`${cliente.cliente} · ${cliente.visitas} visitas · média ${cliente.intervaloMedio.toLocaleString('pt-BR')}d`, TIPO.destaque, { indent: 2, gap: 0.4 })
      sortedClientRows(cliente.rows).forEach(row => {
        escrever(`${fmtDate(row.dataexecucao || row.databaixa) || 'Sem data'} · OS ${row.numos} · ${shortEquipe(row.nomedaequipe)} — ${row.servico || row.tiposervico || 'Serviço não informado'}: ${getOSObservation(row).replace(/\s+/g, ' ').slice(0, 160)}`, TIPO.corpo, { indent: 5, gap: 0.5 })
      })
      y += 1.6
    })
    y += 1.5
  })

  footer()
  doc.save(nomeArquivo)
}
