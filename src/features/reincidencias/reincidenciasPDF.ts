import jsPDF from 'jspdf'
import { drawPDFHeader } from '../../lib/pdfBrand'
import type { ClienteReincidente } from '../../lib/builders/churn'
import type { AIReincidenciaAnalysis } from '../../hooks/useAIReincidencias'
import { fmtDate, shortEquipe } from '../../lib/osFormat'
import { getOSObservation, sortedClientRows } from './reincidenciasReport'

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

  addHeader()
  doc.setFont('helvetica', 'bold'); paragraph(`${clientes.length} clientes · ${clientes.reduce((sum, c) => sum + c.rows.length, 0)} ordens`, 14, [17, 24, 39])
  doc.setFont('helvetica', 'normal'); paragraph(filters.join(' · '), 9)
  if (analysis?.narrativa) {
    ensure(22); doc.setFillColor(239, 246, 255); doc.roundedRect(margin, y, usable, 7, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175); doc.setFontSize(10); doc.text('Síntese da IA', margin + 3, y + 5); y += 11
    doc.setFont('helvetica', 'normal'); paragraph(analysis.narrativa)
    if (analysis.causas_distribuicao?.length) paragraph(`Causas: ${analysis.causas_distribuicao.map(c => `${c.causa} ${c.count} (${c.pct}%)`).join(' · ')}`, 8)
  }

  clientes.forEach(cliente => {
    ensure(18); doc.setFillColor(245, 247, 250); doc.roundedRect(margin, y, usable, 10, 2, 2, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(17, 24, 39); doc.text(`${cliente.cliente} · ${cliente.visitas} visitas`, margin + 3, y + 4)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(75, 85, 99); doc.text(`${cliente.cidade} / ${cliente.bairro || 'Bairro não informado'} · intervalo médio ${cliente.intervaloMedio}d`, margin + 3, y + 8); y += 14
    sortedClientRows(cliente.rows).forEach(row => {
      ensure(22); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(17, 24, 39)
      doc.text(`${fmtDate(row.dataexecucao || row.databaixa) || 'Sem data'} · OS ${row.numos} · ${shortEquipe(row.nomedaequipe)} · ${row._fornecedor || 'Outra'}`, margin + 2, y)
      y += 4; doc.setFont('helvetica', 'normal'); paragraph(`${row.servico || row.tiposervico || 'Serviço não informado'} — ${getOSObservation(row)}`, 8)
    })
  })
  footer()
  doc.save(`relatorio-reincidencias-${new Date().toISOString().slice(0, 10)}.pdf`)
}
