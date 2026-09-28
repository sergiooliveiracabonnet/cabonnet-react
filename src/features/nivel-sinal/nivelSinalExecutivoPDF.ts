import jsPDF from 'jspdf'
import { drawPDFHeader } from '../../lib/pdfBrand'
import type { SignalHotspot } from './nivelSinal'

type RGB = [number, number, number]
interface Estilo { size: number; bold: boolean; color: RGB }

const INK: RGB = [17, 24, 39]
const BODY: RGB = [55, 65, 81]
const MUTED: RGB = [107, 114, 128]
const AZUL: RGB = [30, 64, 175]
const VERMELHO: RGB = [153, 27, 27]
const LARANJA: RGB = [154, 52, 18]
const AMARELO: RGB = [133, 100, 4]

const NIVEL_COR: Record<SignalHotspot['nivel'], RGB> = { alto: VERMELHO, medio: LARANJA, baixo: AMARELO }
const NIVEL_LABEL: Record<SignalHotspot['nivel'], string> = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' }

const TIPO = {
  titulo:   { size: 12,   bold: true,  color: INK }   as Estilo,
  secao:    { size: 8,    bold: true,  color: MUTED } as Estilo,
  destaque: { size: 9,    bold: true,  color: INK }   as Estilo,
  corpo:    { size: 8.5,  bold: false, color: BODY }  as Estilo,
  legenda:  { size: 7.5,  bold: false, color: MUTED } as Estilo,
}

const PT_TO_MM = 0.3528
const ENTRELINHA = 1.36
const alturaLinha = (size: number) => size * ENTRELINHA * PT_TO_MM
const BASE = 0.74
const RODAPE_Y = 290
const FIM_CONTEUDO = 275

export interface ExecutivoGrupo { key: string; total: number; criticos: number; atencao: number }

export interface NivelSinalExecutivoInput {
  filterLabel: string
  totalOnus: number
  sinalBom: number
  criticos: number
  atencao: number
  offline: number
  hotspots: SignalHotspot[]
  treatedCount: number
  porCidade: ExecutivoGrupo[]
  porOlt: ExecutivoGrupo[]
}

interface Coluna { label: string; w: number; align?: 'right' }

/** Relatório executivo do Nível de Sinal — pensado para apresentar à diretoria:
 *  KPIs, ranking por cidade/OLT e a fila completa de PONs pendentes de tratativa. */
export function exportNivelSinalExecutivoPDF(input: NivelSinalExecutivoInput, filename = `nivel-sinal-executivo-${new Date().toISOString().slice(0, 10)}.pdf`): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = 210, margin = 15, usable = width - margin * 2
  let page = 1, y = 0
  // Tabela ativa no momento de um salto de página: o cabeçalho é redesenhado
  // sozinho, senão a 2ª página de uma lista longa perde as colunas.
  let tabelaAtiva: { cols: Coluna[] } | null = null

  const addHeader = () => { y = drawPDFHeader(doc, { reportType: 'Nível de Sinal — Relatório Executivo', pageWidth: width, margin }) + 4 }
  const footer = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(`Página ${page}`, width - margin, RODAPE_Y, { align: 'right' })
  }
  const ensure = (altura: number) => {
    if (y + altura <= FIM_CONTEUDO) return
    footer(); doc.addPage(); page++; addHeader()
    if (tabelaAtiva) tableHeader(tabelaAtiva.cols)
  }
  const aplicar = (estilo: Estilo) => {
    doc.setFont('helvetica', estilo.bold ? 'bold' : 'normal')
    doc.setFontSize(estilo.size)
    doc.setTextColor(...estilo.color)
  }
  const quebrar = (text: string, estilo: Estilo, largura: number): string[] => {
    aplicar(estilo)
    return doc.splitTextToSize(text, largura)
  }
  const escrever = (text: string, estilo: Estilo, { gap = 1.6 } = {}) => {
    const lh = alturaLinha(estilo.size)
    const linhas = quebrar(text, estilo, usable)
    linhas.forEach(linha => {
      ensure(lh)
      aplicar(estilo)
      doc.text(linha, margin, y + lh * BASE)
      y += lh
    })
    y += gap
  }
  const secao = (text: string) => { y += 1.5; escrever(text.toUpperCase(), TIPO.secao, { gap: 1 }) }

  function tableHeader(cols: Coluna[]) {
    const totalW = cols.reduce((sum, col) => sum + col.w, 0)
    ensure(7)
    doc.setFillColor(245, 247, 250); doc.rect(margin, y, totalW, 6.5, 'F')
    aplicar({ ...TIPO.legenda, bold: true, color: INK })
    let x = margin
    cols.forEach(col => {
      doc.text(col.label, col.align === 'right' ? x + col.w - 2 : x + 2, y + 4.4, col.align === 'right' ? { align: 'right' } : undefined)
      x += col.w
    })
    y += 6.5
  }

  function table(titulo: string, cols: Coluna[], rows: { cells: string[]; color?: RGB }[], vazio: string) {
    secao(titulo)
    tabelaAtiva = { cols }
    tableHeader(cols)
    if (!rows.length) {
      escrever(vazio, TIPO.legenda, { gap: 2 })
      tabelaAtiva = null
      return
    }
    rows.forEach((row, index) => {
      ensure(6)
      const totalW = cols.reduce((sum, col) => sum + col.w, 0)
      if (index % 2 === 0) { doc.setFillColor(252, 252, 253); doc.rect(margin, y, totalW, 6, 'F') }
      aplicar({ ...TIPO.corpo, color: row.color ?? TIPO.corpo.color })
      let x = margin
      row.cells.forEach((cell, ci) => {
        const col = cols[ci]
        doc.text(cell, col.align === 'right' ? x + col.w - 2 : x + 2, y + 4.2, col.align === 'right' ? { align: 'right' } : undefined)
        x += col.w
      })
      y += 6
    })
    tabelaAtiva = null
    y += 3
  }

  doc.setLineHeightFactor(ENTRELINHA)
  addHeader()

  escrever(input.filterLabel, TIPO.legenda, { gap: 3 })
  escrever('Panorama do sinal óptico', TIPO.titulo, { gap: 2.4 })

  const foraPadrao = input.criticos + input.atencao
  const pctForaPadrao = input.totalOnus ? (foraPadrao / input.totalOnus * 100).toFixed(1) : '0.0'
  ensure(12)
  doc.setFillColor(239, 246, 255); doc.roundedRect(margin, y, usable, 8.5, 2, 2, 'F')
  aplicar({ size: 9.5, bold: true, color: AZUL })
  doc.text('Resumo executivo', margin + 3, y + 5.8)
  y += 12
  escrever([
    `${input.totalOnus.toLocaleString('pt-BR')} ONUs monitoradas`,
    `${input.sinalBom.toLocaleString('pt-BR')} com sinal bom`,
    `${input.criticos.toLocaleString('pt-BR')} críticas`,
    `${input.atencao.toLocaleString('pt-BR')} em atenção`,
    `${pctForaPadrao}% fora do padrão`,
    `${input.offline.toLocaleString('pt-BR')} offline c/ alerta`,
  ].join('  ·  '), TIPO.corpo, { gap: 1.6 })
  escrever([
    `${input.hotspots.length} PON${input.hotspots.length === 1 ? '' : 's'} pendente${input.hotspots.length === 1 ? '' : 's'} de tratativa`,
    `${input.treatedCount} já tratada${input.treatedCount === 1 ? '' : 's'}`,
  ].join('  ·  '), TIPO.destaque, { gap: 2.4 })

  table('Distribuição por cidade', [
    { label: 'Cidade', w: 60 }, { label: 'Total', w: 30, align: 'right' },
    { label: 'Crítico', w: 30, align: 'right' }, { label: 'Atenção', w: 30, align: 'right' }, { label: '% fora do padrão', w: 30, align: 'right' },
  ], input.porCidade.map(grupo => ({
    cells: [grupo.key, String(grupo.total), String(grupo.criticos), String(grupo.atencao), `${(grupo.total ? (grupo.criticos + grupo.atencao) / grupo.total * 100 : 0).toFixed(1)}%`],
  })), 'Sem registros no filtro atual.')

  table('Ranking de OLTs', [
    { label: 'OLT', w: 90 }, { label: 'Total', w: 30, align: 'right' },
    { label: 'Crítico', w: 30, align: 'right' }, { label: 'Atenção', w: 30, align: 'right' },
  ], input.porOlt.map(grupo => ({
    cells: [grupo.key, String(grupo.total), String(grupo.criticos), String(grupo.atencao)],
  })), 'Sem registros no filtro atual.')

  escrever('PONs pendentes de tratativa — toda PON com cliente crítico ou em atenção, da maior para a menor prioridade.', TIPO.legenda, { gap: 1 })
  table('PONs pendentes de tratativa', [
    { label: 'PON / OLT', w: 40 }, { label: 'Cidade / bairro', w: 38 },
    { label: 'Críticos', w: 20, align: 'right' }, { label: 'Atenção', w: 20, align: 'right' },
    { label: 'Total', w: 18, align: 'right' }, { label: 'Concentr.', w: 24, align: 'right' }, { label: 'Risco', w: 20, align: 'right' },
  ], input.hotspots.map(hotspot => ({
    cells: [
      `${hotspot.pon} · ${hotspot.olt}`, `${hotspot.cidade} / ${hotspot.bairro}`,
      String(hotspot.criticos), String(hotspot.atencao),
      String(hotspot.total), `${(hotspot.concentracao * 100).toFixed(0)}%`, NIVEL_LABEL[hotspot.nivel],
    ],
    color: NIVEL_COR[hotspot.nivel],
  })), 'Nenhuma PON pendente com cliente crítico ou em atenção.')

  footer()
  doc.save(filename)
}
