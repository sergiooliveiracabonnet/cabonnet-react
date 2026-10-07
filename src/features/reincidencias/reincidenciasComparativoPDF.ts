import jsPDF from 'jspdf'
import { drawPDFHeader } from '../../lib/pdfBrand'
import { METRICAS, formatarValor, formatarVariacao, type MetricaComparativo, type TabelaComparativo } from './reincidenciasMatriz'
import { cidadeCurta } from './reincidenciasReport'

type RGB = [number, number, number]

const INK: RGB = [17, 24, 39]
const BODY: RGB = [55, 65, 81]
const MUTED: RGB = [107, 114, 128]
const FUNDO: RGB = [245, 247, 250]
const LARANJA: RGB = [234, 88, 12]
const VERMELHO: RGB = [185, 28, 28]
const VERDE: RGB = [21, 128, 61]

const LARGURA = 297, ALTURA_MAX = 190
const MARGEM = 12
const ALTURA_LINHA = 5.4

export interface ComparativoPDFOpcoes {
  /** "Revisita de manutenção" ou "Revisita de instalação". */
  tipo: string
  filtros: string[]
  /** Meses parciais (em curso), para o aviso do rodapé. */
  parciais?: string[]
}

/** Mistura branco com laranja: o "mapa de calor" da célula sem depender de transparência. */
const tom = (intensidade: number): RGB => {
  const a = Math.max(0, Math.min(1, intensidade)) * 0.55
  return [Math.round(255 + (LARANJA[0] - 255) * a), Math.round(255 + (LARANJA[1] - 255) * a), Math.round(255 + (LARANJA[2] - 255) * a)]
}

// A fonte do PDF não tem seta nem menos tipográfico: variação em ASCII e colorida.
const corVariacao = (v: number | null): RGB => (v === null || v === 0 ? MUTED : v > 0 ? VERMELHO : VERDE)

export function nomeArquivoComparativo(tipo: string, tabela: TabelaComparativo): string {
  const slug = tipo.toLowerCase().includes('instal') ? 'instalacao' : 'manutencao'
  const primeiro = tabela.colunas[0]?.id ?? '', ultimo = tabela.colunas[tabela.colunas.length - 1]?.id ?? ''
  return `comparativo-bairros-${slug}-${primeiro}${ultimo !== primeiro ? `_${ultimo}` : ''}.pdf`
}

export function exportComparativoPDF(tabela: TabelaComparativo, { tipo, filtros, parciais = [] }: ComparativoPDFOpcoes) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const metrica: MetricaComparativo = tabela.metrica
  const usable = LARGURA - MARGEM * 2
  const nMeses = tabela.colunas.length
  const temTotal = metrica !== 'taxa'
  const wBairro = 64, wCidade = 24, wTotal = temTotal ? 16 : 0, wVar = 18
  const wMes = Math.min(26, (usable - wBairro - wCidade - wTotal - wVar) / Math.max(1, nMeses))
  const reportType = `${tipo} — Comparativo mensal por bairro`
  let page = 1, y = 0

  const addHeader = () => { y = drawPDFHeader(doc, { reportType, pageWidth: LARGURA, margin: MARGEM }) + 3 }
  const footer = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(`Página ${page}`, LARGURA - MARGEM, 205, { align: 'right' })
  }
  const novaPagina = () => { footer(); doc.addPage(); page++; addHeader(); cabecalhoTabela() }
  const fonte = (size: number, bold: boolean, cor: RGB) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...cor) }
  const cortar = (texto: string, largura: number): string => {
    if (doc.getTextWidth(texto) <= largura) return texto
    let corte = texto
    while (corte.length > 1 && doc.getTextWidth(`${corte}…`) > largura) corte = corte.slice(0, -1)
    return `${corte.trimEnd()}…`
  }

  // Colunas: bairro, cidade, um mês cada, total e variação.
  const xMes = (i: number) => MARGEM + wBairro + wCidade + i * wMes
  const xTotal = MARGEM + wBairro + wCidade + nMeses * wMes
  const xVar = xTotal + wTotal

  function cabecalhoTabela() {
    doc.setFillColor(...FUNDO); doc.rect(MARGEM, y, usable, 6.4, 'F')
    fonte(8, true, INK)
    doc.text('Bairro', MARGEM + 1.5, y + 4.4)
    doc.text('Cidade', MARGEM + wBairro + 1.5, y + 4.4)
    tabela.colunas.forEach((c, i) => doc.text(c.label, xMes(i) + wMes - 1.5, y + 4.4, { align: 'right' }))
    if (temTotal) doc.text('Total', xTotal + wTotal - 1.5, y + 4.4, { align: 'right' })
    doc.text(metrica === 'taxa' ? 'Var. (pp)' : 'Var.', xVar + wVar - 1.5, y + 4.4, { align: 'right' })
    y += 6.4
  }

  addHeader()
  const metricaLabel = METRICAS.find(m => m.id === metrica)?.label ?? metrica
  fonte(8, false, MUTED)
  doc.text([`Métrica: ${metricaLabel}`, ...filtros].join(' · '), MARGEM, y + 3)
  y += 8
  fonte(11, true, INK)
  const periodo = nMeses > 1 ? `${tabela.colunas[0].label} a ${tabela.colunas[nMeses - 1].label}` : tabela.colunas[0]?.label ?? ''
  doc.text(`${tabela.linhas.length} ${tabela.linhas.length === 1 ? 'bairro' : 'bairros'} com revisita em ${periodo}`, MARGEM, y + 3.5)
  y += 8

  if (!tabela.linhas.length) {
    fonte(10, false, BODY); doc.text('Nenhuma revisita encontrada nos meses e filtros selecionados.', MARGEM, y + 4)
    footer(); doc.save(nomeArquivoComparativo(tipo, tabela))
    return
  }

  cabecalhoTabela()
  tabela.linhas.forEach((l, idx) => {
    if (y + ALTURA_LINHA > ALTURA_MAX) novaPagina()
    if (idx % 2) { doc.setFillColor(250, 251, 252); doc.rect(MARGEM, y, usable, ALTURA_LINHA, 'F') }
    fonte(8, false, BODY)
    doc.text(cortar(l.label, wBairro - 3), MARGEM + 1.5, y + 3.8)
    doc.text(cortar(cidadeCurta(l.cidade), wCidade - 3), MARGEM + wBairro + 1.5, y + 3.8)
    l.valores.forEach((v, i) => {
      if (v !== null && v > 0 && tabela.maximo) { doc.setFillColor(...tom(v / tabela.maximo)); doc.rect(xMes(i), y, wMes, ALTURA_LINHA, 'F') }
      fonte(8, v !== null && v > 0, v ? INK : MUTED)
      doc.text(v === null ? '—' : v === 0 && metrica !== 'taxa' ? '-' : formatarValor(v, metrica), xMes(i) + wMes - 1.5, y + 3.8, { align: 'right' })
    })
    if (temTotal) { fonte(8, true, INK); doc.text(formatarValor(l.total, metrica), xTotal + wTotal - 1.5, y + 3.8, { align: 'right' }) }
    fonte(8, true, corVariacao(l.variacao)); doc.text(formatarVariacao(l.variacao, metrica), xVar + wVar - 1.5, y + 3.8, { align: 'right' })
    y += ALTURA_LINHA
  })

  if (y + 8 > ALTURA_MAX) novaPagina()
  doc.setDrawColor(...INK); doc.setLineWidth(0.25); doc.line(MARGEM, y, MARGEM + usable, y)
  fonte(8, true, INK)
  doc.text('Total', MARGEM + 1.5, y + 4.6)
  tabela.totais.forEach((v, i) => doc.text(formatarValor(v, metrica), xMes(i) + wMes - 1.5, y + 4.6, { align: 'right' }))
  if (temTotal) doc.text(formatarValor(tabela.totalGeral, metrica), xTotal + wTotal - 1.5, y + 4.6, { align: 'right' })
  fonte(8, true, corVariacao(tabela.variacaoGeral)); doc.text(formatarVariacao(tabela.variacaoGeral, metrica), xVar + wVar - 1.5, y + 4.6, { align: 'right' })
  y += 9

  const notas = [
    'Cada linha é o mesmo bairro (grafias com e sem acento e nomes cortados pelo ERP são unidas). Var. = último mês menos o primeiro; vermelho é piora, verde é melhora. Cor mais forte = valor maior.',
    metrica === 'taxa' ? 'Taxa = clientes reincidentes ÷ clientes atendidos no bairro no mês.' : 'OS envolvidas = OS de origem + retornos; a soma das linhas fecha com o total do mês.',
    tipo.toLowerCase().includes('instal') ? 'Na revisita de instalação, cada mês considera os clientes instalados no mês anterior, cuja janela de 30 dias fecha nele.' : '',
    parciais.length ? `Mês em curso (parcial): ${parciais.join(', ')}.` : '',
  ].filter(Boolean)
  fonte(7.5, false, MUTED)
  notas.forEach(nota => {
    const linhas: string[] = doc.splitTextToSize(nota, usable)
    linhas.forEach(linha => { if (y + 4 > ALTURA_MAX + 8) { footer(); doc.addPage(); page++; addHeader(); fonte(7.5, false, MUTED) } doc.text(linha, MARGEM, y + 3); y += 3.8 })
  })

  footer()
  doc.save(nomeArquivoComparativo(tipo, tabela))
}
