import jsPDF from 'jspdf'
import { drawPDFHeader } from '../../lib/pdfBrand'
import type { ClienteReincidente } from '../../lib/builders/churn'
import { aiPairKey, type AIReincidenciaAnalysis } from '../../hooks/useAIReincidencias'
import { fmtDate, shortEquipe } from '../../lib/osFormat'
import { getOSObservation, sortedClientRows } from './reincidenciasReport'

type RGB = [number, number, number]
interface Estilo { size: number; bold: boolean; color: RGB }

const INK: RGB = [17, 24, 39]
const BODY: RGB = [55, 65, 81]
const MUTED: RGB = [107, 114, 128]
const AZUL: RGB = [30, 64, 175]
const FIO: RGB = [226, 232, 240]

// Severidade é status: as únicas cores do relatório que não são neutras.
const SEVERIDADE_COR: Record<string, RGB> = { alta: [185, 28, 28], media: [161, 98, 7], baixa: MUTED }
const SEVERIDADE_LABEL: Record<string, string> = { alta: 'ALTA', media: 'MÉDIA', baixa: 'BAIXA' }

// Escala tipográfica única do relatório — nenhum tamanho avulso fora daqui.
const TIPO = {
  manchete: { size: 11.5, bold: true,  color: INK }   as Estilo,
  titulo:   { size: 10,   bold: true,  color: INK }   as Estilo,
  secao:    { size: 8,    bold: true,  color: MUTED } as Estilo,
  destaque: { size: 8.5,  bold: true,  color: INK }   as Estilo,
  corpo:    { size: 8.5,  bold: false, color: BODY }  as Estilo,
  legenda:  { size: 7.5,  bold: false, color: MUTED } as Estilo,
  ia:       { size: 8,    bold: false, color: AZUL }  as Estilo,
}

const PT_TO_MM = 0.3528
// Uma entrelinha só para o documento inteiro: a altura da linha sai do tamanho da fonte,
// nunca de um número fixo — era daí que vinha a sobreposição.
const ENTRELINHA = 1.36
const alturaLinha = (size: number) => size * ENTRELINHA * PT_TO_MM
// Baseline dentro da caixa da linha. `y` é sempre o TOPO do próximo bloco.
const BASE = 0.74

const COLUNA_SEVERIDADE = 17
const RODAPE_Y = 290
const FIM_CONTEUDO = 275

export function exportReincidenciasPDF(clientes: ClienteReincidente[], filters: string[], analysis?: AIReincidenciaAnalysis | null) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = 210, margin = 15, usable = width - margin * 2
  let page = 1, y = 0

  const addHeader = () => { y = drawPDFHeader(doc, { reportType: 'Relatório de Reincidências', pageWidth: width, margin }) + 4 }
  const footer = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(`Página ${page}`, width - margin, RODAPE_Y, { align: 'right' })
  }
  const ensure = (altura: number) => {
    if (y + altura <= FIM_CONTEUDO) return
    footer(); doc.addPage(); page++; addHeader()
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
  /**
   * Escreve linha a linha: cada linha decide sozinha se cabe na página. Um bloco longo
   * agora atravessa páginas em vez de vazar por cima do rodapé, e o estilo é reaplicado
   * depois da quebra porque o cabeçalho da nova página redefine fonte, corpo e cor.
   */
  const escrever = (text: string, estilo: Estilo, { indent = 0, gap = 1.6, reservaDireita = 0 } = {}) => {
    const lh = alturaLinha(estilo.size)
    const linhas = quebrar(text, estilo, usable - indent - reservaDireita)
    linhas.forEach(linha => {
      ensure(lh)
      aplicar(estilo)
      doc.text(linha, margin + indent, y + lh * BASE)
      y += lh
    })
    y += gap
  }
  const secao = (text: string) => { y += 1.5; escrever(text.toUpperCase(), TIPO.secao, { gap: 1 }) }
  const fio = (cor: RGB = FIO) => {
    if (y + 3 > FIM_CONTEUDO) return
    doc.setDrawColor(...cor); doc.setLineWidth(0.2); doc.line(margin, y, width - margin, y); y += 3
  }

  doc.setLineHeightFactor(ENTRELINHA)
  addHeader()

  // Escopo em uma linha compacta: o diagnóstico da IA lidera o relatório.
  escrever(`${clientes.length} clientes · ${clientes.reduce((sum, c) => sum + c.rows.length, 0)} ordens · ${filters.join(' · ')}`, TIPO.legenda, { gap: 3 })

  if (analysis) {
    ensure(34)
    doc.setFillColor(239, 246, 255); doc.roundedRect(margin, y, usable, 8.5, 2, 2, 'F')
    aplicar({ size: 10, bold: true, color: AZUL })
    doc.text('Diagnóstico da IA', margin + 3, y + 5.8)
    y += 12

    escrever(analysis.sintese || analysis.resumo, TIPO.manchete, { gap: 2.4 })

    const rapidasPct = analysis.paresAnalisados ? Math.round(analysis.metricas.revisitasRapidas / analysis.paresAnalisados * 100) : 0
    escrever([
      `${analysis.paresAnalisados} pares`,
      `${analysis.metricas.clientes} clientes`,
      `${analysis.metricas.revisitasRapidas} revisitas em até 7d (${rapidasPct}%)`,
      `intervalo médio ${analysis.metricas.intervaloMedio}d`,
    ].join('  ·  '), TIPO.legenda, { gap: 2.4 })

    if (analysis.pontos.length) {
      secao('Pontos de atenção')
      analysis.pontos.forEach(ponto => {
        const lhT = alturaLinha(TIPO.destaque.size)
        const lhD = alturaLinha(TIPO.corpo.size)
        const lhL = alturaLinha(TIPO.legenda.size)

        aplicar({ ...TIPO.legenda, bold: true, color: INK })
        const reserva = ponto.metrica ? doc.getTextWidth(ponto.metrica) + 5 : 0
        const tituloLinhas = quebrar(ponto.titulo, TIPO.destaque, usable - COLUNA_SEVERIDADE - reserva)
        const detalheLinhas = ponto.detalhe ? quebrar(ponto.detalhe, TIPO.corpo, usable - COLUNA_SEVERIDADE) : []

        // A linha inteira é reservada de uma vez: um ponto nunca fica partido entre páginas.
        ensure(tituloLinhas.length * lhT + detalheLinhas.length * lhD + (ponto.causa ? lhL : 0) + 5)
        const topo = y

        aplicar({ ...TIPO.legenda, bold: true, color: SEVERIDADE_COR[ponto.severidade] ?? SEVERIDADE_COR.media })
        doc.text(SEVERIDADE_LABEL[ponto.severidade] ?? SEVERIDADE_LABEL.media, margin, topo + lhT * BASE)

        if (ponto.metrica) {
          aplicar({ ...TIPO.legenda, bold: true, color: INK })
          doc.text(ponto.metrica, width - margin, topo + lhT * BASE, { align: 'right' })
        }

        aplicar(TIPO.destaque)
        tituloLinhas.forEach((linha, i) => doc.text(linha, margin + COLUNA_SEVERIDADE, topo + lhT * BASE + i * lhT))
        y = topo + tituloLinhas.length * lhT

        aplicar(TIPO.corpo)
        detalheLinhas.forEach((linha, i) => doc.text(linha, margin + COLUNA_SEVERIDADE, y + lhD * BASE + i * lhD))
        y += detalheLinhas.length * lhD

        if (ponto.causa) {
          aplicar(TIPO.legenda)
          doc.text(ponto.causa, margin + COLUNA_SEVERIDADE, y + lhL * BASE)
          y += lhL
        }
        y += 2
        fio([237, 240, 244])
      })
    }

    if (analysis.acoes.length) {
      secao('Ações recomendadas')
      analysis.acoes.forEach((acao, index) => {
        escrever(`${index + 1}. ${acao.titulo}${acao.causa ? ` (${acao.causa})` : ''}`, TIPO.destaque, { gap: 0 })
        if (acao.detalhe) escrever(acao.detalhe, TIPO.corpo, { indent: 5, gap: 1.6 })
      })
    }

    secao('Causas classificadas')
    analysis.causas.forEach(causa => escrever(`• ${causa.causa} — ${causa.count} ${causa.count === 1 ? 'par' : 'pares'} (${causa.pct}%)`, TIPO.corpo, { gap: 0.6 }))

    if (!analysis.sintese) analysis.notas.forEach(nota => escrever(nota, TIPO.legenda))

    y += 2
    fio()
  }

  ensure(14)
  escrever('Detalhamento por cliente', TIPO.titulo, { gap: 2.4 })

  clientes.forEach(cliente => {
    ensure(20)
    doc.setFillColor(245, 247, 250); doc.roundedRect(margin, y, usable, 11, 2, 2, 'F')
    aplicar({ size: 9.5, bold: true, color: INK })
    doc.text(`${cliente.cliente} · ${cliente.visitas} visitas`, margin + 3, y + 4.6)
    aplicar(TIPO.legenda)
    doc.text(`${cliente.cidade} / ${cliente.bairro || 'Bairro não informado'} · intervalo médio ${cliente.intervaloMedio}d`, margin + 3, y + 8.8)
    y += 14

    const rows = sortedClientRows(cliente.rows)
    rows.forEach((row, index) => {
      escrever(`${fmtDate(row.dataexecucao || row.databaixa) || 'Sem data'} · OS ${row.numos} · ${shortEquipe(row.nomedaequipe)} · ${row._fornecedor || 'Outra'}`, TIPO.destaque, { indent: 2, gap: 0 })
      escrever(`${row.servico || row.tiposervico || 'Serviço não informado'} — ${getOSObservation(row)}`, TIPO.corpo, { indent: 2, gap: 1.6 })

      const next = rows[index + 1]
      const diagnostico = next && analysis?.porPar[aiPairKey(row.numos, next.numos)]
      if (!diagnostico) return
      const detalhe = [
        diagnostico.feitoPrimeira && `Feito: ${diagnostico.feitoPrimeira}`,
        diagnostico.oQueFaltou && `Faltou: ${diagnostico.oQueFaltou}`,
      ].filter(Boolean).join(' · ')
      escrever(`IA → ${diagnostico.causa} (revisita ${diagnostico.diasEntre}d depois, OS ${diagnostico.numosRev})${detalhe ? `. ${detalhe}` : ''}`, TIPO.ia, { indent: 4, gap: 2.4 })
    })
  })

  footer()
  doc.save(`relatorio-reincidencias-${new Date().toISOString().slice(0, 10)}.pdf`)
}
