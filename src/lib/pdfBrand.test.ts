import { describe, expect, it } from 'vitest'
import { buildPDFHTMLHeader, formatPDFDateTime } from './pdfBrand'
import { jsPDF } from 'jspdf'
import { drawPDFHeader } from './pdfBrand'

describe('pdfBrand', () => {
  it('gera cabeçalho com logo, autor, data e tipo', () => {
    const date = new Date(2026, 6, 26, 14, 30)
    const html = buildPDFHTMLHeader('Relatório Operacional', date)
    expect(html).toContain('data:image/png;base64,')
    expect(html).toContain('Sergio Oliveira')
    expect(html).toContain('Relatório Operacional')
    expect(html).toContain(formatPDFDateTime(date))
  })

  it('desenha o cabeçalho compartilhado em um documento jsPDF', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    expect(drawPDFHeader(doc, { reportType: 'Teste', pageWidth: 210, margin: 16 })).toBe(38)
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(10_000)
  })
})
