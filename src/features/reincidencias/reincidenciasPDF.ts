import jsPDF from 'jspdf'
import { drawPDFHeader } from '../../lib/pdfBrand'
import type { ClienteReincidente } from '../../lib/builders/churn'
import { aiPairKey, type AIReincidenciaAnalysis } from '../../hooks/useAIReincidencias'
import { fmtDate, shortEquipe } from '../../lib/osFormat'
import { getOSObservation, sortedClientRows } from './reincidenciasReport'

// Severidade é status: as únicas cores do relatório que não são neutras.
const SEVERIDADE_COR: Record<string, [number, number, number]> = {
  alta:  [185, 28, 28],
  media: [161, 98, 7],
  baixa: [107, 114, 128],
}
const SEVERIDADE_LABEL: Record<string, string> = { alta: 'ALTA', media: 'MÉDIA', baixa: 'BAIXA' }

export function exportReincidenciasPDF(clientes: ClienteReincidente[], filters: string[], analysis?: AIReincidenciaAnalysis | null) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = 210, margin = 15, usable = width - margin * 2
  let page = 1, y = 0
  const addHeader = () => { y = drawPDFHeader(doc, { reportType: 'Relatório de Reincidências', pageWidth: width, margin }) + 2 }
  const footer = () => { doc.setFontSize(8); doc.setTextColor(100); doc.text(`Página ${page}`, width - margin, 290, { align: 'right' }) }
  const ensure = (height: number) => { if (y + height < 282) return; footer(); doc.addPage(); page++; addHeader() }
  const paragraph = (text: string, size = 9, color: [number, number, number] = [55, 65, 81]) => {
    doc.setFontSize(size); doc.setTextColor(...color); const lines = doc.splitTextToSize(text, usable); ensure(lines.length * 4.3); doc.text(lines, margin, y); y += lines.length * 4.3 + 2
  }
  const sectionTitle = (text: string) => {
    ensure(8); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(107, 114, 128)
    doc.text(text.toUpperCase(), margin, y + 3); y += 6; doc.setFont('helvetica', 'normal')
  }

  addHeader()
  // Escopo em uma linha compacta: o diagnóstico da IA lidera o relatório.
  paragraph(`${clientes.length} clientes · ${clientes.reduce((sum, c) => sum + c.rows.length, 0)} ordens · ${filters.join(' · ')}`, 9, [75, 85, 99])

  if (analysis) {
    ensure(30); doc.setFillColor(239, 246, 255); doc.roundedRect(margin, y, usable, 8, 2, 2, 'F')
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175); doc.setFontSize(10.5); doc.text('Diagnóstico da IA', margin + 3, y + 5.6); y += 12

    doc.setFont('helvetica', 'bold'); paragraph(analysis.sintese || analysis.resumo, 11, [17, 24, 39]); doc.setFont('helvetica', 'normal')

    const rapidasPct = analysis.paresAnalisados ? Math.round(analysis.metricas.revisitasRapidas / analysis.paresAnalisados * 100) : 0
    paragraph([
      `${analysis.paresAnalisados} pares`,
      `${analysis.metricas.clientes} clientes`,
      `${analysis.metricas.revisitasRapidas} revisitas em até 7d (${rapidasPct}%)`,
      `intervalo médio ${analysis.metricas.intervaloMedio}d`,
    ].join('  ·  '), 8, [107, 114, 128])

    if (analysis.pontos.length) {
      y += 2; sectionTitle('Pontos de atenção')
      analysis.pontos.forEach(ponto => {
        const detalhe = doc.splitTextToSize(ponto.detalhe, usable - 34)
        ensure(detalhe.length * 4 + 7)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...SEVERIDADE_COR[ponto.severidade] ?? SEVERIDADE_COR.media)
        doc.text(SEVERIDADE_LABEL[ponto.severidade] ?? SEVERIDADE_LABEL.media, margin, y + 3)
        doc.setFontSize(8.5); doc.setTextColor(17, 24, 39)
        doc.text(`${ponto.titulo}${ponto.metrica ? ` — ${ponto.metrica}` : ''}`, margin + 16, y + 3)
        y += 4
        if (detalhe.length) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(75, 85, 99)
          doc.text(detalhe, margin + 16, y + 3); y += detalhe.length * 4
        }
        if (ponto.causa) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(107, 114, 128)
          doc.text(ponto.causa, margin + 16, y + 3); y += 4
        }
        y += 2.5
        if (y + 4 < 282) { doc.setDrawColor(237, 240, 244); doc.line(margin, y, width - margin, y); y += 2.5 }
      })
      doc.setFont('helvetica', 'normal')
    }

    if (analysis.acoes.length) {
      y += 2; sectionTitle('Ações recomendadas')
      analysis.acoes.forEach((acao, index) => paragraph(`${index + 1}. ${acao.titulo}${acao.causa ? ` (${acao.causa})` : ''}${acao.detalhe ? ` — ${acao.detalhe}` : ''}`, 8))
    }

    y += 2; sectionTitle('Causas classificadas')
    analysis.causas.forEach(causa => paragraph(`• ${causa.causa} — ${causa.count} ${causa.count === 1 ? 'par' : 'pares'} (${causa.pct}%)`, 8))

    if (!analysis.sintese) analysis.notas.forEach(nota => paragraph(nota, 8, [107, 114, 128]))

    // Só desenha o fio separador se ele couber: quebrar página por causa dele deixaria um traço solto no topo.
    if (y + 8 < 282) { doc.setDrawColor(226, 232, 240); doc.line(margin, y + 1, width - margin, y + 1); y += 6 }
  }

  ensure(14); doc.setFont('helvetica', 'bold'); paragraph('Detalhamento por cliente', 11, [17, 24, 39]); doc.setFont('helvetica', 'normal')

  clientes.forEach(cliente => {
    ensure(18); doc.setFillColor(245, 247, 250); doc.roundedRect(margin, y, usable, 10, 2, 2, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(17, 24, 39); doc.text(`${cliente.cliente} · ${cliente.visitas} visitas`, margin + 3, y + 4)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(75, 85, 99); doc.text(`${cliente.cidade} / ${cliente.bairro || 'Bairro não informado'} · intervalo médio ${cliente.intervaloMedio}d`, margin + 3, y + 8); y += 14
    const rows = sortedClientRows(cliente.rows)
    rows.forEach((row, index) => {
      ensure(22); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(17, 24, 39)
      doc.text(`${fmtDate(row.dataexecucao || row.databaixa) || 'Sem data'} · OS ${row.numos} · ${shortEquipe(row.nomedaequipe)} · ${row._fornecedor || 'Outra'}`, margin + 2, y)
      y += 4; doc.setFont('helvetica', 'normal'); paragraph(`${row.servico || row.tiposervico || 'Serviço não informado'} — ${getOSObservation(row)}`, 8)
      const next = rows[index + 1]
      const diagnostico = next && analysis?.porPar[aiPairKey(row.numos, next.numos)]
      if (!diagnostico) return
      const detalhe = [
        diagnostico.feitoPrimeira && `Feito: ${diagnostico.feitoPrimeira}`,
        diagnostico.oQueFaltou && `Faltou: ${diagnostico.oQueFaltou}`,
      ].filter(Boolean).join(' · ')
      paragraph(`IA → ${diagnostico.causa} (revisita ${diagnostico.diasEntre}d depois, OS ${diagnostico.numosRev})${detalhe ? `. ${detalhe}` : ''}`, 8, [30, 64, 175])
    })
  })
  footer()
  doc.save(`relatorio-reincidencias-${new Date().toISOString().slice(0, 10)}.pdf`)
}
