import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ClienteReincidente } from '../../lib/builders/churn'
import type { AIReincidenciaAnalysis } from '../../hooks/useAIReincidencias'
import type { OSRow } from '../../lib/types'

const textos: string[] = []

const PT_TO_MM = 0.3528
// Altura mínima que uma linha precisa ocupar para os glifos não encostarem na linha seguinte.
const alturaMinima = (size: number) => size * 1.2 * PT_TO_MM
// Largura média de caractere em Helvetica ≈ metade do corpo da fonte.
const larguraChar = (size: number) => 0.5 * size * PT_TO_MM

// Baseline + tamanho de fonte ativo em cada doc.text(): é o que revela sobreposição real.
const baselines: Array<{ text: string; y: number; x: number; size: number }> = []
let fontSizeAtual = 10

const doc = {
  setFontSize: (size: number) => { fontSizeAtual = size },
  setTextColor: vi.fn(), setFont: vi.fn(), setFillColor: vi.fn(),
  setDrawColor: vi.fn(), setLineWidth: vi.fn(), setLineHeightFactor: vi.fn(),
  roundedRect: vi.fn(), rect: vi.fn(), line: vi.fn(), addImage: vi.fn(),
  addPage: vi.fn(), save: vi.fn(),
  getTextWidth: (text: string) => text.length * larguraChar(fontSizeAtual),
  // Quebra proporcional ao corpo da fonte ativa, como o jsPDF real faz.
  splitTextToSize: (text: string, largura: number) => {
    const max = Math.max(8, Math.floor(largura / larguraChar(fontSizeAtual)))
    const linhas: string[] = []
    let atual = ''
    for (const palavra of String(text).split(' ')) {
      if (atual && (atual + ' ' + palavra).length > max) { linhas.push(atual); atual = palavra } else { atual = atual ? `${atual} ${palavra}` : palavra }
    }
    if (atual) linhas.push(atual)
    return linhas.length ? linhas : ['']
  },
  text: (value: string | string[], x: number, yPos: number) => {
    const linhas = Array.isArray(value) ? value : [value]
    linhas.forEach(linha => { textos.push(linha); baselines.push({ text: linha, y: yPos, x, size: fontSizeAtual }) })
  },
}

vi.mock('jspdf', () => ({ default: class { constructor() { return doc } } }))
vi.mock('../../lib/pdfBrand', () => ({
  // Fiel ao real: o cabeçalho deixa a fonte em bold 7.5pt e a cor trocada.
  drawPDFHeader: () => { doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(17, 24, 39); return 38 },
}))

const { exportReincidenciasPDF } = await import('./reincidenciasPDF')

const rows = [
  { numos: '9069512', dataexecucao: '2026-07-01 09:00', nomedaequipe: 'F04 - EQUIPE', servico: 'MANUTENCAO', observacoes: 'refez conector', _fornecedor: 'WES' },
  { numos: '9069513', dataexecucao: '2026-07-06 09:00', nomedaequipe: 'F04 - EQUIPE', servico: 'MANUTENCAO', observacoes: 'sinal fora do padrao', _fornecedor: 'WES' },
] as unknown as OSRow[]

const cliente: ClienteReincidente = {
  chave: '1001', cliente: 'Maria S. Oliveira', cidade: 'Taubaté', bairro: 'Jardim Ana Emília',
  visitas: 2, intervaloMedio: 5, diasDesdeUltima: 3, rows,
} as ClienteReincidente

const analysis: AIReincidenciaAnalysis = {
  ok: true, cached: false,
  resumo: '4 pares de revisita classificados. Causa dominante: Conectorização/Sinal — 3 pares (75%).',
  notas: ['Leitura do lote 1.'], paresAnalisados: 4,
  causas: [{ causa: 'Conectorização/Sinal', count: 3, pct: 75, pares: [] }],
  porPar: {}, sinteseErro: false,
  metricas: { clientes: 3, intervaloMedio: 6.5, revisitasRapidas: 2 },
  sintese: 'As revisitas se concentram na F04 e voltam rápido demais.',
  pontos: [
    { titulo: 'F04 concentra as revisitas', detalhe: 'Sete dos dezenove pares saíram da mesma frente.', metrica: '7 de 19 pares', causa: 'Conectorização/Sinal', severidade: 'alta' },
    { titulo: 'Retorno em menos de uma semana', detalhe: 'Metade volta antes do sétimo dia.', metrica: '5 dias', causa: '', severidade: 'media' },
  ],
  acoes: [{ titulo: 'Auditar o fechamento da F04', detalhe: 'Exigir foto do conector.', causa: 'Conectorização/Sinal' }],
}

const posicao = (trecho: string) => textos.findIndex(t => t.includes(trecho))

beforeEach(() => { textos.length = 0; baselines.length = 0; fontSizeAtual = 10 })

describe('exportReincidenciasPDF', () => {
  it('abre o relatório com o diagnóstico da IA, antes do detalhamento por cliente', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras'], analysis)

    expect(posicao('Diagnóstico da IA')).toBeGreaterThanOrEqual(0)
    expect(posicao('Diagnóstico da IA')).toBeLessThan(posicao('Detalhamento por cliente'))
    expect(posicao('As revisitas se concentram na F04')).toBeLessThan(posicao('Detalhamento por cliente'))
    expect(posicao('Detalhamento por cliente')).toBeLessThan(posicao('Maria S. Oliveira'))
  })

  it('põe a manchete acima da faixa de números do conjunto', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras'], analysis)
    expect(posicao('As revisitas se concentram na F04')).toBeLessThan(posicao('4 pares  ·  3 clientes'))
    expect(posicao('2 revisitas em até 7d (50%)')).toBeGreaterThanOrEqual(0)
    expect(posicao('intervalo médio 6.5d')).toBeGreaterThanOrEqual(0)
  })

  it('quebra os pontos de atenção em linhas rotuladas por severidade', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras'], analysis)
    expect(posicao('PONTOS DE ATENÇÃO')).toBeGreaterThanOrEqual(0)
    expect(posicao('ALTA')).toBeLessThan(posicao('MÉDIA'))
    expect(posicao('F04 concentra as revisitas')).toBeGreaterThanOrEqual(0)
    expect(posicao('7 de 19 pares')).toBeGreaterThanOrEqual(0)
    expect(posicao('Sete dos dezenove pares saíram da mesma frente.')).toBeGreaterThanOrEqual(0)
    expect(posicao('PONTOS DE ATENÇÃO')).toBeLessThan(posicao('AÇÕES RECOMENDADAS'))
    expect(posicao('AÇÕES RECOMENDADAS')).toBeLessThan(posicao('CAUSAS CLASSIFICADAS'))
  })

  it('usa o resumo determinístico como manchete quando a síntese falhou', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras'], { ...analysis, sintese: '', pontos: [], sinteseErro: true })
    expect(posicao('4 pares de revisita classificados')).toBeLessThan(posicao('Detalhamento por cliente'))
    expect(posicao('PONTOS DE ATENÇÃO')).toBe(-1)
  })

  it('leva as ações recomendadas para o topo, junto da síntese', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras'], analysis)
    expect(posicao('AÇÕES RECOMENDADAS')).toBeLessThan(posicao('Detalhamento por cliente'))
    expect(posicao('1. Auditar o fechamento da F04 (Conectorização/Sinal)')).toBeGreaterThanOrEqual(0)
  })

  it('mantém o escopo do recorte em uma linha só, acima do bloco da IA', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras', 'Equipe: F04'], analysis)
    const escopo = posicao('1 clientes · 2 ordens · Todas as terceiras · Equipe: F04')
    expect(escopo).toBeGreaterThanOrEqual(0)
    expect(escopo).toBeLessThan(posicao('Diagnóstico da IA'))
  })

  it('sem análise gerada, o relatório começa direto no detalhamento', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras'], null)
    expect(posicao('Diagnóstico da IA')).toBe(-1)
    expect(posicao('Detalhamento por cliente')).toBeGreaterThanOrEqual(0)
    expect(posicao('Maria S. Oliveira')).toBeGreaterThanOrEqual(0)
  })

  it('cai para as leituras parciais quando a síntese do conjunto falhou', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras'], { ...analysis, sintese: '', sinteseErro: true })
    expect(posicao('Leitura do lote 1.')).toBeGreaterThanOrEqual(0)
    expect(posicao('Leitura do lote 1.')).toBeLessThan(posicao('Detalhamento por cliente'))
  })
})

describe('layout do PDF', () => {
  // Cliente com observação longa: é o caso que estourava a página e batia no rodapé.
  // Longa o bastante para não caber numa página inteira: é o caso que vazava por cima do rodapé.
  const observacao = 'Motivo da abertura: ' + 'cliente relata queda constante de sinal no periodo da noite. '.repeat(130)
  const rowsLongas = [
    { numos: '9069512', dataexecucao: '2026-07-01 09:00', nomedaequipe: 'F04 - EQUIPE', servico: 'MANUTENCAO', observacoes: observacao, _fornecedor: 'WES' },
    { numos: '9069513', dataexecucao: '2026-07-06 09:00', nomedaequipe: 'F04 - EQUIPE', servico: 'MANUTENCAO', observacoes: observacao, _fornecedor: 'WES' },
  ] as unknown as OSRow[]
  const clientePesado = { ...cliente, rows: rowsLongas } as ClienteReincidente

  it('nunca desenha texto por cima do rodapé, mesmo com observações longas', () => {
    exportReincidenciasPDF(Array.from({ length: 6 }, () => clientePesado), ['Todas as terceiras'], analysis)
    const invasores = baselines.filter(b => b.y > 285 && !b.text.startsWith('Página'))
    expect(invasores).toEqual([])
  })

  it('dá a cada linha o espaço que o corpo da fonte exige, sem sobrepor a seguinte', () => {
    exportReincidenciasPDF([clientePesado], ['Todas as terceiras'], analysis)
    const corpo = baselines.filter(b => !b.text.startsWith('Página'))
    const colisoes = corpo.filter((linha, i) => {
      const anterior = corpo[i - 1]
      if (!anterior || linha.y <= anterior.y) return false  // página nova, ou outra coluna da mesma linha
      // O espaço entre duas baselines tem que caber o corpo da MAIOR das duas fontes.
      return linha.y - anterior.y < alturaMinima(Math.max(linha.size, anterior.size))
    })
    expect(colisoes).toEqual([])
  })

  it('a manchete, que é a maior fonte do relatório, não invade a linha seguinte', () => {
    const manchete = 'A concentração de revisitas na frente F04 responde por metade dos retornos do período analisado e cresce mês a mês.'
    exportReincidenciasPDF([cliente], ['Todas as terceiras'], { ...analysis, sintese: manchete })
    const linhas = baselines.filter(b => b.size === 11.5)
    expect(linhas.length).toBeGreaterThan(1)
    linhas.slice(1).forEach((linha, i) => {
      expect(linha.y - linhas[i].y).toBeGreaterThanOrEqual(alturaMinima(11.5))
    })
  })

  it('mantém a mesma tipografia depois de virar a página no meio do bloco', () => {
    exportReincidenciasPDF([clientePesado], ['Todas as terceiras'], analysis)
    const corpo = baselines.filter(b => !b.text.startsWith('Página'))
    // Uma virada de página é uma baseline que sobe. A linha seguinte à virada tem que
    // manter o corpo da linha anterior, não herdar a fonte do cabeçalho.
    const viradas = corpo.filter((linha, i) => i > 0 && linha.y < corpo[i - 1].y)
    expect(viradas.length).toBeGreaterThan(0)
    const heranca = viradas.filter(linha => {
      const anterior = corpo[corpo.indexOf(linha) - 1]
      return linha.size !== anterior.size && linha.size === 7.5
    })
    expect(heranca).toEqual([])
  })

  it('alinha título, detalhe e causa do ponto na mesma coluna', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras'], analysis)
    const titulo = baselines.find(b => b.text === 'F04 concentra as revisitas')
    const detalhe = baselines.find(b => b.text.startsWith('Sete dos dezenove'))
    const causa = baselines.find(b => b.text === 'Conectorização/Sinal')
    expect(titulo?.x).toBe(detalhe?.x)
    expect(titulo?.x).toBe(causa?.x)
  })

  it('mantém a severidade na margem e a métrica na mesma baseline do título', () => {
    exportReincidenciasPDF([cliente], ['Todas as terceiras'], analysis)
    const severidade = baselines.find(b => b.text === 'ALTA')
    const titulo = baselines.find(b => b.text === 'F04 concentra as revisitas')
    const metrica = baselines.find(b => b.text === '7 de 19 pares')
    expect(severidade?.x).toBe(15)
    expect(severidade?.y).toBe(titulo?.y)
    expect(metrica?.y).toBe(titulo?.y)
  })
})
