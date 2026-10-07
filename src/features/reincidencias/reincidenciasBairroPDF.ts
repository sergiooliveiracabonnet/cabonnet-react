import jsPDF from 'jspdf'
import { drawPDFHeader } from '../../lib/pdfBrand'
import { fmtDate, shortEquipe } from '../../lib/osFormat'
import { cidadeCurta, getOSObservation, sortedClientRows, type BairroResumo } from './reincidenciasReport'

type RGB = [number, number, number]
interface Estilo { size: number; bold: boolean; color: RGB }

const INK: RGB = [17, 24, 39]
const BODY: RGB = [55, 65, 81]
const MUTED: RGB = [107, 114, 128]
const AZUL: RGB = [30, 64, 175]
const FIO: RGB = [226, 232, 240]
const FUNDO: RGB = [245, 247, 250]
const TRILHA: RGB = [229, 233, 240]

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

const TOPO_BARRAS = 15
const TOPO_DETALHE = 5

const pct1 = (valor: number) => valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export interface BairroPDFOpcoes {
  /** "Revisita de manutenção" ou "Revisita de instalação". */
  tipo: string
  filtros: string[]
  /** Período filtrado, já formatado ("01/09/2026 a 30/09/2026"); vazio se não houver. */
  periodo?: string
}

/** Frases de leitura calculadas só dos números — sem IA, para o PDF sair igual toda vez. */
export function leituraPorBairro(resumo: BairroResumo[]): string[] {
  if (!resumo.length) return []
  const totalOS = resumo.reduce((s, b) => s + b.nOS, 0)
  const top3 = resumo.slice(0, 3)
  const frases = [
    `${plural(top3.length, 'bairro concentra', 'bairros concentram')} ${Math.round(top3.reduce((s, b) => s + b.nOS, 0) / totalOS * 100)}% das OS: ${top3.map(b => b.label).join(', ')}.`,
  ]
  const comVolta = resumo.filter(b => b.nClientes >= 2)
  if (comVolta.length) {
    const pior = [...comVolta].sort((a, b) => b.nOS / b.nClientes - a.nOS / a.nClientes || b.nOS - a.nOS)[0]
    frases.push(`Quem mais volta: ${pior.label} tem ${pct1(pior.nOS / pior.nClientes)} OS por cliente (${pior.nOS} OS em ${plural(pior.nClientes, 'cliente', 'clientes')}).`)
  }
  const pulverizados = resumo.filter(b => b.nClientes === 1).length
  if (pulverizados) frases.push(`${plural(pulverizados, 'bairro tem', 'bairros têm')} um único cliente reincidente: o problema ali é de caso, não de região.`)
  return frases
}

export function exportBairrosPDF(resumo: BairroResumo[], { tipo, filtros, periodo }: BairroPDFOpcoes) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = 210, margin = 15, usable = width - margin * 2
  let page = 1, y = 0
  const reportType = `${tipo} — Análise por bairro`

  const addHeader = () => { y = drawPDFHeader(doc, { reportType, pageWidth: width, margin }) + 4 }
  const footer = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(`Página ${page}`, width - margin, RODAPE_Y, { align: 'right' })
  }
  const ensure = (altura: number) => {
    if (y + altura <= FIM_CONTEUDO) return
    footer(); doc.addPage(); page++; addHeader()
  }
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

  escrever([periodo, ...filtros].filter(Boolean).join(' · '), TIPO.legenda, { gap: 3 })
  if (!resumo.length) {
    escrever('Nenhuma revisita encontrada para os filtros selecionados.', TIPO.manchete)
    footer(); doc.save(`reincidencias-por-bairro-${new Date().toISOString().slice(0, 10)}.pdf`)
    return
  }

  const lider = resumo[0]
  escrever(`${lider.label} lidera com ${lider.nOS} OS (${lider.pct}% do total), em ${plural(resumo.length, 'bairro', 'bairros')} com revisita.`, TIPO.manchete, { gap: 3 })

  // Quatro números, mesma base do card "OS envolvidas" da tela.
  ensure(22)
  const indicadores: Array<[string, string]> = [
    [String(resumo.length), 'bairros com revisita'],
    [String(totalOS), 'OS envolvidas'],
    [String(totalClientes), 'clientes reincidentes'],
    [`${Math.round(top3 / totalOS * 100)}%`, 'das OS nos 3 maiores'],
  ]
  const caixa = (usable - 3 * 3) / 4
  indicadores.forEach(([valor, rotulo], i) => {
    const x = margin + i * (caixa + 3)
    doc.setFillColor(...FUNDO); doc.roundedRect(x, y, caixa, 17, 2, 2, 'F')
    aplicar(TIPO.numero); doc.text(valor, x + 3, y + 8)
    aplicar(TIPO.legenda); doc.text(rotulo, x + 3, y + 13.2)
  })
  y += 21

  secao('Leitura')
  leituraPorBairro(resumo).forEach(frase => escrever(`• ${frase}`, TIPO.corpo, { gap: 0.8 }))
  y += 2

  // Barras horizontais: a mesma medida (OS) da tela.
  const topo = resumo.slice(0, TOPO_BARRAS)
  secao(`OS envolvidas por bairro (${topo.length} maiores)`)
  const larguraRotulo = 62, larguraValor = 44, larguraBarra = usable - larguraRotulo - larguraValor - 4
  const alturaBarra = 6
  const maximo = Math.max(1, ...topo.map(b => b.nOS))
  topo.forEach(b => {
    ensure(alturaBarra + 1)
    const texto = cortar(b.label, TIPO.corpo, larguraRotulo - 2)
    aplicar(TIPO.corpo); doc.text(texto, margin, y + 4.1)
    doc.setFillColor(...TRILHA); doc.roundedRect(margin + larguraRotulo, y + 1.2, larguraBarra, 3.6, 1, 1, 'F')
    doc.setFillColor(...AZUL); doc.roundedRect(margin + larguraRotulo, y + 1.2, Math.max(1.2, larguraBarra * b.nOS / maximo), 3.6, 1, 1, 'F')
    aplicar(TIPO.destaque); doc.text(`${b.nOS} OS`, margin + larguraRotulo + larguraBarra + 4, y + 4.1)
    aplicar(TIPO.legenda); doc.text(`${plural(b.nClientes, 'cliente', 'clientes')} · ${b.pct}%`, width - margin, y + 4.1, { align: 'right' })
    y += alturaBarra
  })
  y += 3

  // Tabela completa.
  const cols = [
    { titulo: 'Bairro', x: margin, w: 58, alinha: 'left' as const },
    { titulo: 'Cidade', x: margin + 58, w: 28, alinha: 'left' as const },
    { titulo: 'OS', x: margin + 86, w: 14, alinha: 'right' as const },
    { titulo: 'Clientes', x: margin + 100, w: 20, alinha: 'right' as const },
    { titulo: 'Revisitas', x: margin + 120, w: 20, alinha: 'right' as const },
    { titulo: 'OS/cliente', x: margin + 140, w: 20, alinha: 'right' as const },
    { titulo: '% das OS', x: margin + 160, w: 20, alinha: 'right' as const },
  ]
  const celula = (texto: string, col: typeof cols[number], yy: number) =>
    col.alinha === 'right' ? doc.text(texto, col.x + col.w - 1, yy, { align: 'right' }) : doc.text(texto, col.x + 1, yy)
  const cabecalhoTabela = () => {
    doc.setFillColor(...FUNDO); doc.rect(margin, y, usable, 6, 'F')
    aplicar({ ...TIPO.secao, color: INK })
    cols.forEach(c => celula(c.titulo, c, y + 4.1))
    y += 6
  }
  ensure(26)
  secao('Todos os bairros')
  cabecalhoTabela()
  resumo.forEach((b, i) => {
    if (y + 5.4 > FIM_CONTEUDO) { footer(); doc.addPage(); page++; addHeader(); cabecalhoTabela() }
    if (i % 2) { doc.setFillColor(250, 251, 252); doc.rect(margin, y, usable, 5.4, 'F') }
    aplicar(TIPO.corpo)
    celula(cortar(b.label, TIPO.corpo, cols[0].w - 2), cols[0], y + 3.8)
    celula(cortar(cidadeCurta(b.cidade), TIPO.corpo, cols[1].w - 2), cols[1], y + 3.8)
    aplicar(TIPO.destaque); celula(String(b.nOS), cols[2], y + 3.8)
    aplicar(TIPO.corpo)
    celula(String(b.nClientes), cols[3], y + 3.8)
    celula(String(b.nRevisitas), cols[4], y + 3.8)
    celula(pct1(b.nOS / b.nClientes), cols[5], y + 3.8)
    celula(`${b.pct}%`, cols[6], y + 3.8)
    y += 5.4
  })
  aplicar(TIPO.destaque)
  ensure(7)
  doc.setDrawColor(...INK); doc.setLineWidth(0.2); doc.line(margin, y, width - margin, y)
  celula('Total', cols[0], y + 4.4); celula(String(totalOS), cols[2], y + 4.4)
  celula(String(totalClientes), cols[3], y + 4.4); celula(String(totalRevisitas), cols[4], y + 4.4)
  celula(pct1(totalOS / totalClientes), cols[5], y + 4.4); celula('100%', cols[6], y + 4.4)
  y += 9

  // Ordens dos maiores bairros.
  const detalhe = resumo.slice(0, TOPO_DETALHE)
  ensure(46)
  escrever(`Ordens dos ${plural(detalhe.length, 'maior bairro', 'maiores bairros')}`, TIPO.titulo, { gap: 2.4 })
  detalhe.forEach(b => {
    ensure(22)
    doc.setFillColor(...FUNDO); doc.roundedRect(margin, y, usable, 11, 2, 2, 'F')
    aplicar({ size: 9.5, bold: true, color: INK }); doc.text(`${b.label} · ${b.nOS} OS`, margin + 3, y + 4.6)
    aplicar(TIPO.legenda)
    doc.text(`${b.cidade || '—'} · ${plural(b.nClientes, 'cliente', 'clientes')} · ${plural(b.nRevisitas, 'revisita', 'revisitas')} · ${b.pct}% das OS`, margin + 3, y + 8.8)
    y += 14
    b.clientes.forEach(cliente => {
      ensure(16)
      escrever(`${cliente.cliente} · ${cliente.visitas} visitas · média ${cliente.intervaloMedio.toLocaleString('pt-BR')}d`, TIPO.destaque, { indent: 2, gap: 0.4 })
      sortedClientRows(cliente.rows).forEach(row => {
        escrever(`${fmtDate(row.dataexecucao || row.databaixa) || 'Sem data'} · OS ${row.numos} · ${shortEquipe(row.nomedaequipe)} — ${row.servico || row.tiposervico || 'Serviço não informado'}: ${getOSObservation(row).replace(/\s+/g, ' ').slice(0, 160)}`, TIPO.corpo, { indent: 5, gap: 0.5 })
      })
      y += 1.6
    })
    y += 1.5
    doc.setDrawColor(...FIO)
  })

  footer()
  doc.save(`reincidencias-por-bairro-${new Date().toISOString().slice(0, 10)}.pdf`)
}
