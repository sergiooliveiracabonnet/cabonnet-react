import jsPDF from 'jspdf'
import { drawPDFHeader } from '../../lib/pdfBrand'
import type { BlocoRevisita, Contribuicao, Frase, LeituraCidade, LeituraMensal, Tom } from './leituraMensal'

type RGB = [number, number, number]
interface Estilo { size: number; bold: boolean; color: RGB }

const INK: RGB = [17, 24, 39]
const BODY: RGB = [55, 65, 81]
const MUTED: RGB = [107, 114, 128]
const VERMELHO: RGB = [185, 28, 28]
const VERDE: RGB = [21, 128, 61]
const FUNDO: RGB = [245, 247, 250]
const FIO: RGB = [226, 232, 240]

const COR_TOM: Record<Tom, RGB> = { piora: VERMELHO, melhora: VERDE, neutro: MUTED }
const SALDO: Record<Tom, string> = { piora: 'Piorou', melhora: 'Melhorou', neutro: 'Estável' }

const TIPO = {
  manchete: { size: 12, bold: true, color: INK } as Estilo,
  cidade: { size: 11, bold: true, color: INK } as Estilo,
  secao: { size: 8, bold: true, color: MUTED } as Estilo,
  bloco: { size: 9, bold: true, color: INK } as Estilo,
  corpo: { size: 8.5, bold: false, color: BODY } as Estilo,
  legenda: { size: 7.5, bold: false, color: MUTED } as Estilo,
}

const PT_TO_MM = 0.3528
const alturaLinha = (size: number) => size * 1.36 * PT_TO_MM
const BASE = 0.74
const RODAPE_Y = 290
const FIM_CONTEUDO = 275

// Helvetica do PDF não tem o sinal de menos tipográfico.
const ascii = (t: string) => t.replace(/−/g, '-')
const fmt1 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const sinal = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `-${Math.abs(n)}` : '0')
const sinalPP = (n: number) => (n > 0 ? `+${fmt1(n)}` : n < 0 ? `-${fmt1(Math.abs(n))}` : '0,0')
const corDelta = (d: number | null, subirEhBom = false): RGB => (d === null || d === 0 ? MUTED : (d > 0) !== subirEhBom ? VERMELHO : VERDE)

export function exportLeituraMensalPDF(l: LeituraMensal) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = 210, margin = 15, usable = width - margin * 2
  let page = 1, y = 0
  const reportType = `Leitura mensal por cidade — ${l.atual.label} x ${l.anterior.label}`

  const addHeader = () => { y = drawPDFHeader(doc, { reportType, pageWidth: width, margin }) + 4 }
  const footer = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(`Página ${page}`, width - margin, RODAPE_Y, { align: 'right' })
  }
  const novaPagina = () => { footer(); doc.addPage(); page++; addHeader() }
  const ensure = (altura: number) => { if (y + altura > FIM_CONTEUDO) novaPagina() }
  const aplicar = (e: Estilo) => { doc.setFont('helvetica', e.bold ? 'bold' : 'normal'); doc.setFontSize(e.size); doc.setTextColor(...e.color) }
  const escrever = (texto: string, estilo: Estilo, { indent = 0, gap = 1.4 } = {}) => {
    const lh = alturaLinha(estilo.size)
    aplicar(estilo)
    const linhas: string[] = doc.splitTextToSize(ascii(texto), usable - indent)
    linhas.forEach(linha => { ensure(lh); aplicar(estilo); doc.text(linha, margin + indent, y + lh * BASE); y += lh })
    y += gap
  }
  const marcador = (f: Frase, primeira: boolean) => {
    const estilo: Estilo = primeira ? { ...TIPO.corpo, bold: true, color: f.tom === 'neutro' ? INK : COR_TOM[f.tom] } : TIPO.corpo
    const lh = alturaLinha(estilo.size)
    aplicar(estilo)
    const linhas: string[] = doc.splitTextToSize(ascii(f.texto), usable - 5)
    ensure(lh * Math.min(2, linhas.length))
    doc.setFillColor(...COR_TOM[f.tom]); doc.circle(margin + 1.3, y + lh * 0.45, 0.7, 'F')
    linhas.forEach(linha => { ensure(lh); aplicar(estilo); doc.text(linha, margin + 4, y + lh * BASE); y += lh })
    y += 0.9
  }

  addHeader()

  // ── Abertura: manchete e quadro das cidades ──────────────────────────────
  aplicar(TIPO.legenda)
  doc.text(ascii(`${l.atual.label}${l.atual.parcial ? ' (mês em curso, parcial)' : ''} comparado com ${l.anterior.label} · motivo de abertura lido em ${l.cobertura.lidas} de ${l.cobertura.total} VTs`), margin, y + 3)
  y += 7

  const pioraram = l.cidades.filter(c => c.saldo === 'piora').map(c => c.cidade)
  const melhoraram = l.cidades.filter(c => c.saldo === 'melhora').map(c => c.cidade)
  const manchete = [
    melhoraram.length ? `Melhoraram: ${melhoraram.join(', ')}.` : '',
    pioraram.length ? `Pioraram: ${pioraram.join(', ')}.` : '',
    !melhoraram.length && !pioraram.length ? 'Todas as cidades estáveis no mês.' : '',
  ].filter(Boolean).join(' ')
  escrever(manchete, TIPO.manchete, { gap: 3 })

  const cols = [
    { titulo: 'Cidade', x: margin, w: 44, alinha: 'left' as const },
    { titulo: 'Saldo', x: margin + 44, w: 22, alinha: 'left' as const },
    { titulo: 'VTs abertas', x: margin + 66, w: 30, alinha: 'right' as const },
    { titulo: 'Revisita manut.', x: margin + 96, w: 30, alinha: 'right' as const },
    { titulo: 'Revisita inst.', x: margin + 126, w: 28, alinha: 'right' as const },
    { titulo: 'VT no prazo', x: margin + 154, w: 26, alinha: 'right' as const },
  ]
  const cel = (texto: string, col: typeof cols[number], yy: number) =>
    col.alinha === 'right' ? doc.text(ascii(texto), col.x + col.w - 1, yy, { align: 'right' }) : doc.text(ascii(texto), col.x + 1, yy)
  const ALT = 9
  doc.setFillColor(...FUNDO); doc.rect(margin, y, usable, 6, 'F')
  aplicar(TIPO.secao); cols.forEach(c => cel(c.titulo, c, y + 4.1)); y += 6

  const linhaCidade = (c: LeituraCidade, total: boolean) => {
    ensure(ALT)
    if (total) { doc.setDrawColor(...INK); doc.setLineWidth(0.2); doc.line(margin, y, width - margin, y) }
    const yv = y + 4, yd = y + 7.4
    aplicar({ ...TIPO.corpo, bold: true, color: INK }); cel(c.cidade, cols[0], yv)
    aplicar({ ...TIPO.corpo, bold: true, color: COR_TOM[c.saldo] }); cel(SALDO[c.saldo], cols[1], yv)
    aplicar({ ...TIPO.corpo, bold: true, color: INK }); cel(c.vt.atual.toLocaleString('pt-BR'), cols[2], yv)
    aplicar({ ...TIPO.legenda, color: corDelta(c.vt.delta) }); cel(`${sinal(c.vt.delta)}${c.vt.pct !== null ? ` (${sinalPP(c.vt.pct)}%)` : ''}`, cols[2], yd)
    const taxa = (r: BlocoRevisita, col: typeof cols[number]) => {
      aplicar({ ...TIPO.corpo, bold: true, color: INK }); cel(r.taxaAtual === null ? '—' : `${fmt1(r.taxaAtual)}%`, col, yv)
      if (r.deltaPP !== null) { aplicar({ ...TIPO.legenda, color: corDelta(r.deltaPP) }); cel(`${sinalPP(r.deltaPP)} pp`, col, yd) }
    }
    taxa(c.manut, cols[3]); taxa(c.inst, cols[4])
    aplicar({ ...TIPO.corpo, bold: true, color: INK }); cel(c.vt.noPrazoAtual === null ? '—' : `${fmt1(c.vt.noPrazoAtual)}%`, cols[5], yv)
    if (c.vt.noPrazoAtual !== null && c.vt.noPrazoAnterior !== null) {
      const d = Math.round((c.vt.noPrazoAtual - c.vt.noPrazoAnterior) * 10) / 10
      aplicar({ ...TIPO.legenda, color: corDelta(d, true) }); cel(`${sinalPP(d)} pp`, cols[5], yd)
    }
    y += ALT
    if (!total) { doc.setDrawColor(...FIO); doc.setLineWidth(0.1); doc.line(margin, y, width - margin, y) }
  }
  l.cidades.forEach(c => linhaCidade(c, false))
  linhaCidade(l.geral, true)
  y += 2
  escrever('Saldo: cada indicador que mudou de verdade (VTs 5% ou mais, revisita 0,5 pp ou mais) conta um voto de melhora ou piora. pp = pontos percentuais.', TIPO.legenda, { gap: 5 })

  // ── Uma seção por cidade ─────────────────────────────────────────────────
  const contribuicoes = (titulo: string, itens: Contribuicao[]) => {
    const subiram = itens.filter(i => i.delta >= 2).sort((a, b) => b.delta - a.delta).slice(0, 4)
    const cairam = itens.filter(i => i.delta <= -2).sort((a, b) => a.delta - b.delta).slice(0, 4)
    if (!subiram.length && !cairam.length) return
    const partes = [
      subiram.length ? `subiu ${subiram.map(i => `${i.label} ${sinal(i.delta)}`).join(', ')}` : '',
      cairam.length ? `caiu ${cairam.map(i => `${i.label} ${sinal(i.delta)}`).join(', ')}` : '',
    ].filter(Boolean)
    escrever(`${titulo}: ${partes.join('; ')}.`, TIPO.legenda, { indent: 4, gap: 0.8 })
  }

  const secaoCidade = (c: LeituraCidade) => {
    ensure(40)
    y += 2
    doc.setDrawColor(...FIO); doc.setLineWidth(0.3); doc.line(margin, y, width - margin, y); y += 5
    aplicar(TIPO.cidade); doc.text(ascii(c.cidade), margin, y)
    const larguraNome = doc.getTextWidth(ascii(c.cidade))
    aplicar({ ...TIPO.corpo, bold: true, color: COR_TOM[c.saldo] }); doc.text(SALDO[c.saldo], margin + larguraNome + 4, y)
    y += 4

    const blocos: Array<[string, Frase[], Array<[string, Contribuicao[]]>]> = [
      ['VTs abertas', c.frases.vt, [['Por bairro', c.vt.porBairro], ['Por motivo', c.vt.porMotivo]]],
      ['Revisita de manutenção', c.frases.manut, [['Equipe de origem', c.manut.porEquipe], ['Bairro', c.manut.porBairro]]],
      ['Revisita de instalação', c.frases.inst, [['Equipe da instalação', c.inst.porEquipe], ['Bairro', c.inst.porBairro]]],
    ]
    for (const [titulo, frases, listas] of blocos) {
      if (!frases.length) continue
      ensure(14)
      escrever(titulo.toUpperCase(), TIPO.secao, { gap: 0.8 })
      frases.forEach((f, i) => marcador(f, i === 0))
      listas.forEach(([t, itens]) => contribuicoes(t, itens))
      y += 1.5
    }
    const t = c.tendencia
    if (t.length > 2) {
      escrever(`Últimos meses (VTs / revisita manut. / revisita inst.): ${t.map(p => `${p.label}${p.parcial ? '*' : ''} ${p.vts} / ${p.taxaManut === null ? '—' : `${fmt1(p.taxaManut)}%`} / ${p.taxaInst === null ? '—' : `${fmt1(p.taxaInst)}%`}`).join(' · ')}`, TIPO.legenda, { gap: 2 })
    }
  }

  l.cidades.forEach(secaoCidade)

  y += 3
  escrever('Esta leitura mostra onde e com quem a variação aconteceu (bairros, equipes, motivos). O que foi feito para causá-la, como uma ação de rede, um treinamento ou uma auditoria, não fica no ERP e precisa ser registrado à parte. O motivo de abertura e a ação da equipe são lidos do texto livre da OS por palavras-chave: servem para comparar meses, não para auditar uma OS isolada.', TIPO.legenda)

  footer()
  doc.save(`leitura-mensal-${l.atual.id}.pdf`)
}
